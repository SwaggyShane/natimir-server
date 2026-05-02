const LORE = {
  narmir: [
    { id: 'narmir_1', title: 'The First Age', msg: 'The world of Narmir was forged in the fire of the ancients...' },
    // Fill in 24 more placeholders automatically via code below (so they are editable later)
  ],
  general: [
    { id: 'general_1', title: 'A Wanderer\'s Note', msg: 'A mysterious traveler left this note behind at the local tavern.' },
  ],
  dwarf: [],
  high_elf: [],
  orc: [],
  dark_elf: [],
  human: [],
  dire_wolf: []
};

// Auto-populate up to 25 items each so the user has placeholders to edit
const cats = ['narmir', 'general', 'dwarf', 'high_elf', 'orc', 'dark_elf', 'human', 'dire_wolf'];
cats.forEach(c => {
  const currentCount = LORE[c].length;
  for (let i = currentCount + 1; i <= 25; i++) {
    LORE[c].push({
      id: `${c}_${i}`,
      title: `${c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ')} Lore Vol. ${i}`,
      msg: `[Placeholder for ${c} lore entry ${i}. You can edit this in game/lore.js]`
    });
  }
});

module.exports = LORE;
