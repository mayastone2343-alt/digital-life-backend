const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../database");
const authenticate = require("../middleware/auth");
const { sendEmail, buildConfirmationAckEmail, buildReleasedEmail, buildContactWelcomeEmail } = require("../services/emailService");

const router = express.Router();
const REQUIRED_CONFIRMATIONS = parseInt(process.env.REQUIRED_CONFIRMATIONS || "2");

router.get("/", authenticate, async (req, res) => {
  try {
    const contacts = await db.prepare("SELECT id, name, email, verified, confirmed_at, created_at FROM contacts WHERE user_id = ?").all(req.user.id);
    res.json(contacts);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ message: "Name and email required" });
    const existing = await db.prepare("SELECT id FROM contacts WHERE user_id = ? AND email = ?").get(req.user.id, email);
    if (existing) return res.status(409).json({ message: "Contact with this email already exists" });
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO contacts (id, user_id, name, email, created_at) VALUES (?, ?, ?, ?, ?)").run(id, req.user.id, name, email, now);
    const owner = await db.prepare("SELECT email FROM users WHERE id = ?").get(req.user.id);
    try {
      const { subject, html } = buildContactWelcomeEmail(name, owner.email);
      await sendEmail(email, subject, html);
    } catch (e) { console.error("Welcome email failed:", e.message); }
    res.status(201).json(await db.prepare("SELECT * FROM contacts WHERE id = ?").get(id));
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const c = await db.prepare("SELECT * FROM contacts WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ message: "Contact not found" });
    await db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
    res.json({ message: "Contact deleted" });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.get("/confirm/:token", async (req, res) => {
  try {
    const contact = await db.prepare("SELECT * FROM contacts WHERE confirm_token = ?").get(req.params.token);
    if (!contact) return res.status(404).send(confirmPage("❌ Invalid Link", "#f05252", "This link is invalid or has already been used."));
    if (contact.confirmed_at) return res.send(confirmPage("✅ Already Confirmed", "#34d399", "You have already submitted your confirmation."));

    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE contacts SET confirmed_at = ?, confirm_token = NULL WHERE id = ?").run(now, contact.id);

    const owner = await db.prepare("SELECT * FROM users WHERE id = ?").get(contact.user_id);
    const { cnt: confirmedCount } = await db.prepare("SELECT COUNT(*) as cnt FROM contacts WHERE user_id = ? AND confirmed_at IS NOT NULL").get(contact.user_id);

    try {
      const { subject, html } = buildConfirmationAckEmail(contact.name, owner.email);
      await sendEmail(contact.email, subject, html);
    } catch (e) { console.error("Ack email failed:", e.message); }

    if (confirmedCount >= REQUIRED_CONFIRMATIONS) {
      await db.prepare("UPDATE users SET status = 'RELEASED' WHERE id = ?").run(owner.id);
      try {
        const { subject, html } = buildReleasedEmail(owner.email);
        await sendEmail(owner.email, subject, html);
      } catch (e) { console.error("Release email failed:", e.message); }
      return res.send(confirmPage("🔓 Assets Released", "#22c55e", `All required confirmations received. The vault of <strong>${owner.email}</strong> has been released.`));
    }

    res.send(confirmPage("✅ Confirmation Received", "#f59e0b", `Thank you, <strong>${contact.name}</strong>. ${confirmedCount} of ${REQUIRED_CONFIRMATIONS} confirmations received.`));
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).send(confirmPage("❌ Error", "#f05252", "Something went wrong. Please try again."));
  }
});

function confirmPage(title, color, message) {
  return `<!DOCTYPE html><html><body style="font-family:'DM Sans',sans-serif;background:#080b0f;color:#e0e0e0;text-align:center;padding:80px 24px">
    <div style="max-width:440px;margin:0 auto;background:#0e1218;border:1px solid #1a2130;border-radius:18px;padding:48px 36px">
      <h1 style="font-size:22px;margin-bottom:16px;color:${color}">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:#8a95a3">${message}</p>
    </div>
  </body></html>`;
}

module.exports = router;