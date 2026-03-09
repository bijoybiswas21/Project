import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Ensure data directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

import { initDb } from "./database.js";
import { authMiddleware } from "./auth.js";
import { authRoutes } from "./routes/auth.js";
import { subjectRoutes } from "./routes/subjects.js";
import { noteRoutes } from "./routes/notes.js";
import { flashcardRoutes } from "./routes/flashcards.js";
import { quizRoutes } from "./routes/quizzes.js";
import { sessionRoutes } from "./routes/sessions.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { settingsRoutes } from "./routes/settings.js";
import { chatRoutes } from "./routes/chat.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.resolve(__dirname, "../public");

app.use(express.json());
app.use(express.static(publicDir));

// Public auth routes (no token needed)
app.use("/api/auth", authRoutes);

// Health check (public)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "study-platform" });
});

// All other API routes require authentication
app.use("/api/subjects", authMiddleware, subjectRoutes);
app.use("/api/notes", authMiddleware, noteRoutes);
app.use("/api/flashcards", authMiddleware, flashcardRoutes);
app.use("/api/quizzes", authMiddleware, quizRoutes);
app.use("/api/sessions", authMiddleware, sessionRoutes);
app.use("/api/dashboard", authMiddleware, dashboardRoutes);
app.use("/api/settings", authMiddleware, settingsRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Initialize DB then start server
initDb().then(() => {
  app.listen(port, () => {
    console.log(`Study Platform running at http://localhost:${port}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
