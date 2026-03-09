import { Router } from "express";
import { queryAll, queryOne, execute } from "../database.js";

export const contactRoutes = Router();

// Get all messages for the current user (sent + received)
contactRoutes.get("/messages", (req, res) => {
  const messages = queryAll(`
    SELECT m.*, 
      s.name as sender_name, s.email as sender_email,
      r.name as recipient_name, r.email as recipient_email
    FROM messages m
    JOIN users s ON m.sender_id = s.id
    JOIN users r ON m.recipient_id = r.id
    WHERE m.sender_id = ? OR m.recipient_id = ?
    ORDER BY m.created_at DESC
  `, [req.userId, req.userId]);
  res.json(messages);
});

// Get inbox messages
contactRoutes.get("/inbox", (req, res) => {
  const messages = queryAll(`
    SELECT m.*, u.name as sender_name, u.email as sender_email
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.recipient_id = ?
    ORDER BY m.created_at DESC
  `, [req.userId]);
  res.json(messages);
});

// Get sent messages
contactRoutes.get("/sent", (req, res) => {
  const messages = queryAll(`
    SELECT m.*, u.name as recipient_name, u.email as recipient_email
    FROM messages m
    JOIN users u ON m.recipient_id = u.id
    WHERE m.sender_id = ?
    ORDER BY m.created_at DESC
  `, [req.userId]);
  res.json(messages);
});

// Send a message
contactRoutes.post("/send", (req, res) => {
  const { recipientEmail, subject, body } = req.body;

  if (!recipientEmail?.trim()) {
    return res.status(400).json({ error: "Recipient email is required" });
  }
  if (!subject?.trim()) {
    return res.status(400).json({ error: "Subject is required" });
  }
  if (!body?.trim()) {
    return res.status(400).json({ error: "Message body is required" });
  }
  if (subject.trim().length > 200) {
    return res.status(400).json({ error: "Subject must be 200 characters or less" });
  }
  if (body.trim().length > 5000) {
    return res.status(400).json({ error: "Message must be 5000 characters or less" });
  }

  const recipient = queryOne("SELECT id FROM users WHERE email = ?", [recipientEmail.trim().toLowerCase()]);
  if (!recipient) {
    return res.status(404).json({ error: "No user found with that email" });
  }
  if (recipient.id === req.userId) {
    return res.status(400).json({ error: "You cannot send a message to yourself" });
  }

  const { lastId } = execute(
    "INSERT INTO messages (sender_id, recipient_id, subject, body) VALUES (?, ?, ?, ?)",
    [req.userId, recipient.id, subject.trim(), body.trim()]
  );

  res.status(201).json({ id: lastId, message: "Message sent successfully" });
});

// Mark message as read
contactRoutes.put("/:id/read", (req, res) => {
  const msg = queryOne("SELECT * FROM messages WHERE id = ? AND recipient_id = ?", [req.params.id, req.userId]);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  execute("UPDATE messages SET read = 1 WHERE id = ?", [req.params.id]);
  res.json({ message: "Marked as read" });
});

// Delete a message
contactRoutes.delete("/:id", (req, res) => {
  const msg = queryOne("SELECT * FROM messages WHERE id = ? AND (sender_id = ? OR recipient_id = ?)", [req.params.id, req.userId, req.userId]);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  execute("DELETE FROM messages WHERE id = ?", [req.params.id]);
  res.json({ message: "Message deleted" });
});

// Get unread count
contactRoutes.get("/unread-count", (req, res) => {
  const row = queryOne("SELECT COUNT(*) as count FROM messages WHERE recipient_id = ? AND read = 0", [req.userId]);
  res.json({ count: row?.count || 0 });
});

// Search users by email (for compose)
contactRoutes.get("/search-users", (req, res) => {
  const q = req.query.q?.trim();
  if (!q || q.length < 2) return res.json([]);
  const users = queryAll(
    "SELECT id, name, email FROM users WHERE email LIKE ? AND id != ? LIMIT 10",
    [`%${q}%`, req.userId]
  );
  res.json(users);
});
