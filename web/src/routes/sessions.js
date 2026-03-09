import { Router } from "express";
import { queryAll, execute } from "../database.js";

export const sessionRoutes = Router();

sessionRoutes.get("/", (req, res) => {
  const { subject_id, days } = req.query;
  const d = Number(days) || 30;
  let sessions;
  if (subject_id) {
    sessions = queryAll(`
      SELECT ss.*, s.name as subject_name, s.color as subject_color
      FROM study_sessions ss LEFT JOIN subjects s ON ss.subject_id = s.id
      WHERE ss.user_id = ? AND ss.subject_id = ? AND ss.session_date >= date('now', '-' || ? || ' days')
      ORDER BY ss.session_date DESC
    `, [req.userId, Number(subject_id), d]);
  } else {
    sessions = queryAll(`
      SELECT ss.*, s.name as subject_name, s.color as subject_color
      FROM study_sessions ss LEFT JOIN subjects s ON ss.subject_id = s.id
      WHERE ss.user_id = ? AND ss.session_date >= date('now', '-' || ? || ' days')
      ORDER BY ss.session_date DESC
    `, [req.userId, d]);
  }
  res.json(sessions);
});

sessionRoutes.post("/", (req, res) => {
  const { subject_id, duration_minutes, notes } = req.body;
  if (!duration_minutes || duration_minutes < 1) return res.status(400).json({ error: "Duration required" });
  const { lastId } = execute("INSERT INTO study_sessions (user_id, subject_id, duration_minutes, notes) VALUES (?, ?, ?, ?)",
    [req.userId, subject_id ? Number(subject_id) : null, Number(duration_minutes), notes || ""]);
  res.status(201).json({ id: lastId });
});

sessionRoutes.delete("/:id", (req, res) => {
  execute("DELETE FROM study_sessions WHERE id = ? AND user_id = ?", [Number(req.params.id), req.userId]);
  res.json({ success: true });
});
