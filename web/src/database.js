import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// When TURSO_DATABASE_URL is set, use cloud Turso; otherwise use local sql.js
const useTurso = !!process.env.TURSO_DATABASE_URL;

// Local sql.js state
let db;
const dataDir = process.env.VERCEL
  ? "/tmp"
  : path.resolve(__dirname, "../data");
const dbPath = path.join(dataDir, "study.db");

// Turso client
let client;

// Schema (shared between both backends)
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6C63FF',
    icon TEXT NOT NULL DEFAULT '📘',
    created_at DATETIME DEFAULT (datetime('now')),
    UNIQUE(user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS flashcards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    difficulty REAL NOT NULL DEFAULT 2.5,
    next_review DATETIME DEFAULT (datetime('now')),
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS study_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    subject_id INTEGER,
    duration_minutes INTEGER NOT NULL,
    session_date DATE DEFAULT (date('now')),
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    quiz_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    attempted_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY,
    study_goal_minutes INTEGER NOT NULL DEFAULT 60,
    timer_duration INTEGER NOT NULL DEFAULT 25,
    theme TEXT NOT NULL DEFAULT 'dark',
    notifications INTEGER NOT NULL DEFAULT 1,
    sound_effects INTEGER NOT NULL DEFAULT 1,
    daily_reminder INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    recipient_id INTEGER NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

export async function initDb() {
  if (useTurso) {
    const { createClient } = await import("@libsql/client/http");
    // Convert libsql:// to https:// for the HTTP transport, trim whitespace
    const rawUrl = (process.env.TURSO_DATABASE_URL || "").trim();
    const url = rawUrl.replace(/^libsql:\/\//, "https://");
    client = createClient({
      url,
      authToken: (process.env.TURSO_AUTH_TOKEN || "").trim(),
      intMode: "number",
    });
    await client.batch(["PRAGMA foreign_keys = ON", ...SCHEMA], "write");
  } else {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const { default: initSqlJs } = await import("sql.js/dist/sql-asm.js");
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      db = new SQL.Database(fs.readFileSync(dbPath));
    } else {
      db = new SQL.Database();
    }
    db.run("PRAGMA foreign_keys = ON");
    for (const sql of SCHEMA) db.run(sql);
    saveDb();
  }
}

function saveDb() {
  if (!db || useTurso) return;
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

export async function queryAll(sql, params = []) {
  if (useTurso) {
    const result = await client.execute({ sql, args: params });
    return result.rows.map(r => ({ ...r }));
  }
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export async function queryOne(sql, params = []) {
  if (useTurso) {
    const result = await client.execute({ sql, args: params });
    return result.rows[0] ? { ...result.rows[0] } : null;
  }
  const rows = await queryAll(sql, params);
  return rows[0] || null;
}

export async function execute(sql, params = []) {
  if (useTurso) {
    const result = await client.execute({ sql, args: params });
    return { lastId: Number(result.lastInsertRowid), changes: result.rowsAffected };
  }
  db.run(sql, params);
  const lastId = (await queryOne("SELECT last_insert_rowid() as id"))?.id || 0;
  const changes = db.getRowsModified();
  saveDb();
  return { lastId, changes };
}

export function getDb() { return useTurso ? client : db; }
