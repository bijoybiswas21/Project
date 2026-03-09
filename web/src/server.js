import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
import { contactRoutes } from "./routes/contact.js";

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicDir = path.resolve(__dirname, "../public");

app.use(express.json());

// Health check (before DB init — always works)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "study-platform" });
});

// On Vercel, static files are served by the CDN; locally use Express
if (!process.env.VERCEL) {
  app.use(express.static(publicDir));
}

// Ensure DB is initialized before handling any request
let dbReady = null;
function ensureDb() {
  if (!dbReady) {
    dbReady = initDb().catch((err) => {
      console.error("Failed to initialize database:", err);
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

app.use(async (_req, _res, next) => {
  try {
    await ensureDb();
    next();
  } catch (err) {
    next(err);
  }
});

// Public auth routes (no token needed)
app.use("/api/auth", authRoutes);

// All other API routes require authentication
app.use("/api/subjects", authMiddleware, subjectRoutes);
app.use("/api/notes", authMiddleware, noteRoutes);
app.use("/api/flashcards", authMiddleware, flashcardRoutes);
app.use("/api/quizzes", authMiddleware, quizRoutes);
app.use("/api/sessions", authMiddleware, sessionRoutes);
app.use("/api/dashboard", authMiddleware, dashboardRoutes);
app.use("/api/settings", authMiddleware, settingsRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/contact", authMiddleware, contactRoutes);

// SPA fallback (local only; Vercel handles this via rewrites)
if (!process.env.VERCEL) {
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Global error handler — returns JSON on API errors
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

// Start server locally
if (!process.env.VERCEL) {
  ensureDb().then(() => {
    app.listen(port, () => {
      console.log(`Study Platform running at http://localhost:${port}`);
    });
  });
}

// Export for Vercel serverless
export default app;
