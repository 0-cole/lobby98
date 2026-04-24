// server.js — Lobby 98 (scribbl-style)
// ============================================================
// No accounts, no database. Just rooms with join codes.
//
// Flow:
//   - Visitor lands → either creates a room or joins one with a code
//   - Room creator becomes the "host" (can start games, kick people)
//   - Rooms live in memory. When the last person leaves, the room dies.
//   - Names are just labels — anyone can use any name, like scribbl.
// ============================================================

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import cookie from "cookie";
import { pickPrompts } from "./prompts.js";
import { pickWords } from "./words.js";
import { pickChainContent } from "./chains.js";
import { pickEchoPrompts } from "./echoprompts.js";
import { containsProfanity, cleanText } from "./filter.js";
import {
  createUser, getUserByName, getUserById, createSession, getSession,
  deleteSession, addCoins, setColor, setTitle, getOwnedItems,
  addOwnedItem, recordGame, safeUserData, changePassword, setCoins, leaderboardQuery,
  setBan, setPfpEmoji, setCustomTitle,
  getStockCash, setStockCash, getPortfolio, setShares, setPfpBorder, checkpoint
} from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
//   AUTH HELPERS
// ============================================================
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
function makeToken() { return crypto.randomBytes(32).toString("hex"); }
function setCookie(res, token) {
  res.setHeader("Set-Cookie", cookie.serialize("session", token, {
    httpOnly: true, path: "/", maxAge: 60*60*24*30, sameSite: "lax"
  }));
}
function clearCookie(res) {
  res.setHeader("Set-Cookie", cookie.serialize("session", "", {
    httpOnly: true, path: "/", maxAge: 0
  }));
}

// ============================================================
//   AUTH ENDPOINTS
// ============================================================
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Username: 3-16 chars, letters/numbers/underscore" });
  if (password.length < 4) return res.status(400).json({ error: "Password must be 4+ chars" });
  if (getUserByName(username)) return res.status(409).json({ error: "Username taken" });
  const hash = await bcrypt.hash(password, 10);
  const user = createUser(username, hash);
  const token = makeToken();
  createSession(token, user.id);
  setCookie(res, token);
  res.json({ ok: true, user: safeUserData(user) });
  triggerBackup();
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  const user = getUserByName(username);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  if (user.is_banned) return res.status(403).json({ error: "Account banned: " + (user.ban_reason || "no reason given") });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });
  const token = makeToken();
  createSession(token, user.id);
  setCookie(res, token);
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

app.post("/api/logout", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (cookies.session) deleteSession(cookies.session);
  clearCookie(res);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  if (!cookies.session) return res.json({ loggedIn: false });
  const sess = getSession(cookies.session);
  if (!sess) return res.json({ loggedIn: false });
  const user = getUserById(sess.user_id);
  res.json({ loggedIn: true, user: safeUserData(user) });
});

// ============================================================
//   SHOP ENDPOINTS
// ============================================================
const SHOP_ITEMS = {
  colors: [
    { id: "default", name: "Default", color: "#0b4d6e", price: 0 },
    { id: "cyan", name: "Cyan", color: "#1ab5d5", price: 30 },
    { id: "emerald", name: "Emerald", color: "#2d9e5a", price: 30 },
    { id: "sunset", name: "Sunset", color: "#e87830", price: 50 },
    { id: "magenta", name: "Magenta", color: "#c740a0", price: 50 },
    { id: "gold", name: "Gold", color: "#c89020", price: 80 },
    { id: "violet", name: "Violet", color: "#7c3aed", price: 80 },
    { id: "crimson", name: "Crimson", color: "#dc2626", price: 100 },
    { id: "ice", name: "Ice Blue", color: "#38bdf8", price: 100 },
    { id: "forest", name: "Forest", color: "#15803d", price: 120 },
    { id: "bubblegum", name: "Bubblegum", color: "#f472b6", price: 120 },
    { id: "midnight", name: "Midnight", color: "#1e1b4b", price: 150 },
    { id: "aurora", name: "Aurora", color: "linear-gradient(90deg,#1ab5d5,#2d9e5a,#c89020)", price: 200, gradient: true },
    { id: "neon", name: "Neon Pink", color: "#f43f8e", price: 200 },
    { id: "rainbow", name: "Rainbow", color: "linear-gradient(90deg,#ff0000,#ff8800,#ffff00,#00ff00,#0088ff,#8800ff)", price: 350, gradient: true },
  ],
  titles: [
    { id: "none", name: "None", price: 0 },
    { id: "spy-hunter", name: "Spy Hunter", price: 60 },
    { id: "offkey-legend", name: "Off-Key Legend", price: 60 },
    { id: "chain-breaker", name: "Chain Breaker", price: 60 },
    { id: "smooth-talker", name: "Smooth Talker", price: 100 },
    { id: "detective", name: "Detective", price: 100 },
    { id: "speedrunner", name: "Speedrunner", price: 100 },
    { id: "brainiac", name: "Brainiac", price: 120 },
    { id: "snake-charmer", name: "Snake Charmer", price: 120 },
    { id: "mastermind", name: "Mastermind", price: 150 },
    { id: "shadow", name: "The Shadow", price: 200 },
    { id: "arcade-king", name: "Arcade King", price: 250 },
    { id: "sharpshooter", name: "Sharpshooter", price: 250 },
    { id: "lobby-legend", name: "Lobby Legend", price: 400 },
    { id: "the-goat", name: "The G.O.A.T.", price: 600 },
  ],
  events: [
    { id: "rename-site", name: "Rename the site for 1 hour", price: 500, type: "event" },
    { id: "nuke-ui", name: "UI Nuke! Everything falls", price: 300, type: "event" },
    { id: "confetti", name: "Confetti explosion for everyone", price: 200, type: "event" },
  ],
  borders: [
    { id: "none", name: "None", price: 0, style: "none" },
    { id: "glow-cyan", name: "Cyan Glow", price: 80, style: "0 0 12px #1ab5d5, 0 0 24px rgba(26,181,213,0.3)" },
    { id: "glow-gold", name: "Gold Glow", price: 100, style: "0 0 12px #ffd700, 0 0 24px rgba(255,215,0,0.3)" },
    { id: "glow-pink", name: "Pink Glow", price: 100, style: "0 0 12px #f472b6, 0 0 24px rgba(244,114,182,0.3)" },
    { id: "glow-fire", name: "Fire Ring", price: 150, style: "0 0 8px #ff4500, 0 0 16px #ff6b00, 0 0 28px rgba(255,69,0,0.3)" },
    { id: "glow-rainbow", name: "Rainbow Aura", price: 250, style: "0 0 8px #ff0000, 0 0 12px #ff8800, 0 0 16px #ffff00, 0 0 20px #00ff00, 0 0 24px #0088ff" },
    { id: "glow-shadow", name: "Shadow Ring", price: 200, style: "0 0 15px #1e1b4b, 0 0 30px rgba(30,27,75,0.5), inset 0 0 8px rgba(0,0,0,0.3)" },
  ]
};

app.get("/api/shop", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  const user = sess ? getUserById(sess.user_id) : null;
  res.json({ items: SHOP_ITEMS, user: user ? safeUserData(user) : null });
});

app.post("/api/shop/buy", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  if (!user) return res.status(401).json({ error: "User not found" });
  const { itemId } = req.body || {};
  // Find item in shop
  const allItems = [...SHOP_ITEMS.colors, ...SHOP_ITEMS.titles];
  const item = allItems.find(i => i.id === itemId);
  if (!item) return res.status(400).json({ error: "Item not found" });
  const owned = getOwnedItems(user.id);
  if (owned.includes(itemId)) return res.status(400).json({ error: "Already owned" });
  if (user.coins < item.price) return res.status(400).json({ error: "Not enough coins" });
  setCoins(user.id, user.coins - item.price);
  addOwnedItem(user.id, itemId);
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

app.post("/api/shop/equip", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { type, itemId } = req.body || {};
  const owned = getOwnedItems(user.id);
  if (!owned.includes(itemId)) return res.status(400).json({ error: "Not owned" });
  if (type === "color") setColor(user.id, itemId);
  else if (type === "title") setTitle(user.id, itemId);
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

app.post("/api/shop/event", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { eventId } = req.body || {};
  const eventItem = SHOP_ITEMS.events.find(e => e.id === eventId);
  if (!eventItem) return res.status(400).json({ error: "Event not found" });
  if (user.coins < eventItem.price) return res.status(400).json({ error: "Not enough coins" });
  setCoins(user.id, user.coins - eventItem.price);
  // Trigger the event
  io.emit("site:userEvent", { event: eventId, user: user.username });
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

// ============================================================
//   ARCADE SCORING
// ============================================================
let currentSiteEvent = null; // shared with staff endpoints

app.post("/api/arcade/score", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { game, score, elapsed } = req.body || {};
  // Anti-cheat: validate score range and minimum elapsed time
  const coins = Math.min(Math.max(0, Math.floor(Number(score) || 0)), 50);
  const elapsedMs = Number(elapsed) || 0;
  // Games should take at least a few seconds — reject suspiciously fast completions
  const MIN_TIMES = { memory: 8000, minesweeper: 5000, clickspeed: 5000, mathrush: 28000, snake: 3000, dungeon: 0 };
  const minTime = MIN_TIMES[game] || 3000;
  if (coins > 10 && elapsedMs < minTime) {
    return res.status(400).json({ error: "Score rejected — too fast", coinsEarned: 0 });
  }
  if (coins > 0) {
    // Check for active event multiplier
    let finalCoins = coins;
    if (currentSiteEvent === "double-coins") finalCoins = coins * 2;
    else if (currentSiteEvent === "happy-hour") finalCoins = Math.floor(coins * 1.5);
    finalCoins = Math.min(finalCoins, 100); // hard cap even with multipliers
    addCoins(user.id, finalCoins);
    recordGame(user.id, coins >= 10, finalCoins);
  }
  res.json({ ok: true, coinsEarned: coins, user: safeUserData(getUserById(user.id)) });
});

app.post("/api/settings/password", async (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { currentPassword, newPassword } = req.body || {};
  const user = getUserById(sess.user_id);
  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) return res.status(400).json({ error: "Current password is wrong" });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "New password must be 4+ chars" });
  const hash = await bcrypt.hash(newPassword, 10);
  changePassword(user.id, hash);
  res.json({ ok: true });
});

