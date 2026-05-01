require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const path         = require('path');

const { initDb }          = require('./db/schema');
const setupSockets        = require('./game/sockets');
const { requireAuth }     = require('./routes/middleware');
const { seedAiKingdoms }  = require('./game/ai');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { 
  cors: { 
    origin: process.env.NODE_ENV === 'production' ? (process.env.CORS_ORIGIN || false) : '*', 
    credentials: true 
  } 
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ── Rate limiting ──────────────────────────────────────────────────────────────
function makeRateLimiter(maxRequests, windowMs) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs);
  return function(req, res, next) {
    const key = req.ip || 'unknown';
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > maxRequests) {
      return res.status(429).json({ error: 'Too many requests — slow down' });
    }
    next();
  };
}

const authLimiter   = makeRateLimiter(10, 60 * 1000);      // 10 auth attempts/min
const turnLimiter   = makeRateLimiter(300, 60 * 1000);     // 300 turn/action requests/min (5/sec)
const generalLimiter= makeRateLimiter(500, 60 * 1000);     // 500 general requests/min

app.set('trust proxy', 1); // trust first proxy so req.ip reflects the real client IP
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled — inline scripts in single-file HTML
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(generalLimiter);
app.use(express.static(path.join(__dirname, 'public')));

// ── Turn regen constants ───────────────────────────────────────────────────────
const REGEN_AMOUNT = 7;   // +7 turns every 25 minutes = ~400/day
const REGEN_MAX    = 400;
const REGEN_MS     = 25 * 60 * 1000;


async function processAiTurns(db) {
  const engine = require('./game/engine');
  const aiPlayers = await db.all('SELECT id FROM players WHERE is_ai = 1');
  if (aiPlayers.length === 0) return;

  // Run all AI kingdoms in parallel
  await Promise.all(aiPlayers.map(p =>
    runAiKingdom(db, engine, p.id).catch(e =>
      console.error(`[ai] error for player ${p.id}:`, e.message)
    )
  ));
  console.log(`[ai] Processed ${aiPlayers.length} AI kingdoms`);
}

