require("dotenv").config();
const path = require("path");
const fs = require("fs");

// ── Choose driver based on environment ───────────────────────────────────────
// Production: Turso (libsql) via TURSO_URL + TURSO_AUTH_TOKEN
// Development: local sql.js SQLite file

const IS_TURSO = !!process.env.TURSO_URL;

let db = null;
let _resolve, _reject;
const ready = new Promise((res, rej) => { _resolve = res; _reject = rej; });

// ── Schema ────────────────────────────────────────────────────────────────────
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE',
    last_active INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL,
    verified      INTEGER NOT NULL DEFAULT 0,
    confirm_token TEXT UNIQUE,
    confirmed_at  INTEGER,
    created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS assets (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    category   TEXT NOT NULL,
    data       TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
  CREATE TABLE IF NOT EXISTS inactivity_warnings (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    type       TEXT NOT NULL,
    sent_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  );
`;

// ── Turso (production) ────────────────────────────────────────────────────────
async function initTurso() {
  const { createClient } = require("@libsql/client");
  const client = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Run each statement individually (Turso doesn't support multi-statement batch in execute)
  const statements = SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    await client.execute(stmt);
  }

  // Wrap to match the synchronous-style API used throughout the codebase
  db = {
    prepare(sql) {
      return {
        async run(...params) {
          return client.execute({ sql, args: params });
        },
        async get(...params) {
          const res = await client.execute({ sql, args: params });
          return res.rows[0] ? Object.fromEntries(Object.entries(res.rows[0])) : undefined;
        },
        async all(...params) {
          const res = await client.execute({ sql, args: params });
          return res.rows.map(row => Object.fromEntries(Object.entries(row)));
        },
      };
    },
  };

  // Make all routes async-aware: wrap prepare to return thenables
  console.log("✅  Database ready: Turso (remote)");
  _resolve();
}

// ── sql.js (local dev) ────────────────────────────────────────────────────────
async function initLocal() {
  const initSqlJs = require("sql.js");
  const DB_PATH = path.join(__dirname, "../../data/digital_life.db");
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const SQL = await initSqlJs();
  let localDb;
  if (fs.existsSync(DB_PATH)) {
    localDb = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    localDb = new SQL.Database();
  }

  function persist() {
    fs.writeFileSync(DB_PATH, Buffer.from(localDb.export()));
  }

  localDb.run(SCHEMA);
  persist();

  db = {
    prepare(sql) {
      return {
        run(...params) { localDb.run(sql, params); persist(); return { changes: localDb.getRowsModified() }; },
        get(...params) {
          const stmt = localDb.prepare(sql);
          stmt.bind(params);
          const row = stmt.step() ? stmt.getAsObject() : undefined;
          stmt.free();
          return row;
        },
        all(...params) {
          const rows = [];
          const stmt = localDb.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          return rows;
        },
      };
    },
  };

  console.log("✅  Database ready:", DB_PATH);
  _resolve();
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(IS_TURSO ? initTurso() : initLocal()).catch(err => {
  console.error("❌  Database init failed:", err);
  _reject(err);
  process.exit(1);
});

module.exports = { ready, prepare: (sql) => db.prepare(sql) };