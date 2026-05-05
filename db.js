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
try { db.exec("ALTER TABLE users ADD COLUMN is_mod INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN muted_until INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN is_staff INTEGER DEFAULT 0"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN staff_perms TEXT DEFAULT '{}'"); } catch {}
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT '{}'"); } catch {}

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
  CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    UNIQUE(from_id, to_id)
  );
  CREATE TABLE IF NOT EXISTS direct_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    time INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    UNIQUE(message_id, user_id, emoji)
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
  setMod: db.prepare("UPDATE users SET is_mod = ? WHERE id = ?"),
  setMutedUntil: db.prepare("UPDATE users SET muted_until = ? WHERE id = ?"),
  setStaff: db.prepare("UPDATE users SET is_staff = ? WHERE id = ?"),
  setStaffPerms: db.prepare("UPDATE users SET staff_perms = ? WHERE id = ?"),
  allUsers: db.prepare("SELECT id, username, coins, is_banned, is_mod, is_staff, staff_perms, muted_until, games_played, games_won, total_points, created_at FROM users ORDER BY id DESC"),
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
export function setUsername(userId, newUsername) {
  // Caller must have already validated uniqueness. Returns false on collision.
  try { db.prepare("UPDATE users SET username = ? WHERE id = ?").run(newUsername, userId); return true; }
  catch { return false; }
}
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
export function setMod(userId, isMod) { s.setMod.run(isMod ? 1 : 0, userId); }
export function setMutedUntil(userId, until) { s.setMutedUntil.run(until, userId); }
export function setStaffUser(userId, isStaff) { s.setStaff.run(isStaff ? 1 : 0, userId); }
export function setStaffPerms(userId, perms) { s.setStaffPerms.run(JSON.stringify(perms), userId); }
export function getStaffPerms(userId) { const u = s.getById.get(userId); try { return JSON.parse(u?.staff_perms || "{}"); } catch { return {}; } }
export function getAllUsers() { return s.allUsers.all(); }

// Wipe user progress — selective
export function wipeUserProgress(userId, what) {
  if (what === "all" || what === "coins") db.prepare("UPDATE users SET coins = 0 WHERE id = ?").run(userId);
  if (what === "all" || what === "games") db.prepare("UPDATE users SET games_played = 0, games_won = 0, total_points = 0 WHERE id = ?").run(userId);
  if (what === "all" || what === "achievements") db.prepare("DELETE FROM achievements WHERE user_id = ?").run(userId);
  if (what === "all" || what === "shop") db.prepare("UPDATE users SET owned_items = '[\"default\",\"none\"]', name_color = 'default', title = 'none', pfp_emoji = '😎', custom_title = NULL, pfp_border = 'none' WHERE id = ?").run(userId);
  if (what === "all" || what === "stocks") db.prepare("UPDATE users SET stock_cash = 1000 WHERE id = ?").run(userId);
  // Delete stock portfolio
  if (what === "all" || what === "stocks") { try { db.prepare("DELETE FROM portfolio WHERE user_id = ?").run(userId); } catch {} }
}

// Bug reports
const bugStmts = {
  insert: db.prepare("INSERT INTO bug_reports (user_id, username, title, body, created_at) VALUES (?, ?, ?, ?, ?)"),
  getAll: db.prepare("SELECT * FROM bug_reports ORDER BY created_at DESC LIMIT 50"),
  getOpen: db.prepare("SELECT * FROM bug_reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 50"),
  resolve: db.prepare("UPDATE bug_reports SET status = ? WHERE id = ?"),
  deleteOne: db.prepare("DELETE FROM bug_reports WHERE id = ?"),
  countByUser: db.prepare("SELECT COUNT(*) as cnt FROM bug_reports WHERE user_id = ? AND status = 'open'"),
};
export function submitBugReport(userId, username, title, body) {
  bugStmts.insert.run(userId, username, title, body, Date.now());
}
export function getBugReports(openOnly) {
  return openOnly ? bugStmts.getOpen.all() : bugStmts.getAll.all();
}
export function resolveBugReport(id, status) { bugStmts.resolve.run(status, id); }
export function deleteBugReport(id) { bugStmts.deleteOne.run(id); }
export function countUserOpenBugs(userId) { return bugStmts.countByUser.get(userId)?.cnt || 0; }

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
  "SELECT id, username, coins, games_played, games_won, total_points FROM users WHERE is_banned = 0 ORDER BY total_points DESC LIMIT 20"
);
export function leaderboardQuery() {
  return leaderboardStmt.all().map(u => ({
    id: u.id, username: u.username, coins: u.coins,
    gamesPlayed: u.games_played, gamesWon: u.games_won, totalPoints: u.total_points
  }));
}

