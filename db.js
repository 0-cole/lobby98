// db.js — SQLite persistence for accounts, coins, shop, stats
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DB_DIR || path.join(__dirname, "data");
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(path.join(DB_DIR, "lobby98.db"));
db.pragma("journal_mode = WAL");

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
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

export function safeUserData(u) {
  if (!u) return null;
  return {
    id: u.id, username: u.username, coins: u.coins,
    nameColor: u.name_color, title: u.title,
    gamesPlayed: u.games_played, gamesWon: u.games_won,
    totalPoints: u.total_points,
    ownedItems: (() => { try { return JSON.parse(u.owned_items); } catch { return ["default","none"]; } })()
  };
}
