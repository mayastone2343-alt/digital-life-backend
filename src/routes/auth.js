const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const db = require("../database");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(password) {
  if (!password || password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  return null;
}

router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: "Invalid email address." });
    const pwError = validatePassword(password);
    if (pwError) return res.status(400).json({ message: pwError });

    const existing = await db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
    if (existing) return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });

    const hashed = await bcrypt.hash(password, 12);
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO users (id, email, password, last_active, created_at) VALUES (?, ?, ?, ?, ?)").run(id, email.toLowerCase(), hashed, now, now);
    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, message: "Registration successful." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required." });

    const user = await db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase());
    const hashToCheck = user?.password || "$2a$12$invalidhashfortimingprotection000000000000000000000";
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) return res.status(401).json({ message: "Invalid email or password." });

    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE users SET last_active = ? WHERE id = ?").run(now, user.id);
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Internal server error." });
  }
});

module.exports = router;