// Global chat persistence
const chatInsert = db.prepare("INSERT INTO global_chat (username, color, text, time) VALUES (?, ?, ?, ?)");
const chatHistory = db.prepare("SELECT id, username, color, text, time FROM global_chat ORDER BY id DESC LIMIT 100");
const chatTrim = db.prepare("DELETE FROM global_chat WHERE id NOT IN (SELECT id FROM global_chat ORDER BY id DESC LIMIT 200)");
const chatDeleteOne = db.prepare("DELETE FROM global_chat WHERE id = ?");
const chatClearAll = db.prepare("DELETE FROM global_chat");
export function saveChatMsg(username, color, text, time) {
  const info = chatInsert.run(username, color, text, time);
  return info.lastInsertRowid;
}
export function getChatHistory() {
  return chatHistory.all().reverse(); // oldest first
}
export function trimChat() {
  chatTrim.run();
}
export function deleteChatMsg(id) {
  chatDeleteOne.run(id);
}
export function clearAllChat() {
  chatClearAll.run();
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
    isMod: !!u.is_mod,
    isStaff: !!u.is_staff,
    staffPerms: (() => { try { return JSON.parse(u.staff_perms || "{}"); } catch { return {}; } })(),
    mutedUntil: u.muted_until || 0,
    pfpEmoji: u.pfp_emoji || '😎',
    customTitle: u.custom_title || null,
    stockCash: u.stock_cash ?? 1000,
    pfpBorder: u.pfp_border || 'none',
    createdAt: u.created_at || 0,
    avatar: (() => { try { return JSON.parse(u.avatar || "{}"); } catch { return {}; } })()
  };
}

export function deleteUserById(userId) {
  // Delete user account and all associated records.
  // Foreign-key tables get cleaned up first to avoid orphans.
  try { db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId); } catch {}
  try { db.prepare("DELETE FROM bug_reports WHERE user_id = ?").run(userId); } catch {}
  try { db.prepare("DELETE FROM achievements WHERE user_id = ?").run(userId); } catch {}
  try { db.prepare("DELETE FROM friends WHERE from_id = ? OR to_id = ?").run(userId, userId); } catch {}
  try { db.prepare("DELETE FROM direct_messages WHERE from_id = ? OR to_id = ?").run(userId, userId); } catch {}
  try { db.prepare("DELETE FROM chat_reactions WHERE user_id = ?").run(userId); } catch {}
  try { db.prepare("DELETE FROM chat_messages WHERE username IN (SELECT username FROM users WHERE id = ?)").run(userId); } catch {}
  return db.prepare("DELETE FROM users WHERE id = ?").run(userId).changes;
}

export function deleteAllUsersExcept(keepUsernames) {
  const placeholders = keepUsernames.map(() => '?').join(',');
  const delUsers = db.prepare(`DELETE FROM users WHERE username NOT IN (${placeholders})`);
  const delSessions = db.prepare(`DELETE FROM sessions WHERE user_id NOT IN (SELECT id FROM users)`);
  const delBugs = db.prepare(`DELETE FROM bug_reports WHERE user_id NOT IN (SELECT id FROM users)`);
  const delAch = db.prepare(`DELETE FROM achievements WHERE user_id NOT IN (SELECT id FROM users)`);
  const count = delUsers.run(...keepUsernames).changes;
  delSessions.run();
  delBugs.run();
  delAch.run();
  try { db.prepare("DELETE FROM friends WHERE from_id NOT IN (SELECT id FROM users) OR to_id NOT IN (SELECT id FROM users)").run(); } catch {}
  try { db.prepare("DELETE FROM direct_messages WHERE from_id NOT IN (SELECT id FROM users) OR to_id NOT IN (SELECT id FROM users)").run(); } catch {}
  try { db.prepare("DELETE FROM chat_reactions WHERE user_id NOT IN (SELECT id FROM users)").run(); } catch {}
  return count;
}

// ── Avatar ──
export function setAvatar(userId, avatar) {
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(JSON.stringify(avatar), userId);
}

