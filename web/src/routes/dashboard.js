import { Router } from "express";
import { queryAll, queryOne } from "../database.js";

export const dashboardRoutes = Router();

dashboardRoutes.get("/stats", async (req, res) => {
  const uid = req.userId;
  const totalSubjects = (await queryOne("SELECT COUNT(*) as c FROM subjects WHERE user_id = ?", [uid]))?.c || 0;
  const totalNotes = (await queryOne("SELECT COUNT(*) as c FROM notes WHERE user_id = ?", [uid]))?.c || 0;
  const totalCards = (await queryOne("SELECT COUNT(*) as c FROM flashcards WHERE user_id = ?", [uid]))?.c || 0;
  const totalQuizzes = (await queryOne("SELECT COUNT(*) as c FROM quizzes WHERE user_id = ?", [uid]))?.c || 0;
  const cardsToReview = (await queryOne("SELECT COUNT(*) as c FROM flashcards WHERE user_id = ? AND next_review <= datetime('now')", [uid]))?.c || 0;

  const studyToday = (await queryOne(`
    SELECT COALESCE(SUM(duration_minutes), 0) as minutes
    FROM study_sessions WHERE user_id = ? AND session_date = date('now')
  `, [uid]))?.minutes || 0;

  const studyThisWeek = (await queryOne(`
    SELECT COALESCE(SUM(duration_minutes), 0) as minutes
    FROM study_sessions WHERE user_id = ? AND session_date >= date('now', '-7 days')
  `, [uid]))?.minutes || 0;

  const weeklyData = await queryAll(`
    SELECT session_date, SUM(duration_minutes) as minutes
    FROM study_sessions
    WHERE user_id = ? AND session_date >= date('now', '-7 days')
    GROUP BY session_date ORDER BY session_date
  `, [uid]);

  const subjectBreakdown = await queryAll(`
    SELECT s.name, s.color, COALESCE(SUM(ss.duration_minutes), 0) as minutes
    FROM subjects s LEFT JOIN study_sessions ss ON s.id = ss.subject_id
    AND ss.session_date >= date('now', '-30 days') AND ss.user_id = ?
    WHERE s.user_id = ?
    GROUP BY s.id ORDER BY minutes DESC LIMIT 6
  `, [uid, uid]);

  const recentAttempts = await queryAll(`
    SELECT qa.*, q.title as quiz_title, s.name as subject_name
    FROM quiz_attempts qa
    JOIN quizzes q ON qa.quiz_id = q.id
    JOIN subjects s ON q.subject_id = s.id
    WHERE qa.user_id = ?
    ORDER BY qa.attempted_at DESC LIMIT 5
  `, [uid]);

  const streak = await calculateStreak(uid);

  res.json({
    totalSubjects, totalNotes, totalCards, totalQuizzes, cardsToReview,
    studyToday, studyThisWeek, weeklyData, subjectBreakdown, recentAttempts, streak
  });
});

async function calculateStreak(userId) {
  const rows = await queryAll(`
    SELECT DISTINCT session_date FROM study_sessions
    WHERE user_id = ?
    ORDER BY session_date DESC LIMIT 60
  `, [userId]);
  if (!rows.length) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < rows.length; i++) {
    const expected = new Date(today);
    expected.setDate(expected.getDate() - i);
    const dateStr = expected.toISOString().split("T")[0];
    if (rows[i]?.session_date === dateStr) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
