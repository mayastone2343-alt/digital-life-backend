const express = require("express");
const db = require("../database");
const authenticate = require("../middleware/auth");

const router = express.Router();
const WARNING_DAYS = parseInt(process.env.INACTIVITY_WARNING_DAYS || "25");
const ALERT_DAYS = parseInt(process.env.INACTIVITY_ALERT_DAYS || "30");

router.get("/status", authenticate, async (req, res) => {
  try {
    const user = req.user;
    const now = Math.floor(Date.now() / 1000);
    const daysSinceActive = Math.floor((now - user.last_active) / 86400);
    const confirmedCount = (await db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE user_id = ? AND confirmed_at IS NOT NULL").get(user.id)).cnt;
    const totalContacts = (await db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE user_id = ?").get(user.id)).cnt;
    res.json({
      status: user.status,
      lastActive: user.last_active * 1000,
      daysSinceActive,
      daysUntilWarning: Math.max(0, WARNING_DAYS - daysSinceActive),
      daysUntilAlert: Math.max(0, ALERT_DAYS - daysSinceActive),
      confirmations: confirmedCount,
      totalContacts,
      requiredConfirmations: parseInt(process.env.REQUIRED_CONFIRMATIONS || "2"),
    });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.post("/checkin", authenticate, async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE users SET last_active = ?, status = 'ACTIVE' WHERE id = ?").run(now, req.user.id);
    res.json({ message: "Check-in successful. Timer reset." });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;