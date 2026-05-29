const express = require("express");
const { v4: uuidv4 } = require("uuid");
const db = require("../database");
const authenticate = require("../middleware/auth");

const router = express.Router();
const MAX_ASSETS = 50;
const MAX_DATA_LENGTH = 5000;

router.get("/", authenticate, async (req, res) => {
  try {
    const assets = await db.prepare("SELECT * FROM assets WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
    const safe = assets.map(a => ({ ...a, data: req.user.status === "RELEASED" ? a.data : null }));
    res.json(safe);
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.post("/", authenticate, async (req, res) => {
  try {
    const { category, data } = req.body;
    if (!category || !data) return res.status(400).json({ message: "Category and data required." });
    if (typeof data !== "string" || data.length > MAX_DATA_LENGTH)
      return res.status(400).json({ message: `Data must be under ${MAX_DATA_LENGTH} characters.` });
    const { cnt } = await db.prepare("SELECT COUNT(*) as cnt FROM assets WHERE user_id = ?").get(req.user.id);
    if (cnt >= MAX_ASSETS) return res.status(400).json({ message: `Maximum of ${MAX_ASSETS} assets allowed.` });
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO assets (id, user_id, category, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, req.user.id, category, data, now, now);
    const asset = await db.prepare("SELECT * FROM assets WHERE id = ?").get(id);
    res.status(201).json({ ...asset, data: null });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.put("/:id", authenticate, async (req, res) => {
  try {
    const { category, data } = req.body;
    const asset = await db.prepare("SELECT * FROM assets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!asset) return res.status(404).json({ message: "Asset not found." });
    if (data !== undefined && (typeof data !== "string" || data.length > MAX_DATA_LENGTH))
      return res.status(400).json({ message: `Data must be under ${MAX_DATA_LENGTH} characters.` });
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE assets SET category = ?, data = ?, updated_at = ? WHERE id = ?").run(
      category ?? asset.category, data ?? asset.data, now, asset.id
    );
    res.json({ message: "Asset updated." });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

router.delete("/:id", authenticate, async (req, res) => {
  try {
    const asset = await db.prepare("SELECT * FROM assets WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
    if (!asset) return res.status(404).json({ message: "Asset not found." });
    await db.prepare("DELETE FROM assets WHERE id = ?").run(asset.id);
    res.json({ message: "Asset deleted." });
  } catch (err) { res.status(500).json({ message: "Internal server error" }); }
});

module.exports = router;