// ============================================================
//   LEADERBOARD
// ============================================================
app.get("/api/leaderboard", (req, res) => {
  // Top 20 by total points
  const rows = leaderboardQuery();
  res.json({ leaderboard: rows });
});

// ============================================================
//   FAKE NEWS
// ============================================================
const FAKE_NEWS = [
  "BREAKING: Local Man Discovers That 'Reply All' Button Has Consequences",
  "Scientists Confirm: The Five-Second Rule Actually Depends On The Floor's Feelings",
  "Area WiFi Password Changed, Entire Family Forced Outside",
  "Man Who Brought Guitar To Party Unsure Why He's Now Alone",
  "Study Finds 100% of People Who Drink Water Eventually Die",
  "Local Dog Successfully Convinces Owner It's Never Been Fed Before",
  "Breaking: Entire Meeting Could Have Been An Email, Confirms Everyone",
  "Man Finishes To-Do List, Universe Immediately Generates New Tasks",
  "Weather Report: Tomorrow Will Be Just Like Today But Slightly Worse",
  "EXCLUSIVE: Cat Knocks Glass Off Table, Claims It Was 'In Self-Defense'",
  "URGENT: Student Discovers That 'I'll Start Tomorrow' Is Not A Valid Strategy",
  "Local Introvert Achieves Personal Best: 47 Hours Without Speaking",
  "REPORT: Autocorrect Ruins Another Perfectly Good Text Message",
  "Nation's Fridges 90% More Interesting At 2 AM, Study Finds",
  "ALERT: Sock Lost In Dryer Confirmed To Be Living Its Best Life",
  "Area Child Asks 'Why' For The 847th Time Today",
  "DEVELOPING: Monday Arrives Once Again Despite Widespread Objections",
  "Tech CEO Announces Revolutionary Product That Is Just A Slightly Bigger Rectangle",
  "Local Grandma Somehow Has Stronger WiFi Signal Than Tech Company Office",
  "JUST IN: Group Chat Has Been Active For 6 Hours And Nothing Has Been Decided",
  "Research Confirms Watching Cooking Shows Does Not Actually Teach You To Cook",
  "Man Organizes Desktop, Feels Like He Has Achieved Enlightenment",
  "FLASH: Pizza Delivery Driver Knows More About Your Neighborhood Than You Do",
  "Experts Warn: Your Plant Can Definitely Hear You Apologizing For Not Watering It",
];

app.get("/api/fakenews", (req, res) => {
  const headline = FAKE_NEWS[Math.floor(Math.random() * FAKE_NEWS.length)];
  res.json({ headline });
});

// ============================================================
//   STAFF ENDPOINTS
// ============================================================
const STAFF_USERS = ["cole"]; // hardcoded staff

function isStaff(username) {
  return STAFF_USERS.includes(username?.toLowerCase());
}

app.get("/api/staff/check", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.json({ isStaff: false });
  const user = getUserById(sess.user_id);
  res.json({ isStaff: isStaff(user?.username) });
});

app.post("/api/staff/givecoins", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username, amount } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  const amt = Math.floor(Number(amount));
  if (!amt || amt < 1 || amt > 10000) return res.status(400).json({ error: "Amount must be 1-10000" });
  addCoins(target.id, amt);
  res.json({ ok: true, message: `Gave ${amt} coins to ${target.username}` });
});

app.post("/api/staff/event", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { event } = req.body || {};
  currentSiteEvent = event || null;
  io.emit("site:event", { event: currentSiteEvent });
  res.json({ ok: true, event: currentSiteEvent });
});

app.get("/api/staff/event", (req, res) => {
  res.json({ event: currentSiteEvent });
});

app.post("/api/staff/broadcast", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { message } = req.body || {};
  if (!message || message.length > 200) return res.status(400).json({ error: "Message required (max 200 chars)" });
  io.emit("site:broadcast", { message, from: staff.username });
  res.json({ ok: true });
});

app.get("/api/staff/lookup", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username } = req.query || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "Not found" });
  res.json({ user: safeUserData(target) });
});

app.post("/api/staff/ban", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username, reason, unban } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isStaff(target.username)) return res.status(400).json({ error: "Can't ban staff" });
  if (unban) {
    setBan(target.id, false, null);
    return res.json({ ok: true, message: `Unbanned ${target.username}` });
  }
  setBan(target.id, true, reason || "No reason given");
  // Kick from any active socket
  for (const [sid, code] of socketToRoom) {
    const sock = io.sockets.sockets.get(sid);
    if (sock?.data?.user?.id === target.id) {
      sock.emit("banned", { reason: reason || "No reason given" });
      sock.disconnect(true);
    }
  }
  res.json({ ok: true, message: `Banned ${target.username}` });
});

app.post("/api/staff/giveitem", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username, itemId } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  addOwnedItem(target.id, itemId);
  res.json({ ok: true, message: `Gave ${itemId} to ${target.username}` });
});

app.post("/api/staff/confetti", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  io.emit("site:userEvent", { event: "confetti", user: staff.username });
  res.json({ ok: true });
});

// Profile endpoints
app.post("/api/profile/update", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { pfpEmoji, nameColor, title, customTitle } = req.body || {};
  if (pfpEmoji) setPfpEmoji(user.id, pfpEmoji.slice(0, 4));
  if (nameColor) {
    const owned = getOwnedItems(user.id);
    if (owned.includes(nameColor)) setColor(user.id, nameColor);
  }
  if (title !== undefined) {
    if (title === "custom" && customTitle) {
      const cleaned = cleanText(customTitle, 20);
      if (cleaned === null) return res.status(400).json({ error: "Title contains inappropriate language" });
      if (user.coins < 1000) return res.status(400).json({ error: "Custom titles cost 1000 coins" });
      setCoins(user.id, user.coins - 1000);
      setCustomTitle(user.id, cleaned);
      setTitle(user.id, "custom");
    } else {
      const owned = getOwnedItems(user.id);
      if (owned.includes(title) || title === "none") setTitle(user.id, title);
    }
  }
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

// ============================================================
//   STOCK MARKET ENGINE
// ============================================================
const STOCKS = [
  { id:"LOBY", ticker:"LOBY", name:"Lobby Corp", emoji:"🏢", price:50, history:[] },
  { id:"BUBBL", ticker:"BUBBL", name:"Bubble Tea Inc", emoji:"🧋", price:25, history:[] },
  { id:"MEME", ticker:"MEME", name:"Meme Capital", emoji:"🐸", price:10, history:[] },
  { id:"YOLO", ticker:"YOLO", name:"YOLO Ventures", emoji:"🚀", price:80, history:[] },
  { id:"BONK", ticker:"BONK", name:"Bonk Industries", emoji:"🔨", price:5, history:[] },
  { id:"CHILL", ticker:"CHILL", name:"Chill Holdings", emoji:"🧊", price:35, history:[] },
  { id:"VIBE", ticker:"VIBE", name:"Vibe Check LLC", emoji:"✨", price:15, history:[] },
  { id:"GOAT", ticker:"GOAT", name:"G.O.A.T. Systems", emoji:"🐐", price:120, history:[] },
];
// Init histories
for (const s of STOCKS) { s.history = Array(30).fill(s.price); }
// Price simulation — random walk with mean reversion
setInterval(() => {
  for (const s of STOCKS) {
    const trend = (Math.random() - 0.48) * s.price * 0.04; // slight upward bias
    const mean = s.history[0]; // mean-revert toward starting price
    const revert = (mean - s.price) * 0.01;
    s.price = Math.max(0.5, s.price + trend + revert);
    s.price = Math.round(s.price * 100) / 100;
    s.history.push(s.price);
    if (s.history.length > 60) s.history.shift();
  }
}, 5000);

app.get("/api/stocks", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const portfolio = getPortfolio(user.id);
  const cash = user.stock_cash ?? 1000;
  res.json({ stocks: STOCKS.map(s => ({ id:s.id, ticker:s.ticker, name:s.name, emoji:s.emoji, price:s.price, history:[...s.history] })), portfolio, cash });
});

app.post("/api/stocks/buy", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { stockId, amount } = req.body || {};
  const stock = STOCKS.find(s => s.id === stockId);
  if (!stock) return res.status(400).json({ error: "Stock not found" });
  const qty = Math.max(1, Math.min(100, Math.floor(Number(amount) || 1)));
  const cost = stock.price * qty;
  const cash = user.stock_cash ?? 1000;
  if (cash < cost) return res.status(400).json({ error: `Not enough cash. Need $${cost.toFixed(2)}, have $${cash.toFixed(2)}` });
  setStockCash(user.id, cash - cost);
  const portfolio = getPortfolio(user.id);
  setShares(user.id, stockId, (portfolio[stockId] || 0) + qty);
  res.json({ ok: true });
});

app.post("/api/stocks/sell", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { stockId, amount } = req.body || {};
  const stock = STOCKS.find(s => s.id === stockId);
  if (!stock) return res.status(400).json({ error: "Stock not found" });
  const portfolio = getPortfolio(user.id);
  const held = portfolio[stockId] || 0;
  const qty = Math.max(1, Math.min(held, Math.floor(Number(amount) || 1)));
  if (held < qty) return res.status(400).json({ error: "Not enough shares" });
  const revenue = stock.price * qty;
  setStockCash(user.id, (user.stock_cash ?? 1000) + revenue);
  setShares(user.id, stockId, held - qty);
  res.json({ ok: true });
});

// ============================================================
//   SHOOTER RELAY (Socket.IO)
// ============================================================
// Shooter rooms are just regular rooms with mode "blitz".
// Server relays positions and bullets between players. No server-side physics.
const shooterStates = new Map(); // roomCode -> { players: {id: {x,y,angle,hp,name,color}} }

