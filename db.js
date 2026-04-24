// db.js — SQLite persistence for accounts, coins, shop, stats
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATABASE LOCATION:
// On Railway, set env var DB_DIR to your persistent volume mount (e.g. /data)
// This ensures the database survives redeploys.
// If DB_DIR is not set, falls back to ./data (will be wiped on redeploy!)
const DB_DIR = process.env.DB_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "lobby98.db");
console.log(`📦 Database location: ${DB_PATH}`);
console.log(`   ${process.env.DB_DIR ? '✅ Using persistent volume — data survives redeploys' : '⚠️  Using local ./data — set DB_DIR env var for persistence!'}`);
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Force WAL checkpoint — flushes all data to the main .db file
export function checkpoint() {
  try { db.pragma("wal_checkpoint(TRUNCATE)"); } catch {}
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    coins INTEGER DEFAULT 0,
    name_color TEXT DEFAULT 'default',
    title TEXT DEFAULT 'none',
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    owned_items TEXT DEFAULT '["default","none"]',
    created_at INTEGER NOT NULL,
    is_banned INTEGER DEFAULT 0,
    ban_reason TEXT,
    pfp_emoji TEXT DEFAULT '😎',
    custom_title TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);
// Migrate existing databases: add columns if missing
// SAFE: These try/catch ALTER TABLEs silently skip if columns already exist.
// Existing user data is NEVER deleted. Only the data/lobby98.db file deletion would wipe profiles.
// DO NOT drop or recreate the users table — always use ALTER TABLE for new columns.
try { db.exec("ALTER TABLE users ADD COLUMN is_banned INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN ban_reason TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN pfp_emoji TEXT DEFAULT '😎'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN custom_title TEXT"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN stock_cash REAL DEFAULT 1000"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN pfp_border TEXT DEFAULT 'none'"); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS portfolios (
    user_id INTEGER NOT NULL,
    stock_id TEXT NOT NULL,
    shares INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, stock_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS bug_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS achievements (
    user_id INTEGER NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS global_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    color TEXT DEFAULT '#8ec8e8',
    text TEXT NOT NULL,
    time INTEGER NOT NULL
  );
`);

const s = {
  createUser: db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"),
  getByName: db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE"),
  getById: db.prepare("SELECT * FROM users WHERE id = ?"),
  countUsers: db.prepare("SELECT COUNT(*) as n FROM users"),
  createSession: db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)"),
  getSession: db.prepare(`
    SELECT sessions.*, users.id as user_id, users.username, users.coins,
           users.name_color, users.title, users.games_played, users.games_won,
           users.total_points, users.owned_items
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `),
  deleteSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
  addCoins: db.prepare("UPDATE users SET coins = coins + ? WHERE id = ?"),
  setCoins: db.prepare("UPDATE users SET coins = ? WHERE id = ?"),
  setColor: db.prepare("UPDATE users SET name_color = ? WHERE id = ?"),
  setTitle: db.prepare("UPDATE users SET title = ? WHERE id = ?"),
  setOwnedItems: db.prepare("UPDATE users SET owned_items = ? WHERE id = ?"),
  addGamePlayed: db.prepare("UPDATE users SET games_played = games_played + 1 WHERE id = ?"),
  addGameWon: db.prepare("UPDATE users SET games_won = games_won + 1 WHERE id = ?"),
  addPoints: db.prepare("UPDATE users SET total_points = total_points + ? WHERE id = ?"),
  changePassword: db.prepare("UPDATE users SET password_hash = ? WHERE id = ?"),
  setBan: db.prepare("UPDATE users SET is_banned = ?, ban_reason = ? WHERE id = ?"),
  setPfpEmoji: db.prepare("UPDATE users SET pfp_emoji = ? WHERE id = ?"),
  setCustomTitle: db.prepare("UPDATE users SET custom_title = ? WHERE id = ?"),
  deleteSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  setStockCash: db.prepare("UPDATE users SET stock_cash = ? WHERE id = ?"),
  getPortfolio: db.prepare("SELECT stock_id, shares FROM portfolios WHERE user_id = ?"),
  upsertShares: db.prepare("INSERT INTO portfolios (user_id, stock_id, shares) VALUES (?, ?, ?) ON CONFLICT(user_id, stock_id) DO UPDATE SET shares = ?"),
  deleteShares: db.prepare("DELETE FROM portfolios WHERE user_id = ? AND stock_id = ?"),
  setPfpBorder: db.prepare("UPDATE users SET pfp_border = ? WHERE id = ?"),
};

export function userCount() { return s.countUsers.get().n; }
export function createUser(username, hash) {
  const info = s.createUser.run(username, hash, Date.now());
  return s.getById.get(info.lastInsertRowid);
}
export function getUserByName(name) { return s.getByName.get(name); }
export function getUserById(id) { return s.getById.get(id); }
export function createSession(token, userId) { s.createSession.run(token, userId, Date.now()); }
export function getSession(token) { return s.getSession.get(token); }
export function deleteSession(token) { s.deleteSession.run(token); }
export function addCoins(userId, amount) { s.addCoins.run(amount, userId); }
export function setCoins(userId, amount) { s.setCoins.run(amount, userId); }
export function setColor(userId, color) { s.setColor.run(color, userId); }
export function setTitle(userId, title) { s.setTitle.run(title, userId); }
export function getOwnedItems(userId) {
  const u = s.getById.get(userId);
  try { return JSON.parse(u.owned_items); } catch { return ["default", "none"]; }
}
export function addOwnedItem(userId, itemId) {
  const owned = getOwnedItems(userId);
  if (!owned.includes(itemId)) { owned.push(itemId); s.setOwnedItems.run(JSON.stringify(owned), userId); }
}
export function recordGame(userId, won, points) {
  s.addGamePlayed.run(userId);
  if (won) s.addGameWon.run(userId);
  if (points > 0) { s.addPoints.run(points, userId); s.addCoins.run(points, userId); }
}
export function changePassword(userId, hash) { s.changePassword.run(hash, userId); }
export function setBan(userId, banned, reason) { s.setBan.run(banned ? 1 : 0, reason || null, userId); if (banned) s.deleteSessions.run(userId); }
export function setPfpEmoji(userId, emoji) { s.setPfpEmoji.run(emoji, userId); }
export function setCustomTitle(userId, title) { s.setCustomTitle.run(title, userId); }
export function getStockCash(userId) { return s.getById.get(userId)?.stock_cash ?? 1000; }
export function setStockCash(userId, cash) { s.setStockCash.run(cash, userId); }
export function getPortfolio(userId) {
  const rows = s.getPortfolio.all(userId);
  const p = {};
  for (const r of rows) p[r.stock_id] = r.shares;
  return p;
}
export function setShares(userId, stockId, shares) {
  if (shares <= 0) s.deleteShares.run(userId, stockId);
  else s.upsertShares.run(userId, stockId, shares, shares);
}
export function setPfpBorder(userId, border) { s.setPfpBorder.run(border, userId); }

// Bug reports
const bugStmts = {
  insert: db.prepare("INSERT INTO bug_reports (user_id, username, title, body, created_at) VALUES (?, ?, ?, ?, ?)"),
  getAll: db.prepare("SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 50"),
  getOpen: db.prepare("SELECT * FROM bug_reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 50"),
  resolve: db.prepare("UPDATE bug_reports SET status = ? WHERE id = ?"),
  deleteOne: db.prepare("DELETE FROM bug_reports WHERE id = ?"),
};
export function submitBugReport(userId, username, title, body) {
  bugStmts.insert.run(userId, username, title, body, Date.now());
}
export function getBugReports(openOnly) {
  return openOnly ? bugStmts.getOpen.all() : bugStmts.getAll.all();
}
export function resolveBugReport(id, status) { bugStmts.resolve.run(status, id); }
export function deleteBugReport(id) { bugStmts.deleteOne.run(id); }

// Achievements
const achStmts = {
  get: db.prepare("SELECT achievement_id FROM achievements WHERE user_id = ?"),
  has: db.prepare("SELECT 1 FROM achievements WHERE user_id = ? AND achievement_id = ?"),
  add: db.prepare("INSERT OR IGNORE INTO achievements (user_id, achievement_id, earned_at) VALUES (?, ?, ?)"),
};
export function getUserAchievements(userId) { return achStmts.get.all(userId).map(r => r.achievement_id); }
export function hasAchievement(userId, achId) { return !!achStmts.has.get(userId, achId); }
export function awardAchievement(userId, achId) { achStmts.add.run(userId, achId, Date.now()); }

const leaderboardStmt = db.prepare(
  "SELECT id, username, coins, games_played, games_won, total_points FROM users ORDER BY total_points DESC LIMIT 20"
);
export function leaderboardQuery() {
  return leaderboardStmt.all().map(u => ({
    id: u.id, username: u.username, coins: u.coins,
    gamesPlayed: u.games_played, gamesWon: u.games_won, totalPoints: u.total_points
  }));
}

// Global chat persistence
const chatInsert = db.prepare("INSERT INTO global_chat (username, color, text, time) VALUES (?, ?, ?, ?)");
const chatHistory = db.prepare("SELECT username, color, text, time FROM global_chat ORDER BY id DESC LIMIT 100");
const chatTrim = db.prepare("DELETE FROM global_chat WHERE id NOT IN (SELECT id FROM global_chat ORDER BY id DESC LIMIT 200)");
export function saveChatMsg(username, color, text, time) {
  chatInsert.run(username, color, text, time);
}
export function getChatHistory() {
  return chatHistory.all().reverse(); // oldest first
}
export function trimChat() {
  chatTrim.run();
}

export function safeUserData(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, coins: u.coins,
    nameColor: u.name_color, title: u.title,
    gamesPlayed: u.games_played, gamesWon: u.games_won,
    totalPoints: u.total_points,
    ownedItems: (() => { try { return JSON.parse(u.owned_items); } catch { return ["default","none"]; } })(),
    isBanned: !!u.is_banned, banReason: u.ban_reason,
    pfpEmoji: u.pfp_emoji || '😎',
    customTitle: u.custom_title || null,
    stockCash: u.stock_cash ?? 1000,
    pfpBorder: u.pfp_border || 'none'
  };
}
