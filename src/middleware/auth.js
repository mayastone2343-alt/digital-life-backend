const jwt = require("jsonwebtoken");
const db = require("../database");

module.exports = async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(decoded.userId);
    if (!user) return res.status(401).json({ message: "User not found" });
    req.user = user;
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE users SET last_active = ? WHERE id = ?").run(now, user.id);
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};