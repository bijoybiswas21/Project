import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { queryOne, execute } from "../database.js";
import { signToken, authMiddleware } from "../auth.js";

export const authRoutes = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SALT_ROUNDS = 12;

// Sign Up
authRoutes.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  if (name.trim().length > 50) {
    return res.status(400).json({ error: "Name must be 50 characters or less" });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: "Invalid email address" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (password.length > 128) {
    return res.status(400).json({ error: "Password must be 128 characters or less" });
  }

  const existing = queryOne("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (existing) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { lastId } = execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.trim().toLowerCase(), hash]
    );
    const token = signToken(lastId);
    res.status(201).json({
      token,
      user: { id: lastId, name: name.trim(), email: email.trim().toLowerCase() }
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// Sign In
authRoutes.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email?.trim() || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const user = queryOne("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email }
  });
});

// Forgot Password — generate a reset code
authRoutes.post("/forgot-password", (req, res) => {
  const { email } = req.body;
  if (!email?.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }

  const user = queryOne("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (!user) {
    return res.status(404).json({ error: "No account found with this email" });
  }

  // Delete old unused tokens for this user
  execute("DELETE FROM reset_tokens WHERE user_id = ? AND used = 0", [user.id]);

  // Generate a 6-digit code
  const code = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  execute(
    "INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
    [user.id, code, expiresAt]
  );

  res.json({ message: "Reset code generated", code });
});

// Reset Password — verify code and set new password
authRoutes.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  if (!email?.trim() || !code?.trim() || !newPassword) {
    return res.status(400).json({ error: "Email, code, and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ error: "Password must be 128 characters or less" });
  }

  const user = queryOne("SELECT id FROM users WHERE email = ?", [email.trim().toLowerCase()]);
  if (!user) {
    return res.status(404).json({ error: "No account found with this email" });
  }

  const tokenRow = queryOne(
    "SELECT * FROM reset_tokens WHERE user_id = ? AND token = ? AND used = 0",
    [user.id, code.trim()]
  );
  if (!tokenRow) {
    return res.status(400).json({ error: "Invalid reset code" });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return res.status(400).json({ error: "Reset code has expired" });
  }

  try {
    const hash = await bcrypt.hash(newPassword, 12);
    execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, user.id]);
    execute("UPDATE reset_tokens SET used = 1 WHERE id = ?", [tokenRow.id]);
    res.json({ message: "Password reset successfully" });
  } catch {
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Get current user profile
authRoutes.get("/me", authMiddleware, (req, res) => {
  const user = queryOne("SELECT id, name, email, created_at FROM users WHERE id = ?", [req.userId]);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

// Update profile
authRoutes.put("/me", authMiddleware, async (req, res) => {
  const { name, currentPassword, newPassword } = req.body;
  const user = queryOne("SELECT * FROM users WHERE id = ?", [req.userId]);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: "Current password required" });
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });
    if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
    if (newPassword.length > 128) return res.status(400).json({ error: "Password must be 128 characters or less" });
    const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    execute("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.userId]);
  }

  if (name?.trim()) {
    execute("UPDATE users SET name = ? WHERE id = ?", [name.trim(), req.userId]);
  }

  res.json({ success: true });
});
