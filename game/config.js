// src/game/config.js
// Configuration constants for game balancing and logic.

const config = {
  RACE_BONUSES: {
    high_elf:  { research: 1.25, magic: 1.20, economy: 1.05, military: 0.90, morale: 0.95, scribe: 1.20 },
    dwarf:     { construction: 1.20, war_machines: 1.25, economy: 1.202, magic: 0.75, research: 0.90, morale: 1.00, scribe: 0.85 },
    dire_wolf: { military: 1.30, covert: 1.10, research: 0.60, magic: 0.25, economy: 0.80, morale: 1.10, scribe: 0.80 },
    dark_elf:  { covert: 1.25, stealth: 1.30, magic: 1.10, military: 0.85, economy: 0.90, morale: 0.90, scribe: 1.10 },
    human:     { economy: 1.50, morale: 1.05, scribe: 1.05 },
    orc:       { military: 1.20, economy: 1.10, research: 0.80, magic: 0.65, construction: 0.90, morale: 1.05, scribe: 0.60 },
  },

  REGION_DATA: {
    dwarf:     { name: 'The Iron Holds',      bonus: 'construction', mult: 0.05, lore: 'Ancient mountain citadels carved from living rock, where forge-fires have burned unbroken for a thousand years.' },
    high_elf:  { name: 'The Silverwood',      bonus: 'magic',        mult: 0.05, lore: 'A vast enchanted forest where moonlight pools in crystal streams and every leaf hums with residual arcane power.' },
    orc:       { name: 'The Bloodplains',     bonus: 'military',     mult: 0.05, lore: 'Endless scarred steppe where the ground itself is soaked with the memory of ten thousand wars.' },
    dark_elf:  { name: 'The Underspire',      bonus: 'stealth',      mult: 0.05, lore: 'A labyrinthine underground city of obsidian towers and shadow-markets, where every corridor hides a blade.' },
    human:     { name: 'The Heartlands',      bonus: 'economy',      mult: 0.05, lore: 'Fertile central plains criss-crossed by ancient trade roads, where every crossroads is a kingdom in miniature.' },
    dire_wolf: { name: 'The Ashfang Wilds',   bonus: 'military',     mult: 0.05, lore: 'Primal wilderness of ash-grey forest and howling ravines, where only the strong survive the first winter.' },
  },

  UNIT_COST: 250,
  MAX_RESEARCH: 1000,

  HOUSING_CAP_BY_RACE: {
    dwarf:     650, orc: 600, human: 500, dark_elf: 450, high_elf: 350, dire_wolf: 700,
  },

  TROOP_RACE_BONUS: {
    high_elf:  { clerics: 1.5, mages: 1.5, researchers: 1.3 },
    dwarf:     { fighters: 1.3, engineers: 1.5 },
    dire_wolf: { fighters: 1.8, rangers: 1.5 },
    dark_elf:  { ninjas: 1.8, thieves: 1.5, rangers: 1.3 },
    human:     { fighters: 1.1, rangers: 1.1, clerics: 1.1, mages: 1.1, thieves: 1.1, ninjas: 1.1 },
    orc:       { fighters: 1.6, clerics: 1.2 },
  },

  WALL_STRENGTH_MULT: { human:1.00, dwarf:1.35, high_elf:1.10, orc:0.85, dark_elf:0.90, dire_wolf:0.80 },
  TOWER_DETECT_MULT: { human:1.00, dwarf:1.00, high_elf:1.10, orc:0.80, dark_elf:1.40, dire_wolf:0.70 },
  OUTPOST_RANGER_MULT: { human:1.00, dwarf:0.80, high_elf:0.95, orc:0.90, dark_elf:1.30, dire_wolf:1.40 },

  WALL_UPGRADES: {
    reinforced:    { name:'Reinforced Walls',  cost:10000,  desc:'+25% wall strength, −10% land lost per attack',      requires:null          },
    battlements:   { name:'Battlements',       cost:30000,  desc:'Guard towers +20% effectiveness',                    requires:'reinforced'  },
    fortress_walls:{ name:'Fortress Walls',    cost:100000, desc:'War machines on walls deal +50% damage',             requires:'battlements' },
  },

  TOWER_DEF_UPGRADES: {
    arrow_slits:   { name:'Arrow Slits',       cost:5000,   desc:'+20% ranged defense from guard towers',              requires:null           },
    watchtower:    { name:'Watchtower',         cost:20000,  desc:'Thieves detect incoming attacks 1 turn early',       requires:'arrow_slits'  },
    signal_tower:  { name:'Signal Tower',       cost:50000,  desc:'Attack warnings shared with alliance members',       requires:'watchtower'   },
  },

  OUTPOST_UPGRADES: {
    ranger_station:{ name:'Ranger Station',    cost:5000,   desc:'+25% ranger patrol effectiveness',                   requires:null              },
    forward_camp:  { name:'Forward Camp',       cost:20000,  desc:'Rangers detect incoming expeditions targeting land', requires:'ranger_station'  },
    field_hq:      { name:'Field Headquarters', cost:60000,  desc:'Expedition rangers return with +10% gold bonus',    requires:'forward_camp'    },
  },

  CITADEL_REQ: { walls:50, guard_towers:20, outposts:20, castles:1 },

  SEASON_ORDER: ['spring','summer','fall','winter'],
  SEASON_DURATION: { spring:3, summer:5, fall:2, winter:3 },
  SEASON_FARM_MULT: { spring:1.10, summer:1.20, fall:0.90, winter:0.70 },
  SEASON_ICONS: { spring:'🌸', summer:'☀️', fall:'🍂', winter:'❄️' },

  LOCATE_RACE_MULT: { human:1.00, dwarf:0.80, high_elf:0.95, orc:0.90, dark_elf:1.30, dire_wolf:1.40 },

  FARM_YIELD_MULT:       { human:1.00, dwarf:0.90, high_elf:1.15, orc:0.85, dark_elf:0.95, dire_wolf:0.80 },
  FARM_WORKERS_PER:      { human:10,   dwarf:8,    high_elf:12,   orc:15,   dark_elf:10,   dire_wolf:12   },
  FOOD_CONSUMPTION_MULT: { human:1.00, dwarf:0.85, high_elf:0.80, orc:1.35, dark_elf:0.95, dire_wolf:1.40 },
  MARKET_INCOME_MULT:    { human:1.00, dwarf:1.25, high_elf:1.10, orc:0.85, dark_elf:1.05, dire_wolf:0.75 },
  TRADE_RATE_MULT:       { human:1.00, dwarf:1.15, high_elf:1.20, orc:0.80, dark_elf:1.30, dire_wolf:0.70 },

  COMMODITY_VALUES: { food:2, weapons:6, armor:8, mana:4, maps:50, scrolls:200, blueprints:150, war_machines: 500, land: 2000 },
  COMMODITY_RACE_DISCOUNT: {
    dwarf:    { weapons:0.85, armor:0.85 },
    high_elf: { scrolls:0.80, mana:0.85 },
    dark_elf: { _all:0.90 },
    orc:      { food:1.20 },
    dire_wolf:{ maps:0.80 },
    human:    {},
  },

  TOWER_UPGRADES: {
    arcane_focus:      { name:'Arcane Focus',       cost:5000,  desc:'+25% mana production per turn',           requires:null             },
    ley_line_tap:      { name:'Ley Line Tap',        cost:20000, desc:'Towers passively generate scroll energy', requires:'arcane_focus'   },
    sanctum_of_power:  { name:'Sanctum of Power',    cost:75000, desc:'All spells twice as effective',          requires:'ley_line_tap'   },
  },

  SCHOOL_UPGRADES: {
    advanced_curriculum: { name:'Advanced Curriculum', cost:3000,  desc:'+20% research output per turn',        requires:null                   },
    repository:          { name:'Repository',           cost:12000, desc:'Unlocks a second research discipline', requires:'advanced_curriculum'  },
    grand_academy:       { name:'Grand Academy',        cost:40000, desc:'Researchers gain XP 50% faster',      requires:'repository'           },
  },

  SHRINE_UPGRADES: {
    sacred_grove:      { name:'Sacred Grove',       cost:4000,  desc:'+15% morale gain from shrines per turn',             requires:null            },
    war_blessing:      { name:'War Blessing',        cost:15000, desc:'Clerics heal +10% more casualties in combat',        requires:'sacred_grove'  },
    divine_sanctuary:  { name:'Divine Sanctuary',    cost:50000, desc:'Auto-stabilise morale at 50% once per 20 turns, posted to news', requires:'war_blessing' },
  },

  LIBRARY_UPGRADES: {
    surveyors_eyrie:  { name:'The Surveyor\'s Eyrie', cost:25000, desc:'Surveyors have a 20% chance of finding a location', requires:null },
    mason_sigil:      { name:'The Master Mason\'s Sigil', cost:150000, desc:'Buildings constructed with Certified plans are more resistant to attacks', requires:'surveyors_eyrie' },
    specimen_vault:   { name:'The Specimen Vault', cost:50000, desc:'Study World Fragments to create Hybrid Blueprints', requires:'mason_sigil' }
  },

  FARM_UPGRADES: {
    irrigated:  { name:'Irrigated Farm', cost:500,   yieldBonus:0.30, requires:null         },
    granary:    { name:'Granary',        cost:2000,  bufferTurns:10,  requires:null         },
    plantation: { name:'Plantation',     cost:10000, yieldBonus:0.60, requires:'irrigated'  },
  },

  MARKET_UPGRADES: {
    trading_post: { name:'Trading Post', cost:5000,  unlocksTrade:true,      requires:null            },
    bazaar:       { name:'Bazaar',       cost:50000, incomeBonus:0.50,       requires:'trading_post'  },
    black_market: { name:'Black Market', cost:15000, raceOnly:'dark_elf',    requires:'trading_post'  },
  },

  TAVERN_UPGRADES: {
    inn:        { name:'Inn',        cost:8000,  unlocksMercTier:'sellsword', requires:null  },
    guild_hall: { name:'Guild Hall', cost:30000, unlocksMercTier:'veteran',   requires:'inn' },
  },

  MERC_TIERS: {
    rabble:    { levelMin:5,  levelMax:10, costPer:50,   duration:10, upkeepPct:0.25, requires:null         },
    sellsword: { levelMin:15, levelMax:25, costPer:150,  duration:20, upkeepPct:0.25, requires:'inn'        },
    veteran:   { levelMin:30, levelMax:45, costPer:400,  duration:30, upkeepPct:0.25, requires:'guild_hall' },
    elite:     { levelMin:50, levelMax:65, costPer:1000, duration:40, upkeepPct:0.25, requires:'guild_hall' },
  },

  XP_RACE_BONUS: {
    high_elf:  { research: 1.5, magic: 1.5 },
    dwarf:     { construction: 1.5, economy: 1.25 },
    dire_wolf: { combat: 1.5, exploration: 1.25 },
    dark_elf:  { covert: 1.5, magic: 1.25 },
    human:     { all: 1.10 },
    orc:       { combat: 1.25, economy: 1.25 },
  },

  XP_BASE: {
    turn:         10,
    gold_earned:  0.001,
    combat_win:   500,
    combat_loss:  100,
    research:     50,
    construction: 20,
    exploration:  5,
    spell_cast:   0.01,
    covert_op:    150,
  },

  BUILDING_COST: {
    farms: 2500, barracks: 5000, outposts: 7500, guard_towers: 2500,
    schools: 7500, armories: 2500, vaults: 10000, smithies: 10000,
    markets: 10000, mage_towers: 15000, shrines: 500, training: 20000,
    castles: 100000, libraries: 10000, housing: 5000, walls: 500, taverns: 3000,
    war_machines: 1000, weapons: 10, armor: 10,
  },

  BUILDING_GOLD_COST: {
    farms: 50, barracks: 200, outposts: 150, guard_towers: 150,
    schools: 500, armories: 400, vaults: 400, smithies: 800,
    markets: 2000, mage_towers: 3000, shrines: 1000, training: 10000,
    castles: 25000, libraries: 2000, housing: 500, walls: 300, taverns: 1000,
    war_machines: 100, weapons: 100, armor: 150,
  },

  BUILDING_LAND_COST: {
    farms: 1, barracks: 1, outposts: 1, guard_towers: 1, armories: 1, vaults: 1,
    schools: 2, smithies: 2, markets: 2, shrines: 2, libraries: 2,
    housing: 1,
    mage_towers: 5, training: 5,
    castles: 10,
    war_machines: 0, weapons: 0, armor: 0,
  },

  SPELL_DEFS: {
    spark:      { minSB: 100,  tier: 1, effect: 'buildings',   damageType: 'fire',    desc: 'Burns a small number of enemy farms' },
    fog_of_war: { minSB: 150,  tier: 1, effect: 'debuff',      damageType: 'illusion',desc: 'Blinds enemy rangers for 3 turns', duration: 3 },
    mend:       { minSB: 200,  tier: 1, effect: 'friendly',    damageType: 'none',    desc: 'Heals your own troop casualties from last battle' },
    blight:     { minSB: 250,  tier: 1, effect: 'debuff',      damageType: 'poison',  desc: 'Poisons enemy food supply for 5 turns', duration: 5 },
    rain:       { minSB: 300,  tier: 1, effect: 'buildings',   damageType: 'cool',    desc: 'Floods enemy farms — more damage than Spark' },
    dispel:     { minSB: 400,  tier: 1, effect: 'friendly',    damageType: 'none',    desc: 'Removes all active curses and debuffs from your kingdom' },
    lightning:  { minSB: 500,  tier: 2, effect: 'troops',      damageType: 'strike',  desc: 'Strikes down enemy fighters' },
    bless:      { minSB: 600,  tier: 2, effect: 'friendly',    damageType: 'none',    desc: 'Boosts morale and population growth for 5 turns', duration: 5 },
    silence:    { minSB: 700,  tier: 2, effect: 'debuff',      damageType: 'mental',  desc: 'Suppresses enemy research progress for 3 turns', duration: 3 },
    amnesia:    { minSB: 800,  tier: 2, effect: 'research',    damageType: 'mental',  desc: 'Permanently wipes a chunk of enemy economy research' },
    drain:      { minSB: 900,  tier: 2, effect: 'mana',        damageType: 'arcane',  desc: 'Siphons mana from enemy kingdom to yours' },
    plague:     { minSB: 1000, tier: 3, effect: 'population',  damageType: 'disease', desc: 'Kills enemy population over 5 turns', duration: 5 },
    earthquake: { minSB: 1200, tier: 3, effect: 'buildings',   damageType: 'force',   desc: 'Destroys buildings across all types' },
    tempest:    { minSB: 1400, tier: 3, effect: 'troops',      damageType: 'storm',   desc: 'Kills all troop types simultaneously' },
    shield:     { minSB: 1500, tier: 3, effect: 'friendly',    damageType: 'none',    desc: 'Reduces incoming spell damage by 50% for 5 turns', duration: 5 },
    armageddon: { minSB: 2000, tier: 4, effect: 'catastrophic',damageType: 'void',    desc: 'Destroys land, buildings, and population simultaneously. One cast, total devastation.' },
  },

  SCROLL_REQUIREMENTS: {
    blank_scroll: { mages: 5,   turns: 5  },
    spark:      { mages: 5,   turns: 5  },
    fog_of_war: { mages: 8,   turns: 8  },
    mend:       { mages: 8,   turns: 10 },
    blight:     { mages: 10,  turns: 12 },
    rain:       { mages: 10,  turns: 15 },
    dispel:     { mages: 12,  turns: 15 },
    lightning:  { mages: 15,  turns: 20 },
    bless:      { mages: 15,  turns: 20 },
    silence:    { mages: 20,  turns: 25 },
    amnesia:    { mages: 20,  turns: 30 },
    drain:      { mages: 25,  turns: 30 },
    plague:     { mages: 30,  turns: 40 },
    earthquake: { mages: 35,  turns: 50 },
    tempest:    { mages: 40,  turns: 60 },
    shield:     { mages: 40,  turns: 60 },
    armageddon: { mages: 100, turns: 200 },
  },

  SCRIBE_ITEMS: {
    map:          { scribes: 3,  turns: 10, desc: 'Required to interact with another kingdom' },
    blueprint:    { scribes: 5,  turns: 20, desc: 'Boosts construction speed by 10% when used' },
    certified_blueprint: { scribes: 20, turns: 60, desc: 'Required for constructing Master Mason Certified structures' },
    location_map: { scribes: 10, turns: 5,  desc: 'Uses 1 map to scribe an unmapped location into a usable map' },
    hybrid_blueprint: { scribes: 100, turns: 500, desc: 'Study a World Fragment to randomly devise a unique building upgrade' },
  },

  SUPPORT_CAP_RACE: {
    high_elf:  { researcher: 1.5, engineer: 1.0, scribe: 1.5 },
    dwarf:     { researcher: 0.9, engineer: 1.5, scribe: 1.0 },
    dire_wolf: { researcher: 0.7, engineer: 1.0, scribe: 0.7 },
    dark_elf:  { researcher: 1.2, engineer: 0.9, scribe: 1.3 },
    human:     { researcher: 1.0, engineer: 1.0, scribe: 1.0 },
    orc:       { researcher: 0.8, engineer: 1.2, scribe: 0.8 },
  },

  WM_CREW_REQUIRED: {
    dwarf: 2, human: 3, high_elf: 4, dark_elf: 4, orc: 5, dire_wolf: 6,
  },

  RESEARCH_MAP: {
    economy:      'res_economy',
    weapons:      'res_weapons',
    armor:        'res_armor',
    military:     'res_military',
    spellbook:    'res_spellbook',
    attack_magic: 'res_attack_magic',
    defense_magic:'res_defense_magic',
    entertainment:'res_entertainment',
    construction: 'res_construction',
    war_machines: 'res_war_machines',
  },

  BUILDING_ALIASES: {
    farm: 'farms',
    outpost: 'outposts',
    tower: 'guard_towers',
    school: 'schools',
    armory: 'armories',
    vault: 'vaults',
    smithy: 'smithies',
    market: 'markets',
    mage_tower: 'mage_towers',
    shrine: 'shrines',
    castle: 'castles',
    library: 'libraries',
    tavern: 'taverns',
    weapon: 'weapons',
    armour: 'armor'
  },

  RACIAL_UNITS: {
    high_elf:  'mages',
    dwarf:     'engineers',
    dire_wolf: 'fighters',
    dark_elf:  'ninjas',
    human:     'clerics',
    orc:       'fighters',
  },

  RACIAL_BONUSES_DEFS: {
    mages:     { name: 'Mage Mastery',      desc: '+25% mana cap, +10% spell resistance' },
    engineers: { name: 'Mason Mastery',     desc: '+20% structure HP, -15% maintenance cost' },
    fighters:  { name: 'Warrior Mastery',    desc: '+15% raw combat strength' },
    ninjas:    { name: 'Shadow Mastery',     desc: 'Assassinate 5% extra troops per combat' },
    clerics:   { name: 'Divine Mastery',     desc: '+20% healing, +10% morale stability' },
  },

  WORLD_FRAGMENTS: [
    'Volcanic Rock', 'Ancient Elven Wood', 'Dragon Scale', 'Abyssal Crystal',
    'Celestial Feather', 'Dwarven Star-Metal', 'Cursed Bloodstone',
    'Tears of the World Tree', 'Void Essence', 'Titan Bone'
  ],

  JUNK_PRIZES: [
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
  ],

  ULTRA_RARE_PRIZES: [
    {
      id: 'ancient_dragon_egg',
      text: '🥚 An ancient dragon egg, still warm — it pulses with primordial magic',
      effect: (k, updates) => {
        updates.res_attack_magic = (k.res_attack_magic || 0) + 75;
        updates.res_spellbook    = (k.res_spellbook    || 0) + 50;
        updates.mana             = (k.mana             || 0) + 5000;
      },
    },
    {
      id: 'tome_of_forgotten_kings',
      text: "📖 The Tome of Forgotten Kings — ancient military wisdom permanently inscribed in your kingdom's history",
      effect: (k, updates) => {
        updates.res_military = (k.res_military || 0) + 80;
        updates.res_weapons  = (k.res_weapons  || 0) + 50;
        updates.res_armor    = (k.res_armor    || 0) + 50;
      },
    },
    {
      id: 'crystalline_mana_heart',
      text: '💎 A crystalline mana heart — it hums with a frequency older than the world itself',
      effect: (k, updates) => {
        updates.mana              = (k.mana              || 0) + 20000;
        updates.res_defense_magic = (k.res_defense_magic || 0) + 60;
        updates.res_spellbook     = (k.res_spellbook     || 0) + 100;
      },
    },
    {
      id: 'vault_of_the_ancients',
      text: '💰 A sealed vault of the Ancient Ones — untold riches beyond imagining',
      effect: (k, updates) => {
        updates.gold        = (k.gold        || 0) + 500000;
        updates.res_economy = (k.res_economy || 0) + 60;
      },
    },
    {
      id: 'lost_legion_banner',
      text: '⚔️ The Banner of the Lost Legion — ten thousand warriors emerge from the mist and pledge their eternal service',
      effect: (k, updates) => {
        updates.fighters     = (k.fighters     || 0) + 10000;
        updates.res_military = (k.res_military || 0) + 40;
      },
    },
    {
      id: 'seed_of_the_world_tree',
      text: '🌳 The Seed of the World Tree — your lands bloom with ancient fertility',
      effect: (k, updates) => {
        updates.land       = (k.land       || 0) + 500;
        updates.bld_farms  = (k.bld_farms  || 0) + 100;
        updates.population = (k.population || 0) + 50000;
      },
    },
  ],

  THRONE_OF_NAZDREG: {
    id: 'throne_of_nazdreg',
    unique: true,
    text: [
      '👑 The Throne of Nazdreg Grishnak',
      '',
      'Your rangers stumble upon a clearing unlike any other.',
      'Vines have claimed it, but beneath the green — a throne of obsidian and iron,',
      'carved with the fury and grace of a warrior who loved deeply and lived fully.',
      '',
      'Inscribed in the stone, worn smooth by years of wilderness rain:',
      '',
      '    Nazdreg Grishnak',
      '    August 13, 1975 — August 19, 2012',
      '',
      'An orc who sat upon this throne once commanded armies and shaped the world.',
      'His name is remembered. His legacy endures.',
      '',
      'Your people carry the throne home with reverence.',
      'They say the land itself feels stronger for it.',
    ].join('\n'),
    effect: (k, updates) => {
      updates.res_military      = (k.res_military      || 0) + 100;
      updates.res_economy       = (k.res_economy       || 0) + 100;
      updates.res_construction  = (k.res_construction  || 0) + 100;
      updates.res_weapons       = (k.res_weapons       || 0) + 100;
      updates.res_armor         = (k.res_armor         || 0) + 100;
      updates.res_entertainment = (k.res_entertainment || 0) + 100;
      updates.gold              = (k.gold              || 0) + 1000000;
      updates.land              = (k.land              || 0) + 1000;
      updates.population        = (k.population        || 0) + 100000;
      const natCap = (k.res_entertainment || 0) + 100; // approximation of new cap
      updates.morale            = Math.min(natCap * 2, (k.morale || 100) + Math.floor(natCap * 0.5));
      updates.fighters          = (k.fighters          || 0) + 50000;
    },
  },

  EXPEDITION_TURNS: { scout: 10, deep: 25, dungeon: 50 },

  LORE_EVENTS: (function() {
    const events = {
      high_elf: [
        { id: "he_1", title: "Lunar Eclipse", msg: "A rare lunar eclipse has bathed the Silverwood in violet light. Your mages report that the Ley Lines are thrumming with ancient resonance." },
        { id: "he_2", title: "Vision of the First Age", msg: "The High Council of Elders has shared a vision of the First Age. Immersion in history has bolstered your kingdom's prestige." },
        { id: "he_3", title: "Envoy from Hidden Glade", msg: "A diplomatic envoy from the Hidden Glade has arrived, bringing scrolls of forgotten poetry and architectural secrets." }
      ],
      dwarf: [
        { id: "dw_1", title: "Living Granite Vein", msg: "Deep-scouts have uncovered a vein of 'Living Granite' in the lower depths of the Iron Holds. Ancient runic carvings confirm it was intended for a Great Gate." },
        { id: "dw_2", title: "Week of Remembrance", msg: "The Brewmaster's Guild has declared a week of Remembrance. Hammers fall silent as the songs of the ancestors fill the great caverns." },
        { id: "dw_3", title: "Archive of Steam", msg: "A massive steam-burst in the Geyser-Works revealed a cached archive of steam-engine blueprints from the Era of Industry." }
      ],
      dire_wolf: [
        { id: "di_1", title: "Gathering under Ashfang", msg: "A great pack-gathering occurred under the Ashfang moon. The elders spoke of the 'First Hunt' and the blood-ties that bind the wilds." },
        { id: "di_2", title: "Monolith of Bone", msg: "A blizzard has unearthed an ancient monolith of bone. Your trackers sense a lingering aura of the Great Pack-Mother." },
        { id: "di_3", title: "Scent of Old Magic", msg: "The winds from the northern peaks carry the scent of old magic. Your rangers find signs of the spirit-kin returning to the Ash-Tainted groves." }
      ],
      dark_elf: [
        { id: "da_1", title: "Quiet Night-Market", msg: "The Night-Market in Underspire was unusually quiet tonight. Rumors of the 'Silent Treaty' are circulating among the shadow-cloaks." },
        { id: "da_2", title: "Mural of Matriarch", msg: "A collapse in the lower tunnels revealed a mural depicting the descent of the First Matriarch. The historical weight is palpable." },
        { id: "da_3", title: "Cipher Decoded", msg: "The Poisoner's Guild has decoded a cipher from the Age of Betrayal. Subtle shifts in the power balance follow." }
      ],
      human: [
        { id: "hu_1", title: "Saga of the Unbroken", msg: "A traveling troupe of bards in the Heartlands is performing the 'Saga of the Unbroken Kingdom'. Loyalty to the throne swells." },
        { id: "hu_2", title: "Antique Ledgers", msg: "A hidden cellar in a crossroads inn yielded a collection of antique trade ledgers dating back to the Merchant-King's reign." },
        { id: "hu_3", title: "Harvest Festival", msg: "The harvest festival this year is particularly vibrant. Eldest villagers recount tales of the land's bounty before the Great Sundering." }
      ],
      orc: [
        { id: "or_1", title: "War-drums of Bloodplains", msg: "The war-drums of the Bloodplains beat with a rhythm not heard for generations. The spirit of the Great Khan is said to be stirring." },
        { id: "or_2", title: "Ghosts of Old Guard", msg: "A trial by combat near the Scarred Monolith ended in a draw, with both warriors claiming they saw the ghosts of the Old Guard." },
        { id: "or_3", title: "Cache of Axe-heads", msg: "Your scouts found a buried cache of obsidian axe-heads. The craftsmanship predates even the earliest known Orcish settlements." }
      ]
    };
    return events;
  })(),

  CAPS: {
    fighters:  { base: 500,    max: 5000000  },
    rangers:   { base: 250,    max: 2000000  },
    clerics:   { base: 100,    max: 1000000  },
    mages:     { base: 100,    max: 1000000  },
    thieves:   { base: 100,    max: 500000   },
    ninjas:    { base: 50,     max: 250000   },
    bld_walls:         { base: 500,   max: 1000000 },
    bld_barracks:     { base: 10,    max: 50000   },
    bld_outposts:     { base: 10,    max: 25000   },
    bld_guard_towers: { base: 10,    max: 25000   },
    bld_schools:      { base: 5,     max: 10000   },
    bld_armories:     { base: 5,     max: 10000   },
    bld_vaults:       { base: 5,     max: 10000   },
    bld_smithies:     { base: 5,     max: 5000    },
    bld_markets:      { base: 3,     max: 5000    },
    bld_mage_towers:   { base: 3,     max: 5000    },
    bld_training:     { base: 2,     max: 2000    },
    bld_castles:      { base: 1,     max: 500     },
    war_machines:     { base: 1000,  max: 10000   },
    res_economy:       { base: 100,  max: 10000 },
    res_weapons:       { base: 100,  max: 10000 },
    res_armor:         { base: 100,  max: 10000 },
    res_military:      { base: 100,  max: 10000 },
    res_spellbook:     { base: 500,  max: 500000 },
    res_attack_magic:  { base: 100,  max: 10000 },
    res_defense_magic: { base: 100,  max: 10000 },
    res_entertainment: { base: 100,  max: 10000 },
    res_construction:  { base: 100,  max: 10000 },
    res_war_machines:  { base: 100,  max: 10000 },
  },

  BUILDING_COL: {
    farms: 'bld_farms', barracks: 'bld_barracks', outposts: 'bld_outposts',
    guard_towers: 'bld_guard_towers', schools: 'bld_schools', armories: 'bld_armories',
    vaults: 'bld_vaults', smithies: 'bld_smithies', markets: 'bld_markets',
    mage_towers: 'bld_mage_towers', shrines: 'bld_shrines', training: 'bld_training',
    castles: 'bld_castles', libraries: 'bld_libraries',
    housing: 'bld_housing', walls: 'bld_walls', taverns: 'bld_taverns',
    war_machines: 'war_machines', weapons: 'weapons_stockpile', armor: 'armor_stockpile',
  },

  TOOL_COL: { hammers: 'hammers_stored', scaffolding: 'scaffolding_stored', blueprints: 'blueprints_stored' },
  TOOL_GOLD_COST: { hammers: 0, scaffolding: 2500, blueprints: 0 },

  BLUEPRINT_REQUIRED: ['vaults','smithies','markets','mage_towers','training','castles','libraries'],
  SCAFFOLDING_REQUIRED: ['mage_towers','training','castles'],
  SCAFFOLDING_BONUS_BUILDINGS: ['farms','barracks','outposts','guard_towers','schools','armories','shrines','housing'],

  HERO_CLASSES: {
    paladin: {
      name: "Paladin",
      description: "Holy warrior who protects troops and heals casualties.",
      abilities: ["Protective Aura", "Holy Heal", "Unyielding Faith"],
      recruitCost: 50000,
      recruitMana: 10000,
      statBonus: { military: 1.10, morale: 1.15 }
    },
    archmage: {
      name: "Archmage",
      description: "Master of the arcane who boosts mana and spell power.",
      abilities: ["Arcane Infusion", "Mana Surge", "Elemental Storm"],
      recruitCost: 50000,
      recruitMana: 25000,
      statBonus: { magic: 1.25, research: 1.10 }
    },
    warlord: {
      name: "Warlord",
      description: "Battle-hardened leader who maximizes military might.",
      abilities: ["War Cry", "Tactical Mastery", "Bloodlust"],
      recruitCost: 75000,
      recruitMana: 5000,
      statBonus: { military: 1.25, morale: 1.10 }
    },
    shadowblade: {
      name: "Shadowblade",
      description: "Lethal assassin who excels in covert operations.",
      abilities: ["Deadly Strike", "Shadow Veil", "Infiltrator"],
      recruitCost: 60000,
      recruitMana: 15000,
      statBonus: { covert: 1.30, stealth: 1.20 }
    },
    sovereign: {
      name: "Sovereign",
      description: "Charismatic leader who focuses on prosperity and growth.",
      abilities: ["Royal Decree", "Golden Touch", "Inspiring Presence"],
      recruitCost: 100000,
      recruitMana: 10000,
      statBonus: { economy: 1.20, morale: 1.20, population: 1.10 }
    }
  },
};

const fs = require('fs');
const path = require('path');
try {
  const overridesPath = path.join(__dirname, 'config_overrides.json');
  if (fs.existsSync(overridesPath)) {
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    for (const key of Object.keys(overrides)) {
      if (typeof overrides[key] === 'object' && config[key] && !Array.isArray(config[key])) {
        Object.assign(config[key], overrides[key]);
      } else {
        config[key] = overrides[key];
      }
    }
  }
} catch (e) {
  console.error('[CONFIG] Error loading overrides:', e.message);
}

module.exports = config;
