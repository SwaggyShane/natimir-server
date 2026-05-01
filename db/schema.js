const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../narmir.db');

let _db = null;

async function initDb() {
  if (_db) return _db;

  _db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  await _db.exec('PRAGMA journal_mode = WAL');
  await _db.exec('PRAGMA foreign_keys = ON');
  await _db.exec('PRAGMA cache_size = -32000');     // 32MB page cache
  await _db.exec('PRAGMA synchronous = NORMAL');    // safe with WAL, much faster than FULL
  await _db.exec('PRAGMA temp_store = MEMORY');     // temp tables in RAM
  await _db.exec('PRAGMA mmap_size = 134217728');   // 128MB memory-mapped I/O

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      username    TEXT    NOT NULL UNIQUE,
      password    TEXT    NOT NULL,
      is_admin    INTEGER NOT NULL DEFAULT 0,
      is_banned   INTEGER NOT NULL DEFAULT 0,
      is_ai       INTEGER NOT NULL DEFAULT 0,
      ban_reason  TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS kingdoms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id   INTEGER NOT NULL UNIQUE REFERENCES players(id),
      name        TEXT    NOT NULL,
      race        TEXT    NOT NULL DEFAULT 'human',
      gold        INTEGER NOT NULL DEFAULT 10000,
      land        INTEGER NOT NULL DEFAULT 500,
      population  INTEGER NOT NULL DEFAULT 50000,
      morale      INTEGER NOT NULL DEFAULT 100,
      tax         INTEGER NOT NULL DEFAULT 42,
      mana        INTEGER NOT NULL DEFAULT 5000,
      food        INTEGER NOT NULL DEFAULT 0,
      turn        INTEGER NOT NULL DEFAULT 0,
      last_turn_at INTEGER NOT NULL DEFAULT (unixepoch()),
      turns_stored INTEGER NOT NULL DEFAULT 400,
      res_economy       INTEGER NOT NULL DEFAULT 100,
      res_weapons       INTEGER NOT NULL DEFAULT 100,
      res_armor         INTEGER NOT NULL DEFAULT 100,
      res_military      INTEGER NOT NULL DEFAULT 100,
      res_spellbook     INTEGER NOT NULL DEFAULT 0,
      res_attack_magic  INTEGER NOT NULL DEFAULT 100,
      res_defense_magic INTEGER NOT NULL DEFAULT 100,
      res_entertainment INTEGER NOT NULL DEFAULT 100,
      res_construction  INTEGER NOT NULL DEFAULT 100,
      res_war_machines  INTEGER NOT NULL DEFAULT 100,
      bld_farms         INTEGER NOT NULL DEFAULT 200,
      bld_barracks      INTEGER NOT NULL DEFAULT 0,
      bld_outposts      INTEGER NOT NULL DEFAULT 0,
      bld_guard_towers  INTEGER NOT NULL DEFAULT 0,
      bld_schools       INTEGER NOT NULL DEFAULT 0,
      bld_armories      INTEGER NOT NULL DEFAULT 0,
      bld_vaults        INTEGER NOT NULL DEFAULT 0,
      bld_smithies      INTEGER NOT NULL DEFAULT 0,
      bld_markets       INTEGER NOT NULL DEFAULT 0,
      bld_mage_towers    INTEGER NOT NULL DEFAULT 0,
      bld_shrines       INTEGER NOT NULL DEFAULT 0,
      mage_tower_allocation TEXT NOT NULL DEFAULT '{}',
      shrine_allocation TEXT NOT NULL DEFAULT '{}',
      bld_training      INTEGER NOT NULL DEFAULT 0,

      bld_castles       INTEGER NOT NULL DEFAULT 0,
      bld_housing       INTEGER NOT NULL DEFAULT 100,
      fighters    INTEGER NOT NULL DEFAULT 0,
      rangers     INTEGER NOT NULL DEFAULT 0,
      clerics     INTEGER NOT NULL DEFAULT 0,
      mages       INTEGER NOT NULL DEFAULT 0,
      thieves     INTEGER NOT NULL DEFAULT 0,
      ninjas      INTEGER NOT NULL DEFAULT 0,
      researchers INTEGER NOT NULL DEFAULT 0,
      engineers   INTEGER NOT NULL DEFAULT 0,
      war_machines     INTEGER NOT NULL DEFAULT 0,
      weapons_stockpile INTEGER NOT NULL DEFAULT 0,
      armor_stockpile   INTEGER NOT NULL DEFAULT 0,
      research_allocation TEXT NOT NULL DEFAULT '{}',
      build_queue       TEXT NOT NULL DEFAULT '{}',
      build_progress    TEXT NOT NULL DEFAULT '{}',
      build_allocation  TEXT NOT NULL DEFAULT '{}',
      tools_hammers     INTEGER NOT NULL DEFAULT 0,
      tools_scaffolding INTEGER NOT NULL DEFAULT 0,
      tools_blueprints  INTEGER NOT NULL DEFAULT 0,
      scaffolding_stored INTEGER NOT NULL DEFAULT 0,
      hammers_stored     INTEGER NOT NULL DEFAULT 0,
      xp                INTEGER NOT NULL DEFAULT 0,
      level             INTEGER NOT NULL DEFAULT 1,
      troop_levels      TEXT NOT NULL DEFAULT '{}',
      training_allocation TEXT NOT NULL DEFAULT '{}',
      scribes     INTEGER NOT NULL DEFAULT 0,
      bld_libraries     INTEGER NOT NULL DEFAULT 0,
      library_allocation TEXT NOT NULL DEFAULT '{}',
      library_progress   TEXT NOT NULL DEFAULT '{}',
      tower_progress     TEXT NOT NULL DEFAULT '{}',
      scrolls           TEXT NOT NULL DEFAULT '{}',
      maps              INTEGER NOT NULL DEFAULT 0,
      blueprints_stored INTEGER NOT NULL DEFAULT 1,
      active_effects    TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS alliances (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL UNIQUE,
      leader_id   INTEGER NOT NULL REFERENCES kingdoms(id),
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS alliance_members (
      alliance_id INTEGER NOT NULL REFERENCES alliances(id),
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      pledge      INTEGER NOT NULL DEFAULT 3,
      joined_at   INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (alliance_id, kingdom_id)
    );
    CREATE TABLE IF NOT EXISTS news (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      type        TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      turn_num    INTEGER NOT NULL DEFAULT 0,
      is_read     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS war_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type     TEXT    NOT NULL,
      attacker_id     INTEGER REFERENCES kingdoms(id),
      attacker_name   TEXT,
      defender_id     INTEGER REFERENCES kingdoms(id),
      defender_name   TEXT,
      outcome         TEXT    NOT NULL,
      detail          TEXT,
      obscured        INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_war_log_time ON war_log(created_at DESC);
    CREATE TABLE IF NOT EXISTS expeditions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      type        TEXT    NOT NULL,
      turns_left  INTEGER NOT NULL,
      rangers     INTEGER NOT NULL DEFAULT 0,
      fighters    INTEGER NOT NULL DEFAULT 0,
      rewards     TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_exp_kingdom ON expeditions(kingdom_id);
    CREATE TABLE IF NOT EXISTS combat_log (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      attacker_id     INTEGER NOT NULL REFERENCES kingdoms(id),
      defender_id     INTEGER NOT NULL REFERENCES kingdoms(id),
      type            TEXT    NOT NULL,
      attacker_won    INTEGER NOT NULL DEFAULT 0,
      land_transferred INTEGER NOT NULL DEFAULT 0,
      detail          TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      room        TEXT    NOT NULL DEFAULT 'global',
      message     TEXT    NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS server_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS heroes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      name        TEXT    NOT NULL,
      class       TEXT    NOT NULL,
      level       INTEGER NOT NULL DEFAULT 1,
      xp          INTEGER NOT NULL DEFAULT 0,
      abilities   TEXT    NOT NULL DEFAULT '[]',
      status      TEXT    NOT NULL DEFAULT 'idle',
      hp          INTEGER NOT NULL DEFAULT 100,
      max_hp      INTEGER NOT NULL DEFAULT 100,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_heroes_kingdom ON heroes(kingdom_id);
    CREATE INDEX IF NOT EXISTS idx_news_kingdom    ON news(kingdom_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_combat_attacker ON combat_log(attacker_id);
    CREATE INDEX IF NOT EXISTS idx_combat_defender ON combat_log(defender_id);
    CREATE INDEX IF NOT EXISTS idx_chat_room       ON chat_messages(room, created_at);
    CREATE INDEX IF NOT EXISTS idx_kingdoms_player ON kingdoms(player_id);
    CREATE INDEX IF NOT EXISTS idx_kingdoms_land   ON kingdoms(land DESC);
    CREATE INDEX IF NOT EXISTS idx_expeditions_kingdom ON expeditions(kingdom_id, turns_left);
    CREATE INDEX IF NOT EXISTS idx_war_log_defender ON war_log(defender_id);
    CREATE INDEX IF NOT EXISTS idx_news_turn        ON news(kingdom_id, turn_num DESC);
  `);

  // ── Migrations — safe, idempotent, never crash on duplicate ─────────────────
  async function addColumn(table, col, def) {
    try {
      await _db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[db] Migration: added ${col} to ${table}`);
    } catch (e) {
      if (!e.message.includes('duplicate column')) throw e;
    }
  }

  await _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_news_created ON news(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exp_turns    ON expeditions(turns_left);
  `);

  // ── Additional tables ────────────────────────────────────────────────────────
  await _db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id    INTEGER NOT NULL REFERENCES players(id),
      recipient_id INTEGER NOT NULL REFERENCES players(id),
      content      TEXT NOT NULL,
      is_read      INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender    ON messages(sender_id)`);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)`);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS bounties (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      placer_id     INTEGER NOT NULL REFERENCES players(id),
      target_id     INTEGER NOT NULL REFERENCES kingdoms(id),
      amount        INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'active',
      claimed_by_id INTEGER REFERENCES kingdoms(id),
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_bounties_target ON bounties(target_id, status)`);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_bounties_active ON bounties(status, amount DESC)`);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS regions (
      name                TEXT PRIMARY KEY,
      owner_alliance_id   INTEGER REFERENCES alliances(id),
      contest_alliance_id INTEGER REFERENCES alliances(id),
      contest_progress    INTEGER NOT NULL DEFAULT 0,
      bonus_type          TEXT,
      lore                TEXT,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  for (const [name, bonus] of [
    ['The Iron Holds',    'construction'],
    ['The Silverwood',    'magic'],
    ['The Bloodplains',   'military'],
    ['The Underspire',    'stealth'],
    ['The Heartlands',    'economy'],
    ['The Ashfang Wilds', 'military'],
  ]) {
    await _db.run('INSERT OR IGNORE INTO regions (name, bonus_type) VALUES (?, ?)', [name, bonus]);
  }

  await _db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id  INTEGER,
      kingdom_id INTEGER,
      message    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS trade_offers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id     INTEGER NOT NULL REFERENCES kingdoms(id),
      sender_name   TEXT    NOT NULL,
      receiver_id   INTEGER NOT NULL REFERENCES kingdoms(id),
      receiver_name TEXT    NOT NULL,
      offer         TEXT    NOT NULL,
      request       TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at    INTEGER NOT NULL DEFAULT (unixepoch() + 3600)
    );
    CREATE INDEX IF NOT EXISTS idx_trade_offers_receiver ON trade_offers(receiver_id, status);
    CREATE INDEX IF NOT EXISTS idx_trade_offers_sender   ON trade_offers(sender_id, status);
  `);

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS mercenaries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id      INTEGER NOT NULL REFERENCES kingdoms(id),
      unit_type       TEXT    NOT NULL,
      level           INTEGER NOT NULL,
      count           INTEGER NOT NULL,
      tier            TEXT    NOT NULL,
      hired_at_turn   INTEGER NOT NULL DEFAULT 0,
      duration_turns  INTEGER NOT NULL DEFAULT 20,
      upkeep_per_turn INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_mercs_kingdom ON mercenaries(kingdom_id);
  `);

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      id            TEXT PRIMARY KEY,
      current_price REAL NOT NULL,
      base_price    REAL NOT NULL,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  for (const [id, current, base] of [['food', 0.5, 0.5], ['mana', 2.0, 2.0], ['hammers', 50.0, 50.0]]) {
    await _db.run('INSERT OR IGNORE INTO market_prices (id, current_price, base_price) VALUES (?, ?, ?)', [id, current, base]);
  }

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      key              TEXT    NOT NULL UNIQUE,
      name             TEXT    NOT NULL,
      description      TEXT    NOT NULL,
      season           TEXT    NOT NULL DEFAULT 'all',
      effect_type      TEXT    NOT NULL DEFAULT 'morale',
      effect_value     REAL    NOT NULL DEFAULT 5,
      effect_duration  INTEGER NOT NULL DEFAULT 1,
      race_only        TEXT    DEFAULT NULL,
      is_positive      INTEGER NOT NULL DEFAULT 1,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  await _db.exec(`
    CREATE TABLE IF NOT EXISTS event_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id   INTEGER NOT NULL REFERENCES kingdoms(id),
      kingdom_name TEXT    NOT NULL,
      event_key    TEXT    NOT NULL,
      event_name   TEXT    NOT NULL,
      season       TEXT    NOT NULL,
      fired_at     INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_fired   ON event_log(fired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_log_kingdom ON event_log(kingdom_id);
  `);

  // ── Seed data ────────────────────────────────────────────────────────────────
  await _db.run(`INSERT OR IGNORE INTO server_state (key, value) VALUES ('current_season', 'spring')`);
  await _db.run(`INSERT OR IGNORE INTO server_state (key, value) VALUES ('season_started_at', CAST(unixepoch() AS TEXT))`);
  await _db.run(`INSERT OR IGNORE INTO server_state (key, value) VALUES ('last_regen_at', CAST(unixepoch() AS TEXT))`);

  for (const [key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive] of [
    ['spring_bloom',     'Spring Bloom',        'Warm rains encourage growth.',                 'spring', 'farm_yield',  0.10, 5, null, 1],
    ['spring_floods',    'Spring Floods',        'Rising rivers damage farmland.',               'spring', 'morale',     -5,   3, null, 0],
    ['pollination_boom', 'Pollination Boom',     'A great flowering swells the population.',     'spring', 'population', 500,  1, null, 1],
    ['warm_winds',       'Warm Winds',           'A pleasant breeze lifts spirits.',             'spring', 'morale',      5,   1, null, 1],
    ['abundant_harvest', 'Abundant Harvest',     'Exceptional sun yields record crops.',         'summer', 'food',       0.15, 1, null, 1],
    ['heat_wave',        'Heat Wave',            'Scorching heat wilts crops and morale.',       'summer', 'farm_yield', -0.10,3, null, 0],
    ['travelling_merch', 'Travelling Merchants', 'Exotic goods boost market income.',            'summer', 'gold',       0.02, 3, null, 1],
    ['border_skirmish',  'Border Skirmish',      'Bandits raid your outlying farms.',            'summer', 'food',      -0.05, 1, null, 0],
    ['harvest_festival', 'Harvest Festival',     'The kingdom celebrates a bountiful autumn.',   'fall',   'morale',     10,  1, null, 1],
    ['early_frost',      'Early Frost',          'An unexpected frost kills late crops.',        'fall',   'farm_yield', -0.15,2, null, 0],
    ['trade_boom',       'Trade Boom',           'Merchants flock to your markets.',             'fall',   'gold',       0.05, 3, null, 1],
    ['rat_infestation',  'Rat Infestation',      'Vermin consume stored food.',                  'fall',   'food',      -0.10, 1, null, 0],
    ['blizzard',         'Blizzard',             'A fierce storm cripples farms and morale.',    'winter', 'farm_yield', -0.20,2, null, 0],
    ['refugees',         'Refugees Arrive',      'Displaced families seek shelter.',             'winter', 'population', 1000, 1, null, 1],
    ['winter_plague',    'Winter Plague',        'Disease spreads through the cold months.',     'winter', 'population', -0.02,1, null, 0],
    ['wolf_raids',       'Wolf Raids',           'Dire wolves raid border farms.',               'winter', 'food',      -0.08, 1, null, 0],
    ['ice_trade',        'Ice Trade',            'Dwarven merchants profit from winter routes.', 'winter', 'gold',       0.05, 2, 'dwarf',     1],
    ['dire_wolf_hunt',   'Great Hunt',           'Dire Wolf hunters return laden with prey.',    'fall',   'food',       0.20, 1, 'dire_wolf', 1],
    ['elven_bloom',      'Elven Bloom',          'High Elf mages channel spring energy.',        'spring', 'mana',       0.15, 3, 'high_elf',  1],
    ['dark_elf_shadow',  'Shadow Markets',       'Dark Elf smugglers exploit the long nights.',  'winter', 'gold',       0.08, 2, 'dark_elf',  1],
    ['orc_rampage',      'Orc Rampage',          'Summer heat fuels Orcish aggression.',         'summer', 'military',   0.10, 2, 'orc',       1],
  ]) {
    await _db.run(
      `INSERT OR IGNORE INTO events (key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive) VALUES (?,?,?,?,?,?,?,?,?)`,
      [key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive]
    );
  }

  // ── Column migrations ─────────────────────────────────────────────────────────
  const KINGDOM_COLS = [
    ['turns_stored',            'INTEGER NOT NULL DEFAULT 400'],
    ['research_allocation',     "TEXT NOT NULL DEFAULT '{}'"],
    ['build_queue',             "TEXT NOT NULL DEFAULT '{}'"],
    ['build_progress',          "TEXT NOT NULL DEFAULT '{}'"],
    ['research_progress',       "TEXT NOT NULL DEFAULT '{}'"],
    ['build_allocation',        "TEXT NOT NULL DEFAULT '{}'"],
    ['prestige_level',          'INTEGER NOT NULL DEFAULT 0'],
    ['trade_routes',            'INTEGER NOT NULL DEFAULT 0'],
    ['tools_hammers',           'INTEGER NOT NULL DEFAULT 0'],
    ['tools_scaffolding',       'INTEGER NOT NULL DEFAULT 0'],
    ['tools_blueprints',        'INTEGER NOT NULL DEFAULT 0'],
    ['scaffolding_stored',      'INTEGER NOT NULL DEFAULT 0'],
    ['hammers_stored',          'INTEGER NOT NULL DEFAULT 0'],
    ['xp',                      'INTEGER NOT NULL DEFAULT 0'],
    ['level',                   'INTEGER NOT NULL DEFAULT 1'],
    ['troop_levels',            "TEXT NOT NULL DEFAULT '{}'"],
    ['training_allocation',     "TEXT NOT NULL DEFAULT '{}'"],
    ['weapons_stockpile',       'INTEGER NOT NULL DEFAULT 0'],
    ['armor_stockpile',         'INTEGER NOT NULL DEFAULT 0'],
    ['description',             'TEXT'],
    ['smithy_allocation',       "TEXT NOT NULL DEFAULT '{}'"],
    ['hammer_turns_used',       'INTEGER NOT NULL DEFAULT 0'],
    ['racial_bonuses_unlocked', "TEXT NOT NULL DEFAULT '{}'"],
    ['bld_housing',             'INTEGER NOT NULL DEFAULT 100'],
    ['mage_tower_allocation',   "TEXT NOT NULL DEFAULT '{}'"],
    ['shrine_allocation',       "TEXT NOT NULL DEFAULT '{}'"],
    ['scribes',                 'INTEGER NOT NULL DEFAULT 0'],
    ['bld_libraries',           'INTEGER NOT NULL DEFAULT 0'],
    ['bld_taverns',             'INTEGER NOT NULL DEFAULT 0'],
    ['bld_mage_towers',         'INTEGER NOT NULL DEFAULT 0'],
    ['world_fragments',         "TEXT NOT NULL DEFAULT '[]'"],
    ['hybrid_blueprints',       "TEXT NOT NULL DEFAULT '{}'"],
    ['library_allocation',      "TEXT NOT NULL DEFAULT '{}'"],
    ['library_progress',        "TEXT NOT NULL DEFAULT '{}'"],
    ['tower_progress',          "TEXT NOT NULL DEFAULT '{}'"],
    ['scrolls',                 "TEXT NOT NULL DEFAULT '{}'"],
    ['maps',                    'INTEGER NOT NULL DEFAULT 0'],
    ['blueprints_stored',       'INTEGER NOT NULL DEFAULT 1'],
    ['active_effects',          "TEXT NOT NULL DEFAULT '{}'"],
    ['bld_walls',               'INTEGER NOT NULL DEFAULT 0'],
    ['wall_upgrades',           "TEXT NOT NULL DEFAULT '{}'"],
    ['tower_def_upgrades',      "TEXT NOT NULL DEFAULT '{}'"],
    ['outpost_upgrades',        "TEXT NOT NULL DEFAULT '{}'"],
    ['defense_upgrades',        "TEXT NOT NULL DEFAULT '{}'"],
    ['tower_upgrades',          "TEXT NOT NULL DEFAULT '{}'"],
    ['school_upgrades',         "TEXT NOT NULL DEFAULT '{}'"],
    ['shrine_upgrades',         "TEXT NOT NULL DEFAULT '{}'"],
    ['library_upgrades',        "TEXT NOT NULL DEFAULT '{}'"],
    ['research_focus',          "TEXT NOT NULL DEFAULT '[]'"],
    ['divine_sanctuary_used',   'INTEGER NOT NULL DEFAULT 0'],
    ['farm_upgrades',           "TEXT NOT NULL DEFAULT '{}'"],
    ['market_upgrades',         "TEXT NOT NULL DEFAULT '{}'"],
    ['tavern_upgrades',         "TEXT NOT NULL DEFAULT '{}'"],
    ['food_shortage_turns',     'INTEGER NOT NULL DEFAULT 0'],
    ['food_surplus_turns',      'INTEGER NOT NULL DEFAULT 0'],
    ['mercenaries',             "TEXT NOT NULL DEFAULT '[]'"],
    ['last_event_at',           'INTEGER NOT NULL DEFAULT 0'],
    ['active_event',            "TEXT NOT NULL DEFAULT '{}'"],
    ['discovered_kingdoms',     "TEXT NOT NULL DEFAULT '{}'"],
    ['location_maps_wip',       "TEXT NOT NULL DEFAULT '[]'"],
  ];
  const cols = (await _db.all('PRAGMA table_info(kingdoms)')).map(c => c.name);
  for (const [col, def] of KINGDOM_COLS) {
    if (!cols.includes(col)) await addColumn('kingdoms', col, def);
  }

  // Special: region column requires backfill on existing kingdoms
  if (!cols.includes('region')) {
    await addColumn('kingdoms', 'region', "TEXT NOT NULL DEFAULT ''");
    const RACE_REGIONS = {
      dwarf: 'The Iron Holds', high_elf: 'The Silverwood', orc: 'The Bloodplains',
      dark_elf: 'The Underspire', human: 'The Heartlands', dire_wolf: 'The Ashfang Wilds',
    };
    for (const k of await _db.all('SELECT id, race FROM kingdoms')) {
      await _db.run('UPDATE kingdoms SET region = ? WHERE id = ?', [RACE_REGIONS[k.race] || 'The Unknown Lands', k.id]);
    }
  }

  // Legacy: copy defence_upgrades -> defense_upgrades for renamed column
  if (cols.includes('defence_upgrades') && cols.includes('defense_upgrades')) {
    await _db.run(`UPDATE kingdoms SET defense_upgrades = defence_upgrades WHERE defense_upgrades = '{}' AND defence_upgrades != '{}'`);
  }

  // Fix softlock: kingdoms with no libraries must have at least 1 blueprint
  await _db.run("UPDATE kingdoms SET blueprints_stored = 1 WHERE bld_libraries = 0 AND blueprints_stored < 1");

  // Data migration: tools_* -> *_stored (legacy column rename)
  if (cols.includes('tools_scaffolding') && cols.includes('scaffolding_stored')) {
    await _db.run("UPDATE kingdoms SET scaffolding_stored = tools_scaffolding WHERE scaffolding_stored = 0 AND tools_scaffolding > 0");
  }
  if (cols.includes('tools_hammers') && cols.includes('hammers_stored')) {
    await _db.run("UPDATE kingdoms SET hammers_stored = tools_hammers WHERE hammers_stored = 0 AND tools_hammers > 0");
  }

  const PLAYER_COLS = [
    ['is_admin',        'INTEGER NOT NULL DEFAULT 0'],
    ['is_banned',       'INTEGER NOT NULL DEFAULT 0'],
    ['ban_reason',      'TEXT'],
    ['is_ai',           'INTEGER NOT NULL DEFAULT 0'],
    ['is_chat_mod',     'INTEGER NOT NULL DEFAULT 0'],
    ['chat_banned',     'INTEGER NOT NULL DEFAULT 0'],
    ['chat_ban_reason', 'TEXT'],
    ['chat_color',      'TEXT DEFAULT NULL'],
    ['chat_name',       'TEXT DEFAULT NULL'],
  ];
  const pCols = (await _db.all('PRAGMA table_info(players)')).map(c => c.name);
  for (const [col, def] of PLAYER_COLS) {
    if (!pCols.includes(col)) await addColumn('players', col, def);
  }

  const nCols = (await _db.all('PRAGMA table_info(news)')).map(c => c.name);
  if (!nCols.includes('turn_num')) await addColumn('news', 'turn_num', 'INTEGER NOT NULL DEFAULT 0');

  const CHAT_COLS = [
    ['username',  "TEXT NOT NULL DEFAULT ''"],
    ['player_id', 'INTEGER NOT NULL DEFAULT 0'],
    ['deleted',   'INTEGER NOT NULL DEFAULT 0'],
  ];
  const cmCols = (await _db.all('PRAGMA table_info(chat_messages)')).map(c => c.name);
  for (const [col, def] of CHAT_COLS) {
    if (!cmCols.includes(col)) await addColumn('chat_messages', col, def);
  }

  // Expeditions: seen flag lets completed rows persist until the frontend acknowledges them
  const expCols = (await _db.all('PRAGMA table_info(expeditions)')).map(c => c.name);
  if (!expCols.includes('seen')) {
    await addColumn('expeditions', 'seen', 'INTEGER NOT NULL DEFAULT 0');
    // Clean up stuck completed rows that predate the seen column
    await _db.run('DELETE FROM expeditions WHERE turns_left = 0');
  }

  return _db;
}

function getDb() {
  if (!_db) throw new Error('Database not initialised — call initDb() first');
  return _db;
}

module.exports = { initDb, getDb };
