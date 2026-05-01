// src/game/engine.js
// Pure game logic — no I/O, no socket calls.
// All functions take a kingdom row (or rows) and return mutations + events.

const config = require('./config');

const {
  RACE_BONUSES, REGION_DATA, UNIT_COST, MAX_RESEARCH, HOUSING_CAP_BY_RACE,
  TROOP_RACE_BONUS, WALL_STRENGTH_MULT, TOWER_DETECT_MULT, OUTPOST_RANGER_MULT,
  WALL_UPGRADES, TOWER_DEF_UPGRADES, OUTPOST_UPGRADES, CITADEL_REQ,
  SEASON_ORDER, SEASON_DURATION, SEASON_FARM_MULT, SEASON_ICONS,
  LOCATE_RACE_MULT, FARM_YIELD_MULT, FARM_WORKERS_PER, FOOD_CONSUMPTION_MULT,
  MARKET_INCOME_MULT, TRADE_RATE_MULT, COMMODITY_VALUES, COMMODITY_RACE_DISCOUNT,
  TOWER_UPGRADES, SCHOOL_UPGRADES, SHRINE_UPGRADES, LIBRARY_UPGRADES,
  FARM_UPGRADES, MARKET_UPGRADES, TAVERN_UPGRADES, MERC_TIERS,
  XP_RACE_BONUS, XP_BASE, BUILDING_COST, BUILDING_GOLD_COST, BUILDING_LAND_COST,
  SPELL_DEFS, SCROLL_REQUIREMENTS, SCRIBE_ITEMS, SUPPORT_CAP_RACE, WM_CREW_REQUIRED,
  RESEARCH_MAP, BUILDING_ALIASES, RACIAL_UNITS,
  WORLD_FRAGMENTS, JUNK_PRIZES, ULTRA_RARE_PRIZES, THRONE_OF_NAZDREG, EXPEDITION_TURNS,
  LORE_EVENTS, CAPS, BUILDING_COL, TOOL_COL, TOOL_GOLD_COST, BLUEPRINT_REQUIRED: BP_REQ,
  SCAFFOLDING_REQUIRED: SCAFF_REQ, SCAFFOLDING_BONUS_BUILDINGS: SCAFF_BONUS, HERO_CLASSES
} = config;

const BLUEPRINT_REQUIRED = new Set(BP_REQ);
const SCAFFOLDING_REQUIRED = new Set(SCAFF_REQ);
const SCAFFOLDING_BONUS_BUILDINGS = new Set(SCAFF_BONUS);

const LEGENDARY_NAMES = {
  human: { fighters: 'Lionheart Champions' },
  orc:   { fighters: 'Blood-God Berserkers' },
  high_elf: { rangers: 'Starfall Guardians' },
  dark_elf: { ninjas: 'Void Assassins' },
  dwarf: { engineers: 'Runic Siege-Masters' },
  dire_wolf: { fighters: 'Fenris Alphas' }
};

