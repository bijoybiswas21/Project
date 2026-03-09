import { Router } from "express";
import { queryAll, execute } from "../database.js";

export const noteRoutes = Router();

noteRoutes.get("/", (req, res) => {
  const { subject_id } = req.query;
  let notes;
  if (subject_id) {
    notes = queryAll(`
      SELECT n.*, s.name as subject_name, s.color as subject_color
      FROM notes n JOIN subjects s ON n.subject_id = s.id
      WHERE n.user_id = ? AND n.subject_id = ? ORDER BY n.pinned DESC, n.updated_at DESC
    `, [req.userId, Number(subject_id)]);
  } else {
    notes = queryAll(`
      SELECT n.*, s.name as subject_name, s.color as subject_color
      FROM notes n JOIN subjects s ON n.subject_id = s.id
      WHERE n.user_id = ? ORDER BY n.pinned DESC, n.updated_at DESC
    `, [req.userId]);
  }
  res.json(notes);
});

noteRoutes.post("/", (req, res) => {
  const { subject_id, title, content } = req.body;
  if (!subject_id || !title?.trim()) return res.status(400).json({ error: "Subject and title required" });
  const { lastId } = execute("INSERT INTO notes (user_id, subject_id, title, content) VALUES (?, ?, ?, ?)",
    [req.userId, Number(subject_id), title.trim(), content || ""]);
  res.status(201).json({ id: lastId });
});

noteRoutes.put("/:id", (req, res) => {
  const { title, content, pinned } = req.body;
  const id = Number(req.params.id);
  execute(`UPDATE notes SET
    title = COALESCE(?, title), content = COALESCE(?, content),
    pinned = COALESCE(?, pinned), updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [title || null, content ?? null, pinned ?? null, id, req.userId]);
  res.json({ success: true });
});

noteRoutes.delete("/:id", (req, res) => {
  execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [Number(req.params.id), req.userId]);
  res.json({ success: true });
});
