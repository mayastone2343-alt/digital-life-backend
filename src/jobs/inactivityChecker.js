const cron = require("node-cron");
const { v4: uuidv4 } = require("uuid");
const db = require("../database");
const { sendEmail, buildWarningEmail, buildContactAlertEmail, buildReleasedEmail } = require("../services/emailService");

const WARNING_DAYS = parseInt(process.env.INACTIVITY_WARNING_DAYS || "25");
const ALERT_DAYS   = parseInt(process.env.INACTIVITY_ALERT_DAYS   || "30");
const REQUIRED_CONFIRMATIONS = parseInt(process.env.REQUIRED_CONFIRMATIONS || "2");
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 0 * * *";
const BASE_URL      = process.env.BASE_URL      || "http://localhost:5000";
const FRONTEND_URL  = process.env.FRONTEND_URL  || "http://localhost:3000";

async function runInactivityCheck() {
  const now = Math.floor(Date.now() / 1000);
  const warningThreshold = now - WARNING_DAYS * 86400;
  const alertThreshold   = now - ALERT_DAYS   * 86400;

  console.log("\n🔍  Running inactivity check...");

  // 1. Warning emails to owners
  const warnableUsers = await db.prepare("SELECT * FROM users WHERE status = 'ACTIVE' AND last_active <= ?").all(warningThreshold);
  for (const user of warnableUsers) {
    const daysSince = Math.floor((now - user.last_active) / 86400);
    const recent = await db.prepare("SELECT id FROM inactivity_warnings WHERE user_id = ? AND type = 'WARNING' AND sent_at >= ?").get(user.id, now - 86400);
    if (!recent) {
      try {
        const { subject, html } = buildWarningEmail(user.email, daysSince, `${FRONTEND_URL}/dashboard`);
        await sendEmail(user.email, subject, html);
        await db.prepare("INSERT INTO inactivity_warnings (id, user_id, type, sent_at) VALUES (?, ?, 'WARNING', ?)").run(uuidv4(), user.id, now);
        console.log(`⚠️   Warning → ${user.email} (${daysSince}d inactive)`);
      } catch (e) { console.error("Warning email failed:", e.message); }
    }
  }

  // 2. Alert contacts for very inactive users
  const alertUsers = await db.prepare("SELECT * FROM users WHERE status = 'ACTIVE' AND last_active <= ?").all(alertThreshold);
  for (const user of alertUsers) {
    const daysSince = Math.floor((now - user.last_active) / 86400);
    const recentAlert = await db.prepare("SELECT id FROM inactivity_warnings WHERE user_id = ? AND type = 'CONTACT_ALERT' AND sent_at >= ?").get(user.id, now - 7 * 86400);
    if (recentAlert) continue;

    const contacts = await db.prepare("SELECT * FROM contacts WHERE user_id = ?").all(user.id);
    if (!contacts.length) { console.log(`ℹ️  ${user.email} inactive but no contacts`); continue; }

    await db.prepare("UPDATE users SET status = 'PENDING_CONFIRMATION' WHERE id = ?").run(user.id);

    for (const contact of contacts) {
      const token = uuidv4();
      await db.prepare("UPDATE contacts SET confirm_token = ? WHERE id = ?").run(token, contact.id);
      try {
        const { subject, html } = buildContactAlertEmail(contact.name, user.email, `${BASE_URL}/api/contacts/confirm/${token}`, daysSince);
        await sendEmail(contact.email, subject, html);
        console.log(`🚨  Alert → ${contact.email} (for ${user.email})`);
      } catch (e) { console.error("Alert email failed:", e.message); }
    }

    await db.prepare("INSERT INTO inactivity_warnings (id, user_id, type, sent_at) VALUES (?, ?, 'CONTACT_ALERT', ?)").run(uuidv4(), user.id, now);
  }

  // 3. Check pending users for enough confirmations
  const pendingUsers = await db.prepare("SELECT * FROM users WHERE status = 'PENDING_CONFIRMATION'").all();
  for (const user of pendingUsers) {
    const { cnt } = await db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE user_id = ? AND confirmed_at IS NOT NULL").get(user.id);
    if (cnt >= REQUIRED_CONFIRMATIONS) {
      await db.prepare("UPDATE users SET status = 'RELEASED' WHERE id = ?").run(user.id);
      try {
        const { subject, html } = buildReleasedEmail(user.email);
        await sendEmail(user.email, subject, html);
        console.log(`🔓  Released: ${user.email}`);
      } catch (e) { console.error("Release email failed:", e.message); }
    }
  }

  console.log("✅  Inactivity check complete.\n");
}

function startInactivityScheduler() {
  console.log(`⏰  Inactivity scheduler started (${CRON_SCHEDULE})`);
  console.log(`   Warning: ${WARNING_DAYS}d  |  Alert: ${ALERT_DAYS}d  |  Required confirmations: ${REQUIRED_CONFIRMATIONS}`);
  cron.schedule(CRON_SCHEDULE, () => runInactivityCheck().catch(console.error));
  runInactivityCheck().catch(console.error);
}

module.exports = { startInactivityScheduler, runInactivityCheck };