function setupShooterRelay(socket, roomCode) {
  socket.on('shooter:move', (data) => {
    if (!shooterStates.has(roomCode)) shooterStates.set(roomCode, { players: {} });
    const state = shooterStates.get(roomCode);
    state.players[socket.id] = data;
  });
  socket.on('shooter:bullet', (b) => {
    socket.to(roomCode).emit('shooter:bullet', { ...b, owner: socket.id });
  });
  socket.on('shooter:hit', ({ victim, damage }) => {
    io.to(roomCode).emit('shooter:hit', { victim, damage, attacker: socket.id });
  });
  socket.on('shooter:died', ({ killer }) => {
    io.to(roomCode).emit('shooter:kill', { killer, victim: socket.id });
  });
}

// Broadcast shooter state at 15fps
setInterval(() => {
  for (const [code, state] of shooterStates) {
    if (Object.keys(state.players).length === 0) { shooterStates.delete(code); continue; }
    io.to(code).emit('shooter:state', state.players);
  }
}, 66);

// Profile border update
app.post("/api/profile/border", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { border } = req.body || {};
  const owned = getOwnedItems(user.id);
  if (border !== "none" && !owned.includes(border)) return res.status(400).json({ error: "Not owned" });
  setPfpBorder(user.id, border);
  res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
});

// ============================================================
//   GAME COMPLETION — award coins to logged-in players
// ============================================================

function getPublicRooms() {
  const list = [];
  for (const [code, room] of rooms) {
    if (room.visibility === "private") continue;
    list.push({
      code, mode: room.mode, playerCount: room.players.size,
      hostName: room.players.get(room.hostId)?.name || "???",
      inGame: !!room.game
    });
  }
  return list;
}

app.get("/api/rooms", (req, res) => {
  res.json({ rooms: getPublicRooms() });
});
function awardGameCoins(room) {
  const g = room.game;
  if (!g) return;
  for (const [pid, score] of g.scores) {
    const sock = io.sockets.sockets.get(pid);
    if (sock?.data?.user?.id && score > 0) {
      const allScores = [...g.scores.values()];
      const maxScore = Math.max(...allScores);
      const won = score === maxScore;
      recordGame(sock.data.user.id, won, score);
      // Notify the client their coins updated
      const updated = getUserById(sock.data.user.id);
      if (updated) sock.emit("user:updated", safeUserData(updated));
    }
  }
}

// ============================================================
//   ROOM SYSTEM
// ============================================================

const rooms = new Map();
const socketToRoom = new Map(); // socket.id → room code, for quick lookup

// Characters used in room codes. No O/0/I/1/L to avoid confusion.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const MAX_PLAYERS = 12;
const MAX_CHAT = 50;
const MIN_PLAYERS_FREQUENCY = 3;
const MIN_PLAYERS_WORDSPY = 3;
const MIN_PLAYERS_CHAIN = 3;
const DEFAULT_ROUNDS = 5;

// Phase timers (in ms)
const TIMER_SUBMIT = 30_000;    // 30 seconds to rate (Frequency)
const TIMER_DISCUSS = 60_000;   // 60 seconds discussion
const TIMER_VOTE = 20_000;      // 20 seconds to vote
const TIMER_INTERMISSION = 10_000; // 10 seconds breather
const TIMER_CLUE = 15_000;     // 15 seconds per clue turn (Word Spy)
const TIMER_WS_DISCUSS = 45_000; // 45 seconds Word Spy discussion
const TIMER_SPY_GUESS = 20_000;  // 20 seconds for spy to guess the word
const MAX_CLUE_LENGTH = 40;
const TIMER_CHAIN_TURN = 10_000;  // 10 seconds per word (Chain)
const CHAIN_MAX_WORDS = 20;       // sentence ends after this many words
const MAX_CHAIN_WORD_LENGTH = 25;

function generateCode() {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LEN; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  const cleaned = raw.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 16);
  return cleaned;
}

function uniqueNameInRoom(room, desired) {
  const existing = new Set([...room.players.values()].map(p => p.name.toLowerCase()));
  if (!existing.has(desired.toLowerCase())) return desired;
  let n = 2;
  while (existing.has(`${desired.toLowerCase()} (${n})`)) n++;
  return `${desired} (${n})`;
}

function roomSnapshot(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    visibility: room.visibility || "public",
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId
    })),
    spectators: [...room.spectators.values()].map(s => ({
      id: s.id,
      name: s.name
    })),
    game: room.game ? gameSnapshot(room) : null
  };
}

function gameSnapshot(room) {
  const g = room.game;
  if (!g) return null;

  const snap = {
    type: g.type,          // "frequency" or "wordspy"
    phase: g.phase,
    round: g.round,
    totalRounds: g.totalRounds,
    scores: Object.fromEntries(g.scores),
    timerEnd: g.timerEnd || null,
    playerCount: g.activePlayers.size,
    roundScoreDeltas: g.roundScoreDeltas || {}
  };

  // === Frequency-specific fields ===
  if (g.type === "frequency") {
    snap.ratingsSubmitted = [...g.ratings.keys()];
    snap.votesSubmitted = [...g.votes.keys()];

    if (g.phase === "discuss" || g.phase === "voting" || g.phase === "results" || g.phase === "gameover") {
      snap.revealedRatings = Object.fromEntries(g.ratings);
    }
    if (g.phase === "results" || g.phase === "gameover") {
      snap.revealedVotes = Object.fromEntries(g.votes);
      snap.offKeyId = g.offKeyId;
      snap.offKeyPrompt = g.promptPair.offkey;
      snap.normalPrompt = g.promptPair.normal;
    }
  }

  // === Word Spy-specific fields ===
  if (g.type === "wordspy") {
    snap.votesSubmitted = [...g.votes.keys()];
    // Turn order and current turn — everyone can see this
    snap.turnOrder = g.turnOrder;
    snap.currentTurn = g.currentTurn;
    // Clues that have been given (visible to everyone)
    snap.clues = [...g.clues.entries()].map(([pid, clue]) => ({ id: pid, clue }));
    // Category is always visible (helps spy bluff)
    snap.category = g.wordData.category;

    if (g.phase === "ws-voting") {
      // Show clues during voting for reference
    }
    if (g.phase === "ws-spyguess" || g.phase === "ws-results" || g.phase === "gameover") {
      snap.revealedVotes = Object.fromEntries(g.votes);
      snap.spyId = g.spyId;
      snap.word = g.wordData.word;
      snap.spyCaught = g.spyCaught ?? false;
      snap.spyGuess = g.spyGuess ?? null;
      snap.spyGuessedCorrectly = g.spyGuessedCorrectly ?? false;
      snap.spyName = g.spyName || (room.players.get(g.spyId)?.name) || "???";
    }
  }

  // === Chain-specific fields ===
  if (g.type === "chain") {
    snap.sentence = g.sentence;           // array of { word, playerId }
    snap.turnOrder = g.turnOrder;
    snap.currentTurn = g.currentTurn;
    snap.starter = g.chainData.starter;
    snap.accusation = g.accusation || null; // { accuserId, accusedId }

    if (g.phase === "chain-results" || g.phase === "gameover") {
      snap.saboteurId = g.saboteurId;
      snap.saboteurName = g.saboteurName || room.players.get(g.saboteurId)?.name || "???";
      snap.targetWord = g.chainData.targetWord;
      snap.wordSneakedIn = g.wordSneakedIn ?? false;
      snap.accusationCorrect = g.accusationCorrect ?? null;
    }
  }

  // === Echo-specific fields ===
  if (g.type === "echo") {
    snap.answersSubmitted = [...g.answers.keys()];
    snap.votesSubmitted = [...g.votes.keys()];
    if (g.phase === "echo-discuss" || g.phase === "echo-voting" || g.phase === "echo-results" || g.phase === "gameover") {
      snap.shuffledAnswers = g.shuffledAnswers || [];
    }
    if (g.phase === "echo-results" || g.phase === "gameover") {
      snap.echoId = g.echoId;
      snap.echoName = room.players.get(g.echoId)?.name || "???";
      snap.normalPrompt = g.promptPair.normal;
      snap.echoPrompt = g.promptPair.echo;
      snap.revealedVotes = Object.fromEntries(g.votes);
    }
  }

  return snap;
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", roomSnapshot(room));
}

function addSystemMessage(room, text) {
  const msg = { id: Date.now() + Math.random(), name: "SYSTEM", text, ts: Date.now(), system: true };
  room.chat.push(msg);
  if (room.chat.length > MAX_CHAT) room.chat.shift();
  io.to(room.code).emit("chat:message", msg);
}

// ============================================================
//   TIMER MANAGEMENT
// ============================================================

function clearRoomTimer(room) {
  if (room._timer) {
    clearTimeout(room._timer);
    room._timer = null;
  }
}

function setRoomTimer(room, duration, callback) {
  clearRoomTimer(room);
  if (room.game) {
    room.game.timerEnd = Date.now() + duration;
  }
  room._timer = setTimeout(() => {
    room._timer = null;
    callback();
  }, duration);
}

// ============================================================
//   FREQUENCY GAME LOGIC
// ============================================================

function startFrequencyGame(room, numRounds) {
  const playerIds = [...room.players.keys()];
  const totalRounds = Math.min(numRounds || DEFAULT_ROUNDS, 10);
  const prompts = pickPrompts(totalRounds);

  // Shuffle player order for Off-Key rotation (wrap if more rounds than players)
  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
  const offKeyOrder = [];
  for (let i = 0; i < totalRounds; i++) {
    offKeyOrder.push(shuffledPlayers[i % shuffledPlayers.length]);
  }

  room.game = {
    type: "frequency",
    phase: "prompting",
    round: 1,
    totalRounds,
    offKeyId: offKeyOrder[0],
    offKeyOrder,
    promptPair: prompts[0],
    prompts,
    ratings: new Map(),
    votes: new Map(),
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    roundScoreDeltas: {},
    timerEnd: null
  };

  sendPromptsToPlayers(room);
  addSystemMessage(room, `🎵 Frequency — Round 1 of ${totalRounds}. Rate the prompt! (30s)`);
  broadcastRoom(room);

  // Start the 30-second submission timer
  setRoomTimer(room, TIMER_SUBMIT, () => {
    forceSubmitPhaseEnd(room);
  });
}

function sendPromptsToPlayers(room) {
  const g = room.game;
  for (const pid of g.activePlayers) {
    if (!room.players.has(pid)) continue;
    const isOffKey = pid === g.offKeyId;
    const prompt = isOffKey ? g.promptPair.offkey : g.promptPair.normal;
    io.to(pid).emit("game:yourPrompt", { prompt, round: g.round });
  }
}