async function runAiKingdom(db, engine, playerId) {
  let ai = await db.get('SELECT * FROM kingdoms WHERE player_id = ?', [playerId]);
  if (!ai || ai.turns_stored < 1) return;

  const VALID_COLS = new Set([
    'gold','mana','land','population','morale','food','turn','turns_stored',
    'fighters','rangers','clerics','mages','thieves','ninjas','researchers','engineers','scribes',
    'war_machines','weapons_stockpile','armor_stockpile',
    'res_economy','res_weapons','res_armor','res_military','res_attack_magic',
    'res_defense_magic','res_entertainment','res_construction','res_war_machines','res_spellbook',
    'bld_farms','bld_barracks','bld_schools','bld_armories','bld_vaults','bld_smithies',
    'bld_markets','bld_mage_towers','bld_training','bld_castles',
    'bld_shrines','bld_libraries',
    'build_allocation','build_progress','research_allocation','research_progress','mage_tower_allocation',
    'build_queue','xp','level','troop_levels','maps','scrolls','active_effects',
    'library_progress','tower_progress','library_allocation',
  ]);

  async function applyK(kingdom, updates) {
    const safe = Object.fromEntries(Object.entries(updates).filter(([c,v]) =>
      VALID_COLS.has(c) && v !== undefined && v !== null
    ));
    if (Object.keys(safe).length > 0) {
      const cols = Object.keys(safe).map(c => `${c} = ?`).join(', ');
      await db.run(`UPDATE kingdoms SET ${cols} WHERE id = ?`, [...Object.values(safe), kingdom.id]);
    }
    return safe;
  }

  const turnsToSpend = ai.turns_stored;
  for (let i = 0; i < turnsToSpend; i++) {
    if ((ai.turns_stored || 0) < 1) break;

    // Inject region ownership status for AI bonus
    const regionStatus = await db.get('SELECT owner_alliance_id, bonus_type FROM regions WHERE name = ?', [ai.region]);
    const myAlliance = await db.get('SELECT alliance_id FROM alliance_members WHERE kingdom_id = ?', [ai.id]);
    ai._region_owned_by_my_alliance = (regionStatus && myAlliance && regionStatus.owner_alliance_id === myAlliance.alliance_id);
    ai._region_bonus_type = regionStatus?.bonus_type;

    // ── Process base turn — use in-memory ai state, no re-read needed ──
    const { updates } = engine.processTurn(ai);
    updates.turns_stored = ai.turns_stored - 1;

    // ── Process heroes ──
    const heroes = await db.all('SELECT * FROM heroes WHERE kingdom_id = ? AND status = "idle"', [ai.id]);
    for (const hero of heroes) {
      const resHero = engine.awardHeroXp(hero, 10);
      await db.run('UPDATE heroes SET level = ?, xp = ? WHERE id = ?', [resHero.level, resHero.xp, hero.id]);
      engine.applyHeroTurnBonuses(hero, ai, updates);
    }

    // AI Hero Recruitment
    if (heroes.length === 0 && (ai.gold || 0) > 150000 && (ai.bld_castles || 0) > 0) {
      const classes = ['paladin', 'archmage', 'warlord', 'shadowblade', 'sovereign'];
      const myClass = classes[Math.floor(Math.random() * classes.length)];
      const { hero, cost, error } = engine.recruitHero(ai, `${ai.name}'s Hero`, myClass);
      if (hero && !error) {
        await db.run(
          `INSERT INTO heroes (kingdom_id, name, class, level, xp, abilities, status, hp, max_hp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ai.id, hero.name, hero.class, hero.level, hero.xp, hero.abilities, hero.status, hero.hp, hero.max_hp]
        );
        updates.gold = (updates.gold || ai.gold) - cost.gold;
        updates.mana = (updates.mana || ai.mana) - cost.mana;
      }
    }

    // ── Engineer allocation — race-aware ──
    const eng = ai.engineers || 0;
    if (eng > 0) {
      const needsFarms = (ai.bld_farms || 0) < Math.floor((ai.land || 0) / 4);
      const farmPct    = needsFarms ? 0.30 : 0.15;
      const barPct     = 0.15;
      const schoolPct  = 0.10;
      const restPct    = Math.max(0, 1 - farmPct - barPct - schoolPct);
      updates.build_allocation = JSON.stringify({
        farms:      Math.floor(eng * farmPct),
        barracks:   Math.floor(eng * barPct),
        schools:    Math.floor(eng * schoolPct),
        mage_towers: (ai.race === 'high_elf' || ai.race === 'dark_elf') ? Math.floor(eng * restPct) : 0,
        markets:    (ai.race === 'dwarf'    || ai.race === 'human')     ? Math.floor(eng * restPct) : 0,
        training:   (ai.race === 'dire_wolf'|| ai.race === 'orc')       ? Math.floor(eng * restPct) : 0,
      });
    }

    // ── Research allocation ──
    const researchers = ai.researchers || 0;
    if (researchers > 0) {
      const cap  = (ai.bld_schools || 0) * 100;
      const eff  = Math.min(researchers, cap);
      const base = Math.floor(eff / 10);
      const extra = eff - base * 10;
      const focus = {
        high_elf:  { spellbook:base+extra, attack_magic:base, defense_magic:base, economy:base, weapons:base, armor:base, military:base, entertainment:base, construction:base, war_machines:base },
        dwarf:     { economy:base+extra, construction:base, war_machines:base, weapons:base, armor:base, military:base, defense_magic:base, entertainment:base, spellbook:0, attack_magic:base },
        dire_wolf: { military:base+extra, weapons:base, armor:base, economy:base, construction:base, war_machines:base, entertainment:base, defense_magic:base, attack_magic:base, spellbook:0 },
        dark_elf:  { attack_magic:base+extra, spellbook:base, defense_magic:base, economy:base, weapons:base, armor:base, military:base, entertainment:base, construction:base, war_machines:base },
        human:     { economy:base, weapons:base, armor:base, military:base, attack_magic:base, defense_magic:base, entertainment:base+extra, construction:base, war_machines:base, spellbook:base },
        orc:       { military:base+extra, weapons:base, armor:base, economy:base, war_machines:base, construction:base, entertainment:base, defense_magic:base, attack_magic:base, spellbook:0 },
      };
      updates.research_allocation = JSON.stringify(focus[ai.race] || focus.human);
    }

    // ── Mage tower allocation ──
    const towers = ai.bld_mage_towers || 0;
    const mages  = ai.mages || 0;
    if (towers > 0 && mages > 0) {
      updates.mage_tower_allocation = JSON.stringify({ mages: Math.min(mages, towers * 20) });
    }

    // Apply updates and merge back into ai state (avoids re-read)
    const applied = await applyK(ai, updates);
    Object.assign(ai, applied);

    await engine.resolveExpeditions(db, ai, engine);

    // Hire and act using current in-memory state
    await aiHire(db, engine, ai);
    await aiAction(db, engine, ai);
  }
}

async function aiHire(db, engine, ai) {
  const gold = ai.gold || 0;
  const spendable = Math.floor(gold * 0.3); // spend up to 30% of gold on hiring
  if (spendable < 250) return;

  const UNIT_COST = 250;
  const barracksCap = (ai.bld_barracks || 0) * 500;
  const currentTroops = (ai.fighters||0) + (ai.rangers||0) + (ai.clerics||0) + (ai.thieves||0) + (ai.ninjas||0);
  const barracksRoom = Math.max(0, barracksCap - currentTroops);
  if (barracksRoom <= 0) return;

  const maxAffordable = Math.min(Math.floor(spendable / UNIT_COST), barracksRoom,
    Math.floor((ai.population || 0) * 0.1));
  if (maxAffordable <= 0) return;

  // Race-based unit preference
  const unitPref = {
    high_elf:  ['clerics','mages','rangers','fighters','thieves','ninjas'],
    dwarf:     ['fighters','engineers','rangers','clerics','thieves','ninjas'],
    dire_wolf: ['fighters','rangers','clerics','ninjas','thieves','mages'],
    dark_elf:  ['ninjas','thieves','rangers','fighters','clerics','mages'],
    human:     ['fighters','rangers','clerics','thieves','ninjas','mages'],
    orc:       ['fighters','rangers','clerics','ninjas','thieves','mages'],
  }[ai.race] || ['fighters','rangers'];

  let goldLeft = spendable;
  for (const unit of unitPref) {
    if (goldLeft < UNIT_COST) break;
    // Check school/barracks caps
    if (unit === 'researchers') continue; // AI doesn't hire researchers this way
    const BARRACKS_UNITS = ['fighters','rangers','clerics','thieves','ninjas'];
    if (BARRACKS_UNITS.includes(unit) && barracksCap === 0) continue;
    const canHire = Math.min(Math.floor(goldLeft / UNIT_COST), Math.floor(maxAffordable / unitPref.length));
    if (canHire <= 0) continue;
    const result = engine.hireUnits(ai, unit, canHire);
    if (!result.error && result.updates) {
      await db.run(`UPDATE kingdoms SET gold = ?, population = ?, ${unit} = ? WHERE id = ?`,
        [result.updates.gold, result.updates.population, result.updates[unit], ai.id]);
      ai.gold = result.updates.gold;
      ai.population = result.updates.population;
      ai[unit] = result.updates[unit];
      goldLeft = ai.gold * 0.3;
    }
    break; // hire one type per tick
  }
}

async function aiAction(db, engine, ai) {
  // Only act occasionally — roughly 1 in 4 ticks
  if (Math.random() > 0.25) return;

  // Per-target cooldown — don't act on the same kingdom more than once every 20 minutes
  const cooldownSecs = 20 * 60;
  const recentActions = await db.all(
    `SELECT defender_id FROM war_log WHERE attacker_id = ? AND created_at > ?`,
    [ai.id, Math.floor(Date.now()/1000) - cooldownSecs]
  );
  const recentTargetIds = new Set(recentActions.map(r => r.defender_id));

  // Get potential targets — exclude recently attacked, exclude protected kingdoms
  const targets = await db.all(`
    SELECT k.* FROM kingdoms k
    JOIN players p ON k.player_id = p.id
    WHERE k.id != ? AND k.land > 100 AND k.turn >= 200
    ORDER BY RANDOM() LIMIT 10
  `, [ai.id]);

  // Filter out recently attacked targets
  const validTargets = targets.filter(t => !recentTargetIds.has(t.id));
  if (validTargets.length === 0) return;

  // Pick weakest valid target (easier win)
  const target = validTargets.sort((a, b) => (a.fighters || 0) - (b.fighters || 0))[0];

  // Give AI a map if needed
  if ((ai.maps || 0) < 1) {
    await db.run('UPDATE kingdoms SET maps = 1 WHERE id = ?', [ai.id]);
    ai.maps = 1;
  }

  const fighters = ai.fighters || 0;
  const mages    = ai.mages    || 0;
  const ninjas   = ai.ninjas   || 0;
  const thieves  = ai.thieves  || 0;

  const roll = Math.random();

  // Military attack — only if AI has meaningful power advantage (>40% win estimate)
  if (fighters >= 50 && roll < 0.5) {
    const sendFighters = Math.floor(fighters * (0.4 + Math.random() * 0.3));
    const sendMages    = Math.floor(mages    * (0.3 + Math.random() * 0.2));

    // Power ratio check — don't attack into certain defeat
    const aiPower     = sendFighters + sendMages * 2.5;
    const defPower    = (target.fighters || 0) + (target.mages || 0) * 2.5;
    const winChance   = defPower > 0 ? aiPower / (aiPower + defPower) : 0.9;
    if (winChance < 0.35) return; // not worth it

    const result = engine.resolveMilitaryAttack(ai, target, sendFighters, sendMages);
    if (!result.error) {
      const VALID_ATK = new Set(['gold','mana','land','fighters','mages','weapons_stockpile','xp','level','troop_levels']);
      const aSafe = Object.fromEntries(Object.entries(result.attackerUpdates).filter(([c,v]) => VALID_ATK.has(c) && v !== undefined && !isNaN(v)));
      const dSafe = Object.fromEntries(Object.entries(result.defenderUpdates).filter(([c,v]) => VALID_ATK.has(c) && v !== undefined && !isNaN(v)));
      if (Object.keys(aSafe).length) {
        const ac = Object.keys(aSafe).map(c => `${c} = ?`).join(', ');
        await db.run(`UPDATE kingdoms SET ${ac} WHERE id = ?`, [...Object.values(aSafe), ai.id]);
      }
      if (Object.keys(dSafe).length) {
        const dc = Object.keys(dSafe).map(c => `${c} = ?`).join(', ');
        await db.run(`UPDATE kingdoms SET ${dc} WHERE id = ?`, [...Object.values(dSafe), target.id]);
      }
      // News for defender
      if (result.defEvent) {
        await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?,?,?,?)',
          [target.id, 'attack', result.defEvent, target.turn]);
      }
      // War log — write for BOTH attacker and defender
      const outcome = result.win ? 'victory' : 'repelled';
      const detail  = JSON.stringify({ landTaken: result.report?.landTransferred || 0, attackerLost: result.report?.attackerLost || 0, defenderLost: result.report?.defenderLost || 0 });
      await db.run(`INSERT INTO war_log (action_type, attacker_id, attacker_name, defender_id, defender_name, outcome, detail, obscured) VALUES (?,?,?,?,?,?,?,?)`,
        ['attack', ai.id, ai.name, target.id, target.name, outcome, detail, 0]);
    }

  // Covert loot — needs thieves
  } else if (thieves >= 20 && roll < 0.7) {
    const lootTypes = ['gold','research','war_machines'];
    const lootType  = lootTypes[Math.floor(Math.random() * lootTypes.length)];
    const result    = engine.covertLoot(ai, target, lootType, Math.floor(thieves * 0.5));
    if (!result.error && result.success && result.targetUpdates) {
      const VALID_LOOT = new Set(['gold','res_economy','res_weapons','war_machines']);
      const tSafe = Object.fromEntries(Object.entries(result.targetUpdates).filter(([c,v]) => VALID_LOOT.has(c) && v !== undefined && !isNaN(v)));
      if (Object.keys(tSafe).length) {
        const tc = Object.keys(tSafe).map(c => `${c} = ?`).join(', ');
        await db.run(`UPDATE kingdoms SET ${tc} WHERE id = ?`, [...Object.values(tSafe), target.id]);
      }
      if (result.targetEvent) {
        await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?,?,?,?)',
          [target.id, 'covert', result.targetEvent, target.turn]);
      }
      await db.run(`INSERT INTO war_log (action_type, attacker_id, attacker_name, defender_id, defender_name, outcome, detail, obscured) VALUES (?,?,?,?,?,?,?,?)`,
        ['loot', ai.id, ai.name, target.id, target.name, 'success', JSON.stringify({ stolen: result.stolen, type: lootType }), 1]);
    }

  // Assassination — needs ninjas
  } else if (ninjas >= 20 && roll < 0.9) {
    const unitTypes = ['fighters','researchers','engineers'];
    const unitType  = unitTypes[Math.floor(Math.random() * unitTypes.length)];
    const result    = engine.covertAssassinate(ai, target, Math.floor(ninjas * 0.4), unitType);
    if (!result.error && result.success && result.targetUpdates) {
      const col    = unitType;
      const newVal = result.targetUpdates[col];
      if (newVal !== undefined) {
        await db.run(`UPDATE kingdoms SET ${col} = ? WHERE id = ?`, [Math.max(0, newVal), target.id]);
      }
      if (result.targetEvent) {
        await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?,?,?,?)',
          [target.id, 'covert', result.targetEvent, target.turn]);
      }
      await db.run(`INSERT INTO war_log (action_type, attacker_id, attacker_name, defender_id, defender_name, outcome, detail, obscured) VALUES (?,?,?,?,?,?,?,?)`,
        ['assassinate', ai.id, ai.name, target.id, target.name, 'success', JSON.stringify({ killed: result.killed, unit: unitType }), 1]);
    }
  }
}

const SEASON_ICONS = { spring:'🌸', summer:'☀️', fall:'🍂', winter:'❄️' };

async function fireDailyEvent(db, k, season) {
  const now = Math.floor(Date.now()/1000);
  if ((now - (k.last_event_at||0)) < 86400) return null;
  const allEvents = await db.all(`SELECT * FROM events WHERE is_active=1 AND (season=? OR season='all') ORDER BY RANDOM() LIMIT 10`, [season]);
  if (!allEvents.length) return null;
  const eligible = allEvents.filter(e => !e.race_only || e.race_only === k.race);
  if (!eligible.length) return null;
  const ev = eligible[Math.floor(Math.random()*eligible.length)];
  const updates = { last_event_at: now };
  let message = `${SEASON_ICONS[season]||''} ${ev.name}: ${ev.description}`;
  const val = ev.effect_value, dur = ev.effect_duration;
  switch (ev.effect_type) {
    case 'morale':
      updates.morale = Math.max(0, Math.min(200, (k.morale||100) + val));
      message += val > 0 ? ` (+${val} morale)` : ` (${val} morale)`; break;
    case 'gold': {
      const d = Math.floor((k.gold||0) * Math.abs(val)) * (val>0?1:-1);
      updates.gold = Math.max(0, (k.gold||0)+d);
      message += d>0?` (+${d.toLocaleString()} gold)`:` (${d.toLocaleString()} gold)`; break; }
    case 'food': {
      const fd = Math.abs(val)<1 ? Math.floor((k.food||0)*Math.abs(val))*(val>0?1:-1) : Math.floor(val);
      updates.food = Math.max(0, (k.food||0)+fd);
      message += fd>0?` (+${fd.toLocaleString()} food)`:` (${fd.toLocaleString()} food)`; break; }
    case 'population': {
      const pd = Math.abs(val)<1 ? Math.floor((k.population||0)*Math.abs(val))*(val>0?1:-1) : Math.floor(val);
      updates.population = Math.max(1000, (k.population||0)+pd);
      message += pd>0?` (+${pd.toLocaleString()} pop)`:` (${pd.toLocaleString()} pop)`; break; }
    case 'farm_yield': case 'military': case 'mana': case 'market': {
      let active = {}; try { active=JSON.parse(k.active_event||'{}'); } catch {}
      active[ev.effect_type] = { mult:1+val, turns_remaining:dur };
      updates.active_event = JSON.stringify(active);
      message += val>0?` (+${Math.round(val*100)}% for ${dur} turns)`:` (${Math.round(val*100)}% for ${dur} turns)`; break; }
  }
  await db.run(`INSERT INTO event_log (kingdom_id,kingdom_name,event_key,event_name,season,fired_at) VALUES (?,?,?,?,?,?)`,
    [k.id, k.name, ev.key, ev.name, season, now]);
  return { updates, message };
}

async function runRegen(db) {
  // Update season first
  const sRow = await db.get("SELECT value FROM server_state WHERE key='current_season'");
  const tRow = await db.get("SELECT value FROM server_state WHERE key='season_started_at'");
  let season = sRow?.value || 'spring';
  const startedAt = parseInt(tRow?.value) || Math.floor(Date.now()/1000);
  const daysSince = (Math.floor(Date.now()/1000) - startedAt) / 86400;
  const SEASON_DUR = { spring:3, summer:5, fall:2, winter:3 };
  if (daysSince >= (SEASON_DUR[season]||3)) {
    const ORDER = ['spring','summer','fall','winter'];
    season = ORDER[(ORDER.indexOf(season)+1)%ORDER.length];
    await db.run("UPDATE server_state SET value=? WHERE key='current_season'", [season]);
    await db.run("UPDATE server_state SET value=CAST(unixepoch() AS TEXT) WHERE key='season_started_at'");
    console.log('[season] Changed to', season);
  }

  // Fire daily events for all kingdoms
  const kingdoms = await db.all('SELECT id, name, race, gold, food, morale, population, turn, last_event_at, active_event FROM kingdoms WHERE turn > 0');
  for (const k of kingdoms) {
    const result = await fireDailyEvent(db, k, season);
    if (result) {
      for (const [col, val] of Object.entries(result.updates)) {
        if (['last_event_at','active_event','gold','food','morale','population'].includes(col)) {
          await db.run(`UPDATE kingdoms SET ${col}=? WHERE id=?`, [val, k.id]);
        }
      }
      await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?,?,?,?)',
        [k.id, 'system', result.message, k.turn]);
    }
  }

  // Resolve regions - calculate dominance and capture progress
  try {
    const engine = require('./game/engine');
    await engine.resolveRegions(db, global._narmir_io);
  } catch(e) {
    console.error('[regions] resolution error:', e.message);
  }

  await db.run(`
    UPDATE kingdoms
    SET turns_stored = MIN(?, turns_stored + ?)
    WHERE turns_stored < ?
  `, [REGEN_MAX, REGEN_AMOUNT, REGEN_MAX]);
  await db.run(
    "UPDATE server_state SET value = CAST(unixepoch() AS TEXT) WHERE key = 'last_regen_at'"
  );
  console.log('[turns] Regen complete — +' + REGEN_AMOUNT + ' turns · season: ' + season);
  try { await processAiTurns(db); } catch(e) { console.error('[ai] turn error:', e.message); }
}

async function updateMarketPrices(db) {
  try {
    const prices = await db.all('SELECT * FROM market_prices');
    for (const p of prices) {
      const drift = (p.base_price - p.current_price) / p.base_price * 0.1;
      const change = 1 + (Math.random() * 0.04 - 0.02) + drift;
      let newPrice = p.current_price * change;
      newPrice = Math.max(p.base_price * 0.6, Math.min(p.base_price * 1.4, newPrice));
      await db.run('UPDATE market_prices SET current_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newPrice, p.id]);
    }
    console.log('[market] Prices fluctuated');
  } catch (e) {
    console.error('[market] Fluctuation failed:', e.message);
  }
}

async function start() {
  const db = await initDb();
  console.log('[db] SQLite initialised');

  // ── Crash-safe regen on boot ─────────────────────────────────────────────────
  // Calculate how many 15-min windows passed since last regen and apply them now
  const regenRow = await db.get("SELECT value FROM server_state WHERE key = 'last_regen_at'");
  if (regenRow) {
    const lastRegen = Number(regenRow.value);
    const now       = Math.floor(Date.now() / 1000);
    const elapsed   = now - lastRegen;
    const windows   = Math.floor(elapsed / (REGEN_MS / 1000));
    if (windows > 0) {
      const catchUp = Math.min(windows * REGEN_AMOUNT, REGEN_MAX);
      await db.run(`
        UPDATE kingdoms SET turns_stored = MIN(?, turns_stored + ?)
      `, [REGEN_MAX, catchUp]);
      await db.run(
        "UPDATE server_state SET value = CAST(unixepoch() AS TEXT) WHERE key = 'last_regen_at'"
      );
      console.log('[turns] Boot catch-up: applied ' + windows + ' missed window(s), +'  + catchUp + ' turns');
    }
  }

  // Auto-seed AI kingdoms on boot if they don't exist
  try {
    const seeded = await seedAiKingdoms(db);
    if (seeded > 0) console.log(`[ai] Seeded ${seeded} new AI kingdoms`);
    else console.log('[ai] AI kingdoms already exist');
  } catch(e) { console.error('[ai] Seed error:', e.message); }

  // Schedule ongoing regen
  setInterval(() => runRegen(db), REGEN_MS);
  console.log('[turns] Regen timer started — +' + REGEN_AMOUNT + ' every 25 min (max ' + REGEN_MAX + ')');

  // Market pulse
  setInterval(() => updateMarketPrices(db), 3600000); 
  updateMarketPrices(db);

  // ── Routes ────────────────────────────────────────────────────────────────────
  app.use('/api/auth',     authLimiter,  require('./routes/auth')(db));
  app.use('/api/kingdom',  turnLimiter,  require('./routes/kingdom')(db));
  app.use('/api/hero',     turnLimiter,  require('./routes/hero')(db));
  app.use('/api/admin',                  require('./routes/admin')(db, io));
  app.use('/api/alliance',               require('./routes/alliance')(db));
  app.use('/api',                        require('./routes/world')(db, io));

  app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()) }));

  // ── One-time admin promotion ───────────────────────────────────────────────
  // POST /api/setup-admin  body: { secret, username }
  // Set ADMIN_SECRET in Render environment variables before using.
  // Once you have an admin account this route still works but is harmless
  // since it requires the secret to do anything.
  app.post('/api/setup-admin', async (req, res) => {
    const { secret, username } = req.body;
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return res.status(500).json({ error: 'ADMIN_SECRET not set on server' });
    if (!secret || secret !== adminSecret) return res.status(403).json({ error: 'Invalid secret' });
    if (!username) return res.status(400).json({ error: 'username required' });
    const player = await db.get('SELECT id, username FROM players WHERE username = ?', [username]);
    if (!player) return res.status(404).json({ error: 'Player not found' });
    await db.run('UPDATE players SET is_admin = 1 WHERE id = ?', [player.id]);
    res.json({ ok: true, message: username + ' is now an admin. Log out and back in to get the admin token.' });
  });

  // Admin panel HTML served at /admin
  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  setupSockets(io, db);
  const engine = require('./game/engine');
  engine.io = io;
  global._narmir_io = io;
  console.log('[socket.io] Real-time handlers registered');

  server.listen(PORT, HOST, () => {
    console.log('Narmir running on http://' + HOST + ':' + PORT);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
