require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// ── Startup guard ─────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "change_this_to_a_long_random_secret_string") {
  console.error("❌  FATAL: JWT_SECRET is not set or is still the default placeholder.");
  console.error("   Set a real secret in your .env file and restart.");
  process.exit(1);
}
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.warn("⚠️  GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will log to console only.");
}

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10kb" })); // prevent oversized payloads

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const db = require("./database");
db.ready.then(() => {
  app.use("/api/auth", authLimiter, require("./routes/auth"));
  app.use("/api/users",    apiLimiter, require("./routes/users"));
  app.use("/api/contacts", apiLimiter, require("./routes/contacts"));
  app.use("/api/assets",   apiLimiter, require("./routes/assets"));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  });

  app.listen(PORT, () => {
    console.log("\n" + "═".repeat(50));
    console.log(`🚀  Digital Life Backup API`);
    console.log(`   http://localhost:${PORT}`);
    console.log("═".repeat(50));
    const { startInactivityScheduler } = require("./jobs/inactivityChecker");
    startInactivityScheduler();
  });
}).catch(err => { console.error("DB init failed:", err); process.exit(1); });