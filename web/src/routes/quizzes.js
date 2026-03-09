import { Router } from "express";
import { queryAll, queryOne, execute } from "../database.js";

export const quizRoutes = Router();

quizRoutes.get("/", async (req, res) => {
  const { subject_id } = req.query;
  let quizzes;
  if (subject_id) {
    quizzes = await queryAll(`
      SELECT q.*, s.name as subject_name, s.color as subject_color,
        (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
        (SELECT MAX(score * 100 / total) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = ?) as best_score
      FROM quizzes q JOIN subjects s ON q.subject_id = s.id
      WHERE q.user_id = ? AND q.subject_id = ? ORDER BY q.created_at DESC
    `, [req.userId, req.userId, Number(subject_id)]);
  } else {
    quizzes = await queryAll(`
      SELECT q.*, s.name as subject_name, s.color as subject_color,
        (SELECT COUNT(*) FROM quiz_questions WHERE quiz_id = q.id) as question_count,
        (SELECT MAX(score * 100 / total) FROM quiz_attempts WHERE quiz_id = q.id AND user_id = ?) as best_score
      FROM quizzes q JOIN subjects s ON q.subject_id = s.id
      WHERE q.user_id = ? ORDER BY q.created_at DESC
    `, [req.userId, req.userId]);
  }
  res.json(quizzes);
});

quizRoutes.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const quiz = await queryOne(`
    SELECT q.*, s.name as subject_name
    FROM quizzes q JOIN subjects s ON q.subject_id = s.id WHERE q.id = ? AND q.user_id = ?
  `, [id, req.userId]);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  quiz.questions = await queryAll("SELECT * FROM quiz_questions WHERE quiz_id = ?", [id]);
  res.json(quiz);
});

quizRoutes.post("/", async (req, res) => {
  const { subject_id, title, questions } = req.body;
  if (!subject_id || !title?.trim() || !questions?.length)
    return res.status(400).json({ error: "Subject, title and questions required" });

  const { lastId: quizId } = await execute("INSERT INTO quizzes (user_id, subject_id, title) VALUES (?, ?, ?)",
    [req.userId, Number(subject_id), title.trim()]);
  for (const q of questions) {
    if (!q.question || !q.option_a || !q.option_b || !q.option_c || !q.option_d || !q.correct_option) continue;
    await execute(`INSERT INTO quiz_questions
      (quiz_id, question, option_a, option_b, option_c, option_d, correct_option)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [quizId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option.toUpperCase()]);
  }
  res.status(201).json({ id: quizId });
});

quizRoutes.post("/:id/attempt", async (req, res) => {
  const quizId = Number(req.params.id);
  const quiz = await queryOne("SELECT id FROM quizzes WHERE id = ? AND user_id = ?", [quizId, req.userId]);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  const { answers } = req.body;
  const questions = await queryAll("SELECT * FROM quiz_questions WHERE quiz_id = ?", [quizId]);
  if (!questions.length) return res.status(404).json({ error: "Quiz has no questions" });

  let score = 0;
  const results = questions.map(q => {
    const userAnswer = (answers?.[q.id] || "").toUpperCase();
    const correct = userAnswer === q.correct_option;
    if (correct) score++;
    return { id: q.id, correct, correct_option: q.correct_option, user_answer: userAnswer };
  });

  await execute("INSERT INTO quiz_attempts (user_id, quiz_id, score, total) VALUES (?, ?, ?, ?)",
    [req.userId, quizId, score, questions.length]);
  res.json({ score, total: questions.length, results });
});

quizRoutes.delete("/:id", async (req, res) => {
  await execute("DELETE FROM quizzes WHERE id = ? AND user_id = ?", [Number(req.params.id), req.userId]);
  res.json({ success: true });
});