function handleRatingSubmit(room, socketId, rating) {
  const g = room.game;
  if (!g || g.phase !== "prompting") return;
  if (!g.activePlayers.has(socketId)) return;
  if (g.ratings.has(socketId)) return;

  const val = Math.round(Number(rating));
  if (val < 1 || val > 10 || isNaN(val)) return;

  g.ratings.set(socketId, val);
  broadcastRoom(room);

  // Check if all active players have submitted
  if (g.ratings.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    transitionToDiscuss(room);
  }
}

function forceSubmitPhaseEnd(room) {
  const g = room.game;
  if (!g || g.phase !== "prompting") return;

  // Anyone who didn't submit gets a random 5 (middle value)
  for (const pid of g.activePlayers) {
    if (!g.ratings.has(pid)) {
      g.ratings.set(pid, 5);
      const pname = room.players.get(pid)?.name || "???";
      addSystemMessage(room, `⏰ ${pname} didn't submit in time — defaulted to 5`);
    }
  }
  transitionToDiscuss(room);
}

function transitionToDiscuss(room) {
  const g = room.game;
  g.phase = "discuss";
  g.timerEnd = Date.now() + TIMER_DISCUSS;
  addSystemMessage(room, `All ratings are in! Discuss — who seems off? 🔍 (60s)`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_DISCUSS, () => {
    transitionToVoting(room);
  });
}

function transitionToVoting(room) {
  const g = room.game;
  g.phase = "voting";
  g.timerEnd = Date.now() + TIMER_VOTE;
  addSystemMessage(room, `⏳ Time to vote! Who is the Off-Key? (20s)`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_VOTE, () => {
    forceVotePhaseEnd(room);
  });
}

function handleVoteSubmit(room, socketId, targetId) {
  const g = room.game;
  if (!g || g.phase !== "voting") return;
  if (!g.activePlayers.has(socketId)) return;
  if (g.votes.has(socketId)) return;
  if (socketId === targetId) return;
  if (!g.activePlayers.has(targetId)) return;

  g.votes.set(socketId, targetId);
  broadcastRoom(room);

  if (g.votes.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    transitionToResults(room);
  }
}

function forceVotePhaseEnd(room) {
  const g = room.game;
  if (!g || g.phase !== "voting") return;
  // Non-voters simply don't contribute — no forced votes
  transitionToResults(room);
}

function transitionToResults(room, offKeyDisconnected = false) {
  const g = room.game;
  g.phase = "results";
  clearRoomTimer(room);

  // --- Scoring (per design doc) ---
  const deltas = {};
  for (const pid of g.activePlayers) deltas[pid] = 0;

  if (offKeyDisconnected) {
    // Off-Key disconnected during discuss/voting. Give 0 points to everyone.
    g.roundScoreDeltas = deltas;
    addSystemMessage(room, `The Off-Key disconnected! No winner this round.`);
    broadcastRoom(room);
    return;
  }

  // Count votes for the Off-Key
  let offKeyVotes = 0;

  for (const [voterId, targetId] of g.votes) {
    if (targetId === g.offKeyId) {
      offKeyVotes++;
    }
  }

  const majorityThreshold = Math.floor(g.activePlayers.size / 2) + 1;
  const offKeyCaught = offKeyVotes >= majorityThreshold;

  if (offKeyCaught) {
    // Off-Key was caught — correct voters get +2
    for (const [voterId, targetId] of g.votes) {
      if (targetId === g.offKeyId) {
        deltas[voterId] = (deltas[voterId] || 0) + 2;
      }
    }
    // Check consolation: Off-Key gets +1 if their rating was strictly closest to median
    if (g.activePlayers.size >= 5) {
      const ratings = [...g.ratings.entries()];
      const allVals = ratings.map(([, v]) => v).sort((a, b) => a - b);
      const median = allVals[Math.floor(allVals.length / 2)];
      const offKeyRating = g.ratings.get(g.offKeyId) ?? 5;
      const offKeyDist = Math.abs(offKeyRating - median);
      let closest = true;
      for (const [pid, val] of ratings) {
        if (pid === g.offKeyId) continue;
        if (Math.abs(val - median) <= offKeyDist) {
          closest = false;
          break;
        }
      }
      if (closest) {
        deltas[g.offKeyId] = (deltas[g.offKeyId] || 0) + 1;
      }
    }
  } else {
    // Off-Key survived — they get +3
    deltas[g.offKeyId] = (deltas[g.offKeyId] || 0) + 3;
  }

  // Apply deltas to cumulative scores
  for (const [pid, delta] of Object.entries(deltas)) {
    g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
  }
  g.roundScoreDeltas = deltas;

  const offKeyName = room.players.get(g.offKeyId)?.name || "???";
  if (offKeyCaught) {
    addSystemMessage(room, `🎯 The Off-Key was ${offKeyName} — the group caught them!`);
  } else {
    addSystemMessage(room, `😎 The Off-Key was ${offKeyName} — they blended in!`);
  }
  broadcastRoom(room);
}

function advanceToNextRound(room) {
  const g = room.game;
  if (!g || g.phase !== "results") return;

  if (g.round >= g.totalRounds) {
    g.phase = "gameover";
    clearRoomTimer(room);
    awardGameCoins(room);
    addSystemMessage(room, `🏆 Game over! Check the final scores.`);
    broadcastRoom(room);

    // Auto-return to lobby after 30 seconds
    setRoomTimer(room, 30_000, () => {
      if (room.game && room.game.phase === "gameover") {
        backToLobby(room);
      }
    });
    return;
  }

  // Intermission
  g.phase = "intermission";
  g.timerEnd = Date.now() + TIMER_INTERMISSION;
  addSystemMessage(room, `⏸ Next round in 10 seconds...`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_INTERMISSION, () => {
    startNextRound(room);
  });
}

function startNextRound(room) {
  const g = room.game;
  g.round++;
  g.phase = "prompting";
  g.offKeyId = g.offKeyOrder[g.round - 1];
  g.promptPair = g.prompts[g.round - 1];
  g.ratings = new Map();
  g.votes = new Map();
  g.roundScoreDeltas = {};

  // Update active players to current room members that are in the game
  g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));

  if (g.activePlayers.size < 2) {
    g.phase = "gameover";
    addSystemMessage(room, `Not enough players — game over!`);
    broadcastRoom(room);
    return;
  }

  // If the Off-Key for this round left, pick a random active player
  if (!g.activePlayers.has(g.offKeyId)) {
    const remaining = [...g.activePlayers];
    g.offKeyId = remaining[Math.floor(Math.random() * remaining.length)];
  }

  sendPromptsToPlayers(room);
  addSystemMessage(room, `🎵 Round ${g.round} of ${g.totalRounds}. Rate the prompt! (30s)`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_SUBMIT, () => {
    forceSubmitPhaseEnd(room);
  });
}

function backToLobby(room) {
  clearRoomTimer(room);
  room.game = null;
  room.mode = null;
  // Move spectators back to players
  for (const [id, spec] of room.spectators) {
    if (io.sockets.sockets.has(id)) {
      room.players.set(id, { id, name: spec.name });
    }
  }
  room.spectators = new Map();
  addSystemMessage(room, `Returned to the lobby.`);
  broadcastRoom(room);
}

// Handle a player disconnecting mid-game
function handleGameDisconnect(room, socketId) {
  const g = room.game;
  if (!g) return;

  g.activePlayers.delete(socketId);
  g.ratings.delete(socketId);
  g.votes.delete(socketId);

  if (g.activePlayers.size < 2) {
    clearRoomTimer(room);
    room.game = null;
    room.mode = null;
    addSystemMessage(room, `Not enough players — game ended.`);
    return;
  }

  // Mid-round disconnect: if Off-Key left during prompting, cancel round & restart
  if (g.phase === "prompting" && socketId === g.offKeyId) {
    clearRoomTimer(room);
    addSystemMessage(room, `The Off-Key disconnected — restarting round with remaining players...`);
    // Pick a new Off-Key from remaining for this round
    const remaining = [...g.activePlayers];
    g.offKeyId = remaining[Math.floor(Math.random() * remaining.length)];
    g.ratings = new Map();
    g.votes = new Map();
    g.phase = "prompting";
    sendPromptsToPlayers(room);
    broadcastRoom(room);
    setRoomTimer(room, TIMER_SUBMIT, () => forceSubmitPhaseEnd(room));
    return;
  }

  // If Off-Key left during discuss or voting, skip to results with no winner
  if ((g.phase === "discuss" || g.phase === "voting") && socketId === g.offKeyId) {
    clearRoomTimer(room);
    transitionToResults(room, true);
    return;
  }

  // If someone else left mid-round, check if all remaining have submitted/voted
  if (g.phase === "prompting" && g.ratings.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    transitionToDiscuss(room);
  } else if (g.phase === "voting" && g.votes.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    transitionToResults(room);
  } else {
    broadcastRoom(room);
  }
}

// ============================================================
//   WORD SPY GAME LOGIC
// ============================================================

function startWordSpyGame(room, numRounds) {
  const playerIds = [...room.players.keys()];
  const totalRounds = Math.min(numRounds || DEFAULT_ROUNDS, 10);
  const words = pickWords(totalRounds);

  // Rotate spy role
  const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
  const spyOrder = [];
  for (let i = 0; i < totalRounds; i++) {
    spyOrder.push(shuffledPlayers[i % shuffledPlayers.length]);
  }

  room.game = {
    type: "wordspy",
    phase: "ws-clues",
    round: 1,
    totalRounds,
    spyId: spyOrder[0],
    spyOrder,
    wordData: words[0],
    words,
    turnOrder: [...playerIds].sort(() => Math.random() - 0.5),
    currentTurn: 0,
    clues: new Map(),
    votes: new Map(),
    spyCaught: false,
    spyGuess: null,
    spyGuessedCorrectly: false,
    spyName: null,
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    roundScoreDeltas: {},
    timerEnd: null
  };

  sendWordToPlayers(room);
  addSystemMessage(room, `🕵️ Word Spy — Round 1 of ${totalRounds}. Give clues!`);
  broadcastRoom(room);

  // Start first clue turn timer
  setRoomTimer(room, TIMER_CLUE, () => {
    wsAutoSkipClue(room);
  });
}

