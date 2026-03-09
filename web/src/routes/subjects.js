import { Router } from "express";
import { queryAll, execute } from "../database.js";

export const subjectRoutes = Router();

subjectRoutes.get("/", async (req, res) => {
  const subjects = await queryAll(`
    SELECT s.*,
      (SELECT COUNT(*) FROM notes WHERE subject_id = s.id AND user_id = ?) as note_count,
      (SELECT COUNT(*) FROM flashcards WHERE subject_id = s.id AND user_id = ?) as card_count,
      (SELECT COUNT(*) FROM quizzes WHERE subject_id = s.id AND user_id = ?) as quiz_count
    FROM subjects s WHERE s.user_id = ? ORDER BY s.name
  `, [req.userId, req.userId, req.userId, req.userId]);
  res.json(subjects);
});

subjectRoutes.post("/", async (req, res) => {
  const { name, color, icon } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  try {
    const { lastId } = await execute("INSERT INTO subjects (user_id, name, color, icon) VALUES (?, ?, ?, ?)",
      [req.userId, name.trim(), color || "#6C63FF", icon || "📘"]);
    res.status(201).json({ id: lastId, name: name.trim(), color, icon });
  } catch (e) {
    if (e.message.includes("UNIQUE")) return res.status(409).json({ error: "Subject already exists" });
    res.status(500).json({ error: "Failed to create subject" });
  }
});

subjectRoutes.put("/:id", async (req, res) => {
  const { name, color, icon } = req.body;
  const id = Number(req.params.id);
  await execute("UPDATE subjects SET name = COALESCE(?, name), color = COALESCE(?, color), icon = COALESCE(?, icon) WHERE id = ? AND user_id = ?",
    [name || null, color || null, icon || null, id, req.userId]);
  res.json({ success: true });
});

subjectRoutes.delete("/:id", async (req, res) => {
  await execute("DELETE FROM subjects WHERE id = ? AND user_id = ?", [Number(req.params.id), req.userId]);
  res.json({ success: true });
});
