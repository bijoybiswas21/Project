import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On Vercel use env var; locally persist to file
let JWT_SECRET;
if (process.env.JWT_SECRET) {
  JWT_SECRET = process.env.JWT_SECRET;
} else {
  const dataDir = path.resolve(__dirname, "../data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const secretPath = path.join(dataDir, ".jwt-secret");
  if (fs.existsSync(secretPath)) {
    JWT_SECRET = fs.readFileSync(secretPath, "utf-8").trim();
  } else {
    JWT_SECRET = crypto.randomBytes(64).toString("hex");
    fs.writeFileSync(secretPath, JWT_SECRET, "utf-8");
  }
}

const TOKEN_EXPIRY = "7d";

export function signToken(userId) {
  return jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
