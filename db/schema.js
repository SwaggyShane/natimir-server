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
    CREATE TABLE IF NOT EXISTS spy_reports (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id          INTEGER NOT NULL REFERENCES kingdoms(id),
      target_id           INTEGER NOT NULL REFERENCES kingdoms(id),
      target_name         TEXT    NOT NULL,
      outcome             TEXT    NOT NULL,
      report              TEXT,
      shared_to_alliance  INTEGER NOT NULL DEFAULT 0,
      created_at          INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_spy_reports_kingdom ON spy_reports(kingdom_id);
    CREATE INDEX IF NOT EXISTS idx_spy_reports_target  ON spy_reports(target_id);
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

  // Ensure key indexes exist
  await _db.exec(`
    CREATE INDEX IF NOT EXISTS idx_kingdoms_player ON kingdoms(player_id);
    CREATE INDEX IF NOT EXISTS idx_kingdoms_land   ON kingdoms(land DESC);
    CREATE INDEX IF NOT EXISTS idx_news_created    ON news(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exp_turns       ON expeditions(turns_left);
  `);

  const cols = (await _db.all('PRAGMA table_info(kingdoms)')).map(c => c.name);
  if (!cols.includes('turns_stored'))        await addColumn('kingdoms', 'turns_stored',        'INTEGER NOT NULL DEFAULT 400');
  if (!cols.includes('research_allocation')) await addColumn('kingdoms', 'research_allocation', "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('build_queue'))         await addColumn('kingdoms', 'build_queue',         "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('build_progress'))      await addColumn('kingdoms', 'build_progress',      "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('research_progress'))   await addColumn('kingdoms', 'research_progress',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('build_allocation'))    await addColumn('kingdoms', 'build_allocation',    "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('prestige_level'))      await addColumn('kingdoms', 'prestige_level',      'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('trade_routes'))       await addColumn('kingdoms', 'trade_routes',       'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('tools_hammers'))       await addColumn('kingdoms', 'tools_hammers',       'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('tools_scaffolding'))   await addColumn('kingdoms', 'tools_scaffolding',   'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('tools_blueprints'))    await addColumn('kingdoms', 'tools_blueprints',    'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('scaffolding_stored'))  await addColumn('kingdoms', 'scaffolding_stored',  'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('hammers_stored'))      await addColumn('kingdoms', 'hammers_stored',      'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('xp'))                  await addColumn('kingdoms', 'xp',                  'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('level'))               await addColumn('kingdoms', 'level',               'INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('troop_levels'))        await addColumn('kingdoms', 'troop_levels',        "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('training_allocation')) await addColumn('kingdoms', 'training_allocation', "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('weapons_stockpile'))   await addColumn('kingdoms', 'weapons_stockpile',   'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('armor_stockpile'))     await addColumn('kingdoms', 'armor_stockpile',     'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('description'))         await addColumn('kingdoms', 'description',         'TEXT');
  if (!cols.includes('collected_lore'))      await addColumn('kingdoms', 'collected_lore',      'TEXT NOT NULL DEFAULT "[]"');
  if (!cols.includes('last_lore_id'))        await addColumn('kingdoms', 'last_lore_id',        'TEXT');
  if (!cols.includes('collected_events'))    await addColumn('kingdoms', 'collected_events',    'TEXT NOT NULL DEFAULT "[]"');
  if (!cols.includes('last_event_id'))       await addColumn('kingdoms', 'last_event_id',       'TEXT');
  if (!cols.includes('achievements'))        await addColumn('kingdoms', 'achievements',        'TEXT NOT NULL DEFAULT "[]"');

  await _db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id         INTEGER NOT NULL REFERENCES players(id),
      recipient_id      INTEGER NOT NULL REFERENCES players(id),
      content           TEXT NOT NULL,
      is_read           INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  await _db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)`);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS bounties (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      placer_id         INTEGER NOT NULL REFERENCES players(id),
      target_id         INTEGER NOT NULL REFERENCES kingdoms(id),
      amount            INTEGER NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active',
      claimed_by_id     INTEGER REFERENCES kingdoms(id),
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  await _db.run(`CREATE INDEX IF NOT EXISTS idx_bounties_target ON bounties(target_id, status)`);
  await _db.run(`CREATE INDEX IF NOT EXISTS idx_bounties_active ON bounties(status, amount DESC)`);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS lore_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS random_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  await _db.run(`
    CREATE TABLE IF NOT EXISTS regions (
      name              TEXT PRIMARY KEY,
      owner_alliance_id INTEGER REFERENCES alliances(id),
      contest_alliance_id INTEGER REFERENCES alliances(id),
      contest_progress  INTEGER NOT NULL DEFAULT 0,
      bonus_type        TEXT,
      lore              TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  // Initialize regions if they don't exist
  const REGION_DATA_LOCAL = [
    ['The Iron Holds',      'construction'],
    ['The Silverwood',      'magic'],
    ['The Bloodplains',     'military'],
    ['The Underspire',      'stealth'],
    ['The Heartlands',      'economy'],
    ['The Ashfang Wilds',   'military']
  ];
  for (const [name, bonus] of REGION_DATA_LOCAL) {
    await _db.run('INSERT OR IGNORE INTO regions (name, bonus_type) VALUES (?, ?)', [name, bonus]);
  }

  const pCols = (await _db.all('PRAGMA table_info(players)')).map(c => c.name);
  if (!pCols.includes('is_admin'))   await addColumn('players', 'is_admin',   'INTEGER NOT NULL DEFAULT 0');
  if (!pCols.includes('is_banned'))  await addColumn('players', 'is_banned',  'INTEGER NOT NULL DEFAULT 0');
  if (!pCols.includes('ban_reason')) await addColumn('players', 'ban_reason', 'TEXT');
  if (!pCols.includes('is_ai'))      await addColumn('players', 'is_ai',      'INTEGER NOT NULL DEFAULT 0');

  const nCols = (await _db.all('PRAGMA table_info(news)')).map(c => c.name);
  if (!nCols.includes('turn_num')) await addColumn('news', 'turn_num', 'INTEGER NOT NULL DEFAULT 0');

  if (!pCols.includes('is_chat_mod'))  await addColumn('players', 'is_chat_mod',  'INTEGER NOT NULL DEFAULT 0');
  if (!pCols.includes('chat_banned'))  await addColumn('players', 'chat_banned',  'INTEGER NOT NULL DEFAULT 0');
  if (!pCols.includes('chat_ban_reason')) await addColumn('players', 'chat_ban_reason', 'TEXT');
  if (!pCols.includes('chat_color'))  await addColumn('players', 'chat_color',  "TEXT DEFAULT NULL");
  if (!pCols.includes('chat_name'))   await addColumn('players', 'chat_name',   "TEXT DEFAULT NULL");

  await _db.run(`
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER,
      kingdom_id INTEGER,
      message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  const cmCols = (await _db.all('PRAGMA table_info(chat_messages)')).map(c => c.name);
  if (!cmCols.includes('username')) await addColumn('chat_messages', 'username', 'TEXT NOT NULL DEFAULT \'\'');
  if (!cmCols.includes('player_id')) await addColumn('chat_messages', 'player_id', 'INTEGER NOT NULL DEFAULT 0');
  if (!cmCols.includes('deleted'))  await addColumn('chat_messages', 'deleted',  'INTEGER NOT NULL DEFAULT 0');

  if (!cols.includes('region')) {
    await addColumn('kingdoms', 'region', "TEXT NOT NULL DEFAULT ''");
    // Backfill existing kingdoms
    const RACE_REGIONS = {
      dwarf:'The Iron Holds', high_elf:'The Silverwood', orc:'The Bloodplains',
      dark_elf:'The Underspire', human:'The Heartlands', dire_wolf:'The Ashfang Wilds',
    };
    const existing = await _db.all('SELECT id, race FROM kingdoms');
    for (const k of existing) {
      await _db.run('UPDATE kingdoms SET region = ? WHERE id = ?', [RACE_REGIONS[k.race] || 'The Unknown Lands', k.id]);
    }
  }
  if (!cols.includes('smithy_allocation'))          await addColumn('kingdoms', 'smithy_allocation',          "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('hammer_turns_used'))          await addColumn('kingdoms', 'hammer_turns_used',          'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('racial_bonuses_unlocked'))    await addColumn('kingdoms', 'racial_bonuses_unlocked',    "TEXT NOT NULL DEFAULT '{}'");

  // Expeditions — seen flag so completed rows persist until frontend acknowledges
  const expCols = (await _db.all('PRAGMA table_info(expeditions)')).map(c => c.name);
  if (!expCols.includes('seen')) {
    await addColumn('expeditions', 'seen', 'INTEGER NOT NULL DEFAULT 0');
    // Clean up any old stuck completed rows that predate the seen column
    await _db.run('DELETE FROM expeditions WHERE turns_left = 0');
  }
  if (!cols.includes('bld_housing'))             await addColumn('kingdoms', 'bld_housing',             'INTEGER NOT NULL DEFAULT 100');
  if (!cols.includes('mage_tower_allocation'))   await addColumn('kingdoms', 'mage_tower_allocation',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('shrine_allocation'))       await addColumn('kingdoms', 'shrine_allocation',       "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('scribes'))             await addColumn('kingdoms', 'scribes',             'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('bld_libraries'))       await addColumn('kingdoms', 'bld_libraries',       'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('bld_taverns'))         await addColumn('kingdoms', 'bld_taverns',         'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('bld_mage_towers'))     await addColumn('kingdoms', 'bld_mage_towers',     'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('world_fragments'))      await addColumn('kingdoms', 'world_fragments',     "TEXT NOT NULL DEFAULT '[]'");
  if (!cols.includes('hybrid_blueprints'))    await addColumn('kingdoms', 'hybrid_blueprints',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('library_allocation'))  await addColumn('kingdoms', 'library_allocation',  "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('library_progress'))    await addColumn('kingdoms', 'library_progress',    "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('tower_progress'))      await addColumn('kingdoms', 'tower_progress',      "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('scrolls'))             await addColumn('kingdoms', 'scrolls',             "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('maps'))                await addColumn('kingdoms', 'maps',                'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('blueprints_stored'))   await addColumn('kingdoms', 'blueprints_stored',   'INTEGER NOT NULL DEFAULT 1');
  if (!cols.includes('certified_blueprints_stored')) await addColumn('kingdoms', 'certified_blueprints_stored', 'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('active_effects'))      await addColumn('kingdoms', 'active_effects',      "TEXT NOT NULL DEFAULT '{}'");

  if (!cols.includes('bld_walls'))          await addColumn('kingdoms', 'bld_walls',          'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('wall_upgrades'))      await addColumn('kingdoms', 'wall_upgrades',      "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('tower_def_upgrades')) await addColumn('kingdoms', 'tower_def_upgrades', "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('outpost_upgrades'))   await addColumn('kingdoms', 'outpost_upgrades',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('defense_upgrades'))   await addColumn('kingdoms', 'defense_upgrades',   "TEXT NOT NULL DEFAULT '{}'");

  // Legacy data migration: if defence_upgrades exists but defense_upgrades is empty, copy it
  if (cols.includes('defence_upgrades') && cols.includes('defense_upgrades')) {
    await _db.run(`UPDATE kingdoms SET defense_upgrades = defence_upgrades WHERE defense_upgrades = '{}' AND defence_upgrades != '{}'`);
  }
  if (!cols.includes('tower_upgrades'))    await addColumn('kingdoms', 'tower_upgrades',    "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('school_upgrades'))   await addColumn('kingdoms', 'school_upgrades',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('shrine_upgrades'))   await addColumn('kingdoms', 'shrine_upgrades',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('library_upgrades'))  await addColumn('kingdoms', 'library_upgrades',  "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('research_focus'))    await addColumn('kingdoms', 'research_focus',     "TEXT NOT NULL DEFAULT '[]'");
  if (!cols.includes('divine_sanctuary_used')) await addColumn('kingdoms', 'divine_sanctuary_used', 'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('farm_upgrades'))       await addColumn('kingdoms', 'farm_upgrades',       "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('market_upgrades'))     await addColumn('kingdoms', 'market_upgrades',     "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('tavern_upgrades'))     await addColumn('kingdoms', 'tavern_upgrades',     "TEXT NOT NULL DEFAULT '{}'");

  // Fix softlock: if a kingdom has no libraries and fewer than 1 blueprints, give them 1 blueprints
  await _db.run("UPDATE kingdoms SET blueprints_stored = 1 WHERE bld_libraries = 0 AND blueprints_stored < 1");

  // Data migration: tools_* -> *_stored
  if (cols.includes('tools_scaffolding') && cols.includes('scaffolding_stored')) {
    await _db.run("UPDATE kingdoms SET scaffolding_stored = tools_scaffolding WHERE scaffolding_stored = 0 AND tools_scaffolding > 0");
  }
  if (cols.includes('tools_hammers') && cols.includes('hammers_stored')) {
    await _db.run("UPDATE kingdoms SET hammers_stored = tools_hammers WHERE hammers_stored = 0 AND tools_hammers > 0");
  }

  if (!cols.includes('food_shortage_turns')) await addColumn('kingdoms', 'food_shortage_turns', 'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('food_surplus_turns'))  await addColumn('kingdoms', 'food_surplus_turns',  'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('mercenaries'))         await addColumn('kingdoms', 'mercenaries',         "TEXT NOT NULL DEFAULT '[]'");

  // Trade offers table
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

  // Mercenaries table
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

  // Market Prices table
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      id            TEXT PRIMARY KEY,
      current_price REAL NOT NULL,
      base_price    REAL NOT NULL,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed default market prices
  const defaultPrices = [
    ['food',    0.5, 0.5],
    ['mana',    2.0, 2.0],
    ['hammers', 50.0, 50.0]
  ];
  for (const [id, current, base] of defaultPrices) {
    await _db.run('INSERT OR IGNORE INTO market_prices (id, current_price, base_price) VALUES (?, ?, ?)', [id, current, base]);
  }

  await _db.exec(`
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
  `);

  // ── Season & events migrations ────────────────────────────────────────────────
  if (!cols.includes('last_event_at'))         await addColumn('kingdoms', 'last_event_at',         'INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('active_event'))          await addColumn('kingdoms', 'active_event',          "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('discovered_kingdoms'))   await addColumn('kingdoms', 'discovered_kingdoms',   "TEXT NOT NULL DEFAULT '{}'");
  if (!cols.includes('location_maps_wip'))     await addColumn('kingdoms', 'location_maps_wip',     "TEXT NOT NULL DEFAULT '[]'");
  
  // Market Prices table procedural check
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      id            TEXT PRIMARY KEY,
      current_price REAL NOT NULL,
      base_price    REAL NOT NULL,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const freshDefaultPrices = [
    ['food',    0.5, 0.5],
    ['mana',    2.0, 2.0],
    ['hammers', 50.0, 50.0]
  ];
  for (const [id, current, base] of freshDefaultPrices) {
    await _db.run('INSERT OR IGNORE INTO market_prices (id, current_price, base_price) VALUES (?, ?, ?)', [id, current, base]);
  }

  // Events table
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      key         TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL,
      season      TEXT    NOT NULL DEFAULT 'all',
      effect_type TEXT    NOT NULL DEFAULT 'morale',
      effect_value REAL   NOT NULL DEFAULT 5,
      effect_duration INTEGER NOT NULL DEFAULT 1,
      race_only   TEXT    DEFAULT NULL,
      is_positive INTEGER NOT NULL DEFAULT 1,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Event log table
  await _db.exec(`
    CREATE TABLE IF NOT EXISTS event_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kingdom_id  INTEGER NOT NULL REFERENCES kingdoms(id),
      kingdom_name TEXT   NOT NULL,
      event_key   TEXT    NOT NULL,
      event_name  TEXT    NOT NULL,
      season      TEXT    NOT NULL,
      fired_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_event_log_fired ON event_log(fired_at DESC);
    CREATE INDEX IF NOT EXISTS idx_event_log_kingdom ON event_log(kingdom_id);
  `);

  // Seed season state
  await _db.run(`INSERT OR IGNORE INTO server_state (key, value) VALUES ('current_season', 'spring')`);
  await _db.run(`INSERT OR IGNORE INTO server_state (key, value) VALUES ('season_started_at', CAST(unixepoch() AS TEXT))`);

  // Seed default events
  const defaultEvents = [
    // Spring
    ['spring_bloom',      'Spring Bloom',         'Warm rains encourage growth.',                  'spring', 'farm_yield', 0.10, 5, null, 1],
    ['spring_floods',     'Spring Floods',         'Rising rivers damage farmland.',                'spring', 'morale',   -5,   3, null, 0],
    ['pollination_boom',  'Pollination Boom',      'A great flowering swells the population.',      'spring', 'population', 500, 1, null, 1],
    ['warm_winds',        'Warm Winds',            'A pleasant breeze lifts spirits.',              'spring', 'morale',    5,   1, null, 1],
    // Summer
    ['abundant_harvest',  'Abundant Harvest',      'Exceptional sun yields record crops.',          'summer', 'food',      0.15, 1, null, 1],
    ['heat_wave',         'Heat Wave',             'Scorching heat wilts crops and morale.',        'summer', 'farm_yield',-0.10,3, null, 0],
    ['travelling_merch',  'Travelling Merchants',  'Exotic goods boost market income.',             'summer', 'gold',      0.02, 3, null, 1],
    ['border_skirmish',   'Border Skirmish',       'Bandits raid your outlying farms.',             'summer', 'food',     -0.05,1, null, 0],
    // Fall
    ['harvest_festival',  'Harvest Festival',      'The kingdom celebrates a bountiful autumn.',    'fall',   'morale',    10,  1, null, 1],
    ['early_frost',       'Early Frost',           'An unexpected frost kills late crops.',         'fall',   'farm_yield',-0.15,2, null, 0],
    ['trade_boom',        'Trade Boom',            'Merchants flock to your markets.',              'fall',   'gold',      0.05, 3, null, 1],
    ['rat_infestation',   'Rat Infestation',       'Vermin consume stored food.',                   'fall',   'food',     -0.10,1, null, 0],
    // Winter
    ['blizzard',          'Blizzard',              'A fierce storm cripples farms and morale.',     'winter', 'farm_yield',-0.20,2, null, 0],
    ['refugees',          'Refugees Arrive',       'Displaced families seek shelter.',              'winter', 'population', 1000,1, null, 1],
    ['winter_plague',     'Winter Plague',         'Disease spreads through the cold months.',      'winter', 'population',-0.02,1, null, 0],
    ['wolf_raids',        'Wolf Raids',            'Dire wolves raid border farms.',                'winter', 'food',     -0.08,1, null, 0],
    // Race-specific
    ['ice_trade',         'Ice Trade',             'Dwarven merchants profit from winter routes.',  'winter', 'gold',      0.05, 2, 'dwarf',    1],
    ['dire_wolf_hunt',    'Great Hunt',            'Dire Wolf hunters return laden with prey.',     'fall',   'food',      0.20, 1, 'dire_wolf', 1],
    ['elven_bloom',       'Elven Bloom',           'High Elf mages channel spring energy.',        'spring', 'mana',      0.15, 3, 'high_elf', 1],
    ['dark_elf_shadow',   'Shadow Markets',        'Dark Elf smugglers exploit the long nights.',  'winter', 'gold',      0.08, 2, 'dark_elf', 1],
    ['orc_rampage',       'Orc Rampage',           'Summer heat fuels Orcish aggression.',         'summer', 'military',  0.10, 2, 'orc',      1],
  ];
  for (const [key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive] of defaultEvents) {
    await _db.run(`INSERT OR IGNORE INTO events (key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive) VALUES (?,?,?,?,?,?,?,?,?)`,
      [key,name,description,season,effect_type,effect_value,effect_duration,race_only,is_positive]);
  }

  const hasEvents = await _db.get("SELECT 1 FROM random_events LIMIT 1");
  if (!hasEvents) {
    const defaultRandomEvents = [
      'a suspiciously damp sock',
      'a map to a location that no longer exists',
      'a very confident fortune cookie with no fortune inside',
      'a half-eaten ration bar of unknown vintage',
      'a decorative rock (it does nothing)',
      'a pamphlet titled "10 Reasons Orcs Are Actually Quite Misunderstood"',
      'a jar of mysterious grey paste (do not eat)',
      'a slightly bent sword that the previous owner called "Destiny"',
      'a tiny flag from a kingdom that fell 300 years ago',
      'a love letter addressed to someone named Grimbold',
      'a collection of 47 different types of dirt',
      'a boot (just the one)',
      'a certificate of participation from the Third Annual Swamp Festival',
      'a wheel of cheese that has achieved sentience (probably)',
      'a bag of magic beans that are, on closer inspection, just beans',
      'a very thorough guide to knitting (no one in your kingdom knows how to read)',
      'a suspicious smell that follows rangers home',
      'a crystal ball showing only static',
      'an extremely detailed painting of a cloud',
      'a dwarf\'s shopping list (mostly cheese)',
      'a torch that only works in daylight',
      'a book called "How To Stop Being Poor" — all pages blank',
      'a rusty key to an unknown lock',
      'a proclamation declaring your kingdom "pretty good, probably"',
      'a coupon for 10% off at an inn that burned down decades ago',
    ];
    for (const e of defaultRandomEvents) {
      await _db.run("INSERT INTO random_events (content) VALUES (?)", [e]);
    }
  }

  const loreColsRes = await _db.all("PRAGMA table_info(lore_entries)");
  const loreCols = loreColsRes.map(c => c.name);
  if (!loreCols.includes('title')) await addColumn('lore_entries', 'title', "TEXT NOT NULL DEFAULT ''");

  const hasLore = await _db.get("SELECT 1 FROM lore_entries LIMIT 1");
  if (!hasLore) {
    const defaultLore = [
      // Narmir Lore
      { title: "The First Age", content: "Before the kingdoms rose, Narmir was a vast wilderness of raw magic — mountains that breathed, rivers that sang, and forests whose roots reached the core of the world." },
      { title: "The Sundering", content: "The world was once whole. Then the Arch-Mages attempted to bind all magic into a single point. The resulting explosion shattered the Weave, splitting the continent." },
      { title: "The Weave", content: "Magic in Narmir comes from the Weave, an invisible lattice of energy that runs through all living things. Mages do not create magic; they coax it into submission." },
      { title: "The Age of Crowns", content: "Following the Sundering came three hundred years of endless war as every warlord claimed dominion. Historians call this the Age of Crowns." },
      { title: "The Dead Roads", content: "Beneath every major city lie the Dead Roads — ancient trade tunnels carved by civilisations lost to time. All six races claim to have built them." },
      
      // General Lore
      { title: "A Wanderer's Note", content: "A mysterious traveller left this note: 'Don't trust the roads west of the Hollow Mountains after dark. The shadows move independently of the light.'" },
      { title: "On the Nature of Gold", content: "Gold does not rust, rot, or lie. A gold coin from a destroyed kingdom is still worth a gold coin. The kingdom is gone; the gold remains." },
      { title: "The Soldier's Calculation", content: "Before any battle, ask: Can we win? Can we survive losing? Can we afford either? Two 'yes' answers means you fight." },
      { title: "The Scribe's Burden", content: "Everything that ever mattered was written down by someone who was tired, underpaid, and working by bad light. History is a function of eyestrain." },
      { title: "On Spies", content: "A good spy does not look like a spy. They look like a merchant, a beggar, a cook. True invisibility is being completely ordinary." },

      // Dwarf Lore
      { title: "The Deep Origins", content: "Dwarves did not descend into the mountains; they emerged from them. They remember a time before the surface existed, and they found the sky unsettling." },
      { title: "The Stonememory", content: "Every dwarf carries an instinctive understanding of stone composition and load-bearing angles. A mason identifies the age of a wall by touch." },
      { title: "The Grudge Ledgers", content: "Every dwarf clan maintains a physical book bound in iron, listing every wrong done to them. Settled grudges are crossed out in ink that never dries." },

      // High Elf Lore
      { title: "The Memory Inheritance", content: "High Elves carry the emotional residue of their ancestors' experiences — instincts and preferences passed down through the millennia." },
      { title: "The Silversong", content: "Elven children learn to sing before they speak. The Silversong is believed to be the original language of the Weave itself." },
      { title: "The Long Patience", content: "A High Elf strategy spanning centuries is still considered 'in progress'. Waiting three generations for an opening is just basic planning." },

      // Orc Lore
      { title: "The War Cry", content: "An orcish war cry is a rhythmic magical signature that coordinates thousands of warriors across miles without a single word." },
      { title: "Blood Forged", content: "Orcish weapons are tempered in a mixture of iron-rich mud and ceremonial intent, designed to break shields as much as to cut flesh." },
      { title: "Hierarchy of Scars", content: "In orcish culture, a scar is a record. A veteran warrior is a living map of their own history. Every conflict is marked on the skin." },

      // Dark Elf Lore
      { title: "The Shadow Weave", content: "Dark Elves use the residual energy left behind when magic interacts with the physical world. This 'Shadow Weave' is difficult to perceive but perfect for stealth." },
      { title: "The Silent Markets", content: "Dark Elf markets are silent. Transactions are conducted through sign language and magical cues, dealing in information and refined poisons." },
      { title: "The Web of Secrets", content: "Dark Elf society is a meritocracy of intelligence. Those who know the most secrets hold the most power. Information is the primary currency." },

      // Human Lore
      { title: "The Adaptation Gene", content: "The greatest human strength is flexibility. A kingdom can be a trade hub today, a military fortress tomorrow, and a center of learning the day after." },
      { title: "The Trade Hubs", content: "Human cities are the crossroads of Narmir. If you want a dwarf hammer, elven scroll, and orcish axe, you go to a human market." },
      { title: "The Human Spirit", content: "Humans have so little time, they fill it with as much life as possible. They build, love, fight, and fail — then do it all over again." },

      // Dire Wolf Lore
      { title: "The Pack Bond", content: "Dire Wolves share a communal consciousness. The Pack Bond is a mental link allowing a pack to move and think as a single unit." },
      { title: "The Language of Howls", content: "A howl is a data transfer. Subtle variations in pitch convey complex information about terrain and threats over vast distances." },
      { title: "The One Truth", content: "The pack survives; the individual remains part of the pack. This is the only law of the Dire Wolves. They do not fight for themselves; they fight for the bond." },
    ];
    for (const e of defaultLore) {
      await _db.run("INSERT INTO lore_entries (title, content) VALUES (?, ?)", [e.title, e.content]);
    }
  }

  // Seed default server_state row for regen tracking
  await _db.run(`
    INSERT OR IGNORE INTO server_state (key, value)
    VALUES ('last_regen_at', CAST(unixepoch() AS TEXT))
  `);

  return _db;
}

function getDb() {
  if (!_db) throw new Error('Database not initialised — call initDb() first');
  return _db;
}

module.exports = { initDb, getDb };