function sendWordToPlayers(room) {
  const g = room.game;
  for (const pid of g.activePlayers) {
    if (!room.players.has(pid)) continue;
    const isSpy = pid === g.spyId;
    if (isSpy) {
      io.to(pid).emit("game:yourWord", {
        word: null,
        category: g.wordData.category,
        isSpy: true,
        round: g.round
      });
    } else {
      io.to(pid).emit("game:yourWord", {
        word: g.wordData.word,
        category: g.wordData.category,
        isSpy: false,
        round: g.round
      });
    }
  }
}

function wsGetCurrentTurnPlayer(room) {
  const g = room.game;
  if (!g || g.currentTurn >= g.turnOrder.length) return null;
  return g.turnOrder[g.currentTurn];
}

function wsHandleClueSubmit(room, socketId, clueText) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-clues") return;
  if (wsGetCurrentTurnPlayer(room) !== socketId) return;
  if (g.clues.has(socketId)) return;

  const clean = typeof clueText === "string" ? clueText.trim().slice(0, MAX_CLUE_LENGTH) : "";
  if (!clean) return;

  g.clues.set(socketId, clean);
  const name = room.players.get(socketId)?.name || "???";
  addSystemMessage(room, `💬 ${name}: "${clean}"`);

  wsAdvanceTurn(room);
}

function wsAutoSkipClue(room) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-clues") return;

  const pid = wsGetCurrentTurnPlayer(room);
  if (pid && !g.clues.has(pid)) {
    g.clues.set(pid, "(no clue)");
    const name = room.players.get(pid)?.name || "???";
    addSystemMessage(room, `⏰ ${name} ran out of time`);
  }
  wsAdvanceTurn(room);
}

function wsAdvanceTurn(room) {
  const g = room.game;
  g.currentTurn++;

  // Skip players who left
  while (g.currentTurn < g.turnOrder.length && !g.activePlayers.has(g.turnOrder[g.currentTurn])) {
    g.currentTurn++;
  }

  // All turns done? Go to discussion.
  if (g.currentTurn >= g.turnOrder.length) {
    wsTransitionToDiscuss(room);
    return;
  }

  // Broadcast updated state and start next turn timer
  broadcastRoom(room);
  setRoomTimer(room, TIMER_CLUE, () => {
    wsAutoSkipClue(room);
  });
}

function wsTransitionToDiscuss(room) {
  const g = room.game;
  g.phase = "ws-discuss";
  g.timerEnd = Date.now() + TIMER_WS_DISCUSS;
  addSystemMessage(room, `🔍 All clues given! Discuss — who's the Spy? (45s)`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_WS_DISCUSS, () => {
    wsTransitionToVoting(room);
  });
}

function wsTransitionToVoting(room) {
  const g = room.game;
  g.phase = "ws-voting";
  g.timerEnd = Date.now() + TIMER_VOTE;
  addSystemMessage(room, `⏳ Vote! Who is the Spy? (20s)`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_VOTE, () => {
    wsForceVoteEnd(room);
  });
}

function wsHandleVote(room, socketId, targetId) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-voting") return;
  if (!g.activePlayers.has(socketId)) return;
  if (g.votes.has(socketId)) return;
  if (socketId === targetId) return; // can't vote yourself
  if (!g.activePlayers.has(targetId)) return;

  g.votes.set(socketId, targetId);
  broadcastRoom(room);

  if (g.votes.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    wsResolveVotes(room);
  }
}

function wsForceVoteEnd(room) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-voting") return;
  wsResolveVotes(room);
}

function wsResolveVotes(room) {
  const g = room.game;
  clearRoomTimer(room);

  // Count votes
  const voteCounts = new Map();
  for (const [, target] of g.votes) {
    voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
  }

  // Find most-voted player
  let maxVotes = 0;
  let mostVoted = null;
  for (const [pid, count] of voteCounts) {
    if (count > maxVotes) {
      maxVotes = count;
      mostVoted = pid;
    }
  }

  const majorityThreshold = Math.floor(g.activePlayers.size / 2) + 1;
  g.spyCaught = mostVoted === g.spyId && maxVotes >= majorityThreshold;
  g.spyName = room.players.get(g.spyId)?.name || "???";

  if (g.spyCaught) {
    // Spy was caught! Give them a chance to guess the word.
    g.phase = "ws-spyguess";
    g.timerEnd = Date.now() + TIMER_SPY_GUESS;
    const spyName = room.players.get(g.spyId)?.name || "???";
    addSystemMessage(room, `🎯 The group suspects ${spyName}! Spy gets one chance to guess the word... (20s)`);
    broadcastRoom(room);

    setRoomTimer(room, TIMER_SPY_GUESS, () => {
      // Time ran out — spy didn't guess
      wsSpyGuessTimeout(room);
    });
  } else {
    // Spy escaped!
    wsTransitionToResults(room, false, false);
  }
}

function wsHandleSpyGuess(room, socketId, guessText) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-spyguess") return;
  if (socketId !== g.spyId) return;
  if (g.spyGuess !== null) return; // already guessed

  const clean = typeof guessText === "string" ? guessText.trim().toLowerCase() : "";
  if (!clean) return;

  g.spyGuess = clean;
  clearRoomTimer(room);

  // Check if the guess matches the word (case-insensitive, trim)
  const correctWord = g.wordData.word.toLowerCase().trim();
  g.spyGuessedCorrectly = clean === correctWord;

  wsTransitionToResults(room, true, g.spyGuessedCorrectly);
}

function wsSpyGuessTimeout(room) {
  const g = room.game;
  if (!g || g.type !== "wordspy" || g.phase !== "ws-spyguess") return;
  g.spyGuess = null;
  g.spyGuessedCorrectly = false;
  wsTransitionToResults(room, true, false);
}

function wsTransitionToResults(room, spyCaught, spyGuessedCorrectly) {
  const g = room.game;
  g.phase = "ws-results";
  clearRoomTimer(room);

  const deltas = {};
  for (const pid of g.activePlayers) deltas[pid] = 0;

  g.spyCaught = spyCaught;
  g.spyGuessedCorrectly = spyGuessedCorrectly;

  if (spyCaught && !spyGuessedCorrectly) {
    // Group wins: each group member gets +2
    for (const [voterId, targetId] of g.votes) {
      if (targetId === g.spyId) {
        deltas[voterId] = (deltas[voterId] || 0) + 2;
      }
    }
    addSystemMessage(room, `🎉 The Spy was ${g.spyName} — caught and couldn't guess the word!`);
  } else if (spyCaught && spyGuessedCorrectly) {
    // Spy guessed correctly! Spy gets +4, group gets nothing
    deltas[g.spyId] = (deltas[g.spyId] || 0) + 4;
    addSystemMessage(room, `😱 The Spy was ${g.spyName} — caught but correctly guessed "${g.wordData.word}"! Spy wins!`);
  } else {
    // Spy escaped: spy gets +3
    deltas[g.spyId] = (deltas[g.spyId] || 0) + 3;
    addSystemMessage(room, `😎 The Spy was ${g.spyName} — blended in perfectly!`);
  }

  // Apply deltas
  for (const [pid, delta] of Object.entries(deltas)) {
    g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
  }
  g.roundScoreDeltas = deltas;

  broadcastRoom(room);
}

function wsAdvanceToNextRound(room) {
  const g = room.game;
  if (!g || g.phase !== "ws-results") return;

  if (g.round >= g.totalRounds) {
    g.phase = "gameover";
    clearRoomTimer(room);
    awardGameCoins(room);
    addSystemMessage(room, `🏆 Game over! Check the final scores.`);
    broadcastRoom(room);
    // Auto-return after 30 seconds
    setTimeout(() => {
      if (room.game && room.game.phase === "gameover") {
        backToLobby(room);
      }
    }, 30_000);
    return;
  }

  // Intermission
  g.phase = "intermission";
  g.timerEnd = Date.now() + TIMER_INTERMISSION;
  addSystemMessage(room, `⏸ Next round in 10 seconds...`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_INTERMISSION, () => {
    wsStartNextRound(room);
  });
}

function wsStartNextRound(room) {
  const g = room.game;
  g.round++;
  g.phase = "ws-clues";
  g.spyId = g.spyOrder[g.round - 1];
  g.wordData = g.words[g.round - 1];
  g.clues = new Map();
  g.votes = new Map();
  g.spyCaught = false;
  g.spyGuess = null;
  g.spyGuessedCorrectly = false;
  g.spyName = null;
  g.roundScoreDeltas = {};
  g.currentTurn = 0;

  // Update active players and shuffle turn order
  g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));
  g.turnOrder = [...g.activePlayers].sort(() => Math.random() - 0.5);

  if (g.activePlayers.size < 2) {
    g.phase = "gameover";
    addSystemMessage(room, `Not enough players — game over!`);
    broadcastRoom(room);
    return;
  }

  // If spy for this round left, pick a random active player
  if (!g.activePlayers.has(g.spyId)) {
    const remaining = [...g.activePlayers];
    g.spyId = remaining[Math.floor(Math.random() * remaining.length)];
  }

  sendWordToPlayers(room);
  addSystemMessage(room, `🕵️ Round ${g.round} of ${g.totalRounds}. Give clues!`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_CLUE, () => {
    wsAutoSkipClue(room);
  });
}