// ── Friends ──
export function sendFriendRequest(fromId, toId) {
  // Check if already exists in either direction
  const existing = db.prepare("SELECT * FROM friends WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)").get(fromId, toId, toId, fromId);
  if (existing) return existing;
  db.prepare("INSERT INTO friends (from_id, to_id, status, created_at) VALUES (?, ?, 'pending', ?)").run(fromId, toId, Date.now());
  return { status: 'sent' };
}
export function acceptFriend(fromId, toId) {
  db.prepare("UPDATE friends SET status='accepted' WHERE from_id=? AND to_id=? AND status='pending'").run(fromId, toId);
}
export function removeFriend(userId, friendId) {
  db.prepare("DELETE FROM friends WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)").run(userId, friendId, friendId, userId);
}
export function getFriends(userId) {
  return db.prepare(`
    SELECT f.*, u.username, u.pfp_emoji, u.avatar FROM friends f
    JOIN users u ON (CASE WHEN f.from_id=? THEN f.to_id ELSE f.from_id END) = u.id
    WHERE (f.from_id=? OR f.to_id=?) AND f.status='accepted'
  `).all(userId, userId, userId);
}
export function getPendingRequests(userId) {
  return db.prepare("SELECT f.*, u.username, u.pfp_emoji FROM friends f JOIN users u ON f.from_id = u.id WHERE f.to_id=? AND f.status='pending'").all(userId);
}

// ── Direct Messages ──
export function sendDM(fromId, toId, text) {
  return db.prepare("INSERT INTO direct_messages (from_id, to_id, text, time) VALUES (?, ?, ?, ?)").run(fromId, toId, text, Date.now());
}
export function getDMs(userId1, userId2, limit = 50) {
  return db.prepare("SELECT d.*, u.username FROM direct_messages d JOIN users u ON d.from_id = u.id WHERE (d.from_id=? AND d.to_id=?) OR (d.from_id=? AND d.to_id=?) ORDER BY d.id DESC LIMIT ?").all(userId1, userId2, userId2, userId1, limit).reverse();
}

// ── Chat Reactions ──
export function addReaction(messageId, userId, emoji) {
  try { db.prepare("INSERT INTO chat_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)").run(messageId, userId, emoji); return true; }
  catch { db.prepare("DELETE FROM chat_reactions WHERE message_id=? AND user_id=? AND emoji=?").run(messageId, userId, emoji); return false; }
}
export function getReactions(messageId) {
  return db.prepare("SELECT emoji, COUNT(*) as count, GROUP_CONCAT(user_id) as users FROM chat_reactions WHERE message_id=? GROUP BY emoji").all(messageId);
}
export function getReactionsBulk(messageIds) {
  if (!messageIds.length) return {};
  const placeholders = messageIds.map(() => '?').join(',');
  const rows = db.prepare(`SELECT message_id, emoji, COUNT(*) as count FROM chat_reactions WHERE message_id IN (${placeholders}) GROUP BY message_id, emoji`).all(...messageIds);
  const result = {};
  for (const r of rows) { if (!result[r.message_id]) result[r.message_id] = []; result[r.message_id].push({ emoji: r.emoji, count: r.count }); }
  return result;
}

// ── Daily Challenges ──
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_progress (
    user_id INTEGER NOT NULL,
    challenge_key TEXT NOT NULL,
    day TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    claimed INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, challenge_key, day)
  )
`);
export function getDailyProgress(userId, day) {
  return db.prepare("SELECT * FROM daily_progress WHERE user_id = ? AND day = ?").all(userId, day);
}
export function incrementDaily(userId, challengeKey, day, amount = 1) {
  const existing = db.prepare("SELECT * FROM daily_progress WHERE user_id = ? AND challenge_key = ? AND day = ?").get(userId, challengeKey, day);
  if (!existing) {
    db.prepare("INSERT INTO daily_progress (user_id, challenge_key, day, progress) VALUES (?, ?, ?, ?)").run(userId, challengeKey, day, amount);
  } else {
    db.prepare("UPDATE daily_progress SET progress = progress + ? WHERE user_id = ? AND challenge_key = ? AND day = ?").run(amount, userId, challengeKey, day);
  }
}
export function claimDaily(userId, challengeKey, day) {
  db.prepare("UPDATE daily_progress SET claimed = 1 WHERE user_id = ? AND challenge_key = ? AND day = ?").run(userId, challengeKey, day);
}