function getUnitName(race, unit, prestigeLevel = 0) {
  if (prestigeLevel > 0 && LEGENDARY_NAMES[race]?.[unit]) {
    return `🌟 ${LEGENDARY_NAMES[race][unit]}`;
  }
  const labels = {
    fighters:'Fighters', rangers:'Rangers', mages:'Mages', clerics:'Clerics',
    thieves:'Thieves', ninjas:'Ninjas', scribes:'Scribes', researchers:'Researchers', engineers:'Engineers'
  };
  return labels[unit] || unit;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const _parseCache = new Map();
function clearParseCache() { _parseCache.clear(); }

function safeJsonParse(str, fallback = {}, context = 'unknown') {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  const cacheKey = `${context}:${str}`;
  if (_parseCache.has(cacheKey)) return _parseCache.get(cacheKey);

  try {
    const val = JSON.parse(str);
    _parseCache.set(cacheKey, val);
    return val;
  } catch (e) {
    console.error(`[JSON Parse Error] Context: ${context}. Error: ${e.message}. Data: ${str}`);
    return fallback;
  }
}

function raceBonus(kingdom, stat) {
  const bonuses = RACE_BONUSES[kingdom.race] || {};
  const base = bonuses[stat] || 1.0;
  
  // Home Region bonus - +5% to the region's designated stat if it's your race's home
  const homeRegion = REGION_DATA[kingdom.race];
  const isHome = (homeRegion && homeRegion.name === kingdom.region);
  const regionMult = (isHome && homeRegion.bonus === stat) ? (1 + homeRegion.mult) : 1.0;
  
  // Global Alliance Control bonus - +10% if your alliance owns this region
  let allianceMult = 1.0;
  if (kingdom._region_owned_by_my_alliance && kingdom._region_bonus_type === stat) {
    allianceMult = 1.10;
  }

  return base * regionMult * allianceMult;
}

function housingCapPerBuilding(race) {
  return HOUSING_CAP_BY_RACE[race] || 500;
}

function assignRegion(race) {
  return race; // simple mapping for now: race name = region id
}

function goldPerTurn(k) {
  const baseRate    = Math.floor((k.land||0) * ((k.tax||40) / 100) * ((k.res_economy||100) / 100));
  const castleBonus = Math.floor((k.bld_castles||0) / 500) * 500;
  const econBonus   = raceBonus(k, 'economy');
  const mktIncome   = marketIncomeFull(k);
  return Math.floor((baseRate + castleBonus) * econBonus * 2.25) + mktIncome;
}

function manaPerTurn(k) {
  const raceManaBase = {
    high_elf: 8, dark_elf: 6, human: 3, dwarf: 2, orc: 2, dire_wolf: 1,
  }[k.race] || 3;
  const towerMana   = (k.bld_mage_towers || 0) * 5;
  const capacity      = (k.bld_mage_towers || 0) * 20;
  const effectiveMages = Math.min(k.mages || 0, capacity);
  const mageMana       = Math.floor(effectiveMages / 5);

  // Tower upgrades
  const towerUpgrades = safeJsonParse(k.tower_upgrades, {}, 'manaPerTurn:tower_upgrades');
  const arcaneMult = towerUpgrades.arcane_focus ? 1.25 : 1.0;

  return Math.floor((raceManaBase + towerMana + mageMana) * raceBonus(k, 'magic') * arcaneMult);
}

function foodBalance(k) {
  return farmProduction(k) - foodConsumption(k);
}

function naturalMoraleCap(k) {
  return k.res_entertainment || 100;
}

function effectiveMorale(k) {
  const base = k.morale || 100;
  const entertainment = naturalMoraleCap(k);
  const bonus = raceBonus(k, 'morale');
  // Normalize: entertainment cap maps to 100
  const normalized = (base / entertainment) * 100;
  return Math.floor(normalized * bonus);
}

function popGrowth(k) {
  const eMorale = effectiveMorale(k);
  if (eMorale < 30) return -Math.floor(k.population * 0.02);

  const capPerBuilding = housingCapPerBuilding(k.race);
  const housingCap = (k.bld_housing || 0) * capPerBuilding;
  const pop = k.population || 0;

  let growthMult = 1.0;
  if (housingCap > 0 && pop >= housingCap * 2) return 0;
  if (housingCap > 0 && pop > housingCap) growthMult = 0.10;

  const base = Math.floor(pop * 0.003);
  const entertainment = Math.floor(k.res_entertainment / 100) * 10;
  const raceGrowthMult = {
    high_elf: 0.80, dwarf: 0.90, dire_wolf: 1.00,
    dark_elf: 0.85, human: 1.15, orc: 1.10,
  }[k.race] || 1.0;
  return Math.floor((base + entertainment) * raceGrowthMult * growthMult);
}

function researchIncrement(k, discipline, researchersAssigned) {
  const schoolBonus    = 1 + (Math.floor(k.bld_schools / 5) * 0.02);
  const raceMulti      = discipline === 'spellbook' ? raceBonus(k, 'magic') : raceBonus(k, 'research');
  const resLevelMult   = unitLevelMult(k, 'researchers');
  const effective = Math.floor(researchersAssigned * schoolBonus * raceMulti * resLevelMult);
  if (effective >= 2000) return 5;
  if (effective >= 1200) return 3;
  if (effective >= 600)  return 2;
  if (effective >= 200)  return 1;
  return 0;
}

// ── Troop levelling ───────────────────────────────────────────────────────────

// XP needed to reach each troop level (1-100)
// Early levels fast, late levels very slow
function troopXpForLevel(level) {
  if (level <= 1)  return 0;
  if (level <= 10) return level * 100;
  if (level <= 25) return level * 300;
  if (level <= 50) return level * 800;
  if (level <= 75) return level * 2000;
  return level * 5000;
}

function effectiveTroopLevel(k, unit) {
  const troopLevels = safeJsonParse(k.troop_levels, {}, 'effectiveTroopLevel:troop_levels');
  const data = troopLevels[unit] || { level: 1 };
  const raceBonus = TROOP_RACE_BONUS[k.race]?.[unit] || 1.0;
  // Race bonus multiplies above level 100 — a Dark Elf ninja at level 100 acts as level 180
  return Math.max(1, Math.floor(data.level * (data.level >= 100 ? raceBonus : 1 + (raceBonus - 1) * data.level / 100)));
}

// Award XP to a specific troop type — returns updated troop_levels JSON and any level-ups
function awardTroopXp(k, unit, xpAmount) {
  const troopLevels = safeJsonParse(k.troop_levels, {}, 'awardTroopXp:troop_levels');
  const current = troopLevels[unit] || { level: 1, xp: 0, count: 0 };
  const cap = 100;
  if (current.level >= cap) return { troop_levels: JSON.stringify(troopLevels), levelUps: [] };

  const raceBonus = TROOP_RACE_BONUS[k.race]?.[unit] || 1.0;
  const earned = Math.floor(xpAmount * raceBonus);
  const newXp = current.xp + earned;
  const xpNeeded = troopXpForLevel(current.level + 1);
  const levelUps = [];

  if (newXp >= xpNeeded && current.level < cap) {
    troopLevels[unit] = { level: current.level + 1, xp: newXp - xpNeeded, count: current.count };
    levelUps.push(`${unit} reached Level ${current.level + 1}`);
  } else {
    // Store XP within current level only (mod the threshold to prevent overflow)
    troopLevels[unit] = { ...current, xp: Math.min(newXp, xpNeeded - 1) };
  }
  return { troop_levels: JSON.stringify(troopLevels), levelUps };
}

// ── Unit level scaling ────────────────────────────────────────────────────────
// Returns effectiveness multiplier: +0.5% per level above 1, caps at +50% at level 100
function unitLevelMult(k, unit) {
  const level = effectiveTroopLevel(k, unit);
  const prestigeBonus = (k.prestige_level || 0) * 0.05;
  const isLegendary = (k.prestige_level || 0) > 0 && LEGENDARY_NAMES[k.race]?.[unit] ? 1.15 : 1.0;
  return (1 + Math.min(0.50, (level - 1) * 0.005)) * (1 + prestigeBonus) * isLegendary;
}

// ── Racial unique bonuses (unlocked at unit level 5+) ─────────────────────────
function racialUnitBonus(k, unit) {
  const level = effectiveTroopLevel(k, unit);
  if (level < 5) return {};
  const race = k.race;
  // Dwarf: 1 engineer can solo-crew a war machine
  if (race === 'dwarf'     && unit === 'engineers') return { warMachineSoloCrew: true };
  // High Elf: scroll crafting produces 2 scrolls instead of 1
  if (race === 'high_elf'  && unit === 'mages')     return { doubleScrolls: true };
  // Orc: every 10 fighters trains 1 free fighter per turn
  if (race === 'orc'       && unit === 'fighters')  return { freeTrainees: Math.floor((k.fighters||0) / 10) };
  // Dark Elf: assassinations leave no trace — target gets no news
  if (race === 'dark_elf'  && unit === 'ninjas')    return { silentAssassination: true };
  // Dire Wolf: expeditions return 1 turn early
  if (race === 'dire_wolf' && unit === 'rangers')   return { earlyReturn: true };
  // Human: clerics restore 1 morale across all unit types per turn
  if (race === 'human'     && unit === 'clerics')   return { auraHeal: true };
  return {};
}

// ── Dilute troop XP when new units are hired ──────────────────────────────────
// new_avg_xp = (old_xp × old_count) / (old_count + hired)
function diluteTroopXp(k, unit, hired) {
  if (!hired || hired <= 0) return null;
  const troopLevels = safeJsonParse(k.troop_levels, {}, 'diluteTroopXp:troop_levels');
  const current = troopLevels[unit] || { level: 1, xp: 0, count: k[unit] || 0 };
  const oldCount = Math.max(1, current.count || k[unit] || 1);
  const totalXp  = current.xp + troopXpForLevel(current.level); // total absolute XP
  const newCount = oldCount + hired;
  const newAvgXp = Math.floor((totalXp * oldCount) / newCount);
  // Recompute level from new average XP
  let newLevel = 1;
  while (newLevel < 100 && newAvgXp >= troopXpForLevel(newLevel + 1)) newLevel++;
  const xpIntoLevel = newAvgXp - troopXpForLevel(newLevel);
  troopLevels[unit] = { level: newLevel, xp: Math.max(0, xpIntoLevel), count: newCount };
  return JSON.stringify(troopLevels);
}

// ── Award activity XP to a unit type ─────────────────────────────────────────
// Wraps awardTroopXp, applies race bonus, returns updated troop_levels string
function awardUnitXp(k, unit, xpAmount) {
  if (!xpAmount || xpAmount <= 0 || !(k[unit] > 0)) return null;
  return awardTroopXp(k, unit, xpAmount).troop_levels;
}

// ── Defense system ────────────────────────────────────────────────────────────

// Compute overall defense rating label
function defenseRating(k) {
  const walls   = k.bld_walls         || 0;
  const towers  = k.bld_guard_towers  || 0;
  const outpost = k.bld_outposts      || 0;
  const wm      = k.war_machines      || 0;
  const defUpgrades = safeJsonParse(k.defense_upgrades, {}, 'defenseRating:defense_upgrades');
  if (defUpgrades.citadel) return '🏰 Citadel';
  if (walls === 0)                               return '🔴 Undefended';
  if (walls < 10 && towers === 0)               return '🟠 Lightly Defended';
  if (walls >= 10 && (towers > 0 || outpost > 0)) {
    if (wm > 0 && towers > 0 && outpost > 0)   return '🟢 Fortified';
    return '🟡 Defended';
  }
  return '🟠 Lightly Defended';
}

// Wall contribution to defense power
function wallDefensePower(k) {
  const walls   = k.bld_walls || 0;
  if (!walls) return 0;
  const race   = k.race || 'human';
  const mult   = WALL_STRENGTH_MULT[race] || 1.0;
  const wallUpgrades = safeJsonParse(k.wall_upgrades, {}, 'wallDefensePower:wall_upgrades');
  const reinMult   = wallUpgrades.reinforced    ? 1.25 : 1.0;

  // Base: each wall = 100 defense power (scaled by race + upgrades)
  const wmOnWalls  = Math.min(k.war_machines||0, walls);
  const wmBonus    = wmOnWalls * 500 * ((k.res_war_machines||100)/100) * (wallUpgrades.fortress_walls ? 1.75 : wallUpgrades.battlements ? 1.20 : 1.0);
  return Math.floor(walls * 100 * mult * reinMult + wmBonus);
}

// Guard tower contribution — thief detection
function towerDetectionPower(k) {
  const towers  = k.bld_guard_towers || 0;
  if (!towers) return 0;
  const race    = k.race || 'human';
  const mult    = TOWER_DETECT_MULT[race] || 1.0;
  const twUpgrades = safeJsonParse(k.tower_def_upgrades, {}, 'towerDetectionPower:tower_def_upgrades');
  const arrwMult  = twUpgrades.arrow_slits ? 1.20 : 1.0;
  const btlMult    = (safeJsonParse(k.wall_upgrades, {}, 'towerDetectionPower:wall_upgrades').battlements) ? 1.20 : 1.0;
  const thievesOnWatch = Math.min(k.thieves||0, towers * 10);
  const thiefLvlMult = unitLevelMult(k, 'thieves');
  const stealthMult  = raceBonus(k, 'stealth');
  return Math.floor((towers * 50 + thievesOnWatch * 15 * thiefLvlMult * stealthMult) * mult * arrwMult * btlMult);
}

// Outpost contribution — ranger patrol defense
function outpostRangerPower(k) {
  const outposts = k.bld_outposts || 0;
  if (!outposts) return 0;
  const race   = k.race || 'human';
  const mult   = OUTPOST_RANGER_MULT[race] || 1.0;
  const opUpgrades = safeJsonParse(k.outpost_upgrades, {}, 'outpostRangerPower:outpost_upgrades');
  const stationMult = opUpgrades.ranger_station ? 1.25 : 1.0;
  const rangersOnPatrol = Math.min(k.rangers||0, outposts * 20);
  const rangerLvlMult = unitLevelMult(k, 'rangers');
  const militaryMult = raceBonus(k, 'military');
  return Math.floor((outposts * 30 + rangersOnPatrol * 10 * rangerLvlMult * militaryMult) * mult * stationMult);
}

// Check and award Citadel status
function checkCitadel(k, events) {
  const updates = {};
  const defUpgrades = safeJsonParse(k.defense_upgrades, {}, 'checkCitadel:defense_upgrades');
  if (defUpgrades.citadel) return updates; // already unlocked
  const req = CITADEL_REQ;
  if ((k.bld_walls||0) >= req.walls && (k.bld_guard_towers||0) >= req.guard_towers &&
      (k.bld_outposts||0) >= req.outposts && (k.bld_castles||0) >= req.castles) {
    defUpgrades.citadel = true;
    updates.defense_upgrades = JSON.stringify(defUpgrades);
    events.push({ type:'system', message:`🏰 Castle Citadel achieved! Your fortress stands among the greatest in Narmir. +15% permanent defense bonus, warmachines on walls deal ×2 damage.` });
  }
  return updates;
}

function getMasonSigilResist(k) {
  let upg = {};
  try { upg = JSON.parse(k.library_upgrades || '{}'); } catch {}
  return upg.mason_sigil ? 0.5 : 1.0;
}

// Process building warmachine damage on successful attack (no walls = building damage)
function applyWarmachineDamage(attacker, defender, win) {
  const updates = {};
  if (!win) return updates;
  const walls = defender.bld_walls || 0;
  if (walls > 0) {
    // Walls take damage — % based on wall upgrades
    const wallUpgrades = safeJsonParse(defender.wall_upgrades, {}, 'applyWarmachineDamage:wall_upgrades');
    const warmachineResist = wallUpgrades.fortress_walls ? 0.03 : wallUpgrades.reinforced ? 0.06 : 0.10;
    const wallLost    = Math.max(1, Math.floor(walls * warmachineResist));
    updates.bld_walls = Math.max(0, walls - wallLost);
  } else {
    // No walls — random buildings take damage
    const DAMAGEABLE = ['bld_farms','bld_markets','bld_barracks','bld_schools','bld_mage_towers','bld_shrines'];
    const target = DAMAGEABLE[Math.floor(Math.random() * DAMAGEABLE.length)];
    const current = defender[target] || 0;
    if (current > 0) {
      const dmg = Math.max(1, Math.floor(current * 0.05 * getMasonSigilResist(defender)));
      updates[target] = Math.max(0, current - dmg);
    }
  }
  return updates;
}

// ── Season system ─────────────────────────────────────────────────────────────

// ── Location system ───────────────────────────────────────────────────────────

function calcDiscoveryChance(k) {
  const baseChance = 0.05; // 5% base
  const race = k.race || 'human';
  const raceMult = LOCATE_RACE_MULT[race] || 1.0;
  return baseChance * raceMult;
}

function processLocationMapsWip(k, events) {
  const updates = {};
  const wip = safeJsonParse(k.location_maps_wip, [], 'processLocationMapsWip:location_maps_wip');
  if (!wip.length) return updates;

  const scribesAvail = k.scribes || 0;
  let scribesUsed = 0;
  const completed = [];
  const remaining = [];

  for (const item of wip) {
    const cost = 10; // scribes required
    if (scribesUsed + cost > scribesAvail) { remaining.push(item); continue; }
    scribesUsed += cost;
    item.turns_remaining = (item.turns_remaining || 5) - 1;
    if (item.turns_remaining <= 0) {
      completed.push(item);
      const disc = safeJsonParse(k.discovered_kingdoms, {}, 'processLocationMapsWip:discovered_kingdoms');
      disc[item.target_id] = { found: true, mapped: true };
      updates.discovered_kingdoms = JSON.stringify(disc);
      events.push({ type:'system', message:`🗺️ Scribes have completed a location map for ${item.target_name}. You may now interact with them.` });
    } else {
      remaining.push(item);
    }
  }

  updates.location_maps_wip = JSON.stringify(remaining);
  return updates;
}

function hybridMultiplier(k, target) {
  const hbp = safeJsonParse(k.hybrid_blueprints, {}, 'hybridMultiplier:hybrid_blueprints');
  let active = false;
  for (const key in hbp) {
    if (hbp[key].assigned && hbp[key].building === target) {
      active = true;
      break;
    }
  }
  return active ? 1.5 : 1.0;
}

function totalHiredUnits(k) {
  return (k.fighters||0)+(k.rangers||0)+(k.clerics||0)+(k.mages||0)+(k.thieves||0)+(k.ninjas||0)+(k.researchers||0)+(k.engineers||0)+(k.scribes||0);
}

function farmProduction(k) {
  const farms = k.bld_farms || 0;
  if (!farms) return 0;
  const upgrades = safeJsonParse(k.farm_upgrades, {}, 'farmProduction:farm_upgrades');
  const race         = k.race || 'human';
  const workersNeeded = FARM_WORKERS_PER[race] || 10;
  const freePop       = Math.max(0, (k.population||0) - totalHiredUnits(k));
  const workedFarms   = Math.min(farms, Math.floor(freePop / workersNeeded));
  let   baseYield     = workedFarms * 100 * (FARM_YIELD_MULT[race] || 1.0);
  // Apply season and active event farm multiplier
  const activeEv = safeJsonParse(k.active_event, {}, 'farmProduction:active_event');
  const seasonMult  = (k._season_farm_mult) || 1.0; // injected by processTurn
  const evFarmMult  = activeEv.farm_yield  ? activeEv.farm_yield.mult  : 1.0;

  if (upgrades.irrigated)  baseYield *= 1.30;
  if (upgrades.plantation) baseYield *= 1.60;
  baseYield *= seasonMult * evFarmMult * hybridMultiplier(k, 'bld_farms');
  return Math.floor(baseYield);
}

function foodConsumption(k) {
  const race   = k.race || 'human';
  const mult   = FOOD_CONSUMPTION_MULT[race] || 1.0;
  const troops = totalHiredUnits(k);
  const pop    = Math.floor((k.population||0) / 100);
  return Math.floor((troops + pop) * mult);
}

function marketIncomeFull(k) {
  const markets = k.bld_markets || 0;
  if (!markets) return 0;
  const upgrades = safeJsonParse(k.market_upgrades, {}, 'marketIncomeFull:market_upgrades');
  const race         = k.race || 'human';
  const mult         = MARKET_INCOME_MULT[race] || 1.0;
  const freePop      = Math.max(0, (k.population||0) - totalHiredUnits(k));
  const workedMarkets = Math.min(markets, Math.floor(freePop / 5));
  const tradeRoutes   = Math.min(k.maps || 0, markets);
  let   income        = (workedMarkets * 50 + tradeRoutes * 30) * mult;
  if (upgrades.bazaar)       income *= 1.50;
  if (upgrades.black_market) income *= 1.20;
  return Math.floor(income);
}

function tavernEntertainmentBonus(k) {
  const taverns = k.bld_taverns || 0;
  if (!taverns) return 0;
  const upgrades = safeJsonParse(k.tavern_upgrades, {}, 'tavernEntertainmentBonus:tavern_upgrades');
  const base = taverns * 2 * hybridMultiplier(k, 'bld_taverns');
  return Math.floor(upgrades.guild_hall ? base*1.5 : upgrades.inn ? base*1.2 : base);
}

function commodityPrice(item, race, supplyIndex) {
  const base     = COMMODITY_VALUES[item] || 1;
  const raceDisc = COMMODITY_RACE_DISCOUNT[race] || {};
  const discount = raceDisc[item] || raceDisc._all || 1.0;
  const supply   = (supplyIndex && supplyIndex[item]) || 1.0;
  return Math.max(1, Math.round(base * discount * supply));
}

function processFoodEconomy(k, events) {
  const updates   = {};
  const prod      = farmProduction(k);
  const cons      = foodConsumption(k);
  const balance   = prod - cons;
  let   food      = k.food || 0;
  const upgrades = safeJsonParse(k.farm_upgrades, {}, 'processFoodEconomy:farm_upgrades');
  const maxStore  = cons * (upgrades.granary ? 15 : 5);

  if (balance >= 0) {
    food = Math.min(food + balance, maxStore);
    const surpTurns = (k.food_surplus_turns || 0) + 1;
    updates.food              = food;
    updates.food_surplus_turns  = surpTurns;
    updates.food_shortage_turns = 0;
    if (surpTurns >= 5) {
      const natCap = naturalMoraleCap(k);
      updates.morale = Math.min(natCap, (k.morale||100) + 2);
      events.push({ type:'system', message:`🌾 Food surplus: +${balance.toLocaleString()} units. Troops are well fed.` });
    } else {
      events.push({ type:'system', message:`🌾 Food: +${balance.toLocaleString()} surplus. Stores: ${food.toLocaleString()}.` });
    }
  } else {
    const shortage  = Math.abs(balance);
    const shortTurns = (k.food_shortage_turns || 0) + 1;
    updates.food_shortage_turns = shortTurns;
    updates.food_surplus_turns  = 0;

    if (food >= shortage) {
      food -= shortage;
      updates.food = food;
      events.push({ type:'system', message:`⚠️ Food deficit: drawing ${shortage.toLocaleString()} from stores. ${food.toLocaleString()} remaining.` });
    } else {
      updates.food = 0;
      events.push({ type:'system', message:`🚨 Food shortage! Turn ${shortTurns} — build more farms or reduce troops.` });
      if (shortTurns >= 3) {
        const hit = shortTurns >= 8 ? 20 : shortTurns >= 5 ? 10 : 5;
        updates.morale = Math.max(20, (k.morale||100) - hit);
        events.push({ type:'system', message:`😤 Starvation morale penalty: -${hit} morale.` });
      }
      if (shortTurns >= 5) {
        updates.population = Math.max(1000, (k.population||0) - 500);
        events.push({ type:'system', message:`👥 Population fleeing starvation: -500 people.` });
      }
      if (shortTurns >= 8) {
        const desert = Math.floor((k.fighters||0) * 0.02);
        if (desert > 0) {
          updates.fighters = Math.max(0, (k.fighters||0) - desert);
          events.push({ type:'system', message:`⚔️ ${desert.toLocaleString()} fighters deserted — starvation.` });
        }
      }
    }
  }
  return updates;
}

function processMercenaries(k, events) {
  const updates = {};
  const mercs = safeJsonParse(k.mercenaries, [], 'processMercenaries:mercenaries');
  if (!mercs.length) return updates;

  const currentTurn = k.turn || 0;
  let   gold        = k.gold || 0;
  const active      = [];

  for (const m of mercs) {
    const served = currentTurn - (m.hired_at_turn || 0);
    const upkeep = m.upkeep_per_turn || 0;
    if (served >= m.duration_turns) {
      updates[m.unit_type] = Math.max(0, (updates[m.unit_type] ?? (k[m.unit_type]||0)) - m.count);
      events.push({ type:'system', message:`⚔️ ${m.count} ${m.tier} ${m.unit_type} completed their contract and departed.` });
    } else if (gold >= upkeep) {
      gold -= upkeep;
      active.push(m);
    } else {
      updates[m.unit_type] = Math.max(0, (updates[m.unit_type] ?? (k[m.unit_type]||0)) - m.count);
      events.push({ type:'system', message:`⚔️ ${m.count} ${m.tier} ${m.unit_type} left — upkeep unpaid.` });
    }
  }
  updates.mercenaries = JSON.stringify(active);
  updates.gold        = gold;
  return updates;
}

function hireMercenaries(k, unitType, tier, count) {
  const tierDef = MERC_TIERS[tier];
  if (!tierDef) return { error:'Invalid tier' };
  const tavUpgrades = safeJsonParse(k.tavern_upgrades, {}, 'hireMercenaries:tavern_upgrades');
  if (tierDef.requires && !tavUpgrades[tierDef.requires])
    return { error:`Requires ${tierDef.requires.replace('_',' ')} upgrade` };
  if (!(k.bld_taverns > 0)) return { error:'Need at least 1 tavern' };

  const level  = tierDef.levelMin + Math.floor(Math.random() * (tierDef.levelMax - tierDef.levelMin + 1));
  const cost   = tierDef.costPer * count;
  const upkeep = Math.ceil(cost * tierDef.upkeepPct / tierDef.duration);
  if ((k.gold||0) < cost) return { error:`Need ${cost.toLocaleString()} gold` };

  const mercs = safeJsonParse(k.mercenaries, [], 'hireMercenaries:mercenaries');
  mercs.push({ unit_type:unitType, tier, level, count, hired_at_turn:k.turn||0, duration_turns:tierDef.duration, upkeep_per_turn:upkeep });

  return {
    updates: { gold:(k.gold||0)-cost, [unitType]:(k[unitType]||0)+count, mercenaries:JSON.stringify(mercs) },
    hired:   { tier, level, count, unitType, duration:tierDef.duration, upkeep, cost },
  };
}

function purchaseUpgrade(k, category, upgradeKey) {
  category = (category || '').toLowerCase();
  const defs = {
    farm: FARM_UPGRADES, market: MARKET_UPGRADES, tavern: TAVERN_UPGRADES,
    tower: TOWER_UPGRADES, school: SCHOOL_UPGRADES, shrine: SHRINE_UPGRADES, library: LIBRARY_UPGRADES,
    wall: WALL_UPGRADES, tower_def: TOWER_DEF_UPGRADES, outpost: OUTPOST_UPGRADES,
  }[category];
  if (!defs) return { error:'Invalid category' };
  const def = defs[upgradeKey];
  if (!def) return { error:'Invalid upgrade' };
  const colName = `${category}_upgrades`;
  const upgrades = safeJsonParse(k[colName], {}, `purchaseUpgrade:${colName}`);
  if (upgrades[upgradeKey])                        return { error:'Already purchased' };
  if (def.requires && !upgrades[def.requires])     return { error:`Requires ${def.requires.replace(/_/g,' ')} first` };
  if (def.raceOnly && k.race !== def.raceOnly)     return { error:`Only available to ${def.raceOnly.replace(/_/g,' ')}` };
  if ((k.gold||0) < def.cost)                     return { error:`Need ${def.cost.toLocaleString()} gold` };
  const bldCheck = { farm:'bld_farms', market:'bld_markets', tavern:'bld_taverns', tower:'bld_mage_towers', school:'bld_schools', shrine:'bld_shrines', library:'bld_libraries', wall:'bld_walls', tower_def:'bld_guard_towers', outpost:'bld_outposts' };
  if (bldCheck[category] && !((k[bldCheck[category]]||0) > 0)) return { error:`Need at least 1 ${category}` };
  upgrades[upgradeKey] = true;
  return { updates:{ gold:(k.gold||0)-def.cost, [colName]:JSON.stringify(upgrades) } };
}

function processTurn(k) {
  clearParseCache();
  const events = [];
  const updates = { turn: k.turn + 1, updated_at: Math.floor(Date.now() / 1000) };

  // ── 1. Gold income ───────────────────────────────────────────────────────────
  const income = goldPerTurn(k);
  updates.gold = k.gold + income;
  events.push({ type: 'system', message: `💰 Turn ${updates.turn}: +${income.toLocaleString()} gold earned. Treasury: ${updates.gold.toLocaleString()} gold.` });

  // ── 2. Mana regeneration ─────────────────────────────────────────────────────
  const manaGain = manaPerTurn(k);
  updates.mana = k.mana + manaGain;
  events.push({ type: 'system', message: `✨ Mana: +${manaGain.toLocaleString()} restored. Total: ${updates.mana.toLocaleString()}.` });

  // ── 3. Population growth ─────────────────────────────────────────────────────
  const growth = popGrowth(k);
  updates.population = Math.max(0, k.population + growth);
  if (growth > 0) {
    events.push({ type: 'system', message: `👥 Population grew by ${growth.toLocaleString()} to ${updates.population.toLocaleString()}.` });
  } else if (growth < 0) {
    events.push({ type: 'system', message: `👥 Population declined by ${Math.abs(growth).toLocaleString()} to ${updates.population.toLocaleString()} due to low morale.` });
  }

  // ── 4. Food economy — farms, consumption, shortage consequences ──────────────
  const foodUpdates = processFoodEconomy({ ...k, ...updates }, events);
  Object.assign(updates, foodUpdates);

  // ── 4b. Tavern entertainment bonus ────────────────────────────────────────────
  const entBonus = tavernEntertainmentBonus(k);
  if (entBonus > 0) {
    updates.res_entertainment = Math.min(500, (k.res_entertainment||0) + Math.floor(entBonus / 10));
  }

  // ── 4c. Mercenary upkeep and expiry ───────────────────────────────────────────
  const mercUpdates = processMercenaries({ ...k, ...updates }, events);
  Object.assign(updates, mercUpdates);

  // ── 4d. Location maps in progress ────────────────────────────────────────────
  const locUpdates = processLocationMapsWip({ ...k, ...updates }, events);
  Object.assign(updates, locUpdates);

  // ── 4e. Active event tick-down ────────────────────────────────────────────────
  const activeEv2 = safeJsonParse(updates.active_event || k.active_event, {}, 'processTurn:active_event');
  let changed = false;
  for (const key of Object.keys(activeEv2)) {
    activeEv2[key].turns_remaining = (activeEv2[key].turns_remaining||1) - 1;
    if (activeEv2[key].turns_remaining <= 0) { delete activeEv2[key]; }
    changed = true;
  }
  if (changed) updates.active_event = JSON.stringify(activeEv2);

  // ── 5. Lore Events ────────────────────────────────────────────────────────────
  if (Math.random() < 0.10) {
    const raceLore = LORE_EVENTS[k.race] || [];
    if (raceLore.length > 0) {
      const loreCollected = safeJsonParse(updates.collected_lore || k.collected_lore, [], 'processTurn:lore');
      const lastId = updates.last_lore_id || k.last_lore_id;

      let available = raceLore.filter(l => l.id !== lastId);
      if (available.length === 0) available = raceLore;
      const ev = available[Math.floor(Math.random() * available.length)];
      if (ev) {
        if (!loreCollected.includes(ev.id)) {
          loreCollected.push(ev.id);
          updates.collected_lore = JSON.stringify(loreCollected);
          
          if (loreCollected.length >= raceLore.length) {
            const ach = safeJsonParse(updates.achievements || k.achievements, [], 'lore');
            if (!ach.includes('historian')) {
              ach.push('historian');
              updates.achievements = JSON.stringify(ach);
              events.push({ type: 'system', message: '🏆 ACHIEVEMENT UNLOCKED: Historian (Found all library lore)' });
            }
          }
        }
        updates.last_lore_id = ev.id;
        events.push({ type: 'lore', message: `📜 HISTORY: ${ev.msg || ev.content || ev}` });
      }
    }
  }

  // ── 6. Troop upkeep ───────────────────────────────────────────────────────────
  // Researchers, engineers, scribes are exempt if housed in their buildings.
  // Overflow (unhomed) units pay normal upkeep.

  const capRace = SUPPORT_CAP_RACE[k.race] || { researcher: 1.0, engineer: 1.0, scribe: 1.0 };

  // Capacity per building (base × race multiplier)
  const researcherCap = Math.floor((k.bld_schools    || 0) * 100 * capRace.researcher);
  const engineerCap   = Math.floor((k.bld_smithies   || 0) * 50  * capRace.engineer);
  const scribeCap     = Math.floor((k.bld_libraries  || 0) * 20  * capRace.scribe);

  // Overflow = units beyond capacity → pay upkeep; housed units are free
  const researcherOverflow = Math.max(0, (k.researchers || 0) - researcherCap);
  const engineerOverflow   = Math.max(0, (k.engineers   || 0) - engineerCap);
  const scribeOverflow     = Math.max(0, (k.scribes     || 0) - scribeCap);

  // Combat/support troops always pay upkeep
  const upkeepMult = {
    high_elf: 1.00, dwarf: 0.85, dire_wolf: 1.20,
    dark_elf: 1.10, human: 1.00, orc: 1.15,
  }[k.race] || 1.0;

  const combatTroops = (k.fighters||0) + (k.rangers||0) + (k.clerics||0) +
                       (k.mages||0) + (k.thieves||0) + (k.ninjas||0);
  const supportOverflow = researcherOverflow + engineerOverflow + scribeOverflow;
  const totalTroops = combatTroops + supportOverflow;

  const barrackDiscount = Math.min(0.5, Math.floor((k.bld_barracks||0) / 2) * 0.01);
  const upkeep = Math.floor(totalTroops * upkeepMult * (1 - barrackDiscount));

  // Build housing status message for support units
  const housedResearchers = Math.min(k.researchers||0, researcherCap);
  const housedEngineers   = Math.min(k.engineers  ||0, engineerCap);
  const housedScribes     = Math.min(k.scribes    ||0, scribeCap);
  const totalHoused = housedResearchers + housedEngineers + housedScribes;

  if (upkeep > 0) {
    updates.gold = (updates.gold || k.gold) - upkeep;
    if (updates.gold < 0) updates.gold = 0;
    let msg = `⚔️ Troop upkeep: -${upkeep.toLocaleString()} gold (${totalTroops.toLocaleString()} billable`;
    if (totalHoused > 0) msg += `, ${totalHoused.toLocaleString()} support units housed free`;
    if (barrackDiscount > 0) msg += `, barracks discount applied`;
    msg += `).`;
    events.push({ type: 'system', message: msg });
  } else if (totalHoused > 0) {
    events.push({ type: 'system', message: `✅ All support units housed — no upkeep cost this turn.` });
  }

  // ── 6. Morale ─────────────────────────────────────────────────────────────────
  {
    const capPerBuilding = housingCapPerBuilding(k.race);
    const housingCap = (k.bld_housing || 0) * capPerBuilding;
    const overcrowded = housingCap > 0 && (k.population || 0) > housingCap;

    // Race overcrowding penalty modifiers
    const overcrowdMult = { dire_wolf: 0.5, high_elf: 2.0 }[k.race] || 1.0;
    const overcrowdPenalty = overcrowded
      ? Math.max(0, Math.floor(((k.population || 0) - housingCap) / 1000 * overcrowdMult))
      : 0;

    if (k.tax > 50) {
      const penalty = Math.floor((k.tax - 50) * 0.5) + overcrowdPenalty;
      updates.morale = Math.max(0, (k.morale||100) - penalty);
      events.push({ type: 'system', message: `😡 Morale fell by ${penalty} — citizens angry over ${k.tax}% taxation.` });
    } else {
      const recovery = 1 + Math.floor((k.res_entertainment||0) / 200);
      const natCap = naturalMoraleCap(k);
      let newMorale = Math.min(natCap, (k.morale||100) + recovery);
      
      // If currently above natural cap (due to spells/events), natural decay?
      if ((k.morale || 100) > natCap) {
        newMorale = Math.max(natCap, (k.morale || 100) - 2); // Natural decay towards cap
      }

      if (overcrowdPenalty > 0) {
        newMorale = Math.max(0, newMorale - overcrowdPenalty);
        events.push({ type: 'system', message: `🏚️ Overcrowding penalty: -${overcrowdPenalty} morale (${(((k.population||0) - housingCap)/1000).toFixed(1)}k over housing cap).` });
      }
      if (newMorale !== k.morale) {
        updates.morale = newMorale;
      }
    }
  }

  // ── 7. Auto-research — use per-discipline allocation ──────────────────────────
  const schoolBonus = 1 + (Math.floor((k.bld_schools||0) / 5) * 0.02);
  const raceResearch = raceBonus(k, 'research');
  const raceMagic    = raceBonus(k, 'magic');
  const researchers  = k.researchers || 0;

  if (researchers > 0) {
    const ALL_DISCIPLINES = [
      { col: 'res_economy',       key: 'economy',        label: 'Economy',          multi: raceResearch },
      { col: 'res_weapons',       key: 'weapons',        label: 'Weapons',          multi: raceResearch },
      { col: 'res_armor',         key: 'armor',          label: 'Armor',            multi: raceResearch },
      { col: 'res_military',      key: 'military',       label: 'Military tactics', multi: raceResearch },
      { col: 'res_attack_magic',  key: 'attack_magic',   label: 'Attack magic',     multi: raceMagic    },
      { col: 'res_defense_magic', key: 'defense_magic',  label: 'Defense magic',    multi: raceMagic    },
      { col: 'res_entertainment', key: 'entertainment',  label: 'Entertainment',    multi: raceResearch },
      { col: 'res_construction',  key: 'construction',   label: 'Construction',     multi: raceResearch },
      { col: 'res_war_machines',  key: 'war_machines',   label: 'War machines',     multi: raceResearch },
      { col: 'res_spellbook',     key: 'spellbook',      label: 'Spellbook',        multi: raceMagic    },
    ];

    const schoolUpgrades = safeJsonParse(k.school_upgrades, {}, 'processTurn:school_upgrades');
    const curriculumMult = schoolUpgrades.advanced_curriculum ? 1.20 : 1.0;
    const maxSlots       = schoolUpgrades.repository ? 2 : 1;

    // Research focus — single or dual discipline
    let focus = safeJsonParse(k.research_focus, [], 'processTurn:research_focus');
    if (!focus.length) {
      // Auto-select highest current discipline
      const top = ALL_DISCIPLINES.reduce((best, d) => ((k[d.col]||0) >= (k[best.col]||0) ? d : best), ALL_DISCIPLINES[0]);
      focus = [top.key];
      updates.research_focus = JSON.stringify(focus);
    }
    focus = focus.slice(0, maxSlots);
    const perSlot = Math.floor(researchers / focus.length);

    let rProgress = safeJsonParse(k.research_progress, {}, 'processTurn:research_progress');
    const advances = [];
    let resEstimates = [];

    focus.forEach(function(fKey) {
      const d = ALL_DISCIPLINES.find(x => x.key === fKey);
      if (!d) return;
      
      const current = updates[d.col] !== undefined ? updates[d.col] : (k[d.col] || 0);
      const cap = getCap(d.col, k.level || 1);
      if (current >= cap) return; // At cap, no progress

      const effective = Math.floor(perSlot * schoolBonus * d.multi * curriculumMult);
      rProgress[d.col] = (rProgress[d.col] || 0) + effective;
      
      // We scale the cost slightly for higher amounts to preserve the old balance somewhat,
      // but generally 200 points = 1%. We'll just use a flat 200 for simplicity and partial accumulation.
      const COST_PER_PCT = 200;
      let inc = 0;
      if (rProgress[d.col] >= COST_PER_PCT) {
        inc = Math.floor(rProgress[d.col] / COST_PER_PCT);
        rProgress[d.col] -= (inc * COST_PER_PCT);
      }

      if (inc > 0) {
        const newVal = Math.min(cap, current + inc);
        if (newVal !== current) {
          updates[d.col] = newVal;
          advances.push(`${d.label} → ${newVal}%`);
        }
      }

      if (effective > 0) {
        const pct = Math.floor((rProgress[d.col] / COST_PER_PCT) * 100);
        const turnsLeft = Math.ceil((COST_PER_PCT - rProgress[d.col]) / effective);
        resEstimates.push(`${d.label} (${pct}%, ${turnsLeft} turns left)`);
      }
    });

    updates.research_progress = JSON.stringify(rProgress);

    // Award Researcher XP even if no technical advances occurred
    if (researchers > 0) {
      const rXpMult = (schoolUpgrades.grand_academy ? 1.5 : 1.0) * (focus.length > 0 ? 1.0 : 0.5);
      // Base XP 5 per turn for working + 5 per advance
      const totalRXp = Math.floor((5 + (advances.length * 5)) * rXpMult);
      const rXp = awardTroopXp({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'researchers', totalRXp);
      updates.troop_levels = rXp.troop_levels;
      if (rXp.levelUps.length) events.push({ type: 'system', message: `📚 Researchers grew more skilled!` });
    }

    if (advances.length > 0) {
      events.push({ type: 'system', message: `📚 Research advanced: ${advances.join(', ')}.` });
      const resXp = awardXp({ ...k, xp: updates.xp || (k.xp||0), level: updates.level || (k.level||1) }, 'research', advances.length);
      updates.xp    = resXp.xp;
      updates.level = resXp.level;
      if (resXp.levelled) events.push(...resXp.events);
    } else if (researchers > 0) {
      if (resEstimates.length > 0) {
        events.push({ type: 'system', message: `📚 ${researchers.toLocaleString()} researchers studying. Est: ${resEstimates.join(', ')}.` });
      } else {
        events.push({ type: 'system', message: `📚 ${researchers.toLocaleString()} researchers studying ${focus.join(' & ')}.` });
      }
    }
  } else {
    events.push({ type: 'system', message: `📚 No researchers — hire researchers and allocate them to advance your kingdom's knowledge.` });
  }

  // ── 8. Build queue — engineers work on queued buildings each turn ─────────────
  const buildUpdates = processBuildQueue(k, events);
  Object.assign(updates, buildUpdates);

  // ── 8b. Library — mages produce mana, scribes craft maps/blueprints, mages craft scrolls ──
  const libUpdates = processLibrary({ ...k, ...updates }, events);
  Object.assign(updates, libUpdates);

  // ── 8d. Trade & Prestige ─────────────────────────────────────────────────────
  const prestigeLevel = k.prestige_level || 0;
  const tradeRoutes   = (k.trade_routes || 0);
  const tradeIncome   = tradeRoutes * 100 * (1 + prestigeLevel * 0.1);
  if (tradeIncome > 0) {
    updates.gold = (updates.gold || k.gold || 0) + tradeIncome;
    events.push({ type: 'system', message: `🚢 Trade Routes generated ${tradeIncome.toLocaleString()} gold.` });
  }

  // ── 8d. Defence — citadel check ───────────────────────────────────────────────
  const citadelUpdates = checkCitadel({ ...k, ...updates }, events);
  Object.assign(updates, citadelUpdates);

  // ── 8c. Mage tower research — research from mages in towers ──────────────────
  const towerUpdates = processMageTower({ ...k, ...updates }, events);
  Object.assign(updates, towerUpdates);

  // ── 8d. Shrines — clerics boost morale and prepare to heal ───────────────────
  const shrineUpdates = processShrine({ ...k, ...updates }, events);
  Object.assign(updates, shrineUpdates);

  // ── 8e. Active effects — tick down debuffs/buffs ─────────────────────────────
  const effectUpdates = processActiveEffects({ ...k, ...updates }, events);
  Object.assign(updates, effectUpdates);

  // ── 9. Training fields — passive troop XP each turn ──────────────────────────
  if ((k.bld_training||0) > 0) {
    const troopLevels = safeJsonParse(updates.troop_levels || k.troop_levels, {}, 'processTurn:troop_levels');
    const allocation = safeJsonParse(k.training_allocation, {}, 'processTurn:training_allocation');

    const TROOP_TYPES = ['fighters','rangers','clerics','mages','thieves','ninjas'];
    const trainingFields   = k.bld_training || 0;
    const trainingCapacity = trainingFields * 50;
    let advancedTroops = [];

    TROOP_TYPES.forEach(function(unit) {
      const assigned = Number(allocation[unit]) || 0;
      if (assigned <= 0) return;
      const currentData = troopLevels[unit] || { level: 1, xp: 0, count: 0 };
      if (currentData.level >= 100) return;
      const weaponsEquipped = Math.min(assigned, k.weapons_stockpile || 0);
      const armorEquipped   = Math.min(assigned, k.armor_stockpile   || 0);
      const equipBonus = 1 + (weaponsEquipped / Math.max(assigned, 1)) * 0.5
                           + (armorEquipped   / Math.max(assigned, 1)) * 0.5;
      const raceTrainBonus = TROOP_RACE_BONUS[k.race]?.[unit] || 1.0;
      const xpGain = Math.floor(trainingCapacity * equipBonus * raceTrainBonus / TROOP_TYPES.length);
      const newXp  = currentData.xp + xpGain;
      const xpNeeded = troopXpForLevel(currentData.level + 1);
      if (newXp >= xpNeeded) {
        troopLevels[unit] = { level: currentData.level + 1, xp: newXp - xpNeeded, count: assigned };
        advancedTroops.push(`${unit} → Level ${currentData.level + 1}`);
      } else {
        troopLevels[unit] = { ...currentData, xp: newXp, count: assigned };
      }
    });

    updates.troop_levels = JSON.stringify(troopLevels);
    if (advancedTroops.length > 0) {
      events.push({ type: 'system', message: `⚔️ Troop training advanced: ${advancedTroops.join(', ')}.` });
    } else if (trainingFields > 0 && Object.keys(allocation).length > 0) {
      events.push({ type: 'system', message: `⚔️ ${trainingFields} training field(s) active — troops gaining experience.` });
    }
  }

  // ── 9b. Racial passive bonuses ────────────────────────────────────────────────
  // Orc: every 10 fighters (level 5+) trains 1 free fighter per turn
  const orcBonus = racialUnitBonus({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'fighters');
  if (orcBonus.freeTrainees > 0) {
    const BARRACKS_TROOPS = ['fighters','rangers','clerics','thieves','ninjas'];
    const barracksCap = (k.bld_barracks || 0) * 500;
    const currentBarracksTroops = BARRACKS_TROOPS.reduce((s, u) => s + (updates[u] !== undefined ? updates[u] : (k[u] || 0)), 0);
    const levelCapVal = getCap('fighters', k.level || 1);
    const currentFighters = (updates.fighters !== undefined ? updates.fighters : (k.fighters || 0));
    
    const barracksSpace = Math.max(0, barracksCap - currentBarracksTroops);
    const levelSpace = Math.max(0, levelCapVal - currentFighters);
    const added = Math.min(orcBonus.freeTrainees, barracksSpace, levelSpace);
    
    if (added > 0) {
      updates.fighters = currentFighters + added;
      events.push({ type: 'system', message: `🪓 Orcish war culture: ${added.toLocaleString()} free fighters trained this turn.` });
    }
  }
  // Human: level 5+ clerics restore 1 morale per turn
  const humanBonus = racialUnitBonus({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'clerics');
  if (humanBonus.auraHeal && (k.clerics || 0) > 0) {
    const natCap = naturalMoraleCap(k);
    updates.morale = Math.min(natCap, (updates.morale || k.morale || 100) + 1);
    events.push({ type: 'system', message: `✨ Human clerics radiate healing aura — +1 morale.` });
  }

  // ── 10. Rangers auto-explore — level scales land discovery, diminishing returns on high land ──
  const rangers = k.rangers || 0;
  if (rangers > 0) {
    const scoutMult    = raceBonus(k, 'military');
    const rangerLvMult = unitLevelMult({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'rangers');
    // Diminishing returns — more land = less free land per turn
    const currentLand  = updates.land || k.land || 0;
    const diminish     = Math.max(0.05, 1 / Math.log10(Math.max(10, currentLand)));
    const autoLand     = Math.floor(rangers * 0.001 * scoutMult * rangerLvMult * diminish);
    if (autoLand > 0) {
      updates.land = currentLand + autoLand;
      events.push({ type: 'system', message: `🗺️ Rangers explored and claimed ${autoLand} acre(s) of new land. Total: ${updates.land.toLocaleString()} acres.` });
      // Passive ranger XP for exploring
      const rangerXp = awardTroopXp({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'rangers', 3);
      updates.troop_levels = rangerXp.troop_levels;
    }
  }

  // ── XP awards this turn ───────────────────────────────────────────────────────
  let totalXp = k.xp || 0;
  let currentLevel = k.level || 1;

  // Turn XP
  const turnXp = awardXp({ ...k, xp: totalXp, level: currentLevel }, 'turn', 1);
  totalXp = turnXp.xp;
  currentLevel = turnXp.level;
  if (turnXp.levelled) events.push(...turnXp.events);

  // Gold income XP
  const goldXp = awardXp({ ...k, xp: totalXp, level: currentLevel }, 'gold_earned', income);
  totalXp = goldXp.xp;
  currentLevel = goldXp.level;
  if (goldXp.levelled) events.push(...goldXp.events);

  // Research XP (awarded after research section runs)
  // (handled below after DISCIPLINES loop)

  updates.xp    = totalXp;
  updates.level = currentLevel;

  // ── Racial bonus unlock check — fires once when signature unit hits level 5 ──
  const keyUnit = RACIAL_UNITS[k.race];
  if (keyUnit) {
    // Use already-set updates value if present, else fall back to k
    const racialData = safeJsonParse(updates.racial_bonuses_unlocked || k.racial_bonuses_unlocked, {}, 'processTurn:racial_bonuses_unlocked');
    if (!racialData[keyUnit]) {
      const tls = safeJsonParse(updates.troop_levels || k.troop_levels, {}, 'processTurn:troop_levels_racial_check');
      const unitLevel = tls[keyUnit]?.level || 1;
      if (unitLevel >= 5) {
        racialData[keyUnit] = true;
        updates.racial_bonuses_unlocked = JSON.stringify(racialData);
        const RACIAL_MSGS = {
          dwarf:     '⚒️ Your engineers have reached mastery — Dwarven war machines now need only 1 engineer to crew.',
          high_elf:  '✨ Your mages have reached mastery — High Elf scrolls now produce 2 per craft.',
          orc:       '⚔️ Your fighters have reached mastery — Orcish war culture now trains 1 free fighter per 10 each turn.',
          dark_elf:  '🕵️ Your ninjas have reached mastery — Dark Elf assassinations now leave no trace.',
          dire_wolf: '🐺 Your rangers have reached mastery — Dire Wolf expeditions now return 1 turn early.',
          human:     '💚 Your clerics have reached mastery — Human healing aura now restores +1 morale per turn.',
        };
        if (RACIAL_MSGS[k.race]) events.push({ type: 'system', message: RACIAL_MSGS[k.race] });
      }
    }
  }

  updates.last_turn_at = Math.floor(Date.now() / 1000);
  return { updates, events };
}

// ── Level-based caps ──────────────────────────────────────────────────────────
// All caps scale linearly from base (level 1) to max (level 1000)
// Formula: Math.floor(base + (max - base) * (level - 1) / 999)

function levelCap(base, max, level) {
  const lv = Math.max(1, Math.min(1000, level || 1));
  return Math.floor(base + (max - base) * (lv - 1) / 999);
}

function getCap(field, level) {
  const c = CAPS[field];
  if (!c) return Infinity;
  return levelCap(c.base, c.max, level);
}

// ── Hire units ────────────────────────────────────────────────────────────────

function hireUnits(k, unit, amount) {
  const validUnits = ['fighters','rangers','clerics','mages','thieves','ninjas','researchers','engineers','scribes'];
  if (!validUnits.includes(unit)) return { error: 'Invalid unit type' };
  if (amount <= 0) return { error: 'Amount must be positive' };

  // School cap — researchers need schools (100 per school)
  if (unit === 'researchers') {
    const schoolCap = (k.bld_schools || 0) * 100;
    const currentResearchers = k.researchers || 0;
    if (schoolCap === 0) return { error: 'You need at least 1 school to hire researchers' };
    if (currentResearchers >= schoolCap) return { error: `School capacity full — ${schoolCap.toLocaleString()} researchers max with ${k.bld_schools} school${k.bld_schools > 1 ? 's' : ''} (100 per school)` };
    if (currentResearchers + amount > schoolCap) return { error: `Only room for ${(schoolCap - currentResearchers).toLocaleString()} more researchers — build more schools (100 per school)` };
  }

  // Barracks cap — military troops need barracks (500 per barracks)
  const BARRACKS_TROOPS = ['fighters','rangers','clerics','thieves','ninjas'];
  if (BARRACKS_TROOPS.includes(unit)) {
    const barracksCap = (k.bld_barracks || 0) * 500;
    const currentTroops = BARRACKS_TROOPS.reduce((s, u) => s + (k[u] || 0), 0);
    if (barracksCap === 0) return { error: 'You need at least 1 barracks to hire troops' };
    if (currentTroops >= barracksCap) return { error: `Barracks full — ${barracksCap.toLocaleString()} troops max with ${k.bld_barracks} barracks (500 per barracks)` };
    if (currentTroops + amount > barracksCap) return { error: `Only room for ${(barracksCap - currentTroops).toLocaleString()} more troops — build more barracks (500 per barracks)` };
  }

  // Level cap check (researchers, engineers, scribes have no level cap)
  if (!['researchers','engineers','scribes'].includes(unit)) {
    let cap = getCap(unit, k.level || 1);
    // Orc: Unit capacity -50% rangers
    if (k.race === 'orc' && unit === 'rangers') {
      cap = Math.floor(cap * 0.5);
    }
    const current = k[unit] || 0;
    if (current >= cap) return { error: `Level ${k.level||1} cap reached for ${unit} (max ${cap.toLocaleString()}) — gain levels to increase` };
    if (current + amount > cap) return { error: `Level ${k.level||1} cap: can only hire ${(cap - current).toLocaleString()} more ${unit} (max ${cap.toLocaleString()})` };
  }

  const cost = amount * UNIT_COST;
  if (k.gold < cost) return { error: `Not enough gold — need ${cost.toLocaleString()} gold` };
  if (amount > k.population) return { error: 'Not enough population available' };

  // Dilute unit XP pool when new recruits join — new troops lower the average
  const dilutedLevels = diluteTroopXp(k, unit, amount);

  return {
    updates: {
      gold: k.gold - cost,
      population: k.population - amount,
      [unit]: (k[unit]||0) + amount,
      ...(dilutedLevels ? { troop_levels: dilutedLevels } : {}),
      updated_at: Math.floor(Date.now() / 1000),
    }
  };
}

// ── Research ──────────────────────────────────────────────────────────────────

function studyDiscipline(k, discipline, researchersAssigned) {
  const col = RESEARCH_MAP[discipline];
  if (!col) return { error: 'Unknown discipline' };
  if (researchersAssigned > k.researchers) return { error: 'Not enough researchers' };

  const increment = researchIncrement(k, discipline, researchersAssigned);
  if (increment === 0) return { error: 'Need more researchers for any progress (min ~200)' };

  const cap = discipline === 'spellbook' ? Infinity : MAX_RESEARCH;
  const newVal = Math.min(cap, k[col] + increment);

  return {
    updates: { [col]: newVal, updated_at: Math.floor(Date.now() / 1000) },
    increment,
  };
}

// ── Experience & Levelling ────────────────────────────────────────────────────

// XP required to reach each level (cumulative from level 1)
// Formula: level 1-10: 100*L^2, 11-50: 150*L^2, 51-200: 200*L^2, 201-500: 300*L^2, 501-1000: 500*L^2
function xpForLevel(level) {
  if (level <= 1)   return 0;
  if (level <= 10)  return Math.floor(100  * Math.pow(level - 1, 2));
  if (level <= 50)  return Math.floor(150  * Math.pow(level - 1, 2));
  if (level <= 200) return Math.floor(200  * Math.pow(level - 1, 2));
  if (level <= 500) return Math.floor(300  * Math.pow(level - 1, 2));
  return              Math.floor(500  * Math.pow(level - 1, 2));
}

function xpToNextLevel(level) {
  return xpForLevel(level + 1) - xpForLevel(level);
}

function levelFromXp(totalXp) {
  let lo = 1, hi = 1000;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xpForLevel(mid) <= totalXp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function xpRaceBonus(k, activity) {
  const bonuses = XP_RACE_BONUS[k.race] || {};
  const base = bonuses.all || 1.0;
  return Math.max(base, bonuses[activity] || base);
}

// Award XP and check for level up — returns { xp, level, levelled, events }
function awardXp(k, activity, amount) {
  const mult    = xpRaceBonus(k, activity);
  const earned  = Math.max(1, Math.floor((XP_BASE[activity] || 10) * amount * mult));
  const newXp   = (k.xp || 0) + earned;
  const newLevel = levelFromXp(newXp);
  const levelled = newLevel > (k.level || 1);
  const events  = [];
  if (levelled) {
    events.push({ type: 'system', message: `🌟 Kingdom reached Level ${newLevel}! (${earned.toLocaleString()} XP earned)` });
  }
  return { xp: newXp, level: newLevel, earned, levelled, events };
}

// ── Construction ──────────────────────────────────────────────────────────────

// Scaffolding bonus scales inversely with building difficulty: smaller buildings get bigger % boost
function scaffoldingBonus(building) {
  const cost = BUILDING_COST[building] || 10000;
  return Math.max(0.05, Math.floor(50 / (cost / 100)) / 100); // e.g. farm=2.0, barracks=1.0, school=0.67
}

// Add buildings to the queue — charges gold, no turn cost
function queueBuildings(k, orders) {
  const queue = safeJsonParse(k.build_queue, {}, 'queueBuildings:build_queue');

  let totalCost = 0;
  const processedOrders = {};

  for (const [building, qty] of Object.entries(orders)) {
    // Normalize building name (e.g., 'library' -> 'libraries')
    const key = BUILDING_ALIASES[building] || building;
    if (!BUILDING_COST[key]) {
      console.warn(`[queueBuildings] Unknown building type: ${building} (normalized to ${key})`);
      continue;
    }
    const n = Math.max(0, Number(qty));
    if (n <= 0) continue;
    
    const goldPerUnit = BUILDING_GOLD_COST[key] || 100;
    totalCost += goldPerUnit * n;
    processedOrders[key] = n;
  }

  if (totalCost > k.gold) {
    return { error: `Need ${totalCost.toLocaleString()} gold but only have ${k.gold.toLocaleString()} gold` };
  }

  for (const [key, n] of Object.entries(processedOrders)) {
    queue[key] = (queue[key] || 0) + n;
  }

  return {
    updates: {
      build_queue: JSON.stringify(queue),
      gold: k.gold - totalCost,
    },
    totalCost,
  };
}

// Process build queue each turn — engineers work on allocated buildings continuously
function processBuildQueue(k, events) {
  const updates = {};

  // Tool bonuses
  const hl = TOOL_COL.hammers;
  const sl = TOOL_COL.scaffolding;
  const hammerBonus  = 1 + (k[hl] || 0) * 0.05;
  const smithyBonus  = 1 + (Math.floor((k.bld_smithies||0) / 15) * 0.02);
  const raceConstr   = raceBonus(k, 'construction');
  const engLevelMult = unitLevelMult(k, 'engineers');
  const resConstr    = (k.res_construction || 100) / 100;
  const baseToolMult = hammerBonus * smithyBonus * raceConstr * engLevelMult * resConstr;

  // Consumable tool pools — tracked across the building loop this turn
  let blueprintsLeft  = k.blueprints_stored || 0;
  let scaffoldingLeft = k[sl]  || 0;
  let blueprintsUsed  = 0;
  let scaffoldingUsed = 0;

  // Get engineer allocation
  const allocationRaw = safeJsonParse(k.build_allocation, {}, 'processBuildQueue:build_allocation');
  let allocation = {};
  for (const b of Object.keys(allocationRaw)) {
    const key = BUILDING_ALIASES[b] || b;
    allocation[key] = (allocation[key] || 0) + (Number(allocationRaw[b]) || 0);
  }

  // Also check legacy build_queue for any manually queued items
  const queueRaw = safeJsonParse(k.build_queue, {}, 'processBuildQueue:build_queue');
  let queue = {};
  for (const b of Object.keys(queueRaw)) {
    const key = BUILDING_ALIASES[b] || b;
    queue[key] = (queue[key] || 0) + (Number(queueRaw[b]) || 0);
  }

  // Normalize progress
  const progressRaw = safeJsonParse(k.build_progress, {}, 'processBuildQueue:build_progress');
  let progress = {};
  for (const b of Object.keys(progressRaw)) {
    const key = BUILDING_ALIASES[b] || b;
    progress[key] = (progress[key] || 0) + (Number(progressRaw[b]) || 0);
  }

  // Merge: allocation drives continuous building, queue adds on top
  const activeBuildings = new Set([...Object.keys(allocation).filter(b => allocation[b] > 0), ...Object.keys(queue).filter(b => queue[b] > 0)]);
  if (activeBuildings.size === 0) return updates;

  const completedItems = [];

  for (const building of activeBuildings) {
    const engAssigned = allocation[building] || 0;
    if (engAssigned <= 0 && !(queue[building] > 0)) continue;

    const cost = BUILDING_COST[building];
    if (!cost) continue;

    // ── Blueprint gate — required for buildings with base cost >= 100 turns ──
    if (BLUEPRINT_REQUIRED.has(building) && blueprintsLeft <= 0) {
      updates._blueprint_needed = updates._blueprint_needed || [];
      if (!updates._blueprint_needed.includes(building)) updates._blueprint_needed.push(building);
      continue; // skip this building entirely this turn
    }

    // ── Scaffolding gate — required for buildings > 100 turns base ──────────
    if (SCAFFOLDING_REQUIRED.has(building) && scaffoldingLeft <= 0) {
      updates._scaffolding_needed = updates._scaffolding_needed || [];
      if (!updates._scaffolding_needed.includes(building)) updates._scaffolding_needed.push(building);
      continue;
    }

    // ── Per-building tool multiplier ─────────────────────────────────────────
    let toolMult = baseToolMult;
    // Scaffolding bonus for sub-100-turn buildings (optional, stacks)
    if (SCAFFOLDING_BONUS_BUILDINGS.has(building) && scaffoldingLeft > 0) {
      toolMult = toolMult * (1 + scaffoldingBonus(building));
    }

    const workDone = Math.floor(engAssigned * toolMult);
    if (workDone <= 0) continue;

    // ── Gold gate — buildings cost gold per unit of progress ─────────────────
    const goldPerPiece = (BUILDING_GOLD_COST[building] || 0) / cost;
    const goldNeeded   = Math.ceil(workDone * goldPerPiece) || 0;
    const goldAvail    = updates.gold !== undefined ? updates.gold : (k.gold || 0);

    let actualWork = workDone;
    if (goldNeeded > 0 && goldAvail < goldNeeded) {
      if (goldAvail <= 0) {
        if (!updates._low_gold) {
          events.push({ type: 'system', message: `⚠️ Building halted — not enough gold in the treasury.` });
          updates._low_gold = true;
        }
        continue;
      }
      // Scale work by available gold
      actualWork = Math.floor(goldAvail / goldPerPiece);
      if (actualWork <= 0) continue;
    }

    if (goldNeeded > 0) {
      const goldToPay = Math.ceil(actualWork * goldPerPiece);
      updates.gold = goldAvail - goldToPay;
    }

    const prevProgress  = progress[building] || 0;
    const totalProgress = prevProgress + actualWork;
    const completed     = Math.floor(totalProgress / cost);

    if (completed > 0) {
      const col = BUILDING_COL[building];
      if (col) {
        const current = updates[col] !== undefined ? updates[col] : (k[col] || 0);
        const cap     = getCap(col, k.level || 1);
        const canAdd  = Math.max(0, Math.min(completed, cap - current));
        updates[col]  = current + canAdd;
        if (canAdd < completed && canAdd === 0) {
          events.push({ type: 'system', message: `⚠️ ${building} cap reached at level ${k.level||1} (max ${cap.toLocaleString()}) — level up to build more.` });
        }
        if (canAdd > 0) {
          completedItems.push(`${canAdd.toLocaleString()} ${building.replace(/_/g, ' ')}`);
          const landCost = (BUILDING_LAND_COST[building] || 0) * canAdd;
          if (landCost > 0) {
            updates.land = Math.max(0, (updates.land !== undefined ? updates.land : (k.land || 0)) - landCost);
          }

          // ── Consume blueprint on completion ─────────────────────────────
          if (BLUEPRINT_REQUIRED.has(building)) {
            const consume = Math.min(canAdd, blueprintsLeft);
            blueprintsLeft  -= consume;
            blueprintsUsed  += consume;
          }

          // ── Consume scaffolding on completion ───────────────────────────
          if (SCAFFOLDING_REQUIRED.has(building) || SCAFFOLDING_BONUS_BUILDINGS.has(building)) {
            const consume = Math.min(canAdd, scaffoldingLeft);
            scaffoldingLeft -= consume;
            scaffoldingUsed += consume;
          }
        }
      }
      progress[building] = totalProgress - (completed * cost);
      if (queue[building] > 0) {
        queue[building] = Math.max(0, queue[building] - completed);
        if (queue[building] <= 0) delete queue[building];
      }
    } else {
      progress[building] = totalProgress;
    }
    
    // Calculate estimated completion for news
    if (!updates._build_estimates) updates._build_estimates = [];
    if (actualWork > 0) {
      if (actualWork >= cost) {
        const nextTurn = Math.floor((progress[building] + actualWork) / cost);
        updates._build_estimates.push(`${building.replace(/_/g, ' ')} (${nextTurn} next turn)`);
      } else {
        const turnsLeft = Math.ceil((cost - Math.max(0, progress[building])) / actualWork);
        const pct = Math.floor((Math.max(0, progress[building]) / cost) * 100);
        updates._build_estimates.push(`${building.replace(/_/g, ' ')} (${pct}%, ${turnsLeft} turns left)`);
      }
    }
  }

  // ── Hammer degradation ──
  const hammerCount = k[hl] || 0;
  if (hammerCount > 0 && activeBuildings.size > 0) {
    const used = (k.hammer_turns_used || 0) + hammerCount; // each hammer used this turn
    const breaks = Math.floor(used / 20); // 1 hammer breaks every 20 turns of use
    if (breaks > 0) {
      const newCount = Math.max(0, hammerCount - breaks);
      updates[hl] = newCount;
      updates.hammer_turns_used = used - (breaks * 20);
      updates._hammerBreakMsg = `${breaks} hammer${breaks > 1 ? 's' : ''} wore out and broke.`;
    } else {
      updates.hammer_turns_used = used;
    }
  }

  let buildMsg = '';
  if (completedItems.length > 0) {
    const landUsed = (updates.land !== undefined) ? (k.land || 0) - updates.land : 0;
    const landStr = landUsed > 0 ? ` · ${landUsed} land used` : '';
    buildMsg += `Construction: ${completedItems.join(', ')} built${landStr}. `;
  } else if (activeBuildings.size > 0 && updates._build_estimates && updates._build_estimates.length > 0) {
    buildMsg += `Engineers making progress. `;
  }
  if (updates._build_estimates && updates._build_estimates.length > 0) {
    buildMsg += `Est: ${updates._build_estimates.join(' · ')}.`;
  }
  if (buildMsg || updates._hammerBreakMsg) {
    let combined = [];
    if (buildMsg) combined.push(buildMsg.trim());
    if (updates._hammerBreakMsg) combined.push(updates._hammerBreakMsg);
    events.push({ type: 'system', message: `🔨 ${combined.join(' ')}` });
  }
  delete updates._build_estimates;
  delete updates._hammerBreakMsg;

  if (blueprintsUsed  > 0) updates.blueprints_stored = Math.max(0, (k.blueprints_stored || 0) - blueprintsUsed);
  if (scaffoldingUsed > 0) updates[sl]  = Math.max(0, scaffoldingLeft);

  // News notices for missing tools
  if (updates._blueprint_needed) delete updates._blueprint_needed;
  if (updates._scaffolding_needed) delete updates._scaffolding_needed;
  delete updates._low_gold;

  // Clean up zero progress entries for inactive buildings
  for (const b of Object.keys(progress)) {
    if (!allocation[b] && !queue[b]) delete progress[b];
  }

  updates.build_queue    = JSON.stringify(queue);
  updates.build_progress = JSON.stringify(progress);

  if (completedItems.length > 0) {
    const totalCompleted = completedItems.reduce(function(s, item) {
      const match = item.match(/^(\d[\d,]*)/);
      return s + (match ? parseInt(match[1].replace(/,/g,'')) : 1);
    }, 0);
    const conXp = awardXp(k, 'construction', totalCompleted);
    updates.xp    = conXp.xp;
    updates.level = conXp.level;
    if (conXp.levelled) events.push(...conXp.events);
    // Award engineer unit XP per building completed
    const engXpRes = awardTroopXp({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'engineers', totalCompleted * 10);
    updates.troop_levels = engXpRes.troop_levels;
    if (engXpRes.levelUps.length) events.push({ type: 'system', message: `⚒️ Your engineers grew more skilled — Level ${JSON.parse(engXpRes.troop_levels).engineers?.level || ''}!` });
    // Dwarf racial bonus: level 5+ engineers can solo-crew war machines
    // (one-time news handled by racial unlock in processTurn — no repeated message here)
  } else if (activeBuildings.size > 0) {
    events.push({ type: 'system', message: `🔨 Engineers making progress on ${activeBuildings.size} building type${activeBuildings.size > 1 ? 's' : ''}.` });
  }

  return updates;
}

// Forge construction tools — costs gold, no engineer requirement
function forgeTools(k, toolType, quantity) {
  const cost = TOOL_GOLD_COST[toolType];
  const col  = TOOL_COL[toolType];
  if (!cost || !col) return { error: 'Unknown tool type' };
  const totalCost = cost * quantity;
  if (totalCost > k.gold) return { error: `Need ${totalCost.toLocaleString()} gold but only have ${k.gold.toLocaleString()} gold` };
  return {
    updates: {
      [col]: (k[col]||0) + quantity,
      gold: k.gold - totalCost,
      updated_at: Math.floor(Date.now()/1000),
    },
    totalCost,
  };
}

// ── Military combat ───────────────────────────────────────────────────────────

function wmCrewRequired(race, engineerLevel) {
  let base = WM_CREW_REQUIRED[race] || 3;
  // Dwarf racial unique — solo crew at engineer level 5+
  if (race === 'dwarf' && engineerLevel >= 5) base = 1;
  return base;
}

function moraleMult(morale) {
  if (morale < 50)  return 0.80 + (morale / 50) * 0.10;  // 0.80–0.90
  if (morale < 100) return 0.90 + ((morale - 50) / 50) * 0.10; // 0.90–1.00
  return Math.min(1.20, 1.00 + ((morale - 100) / 100) * 0.10); // 1.00–1.20 (capped at 1.20)
}

function resolveMilitaryAttack(attacker, defender, sentUnits, attackerHeroes = [], defenderHeroes = []) {
  const attackerUpdates = {};
  const defenderUpdates = {};
  // sentUnits: { fighters, rangers, mages, warMachines, ninjas, thieves }
  const sent = {
    fighters:    Math.min(sentUnits.fighters    || 0, attacker.fighters    || 0),
    rangers:     Math.min(sentUnits.rangers     || 0, attacker.rangers     || 0),
    mages:       Math.min(sentUnits.mages       || 0, attacker.mages       || 0),
    warMachines: Math.min(sentUnits.warMachines || 0, attacker.war_machines|| 0),
    ninjas:      Math.min(sentUnits.ninjas      || 0, attacker.ninjas      || 0),
    thieves:     Math.min(sentUnits.thieves     || 0, attacker.thieves     || 0),
  };
  if (sent.fighters <= 0 && sent.rangers <= 0 && sent.mages <= 0)
    return { error: 'Send at least some troops' };

  // ── Anti-bully penalty ────────────────────────────────────────────────────
  const landRatio    = (attacker.land || 1) / Math.max(1, defender.land || 1);
  const fighterRatio = (attacker.fighters || 1) / Math.max(1, defender.fighters || 1);
  const bullyRatio   = Math.max(landRatio, fighterRatio * 0.5);
  let bullyPenalty   = 1.0;
  let bullyMsg       = null;
  let shameEvent     = null;
  if (bullyRatio >= 8) {
    bullyPenalty = 0.40;
    bullyMsg     = '⚠️ Your kingdom is disgraced attacking such a weak foe.';
    shameEvent   = `👑 ${attacker.name} has attacked the much weaker ${defender.name}. The world watches in disgust.`;
  } else if (bullyRatio >= 4) {
    bullyPenalty = 0.60;
    bullyMsg     = '⚠️ Morale suffers — this is slaughter, not war.';
  } else if (bullyRatio >= 2) {
    bullyPenalty = 0.80;
    bullyMsg     = '⚠️ Your troops lack motivation fighting a weaker foe.';
  }

  // ── Morale multipliers ────────────────────────────────────────────────────
  const atkMoraleMult = moraleMult(effectiveMorale(attacker));
  const defMoraleMult = moraleMult(effectiveMorale(defender));

  // ── Research, race and level helpers ──────────────────────────────────────
  const atkFighterLvl = effectiveTroopLevel(attacker, 'fighters') / 50;
  const atkRangerLvl  = effectiveTroopLevel(attacker, 'rangers')  / 50;
  const atkMageLvl    = effectiveTroopLevel(attacker, 'mages')    / 50;
  const atkNinjaLvl   = effectiveTroopLevel(attacker, 'ninjas')   / 50;
  const atkThiefLvl   = effectiveTroopLevel(attacker, 'thieves')  / 50;
  const defFighterLvl = effectiveTroopLevel(defender, 'fighters') / 50;
  const defRangerLvl  = effectiveTroopLevel(defender, 'rangers')  / 50;
  const defMageLvl    = effectiveTroopLevel(defender, 'mages')    / 50;
  const defNinjaLvl   = effectiveTroopLevel(defender, 'ninjas')   / 50;

  // ── Step 1: Thief sabotage — disable some defender war machines ───────────
  let defWmActive = defender.war_machines || 0;
  let thiefSabotage = 0;
  if (sent.thieves > 0) {
    const sabotageChance = Math.min(0.40, sent.thieves * 0.001 * atkThiefLvl * raceBonus(attacker, 'stealth'));
    const disabledWm = Math.floor(defWmActive * sabotageChance);
    defWmActive = Math.max(0, defWmActive - disabledWm);
    thiefSabotage = disabledWm;
  }

  // ── Step 2: Ninja pre-battle strike ───────────────────────────────────────
  let ninjaKills = 0;
  let ninjaIntercepted = 0;
  if (sent.ninjas > 0) {
    const strikeRate  = 0.01 + Math.min(0.03, sent.ninjas * 0.0001 * atkNinjaLvl * raceBonus(attacker, 'stealth'));
    const rawKills    = Math.floor((defender.fighters || 0) * strikeRate);
    // Defender ninjas intercept at 50% effectiveness
    const interceptRate = Math.min(0.50, ((defender.ninjas||0) * 0.001 * defNinjaLvl));
    ninjaIntercepted  = Math.floor(rawKills * interceptRate);
    ninjaKills        = Math.max(0, rawKills - ninjaIntercepted);
  }
  const defFightersAfterNinja = Math.max(0, (defender.fighters || 0) - ninjaKills);

  // ── Step 3: Ranger opening volley ─────────────────────────────────────────
  const rangerVolleyRate = (0.02 + Math.min(0.05, sent.rangers * 0.00005)) * atkRangerLvl * raceBonus(attacker, 'military');
  const rangerKills      = Math.floor(defFightersAfterNinja * rangerVolleyRate);
  const defFightersAfterVolley = Math.max(0, defFightersAfterNinja - rangerKills);

  // ── Step 4: Attack power ──────────────────────────────────────────────────
  const weaponsEquipped   = Math.min(sent.fighters, attacker.weapons_stockpile || 0);
  const weaponBonus       = 1 + (weaponsEquipped / Math.max(sent.fighters, 1)) * 0.25;
  const atkWeapon         = ((attacker.res_weapons || 100) / 100) * weaponBonus;
  const atkTactics        = (attacker.res_military || 100) / 100;
  const atkRaceMil        = raceBonus(attacker, 'military');
  const atkRaceMag        = raceBonus(attacker, 'magic');
  const atkRangerRace     = raceBonus(attacker, 'military'); // rangers share military bonus

  // Fighter power — front line
  const atkFighterPower = sent.fighters * atkWeapon * atkTactics * atkRaceMil * atkFighterLvl;
  // Ranger power — always ranged, lower per-unit than fighters
  const atkRangerPower  = sent.rangers * 0.7 * atkTactics * atkRangerRace * atkRangerLvl;
  // Mage power — back line, high per-unit
  const atkMagePower    = sent.mages * 2.5 * ((attacker.res_attack_magic || 100) / 100) * atkRaceMag * atkMageLvl;
  // War machines — scaled by crew sufficiency
  const engLvl          = effectiveTroopLevel(attacker, 'engineers');
  const atkEngMult      = unitLevelMult(attacker, 'engineers');
  const crewNeeded      = wmCrewRequired(attacker.race, engLvl);
  const engAvail        = Math.max(0, (attacker.engineers || 0));
  const wmCrewable      = Math.min(sent.warMachines, Math.floor(engAvail / crewNeeded));
  const wmPower         = wmCrewable * 500 * ((attacker.res_war_machines || 100) / 100) * raceBonus(attacker, 'war_machines') * atkEngMult;
  
  // Hero power — attacker
  let atkHeroPower = 0;
  attackerHeroes.forEach(h => { atkHeroPower += getHeroPower(h); });

  const atkPowerRaw = (atkFighterPower + atkRangerPower + atkMagePower + wmPower + atkHeroPower) * atkMoraleMult * bullyPenalty;
  const atkPower    = atkPowerRaw;

  // ── Step 5: Defense power ─────────────────────────────────────────────────
  const armorEquipped   = Math.min(defFightersAfterVolley, defender.armor_stockpile || 0);
  const armorBonus      = 1 + (armorEquipped / Math.max(defFightersAfterVolley, 1)) * 0.25;
  const defArmor        = ((defender.res_armor || 100) / 100) * armorBonus;
  const defTactics      = (defender.res_military || 100) / 100;
  const defRaceMil      = raceBonus(defender, 'military');
  const defRaceMag      = raceBonus(defender, 'magic');

  // Fighter wall
  const defFighterPower = defFightersAfterVolley * defArmor * defTactics * defRaceMil * defFighterLvl;
  // Ranger fire from outposts/towers — rangers defend from walls, scaled by structures
  const outpostBonus    = (defender.bld_outposts || 0) * 0.1 + (defender.bld_guard_towers || 0) * 0.05;
  const defRangerPower  = (defender.rangers || 0) * 0.8 * defTactics * raceBonus(defender,'military') * defRangerLvl * Math.max(1, outpostBonus);
  // Mage barrier
  const defMagePower    = (defender.mages||0) * 1.5 * ((defender.res_defense_magic||100)/100) * defRaceMag * defMageLvl;
  // War machine garrison — crewed by engineers at home
  const defEngLvl       = effectiveTroopLevel(defender, 'engineers');
  const defEngMult      = unitLevelMult(defender, 'engineers');
  const defCrewNeeded   = wmCrewRequired(defender.race, defEngLvl);
  const defWmCrewable   = Math.min(defWmActive, Math.floor((defender.engineers||0) / defCrewNeeded));
  const defWmPower      = defWmCrewable * 500 * ((defender.res_war_machines||100)/100) * raceBonus(defender,'war_machines') * defEngMult;
  // Engineer garrison repair bonus
  const defEngBonus     = Math.floor((defender.engineers||0) / 10) * 50 * defEngMult * raceBonus(defender, 'construction');
  // Wall defense power (includes warmachines mounted on walls)
  const defWallPower    = wallDefensePower(defender);
  // Outpost ranger patrol power
  const defOutpostPower = outpostRangerPower(defender);
  // Guard tower detection power (adds to structural defense)
  const defTowerPower   = towerDetectionPower(defender);
  // Structure defense (castles)
  const defStructures   = Math.floor((defender.bld_castles||0) / 500) * 5000;
  // Citadel bonus
  const defCitadelMult = safeJsonParse(defender.defense_upgrades, {}, 'resolveMilitaryAttack:defense_upgrades').citadel ? 1.15 : 1.0;

  // Hero power — defender
  let defHeroPower = 0;
  defenderHeroes.forEach(h => { defHeroPower += getHeroPower(h); });

  const defPower = (defFighterPower + defRangerPower + defMagePower + defWmPower + defEngBonus + defWallPower + defOutpostPower + defTowerPower + defStructures + defHeroPower) * defMoraleMult * defCitadelMult;

  // ── Step 6: Battle resolution ─────────────────────────────────────────────
  const variance = 0.8 + Math.random() * 0.4;
  const win      = (atkPower * variance) > defPower;
  const powerRatio = atkPower / Math.max(1, defPower);

  // ── Step 7: Casualties ────────────────────────────────────────────────────
  // Clerics reduce own-side losses
  const atkClericHeal = Math.min(0.35, (attacker.clerics||0) / Math.max(sent.fighters+sent.rangers, 1) * 0.08 * raceBonus(attacker,'magic'));
  const defClericHeal = Math.min(0.35, (defender.clerics||0) / Math.max(defender.fighters||1, 1)       * 0.08 * raceBonus(defender,'magic'));

  // Dark Elf stealth reduces attacker losses
  const atkStealthBonus = raceBonus(attacker, 'stealth') > 1 ? 0.85 : 1.0;

  const atkFighterLossPct = win ? (0.04 + Math.random()*0.08) : (0.20 + Math.random()*0.25);
  const atkRangerLossPct  = win ? (0.02 + Math.random()*0.04) : (0.10 + Math.random()*0.12); // ranged = safer
  const atkMageLossPct    = win ? (0.01 + Math.random()*0.03) : (0.05 + Math.random()*0.08); // back line = safest
  const defFighterLossPct = win ? (0.15 + Math.random()*0.20) : (0.05 + Math.random()*0.08);

  const atkFightersLost = Math.floor(sent.fighters * atkFighterLossPct * atkStealthBonus * (1 - atkClericHeal));
  const atkRangersLost  = Math.floor(sent.rangers  * atkRangerLossPct  * atkStealthBonus * (1 - atkClericHeal));
  const atkMagesLost    = Math.floor(sent.mages     * atkMageLossPct   * atkStealthBonus);
  const atkNinjasLost   = sent.ninjas > 0 ? Math.floor(sent.ninjas * (win ? 0.05 : 0.15)) : 0;
  const defFightersLost = Math.floor(defFightersAfterVolley * defFighterLossPct * (1 - defClericHeal));

  // War machine destruction — low rates
  const atkWmLost = win ? 0 : Math.floor(sent.warMachines * (0.02 + Math.random()*0.06));
  const defWmLost = win ? Math.floor(defWmActive * (0.03 + Math.random()*0.07)) : 0;

  // Land transfer
  const landTransferred = win ? Math.floor(defender.land * 0.10) : 0;

  // Warmachine damage — walls take damage on win, no walls = building damage
  const warmachineUpdates = applyWarmachineDamage(attacker, defender, win);
  Object.assign(defenderUpdates, warmachineUpdates);
  if (win && warmachineUpdates.bld_walls !== undefined) {
    const wallsLost = (defender.bld_walls||0) - warmachineUpdates.bld_walls;
    if (wallsLost > 0) report.wallsDestroyed = wallsLost;
  }
  if (win && !defender.bld_walls) {
    const dmgCol = Object.keys(warmachineUpdates)[0];
    if (dmgCol) report.buildingDamaged = dmgCol.replace('bld_','').replace(/_/g,' ');
  }

  // ── Step 8: Morale changes & Discovery ───────────────────────────────────
  const victoryMargin = Math.min(2.0, Math.max(0.1, powerRatio));
  let atkMoraleChange, defMoraleChange;
  if (win) {
    atkMoraleChange = Math.floor(5  + Math.min(10, victoryMargin * 5));
    defMoraleChange = -Math.max(5, Math.floor(Math.min(20, victoryMargin * 10)));
    // Bully shame — attacker loses morale too at high ratios
    if (bullyRatio >= 8)  atkMoraleChange -= 15;
    if (bullyRatio >= 4)  atkMoraleChange -= 5;
  } else {
    atkMoraleChange = -Math.floor(5 + Math.min(15, (1/Math.max(0.1,powerRatio)) * 8));
    defMoraleChange = Math.floor(5 + Math.min(10, (1/Math.max(0.1,powerRatio)) * 5));
  }
  const MORALE_FLOOR = 20;
  const newAtkMorale = Math.max(MORALE_FLOOR, Math.min(200, (attacker.morale||100) + atkMoraleChange));
  const newDefMorale = Math.max(MORALE_FLOOR, Math.min(200, (defender.morale||100) + defMoraleChange));

  // The attacker is always discovered by the defender (map drop)
  const defDisc = safeJsonParse(defender.discovered_kingdoms, {}, 'resolveMilitaryAttack:defender_discovered_kingdoms');
  defDisc[attacker.id] = { found: true, mapped: true }; // Attackers leave maps
  defenderUpdates.discovered_kingdoms = JSON.stringify(defDisc);

  // If attacker wins, chance to find a map on a corpse
  if (win) {
    const baseChance = 0.04;
    const raceBonus = (attacker.race === 'orc' || attacker.race === 'dire_wolf') ? 1.5 : 1.0;
    if (Math.random() < (baseChance * raceBonus)) {
      const atkDisc = safeJsonParse(attacker.discovered_kingdoms, {}, 'resolveMilitaryAttack:attacker_discovered_kingdoms');
      // In a real scenario we'd pick a random kingdom from defender's mapped list
      // For now, let's just make sure they mapped the defender if they didn't already
      if (!atkDisc[defender.id] || !atkDisc[defender.id].mapped) {
        atkDisc[defender.id] = { found: true, mapped: true };
        attackerUpdates.discovered_kingdoms = JSON.stringify(atkDisc);
        attackerUpdates.maps = (attacker.maps || 0) + 1;
        atkLines.push(`🗺️ You found a map of ${defender.name} on a fallen soldier's corpse.`);
      }
    }
  }

  // Increment defender maps if they don't have one to the attacker or just as a bonus?
  // User says: "Anytime you are attacked, the attacker leaves behind a map with their location on it."
  // This implies the 'maps' resource should increment.
  defenderUpdates.maps = (defender.maps || 0) + 1;

  // ── Build updates ─────────────────────────────────────────────────────────
  Object.assign(attackerUpdates, {
    fighters:          Math.max(0, attacker.fighters - atkFightersLost),
    rangers:           Math.max(0, attacker.rangers  - atkRangersLost),
    mages:             Math.max(0, attacker.mages    - atkMagesLost),
    ninjas:            Math.max(0, attacker.ninjas   - atkNinjasLost),
    war_machines:      Math.max(0, (attacker.war_machines||0) - atkWmLost),
    land:              attacker.land + landTransferred,
    morale:            newAtkMorale,
    weapons_stockpile: Math.max(0, (attacker.weapons_stockpile||0) - Math.floor(weaponsEquipped * atkFighterLossPct)),
  });
  Object.assign(defenderUpdates, {
    fighters:     Math.max(0, defender.fighters - defFightersLost - ninjaKills - rangerKills),
    war_machines: Math.max(0, (defender.war_machines||0) - defWmLost),
    land:         Math.max(0, defender.land - landTransferred),
    morale:       newDefMorale,
  });

  // XP
  const atkTroopXpF = awardTroopXp(attacker, 'fighters', win ? 30 : 10);
  const atkTroopXpR = awardTroopXp({ ...attacker, troop_levels: atkTroopXpF.troop_levels }, 'rangers', win ? 20 : 8);
  const defTroopXp  = awardTroopXp(defender, 'fighters', win ? 10 : 20);
  attackerUpdates.troop_levels = atkTroopXpR.troop_levels;
  defenderUpdates.troop_levels = defTroopXp.troop_levels;

  const atkXp = awardXp(attacker, win ? 'combat_win' : 'combat_loss', 1);
  const defXp = awardXp(defender, win ? 'combat_loss' : 'combat_win', 1);
  attackerUpdates.xp    = atkXp.xp;
  attackerUpdates.level = atkXp.level;
  defenderUpdates.xp    = defXp.xp;
  defenderUpdates.level = defXp.level;

  // ── Battle report ─────────────────────────────────────────────────────────
  const report = {
    win, landTransferred, powerRatio: Math.round(powerRatio * 100) / 100,
    atkPower: Math.round(atkPower), defPower: Math.round(defPower),
    sent, atkFightersLost, atkRangersLost, atkMagesLost, atkNinjasLost, atkWmLost,
    defFightersLost: defFightersLost + ninjaKills + rangerKills, defWmLost,
    ninjaKills, rangerKills, thiefSabotage,
    atkMoraleChange, defMoraleChange,
    bullyMsg, shameEvent,
  };

  // ── Event messages ────────────────────────────────────────────────────────
  const atkLines = [];
  if (ninjaKills > 0)    atkLines.push(`Ninjas eliminated ${ninjaKills} defenders before the battle.`);
  if (rangerKills > 0)   atkLines.push(`Rangers volley killed ${rangerKills} defenders.`);
  if (thiefSabotage > 0) atkLines.push(`Thieves disabled ${thiefSabotage} enemy war machines.`);
  if (bullyMsg)          atkLines.push(bullyMsg);

  const atkEvent = win
    ? `⚔️ You attacked ${defender.name} and won! Captured ${landTransferred} acres. Lost ${atkFightersLost} fighters, ${atkRangersLost} rangers, ${atkMagesLost} mages. ${atkLines.join(' ')}`
    : `⚔️ Attack on ${defender.name} was repelled. Lost ${atkFightersLost} fighters, ${atkRangersLost} rangers. ${atkLines.join(' ')}`;

  const defEvent = win
    ? `⚔️ ${attacker.name} attacked and broke through! Lost ${landTransferred} acres. ${defFightersLost + ninjaKills + rangerKills} defenders fell.`
    : `⚔️ ${attacker.name} attacked but was repelled. You lost ${defFightersLost} fighters defending.${ninjaKills > 0 ? ` ${ninjaKills} fighters were killed in a pre-battle ninja strike.` : ''}`;

  return { win, report, attackerUpdates, defenderUpdates, atkEvent, defEvent, shameEvent };
}

// ── Orc Trade Route Raiding ──────────────────────────────────────────────
function raidTradeRoute(attacker, defender, unitCount) {
  if (attacker.race !== 'orc') return { error: 'Only Orcs can raid trade routes' };
  const currentAttackerThieves = attacker.thieves || 0;
  if (currentAttackerThieves < 500) return { error: 'Need at least 500 thieves to raid trade routes' };
  const defenderTradeRoutes = defender.trade_routes || 0;
  if (defenderTradeRoutes < 1) return { error: 'Target has no trade routes to raid' };

  const atkLvl = unitLevelMult(attacker, 'thieves');
  const defLvl = unitLevelMult(defender, 'thieves');
  const successChance = 0.4 + (atkLvl - defLvl) * 0.2;
  const roll = Math.random();

  if (roll < successChance) {
    const raided = Math.min(defenderTradeRoutes, Math.floor(unitCount / 500));
    const loot   = raided * 5000;
    const losses = Math.floor(unitCount * 0.05);

    return {
      success: true,
      looted: loot,
      raidedRoutes: raided,
      attackerUpdates: {
        gold: (attacker.gold || 0) + loot,
        thieves: Math.max(0, (attacker.thieves || 0) - losses)
      },
      defenderUpdates: {
        trade_routes: Math.max(0, (defender.trade_routes || 0) - raided)
      },
      atkEvent: `🏴‍☠️ SUCCESS: You raided ${raided} trade routes of ${defender.name} and looted ${loot.toLocaleString()} gold! (Losses: ${losses} thieves)`,
      defEvent: `🛶 RAIDED: ${attacker.name}'s Orcs raided your trade routes! You lost ${raided} routes and ${loot.toLocaleString()} gold was stolen!`
    };
  } else {
    const losses = Math.floor(unitCount * 0.15);
    return {
      success: false,
      attackerUpdates: {
        thieves: Math.max(0, (attacker.thieves || 0) - losses)
      },
      atkEvent: `💀 FAILURE: Your raid on ${defender.name}'s trade routes failed. You lost ${losses} thieves in the ambush.`,
      defEvent: `🛡️ Your guards repelled an Orc raid from ${attacker.name} on your trade routes!`
    };
  }
}

// ── Prestige System ──────────────────────────────────────────────────────
function canPrestige(k) {
  return (k.level || 0) >= 50; // Prestige at Level 50
}

function processPrestige(k) {
  if (!canPrestige(k)) return { error: 'Kingdom level 50 required for Prestige' };

  const currentLevel = k.prestige_level || 0;
  const nextLevel    = currentLevel + 1;

  // New Kingdom defaults
  return {
    prestige_level: nextLevel,
    level: 1,
    xp: 0,
    gold: 50000 * nextLevel, // Bonus starting gold
    land: 500,
    population: 5000,
    food: 25000,
    mana: 1000,
    fighters: 0,
    rangers: 0,
    clerics: 0,
    mages: 0,
    thieves: 0,
    war_machines: 0,
    bld_farms: 5,
    bld_barracks: 2,
    bld_schools: 1,
    bld_housing: 100,
    build_queue: '{}',
    build_progress: '{}',
    research_progress: '{}',
    trade_routes: 0,
    training_allocation: '{}',
    smithy_allocation: '{}',
    mage_tower_allocation: '{}',
    shrine_allocation: '{}'
  };
}

// ── Magic ─────────────────────────────────────────────────────────────────────

// Scroll crafting requirements: { mages needed, turns to complete }
function castSpell(caster, target, spellId, obscure) {
  const def = SPELL_DEFS[spellId];
  if (!def) return { error: 'Unknown spell' };
  if ((caster.res_spellbook || 0) < def.minSB)
    return { error: `Spellbook too low — need ${def.minSB}, have ${caster.res_spellbook}` };

  // Scroll check — must have a crafted scroll to cast
  let scrolls = {};
  try { scrolls = JSON.parse(caster.scrolls || '{}'); } catch {}
  if ((scrolls[spellId] || 0) < 1)
    return { error: `No ${spellId.replace(/_/g,' ')} scroll in your library — craft one first` };

  // Mana cost: base cost scales with tier
  const TIER_MANA = { 1: 500, 2: 2000, 3: 8000, 4: 50000 };
  const baseMana   = TIER_MANA[def.tier] || 500;
  const obscureCost = obscure ? Math.floor(baseMana * 0.5) : 0;
  const totalMana   = baseMana + obscureCost;
  if ((caster.mana || 0) < totalMana)
    return { error: `Not enough mana — need ${totalMana.toLocaleString()}, have ${(caster.mana||0).toLocaleString()}` };

  // Consume scroll and mana
  scrolls[spellId] = (scrolls[spellId] || 0) - 1;
  if (scrolls[spellId] <= 0) delete scrolls[spellId];
  const casterUpdates = {
    mana:    caster.mana - totalMana,
    scrolls: JSON.stringify(scrolls),
  };

  // Attack/defense magic modifiers
  const atkMagic = ((caster.res_attack_magic || 100) / 100) * raceBonus(caster, 'magic');
  const defMagic = ((target.res_defense_magic || 100) / 100) * raceBonus(target, 'magic');
  const magicRatio = Math.max(0.2, atkMagic / Math.max(0.5, defMagic));

  // Check shield active effect on target
  let targetEffects = {};
  try { targetEffects = JSON.parse(target.active_effects || '{}'); } catch {}
  const shielded = (targetEffects.shield ? 0.5 : 1.0) * getMasonSigilResist(target);

  const targetUpdates = {};
  let damageDesc = '';
  let activeEffect = null; // { key, turns_left, ...data } to apply to target

  // ── Friendly spells (target = caster) ────────────────────────────────────
  if (def.effect === 'friendly') {
    if (spellId === 'mend') {
      // Restore 10% of fighters (simulates healing recent casualties)
      const healed = Math.floor((caster.fighters || 0) * 0.10 * magicRatio);
      casterUpdates.fighters = (caster.fighters || 0) + healed;
      damageDesc = `${healed.toLocaleString()} fighters restored`;
    } else if (spellId === 'dispel') {
      // Clear all active debuffs from caster
      let effects = {};
      try { effects = JSON.parse(caster.active_effects || '{}'); } catch {}
      const debuffs = ['fog_of_war','blight','silence','plague'];
      let cleared = 0;
      debuffs.forEach(d => { if (effects[d]) { delete effects[d]; cleared++; } });
      casterUpdates.active_effects = JSON.stringify(effects);
      damageDesc = cleared > 0 ? `${cleared} active curse${cleared > 1 ? 's' : ''} dispelled` : 'no active curses to dispel';
    } else if (spellId === 'bless') {
      const natCap = naturalMoraleCap(caster);
      const moraleGain = Math.floor(natCap * 0.10 * magicRatio);
      casterUpdates.morale = Math.min(natCap * 2, (caster.morale || 100) + moraleGain);
      // Apply bless buff for 5 turns
      let effects = {};
      try { effects = JSON.parse(caster.active_effects || '{}'); } catch {}
      effects.bless = { turns_left: def.duration || 5, morale_bonus: moraleGain };
      casterUpdates.active_effects = JSON.stringify(effects);
      damageDesc = `+${moraleGain} morale and pop growth boosted for ${def.duration||5} turns`;
    } else if (spellId === 'shield') {
      let effects = {};
      try { effects = JSON.parse(caster.active_effects || '{}'); } catch {}
      effects.shield = { turns_left: def.duration || 5 };
      casterUpdates.active_effects = JSON.stringify(effects);
      damageDesc = `magic shield active for ${def.duration||5} turns — incoming spell damage halved`;
    }
    return {
      casterUpdates,
      targetUpdates: {},
      report: { spellId, friendly: true, damageDesc, manaCost: totalMana, obscure },
      casterEvent: `✨ Cast ${spellId.replace(/_/g,' ')} — ${damageDesc}.`,
    };
  }

  // ── Offensive / debuff spells ─────────────────────────────────────────────

  if (spellId === 'spark') {
    // Burns a small number of farms
    const farmsLost = Math.max(1, Math.floor(5 * magicRatio * shielded));
    targetUpdates.bld_farms = Math.max(0, (target.bld_farms || 0) - farmsLost);
    damageDesc = `${farmsLost} farm${farmsLost > 1 ? 's' : ''} burned`;

  } else if (spellId === 'rain') {
    // Floods more farms than Spark
    const farmsLost = Math.max(1, Math.floor(20 * magicRatio * shielded));
    targetUpdates.bld_farms = Math.max(0, (target.bld_farms || 0) - farmsLost);
    damageDesc = `${farmsLost} farm${farmsLost > 1 ? 's' : ''} flooded`;

  } else if (spellId === 'fog_of_war') {
    // Debuff: blinds rangers for duration turns
    activeEffect = { turns_left: def.duration || 3, type: 'fog_of_war' };
    damageDesc = `rangers blinded for ${def.duration||3} turns`;

  } else if (spellId === 'blight') {
    // Debuff: poison food supply for duration turns
    const foodDamage = Math.floor(500 * magicRatio * shielded);
    activeEffect = { turns_left: def.duration || 5, type: 'blight', damage: foodDamage };
    damageDesc = `food supply poisoned for ${def.duration||5} turns (-${foodDamage.toLocaleString()} food/turn)`;

  } else if (spellId === 'lightning') {
    // Kills enemy fighters
    const fightersLost = Math.max(1, Math.floor((target.fighters || 0) * 0.05 * magicRatio * shielded));
    targetUpdates.fighters = Math.max(0, (target.fighters || 0) - fightersLost);
    damageDesc = `${fightersLost.toLocaleString()} fighters struck down`;

  } else if (spellId === 'silence') {
    // Debuff: suppresses research for duration turns
    activeEffect = { turns_left: def.duration || 3, type: 'silence' };
    damageDesc = `research suppressed for ${def.duration||3} turns`;

  } else if (spellId === 'amnesia') {
    // Permanently wipes economy research
    const resLost = Math.max(1, Math.floor(15 * magicRatio * shielded));
    targetUpdates.res_economy = Math.max(0, (target.res_economy || 0) - resLost);
    damageDesc = `economy research reduced by ${resLost}%`;

  } else if (spellId === 'drain') {
    // Siphons mana from target to caster
    const manaDrained = Math.max(10, Math.floor((target.mana || 0) * 0.15 * magicRatio * shielded));
    targetUpdates.mana = Math.max(0, (target.mana || 0) - manaDrained);
    casterUpdates.mana = (casterUpdates.mana || caster.mana - totalMana) + manaDrained;
    damageDesc = `${manaDrained.toLocaleString()} mana drained`;

  } else if (spellId === 'plague') {
    // Debuff: kills population each turn for duration
    activeEffect = { turns_left: def.duration || 5, type: 'plague' };
    damageDesc = `plague spreading — population will die each turn for ${def.duration||5} turns`;

  } else if (spellId === 'earthquake') {
    // Destroys buildings across all types
    const dmg = Math.max(1, Math.floor(8 * magicRatio * shielded));
    targetUpdates.bld_farms       = Math.max(0, (target.bld_farms       || 0) - Math.floor(dmg * 1.5));
    targetUpdates.bld_barracks    = Math.max(0, (target.bld_barracks    || 0) - dmg);
    targetUpdates.bld_guard_towers= Math.max(0, (target.bld_guard_towers|| 0) - dmg);
    targetUpdates.bld_markets     = Math.max(0, (target.bld_markets     || 0) - Math.floor(dmg * 0.5));
    targetUpdates.bld_castles     = Math.max(0, (target.bld_castles     || 0) - Math.floor(dmg * 0.1));
    damageDesc = `buildings destroyed across the kingdom (farms, barracks, towers)`;

  } else if (spellId === 'tempest') {
    // Kills all troop types
    const troopKill = Math.max(1, Math.floor((target.fighters || 0) * 0.08 * magicRatio * shielded));
    const rangerKill = Math.max(0, Math.floor((target.rangers || 0) * 0.06 * magicRatio * shielded));
    const clericKill = Math.max(0, Math.floor((target.clerics || 0) * 0.06 * magicRatio * shielded));
    targetUpdates.fighters = Math.max(0, (target.fighters || 0) - troopKill);
    targetUpdates.rangers  = Math.max(0, (target.rangers  || 0) - rangerKill);
    targetUpdates.clerics  = Math.max(0, (target.clerics  || 0) - clericKill);
    damageDesc = `${troopKill.toLocaleString()} fighters, ${rangerKill.toLocaleString()} rangers, ${clericKill.toLocaleString()} clerics killed`;

  } else if (spellId === 'armageddon') {
    // Catastrophic — land, buildings, population
    const landLost  = Math.floor((target.land || 0) * 0.20 * magicRatio * shielded);
    const popLost   = Math.floor((target.population || 0) * 0.25 * magicRatio * shielded);
    const farmLost  = Math.floor((target.bld_farms || 0) * 0.30 * magicRatio * shielded);
    const fightLost = Math.floor((target.fighters || 0) * 0.20 * magicRatio * shielded);
    targetUpdates.land       = Math.max(0, (target.land       || 0) - landLost);
    targetUpdates.population = Math.max(0, (target.population || 0) - popLost);
    targetUpdates.bld_farms  = Math.max(0, (target.bld_farms  || 0) - farmLost);
    targetUpdates.fighters   = Math.max(0, (target.fighters   || 0) - fightLost);
    damageDesc = `ARMAGEDDON — ${landLost} acres scorched, ${popLost.toLocaleString()} killed, ${farmLost} farms razed, ${fightLost.toLocaleString()} fighters slain`;
  }

  // Apply active effect to target if this is a debuff spell
  if (activeEffect) {
    targetEffects[spellId] = activeEffect;
    targetUpdates.active_effects = JSON.stringify(targetEffects);
  }

  const targetEvent = obscure
    ? `⚡ A mysterious ${spellId.replace(/_/g,' ')} spell struck your kingdom — ${damageDesc}.`
    : `⚡ ${caster.name} cast ${spellId.replace(/_/g,' ')} on your kingdom — ${damageDesc}.`;

  const casterEvent = `✨ You cast ${spellId.replace(/_/g,' ')} on ${target.name}. Effect: ${damageDesc}.`;

  // Discovery logic: Target discovers caster if not obscured
  if (!obscure) {
    let targetDisc = {};
    try { targetDisc = JSON.parse(target.discovered_kingdoms || '{}'); } catch {}
    if (!targetDisc[caster.id]) {
      targetDisc[caster.id] = { found: true };
      targetUpdates.discovered_kingdoms = JSON.stringify(targetDisc);
    }
  }

  return {
    casterUpdates,
    targetUpdates,
    report: { spellId, damageDesc, manaCost: totalMana, obscure, magicRatio: Math.round(magicRatio * 100) },
    casterEvent,
    targetEvent,
  };
}

// ── Covert ops ────────────────────────────────────────────────────────────────

function covertSpy(spy, target, unitsSent) {
  const stealthMulti = raceBonus(spy, 'stealth') * unitLevelMult(spy, 'thieves');
  const success = (spy.thieves + spy.ninjas) * stealthMulti > target.fighters * 0.02 + target.bld_guard_towers * 5;

  if (!success) {
    const caught = Math.floor(unitsSent * 0.3);
    return {
      success: false,
      spyUpdates:    { thieves: spy.thieves - caught },
      targetUpdates: {},
      spyEvent:      `Spy mission on ${target.name} failed — ${caught} thieves caught.`,
      targetEvent:   `${spy.name} attempted to spy on you — caught ${caught} thieves.`,
    };
  }

  function noise(n) { return Math.floor(n * (0.85 + Math.random() * 0.30)); }
  const report = {
    name: target.name, race: target.race,
    land: noise(target.land), fighters: noise(target.fighters),
    mages: noise(target.mages), gold: noise(target.gold),
  };

  // Award thief XP for successful spy
  const tXp = awardTroopXp(spy, 'thieves', 12);
  return {
    success: true, report,
    spyUpdates: { troop_levels: tXp.troop_levels },
    targetUpdates: {},
    spyEvent: `Spy report on ${target.name} retrieved successfully.`,
    targetEvent: null,
  };
}

function covertLoot(thief, target, lootType, thievesSent) {
  if (thievesSent > thief.thieves) return { error: 'Not enough thieves' };
  const thiefLvMult  = unitLevelMult(thief, 'thieves');
  const stealthMulti = raceBonus(thief, 'stealth') * thiefLvMult;
  const success = thief.thieves * stealthMulti > target.fighters * 0.015 + target.bld_guard_towers * 3
                                                                          + target.bld_armories * 10
                                                                          + target.bld_vaults * 10;
  if (!success) {
    return {
      success: false,
      thiefUpdates:  { thieves: thief.thieves - Math.floor(thievesSent * 0.25) },
      targetUpdates: {},
      event: `Loot attempt on ${target.name} failed. Thieves captured.`,
    };
  }

  const targetUpdates = {};
  let stolen = 0, desc = '';

  // Level scales loot amount
  if (lootType === 'gold') {
    stolen = Math.floor(thievesSent * (50 + Math.random() * 50) * thiefLvMult);
    stolen = Math.min(stolen, Math.floor(target.gold * 0.05));
    targetUpdates.gold = target.gold - stolen;
    desc = `${stolen.toLocaleString()} gold`;
  } else if (lootType === 'research') {
    stolen = Math.floor(thievesSent * 0.2 * thiefLvMult);
    targetUpdates.res_economy = Math.max(0, target.res_economy - stolen);
    desc = `${stolen} economy research points`;
  } else if (lootType === 'weapons') {
    stolen = Math.floor(thievesSent * 0.3 * thiefLvMult);
    targetUpdates.res_weapons = Math.max(0, target.res_weapons - stolen);
    desc = `${stolen} weapon research points`;
  } else if (lootType === 'war_machines') {
    stolen = Math.floor(thievesSent * 0.01 * thiefLvMult);
    targetUpdates.war_machines = Math.max(0, target.war_machines - stolen);
    desc = `${stolen} war machine(s)`;
  }

  const tXp = awardTroopXp(thief, 'thieves', 20);
  return {
    success: true, stolen, lootType,
    thiefUpdates:  { troop_levels: tXp.troop_levels },
    targetUpdates,
    thiefEvent:  `Looted ${desc} from ${target.name}.`,
    targetEvent: `Thieves infiltrated your kingdom and stole ${desc}.`,
  };
}

function covertAssassinate(assassin, target, ninjasSent, unitType) {
  if (ninjasSent > assassin.ninjas) return { error: 'Not enough ninjas' };
  const ninjaLvMult  = unitLevelMult(assassin, 'ninjas');
  const stealthMulti = raceBonus(assassin, 'stealth') * ninjaLvMult;
  const success = assassin.ninjas * stealthMulti * 1.2 > target[unitType] * 0.01 + target.bld_guard_towers * 2;

  if (!success) {
    return {
      success: false,
      assassinUpdates: { ninjas: assassin.ninjas - Math.floor(ninjasSent * 0.2) },
      targetUpdates: {},
      event: `Assassination of ${unitType} in ${target.name} failed. Ninjas compromised.`,
    };
  }

  const killed = Math.floor(ninjasSent * (10 + Math.random() * 10) * ninjaLvMult);
  const targetUpdates = { [unitType]: Math.max(0, target[unitType] - killed) };

  // Dark Elf racial bonus: level 5+ ninjas leave no trace
  const darkElfBonus = racialUnitBonus(assassin, 'ninjas');
  const silent = darkElfBonus.silentAssassination;

  const nXp = awardTroopXp(assassin, 'ninjas', 30);
  return {
    success: true, killed, silent,
    assassinUpdates: { troop_levels: nXp.troop_levels },
    targetUpdates,
    assassinEvent: `Assassinated ${killed.toLocaleString()} ${unitType} in ${target.name}.${silent ? ' No trace left.' : ''}`,
    targetEvent:   silent ? null : `${assassin.name}'s ninjas assassinated ${killed.toLocaleString()} of your ${unitType}.`,
  };
}

// ── Alliance pledge defense ───────────────────────────────────────────────────

function resolveAllianceDefense(attackResult, allies) {
  // When a kingdom is attacked, allied kingdoms send pledge % of their fighters
  if (!attackResult.win) return [];
  return allies.map(ally => {
    const sent = Math.floor(ally.fighters * (ally.pledge / 100));
    return { allyId: ally.id, sent };
  });
}

// ── Expedition rewards ──────────────────────────────────────────────────────
function roll(chance) { return Math.random() < chance; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function junkPrize(k, updates) {
  if (!JUNK_PRIZES || JUNK_PRIZES.length === 0) return "a particularly shiny pebble";
  const eventsCollected = safeJsonParse(updates.collected_events || k.collected_events, [], 'junkPrize');
  const lastId = updates.last_event_id || k.last_event_id;

  let available = JUNK_PRIZES.filter(p => p.id !== lastId);
  if (available.length === 0) available = JUNK_PRIZES; // Fallback if 1 event in total
  const ev = available[Math.floor(Math.random() * available.length)];
  
  if (ev) {
    if (!eventsCollected.includes(ev.id)) {
      eventsCollected.push(ev.id);
      updates.collected_events = JSON.stringify(eventsCollected);

      if (eventsCollected.length >= 25) {
        const ach = safeJsonParse(updates.achievements || k.achievements, [], 'junk');
        if (!ach.includes('collector')) {
          ach.push('collector');
          updates.achievements = JSON.stringify(ach);
          updates._achievement_unlocked = 'Collector (Found all random events)';
        }
      }
    }
    updates.last_event_id = ev.id;
    return ev.msg || ev.content || "a mysterious rock";
  }
  return "a strange pebble";
}

function expeditionRewards(type, rangers, fighters, k) {
  const tacBonus = 1 + ((k.res_military || 0) / 2000);

  // Race exploration bonus — affects all reward quantities
  const exploreBonus = {
    dire_wolf: 1.40, dark_elf: 1.25, human: 1.10,
    orc: 1.05, dwarf: 0.90, high_elf: 0.95,
  }[k.race] || 1.0;

  // Ranger level bonus — higher level rangers are better scouts
  const rangerLvBonus = unitLevelMult(k, 'rangers');

  // Attrition reduced for skilled explorer races
  const attritionMult = { dire_wolf: 0.5, dark_elf: 0.6 }[k.race] || 1.0;
  const rewards = [];
  const events  = [];
  const updates = {};

  // Attrition — skilled explorer races lose fewer rangers
  const attritionPct = type === 'dungeon' ? rand(0, 3) : rand(0, 2);
  const lost = Math.floor(rangers * attritionPct / 100 * attritionMult);
  const returned = rangers - lost;
  if (lost > 0) rewards.push({ text: `${lost} ranger${lost > 1 ? 's' : ''} did not return from the expedition` });
  // Rangers returned stored separately so resolveExpeditions can use SQL increment
  updates._rangers_returned = returned;

  const expTurns = EXPEDITION_TURNS[type] || 10;

  // Gold base = forage rate (rangers × 12 × tacBonus) × turns × race bonus × random 5–30% bonus
  const foragePerTurn = rangers * 2 * tacBonus * exploreBonus * rangerLvBonus;
  const randomBonus   = 1 + (rand(5, 30) / 100);
  const goldBase      = Math.floor(foragePerTurn * expTurns * randomBonus);

  if (type === 'scout') {
    rewards.push({ text: `+${goldBase.toLocaleString()} gold from foraging` });
    updates.gold = (k.gold || 0) + goldBase;

    const land = Math.max(1, Math.floor(rand(rangers * 0.01, rangers * 0.03) * exploreBonus));
    rewards.push({ text: `+${land} acre${land > 1 ? 's' : ''} of unclaimed land` });
    updates.land = (k.land || 0) + land;

    if (roll(0.30)) {
      const mana = rand(Math.floor(rangers * 0.2 * exploreBonus), Math.floor(rangers * 0.8 * exploreBonus));
      rewards.push({ text: `+${mana} mana from a hidden shrine` });
      updates.mana = (k.mana || 0) + mana;
    }
    if (roll(0.10)) {
      const troops = rand(2, Math.max(3, Math.floor(rangers * 0.02 * exploreBonus)));
      rewards.push({ text: `${troops} wandering fighter${troops > 1 ? 's' : ''} pledge allegiance to your kingdom` });
      updates.fighters = (k.fighters || 0) + troops;
    }
    if (roll(0.03)) {
      const bonus = rand(Math.floor(rangers * 0.03 * exploreBonus), Math.floor(rangers * 0.08 * exploreBonus));
      rewards.push({ text: `An ancient map reveals ${bonus} additional acres — scouts claim them!` });
      updates.land = (updates.land || k.land || 0) + bonus;
    }
    if (roll(0.45)) rewards.push({ text: `Your rangers also found ${junkPrize(k, updates)}` });

    // Map drop — 5% chance on scout
    if (roll(0.05)) {
      updates.maps = (k.maps || 0) + 1;
      rewards.push({ text: `🗺️ A map was found — you can now interact with other kingdoms` });
    }

    // DISCOVERY: Chance to find another kingdom
    if (roll(calcDiscoveryChance(k))) {
      updates._find_kingdom = true;
    }

  } else if (type === 'deep') {
    rewards.push({ text: `+${goldBase.toLocaleString()} gold from deep wilderness caches` });
    updates.gold = (k.gold || 0) + goldBase;

    const land = Math.max(2, Math.floor(rand(rangers * 0.04, rangers * 0.10) * exploreBonus));
    rewards.push({ text: `+${land} acres of fertile territory` });
    updates.land = (k.land || 0) + land;

    if (roll(0.55)) {
      const mana = rand(Math.floor(rangers * 0.5 * exploreBonus), Math.floor(rangers * 2 * exploreBonus));
      rewards.push({ text: `+${mana} mana from ley lines discovered deep in the wilderness` });
      updates.mana = (k.mana || 0) + mana;
    }
    if (roll(0.25)) {
      const disc = ['res_economy','res_weapons','res_armor','res_military','res_entertainment'][rand(0,4)];
      const boost = rand(1, Math.max(2, Math.floor(5 * exploreBonus)));
      const discLabel = disc.replace('res_','').replace('_',' ');
      rewards.push({ text: `A research scroll found — ${discLabel} +${boost}%` });
      updates[disc] = (k[disc] || 0) + boost;
    }
    if (roll(0.20)) {
      const troops = rand(Math.floor(rangers * 0.03 * exploreBonus), Math.floor(rangers * 0.08 * exploreBonus));
      const ttype = roll(0.5) ? 'fighters' : 'rangers';
      if (troops > 0) {
        rewards.push({ text: `${troops} mercenary ${ttype} join your cause` });
        updates[ttype] = (k[ttype] || 0) + troops;
      }
    }
    if (roll(0.08)) {
      const bonus = rand(Math.floor(rangers * 0.05 * exploreBonus), Math.floor(rangers * 0.15 * exploreBonus));
      rewards.push({ text: `Ruins of an abandoned kingdom found — you claim ${bonus} acres of its former territory` });
      updates.land = (updates.land || k.land || 0) + bonus;
    }
    if (roll(0.02)) {
      const disc = ['res_spellbook','res_attack_magic','res_defense_magic','res_war_machines','res_construction'][rand(0,4)];
      const boost = rand(Math.floor(5 * exploreBonus), Math.floor(15 * exploreBonus));
      const discLabel = disc.replace('res_','').replace('_',' ');
      rewards.push({ text: `⚡ An ancient artifact of ${discLabel} — permanent +${boost}%` });
      updates[disc] = (k[disc] || 0) + boost;
    }

    if (roll(calcDiscoveryChance(k))) {
      updates._find_kingdom = true;
    }
    if (roll(0.60)) rewards.push({ text: `Hidden deep in the wilderness, your rangers also discovered ${junkPrize(k, updates)}` });

    // Map drop — 15% chance on deep
    if (roll(0.15)) {
      updates.maps = (updates.maps || k.maps || 0) + 1;
      rewards.push({ text: `🗺️ A map was discovered in the deep wilderness` });
    }

    if (roll(0.05)) {
      updates._find_world_fragment = true;
    }

  } else if (type === 'dungeon') {
    const power = (rangers + fighters * 2) * tacBonus * exploreBonus;
    const successChance = Math.min(0.90, 0.25 + (power / 24000));
    const success = roll(successChance);

    if (!success) {
      const fLost = Math.min(fighters, rand(Math.floor(fighters * 0.05), Math.floor(fighters * 0.15)));
      const fReturned = fighters - fLost;
      if (fReturned > 0) updates._fighters_returned = fReturned;
      rewards.push({ text: `The dungeon proved too dangerous — ${fLost} fighters lost in retreat` });
      events.push({ type: 'attack', message: `💀 Dungeon raid FAILED — your forces were overwhelmed. ${fLost.toLocaleString()} fighters lost.` });
    } else {
      updates._fighters_returned = fighters;
      
      const dungeonMult = { orc: 2.0, dire_wolf: 1.5, high_elf: 0.5 }[k.race] || 1.0;

      const dungeonGold = Math.floor(fighters * rand(8, 12) * tacBonus * exploreBonus * randomBonus * dungeonMult);
      rewards.push({ text: `+${dungeonGold.toLocaleString()} gold plundered from the dungeon` });
      updates.gold = (k.gold || 0) + dungeonGold;

      const mana = Math.floor(rand(Math.floor(rangers * 1 * exploreBonus), Math.floor(rangers * 4 * exploreBonus)) * dungeonMult);
      rewards.push({ text: `+${mana} mana from dungeon ley stones` });
      updates.mana = (k.mana || 0) + mana;

      const disc = ['res_weapons','res_armor','res_military','res_attack_magic','res_spellbook'][rand(0,4)];
      const boost = Math.floor(rand(3, Math.floor(12 * exploreBonus)) * dungeonMult);
      const discLabel = disc.replace('res_','').replace('_',' ');
      rewards.push({ text: `Dungeon tome found — ${discLabel} permanently +${boost}%` });
      updates[disc] = (k[disc] || 0) + boost;

      if (roll(0.12)) {
        const wm = Math.max(1, Math.floor(rand(1, Math.max(2, Math.floor(fighters / 500 * exploreBonus))) * dungeonMult));
        rewards.push({ text: `⚡ Ancient war machine${wm > 1 ? 's' : ''} recovered from the dungeon depths — +${wm}` });
        updates.war_machines = (k.war_machines || 0) + wm;
      }
      if (roll(0.06)) {
        const boost2 = Math.floor(rand(10, Math.floor(40 * exploreBonus)) * dungeonMult);
        rewards.push({ text: `⚡ The dungeon's heart pulsed with ancient magic — spellbook permanently +${boost2}` });
        updates.res_spellbook = (updates.res_spellbook || k.res_spellbook || 0) + boost2;
      }
      if (roll(0.5)) rewards.push({ text: `Amid the carnage, someone pocketed ${junkPrize(k, updates)}` });

      // Map drop — 25% chance on dungeon
      if (roll(0.25)) {
        updates.maps = (updates.maps || k.maps || 0) + 1;
        rewards.push({ text: `🗺️ A map was found among the dungeon spoils` });
      }
      // Blueprint drop — 20% chance on dungeon
      if (roll(0.20)) {
        const smithyCap = (k.bld_smithies || 0) * 25;
        const curBP = updates.blueprints_stored !== undefined ? updates.blueprints_stored : (k.blueprints_stored || 0);
        if (smithyCap === 0 || curBP < smithyCap) {
          updates.blueprints_stored = curBP + 1;
          rewards.push({ text: `⚙️ A blueprint was recovered from the dungeon depths` });
        }
      }

      if (roll(0.10)) {
        updates._find_world_fragment = true;
      }
    }
  }

  // ── Ultra-rare prizes (deep: 0.5%, dungeon success: 1%) ──────────────────────
  const ultraChance = type === 'dungeon' ? 0.01 : type === 'deep' ? 0.005 : 0;
  if (ultraChance > 0 && roll(ultraChance)) {
    const prize = ULTRA_RARE_PRIZES[Math.floor(Math.random() * ULTRA_RARE_PRIZES.length)];
    prize.effect(k, updates);
    rewards.push({ text: `✨✨✨ ULTRA RARE: ${prize.text}` });
    updates._ultra_rare = prize.id;
  }

  // ── Throne of Nazdreg (0.1% on deep/dungeon, unique forever) ────────────────
  const throneChance = (type === 'deep' || type === 'dungeon') ? 0.001 : 0;
  if (throneChance > 0 && roll(throneChance)) {
    updates._check_throne = true; // resolveExpeditions will check server_state and apply if unclaimed
  }

  return { rewards, updates, events };
}

async function resolveExpeditions(db, k, engine) {
  // Pick up active ones AND stuck ones (turns_left=0 but no rewards yet)
  const exps = await db.all('SELECT * FROM expeditions WHERE kingdom_id = ? AND (turns_left > 0 OR (turns_left = 0 AND rewards IS NULL))', [k.id]);
  console.log(`[expedition] kingdom=${k.id} active/stuck: ${exps.map(e => `${e.type}(${e.turns_left}t)`).join(', ') || 'none'}`);
  const expeditionEvents = [];
  for (const exp of exps) {
    if (exp.turns_left > 0) {
      // Fetch fresh k for racial bonus check
      const freshKCheck = await db.get('SELECT race, troop_levels FROM kingdoms WHERE id = ?', [k.id]) || k;
      const direWolfBonus = racialUnitBonus(freshKCheck, 'rangers');
      const tickDown = direWolfBonus.earlyReturn ? 2 : 1;
      const newTurns = Math.max(0, exp.turns_left - tickDown);
      console.log(`[expedition] kingdom=${k.id} id=${exp.id} type=${exp.type} turns_left=${exp.turns_left} → ${newTurns}`);

      if (newTurns > 0) {
        await db.run('UPDATE expeditions SET turns_left = ? WHERE id = ?', [newTurns, exp.id]);
        continue;
      }
      // newTurns <= 0 means this expedition completes now
      console.log(`[expedition] COMPLETING kingdom=${k.id} id=${exp.id} type=${exp.type}`);

      // Mark expedition complete FIRST so it can never get stuck at turns_left=1
      await db.run('UPDATE expeditions SET turns_left = 0 WHERE id = ?', [exp.id]);
    } else {
      console.log(`[expedition] RETRYING completion for kingdom=${k.id} id=${exp.id} type=${exp.type}`);
    }

    try {
      // Fetch fresh kingdom state to avoid stale merged values
      const freshK = await db.get('SELECT * FROM kingdoms WHERE id = ?', [k.id]) || k;
      const { rewards, updates, events } = expeditionRewards(exp.type, exp.rangers, exp.fighters, freshK, db);

      // ── Throne of Nazdreg check ──────────────────────────────────────────────
      if (updates._check_throne) {
        delete updates._check_throne;
        const throneState = await db.get("SELECT value FROM server_state WHERE key = 'throne_found'");
        if (!throneState || throneState.value !== '1') {
          THRONE_OF_NAZDREG.effect(freshK, updates);
          await db.run("INSERT OR REPLACE INTO server_state (key, value) VALUES ('throne_found', '1')");
          rewards.unshift({ text: THRONE_OF_NAZDREG.text });
          events.push({ type: 'system', message: `👑 ${freshK.name} has found the Throne of Nazdreg Grishnak. May his memory endure forever.` });
          updates._server_announce = `👑 The Throne of Nazdreg Grishnak has been found by ${freshK.name}. His name is remembered.`;
        }
      }

      if (updates._find_kingdom) {
        delete updates._find_kingdom;
        const other = await db.get('SELECT id, name FROM kingdoms WHERE id != ? ORDER BY RANDOM() LIMIT 1', [freshK.id]);
        if (other) {
          let disc = {};
          try { disc = JSON.parse(freshK.discovered_kingdoms || '{}'); } catch {}
          if (!disc[other.id]) {
            disc[other.id] = { found: true, name: other.name };
            updates.discovered_kingdoms = JSON.stringify(disc);
            rewards.push({ text: `🔭 Your rangers discovered the kingdom of ${other.name}!` });
          }
        }
      }

      if (updates._find_world_fragment) {
        delete updates._find_world_fragment;
        let frags = [];
        try { frags = JSON.parse(freshK.world_fragments || '[]'); } catch {}
        const frag = WORLD_FRAGMENTS[Math.floor(Math.random() * WORLD_FRAGMENTS.length)];
        frags.push(frag);
        updates.world_fragments = JSON.stringify(frags);
        rewards.push({ text: `🔮 Your rangers recovered a World Fragment: ${frag}` });
        events.push({ type: 'system', message: `🔮 A World Fragment (${frag}) was discovered during the expedition.` });
      }

      const serverAnnounce = updates._server_announce || null;
      delete updates._server_announce;
      delete updates._ultra_rare;

      const label = { scout: '🔭 Scout', deep: '🌲 Deep', dungeon: '⚔️ Dungeon' }[exp.type];

      // Apply kingdom updates
      const rangersReturned  = updates._rangers_returned  !== undefined ? updates._rangers_returned  : 0;
      const fightersReturned = updates._fighters_returned !== undefined ? updates._fighters_returned : 0;
      delete updates._rangers_returned;
      delete updates._fighters_returned;

      const VALID_KINGDOM_COLS = new Set([
        'gold','mana','land','population','morale','food',
        'fighters','rangers','clerics','mages','thieves','ninjas','researchers','engineers',
        'war_machines','weapons_stockpile','armor_stockpile',
        'res_economy','res_weapons','res_armor','res_military','res_attack_magic',
        'res_defense_magic','res_entertainment','res_construction','res_war_machines','res_spellbook',
        'bld_farms','bld_barracks','bld_markets','bld_mage_towers','blueprints_stored','maps',
        'troop_levels','xp','level','discovered_kingdoms','world_fragments',
        'collected_events', 'last_event_id', 'achievements'
      ]);

      // Award XP
      const expXpAmount = { scout: 8, deep: 20, dungeon: 40 }[exp.type] || 8;
      const rXp = awardTroopXp(freshK, 'rangers', expXpAmount * exp.rangers);
      updates.troop_levels = rXp.troop_levels;
      if (exp.type === 'dungeon' && exp.fighters > 0) {
        const fXp = awardTroopXp({ ...freshK, troop_levels: updates.troop_levels }, 'fighters', 40 * exp.fighters);
        updates.troop_levels = fXp.troop_levels;
      }

      if (updates._achievement_unlocked) {
        rewards.push({ text: '🏆 ACHIEVEMENT UNLOCKED: ' + updates._achievement_unlocked });
        events.push({ type: 'system', message: '🏆 ACHIEVEMENT UNLOCKED: ' + updates._achievement_unlocked });
        delete updates._achievement_unlocked;
      }

      const safeUpdates = Object.fromEntries(
        Object.entries(updates).filter(([k2, v]) => VALID_KINGDOM_COLS.has(k2) && v !== undefined && v !== null)
      );
      if (Object.keys(safeUpdates).length > 0) {
        const cols = Object.keys(safeUpdates).map(c => `${c} = ?`).join(', ');
        await db.run(`UPDATE kingdoms SET ${cols} WHERE id = ?`, [...Object.values(safeUpdates), k.id]);
      }
      if (rangersReturned  > 0) await db.run('UPDATE kingdoms SET rangers  = rangers  + ? WHERE id = ?', [rangersReturned,  k.id]);
      if (fightersReturned > 0) await db.run('UPDATE kingdoms SET fighters = fighters + ? WHERE id = ?', [fightersReturned, k.id]);

      // ONE news line only — rewards go to expedition log, not news feed
      const completionMsg = `${label} expedition returned — check the Explore tab for rewards.`;
      expeditionEvents.push({ type: 'system', message: completionMsg });

      // Throne broadcast only
      if (serverAnnounce) {
        const allKingdoms = await db.all('SELECT id FROM kingdoms');
        for (const ak of allKingdoms) {
          await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?, ?, ?, ?)',
            [ak.id, 'system', serverAnnounce, k.turn || 0]);
        }
        if (engine.io) engine.io.emit('chat:system', { message: serverAnnounce, ts: Date.now() });
      }



      // Save rewards to expedition row for log display
      const rewardJson = JSON.stringify(rewards.map(r => r.text));
      await db.run('UPDATE expeditions SET rewards = ? WHERE id = ?', [rewardJson, exp.id]);
      console.log(`[expedition] completed kingdom=${k.id} type=${exp.type} rewards=${rewards.length}`);

    } catch (err) {
      // Rewards failed — expedition is already marked complete (turns_left=0), troops return, no reward
      console.error(`[expedition] reward error kingdom=${k.id} id=${exp.id} type=${exp.type}:`, err.message, err.stack);
      // Still return troops so they're not lost
      await db.run('UPDATE kingdoms SET rangers = rangers + ? WHERE id = ?', [exp.rangers, k.id]);
      if (exp.fighters > 0) await db.run('UPDATE kingdoms SET fighters = fighters + ? WHERE id = ?', [exp.fighters, k.id]);
      const errMsg = `${exp.type} expedition returned — an error occurred calculating rewards (troops returned safely).`;
      await db.run('UPDATE expeditions SET rewards = ? WHERE id = ?', [JSON.stringify([errMsg]), exp.id]);
      await db.run('INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?, ?, ?, ?)',
        [k.id, 'system', errMsg, k.turn || 0]);
      expeditionEvents.push({ type: 'system', message: errMsg });
    }
  }
  return expeditionEvents;
}

// ── Mage Tower — scroll crafting and mana production ──────────────────────────
function processMageTower(k, events) {
  const updates = {};
  const towers = k.bld_mage_towers || 0;
  if (towers === 0) return updates;

  let alloc = {};
  try { alloc = JSON.parse(k.mage_tower_allocation || '{}'); } catch { alloc = {}; }
  let progress = {};
  try { progress = JSON.parse(k.tower_progress || '{}'); } catch { progress = {}; }
  let scrolls = {};
  try { scrolls = JSON.parse(k.scrolls || '{}'); } catch { scrolls = {}; }

  // Fallback for old schema
  if (alloc.scroll_craft) {
     alloc[alloc.scroll_craft] = alloc.scroll_target || 999;
     delete alloc.scroll_craft;
     delete alloc.scroll_target;
  }

  const capacity = towers * 20;
  const effectiveMages = Math.min(k.mages || 0, capacity);
  const mageLvlMult = unitLevelMult(k, 'mages');
  const raceMagic = raceBonus(k, 'magic');

  let towerUpgrades = {};
  try { towerUpgrades = JSON.parse(k.tower_upgrades || '{}'); } catch {}
  const towerSpeedMult = towerUpgrades.ley_line_tap ? 1.25 : 1.0;

  let activeTasks = Object.keys(alloc).filter(t => alloc[t] > 0 && SCROLL_REQUIREMENTS[t]);

  if (effectiveMages > 0 && activeTasks.length > 0) {
    let magesPerTask = effectiveMages / activeTasks.length;
    let completedAny = false;

    activeTasks.forEach(task => {
      const req = SCROLL_REQUIREMENTS[task];
      const effective = Math.min(magesPerTask, req.mages);
      const progKey = 'scroll_' + task;
      const workDone = (effective >= req.mages ? 1 : effective / req.mages) * mageLvlMult * towerSpeedMult * raceMagic;
      const newProg = (progress[progKey] || 0) + workDone;

      if (newProg >= req.turns) {
         if (task !== 'blank_scroll') {
           if ((scrolls.blank_scroll || 0) < 1) {
             progress[progKey] = Math.min(newProg, req.turns - 0.01);
             return; // stall
           }
           scrolls.blank_scroll -= 1;
         }
         progress[progKey] = 0;
         const helfBonus = racialUnitBonus(k, 'mages');
         const scrollsProduced = helfBonus.doubleScrolls ? 2 : 1;
         scrolls[task] = (scrolls[task] || 0) + scrollsProduced;
         updates.scrolls = JSON.stringify(scrolls);
         const displayTask = task === 'blank_scroll' ? 'Blank' : task.replace(/_/g,' ');
         const bonusMsg = helfBonus.doubleScrolls ? ' (High Elf mastery — 2 scrolls produced!)' : '';
         events.push({ type: 'system', message: `✨ A ${displayTask} scroll has been completed in the Mage Tower.${bonusMsg}` });
         
         alloc[task] -= 1;
         if (alloc[task] <= 0) delete alloc[task];
         completedAny = true;

         const mXp = awardTroopXp({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'mages', 20);
         updates.troop_levels = mXp.troop_levels;
      } else {
         progress[progKey] = newProg;
      }

      if (workDone > 0 && alloc[task] > 0) {
         if (!updates._mage_estimates) updates._mage_estimates = [];
         const pct = Math.floor(((progress[progKey] || 0) / req.turns) * 100);
         const turnsLeft = Math.ceil((req.turns - (progress[progKey] || 0)) / workDone);
         const displayTask = task === 'blank_scroll' ? 'Blank scroll' : task.replace(/_/g, ' ') + ' scroll';
         updates._mage_estimates.push(`${displayTask} (${pct}%, ${turnsLeft} turns left)`);
      }
    });

    if (updates._mage_estimates && updates._mage_estimates.length > 0) {
      events.push({ type: 'system', message: `📜 Mage Tower Est: ${updates._mage_estimates.join(' · ')}.` });
      delete updates._mage_estimates;
    }

    if (completedAny) {
      updates.mage_tower_allocation = JSON.stringify(alloc);
    }
  }

  updates.tower_progress = JSON.stringify(progress);
  return updates;
}

// ── Shrine — clerics boost morale and prepare healing ────────────────────────
function processShrine(k, events) {
  const updates = {};
  const shrines = k.bld_shrines || 0;
  if (shrines === 0) return updates;

  let shrineUpgrades = {};
  try { shrineUpgrades = JSON.parse(k.shrine_upgrades || '{}'); } catch {}

  const capacity        = shrines * 15;
  const effectiveClerics = Math.min(k.clerics || 0, capacity);

  const groveMult  = shrineUpgrades.sacred_grove ? 1.15 : 1.0;
  const moraleGain = Math.max(1, Math.floor((effectiveClerics / 10) * groveMult));
  const currentMorale = k.morale || 0;
  const natCap = naturalMoraleCap(k);
  if (effectiveClerics > 0 && currentMorale < natCap) {
    updates.morale = Math.min(natCap, currentMorale + moraleGain);
    events.push({ type: 'system', message: `⛩️ Shrine: ${effectiveClerics.toLocaleString()} clerics praying — morale +${moraleGain}.` });
  }

  // Divine Sanctuary — auto-stabilise morale at 50% once per 20 turns
  if (shrineUpgrades.divine_sanctuary) {
    const morale = updates.morale !== undefined ? updates.morale : currentMorale;
    const lastUsed = k.divine_sanctuary_used || 0;
    const currentTurn = k.turn || 0;
    if (morale < 50 && (currentTurn - lastUsed) >= 20) {
      updates.morale = 50;
      updates.divine_sanctuary_used = currentTurn;
      events.push({ type: 'system', message: `✨ Divine Sanctuary activated — morale stabilised at 50% by the blessing of the shrines.` });
    }
  }

  return updates;
}

// ── Library processing — runs each turn ──────────────────────────────────────
function processLibrary(k, events) {
  const updates = {};
  const libs = k.bld_libraries || 0;
  if (libs === 0) return updates;

  let alloc = {};
  try { alloc = JSON.parse(k.library_allocation || '{}'); } catch { alloc = {}; }
  let progress = {};
  try { progress = JSON.parse(k.library_progress || '{}'); } catch { progress = {}; }

  // Fallback for old schema
  if (alloc.scribe_craft) {
     alloc[alloc.scribe_craft] = alloc.scribe_target || 999;
     delete alloc.scribe_craft;
     delete alloc.scribe_target;
  }

  // Library upgrades
  let libUpgrades = {};
  try { libUpgrades = JSON.parse(k.library_upgrades || '{}'); } catch {}
  const capacityPerLib = 20;
  const scribeSpeedMult = raceBonus(k, 'scribe'); // Or similar? I will look up how other racial modifiers are done. Let's look at raceBonus.

  const capacity        = libs * capacityPerLib;
  const effectiveScribes = Math.min(k.scribes || 0, capacity);

  // Level multipliers
  const scribeLvlMult = unitLevelMult(k, 'scribes');

  let activeTasks = Object.keys(alloc).filter(t => alloc[t] > 0 && SCRIBE_ITEMS[t]);

  if (effectiveScribes > 0 && activeTasks.length > 0) {
    let scribesPerTask = effectiveScribes / activeTasks.length;
    let completedAny = false;

    activeTasks.forEach(task => {
      const req = SCRIBE_ITEMS[task];
      const progressKey = 'scribe_' + task;
      let disc = {};
      try { disc = JSON.parse(updates.discovered_kingdoms || k.discovered_kingdoms || '{}'); } catch {}

      if (task === 'location_map') {
        const unmapped = Object.keys(disc).filter(id => disc[id].found && !disc[id].mapped);
        if (unmapped.length === 0) {
          delete alloc[task]; progress[progressKey] = 0;
          events.push({ type: 'system', message: `⚠️ Scribes halted location mapping — no unmapped locations found.` });
          completedAny = true;
          return;
        }
        if ((updates.maps !== undefined ? updates.maps : (k.maps || 0)) < 1) {
          events.push({ type: 'system', message: `⚠️ Scribes halted location mapping — no blank maps available!` });
          return;
        }
      } else if (task === 'hybrid_blueprint') {
        let frags = []; try { frags = JSON.parse(updates.world_fragments || k.world_fragments || '[]'); } catch {}
        if (frags.length === 0) {
          delete alloc[task]; progress[progressKey] = 0;
          events.push({ type: 'system', message: `⚠️ Scribes halted Hybrid Blueprint research — no World Fragments available!` });
          completedAny = true;
          return;
        }
      }

      const effective = Math.min(scribesPerTask, req.scribes);
      const workDone = (effective >= req.scribes ? 1 : effective / req.scribes) * scribeLvlMult * scribeSpeedMult;
      const newProg = (progress[progressKey] || 0) + workDone;
      
      const currentAlloc = parseInt(alloc[task] || 0);

      if (newProg >= req.turns) {
        progress[progressKey] = 0;
        if (task === 'map') {
          updates.maps = (updates.maps !== undefined ? updates.maps : k.maps || 0) + 1;
          events.push({ type: 'system', message: `📜 Your scribes completed a map in the Library — you can now interact with other kingdoms.` });
        } else if (task === 'location_map') {
          const unmapped = Object.keys(disc).filter(id => disc[id].found && !disc[id].mapped);
          const targetId = unmapped[Math.floor(Math.random() * unmapped.length)];
          disc[targetId].mapped = true;
          updates.discovered_kingdoms = JSON.stringify(disc);
          updates.maps = (updates.maps !== undefined ? updates.maps : k.maps || 0) - 1;
          const targetName = disc[targetId].name || 'an unknown kingdom';
          events.push({ type: 'system', message: `📍 Your scribes mapped a new location! You may now interact with ${targetName}.` });
        } else if (task === 'hybrid_blueprint') {
          let frags = []; try { frags = JSON.parse(updates.world_fragments || k.world_fragments || '[]'); } catch {}
          let hbp = {}; try { hbp = JSON.parse(updates.hybrid_blueprints || k.hybrid_blueprints || '{}'); } catch {}
          const fragIndex = Math.floor(Math.random() * frags.length);
          const frag = frags.splice(fragIndex, 1)[0];
          updates.world_fragments = JSON.stringify(frags);
          
          const buildings = ['farms','barracks','markets','schools','mage_towers','shrines','guard_towers','castles','smithies','libraries'];
          const targetBld = buildings[Math.floor(Math.random() * buildings.length)];
          
          hbp[frag + '_' + Date.now()] = { fragment: frag, building: targetBld, assigned: false };
          updates.hybrid_blueprints = JSON.stringify(hbp);
          events.push({ type: 'system', message: `✨ Your scribes fully studied a ${frag} and devised an alternate blueprint for ${targetBld.replace('_', ' ')}!` });
        } else {
          updates.blueprints_stored = (updates.blueprints_stored !== undefined ? updates.blueprints_stored : k.blueprints_stored || 0) + 1;
          events.push({ type: 'system', message: `⚙️ Your scribes completed a blueprint in the Library — construction speed bonus applied.` });
        }
        
        alloc[task] = Math.max(0, currentAlloc - 1);
        if (alloc[task] <= 0) delete alloc[task];
        completedAny = true;

        // Scribe XP for completing an item
        const sXp = awardTroopXp({ ...k, troop_levels: updates.troop_levels || k.troop_levels }, 'scribes', 15);
        updates.troop_levels = sXp.troop_levels;
      } else {
        progress[progressKey] = newProg;
      }

      if (workDone > 0 && alloc[task] > 0) {
        if (!updates._scribe_estimates) updates._scribe_estimates = [];
        const pct = Math.floor(((progress[progressKey] || 0) / req.turns) * 100);
        const turnsLeft = Math.ceil((req.turns - (progress[progressKey] || 0)) / workDone);
        const displayTask = task.replace(/_/g, ' ');
        updates._scribe_estimates.push(`${displayTask} (${pct}%, ${turnsLeft} turns left)`);
      }
    });

    if (updates._scribe_estimates && updates._scribe_estimates.length > 0) {
      events.push({ type: 'system', message: `📚 Library Est: ${updates._scribe_estimates.join(' · ')}.` });
      delete updates._scribe_estimates;
    }

    if (completedAny) {
      updates.library_allocation = JSON.stringify(alloc);
    }
  }

  updates.library_progress = JSON.stringify(progress);

  if (libUpgrades.surveyors_eyrie && Math.random() < 0.20) {
    updates._find_kingdom_surveyor = true;
  }

  return updates;
}

// ── Hero Units ────────────────────────────────────────────────────────────────

function heroXpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(500 * Math.pow(1.5, level - 2));
}

function awardHeroXp(hero, xpAmount) {
  const newXp = hero.xp + xpAmount;
  let newLevel = hero.level;
  while (newXp >= heroXpForLevel(newLevel + 1) && newLevel < 20) {
    newLevel++;
  }
  return { level: newLevel, xp: newXp };
}

function getHeroPower(hero) {
  return hero.level * 1000; // Base power for combat/expeditions
}

// ── Hero Abilities ────────────────────────────────────────────────────────────
// Passives applied during turn or combat

function applyHeroTurnBonuses(hero, k, updates) {
  const cls = HERO_CLASSES[hero.class];
  if (!cls || !cls.statBonus) return;

  if (hero.class === 'sovereign') {
    // Prosperity: Extra tax income
    const bonus = Math.floor(hero.level * 250);
    updates.gold = (updates.gold !== undefined ? updates.gold : k.gold || 0) + bonus;
  } else if (hero.class === 'archmage') {
    // Mana infusion: Extra mana
    const bonus = Math.floor(hero.level * 100);
    updates.mana = (updates.mana !== undefined ? updates.mana : k.mana || 0) + bonus;
  } else if (hero.class === 'paladin') {
    // Protective Aura: Health regeneration or morale boost
    const currentMorale = (updates.morale !== undefined ? updates.morale : k.morale || 100);
    updates.morale = Math.min(100, currentMorale + 1);
  }
}

function recruitHero(k, heroName, heroClass) {
  const cls = HERO_CLASSES[heroClass];
  if (!cls) return { error: "Invalid hero class" };

  if ((k.gold || 0) < cls.recruitCost) return { error: `Need ${cls.recruitCost.toLocaleString()} gold` };
  if ((k.mana || 0) < cls.recruitMana) return { error: `Need ${cls.recruitMana.toLocaleString()} mana` };
  if ((k.bld_castles || 0) < 1) return { error: "Requires a Castle to house a Hero" };

  return {
    hero: {
      name: heroName,
      class: heroClass,
      level: 1,
      xp: 0,
      abilities: JSON.stringify(cls.abilities.slice(0, 1)), // Unlock first ability at lvl 1
      hp: 200,
      max_hp: 200,
      status: 'idle'
    },
    cost: { gold: cls.recruitCost, mana: cls.recruitMana }
  };
}

// ── Active effects processing — runs each turn ────────────────────────────────
function processActiveEffects(k, events) {
  let effects = {};
  try { effects = JSON.parse(k.active_effects || '{}'); } catch { effects = {}; }
  if (Object.keys(effects).length === 0) return {};

  const updates = {};
  const expired = [];

  for (const [effect, data] of Object.entries(effects)) {
    const remaining = (data.turns_left || 1) - 1;
    if (remaining <= 0) {
      expired.push(effect);
      events.push({ type: 'system', message: `The ${effect.replace('_',' ')} effect on your kingdom has expired.` });
    } else {
      // Apply ongoing effect
      if (effect === 'blight') {
        updates.food = Math.max(0, (updates.food !== undefined ? updates.food : k.food || 0) - (data.damage || 500));
      } else if (effect === 'plague') {
        const lost = Math.floor((k.population || 0) * 0.02);
        updates.population = Math.max(0, (k.population || 0) - lost);
        events.push({ type: 'attack', message: `☠️ Plague ravages your kingdom — ${lost.toLocaleString()} citizens have perished.` });
      } else if (effect === 'silence') {
        // Research suppressed — handled in processTurn by checking for silence
      }
      effects[effect] = { ...data, turns_left: remaining };
    }
  }

  expired.forEach(e => delete effects[e]);
  updates.active_effects = JSON.stringify(effects);
  return updates;
}

async function resolveRegions(db, io) {
  const regions = await db.all('SELECT * FROM regions');
  for (const region of regions) {
    // Calculate current influence in this region
    // Influence = Sum of Land for each alliance
    const tallies = await db.all(`
      SELECT am.alliance_id, SUM(k.land) as alliance_land
      FROM kingdoms k
      JOIN alliance_members am ON k.id = am.kingdom_id
      WHERE k.region = ?
      GROUP BY am.alliance_id
      ORDER BY alliance_land DESC
    `, [region.name]);

    if (!tallies.length) continue;

    const top = tallies[0];
    const topAllianceId = top.alliance_id;
    const topLand = top.alliance_land;

    // To capture, you need either the most land OR a minimum threshold
    // Let's say: if the top alliance has > 50% of the total LAND in the region, they start/continue capture
    const totalLandInRegion = tallies.reduce((sum, t) => sum + t.alliance_land, 0);
    const hasDominance = topLand > (totalLandInRegion * 0.51);

    if (hasDominance) {
      if (region.owner_alliance_id === topAllianceId) {
        // Owner still dominate, reset contest if any
        if (region.contest_alliance_id) {
          await db.run('UPDATE regions SET contest_alliance_id = NULL, contest_progress = 0 WHERE name = ?', [region.name]);
        }
      } else {
        // Challenging or starting capture
        if (region.contest_alliance_id === topAllianceId) {
          const progress = Math.min(100, region.contest_progress + 10); // 10% per turn cycle?
          if (progress >= 100) {
            // CAPTURED!
            await db.run(`
              UPDATE regions 
              SET owner_alliance_id = ?, contest_alliance_id = NULL, contest_progress = 0, last_captured_at = unixepoch()
              WHERE name = ?
            `, [topAllianceId, region.name]);
            
            const alliance = await db.get('SELECT name FROM alliances WHERE id = ?', [topAllianceId]);
            if (io) io.emit('chat', { room: 'global', username: 'System', message: `🚩 REGION CAPTURED: The alliance [${alliance.name}] has seized control of ${region.name}!`, is_system: true });
          } else {
            await db.run('UPDATE regions SET contest_progress = ? WHERE name = ?', [progress, region.name]);
          }
        } else {
          // New challenger
          await db.run('UPDATE regions SET contest_alliance_id = ?, contest_progress = 10 WHERE name = ?', [topAllianceId, region.name]);
        }
      }
    } else {
      // No dominance, decay contest
      if (region.contest_progress > 0) {
        const progress = Math.max(0, region.contest_progress - 5);
        await db.run('UPDATE regions SET contest_progress = ? WHERE name = ?', [progress, region.name]);
      }
    }
  }
}

module.exports = {
  resolveRegions,
  goldPerTurn, manaPerTurn, foodBalance, farmProduction, foodConsumption,
  marketIncomeFull, tavernEntertainmentBonus, commodityPrice,
  processFoodEconomy, processMercenaries, hireMercenaries, purchaseUpgrade,
  SEASON_ORDER, SEASON_DURATION, SEASON_FARM_MULT, SEASON_ICONS,
  LOCATE_RACE_MULT, calcDiscoveryChance, processLocationMapsWip,
  WALL_UPGRADES, TOWER_DEF_UPGRADES, OUTPOST_UPGRADES,
  WALL_STRENGTH_MULT, TOWER_DETECT_MULT, OUTPOST_RANGER_MULT, CITADEL_REQ,
  defenseRating, wallDefensePower, towerDetectionPower, outpostRangerPower,
  checkCitadel, applyWarmachineDamage,
  TOWER_UPGRADES, SCHOOL_UPGRADES, SHRINE_UPGRADES, LIBRARY_UPGRADES,
  FARM_UPGRADES, MARKET_UPGRADES, TAVERN_UPGRADES, MERC_TIERS, COMMODITY_VALUES,
  FARM_YIELD_MULT, FOOD_CONSUMPTION_MULT, MARKET_INCOME_MULT, TRADE_RATE_MULT,
  processTurn, hireUnits, studyDiscipline,
  queueBuildings, processBuildQueue, processLibrary, processMageTower, processShrine, processActiveEffects, forgeTools,
  resolveMilitaryAttack, castSpell,
  covertSpy, covertLoot, covertAssassinate,
  resolveAllianceDefense, resolveExpeditions,
  awardXp, xpForLevel, xpToNextLevel, levelFromXp,
  awardTroopXp, awardUnitXp, diluteTroopXp, unitLevelMult, racialUnitBonus,
  troopXpForLevel, effectiveTroopLevel,
  WM_CREW_REQUIRED, wmCrewRequired, moraleMult,
  TROOP_RACE_BONUS, RACE_BONUSES, REGION_DATA, assignRegion,
  UNIT_COST, BUILDING_COST, BUILDING_GOLD_COST, BUILDING_LAND_COST, BUILDING_COL,
  SPELL_DEFS, SCROLL_REQUIREMENTS, SCRIBE_ITEMS, HOUSING_CAP_BY_RACE,
  TOOL_COL, TOOL_GOLD_COST, BLUEPRINT_REQUIRED, SCAFFOLDING_REQUIRED, SCAFFOLDING_BONUS_BUILDINGS,
  HERO_CLASSES, heroXpForLevel, awardHeroXp, getHeroPower, applyHeroTurnBonuses, recruitHero,
  raidTradeRoute, canPrestige, processPrestige, getUnitName
};