function wsHandleGameDisconnect(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "wordspy") return;

  g.activePlayers.delete(socketId);
  g.clues.delete(socketId);
  g.votes.delete(socketId);

  if (g.activePlayers.size < 2) {
    clearRoomTimer(room);
    room.game = null;
    room.mode = null;
    addSystemMessage(room, `Not enough players — game ended.`);
    return;
  }

  // Spy left during clues? Skip to results with "no winner"
  if (g.phase === "ws-clues" && socketId === g.spyId) {
    clearRoomTimer(room);
    g.spyName = "a disconnected player";
    wsTransitionToResults(room, false, false);
    return;
  }

  // Spy left during discuss/voting/spyguess? Skip to results
  if ((g.phase === "ws-discuss" || g.phase === "ws-voting" || g.phase === "ws-spyguess") && socketId === g.spyId) {
    clearRoomTimer(room);
    g.spyName = "a disconnected player";
    addSystemMessage(room, `The Spy disconnected! No winner this round.`);
    // Give 0 to everyone
    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 0;
    g.roundScoreDeltas = deltas;
    g.phase = "ws-results";
    broadcastRoom(room);
    return;
  }

  // Non-spy left during clues — if it was their turn, advance
  if (g.phase === "ws-clues") {
    const currentPid = wsGetCurrentTurnPlayer(room);
    if (currentPid === socketId || !g.activePlayers.has(currentPid)) {
      clearRoomTimer(room);
      wsAdvanceTurn(room);
      return;
    }
  }

  // Check if all remaining have voted
  if (g.phase === "ws-voting" && g.votes.size >= g.activePlayers.size) {
    clearRoomTimer(room);
    wsResolveVotes(room);
  } else {
    broadcastRoom(room);
  }
}

// ============================================================
//   CHAIN GAME LOGIC
// ============================================================

function startChainGame(room, numRounds) {
  const playerIds = [...room.players.keys()];
  const totalRounds = Math.min(numRounds || DEFAULT_ROUNDS, 10);
  const chainContent = pickChainContent(totalRounds);

  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const saboteurOrder = [];
  for (let i = 0; i < totalRounds; i++) {
    saboteurOrder.push(shuffled[i % shuffled.length]);
  }

  room.game = {
    type: "chain",
    phase: "chain-building",
    round: 1,
    totalRounds,
    saboteurId: saboteurOrder[0],
    saboteurOrder,
    saboteurName: null,
    chainData: chainContent[0],
    chainContent,
    sentence: [],                   // [{ word, playerId }]
    turnOrder: [...playerIds].sort(() => Math.random() - 0.5),
    currentTurn: 0,
    accusation: null,               // { accuserId, accusedId }
    accusationCorrect: null,
    wordSneakedIn: false,
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    roundScoreDeltas: {},
    timerEnd: null
  };

  chainSendRoles(room);
  addSystemMessage(room, `⛓️ Chain — Round 1 of ${totalRounds}. Build the sentence!`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_CHAIN_TURN, () => {
    chainAutoSkipTurn(room);
  });
}

function chainSendRoles(room) {
  const g = room.game;
  for (const pid of g.activePlayers) {
    if (!room.players.has(pid)) continue;
    const isSaboteur = pid === g.saboteurId;
    io.to(pid).emit("game:yourChainRole", {
      isSaboteur,
      targetWord: isSaboteur ? g.chainData.targetWord : null,
      starter: g.chainData.starter,
      round: g.round
    });
  }
}

function chainGetCurrentTurnPlayer(room) {
  const g = room.game;
  if (!g) return null;
  // Cycle through turn order
  const activeTurnOrder = g.turnOrder.filter(id => g.activePlayers.has(id));
  if (activeTurnOrder.length === 0) return null;
  return activeTurnOrder[g.currentTurn % activeTurnOrder.length];
}

function chainHandleWordSubmit(room, socketId, word) {
  const g = room.game;
  if (!g || g.type !== "chain" || g.phase !== "chain-building") return;
  if (chainGetCurrentTurnPlayer(room) !== socketId) return;

  const clean = typeof word === "string"
    ? word.trim().replace(/\s+/g, "").slice(0, MAX_CHAIN_WORD_LENGTH)
    : "";
  if (!clean) return;

  g.sentence.push({ word: clean, playerId: socketId });
  clearRoomTimer(room);

  // Check if max words reached
  if (g.sentence.length >= CHAIN_MAX_WORDS) {
    chainEndBuilding(room);
    return;
  }

  g.currentTurn++;
  broadcastRoom(room);

  setRoomTimer(room, TIMER_CHAIN_TURN, () => {
    chainAutoSkipTurn(room);
  });
}

function chainAutoSkipTurn(room) {
  const g = room.game;
  if (!g || g.type !== "chain" || g.phase !== "chain-building") return;

  const pid = chainGetCurrentTurnPlayer(room);
  if (pid) {
    g.sentence.push({ word: "...", playerId: pid });
    const name = room.players.get(pid)?.name || "???";
    addSystemMessage(room, `⏰ ${name} ran out of time`);
  }

  if (g.sentence.length >= CHAIN_MAX_WORDS) {
    chainEndBuilding(room);
    return;
  }

  g.currentTurn++;
  broadcastRoom(room);

  setRoomTimer(room, TIMER_CHAIN_TURN, () => {
    chainAutoSkipTurn(room);
  });
}

function chainHandleAccusation(room, accuserId, accusedId) {
  const g = room.game;
  if (!g || g.type !== "chain" || g.phase !== "chain-building") return;
  if (!g.activePlayers.has(accuserId)) return;
  if (!g.activePlayers.has(accusedId)) return;
  if (accuserId === accusedId) return;
  // Saboteur can also accuse (to throw suspicion) — that's fine
  if (g.accusation) return; // only one accusation per round

  g.accusation = { accuserId, accusedId };
  clearRoomTimer(room);

  const accuserName = room.players.get(accuserId)?.name || "???";
  const accusedName = room.players.get(accusedId)?.name || "???";
  addSystemMessage(room, `🚨 ${accuserName} accuses ${accusedName} of being the Saboteur!`);

  chainResolveRound(room);
}

function chainEndBuilding(room) {
  // Sentence complete, no accusation — resolve based on whether the word snuck in
  clearRoomTimer(room);
  addSystemMessage(room, `⛓️ Sentence complete! Let's see what happened...`);
  chainResolveRound(room);
}

function chainResolveRound(room) {
  const g = room.game;
  g.phase = "chain-results";
  clearRoomTimer(room);

  const deltas = {};
  for (const pid of g.activePlayers) deltas[pid] = 0;

  g.saboteurName = room.players.get(g.saboteurId)?.name || "???";

  // Check if the target word appears in the sentence
  const targetLower = g.chainData.targetWord.toLowerCase();
  g.wordSneakedIn = g.sentence.some(
    entry => entry.word.toLowerCase() === targetLower
  );

  if (g.accusation) {
    g.accusationCorrect = g.accusation.accusedId === g.saboteurId;

    if (g.accusationCorrect) {
      // Correct accusation: accuser +3, other group +1 each
      deltas[g.accusation.accuserId] = (deltas[g.accusation.accuserId] || 0) + 3;
      for (const pid of g.activePlayers) {
        if (pid !== g.accusation.accuserId && pid !== g.saboteurId) {
          deltas[pid] = (deltas[pid] || 0) + 1;
        }
      }
      addSystemMessage(room, `🎯 Correct! ${g.saboteurName} was the Saboteur!`);
    } else {
      // Wrong accusation: Saboteur +3, accuser -1
      deltas[g.saboteurId] = (deltas[g.saboteurId] || 0) + 3;
      deltas[g.accusation.accuserId] = (deltas[g.accusation.accuserId] || 0) - 1;
      const wrongName = room.players.get(g.accusation.accusedId)?.name || "???";
      addSystemMessage(room, `❌ Wrong! ${wrongName} was innocent. ${g.saboteurName} was the Saboteur!`);
    }
  } else if (g.wordSneakedIn) {
    // No accusation, word made it in: Saboteur wins big
    deltas[g.saboteurId] = (deltas[g.saboteurId] || 0) + 4;
    addSystemMessage(room, `😎 "${g.chainData.targetWord}" was sneaked in! ${g.saboteurName} wins!`);
  } else {
    // No accusation, word didn't make it: everyone gets +1
    for (const pid of g.activePlayers) {
      deltas[pid] = (deltas[pid] || 0) + 1;
    }
    addSystemMessage(room, `🤷 The Saboteur (${g.saboteurName}) couldn't sneak in "${g.chainData.targetWord}". Everyone gets a point!`);
  }

  // Apply deltas
  for (const [pid, delta] of Object.entries(deltas)) {
    g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
  }
  g.roundScoreDeltas = deltas;

  broadcastRoom(room);
}

function chainAdvanceToNextRound(room) {
  const g = room.game;
  if (!g || g.phase !== "chain-results") return;

  if (g.round >= g.totalRounds) {
    g.phase = "gameover";
    clearRoomTimer(room);
    awardGameCoins(room);
    addSystemMessage(room, `🏆 Game over! Check the final scores.`);
    broadcastRoom(room);
    setTimeout(() => {
      if (room.game && room.game.phase === "gameover") {
        backToLobby(room);
      }
    }, 30_000);
    return;
  }

  g.phase = "intermission";
  g.timerEnd = Date.now() + TIMER_INTERMISSION;
  addSystemMessage(room, `⏸ Next round in 10 seconds...`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_INTERMISSION, () => {
    chainStartNextRound(room);
  });
}

function chainStartNextRound(room) {
  const g = room.game;
  g.round++;
  g.phase = "chain-building";
  g.saboteurId = g.saboteurOrder[g.round - 1];
  g.chainData = g.chainContent[g.round - 1];
  g.sentence = [];
  g.currentTurn = 0;
  g.accusation = null;
  g.accusationCorrect = null;
  g.wordSneakedIn = false;
  g.saboteurName = null;
  g.roundScoreDeltas = {};

  g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));
  g.turnOrder = [...g.activePlayers].sort(() => Math.random() - 0.5);

  if (g.activePlayers.size < 2) {
    g.phase = "gameover";
    addSystemMessage(room, `Not enough players — game over!`);
    broadcastRoom(room);
    return;
  }

  if (!g.activePlayers.has(g.saboteurId)) {
    const remaining = [...g.activePlayers];
    g.saboteurId = remaining[Math.floor(Math.random() * remaining.length)];
  }

  chainSendRoles(room);
  addSystemMessage(room, `⛓️ Round ${g.round} of ${g.totalRounds}. Build the sentence!`);
  broadcastRoom(room);

  setRoomTimer(room, TIMER_CHAIN_TURN, () => {
    chainAutoSkipTurn(room);
  });
}

