import { Router } from "express";
import { queryOne, queryAll, execute } from "../database.js";

export const settingsRoutes = Router();

async function getOrCreate(userId) {
  let s = await queryOne("SELECT * FROM user_settings WHERE user_id = ?", [userId]);
  if (!s) {
    await execute("INSERT INTO user_settings (user_id) VALUES (?)", [userId]);
    s = await queryOne("SELECT * FROM user_settings WHERE user_id = ?", [userId]);
  }
  return s;
}

settingsRoutes.get("/", async (req, res) => {
  res.json(await getOrCreate(req.userId));
});

settingsRoutes.put("/", async (req, res) => {
  await getOrCreate(req.userId);
  const { study_goal_minutes, timer_duration, theme, notifications, sound_effects, daily_reminder } = req.body;

  const fields = [];
  const values = [];

  if (study_goal_minutes != null && Number(study_goal_minutes) >= 1 && Number(study_goal_minutes) <= 480) {
    fields.push("study_goal_minutes = ?");
    values.push(Number(study_goal_minutes));
  }
  if (timer_duration != null && [15, 25, 45, 60, 90].includes(Number(timer_duration))) {
    fields.push("timer_duration = ?");
    values.push(Number(timer_duration));
  }
  if (theme != null && ["dark", "light"].includes(theme)) {
    fields.push("theme = ?");
    values.push(theme);
  }
  if (notifications != null) {
    fields.push("notifications = ?");
    values.push(notifications ? 1 : 0);
  }
  if (sound_effects != null) {
    fields.push("sound_effects = ?");
    values.push(sound_effects ? 1 : 0);
  }
  if (daily_reminder != null) {
    fields.push("daily_reminder = ?");
    values.push(daily_reminder ? 1 : 0);
  }

  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    values.push(req.userId);
    await execute(`UPDATE user_settings SET ${fields.join(", ")} WHERE user_id = ?`, values);
  }

  res.json(await getOrCreate(req.userId));
});

// Delete account
settingsRoutes.delete("/account", async (req, res) => {
  await execute("DELETE FROM users WHERE id = ?", [req.userId]);
  res.json({ success: true });
});

// Export user data
settingsRoutes.get("/export", async (req, res) => {
  const uid = req.userId;
  const user = await queryOne("SELECT id, name, email, created_at FROM users WHERE id = ?", [uid]);
  const subjects = await queryAll("SELECT * FROM subjects WHERE user_id = ?", [uid]);
  const notes = await queryAll("SELECT * FROM notes WHERE user_id = ?", [uid]);
  const flashcards = await queryAll("SELECT * FROM flashcards WHERE user_id = ?", [uid]);
  const quizzes = await queryAll("SELECT * FROM quizzes WHERE user_id = ?", [uid]);
  const sessions = await queryAll("SELECT * FROM study_sessions WHERE user_id = ?", [uid]);
  res.json({ user, subjects, notes, flashcards, quizzes, sessions });
});
