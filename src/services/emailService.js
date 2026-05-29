const nodemailer = require("nodemailer");

// ── Transporter ───────────────────────────────────────────────────────────────

function createTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("⚠️  Email credentials not set. Emails will be logged to console only.");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

// ── Base HTML template ────────────────────────────────────────────────────────

function baseTemplate(title, accentColor, body) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f0f; font-family: 'DM Sans', sans-serif; color: #e0e0e0; }
  .wrapper { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 16px; overflow: hidden; }
  .header { background: ${accentColor}; padding: 32px; text-align: center; }
  .header h1 { font-family: 'DM Serif Display', serif; font-size: 24px; color: #fff; margin-bottom: 4px; }
  .header p { font-size: 13px; color: rgba(255,255,255,0.75); }
  .body { padding: 32px; }
  .body p { font-size: 15px; line-height: 1.7; color: #c0c0c0; margin-bottom: 16px; }
  .body strong { color: #fff; }
  .cta { display: inline-block; margin: 20px 0; background: ${accentColor}; color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
  .badge { display: inline-block; background: #2a2a2a; border: 1px solid #3a3a3a; padding: 4px 12px; border-radius: 20px; font-size: 12px; color: #888; margin-bottom: 24px; }
  .divider { border: none; border-top: 1px solid #2a2a2a; margin: 24px 0; }
  .footer { padding: 20px 32px; border-top: 1px solid #2a2a2a; font-size: 12px; color: #555; text-align: center; }
  .info-box { background: #222; border-left: 3px solid ${accentColor}; border-radius: 4px; padding: 14px 16px; margin: 16px 0; }
  .info-box p { margin: 0; font-size: 14px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="card">
    ${body}
    <div class="footer">
      Digital Life Backup System &bull; This is an automated message
    </div>
  </div>
</div>
</body>
</html>`;
}

// ── Email Types ───────────────────────────────────────────────────────────────

/**
 * Warning email to the owner: "We haven't seen you — please check in"
 */
function buildWarningEmail(userEmail, daysSinceActive, checkInUrl) {
  const body = `
    <div class="header">
      <h1>⏰ Activity Check Required</h1>
      <p>Digital Life Backup System</p>
    </div>
    <div class="body">
      <span class="badge">ACTION REQUIRED</span>
      <p>Hi <strong>${userEmail}</strong>,</p>
      <p>Your Digital Life Backup vault has not detected any activity for <strong>${daysSinceActive} days</strong>.</p>
      <p>If you don't check in, your trusted emergency contacts will be notified and may begin the asset release process.</p>
      <div class="info-box">
        <p>🕐 <strong>Days inactive:</strong> ${daysSinceActive}</p>
        <p>📋 <strong>Action:</strong> Log in to reset your activity timer</p>
      </div>
      <a href="${checkInUrl}" class="cta">✓ I'm OK — Check In Now</a>
      <hr class="divider"/>
      <p>If you deliberately don't check in, your emergency contacts will be alerted after the configured inactivity period.</p>
    </div>`;
  return {
    subject: `⚠️ Digital Life Backup — Activity Check Required`,
    html: baseTemplate("Activity Check Required", "#d97706", body),
  };
}

/**
 * Alert email to emergency contacts: "This person hasn't been active"
 */
function buildContactAlertEmail(contactName, ownerEmail, confirmUrl, daysSinceActive) {
  const body = `
    <div class="header">
      <h1>🔔 Emergency Contact Alert</h1>
      <p>Digital Life Backup System</p>
    </div>
    <div class="body">
      <span class="badge">CONFIRMATION REQUESTED</span>
      <p>Hi <strong>${contactName}</strong>,</p>
      <p>You are listed as a trusted emergency contact for <strong>${ownerEmail}</strong> on the Digital Life Backup System.</p>
      <p>Their vault has been inactive for <strong>${daysSinceActive} days</strong>. We are reaching out to emergency contacts to determine next steps.</p>
      <div class="info-box">
        <p>👤 <strong>Account owner:</strong> ${ownerEmail}</p>
        <p>📅 <strong>Days inactive:</strong> ${daysSinceActive}</p>
        <p>🔒 <strong>Required confirmations:</strong> ${process.env.REQUIRED_CONFIRMATIONS || 2}</p>
      </div>
      <p>If you believe the owner is no longer able to access their account, please click below to submit your confirmation. Once enough trusted contacts confirm, the encrypted assets will be made accessible.</p>
      <a href="${confirmUrl}" class="cta">Submit Confirmation</a>
      <hr class="divider"/>
      <p style="font-size:13px; color:#666;">If you believe this alert is a mistake or the owner is fine, please do not confirm. This link is unique to you and can only be used once.</p>
    </div>`;
  return {
    subject: `🔔 Emergency Alert — ${ownerEmail} may need your attention`,
    html: baseTemplate("Emergency Contact Alert", "#dc2626", body),
  };
}

/**
 * Notify owner that assets have been released
 */
function buildReleasedEmail(userEmail) {
  const body = `
    <div class="header">
      <h1>🔓 Assets Released</h1>
      <p>Digital Life Backup System</p>
    </div>
    <div class="body">
      <p>Hi <strong>${userEmail}</strong>,</p>
      <p>The required number of emergency contacts have confirmed your inactivity. Your encrypted assets have now been <strong>released</strong> and are accessible to your designated contacts.</p>
      <div class="info-box">
        <p>🔓 <strong>Status:</strong> Assets Released</p>
      </div>
      <p>If this is a mistake and you are still active, please contact support immediately.</p>
    </div>`;
  return {
    subject: `🔓 Digital Life Backup — Your assets have been released`,
    html: baseTemplate("Assets Released", "#16a34a", body),
  };
}

/**
 * Notify contact that their confirmation was received
 */
function buildConfirmationAckEmail(contactName, ownerEmail) {
  const body = `
    <div class="header">
      <h1>✅ Confirmation Received</h1>
      <p>Digital Life Backup System</p>
    </div>
    <div class="body">
      <p>Hi <strong>${contactName}</strong>,</p>
      <p>We have received your confirmation regarding the account of <strong>${ownerEmail}</strong>.</p>
      <p>We will notify you when the required number of confirmations have been received and the assets are released.</p>
    </div>`;
  return {
    subject: `✅ Confirmation received for ${ownerEmail}`,
    html: baseTemplate("Confirmation Received", "#16a34a", body),
  };
}

// ── Send helper ───────────────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const transporter = createTransporter();

  if (!transporter) {
    // Log to console as fallback for development
    console.log("\n" + "═".repeat(60));
    console.log("📧  EMAIL (console fallback — GMAIL_APP_PASSWORD not set)");
    console.log("═".repeat(60));
    console.log(`  TO:      ${to}`);
    console.log(`  SUBJECT: ${subject}`);
    console.log("─".repeat(60));
    console.log("  (HTML body omitted — check your .env for credentials)");
    console.log("═".repeat(60) + "\n");
    return { simulated: true };
  }

  const info = await transporter.sendMail({
    from: `"Digital Life Backup" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
  });

  console.log(`📧  Email sent to ${to}: ${info.messageId}`);
  return info;
}

/**
 * Welcome email to a newly added emergency contact
 */
function buildContactWelcomeEmail(contactName, ownerEmail) {
  const body = `
    <div class="header">
      <h1>🛡️ You've Been Added as an Emergency Contact</h1>
      <p>Digital Life Backup System</p>
    </div>
    <div class="body">
      <span class="badge">NO ACTION REQUIRED NOW</span>
      <p>Hi <strong>${contactName}</strong>,</p>
      <p><strong>${ownerEmail}</strong> has added you as a trusted emergency contact on their Digital Life Backup vault.</p>
      <p>This means if they become inactive for an extended period, you may be contacted to help release their encrypted assets to their designated recipients.</p>
      <div class="info-box">
        <p>👤 <strong>Account owner:</strong> ${ownerEmail}</p>
        <p>📋 <strong>Your role:</strong> Emergency contact</p>
        <p>📧 <strong>What to expect:</strong> If needed, you'll receive a separate alert email with a confirmation link</p>
      </div>
      <p>You don't need to do anything right now. If the owner remains active, you will never be contacted again.</p>
      <hr class="divider"/>
      <p style="font-size:13px; color:#666;">If you don't know ${ownerEmail} or believe this was added in error, you can safely ignore this email.</p>
    </div>`;
  return {
    subject: `🛡️ You've been added as an emergency contact by ${ownerEmail}`,
    html: baseTemplate("Emergency Contact Added", "#4f8ef7", body),
  };
}

module.exports = {
  sendEmail,
  buildWarningEmail,
  buildContactAlertEmail,
  buildReleasedEmail,
  buildConfirmationAckEmail,
  buildContactWelcomeEmail,
};