function chainHandleGameDisconnect(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "chain") return;

  g.activePlayers.delete(socketId);

  if (g.activePlayers.size < 2) {
    clearRoomTimer(room);
    room.game = null;
    room.mode = null;
    addSystemMessage(room, `Not enough players — game ended.`);
    return;
  }

  // Saboteur left during building? End round, no winner
  if (g.phase === "chain-building" && socketId === g.saboteurId) {
    clearRoomTimer(room);
    g.saboteurName = "a disconnected player";
    // Give everyone +1
    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 1;
    g.roundScoreDeltas = deltas;
    for (const [pid, d] of Object.entries(deltas)) g.scores.set(pid, (g.scores.get(pid) || 0) + d);
    g.phase = "chain-results";
    g.wordSneakedIn = false;
    g.accusationCorrect = null;
    addSystemMessage(room, `The Saboteur disconnected. Everyone gets a point.`);
    broadcastRoom(room);
    return;
  }

  // Non-saboteur left during building — if it was their turn, advance
  if (g.phase === "chain-building") {
    const currentPid = chainGetCurrentTurnPlayer(room);
    if (!currentPid || !g.activePlayers.has(currentPid)) {
      clearRoomTimer(room);
      g.currentTurn++;
      broadcastRoom(room);
      setRoomTimer(room, TIMER_CHAIN_TURN, () => chainAutoSkipTurn(room));
      return;
    }
  }

  broadcastRoom(room);
}

// ============================================================
//   ECHO GAME LOGIC
// ============================================================
const TIMER_ECHO_SUBMIT = 45_000;
const TIMER_ECHO_DISCUSS = 45_000;

function startEchoGame(room, numRounds) {
  const playerIds = [...room.players.keys()];
  const totalRounds = Math.min(numRounds || 5, 10);
  const prompts = pickEchoPrompts(totalRounds);
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const echoOrder = [];
  for (let i = 0; i < totalRounds; i++) echoOrder.push(shuffled[i % shuffled.length]);

  room.game = {
    type: "echo", phase: "echo-submit",
    round: 1, totalRounds,
    echoId: echoOrder[0], echoOrder,
    promptPair: prompts[0], prompts,
    answers: new Map(), // playerId -> text
    votes: new Map(),
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    roundScoreDeltas: {}, timerEnd: null
  };

  // Send prompts to players
  for (const pid of room.game.activePlayers) {
    const isEcho = pid === room.game.echoId;
    io.to(pid).emit("game:echoPrompt", {
      prompt: isEcho ? room.game.promptPair.echo : room.game.promptPair.normal,
      isEcho, round: room.game.round
    });
  }

  addSystemMessage(room, `🔊 Echo — Round 1 of ${totalRounds}. Answer the prompt! (45s)`);
  broadcastRoom(room);
  setRoomTimer(room, TIMER_ECHO_SUBMIT, () => echoForceSubmit(room));
}

function echoHandleAnswer(room, socketId, text) {
  const g = room.game;
  if (!g || g.type !== "echo" || g.phase !== "echo-submit") return;
  if (!g.activePlayers.has(socketId) || g.answers.has(socketId)) return;
  const clean = typeof text === "string" ? text.trim().slice(0, 60) : "";
  if (!clean) return;
  g.answers.set(socketId, clean);
  broadcastRoom(room);
  if (g.answers.size >= g.activePlayers.size) { clearRoomTimer(room); echoReveal(room); }
}

function echoForceSubmit(room) {
  const g = room.game;
  if (!g || g.phase !== "echo-submit") return;
  for (const pid of g.activePlayers) {
    if (!g.answers.has(pid)) g.answers.set(pid, "(no answer)");
  }
  echoReveal(room);
}

function echoReveal(room) {
  const g = room.game;
  g.phase = "echo-discuss";
  // Shuffle answers for anonymous display
  g.shuffledAnswers = [...g.answers.entries()]
    .map(([id, text]) => ({ id, text }))
    .sort(() => Math.random() - 0.5);
  addSystemMessage(room, "🔍 Answers revealed! Discuss — which one is the Echo? (45s)");
  broadcastRoom(room);
  setRoomTimer(room, TIMER_ECHO_DISCUSS, () => echoStartVoting(room));
}

function echoStartVoting(room) {
  const g = room.game;
  g.phase = "echo-voting";
  g.timerEnd = Date.now() + TIMER_VOTE;
  addSystemMessage(room, "🗳️ Vote! Which answer is the Echo's? (20s)");
  broadcastRoom(room);
  setRoomTimer(room, TIMER_VOTE, () => echoResolveVotes(room));
}

function echoHandleVote(room, socketId, answerId) {
  const g = room.game;
  if (!g || g.type !== "echo" || g.phase !== "echo-voting") return;
  if (!g.activePlayers.has(socketId) || g.votes.has(socketId)) return;
  if (socketId === answerId) return;
  g.votes.set(socketId, answerId);
  broadcastRoom(room);
  if (g.votes.size >= g.activePlayers.size) { clearRoomTimer(room); echoResolveVotes(room); }
}

function echoResolveVotes(room) {
  const g = room.game;
  g.phase = "echo-results";
  clearRoomTimer(room);
  const deltas = {};
  for (const pid of g.activePlayers) deltas[pid] = 0;

  let caughtCount = 0;
  for (const [voterId, targetId] of g.votes) {
    if (targetId === g.echoId) { deltas[voterId] = (deltas[voterId] || 0) + 2; caughtCount++; }
  }
  if (caughtCount === 0) {
    deltas[g.echoId] = (deltas[g.echoId] || 0) + 3;
    addSystemMessage(room, `😎 The Echo blended in perfectly!`);
  } else {
    addSystemMessage(room, `🎯 The Echo was caught!`);
  }

  for (const [pid, d] of Object.entries(deltas)) g.scores.set(pid, (g.scores.get(pid) || 0) + d);
  g.roundScoreDeltas = deltas;
  broadcastRoom(room);
}

function echoAdvanceRound(room) {
  const g = room.game;
  if (!g || g.phase !== "echo-results") return;
  if (g.round >= g.totalRounds) {
    g.phase = "gameover";
    clearRoomTimer(room);
    awardGameCoins(room);
    addSystemMessage(room, "🏆 Game over!");
    broadcastRoom(room);
    setTimeout(() => { if (room.game?.phase === "gameover") backToLobby(room); }, 30000);
    return;
  }
  g.phase = "intermission";
  g.timerEnd = Date.now() + TIMER_INTERMISSION;
  broadcastRoom(room);
  setRoomTimer(room, TIMER_INTERMISSION, () => {
    g.round++;
    g.phase = "echo-submit";
    g.echoId = g.echoOrder[g.round - 1];
    g.promptPair = g.prompts[g.round - 1];
    g.answers = new Map(); g.votes = new Map();
    g.shuffledAnswers = null; g.roundScoreDeltas = {};
    g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));
    if (!g.activePlayers.has(g.echoId)) {
      const arr = [...g.activePlayers];
      g.echoId = arr[Math.floor(Math.random() * arr.length)];
    }
    for (const pid of g.activePlayers) {
      io.to(pid).emit("game:echoPrompt", {
        prompt: pid === g.echoId ? g.promptPair.echo : g.promptPair.normal,
        isEcho: pid === g.echoId, round: g.round
      });
    }
    addSystemMessage(room, `🔊 Round ${g.round} of ${g.totalRounds}. Answer the prompt!`);
    broadcastRoom(room);
    setRoomTimer(room, TIMER_ECHO_SUBMIT, () => echoForceSubmit(room));
  });
}

function echoHandleDisconnect(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "echo") return;
  g.activePlayers.delete(socketId);
  g.answers.delete(socketId); g.votes.delete(socketId);
  if (g.activePlayers.size < 2) {
    clearRoomTimer(room); room.game = null; room.mode = null;
    addSystemMessage(room, "Not enough players — game ended."); return;
  }
  if (g.phase === "echo-submit" && g.answers.size >= g.activePlayers.size) { clearRoomTimer(room); echoReveal(room); }
  else if (g.phase === "echo-voting" && g.votes.size >= g.activePlayers.size) { clearRoomTimer(room); echoResolveVotes(room); }
  else broadcastRoom(room);
}

// ============================================================
//   SOCKET.IO EVENTS
// ============================================================

// Socket auth — attach user if logged in, allow anonymous connections
io.use((socket, next) => {
  const cookies = cookie.parse(socket.handshake.headers.cookie || "");
  if (cookies.session) {
    const sess = getSession(cookies.session);
    if (sess) {
      const user = getUserById(sess.user_id);
      if (user) {
        socket.data.user = safeUserData(user);
      }
    }
  }
  next();
});

