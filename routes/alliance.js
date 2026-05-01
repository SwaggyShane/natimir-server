const express = require('express');
const { requireAuth } = require('./middleware');

const router = express.Router();

module.exports = function(db) {

  router.get('/list', requireAuth, async (_req, res) => {
    const rows = await db.all(`
      SELECT a.id, a.name, k.name AS leader_name, COUNT(am.kingdom_id) as member_count
      FROM alliances a
      JOIN kingdoms k ON a.leader_id = k.id
      JOIN alliance_members am ON am.alliance_id = a.id
      GROUP BY a.id ORDER BY member_count DESC, a.name ASC
    `);
    res.json(rows);
  });

  router.get('/my', requireAuth, async (req, res) => {
    const kingdom = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    const membership = await db.get('SELECT * FROM alliance_members WHERE kingdom_id = ?', [kingdom.id]);
    if (!membership) return res.json({ alliance: null });
    const alliance = await db.get('SELECT * FROM alliances WHERE id = ?', [membership.alliance_id]);
    const members = await db.all(`
      SELECT k.id, k.name, k.race, k.land, k.fighters, k.level, am.pledge
      FROM kingdoms k JOIN alliance_members am ON k.id = am.kingdom_id
      WHERE am.alliance_id = ? ORDER BY k.land DESC`, [membership.alliance_id]);
    res.json({ alliance, members, myPledge: membership.pledge, isLeader: alliance.leader_id === kingdom.id });
  });

  router.post('/pledge', requireAuth, async (req, res) => {
    const kingdom = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    const { pledge } = req.body;
    const p = Math.max(0, Math.min(10, Number(pledge) || 3));
    await db.run('UPDATE alliance_members SET pledge = ? WHERE kingdom_id = ?', [p, kingdom.id]);
    res.json({ ok: true, pledge: p });
  });

  router.post('/dismiss', requireAuth, async (req, res) => {
    const kingdom = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    const alliance = await db.get('SELECT * FROM alliances WHERE leader_id = ?', [kingdom.id]);
    if (!alliance) return res.status(403).json({ error: 'Only leader can dismiss members' });
    const { targetKingdomId } = req.body;
    if (targetKingdomId === kingdom.id) return res.status(400).json({ error: 'Cannot dismiss yourself' });
    await db.run('DELETE FROM alliance_members WHERE kingdom_id = ? AND alliance_id = ?', [targetKingdomId, alliance.id]);
    res.json({ ok: true });
  });

  router.post('/create', requireAuth, async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Alliance name required' });
    const kingdom = await db.get('SELECT * FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    if (!kingdom) return res.status(404).json({ error: 'Kingdom not found' });
    await db.run('DELETE FROM alliance_members WHERE kingdom_id = ?', [kingdom.id]);
    try {
      const result = await db.run('INSERT INTO alliances (name, leader_id) VALUES (?, ?)', [name.trim(), kingdom.id]);
      await db.run('INSERT INTO alliance_members (alliance_id, kingdom_id, pledge) VALUES (?, ?, 3)', [result.lastID, kingdom.id]);
      res.json({ ok: true, allianceId: result.lastID });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Alliance name taken' });
      res.status(500).json({ error: 'Server error' });
    }
  });

  router.post('/invite', requireAuth, async (req, res) => {
    const kingdom = await db.get('SELECT * FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    const membership = await db.get('SELECT * FROM alliance_members WHERE kingdom_id = ?', [kingdom.id]);
    if (!membership) return res.status(400).json({ error: 'You are not in an alliance' });
    const alliance = await db.get('SELECT * FROM alliances WHERE id = ?', [membership.alliance_id]);
    if (alliance.leader_id !== kingdom.id) return res.status(403).json({ error: 'Only the leader can invite' });
    try {
      await db.run('INSERT INTO alliance_members (alliance_id, kingdom_id) VALUES (?, ?)', [membership.alliance_id, req.body.targetKingdomId]);
      res.json({ ok: true });
    } catch {
      res.status(409).json({ error: 'Already a member' });
    }
  });

  router.post('/leave', requireAuth, async (req, res) => {
    const kingdom = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
    await db.run('DELETE FROM alliance_members WHERE kingdom_id = ?', [kingdom.id]);
    res.json({ ok: true });
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const alliance = await db.get('SELECT * FROM alliances WHERE id = ?', [req.params.id]);
    if (!alliance) return res.status(404).json({ error: 'Not found' });
    const members = await db.all(`
      SELECT k.id, k.name, k.race, k.land, am.pledge
      FROM kingdoms k JOIN alliance_members am ON k.id = am.kingdom_id
      WHERE am.alliance_id = ?`, [req.params.id]);
    res.json({ ...alliance, members });
  });

  return router;
};
