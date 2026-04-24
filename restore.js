// restore.js — Pre-start: restore SQLite DB from PostgreSQL backup if available
// Runs BEFORE server.js so the DB file is in place when better-sqlite3 opens it.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "lobby98.db");

async function restore() {
  const pgUrl = process.env.DATABASE_URL;
  if (!pgUrl) {
    console.log("💾 No DATABASE_URL — skipping restore. Data won't persist across deploys.");
    return;
  }

  // If we already have a DB with real data, skip restore
  if (fs.existsSync(DB_PATH) && fs.statSync(DB_PATH).size > 4096) {
    console.log(`📦 Local DB exists (${(fs.statSync(DB_PATH).size / 1024).toFixed(1)} KB) — skipping restore.`);
    return;
  }

  try {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });

    // Create backup table if needed
    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_backup (
        id INTEGER PRIMARY KEY DEFAULT 1,
        data BYTEA NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        CHECK (id = 1)
      )
    `);

    const result = await pool.query("SELECT data, updated_at FROM db_backup WHERE id = 1");
    if (result.rows.length > 0 && result.rows[0].data) {
      if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
      fs.writeFileSync(DB_PATH, result.rows[0].data);
      console.log(`✅ Database restored from PostgreSQL (${result.rows[0].updated_at})`);
      console.log(`   Size: ${(result.rows[0].data.length / 1024).toFixed(1)} KB`);
    } else {
      console.log("📦 No backup in PostgreSQL yet — starting fresh.");
    }

    await pool.end();
  } catch (err) {
    console.error("⚠️ Restore failed:", err.message);
    console.log("   Starting with fresh database.");
  }
}

await restore();