io.on("connection", (socket) => {

  // ----- Create room -----
  socket.on("room:create", ({ name, visibility }, ack) => {
    const clean = sanitizeName(name);
    if (!clean) return ack?.({ error: "Name required (1-16 characters, no weird stuff)" });

    const code = generateCode();
    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      spectators: new Map(),
      mode: null,
      chat: [],
      game: null,
      _timer: null,
      visibility: visibility === "private" ? "private" : "public",
      createdAt: Date.now()
    };
    room.players.set(socket.id, { id: socket.id, name: clean });
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    ack?.({ ok: true, code, you: { id: socket.id, name: clean }, snapshot: roomSnapshot(room), chat: room.chat });
    addSystemMessage(room, `${clean} created the room`);
    // Broadcast room list update to everyone
    io.emit("rooms:update", getPublicRooms());
  });

  // ----- Join existing room -----
  socket.on("room:join", ({ code, name }, ack) => {
    const upperCode = typeof code === "string" ? code.toUpperCase().trim() : "";
    const room = rooms.get(upperCode);
    if (!room) return ack?.({ error: "That room doesn't exist" });
    if (room.players.size + room.spectators.size >= MAX_PLAYERS) return ack?.({ error: "Room is full" });

    const clean = sanitizeName(name);
    if (!clean) return ack?.({ error: "Name required (1-16 characters, no weird stuff)" });

    const finalName = uniqueNameInRoom(room, clean);

    // Ghost Mode: if a game is in progress, join as spectator
    if (room.game && room.game.phase !== "gameover") {
      room.spectators.set(socket.id, { id: socket.id, name: finalName });
      socketToRoom.set(socket.id, upperCode);
      socket.join(upperCode);
      ack?.({ ok: true, code: upperCode, you: { id: socket.id, name: finalName }, snapshot: roomSnapshot(room), chat: room.chat, spectator: true });
      addSystemMessage(room, `${finalName} joined as a spectator 👻`);
      broadcastRoom(room);
      return;
    }

    room.players.set(socket.id, { id: socket.id, name: finalName });
    socketToRoom.set(socket.id, upperCode);
    socket.join(upperCode);

    ack?.({ ok: true, code: upperCode, you: { id: socket.id, name: finalName }, snapshot: roomSnapshot(room), chat: room.chat });
    addSystemMessage(room, `${finalName} joined`);
    broadcastRoom(room);
  });

  // ----- Leave room (explicit) -----
  socket.on("room:leave", () => {
    handleLeave(socket);
  });

  // ----- Chat -----
  socket.on("chat:send", ({ text }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    // Both players and spectators can chat
    const player = room.players.get(socket.id) || room.spectators.get(socket.id);
    if (!player) return ack?.({ error: "Not in this room" });

    const cleanText = typeof text === "string" ? text.trim().slice(0, 300) : "";
    if (!cleanText) return ack?.({ error: "Empty message" });

    const msg = {
      id: Date.now() + Math.random(),
      name: player.name,
      text: cleanText,
      ts: Date.now(),
      playerId: player.id,
      system: false
    };
    room.chat.push(msg);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    io.to(code).emit("chat:message", msg);
    ack?.({ ok: true });
  });

  // ----- Host sets game mode -----
  socket.on("room:setMode", ({ mode }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.game) return;
    room.mode = mode || null;
    broadcastRoom(room);
    if (mode) addSystemMessage(room, `Host picked: ${mode}`);
  });

  // ----- Host starts the game -----
  socket.on("game:start", ({ rounds } = {}, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    if (room.hostId !== socket.id) return ack?.({ error: "Only the host can start the game" });
    if (room.game) return ack?.({ error: "A game is already in progress" });

    if (room.mode === "frequency") {
      if (room.players.size < MIN_PLAYERS_FREQUENCY) {
        return ack?.({ error: `Need at least ${MIN_PLAYERS_FREQUENCY} players to start Frequency` });
      }
      startFrequencyGame(room, rounds || DEFAULT_ROUNDS);
      ack?.({ ok: true });
    } else if (room.mode === "wordspy") {
      if (room.players.size < MIN_PLAYERS_WORDSPY) {
        return ack?.({ error: `Need at least ${MIN_PLAYERS_WORDSPY} players to start Word Spy` });
      }
      startWordSpyGame(room, rounds || DEFAULT_ROUNDS);
      ack?.({ ok: true });
    } else if (room.mode === "chain") {
      if (room.players.size < MIN_PLAYERS_CHAIN) {
        return ack?.({ error: `Need at least ${MIN_PLAYERS_CHAIN} players to start Chain` });
      }
      startChainGame(room, rounds || DEFAULT_ROUNDS);
      ack?.({ ok: true });
    } else if (room.mode === "echo") {
      if (room.players.size < 3) {
        return ack?.({ error: "Need at least 3 players to start Echo" });
      }
      startEchoGame(room, rounds || DEFAULT_ROUNDS);
      ack?.({ ok: true });
    } else if (room.mode === "blitz") {
      if (room.players.size < 2) {
        return ack?.({ error: "Need at least 2 players for Blitz" });
      }
      // Blitz is real-time, not turn-based. Set up relay and tell clients.
      room.game = { type: "blitz", phase: "playing" };
      setupShooterRelay(socket, room.code);
      for (const [pid] of room.players) {
        const s = io.sockets.sockets.get(pid);
        if (s && s !== socket) setupShooterRelay(s, room.code);
      }
      io.to(room.code).emit("game:blitzStart", { code: room.code });
      addSystemMessage(room, "💥 Blitz started! WASD to move, mouse to aim, click to shoot!");
      broadcastRoom(room);
      ack?.({ ok: true });
    } else {
      return ack?.({ error: "Pick a game mode first" });
    }
  });

  // ----- Player submits their 1-10 rating -----
  socket.on("game:submitRating", ({ rating }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    handleRatingSubmit(room, socket.id, rating);
    ack?.({ ok: true });
  });

  // ----- Player votes for who they think is the Off-Key -----
  socket.on("game:submitVote", ({ targetId }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    if (room.game?.type === "wordspy") {
      wsHandleVote(room, socket.id, targetId);
    } else if (room.game?.type === "echo") {
      echoHandleVote(room, socket.id, targetId);
    } else {
      handleVoteSubmit(room, socket.id, targetId);
    }
    ack?.({ ok: true });
  });

  // ----- Word Spy: player submits a clue -----
  socket.on("game:submitClue", ({ clue }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    wsHandleClueSubmit(room, socket.id, clue);
    ack?.({ ok: true });
  });

  // ----- Word Spy: spy guesses the word -----
  socket.on("game:spyGuess", ({ guess }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    wsHandleSpyGuess(room, socket.id, guess);
    ack?.({ ok: true });
  });

  // ----- Chain: player submits a word -----
  socket.on("game:chainWord", ({ word }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    chainHandleWordSubmit(room, socket.id, word);
    ack?.({ ok: true });
  });

  // ----- Chain: player accuses someone of being the saboteur -----
  socket.on("game:chainAccuse", ({ accusedId }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    chainHandleAccusation(room, socket.id, accusedId);
    ack?.({ ok: true });
  });

  // ----- Echo: player submits answer -----
  socket.on("game:echoAnswer", ({ text }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    echoHandleAnswer(room, socket.id, text);
    ack?.({ ok: true });
  });

  // ----- Host advances to next round -----
  socket.on("game:nextRound", () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.game?.type === "wordspy") {
      wsAdvanceToNextRound(room);
    } else if (room.game?.type === "chain") {
      chainAdvanceToNextRound(room);
    } else if (room.game?.type === "echo") {
      echoAdvanceRound(room);
    } else {
      advanceToNextRound(room);
    }
  });

  // ----- Host returns to lobby -----
  socket.on("game:backToLobby", () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    backToLobby(room);
  });

  // ----- Host kicks someone -----
  socket.on("room:kick", ({ playerId }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (playerId === socket.id) return;
    const target = room.players.get(playerId) || room.spectators.get(playerId);
    if (!target) return;

    io.to(playerId).emit("room:kicked", { by: room.players.get(socket.id).name });
    const targetSocket = io.sockets.sockets.get(playerId);
    if (targetSocket) {
      targetSocket.leave(code);
      handleLeave(targetSocket, { kicked: true, kickedName: target.name });
    }
  });

  // ----- Disconnect handling -----
  socket.on("disconnect", () => {
    handleLeave(socket);
  });

});

// ============================================================
//   LEAVE LOGIC — shared between explicit leave, kick, and disconnect
// ============================================================
function handleLeave(socket, opts = {}) {
  const code = socketToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  socketToRoom.delete(socket.id);
  if (!room) return;

  const player = room.players.get(socket.id) || room.spectators.get(socket.id);
  if (!player) return;
  room.players.delete(socket.id);
  room.spectators.delete(socket.id);
  socket.leave(code);

  // Room empty? Delete it.
  if (room.players.size === 0 && room.spectators.size === 0) {
    clearRoomTimer(room);
    rooms.delete(code);
    return;
  }

  // Handle game disconnect if a game is active
  if (room.game) {
    if (room.game.type === "wordspy") {
      wsHandleGameDisconnect(room, socket.id);
    } else if (room.game.type === "chain") {
      chainHandleGameDisconnect(room, socket.id);
    } else if (room.game.type === "echo") {
      echoHandleDisconnect(room, socket.id);
    } else {
      handleGameDisconnect(room, socket.id);
    }
  }

  // Host left? Migrate to next player
  if (room.hostId === socket.id) {
    const newHost = room.players.size > 0
      ? room.players.values().next().value
      : room.spectators.values().next().value;
    if (newHost) {
      room.hostId = newHost.id;
      addSystemMessage(room, `${player.name} left. ${newHost.name} is now the host.`);
    }
  } else if (opts.kicked) {
    addSystemMessage(room, `${opts.kickedName || player.name} was kicked by the host`);
  } else {
    addSystemMessage(room, `${player.name} left`);
  }

  broadcastRoom(room);
}

// ============================================================
//   SERVER START + AUTO-BACKUP
// ============================================================
const PORT = process.env.PORT || 3000;

// Periodic backup to PostgreSQL (if DATABASE_URL is set)
let _backupSave = null;
if (process.env.DATABASE_URL) {
  let _lastBackupSize = 0;
  _backupSave = async () => {
    try {
      const dbPath = path.join(process.env.DB_DIR || path.join(__dirname, "data"), "lobby98.db");
      if (!fs.existsSync(dbPath)) return;
      // Flush WAL to main db file before reading
      checkpoint();
      const data = fs.readFileSync(dbPath);
      const pg = await import("pg");
      const pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
      await pool.query(
        `INSERT INTO db_backup (id, data, updated_at) VALUES (1, $1, NOW())
         ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`, [data]
      );
      await pool.end();
      const kb = (data.length/1024).toFixed(1);
      // Only log when size changes or first save
      if (data.length !== _lastBackupSize) {
        console.log(`💾 Backup saved (${kb} KB)`);
        _lastBackupSize = data.length;
      }
    } catch (err) {
      console.error("⚠️ Backup save failed:", err.message);
    }
  };
  // Save immediately on startup, then every 30 seconds
  setTimeout(_backupSave, 5000);
  setInterval(_backupSave, 30000);
  // Save on shutdown signals (Railway sends SIGTERM)
  process.on("SIGTERM", async () => { console.log("🛑 SIGTERM — saving..."); await _backupSave(); process.exit(0); });
  process.on("SIGINT", async () => { console.log("🛑 SIGINT — saving..."); await _backupSave(); process.exit(0); });
  console.log("💾 Auto-backup to PostgreSQL enabled (every 30s + on shutdown)");
}

// Trigger backup after important events (register/login)
function triggerBackup() { if (_backupSave) setTimeout(_backupSave, 2000); }

httpServer.listen(PORT, () => {
  console.log(`🎮 Lobby 98 running at http://localhost:${PORT}`);
});
