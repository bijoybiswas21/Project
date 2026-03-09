import { Router } from "express";
import { queryAll, queryOne, execute } from "../database.js";

export const flashcardRoutes = Router();

flashcardRoutes.get("/", async (req, res) => {
  const { subject_id } = req.query;
  let cards;
  if (subject_id) {
    cards = await queryAll(`
      SELECT f.*, s.name as subject_name, s.color as subject_color
      FROM flashcards f JOIN subjects s ON f.subject_id = s.id
      WHERE f.user_id = ? AND f.subject_id = ? ORDER BY f.next_review ASC
    `, [req.userId, Number(subject_id)]);
  } else {
    cards = await queryAll(`
      SELECT f.*, s.name as subject_name, s.color as subject_color
      FROM flashcards f JOIN subjects s ON f.subject_id = s.id
      WHERE f.user_id = ? ORDER BY f.next_review ASC
    `, [req.userId]);
  }
  res.json(cards);
});

flashcardRoutes.get("/review", async (req, res) => {
  const cards = await queryAll(`
    SELECT f.*, s.name as subject_name, s.color as subject_color
    FROM flashcards f JOIN subjects s ON f.subject_id = s.id
    WHERE f.user_id = ? AND f.next_review <= datetime('now')
    ORDER BY f.difficulty DESC, RANDOM() LIMIT 20
  `, [req.userId]);
  res.json(cards);
});

flashcardRoutes.post("/", async (req, res) => {
  const { subject_id, question, answer } = req.body;
  if (!subject_id || !question?.trim() || !answer?.trim())
    return res.status(400).json({ error: "Subject, question and answer required" });
  const { lastId } = await execute("INSERT INTO flashcards (user_id, subject_id, question, answer) VALUES (?, ?, ?, ?)",
    [req.userId, Number(subject_id), question.trim(), answer.trim()]);
  res.status(201).json({ id: lastId });
});

flashcardRoutes.put("/:id/review", async (req, res) => {
  const { quality } = req.body;
  const id = Number(req.params.id);
  const card = await queryOne("SELECT * FROM flashcards WHERE id = ? AND user_id = ?", [id, req.userId]);
  if (!card) return res.status(404).json({ error: "Card not found" });

  const q = Math.max(0, Math.min(5, Number(quality) || 0));
  let newDiff = card.difficulty + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  newDiff = Math.max(1.3, newDiff);
  const intervalDays = q < 3 ? 1 : Math.max(1, Math.round(newDiff * (card.difficulty || 1)));
  const rounded = Math.round(newDiff * 100) / 100;

  await execute(`UPDATE flashcards SET difficulty = ?, next_review = datetime('now', '+' || ? || ' days') WHERE id = ? AND user_id = ?`,
    [rounded, intervalDays, id, req.userId]);
  res.json({ success: true, next_review_days: intervalDays });
});

flashcardRoutes.delete("/:id", async (req, res) => {
  await execute("DELETE FROM flashcards WHERE id = ? AND user_id = ?", [Number(req.params.id), req.userId]);
  res.json({ success: true });
});
