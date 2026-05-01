const bcrypt = require('bcryptjs');

const AI_KINGDOMS = [
  { username: 'ai_ironforge',   kingdomName: 'Ironforge Hold',     race: 'dwarf'     },
  { username: 'ai_shadowveil',  kingdomName: 'Shadowveil Enclave', race: 'dark_elf'  },
  { username: 'ai_stormfang',   kingdomName: 'Stormfang Warpack',  race: 'dire_wolf' },
  { username: 'ai_silverwind',  kingdomName: 'Silverwind Spire',   race: 'high_elf'  },
  { username: 'ai_grimtusk',    kingdomName: 'Grimtusk Horde',     race: 'orc'       },
  { username: 'ai_ashenvale',   kingdomName: 'Ashenvale Republic', race: 'human'     },
  { username: 'ai_deepdelve',   kingdomName: 'Deepdelve Citadel',  race: 'dwarf'     },
  { username: 'ai_nightshade',  kingdomName: 'Nightshade Court',   race: 'dark_elf'  },
  { username: 'ai_bloodmoon',   kingdomName: 'Bloodmoon Clan',     race: 'orc'       },
  { username: 'ai_crystalpeak', kingdomName: 'Crystalpeak Tower',  race: 'high_elf'  },
];

async function seedAiKingdoms(db) {
  let seeded = 0;
  for (const ai of AI_KINGDOMS) {
    const existing = await db.get('SELECT id FROM players WHERE username = ?', [ai.username]);
    if (existing) continue;
    const hash = bcrypt.hashSync(Math.random().toString(36), 8);
    const player = await db.run(
      'INSERT INTO players (username, password, is_ai) VALUES (?, ?, 1)',
      [ai.username, hash]
    );
    await db.run(
      `INSERT INTO kingdoms (player_id, name, race, gold, land, population,
        researchers, engineers, rangers, turns_stored, res_spellbook, blueprints_stored,
        bld_farms, bld_schools, bld_barracks, bld_armories, bld_housing, world_fragments)
       VALUES (?, ?, ?, 10000, 504, 50000, 100, 100, 50, 400, 0, 1, 200, 1, 1, 1, 100, '["Volcanic Rock", "Ancient Elven Wood", "Dragon Scale", "Abyssal Crystal", "Celestial Feather", "Dwarven Star-Metal", "Cursed Bloodstone", "Tears of the World Tree", "Void Essence", "Titan Bone"]')`,
      [player.lastID, ai.kingdomName, ai.race]
    );
    seeded++;
    console.log(`[ai] Seeded: ${ai.kingdomName} (${ai.race})`);
  }
  return seeded;
}

module.exports = { AI_KINGDOMS, seedAiKingdoms };
