const express = require('express');
const { requireAuth } = require('./middleware');
const engine = require('../game/engine');

module.exports = function(db) {
  const router = express.Router();

  // List all heroes owned by the kingdom
  router.get('/list', requireAuth, async (req, res) => {
    const k = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    if (!k) return res.status(404).json({ error: 'Kingdom not found' });

    const heroes = await db.all('SELECT * FROM heroes WHERE kingdom_id = ?', [k.id]);
    res.json(heroes);
  });

  // Get hero classes and stats
  router.get('/classes', requireAuth, (req, res) => {
    res.json(engine.HERO_CLASSES);
  });

  // Recruit a new hero
  router.post('/recruit', requireAuth, async (req, res) => {
    const { name, heroClass } = req.body;
    if (!name || !heroClass) return res.status(400).json({ error: 'Name and class required' });

    const k = await db.get('SELECT * FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    if (!k) return res.status(404).json({ error: 'Kingdom not found' });

    // Check current hero count
    const existingCount = await db.get('SELECT COUNT(*) as count FROM heroes WHERE kingdom_id = ?', [k.id]);
    const maxHeroes = 1 + Math.floor((k.bld_castles || 0) / 3); // 1 base, +1 per 3 castles
    if (existingCount.count >= maxHeroes) {
      return res.status(400).json({ error: `You can only have ${maxHeroes} heroes. Build more Castles to increase your capacity.` });
    }

    const { hero, cost, error } = engine.recruitHero(k, name, heroClass);
    if (error) return res.status(400).json({ error });

    try {
      await db.run('BEGIN TRANSACTION');
      
      const result = await db.run(
        `INSERT INTO heroes (kingdom_id, name, class, level, xp, abilities, status, hp, max_hp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [k.id, hero.name, hero.class, hero.level, hero.xp, hero.abilities, hero.status, hero.hp, hero.max_hp]
      );
      
      await db.run(
        'UPDATE kingdoms SET gold = gold - ?, mana = mana - ? WHERE id = ?',
        [cost.gold, cost.mana, k.id]
      );

      await db.run(
        'INSERT INTO news (kingdom_id, type, message, turn_num) VALUES (?, ?, ?, ?)',
        [k.id, 'system', `✨ ${hero.name} the ${heroClass} has joined your cause!`, k.turn]
      );
      
      await db.run('COMMIT');
      
      res.json({ ok: true, heroId: result.lastID });
    } catch (err) {
      await db.run('ROLLBACK');
      console.error('[recruit] error:', err.message);
      res.status(500).json({ error: 'Recruitment failed' });
    }
  });

  // Dismiss a hero
  router.post('/dismiss', requireAuth, async (req, res) => {
    const { heroId } = req.body;
    const k = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    if (!k) return res.status(404).json({ error: 'Kingdom not found' });

    const hero = await db.get('SELECT name FROM heroes WHERE id = ? AND kingdom_id = ?', [heroId, k.id]);
    if (!hero) return res.status(404).json({ error: 'Hero not found' });

    await db.run('DELETE FROM heroes WHERE id = ?', [heroId]);
    res.json({ ok: true, message: `${hero.name} has been dismissed.` });
  });

  return router;
};
