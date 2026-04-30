const express = require('express');
const { requireAdmin } = require('./middleware');
const router = express.Router();

module.exports = function(db, io) {

  // All admin routes require admin JWT
  router.use(requireAdmin);

  // GET /api/admin/kingdoms — all kingdoms with player info
  router.get('/kingdoms', async (_req, res) => {
    const rows = await db.all(`
      SELECT k.id, k.name, k.race, k.land, k.gold, k.turn, k.turns_stored,
             k.fighters, k.mages, k.created_at,
             p.username, p.is_banned, p.ban_reason, p.is_admin, p.id AS player_id
      FROM kingdoms k JOIN players p ON k.player_id = p.id
      ORDER BY k.land DESC
    `);
    res.json(rows);
  });

  // GET /api/admin/stats — server overview
  router.get('/stats', async (_req, res) => {
    const playerCount   = await db.get('SELECT COUNT(*) as c FROM players');
    const kingdomCount  = await db.get('SELECT COUNT(*) as c FROM kingdoms');
    const bannedCount   = await db.get('SELECT COUNT(*) as c FROM players WHERE is_banned = 1');
    const combatCount   = await db.get('SELECT COUNT(*) as c FROM combat_log');
    const chatCount     = await db.get('SELECT COUNT(*) as c FROM chat_messages');
    const lastRegen     = await db.get("SELECT value FROM server_state WHERE key = 'last_regen_at'");
    res.json({
      players:    playerCount.c,
      kingdoms:   kingdomCount.c,
      banned:     bannedCount.c,
      combats:    combatCount.c,
      messages:   chatCount.c,
      lastRegen:  lastRegen ? Number(lastRegen.value) : null,
    });
  });

  // POST /api/admin/ban — ban a player
  router.post('/ban', async (req, res) => {
    const { playerId, reason } = req.body;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    await db.run(
      'UPDATE players SET is_banned = 1, ban_reason = ? WHERE id = ?',
      [reason || 'Banned by admin', playerId]
    );
    res.json({ ok: true });
  });

  // POST /api/admin/unban — unban a player
  router.post('/unban', async (req, res) => {
    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    await db.run(
      'UPDATE players SET is_banned = 0, ban_reason = NULL WHERE id = ?', [playerId]
    );
    res.json({ ok: true });
  });

  // POST /api/admin/reset-turns — reset a kingdom's turns to 400
  router.post('/reset-turns', async (req, res) => {
    const { kingdomId } = req.body;
    if (!kingdomId) return res.status(400).json({ error: 'kingdomId required' });
    await db.run(
      'UPDATE kingdoms SET turns_stored = 400 WHERE id = ?', [kingdomId]
    );
    res.json({ ok: true });
  });

  // POST /api/admin/reset-turns-all — give all kingdoms full turns
  router.post('/reset-turns-all', async (_req, res) => {
    await db.run('UPDATE kingdoms SET turns_stored = 400');
    res.json({ ok: true });
  });

  // POST /api/admin/reset-all-kingdoms — wipe all kingdoms back to starting stats
  router.post('/reset-all-kingdoms', async (_req, res) => {
    const kingdoms = await db.all('SELECT id, race FROM kingdoms');
    for (const k of kingdoms) {
      const buildings = {
        bld_farms: 10, bld_schools: 1, bld_barracks: 1, bld_armories: 1, bld_housing: 100,
        bld_markets: 0, bld_smithies: 0, bld_cathedrals: 0, bld_shrines: 0, bld_outposts: 0, bld_training: 0
      };
      let fighters = 0, rangers = 50, food = 5000;

      if (k.race === 'human')     buildings.bld_markets = 1;
      if (k.race === 'dwarf')     buildings.bld_smithies = 1;
      if (k.race === 'high_elf')  buildings.bld_cathedrals = 1;
      if (k.race === 'dark_elf')  buildings.bld_shrines = 1;
      if (k.race === 'orc')       buildings.bld_training = 1;
      if (k.race === 'dire_wolf') {
        buildings.bld_barracks = 2; // Extra barracks for wolf
        fighters = 100;
        rangers = 100;
      }

      await db.run(`UPDATE kingdoms SET
        gold = 10000, mana = 0, land = 504, population = 50000, food = ?, morale = 100,
        turn = 0, turns_stored = 400,
        fighters = ?, rangers = ?, clerics = 0, mages = 0, thieves = 0, ninjas = 0,
        researchers = 100, engineers = 100, scribes = 0,
        war_machines = 0, weapons_stockpile = 0, armor_stockpile = 0,
        bld_farms = ?, bld_barracks = ?, bld_outposts = ?, bld_guard_towers = 0,
        bld_schools = ?, bld_armories = ?, bld_vaults = 0, bld_smithies = ?,
        bld_markets = ?, bld_cathedrals = ?, bld_training = ?, bld_colosseums = 0,
        bld_castles = 0, bld_shrines = ?, bld_libraries = 0, bld_taverns = 0, bld_housing = ?,
        bld_walls = 0,
        res_economy = 100, res_weapons = 100, res_armor = 100, res_military = 100,
        res_attack_magic = 100, res_defense_magic = 100, res_entertainment = 100,
        res_construction = 100, res_war_machines = 100, res_spellbook = 0,
        xp = 0, level = 1, troop_levels = '{}',
        research_allocation = '{}', build_allocation = '{}', build_queue = '{}',
        mage_tower_allocation = '{}', shrine_allocation = '{}', library_allocation = '{}',
        library_progress = '{}', scrolls = '{}', active_effects = '{}',
        world_fragments = '["Volcanic Rock", "Ancient Elven Wood", "Dragon Scale", "Abyssal Crystal", "Celestial Feather", "Dwarven Star-Metal", "Cursed Bloodstone", "Tears of the World Tree", "Void Essence", "Titan Bone"]',
        hybrid_blueprints = '{}', maps = 0, blueprints_stored = 1,
        scaffolding_stored = 0, hammers_stored = 0,
        discovered_kingdoms = '{}', location_maps_wip = '[]',
        farm_upgrades = '{}', market_upgrades = '{}', tavern_upgrades = '{}',
        tower_upgrades = '{}', school_upgrades = '{}', shrine_upgrades = '{}', library_upgrades = '{}',
        wall_upgrades = '{}', tower_def_upgrades = '{}', outpost_upgrades = '{}',
        food_shortage_turns = 0, food_surplus_turns = 0, mercenaries = '[]'
        WHERE id = ?`,
        [
          food, fighters, rangers,
          buildings.bld_farms, buildings.bld_barracks, buildings.bld_outposts,
          buildings.bld_schools, buildings.bld_armories, buildings.bld_smithies,
          buildings.bld_markets, buildings.bld_cathedrals, buildings.bld_training, buildings.bld_shrines, buildings.bld_housing,
          k.id
        ]
      );
    }
    
    await db.run('DELETE FROM expeditions');
    await db.run('DELETE FROM news');
    await db.run('DELETE FROM war_log');
    await db.run('DELETE FROM trade_offers');
    res.json({ ok: true });
  });

  // POST /api/admin/set-gold — set a kingdom's gold
  router.post('/set-gold', async (req, res) => {
    const { kingdomId, amount } = req.body;
    if (!kingdomId || amount === undefined) return res.status(400).json({ error: 'kingdomId and amount required' });
    await db.run('UPDATE kingdoms SET gold = ? WHERE id = ?', [Number(amount), kingdomId]);
    res.json({ ok: true });
  });

  // GET /api/admin/chat-mods
  router.get('/chat-mods', async (_req, res) => {
    const mods = await db.all('SELECT username FROM players WHERE is_chat_mod = 1 AND is_ai = 0 ORDER BY username');
    res.json(mods);
  });

  // GET /api/admin/chat-bans
  router.get('/chat-bans', async (_req, res) => {
    const banned = await db.all('SELECT username, chat_ban_reason FROM players WHERE chat_banned = 1 AND is_ai = 0 ORDER BY username');
    res.json(banned);
  });

  // POST /api/admin/chat-mod — promote/demote
  router.post('/chat-mod', async (req, res) => {
    const { username, action } = req.body; // action: 'promote' | 'demote'
    if (!username || !action) return res.status(400).json({ error: 'username and action required' });
    const val = action === 'promote' ? 1 : 0;
    const p = await db.get('SELECT id FROM players WHERE username = ?', [username]);
    if (!p) return res.status(404).json({ error: `Player "${username}" not found` });
    await db.run('UPDATE players SET is_chat_mod = ? WHERE id = ?', [val, p.id]);
    res.json({ ok: true });
  });

  // POST /api/admin/chat-unban
  router.post('/chat-unban', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    await db.run('UPDATE players SET chat_banned = 0, chat_ban_reason = NULL WHERE username = ?', [username]);
    res.json({ ok: true });
  });

  // GET /api/admin/kingdom-detail/:id — fetch single kingdom with all fields
  router.get('/kingdom-detail/:id', async (req, res) => {
    try {
      const k = await db.get(`
        SELECT k.*, p.username, p.is_admin, p.is_banned
        FROM kingdoms k JOIN players p ON k.player_id = p.id
        WHERE k.id = ?
      `, [req.params.id]);
      if (!k) return res.status(404).json({ error: 'Kingdom not found' });
      res.json(k);
    } catch(e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/admin/promote — make a player admin
  router.post('/promote', async (req, res) => {
    const { playerId, username } = req.body;
    if (!playerId && !username) return res.status(400).json({ error: 'playerId or username required' });
    let player;
    if (username) {
      player = await db.get('SELECT id FROM players WHERE username = ?', [username]);
      if (!player) return res.status(404).json({ error: `Player "${username}" not found` });
    }
    const id = playerId || player.id;
    await db.run('UPDATE players SET is_admin = 1 WHERE id = ?', [id]);
    res.json({ ok: true });
  });

  // POST /api/admin/announce — broadcast a global message via Socket.io
  router.post('/set-kingdom', async (req, res) => {
    const { kingdomId, fields } = req.body;
    if (!kingdomId || !fields || typeof fields !== 'object') return res.status(400).json({ error: 'kingdomId and fields required' });

    // Whitelist every settable kingdom column
    const ALLOWED = new Set([
      'gold','mana','land','population','morale','food','turn','turns_stored',
      'fighters','rangers','clerics','mages','thieves','ninjas','researchers','engineers','scribes',
      'war_machines','weapons_stockpile','armor_stockpile','maps','blueprints_stored',
      'scaffolding_stored','hammers_stored',
      'bld_farms','bld_barracks','bld_outposts','bld_guard_towers','bld_schools',
      'bld_armories','bld_vaults','bld_smithies','bld_markets','bld_mage_towers',
      'bld_training','bld_taverns','bld_castles','bld_libraries','bld_shrines','bld_housing',
      'bld_walls',
      'res_economy','res_weapons','res_armor','res_military','res_attack_magic',
      'res_defense_magic','res_entertainment','res_construction','res_war_machines','res_spellbook',
      'xp','level'
    ]);

    const safe = Object.fromEntries(
      Object.entries(fields)
        .filter(([k, v]) => ALLOWED.has(k) && v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => [k, Number(v)])
        .filter(([_k, v]) => !isNaN(v))
    );

    if (Object.keys(safe).length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const cols = Object.keys(safe).map(c => `${c} = ?`).join(', ');
    await db.run(`UPDATE kingdoms SET ${cols} WHERE id = ?`, [...Object.values(safe), kingdomId]);
    res.json({ ok: true, updated: Object.keys(safe) });
  });

  // POST /api/admin/announce — broadcast a global message via Socket.io
  router.post('/announce', async (req, res) => {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });
    io.to('global').emit('chat:message', {
      room: 'global',
      from: '[ADMIN]',
      race: 'admin',
      message: message.trim(),
      ts: Date.now(),
    });
    res.json({ ok: true });
  });

  // GET /api/admin/ai-synopsis — snapshot of all AI kingdom states
  router.get('/ai-synopsis', async (_req, res) => {
    const aiPlayers = await db.all('SELECT id, username FROM players WHERE is_ai = 1');
    if (aiPlayers.length === 0) return res.json([]);

    const rows = [];
    for (const p of aiPlayers) {
      const k = await db.get(`
        SELECT k.*, p.username
        FROM kingdoms k JOIN players p ON k.player_id = p.id
        WHERE k.player_id = ?`, [p.id]);
      if (!k) continue;

      // Count war log actions by this AI as attacker
      const attacks   = await db.get('SELECT COUNT(*) as c FROM war_log WHERE attacker_id = ? AND action_type = ?', [k.id, 'attack']);
      const coverts   = await db.get('SELECT COUNT(*) as c FROM war_log WHERE attacker_id = ? AND action_type IN (?,?,?,?,?)', [k.id, 'spy','loot','assassinate','sabotage','covert']);
      const wins      = await db.get('SELECT COUNT(*) as c FROM war_log WHERE attacker_id = ? AND outcome = ?', [k.id, 'victory']);
      const losses    = await db.get('SELECT COUNT(*) as c FROM war_log WHERE attacker_id = ? AND action_type = ? AND outcome = ?', [k.id, 'attack', 'repelled']);
      const timesHit  = await db.get('SELECT COUNT(*) as c FROM war_log WHERE defender_id = ?', [k.id]);

      // Parse JSON fields safely
      let buildAlloc = {};
      let resAlloc = {};
      try { buildAlloc = JSON.parse(k.build_allocation || '{}'); } catch {}
      try { resAlloc   = JSON.parse(k.research_allocation || '{}'); } catch {}

      const topBuild = Object.entries(buildAlloc)
        .filter(([,v]) => v > 0)
        .sort((a,b) => b[1]-a[1])
        .slice(0,3)
        .map(([k,v]) => `${k}:${v}`)
        .join(', ') || 'none';

      const topResearch = Object.entries(resAlloc)
        .filter(([,v]) => v > 0)
        .sort((a,b) => b[1]-a[1])
        .slice(0,3)
        .map(([k,v]) => `${k}:${v}`)
        .join(', ') || 'none';

      rows.push({
        id: k.id, name: k.name, race: k.race, level: k.level || 1,
        land: k.land, gold: k.gold, population: k.population,
        turns_stored: k.turns_stored, morale: k.morale, food: k.food,
        fighters: k.fighters, rangers: k.rangers, mages: k.mages,
        thieves: k.thieves, ninjas: k.ninjas,
        bld_farms: k.bld_farms, bld_barracks: k.bld_barracks,
        bld_housing: k.bld_housing, bld_schools: k.bld_schools,
        res_military: k.res_military, res_economy: k.res_economy,
        res_spellbook: k.res_spellbook,
        top_build: topBuild, top_research: topResearch,
        attacks: attacks?.c || 0, covert_ops: coverts?.c || 0,
        wins: wins?.c || 0, losses: losses?.c || 0,
        times_hit: timesHit?.c || 0,
      });
    }
    res.json(rows);
  });

  // DELETE /api/admin/kingdom/:id — delete a kingdom (soft — just wipes stats)
  router.delete('/kingdom/:id', async (req, res) => {
    await db.run('DELETE FROM kingdoms WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  });

  router.get('/config', async (_req, res) => {
    const fs = require('fs');
    const path = require('path');
    const config = require('../game/config');
    let overrides = {};
    try {
      const overridesPath = path.join(__dirname, '../game/config_overrides.json');
      if (fs.existsSync(overridesPath)) {
        overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
      }
    } catch {}
    res.json({ config, overrides });
  });

  router.post('/config', async (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const config = require('../game/config');
    const { overrides } = req.body;
    if (!overrides) return res.status(400).json({ error: 'overrides required' });
    
    const overridesPath = path.join(__dirname, '../game/config_overrides.json');
    let existing = {};
    try {
      if (fs.existsSync(overridesPath)) {
        existing = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
      }
    } catch {}

    // Merge existing overrides and new overrides
    for (const key of Object.keys(overrides)) {
      if (typeof overrides[key] === 'object' && config[key] && !Array.isArray(config[key])) {
        existing[key] = { ...(existing[key] || {}), ...overrides[key] };
        // Apply immediately to memory
        Object.assign(config[key], overrides[key]);
      } else {
        existing[key] = overrides[key];
        config[key] = overrides[key];
      }
    }
    
    fs.writeFileSync(overridesPath, JSON.stringify(existing, null, 2));
    res.json({ ok: true, existing });
  });

  // ── Flush all location data ───────────────────────────────────────────────────
  router.post('/flush-locations', async (_req, res) => {
    await db.run("UPDATE kingdoms SET discovered_kingdoms='{}', location_maps_wip='[]', world_fragments='[]', hybrid_blueprints='{}'");
    console.log('[admin] All location data flushed');
    res.json({ ok: true, message: 'All kingdom location data cleared. Players must rediscover kingdoms.' });
  });
  router.get('/events/log', async (_req, res) => {
    const rows = await db.all(`SELECT * FROM event_log ORDER BY fired_at DESC LIMIT 200`);
    res.json(rows);
  });

  router.get('/events/list', async (_req, res) => {
    const rows = await db.all(`SELECT * FROM events ORDER BY season, name`);
    res.json(rows);
  });

  router.get('/suggestions', async (_req, res) => {
    const rows = await db.all(`
      SELECT s.*, k.name as kingdom_name, p.username 
      FROM suggestions s
      LEFT JOIN kingdoms k ON s.kingdom_id = k.id
      LEFT JOIN players p ON s.player_id = p.id
      ORDER BY s.created_at DESC
    `);
    res.json(rows);
  });

  router.post('/events/create', async (req, res) => {
    const { key, name, description, season, effect_type, effect_value, effect_duration, race_only, is_active, is_positive } = req.body;
    if (!key || !name) return res.status(400).json({ error: 'Key and name required' });
    await db.run(`INSERT INTO events (key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_active,is_positive) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [key, name, description||'', season||'all', effect_type||'morale', effect_value||0, effect_duration||1, race_only||null, is_active?1:0, is_positive?1:0]);
    res.json({ ok: true });
  });

  router.post('/events/update', async (req, res) => {
    const { id, key, name, description, season, effect_type, effect_value, effect_duration, race_only, is_active, is_positive } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    await db.run(`UPDATE events SET key=?,name=?,description=?,season=?,effect_type=?,effect_value=?,effect_duration=?,race_only=?,is_active=?,is_positive=? WHERE id=?`,
      [key, name, description||'', season||'all', effect_type||'morale', effect_value||0, effect_duration||1, race_only||null, is_active?1:0, is_positive?1:0, id]);
    res.json({ ok: true });
  });

  router.post('/events/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID required' });
    await db.run('DELETE FROM events WHERE id = ?', [id]);
    res.json({ ok: true });
  });

  return router;
};
