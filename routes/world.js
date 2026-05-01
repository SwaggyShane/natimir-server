const express = require('express');
const { requireAuth } = require('./middleware');

const router = express.Router();

module.exports = function(db, io) {

  // ── Regions ──────────────────────────────────────────────────────────────────
  router.get('/regions', requireAuth, async (_req, res) => {
    try {
      const rows = await db.all(`
        SELECT r.*, a.name as owner_name, ca.name as challenger_name
        FROM regions r
        LEFT JOIN alliances a ON r.owner_alliance_id = a.id
        LEFT JOIN alliances ca ON r.contest_alliance_id = ca.id
      `);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Bounties ─────────────────────────────────────────────────────────────────
  router.get('/world/bounties', requireAuth, async (_req, res) => {
    try {
      const rows = await db.all(`
        SELECT b.*, k.name as target_name, p.username as placer_name
        FROM bounties b
        JOIN kingdoms k ON b.target_id = k.id
        JOIN players p ON b.placer_id = p.id
        WHERE b.status = 'active'
        ORDER BY b.amount DESC
      `);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/world/bounties', requireAuth, async (req, res) => {
    try {
      const { target_id, amount } = req.body;
      const amt = Number(amount);
      if (!target_id || !amt || amt <= 0) return res.status(400).json({ error: 'Invalid target or amount' });

      const k = await db.get('SELECT id, gold FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
      if (!k) return res.status(404).json({ error: 'Kingdom not found' });
      if (k.gold < amt) return res.status(400).json({ error: 'Not enough gold' });
      if (k.id === target_id) return res.status(400).json({ error: 'Cannot place bounty on yourself' });

      await db.run('UPDATE kingdoms SET gold = gold - ? WHERE id = ?', [amt, k.id]);
      await db.run('INSERT INTO bounties (placer_id, target_id, amount) VALUES (?, ?, ?)',
        [req.player.playerId, target_id, amt]);
      res.json({ ok: true, message: 'Bounty placed!' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Messages ─────────────────────────────────────────────────────────────────
  router.get('/messages', requireAuth, async (req, res) => {
    try {
      const id = req.player.playerId;
      const rows = await db.all(`
        SELECT
          m.*,
          p1.username as sender_name,
          p2.username as recipient_name,
          CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as other_id,
          CASE WHEN m.sender_id = ? THEN p2.username ELSE p1.username END as other_name
        FROM messages m
        JOIN players p1 ON m.sender_id = p1.id
        JOIN players p2 ON m.recipient_id = p2.id
        WHERE m.sender_id = ? OR m.recipient_id = ?
        ORDER BY m.created_at DESC
      `, [id, id, id, id]);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/messages', requireAuth, async (req, res) => {
    try {
      const { recipient_id, content } = req.body;
      if (!recipient_id || !content) return res.status(400).json({ error: 'Missing recipient or content' });
      if (typeof content !== 'string' || content.length > 2000) return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
      const myId = req.player.playerId;
      if (myId === recipient_id) return res.status(400).json({ error: 'Cannot message yourself' });

      const result = await db.run(
        'INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)',
        [myId, recipient_id, content]
      );
      const senderInfo = await db.get('SELECT username FROM players WHERE id = ?', [myId]);
      io.to(`player:${recipient_id}`).emit('message:received', {
        id: result.lastID,
        sender_id: myId,
        sender_name: senderInfo?.username || 'System',
        content,
        created_at: Math.floor(Date.now() / 1000)
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Chat history ─────────────────────────────────────────────────────────────
  router.get('/chat/:room', requireAuth, async (req, res) => {
    const msgs = await db.all(`
      SELECT cm.id, cm.message, cm.created_at, cm.username,
             p.is_chat_mod, p.is_admin, p.chat_color, p.chat_name, k.race
      FROM chat_messages cm
      JOIN players p ON cm.player_id = p.id
      JOIN kingdoms k ON cm.kingdom_id = k.id
      WHERE cm.room = ? AND cm.deleted = 0
      ORDER BY cm.created_at DESC LIMIT 80`, [req.params.room]);
    res.json(msgs.reverse());
  });

  // ── Suggestions ───────────────────────────────────────────────────────────────
  router.post('/suggestions', requireAuth, async (req, res) => {
    try {
      const { message } = req.body;
      if (!message || message.length < 5) return res.status(400).json({ error: 'Suggestion too short' });
      if (message.length > 1000) return res.status(400).json({ error: 'Suggestion too long (max 1000 chars)' });
      const k = await db.get('SELECT id FROM kingdoms WHERE player_id = ?', [req.player.playerId]);
      await db.run('INSERT INTO suggestions (player_id, kingdom_id, message) VALUES (?, ?, ?)',
        [req.player.playerId, k ? k.id : null, message]);
      res.json({ ok: true, message: 'Thank you! Your suggestion has been recorded.' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
