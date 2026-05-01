// server.js — Lobby 98 (scribbl-style)
// ============================================================
const SITE_VERSION = Date.now().toString(36); // Changes on every server restart/deploy
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
import { containsProfanity, cleanText, checkMessage } from "./filter.js";
import { GRADIENTS } from "./gradients.js";
import {
  createUser, getUserByName, getUserById, createSession, getSession,
  deleteSession, addCoins, setColor, setTitle, getOwnedItems,
  addOwnedItem, recordGame, safeUserData, changePassword, setCoins, leaderboardQuery,
  setBan, setPfpEmoji, setCustomTitle,
  getStockCash, setStockCash, getPortfolio, setShares, setPfpBorder, checkpoint,
  submitBugReport, getBugReports, resolveBugReport, deleteBugReport, countUserOpenBugs,
  getUserAchievements, hasAchievement, awardAchievement,
  saveChatMsg, getChatHistory, trimChat, deleteChatMsg, clearAllChat,
  setMod, setMutedUntil, getAllUsers,
  deleteAllUsersExcept,
  setStaffUser, setStaffPerms, getStaffPerms, wipeUserProgress,
  setAvatar, sendFriendRequest, acceptFriend, removeFriend, getFriends, getPendingRequests,
  sendDM, getDMs, addReaction, getReactions, getReactionsBulk,
  getDailyProgress, incrementDaily, claimDaily
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
// Registration rate limit: max 2 accounts per IP per hour
const regRateMap = new Map(); // ip -> [timestamp, timestamp, ...]
function checkRegRate(ip) {
  const now = Date.now(), window = 3600000; // 1 hour
  const times = (regRateMap.get(ip) || []).filter(t => now - t < window);
  regRateMap.set(ip, times);
  return times.length < 2;
}
function recordReg(ip) {
  const times = regRateMap.get(ip) || [];
  times.push(Date.now());
  regRateMap.set(ip, times);
}
// Clean up rate map every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of regRateMap) {
    const valid = times.filter(t => now - t < 3600000);
    if (valid.length === 0) regRateMap.delete(ip);
    else regRateMap.set(ip, valid);
  }
}, 600000);

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Missing fields" });
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Username: 3-16 chars, letters/numbers/underscore" });
  if (password.length < 4) return res.status(400).json({ error: "Password must be 4+ chars" });
  // Rate limit by IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  if (!checkRegRate(ip)) return res.status(429).json({ error: "Too many accounts created. Try again later." });
  if (getUserByName(username)) return res.status(409).json({ error: "Username taken" });
  const hash = await bcrypt.hash(password, 10);
  const user = createUser(username, hash);
  recordReg(ip);
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

app.get("/api/version", (req, res) => { res.json({ version: SITE_VERSION }); });

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

// All ~380 gradients are free cosmetics — exposed here so the client can
// render the picker modal and resolve gradient IDs back to CSS for chat/leaderboard.
app.get("/api/gradients", (_req, res) => {
  res.json({ gradients: GRADIENTS });
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

  // Character purchase for Pirate Royale — deducts coins
  if (game === 'yh_unlock') {
    const cost = Math.abs(Math.floor(Number(score) || 0));
    if (cost <= 0 || cost > 5000) return res.status(400).json({ error: "Invalid purchase" });
    if (user.coins < cost) return res.status(400).json({ error: "Not enough coins" });
    addCoins(user.id, -cost);
    return res.json({ ok: true, user: safeUserData(getUserById(user.id)) });
  }

  // Anti-cheat: validate score range and minimum elapsed time
  const maxCoins = game === 'pirate_royale' ? 100 : 50;
  const coins = Math.min(Math.max(0, Math.floor(Number(score) || 0)), maxCoins);
  const elapsedMs = Number(elapsed) || 0;
  const MIN_TIMES = { memory: 8000, minesweeper: 5000, clickspeed: 5000, mathrush: 28000, snake: 3000, dungeon: 0, pirate_royale: 0 };
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
    checkAllAchievements(user.id);
    const updatedUser = getUserById(user.id);
    if (updatedUser.coins >= 500) checkAchievement(user.id, "arcade_500");
    if (updatedUser.coins >= 2000) checkAchievement(user.id, "arcade_2000");
    // Daily challenge tracking
    trackDaily(user.id, 'arcade_3');
    trackDaily(user.id, 'arcade_5');
    trackDaily(user.id, 'coins_100', finalCoins);
    trackDaily(user.id, 'coins_200', finalCoins);
    if (game === 'snake' && coins >= 25) trackDaily(user.id, 'snake_50');
    if (game === 'memory') { const rawScore = Number(req.body.rawScore) || 99; if (rawScore <= 20) trackDaily(user.id, 'memory_low'); }
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
const OWNER_USERS = ["cole"]; // hardcoded owner — cannot be demoted

function isOwner(username) { return OWNER_USERS.includes(username?.toLowerCase()); }
function isStaff(username) {
  if (isOwner(username)) return true;
  const u = getUserByName(username);
  return !!(u && u.is_staff);
}

app.get("/api/staff/check", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.json({ isOwner: false, isStaff: false, isMod: false });
  const user = getUserById(sess.user_id);
  const perms = isOwner(user?.username) ? "all" : (() => { try { return JSON.parse(user?.staff_perms || "{}"); } catch { return {}; } })();
  res.json({ isOwner: isOwner(user?.username), isStaff: isStaff(user?.username), isMod: !!(user && user.is_mod), staffPerms: perms });
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

// Check if user is staff OR mod (for actions mods can perform)
function isStaffOrMod(user) {
  if (!user) return false;
  return isOwner(user.username) || !!user.is_staff || !!user.is_mod;
}
// Check if a staff user has a specific permission (owner has all)
function hasPerm(user, perm) {
  if (!user) return false;
  if (isOwner(user.username)) return true;
  if (!user.is_staff) return false;
  try { const perms = JSON.parse(user.staff_perms || "{}"); return !!perms[perm]; } catch { return false; }
}

app.post("/api/staff/makemod", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username, makeMod } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isStaff(target.username)) return res.status(400).json({ error: "Can't modify staff" });
  setMod(target.id, !!makeMod);
  res.json({ ok: true, message: makeMod ? `${target.username} is now a mod` : `${target.username} is no longer a mod` });
});

app.post("/api/staff/timeout", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaffOrMod(staff)) return res.status(403).json({ error: "Not staff/mod" });
  const { username, minutes } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isStaff(target.username)) return res.status(400).json({ error: "Can't timeout staff" });
  const mins = Math.max(0, Math.min(Number(minutes) || 0, 1440)); // max 24 hours
  if (mins === 0) {
    setMutedUntil(target.id, 0);
    return res.json({ ok: true, message: `Unmuted ${target.username}` });
  }
  const until = Date.now() + mins * 60000;
  setMutedUntil(target.id, until);
  // Notify the user if online
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === target.id) {
      s.emit("gchat:muted", { minutes: mins, until });
    }
  }
  res.json({ ok: true, message: `Muted ${target.username} for ${mins} minutes` });
});

app.post("/api/staff/deletechat", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaffOrMod(staff)) return res.status(403).json({ error: "Not staff/mod" });
  const { messageId } = req.body || {};
  if (!messageId) return res.status(400).json({ error: "Missing messageId" });
  deleteChatMsg(messageId);
  io.emit("gchat:deleted", { messageId });
  res.json({ ok: true });
});

app.post("/api/staff/clearallchat", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  clearAllChat();
  io.emit("gchat:cleared");
  res.json({ ok: true });
});

app.post("/api/staff/kick", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaffOrMod(staff)) return res.status(403).json({ error: "Not staff/mod" });
  const { username } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isStaff(target.username)) return res.status(400).json({ error: "Can't kick staff" });
  let kicked = 0;
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === target.id) {
      s.emit("kicked", { reason: "Kicked by staff" });
      s.disconnect(true);
      kicked++;
    }
  }
  res.json({ ok: true, message: kicked > 0 ? `Kicked ${target.username}` : `${target.username} is not online` });
});

app.post("/api/staff/resetpassword", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const { username, newPassword } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: "Password must be at least 4 chars" });
  const hash = bcrypt.hashSync(newPassword, 10);
  changePassword(target.id, hash);
  res.json({ ok: true, message: `Password reset for ${target.username}` });
});

app.get("/api/staff/users", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isStaff(staff?.username)) return res.status(403).json({ error: "Not staff" });
  const users = getAllUsers();
  // Count online users
  const onlineIds = new Set();
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id) onlineIds.add(s.data.user.id);
  }
  res.json({ users: users.map(u => ({ ...u, online: onlineIds.has(u.id) })) });
});

app.get("/api/staff/onlinecount", (req, res) => {
  res.json({ count: io.sockets.sockets.size });
});

app.post("/api/staff/deleteallaccounts", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!isOwner(staff?.username)) return res.status(403).json({ error: "Owner only" });
  const { confirm } = req.body || {};
  if (confirm !== "DELETE_ALL") return res.status(400).json({ error: "Must confirm with DELETE_ALL" });
  // Disconnect all non-staff sockets
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user && !isStaff(s.data.user.username)) {
      s.emit("kicked", { reason: "All accounts purged by staff" });
      s.disconnect(true);
    }
  }
  const count = deleteAllUsersExcept(OWNER_USERS);
  res.json({ ok: true, message: `Deleted ${count} accounts. Staff accounts preserved.` });
});

// ── Owner-only: Make/Remove Staff with permissions ──
app.post("/api/staff/makestaff", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const owner = getUserById(sess.user_id);
  if (!isOwner(owner?.username)) return res.status(403).json({ error: "Owner only" });
  const { username, makeStaff, perms } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isOwner(target.username)) return res.status(400).json({ error: "Can't modify owner" });
  setStaffUser(target.id, !!makeStaff);
  if (makeStaff && perms) setStaffPerms(target.id, perms);
  if (!makeStaff) { setStaffPerms(target.id, {}); setMod(target.id, false); }
  res.json({ ok: true, message: makeStaff ? `${target.username} is now staff` : `${target.username} is no longer staff` });
});

app.post("/api/staff/setperms", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const owner = getUserById(sess.user_id);
  if (!isOwner(owner?.username)) return res.status(403).json({ error: "Owner only" });
  const { username, perms } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (!target.is_staff) return res.status(400).json({ error: "User is not staff" });
  setStaffPerms(target.id, perms || {});
  res.json({ ok: true, message: `Updated permissions for ${target.username}` });
});

// ── Staff: Wipe user progress (requires wipe permission) ──
app.post("/api/staff/wipeprogress", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const staff = getUserById(sess.user_id);
  if (!hasPerm(staff, "wipe")) return res.status(403).json({ error: "No wipe permission" });
  const { username, what } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (isOwner(target.username)) return res.status(400).json({ error: "Can't wipe owner" });
  const valid = ["all", "coins", "games", "achievements", "shop", "stocks"];
  if (!valid.includes(what)) return res.status(400).json({ error: "Invalid wipe type. Use: " + valid.join(", ") });
  wipeUserProgress(target.id, what);
  res.json({ ok: true, message: `Wiped ${what} for ${target.username}` });
});

// ── Self-wipe: User erases their own progress ──
app.post("/api/profile/wipe", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const { confirmation } = req.body || {};
  const expected = "I want to erase all the progress I have in everything I own.";
  if (confirmation !== expected) return res.status(400).json({ error: "Confirmation text doesn't match" });
  // Wipe everything but keep username/password/staff/mod status
  wipeUserProgress(user.id, "all");
  res.json({ ok: true, message: "All progress has been erased." });
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
// Server relays positions and bullets between players. No server-side physics
// for humans, but bots are fully simulated server-side.
const shooterStates = new Map(); // roomCode -> { players: {id: {x,y,angle,hp,name,color}} }

// Shared constants (must match client)
const SH_W = 800, SH_H = 500, SH_PLAYER_R = 14, SH_BULLET_R = 4;
const SH_BULLET_SPEED = 12, SH_PLAYER_SPEED = 3.2, SH_FIRE_RATE = 500, SH_MAX_HP = 100;
const SH_WALLS = [
  {x:200,y:100,w:20,h:180},{x:580,y:220,w:20,h:180},
  {x:300,y:350,w:200,h:20},{x:100,y:250,w:120,h:20},
  {x:580,y:80,w:120,h:20},{x:380,y:150,w:20,h:120},
];
const SH_BOT_COLORS = ['#e04858','#4caf50','#f5a623','#7c3aed','#f472b6','#15803d','#c89020','#38bdf8','#dc2626','#6366f1'];

// Per-room bot state
const shooterBots = new Map(); // roomCode -> Map<botId, botState>

function shCollideWall(x, y, r) {
  for (const w of SH_WALLS) {
    const cx = Math.max(w.x, Math.min(x, w.x + w.w));
    const cy = Math.max(w.y, Math.min(y, w.y + w.h));
    if (Math.sqrt((x-cx)**2 + (y-cy)**2) < r) return true;
  }
  return false;
}

function shSpawnPos() {
  let x, y, tries = 0;
  do { x = 60 + Math.random()*(SH_W-120); y = 60 + Math.random()*(SH_H-120); tries++; }
  while (shCollideWall(x, y, SH_PLAYER_R+4) && tries < 50);
  return { x, y };
}

function initShooterBots(roomCode, room) {
  const bots = new Map();
  for (const [pid, p] of room.players) {
    if (!isBot(pid)) continue;
    const sp = shSpawnPos();
    bots.set(pid, {
      x: sp.x, y: sp.y, angle: Math.random()*Math.PI*2,
      hp: SH_MAX_HP, name: p.name,
      color: SH_BOT_COLORS[Math.abs(pid.charCodeAt(4)||0) % SH_BOT_COLORS.length],
      lastFire: 0, targetId: null,
      // Movement AI state
      moveAngle: Math.random()*Math.PI*2, moveTimer: 0, strafeDir: 1,
    });
  }
  shooterBots.set(roomCode, bots);
  // Seed their positions into the state broadcast
  if (!shooterStates.has(roomCode)) shooterStates.set(roomCode, { players: {} });
  const state = shooterStates.get(roomCode);
  for (const [bid, b] of bots) {
    state.players[bid] = { x: b.x, y: b.y, angle: b.angle, hp: b.hp, name: b.name, color: b.color };
  }
}

// Bot tick — called at ~15fps from the existing state broadcast interval
function tickShooterBots(roomCode) {
  const bots = shooterBots.get(roomCode);
  if (!bots || bots.size === 0) return;
  const state = shooterStates.get(roomCode);
  if (!state) return;
  const now = Date.now();
  const allPlayers = state.players; // includes bots + humans

  for (const [bid, bot] of bots) {
    if (bot.hp <= 0) continue;

    // Find nearest alive enemy (non-self)
    let nearDist = Infinity, nearId = null, nearX = 0, nearY = 0;
    for (const [pid, p] of Object.entries(allPlayers)) {
      if (pid === bid || !p || p.hp <= 0) continue;
      const d = Math.sqrt((bot.x-p.x)**2 + (bot.y-p.y)**2);
      if (d < nearDist) { nearDist = d; nearId = pid; nearX = p.x; nearY = p.y; }
    }

    // Movement: approach nearest enemy with some strafing
    if (nearId) {
      const toAngle = Math.atan2(nearY - bot.y, nearX - bot.x);
      // Strafe perpendicular when close
      bot.moveTimer--;
      if (bot.moveTimer <= 0) { bot.strafeDir = Math.random() > 0.5 ? 1 : -1; bot.moveTimer = 20 + Math.floor(Math.random()*40); }
      let moveA;
      if (nearDist < 120) {
        // Strafe at 90 degrees
        moveA = toAngle + bot.strafeDir * Math.PI/2;
      } else if (nearDist < 250) {
        // Approach at an angle
        moveA = toAngle + bot.strafeDir * 0.4;
      } else {
        // Run straight toward
        moveA = toAngle;
      }
      const dx = Math.cos(moveA) * SH_PLAYER_SPEED;
      const dy = Math.sin(moveA) * SH_PLAYER_SPEED;
      const nx = Math.max(SH_PLAYER_R, Math.min(SH_W - SH_PLAYER_R, bot.x + dx));
      const ny = Math.max(SH_PLAYER_R, Math.min(SH_H - SH_PLAYER_R, bot.y + dy));
      if (!shCollideWall(nx, bot.y, SH_PLAYER_R)) bot.x = nx;
      if (!shCollideWall(bot.x, ny, SH_PLAYER_R)) bot.y = ny;

      // Aim at target with slight inaccuracy
      bot.angle = toAngle + (Math.random() - 0.5) * 0.2;

      // Shoot if in range and fire cooldown elapsed
      if (nearDist < 350 && now - bot.lastFire > SH_FIRE_RATE) {
        bot.lastFire = now;
        const bx = bot.x + Math.cos(bot.angle) * SH_PLAYER_R;
        const by = bot.y + Math.sin(bot.angle) * SH_PLAYER_R;
        io.to(roomCode).emit('shooter:bullet', {
          x: bx, y: by,
          vx: Math.cos(bot.angle) * SH_BULLET_SPEED,
          vy: Math.sin(bot.angle) * SH_BULLET_SPEED,
          owner: bid
        });
      }
    } else {
      // No targets: wander randomly
      bot.moveTimer--;
      if (bot.moveTimer <= 0) { bot.moveAngle = Math.random()*Math.PI*2; bot.moveTimer = 30 + Math.floor(Math.random()*60); }
      const dx = Math.cos(bot.moveAngle) * SH_PLAYER_SPEED * 0.6;
      const dy = Math.sin(bot.moveAngle) * SH_PLAYER_SPEED * 0.6;
      const nx = Math.max(SH_PLAYER_R, Math.min(SH_W-SH_PLAYER_R, bot.x+dx));
      const ny = Math.max(SH_PLAYER_R, Math.min(SH_H-SH_PLAYER_R, bot.y+dy));
      if (!shCollideWall(nx, bot.y, SH_PLAYER_R)) bot.x = nx;
      if (!shCollideWall(bot.x, ny, SH_PLAYER_R)) bot.y = ny;
    }

    // Update state broadcast entry
    allPlayers[bid] = { x: bot.x, y: bot.y, angle: bot.angle, hp: bot.hp, name: bot.name, color: bot.color };
  }
}

// Handle hits on bots (human clients detect collisions and send shooter:hit)
function handleBotHit(roomCode, victimId, damage, attackerId) {
  const bots = shooterBots.get(roomCode);
  if (!bots) return false;
  const bot = bots.get(victimId);
  if (!bot || bot.hp <= 0) return false;
  bot.hp = Math.max(0, bot.hp - damage);
  if (bot.hp <= 0) {
    // Bot died — emit kill event and respawn after delay
    io.to(roomCode).emit('shooter:kill', { killer: attackerId, victim: victimId });
    // Track kills for scoring
    const room = rooms.get(roomCode);
    if (room?.game?.kills && attackerId) {
      room.game.kills[attackerId] = (room.game.kills[attackerId] || 0) + 1;
    }
    setTimeout(() => {
      if (!bots.has(victimId)) return;
      const sp = shSpawnPos();
      bot.x = sp.x; bot.y = sp.y; bot.hp = SH_MAX_HP;
      bot.angle = Math.random()*Math.PI*2;
    }, 1500);
  }
  // Update state
  const state = shooterStates.get(roomCode);
  if (state?.players[victimId]) state.players[victimId].hp = bot.hp;
  return true;
}

function cleanupShooterBots(roomCode) {
  shooterBots.delete(roomCode);
}

function endBlitzGame(room) {
  if (!room.game || room.game.type !== "blitz") return;
  room.game.phase = "gameover";
  // Build scoreboard sorted by kills
  const killMap = room.game.kills || {};
  const scoreboard = [];
  for (const [pid, k] of Object.entries(killMap)) {
    const name = room.players.get(pid)?.name || (isBot(pid) ? "Bot" : "???");
    scoreboard.push({ id: pid, name, kills: k, isBot: isBot(pid) });
  }
  scoreboard.sort((a, b) => b.kills - a.kills);
  // Award coins to human players based on placement
  for (let i = 0; i < scoreboard.length; i++) {
    const entry = scoreboard[i];
    if (entry.isBot) continue;
    const coins = entry.kills * 3 + (i === 0 ? 20 : i <= 2 ? 10 : 3);
    const sock = io.sockets.sockets.get(entry.id);
    if (sock?.data?.user?.id) {
      addCoins(sock.data.user.id, coins);
      recordGame(sock.data.user.id, i === 0, entry.kills);
    }
  }
  // Emit end event with scoreboard
  io.to(room.code).emit("game:blitzEnd", { scoreboard });
  // Clean up shooter state
  shooterStates.delete(room.code);
  cleanupShooterBots(room.code);
  // After a delay, allow back to lobby
  addSystemMessage(room, `💥 Game over! ${scoreboard[0]?.name || "???"} wins with ${scoreboard[0]?.kills || 0} kills!`);
  broadcastRoom(room);
}

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
    // Check if victim is a bot — handle server-side
    if (isBot(victim)) {
      handleBotHit(roomCode, victim, damage, socket.id);
    } else {
      io.to(roomCode).emit('shooter:hit', { victim, damage, attacker: socket.id });
    }
  });
  socket.on('shooter:died', ({ killer }) => {
    io.to(roomCode).emit('shooter:kill', { killer, victim: socket.id });
    // Track kills for scoring
    const room = rooms.get(roomCode);
    if (room?.game?.kills && killer) {
      room.game.kills[killer] = (room.game.kills[killer] || 0) + 1;
    }
  });
}

// Broadcast shooter state at 15fps + tick bots
setInterval(() => {
  for (const [code, state] of shooterStates) {
    if (Object.keys(state.players).length === 0) { shooterStates.delete(code); cleanupShooterBots(code); continue; }
    const room = rooms.get(code);
    if (room?.game?.phase === "gameover") continue; // stop ticking after game ends
    tickShooterBots(code);
    io.to(code).emit('shooter:state', state.players);
  }
}, 66);

// ============================================================
//   BUG REPORTS
// ============================================================
app.post("/api/bugs/submit", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "Title and description required" });
  if (title.length > 100) return res.status(400).json({ error: "Title too long (100 max)" });
  if (body.length > 500) return res.status(400).json({ error: "Description too long (500 max)" });
  if (countUserOpenBugs(user.id) >= 3) return res.status(429).json({ error: "You already have 3 open bug reports. Wait for staff to review them." });
  if (user.created_at && Date.now() - user.created_at < 86400000 && !isStaff(user.username)) {
    const hrs = Math.ceil((86400000 - (Date.now() - user.created_at)) / 3600000);
    return res.status(403).json({ error: `Your account must be 24 hours old to report bugs. ${hrs}h remaining.` });
  }
  submitBugReport(user.id, user.username, title.slice(0, 100), body.slice(0, 500));
  checkAchievement(user.id, "bug_report");
  res.json({ ok: true, message: "Bug report submitted! Thanks for helping improve the site." });
});

app.get("/api/bugs", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  if (!isStaff(user?.username)) return res.status(403).json({ error: "Staff only" });
  const reports = getBugReports(req.query.open === "1");
  res.json({ reports });
});

app.post("/api/bugs/resolve", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const user = getUserById(sess.user_id);
  if (!isStaff(user?.username)) return res.status(403).json({ error: "Staff only" });
  const { id, status } = req.body || {};
  if (status === "delete") deleteBugReport(id);
  else resolveBugReport(id, status || "resolved");
  res.json({ ok: true });
});

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
//   AVATAR
// ============================================================
app.post("/api/profile/avatar", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { avatar } = req.body || {};
  if (!avatar || typeof avatar !== 'object') return res.status(400).json({ error: "Invalid avatar" });
  setAvatar(sess.user_id, avatar);
  res.json({ ok: true, user: safeUserData(getUserById(sess.user_id)) });
});

// ============================================================
//   FRIENDS
// ============================================================
app.post("/api/friends/request", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { username } = req.body || {};
  const target = getUserByName(username);
  if (!target) return res.status(404).json({ error: "User not found" });
  if (target.id === sess.user_id) return res.status(400).json({ error: "Can't friend yourself" });
  const result = sendFriendRequest(sess.user_id, target.id);
  if (result.status === 'accepted') return res.json({ ok: true, message: "Already friends!" });
  if (result.status === 'pending') return res.json({ ok: true, message: "Request already pending" });
  // Notify target via socket
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === target.id) {
      const from = getUserById(sess.user_id);
      s.emit("friend:request", { from: from.username, fromId: from.id });
    }
  }
  res.json({ ok: true, message: `Friend request sent to ${target.username}` });
});

app.post("/api/friends/accept", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { fromId } = req.body || {};
  acceptFriend(fromId, sess.user_id);
  res.json({ ok: true });
});

app.post("/api/friends/remove", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { friendId } = req.body || {};
  removeFriend(sess.user_id, friendId);
  res.json({ ok: true });
});

app.get("/api/friends", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const friends = getFriends(sess.user_id);
  const pending = getPendingRequests(sess.user_id);
  // Attach online status
  const onlineIds = new Set();
  for (const [, s] of io.sockets.sockets) if (s.data?.user?.id) onlineIds.add(s.data.user.id);
  const friendList = friends.map(f => {
    const fId = f.from_id === sess.user_id ? f.to_id : f.from_id;
    return { id: fId, username: f.username, pfpEmoji: f.pfp_emoji, avatar: (() => { try { return JSON.parse(f.avatar||"{}"); } catch { return {}; } })(), online: onlineIds.has(fId) };
  });
  res.json({ friends: friendList, pending: pending.map(p => ({ id: p.from_id, username: p.username, pfpEmoji: p.pfp_emoji })) });
});

// ============================================================
//   DIRECT MESSAGES
// ============================================================
app.get("/api/dm/:friendId", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const messages = getDMs(sess.user_id, Number(req.params.friendId));
  res.json({ messages });
});

app.post("/api/dm/send", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { friendId, text } = req.body || {};
  if (!text?.trim()) return res.status(400).json({ error: "Empty message" });
  const fromUser = getUserById(sess.user_id);
  sendDM(sess.user_id, friendId, text.trim().slice(0, 300));
  // Notify friend via socket
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === friendId) {
      s.emit("dm:message", { from: fromUser.username, fromId: fromUser.id, text: text.trim().slice(0, 300), time: Date.now() });
    }
  }
  res.json({ ok: true });
});

// ============================================================
//   CHAT REACTIONS
// ============================================================
app.post("/api/chat/react", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { messageId, emoji } = req.body || {};
  const validEmojis = ['👍','❤️','😂','😮','😢','🔥'];
  if (!validEmojis.includes(emoji)) return res.status(400).json({ error: "Invalid reaction" });
  const added = addReaction(messageId, sess.user_id, emoji);
  const reactions = getReactions(messageId);
  io.emit("gchat:reactions", { messageId, reactions });
  res.json({ ok: true, added, reactions });
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
      maxPlayers: room.maxPlayers || MAX_PLAYERS,
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
      const uid = sock.data.user.id;
      const allScores = [...g.scores.values()];
      const maxScore = Math.max(...allScores);
      const won = score === maxScore;
      recordGame(uid, won, score);
      // Daily challenge tracking
      trackDaily(uid, 'party_1');
      trackDaily(uid, 'party_3');
      trackDaily(uid, 'coins_100', score);
      trackDaily(uid, 'coins_200', score);
      // Notify the client their coins updated
      const updated = getUserById(uid);
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
const MIN_PLAYERS_C4 = 2; // Connect Four — strictly 2-player
const DEFAULT_ROUNDS = 5;

// ── Bot System ──
// Bots are virtual players with fake IDs that live server-side. They don't have
// real sockets — io.to(botId).emit() silently no-ops, which is exactly what we
// want. The host adds/removes bots via room:addBot / room:removeBot events.
const BOT_NAMES = ["Ada","Bolt","Chip","Dart","Echo","Flux","Gizmo","Hex","Iris","Jolt","Kit","Lux","Max","Nyx","Opi","Pix","Rex","Spark","Tux","Vex","Wren","Zap"];
let _botCounter = 0;
function isBot(id) { return typeof id === "string" && id.startsWith("bot_"); }
function makeBotId() { return `bot_${++_botCounter}_${Date.now().toString(36)}`; }
function pickBotName(room) {
  const taken = new Set([...room.players.values()].map(p => p.name));
  const available = BOT_NAMES.filter(n => !taken.has(n));
  return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : `Bot-${_botCounter}`;
}

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
const TIMER_C4_TURN = 25_000;     // 25 seconds per move (Connect Four)
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
    maxPlayers: room.maxPlayers || MAX_PLAYERS,
    mode: room.mode,
    visibility: room.visibility || "public",
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId,
      isBot: !!p.isBot
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

  // Blitz has a minimal game object (no scores, rounds, etc.) — return early
  if (g.type === "blitz") {
    return { type: "blitz", phase: g.phase, scores: {} };
  }

  const snap = {
    type: g.type,
    phase: g.phase,
    round: g.round || 1,
    totalRounds: g.totalRounds || 1,
    scores: g.scores ? Object.fromEntries(g.scores) : {},
    timerEnd: g.timerEnd || null,
    playerCount: g.activePlayers ? g.activePlayers.size : 0,
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

  // === Connect Four-specific fields ===
  if (g.type === "c4") {
    snap.board = g.board;            // 2-D array, fully visible to both players
    snap.currentTurn = g.currentTurn;
    snap.lastMove = g.lastMove;      // {col, row, piece} for highlight
    snap.winLine = g.winLine;        // null until round ends
    snap.roundResult = g.roundResult; // 'p1' | 'p2' | 'draw' | null
    snap.playerIds = g.playerIds;
    // Map names by player slot for clean display
    snap.p1Name = room.players.get(g.playerIds[0])?.name || "Player 1";
    snap.p2Name = room.players.get(g.playerIds[1])?.name || "Player 2";
  }

  // === Crazy Eights-specific fields ===
  if (g.type === "crazy8") {
    snap.playerIds = g.playerIds;
    snap.currentTurn = g.playerIds[g.turnIdx];
    snap.direction = g.direction;
    snap.topCard = g.discardPile[g.discardPile.length - 1];
    snap.activeSuit = g.activeSuit;
    snap.drawPileCount = g.drawPile.length;
    snap.drewThisTurn = g.drewThisTurn;
    snap.lastPlay = g.lastPlay;
    snap.handSizes = {};
    for (const [pid, hand] of g.hands) snap.handSizes[pid] = hand.length;
    if (g.phase === "crazy8-results" || g.phase === "gameover") {
      snap.allHands = {};
      for (const [pid, hand] of g.hands) snap.allHands[pid] = hand;
    }
    snap.playerNames = {};
    for (const pid of g.playerIds) snap.playerNames[pid] = room.players.get(pid)?.name || "???";
  }

  return snap;
}

function broadcastRoom(room) {
  io.to(room.code).emit("room:update", roomSnapshot(room));
  // Crazy Eights: send each human player their private hand after every update.
  // Bots don't need this (their hands live server-side).
  if (room.game?.type === "crazy8" && room.game.hands) {
    for (const [pid, hand] of room.game.hands) {
      if (isBot(pid)) continue;
      const sock = io.sockets.sockets.get(pid);
      if (sock) sock.emit("game:c8Hand", { hand });
    }
  }
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
  // Clean up blitz bot state if it was a blitz game
  if (room.game?.type === "blitz") {
    shooterStates.delete(room.code);
    cleanupShooterBots(room.code);
  }
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
//   CONNECT FOUR — 2-PLAYER LOGIC
// ============================================================
// Classic 7-wide × 6-tall Connect Four. Pieces drop top-down into a column and
// land on the first empty row from the bottom. First to align 4 in a row in
// any direction (horizontal, vertical, or either diagonal) wins the round.
// Multi-round: players alternate who goes first each round to keep things fair.
// Score = round wins; final winner gets the existing party-game coin reward.
const C4_COLS = 7;
const C4_ROWS = 6;

function c4NewBoard() {
  // 2-D array indexed [col][row] — col 0 is left, row 0 is bottom.
  const b = [];
  for (let c = 0; c < C4_COLS; c++) b.push(new Array(C4_ROWS).fill(0));
  return b;
}

// Drop a piece (1 or 2) into a column. Returns the row it landed at, or -1 if full.
function c4Drop(board, col, piece) {
  if (col < 0 || col >= C4_COLS) return -1;
  for (let r = 0; r < C4_ROWS; r++) {
    if (board[col][r] === 0) { board[col][r] = piece; return r; }
  }
  return -1;
}

// Check whether placing at (col, row) created a 4-in-a-row for the given piece.
// Returns the array of 4 winning cells [{c,r}, ...] or null. Used so the client
// can highlight the winning line.
function c4CheckWin(board, col, row, piece) {
  const dirs = [[1,0],[0,1],[1,1],[1,-1]]; // horiz, vert, diag/, diag\
  for (const [dc, dr] of dirs) {
    const line = [{c:col,r:row}];
    // walk forward along this direction
    for (let i = 1; i < 4; i++) {
      const c = col + dc*i, r = row + dr*i;
      if (c < 0 || c >= C4_COLS || r < 0 || r >= C4_ROWS || board[c][r] !== piece) break;
      line.push({c, r});
    }
    // walk backward
    for (let i = 1; i < 4; i++) {
      const c = col - dc*i, r = row - dr*i;
      if (c < 0 || c >= C4_COLS || r < 0 || r >= C4_ROWS || board[c][r] !== piece) break;
      line.unshift({c, r});
    }
    if (line.length >= 4) return line.slice(0, 4);
  }
  return null;
}

function c4IsBoardFull(board) {
  for (let c = 0; c < C4_COLS; c++) if (board[c][C4_ROWS-1] === 0) return false;
  return true;
}

function startC4Game(room, numRounds) {
  const playerIds = [...room.players.keys()];
  if (playerIds.length !== 2) return; // dispatcher should have caught this
  const totalRounds = Math.min(Math.max(numRounds || 3, 1), 7);

  room.game = {
    type: "c4", phase: "c4-playing",
    round: 1, totalRounds,
    playerIds,                  // [p1, p2]; index 0 is "piece 1" (red)
    firstMover: 0,              // alternates each round
    currentTurn: playerIds[0],  // whose turn right now
    board: c4NewBoard(),
    lastMove: null,             // {col, row, piece} — for client animation
    winLine: null,              // array of {c,r} when a round is won
    roundResult: null,          // 'p1'|'p2'|'draw'
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    timerEnd: null
  };

  // Send role assignments — each player learns their piece number and opponent name.
  const p1Sock = io.sockets.sockets.get(playerIds[0]);
  const p2Sock = io.sockets.sockets.get(playerIds[1]);
  const p1Name = room.players.get(playerIds[0])?.name || "Player 1";
  const p2Name = room.players.get(playerIds[1])?.name || "Player 2";
  if (p1Sock) p1Sock.emit("game:c4Role", { piece: 1, opponentName: p2Name });
  if (p2Sock) p2Sock.emit("game:c4Role", { piece: 2, opponentName: p1Name });

  addSystemMessage(room, `🔴🟡 Connect Four — Round 1 of ${totalRounds}. ${p1Name} (red) goes first.`);
  broadcastRoom(room);
  setRoomTimer(room, TIMER_C4_TURN, () => c4HandleTimeout(room));
  c4MaybeBotTurn(room);
}

function c4HandleMove(room, socketId, col) {
  const g = room.game;
  if (!g || g.type !== "c4" || g.phase !== "c4-playing") return;
  if (g.currentTurn !== socketId) return; // not your turn
  const piece = g.playerIds.indexOf(socketId) + 1;
  if (piece !== 1 && piece !== 2) return;
  const row = c4Drop(g.board, col, piece);
  if (row < 0) return; // column full or invalid
  g.lastMove = { col, row, piece };
  // Check for win
  const winLine = c4CheckWin(g.board, col, row, piece);
  if (winLine) {
    g.winLine = winLine;
    g.roundResult = piece === 1 ? "p1" : "p2";
    c4EndRound(room);
    return;
  }
  // Check for draw
  if (c4IsBoardFull(g.board)) {
    g.roundResult = "draw";
    c4EndRound(room);
    return;
  }
  // Hand off to opponent
  g.currentTurn = g.playerIds[piece === 1 ? 1 : 0];
  broadcastRoom(room);
  setRoomTimer(room, TIMER_C4_TURN, () => c4HandleTimeout(room));
  c4MaybeBotTurn(room);
}

// On timeout, the inactive player just forfeits their turn (opponent takes
// over). This is gentler than auto-losing the round and keeps the game alive
// if someone briefly tabs away.
function c4HandleTimeout(room) {
  const g = room.game;
  if (!g || g.type !== "c4" || g.phase !== "c4-playing") return;
  const idx = g.playerIds.indexOf(g.currentTurn);
  if (idx < 0) return;
  g.currentTurn = g.playerIds[idx === 0 ? 1 : 0];
  addSystemMessage(room, `⏱️ Turn timed out — passed to opponent.`);
  broadcastRoom(room);
  setRoomTimer(room, TIMER_C4_TURN, () => c4HandleTimeout(room));
  c4MaybeBotTurn(room);
}

function c4EndRound(room) {
  const g = room.game;
  clearRoomTimer(room);
  // Award round points
  if (g.roundResult === "p1") g.scores.set(g.playerIds[0], (g.scores.get(g.playerIds[0])||0) + 1);
  else if (g.roundResult === "p2") g.scores.set(g.playerIds[1], (g.scores.get(g.playerIds[1])||0) + 1);
  // (draws give no points)
  g.phase = "c4-results";
  const p1Name = room.players.get(g.playerIds[0])?.name || "Player 1";
  const p2Name = room.players.get(g.playerIds[1])?.name || "Player 2";
  if (g.roundResult === "draw") addSystemMessage(room, `🤝 Round ${g.round} draw — board full.`);
  else addSystemMessage(room, `🏆 Round ${g.round} winner: ${g.roundResult === "p1" ? p1Name : p2Name}`);
  broadcastRoom(room);
}

function c4NextRound(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "c4" || g.phase !== "c4-results") return;
  // Either player can advance
  if (!g.playerIds.includes(socketId)) return;
  if (g.round >= g.totalRounds) {
    c4FinishGame(room);
    return;
  }
  g.round++;
  g.firstMover = 1 - g.firstMover; // alternate first move
  g.board = c4NewBoard();
  g.lastMove = null;
  g.winLine = null;
  g.roundResult = null;
  g.currentTurn = g.playerIds[g.firstMover];
  g.phase = "c4-playing";
  const firstName = room.players.get(g.currentTurn)?.name || "Player";
  addSystemMessage(room, `Round ${g.round}/${g.totalRounds} — ${firstName} goes first.`);
  broadcastRoom(room);
  setRoomTimer(room, TIMER_C4_TURN, () => c4HandleTimeout(room));
  c4MaybeBotTurn(room);
}

function c4FinishGame(room) {
  const g = room.game;
  g.phase = "gameover";
  clearRoomTimer(room);
  awardGameCoins(room);
  // Bump games_played on the loser too — recordGame in awardGameCoins only
  // touches players whose score>0, so a 3-0 sweep would never count for the
  // shut-out player. Patch that up here.
  for (const pid of g.playerIds) {
    if ((g.scores.get(pid) || 0) === 0 && !isBot(pid)) {
      const sock = io.sockets.sockets.get(pid);
      if (sock?.data?.user?.id) recordGame(sock.data.user.id, false, 0);
    }
  }
  broadcastRoom(room);
}

// ── C4 Bot (minimax with alpha-beta) ──
// Evaluates board positions and plays at a ~medium-hard level.
// Depth 5 is fast enough for 7-column boards (<50ms) and catches most traps.
function c4BotMove(room) {
  const g = room.game;
  if (!g || g.type !== "c4" || g.phase !== "c4-playing") return;
  if (!isBot(g.currentTurn)) return;
  const piece = g.playerIds.indexOf(g.currentTurn) + 1;
  const opp = piece === 1 ? 2 : 1;
  // Score a board position for `piece`
  function evalBoard(board) {
    let score = 0;
    const dirs = [[1,0],[0,1],[1,1],[1,-1]];
    for (let c = 0; c < C4_COLS; c++) for (let r = 0; r < C4_ROWS; r++) {
      for (const [dc, dr] of dirs) {
        const window = [];
        for (let i = 0; i < 4; i++) {
          const nc = c+dc*i, nr = r+dr*i;
          if (nc < 0 || nc >= C4_COLS || nr < 0 || nr >= C4_ROWS) break;
          window.push(board[nc][nr]);
        }
        if (window.length < 4) continue;
        const me = window.filter(x => x === piece).length;
        const them = window.filter(x => x === opp).length;
        const empty = window.filter(x => x === 0).length;
        if (me === 4) score += 10000;
        else if (me === 3 && empty === 1) score += 50;
        else if (me === 2 && empty === 2) score += 10;
        if (them === 3 && empty === 1) score -= 80; // block threats
      }
    }
    // Prefer center column
    for (let r = 0; r < C4_ROWS; r++) if (board[3][r] === piece) score += 3;
    return score;
  }
  function getValidCols(board) {
    const cols = [];
    for (let c = 0; c < C4_COLS; c++) if (board[c][C4_ROWS-1] === 0) cols.push(c);
    return cols;
  }
  function dropRow(board, col) {
    for (let r = 0; r < C4_ROWS; r++) if (board[col][r] === 0) return r;
    return -1;
  }
  function minimax(board, depth, alpha, beta, maximizing) {
    const valid = getValidCols(board);
    // Check terminal states
    for (let c = 0; c < C4_COLS; c++) for (let r = 0; r < C4_ROWS; r++) {
      if (board[c][r] !== 0 && c4CheckWin(board, c, r, board[c][r])) {
        return board[c][r] === piece ? 100000 + depth : -100000 - depth;
      }
    }
    if (valid.length === 0) return 0; // draw
    if (depth === 0) return evalBoard(board);
    if (maximizing) {
      let val = -Infinity;
      for (const c of valid) {
        const r = dropRow(board, c); board[c][r] = piece;
        val = Math.max(val, minimax(board, depth-1, alpha, beta, false));
        board[c][r] = 0; alpha = Math.max(alpha, val);
        if (alpha >= beta) break;
      }
      return val;
    } else {
      let val = Infinity;
      for (const c of valid) {
        const r = dropRow(board, c); board[c][r] = opp;
        val = Math.min(val, minimax(board, depth-1, alpha, beta, true));
        board[c][r] = 0; beta = Math.min(beta, val);
        if (alpha >= beta) break;
      }
      return val;
    }
  }
  // Deep-copy board for minimax search
  const boardCopy = g.board.map(col => [...col]);
  const valid = getValidCols(boardCopy);
  let bestCol = valid[0], bestScore = -Infinity;
  for (const c of valid) {
    const r = dropRow(boardCopy, c); boardCopy[c][r] = piece;
    const score = minimax(boardCopy, 5, -Infinity, Infinity, false);
    boardCopy[c][r] = 0;
    if (score > bestScore) { bestScore = score; bestCol = c; }
  }
  // Play with a small delay to feel natural
  setTimeout(() => c4HandleMove(room, g.currentTurn, bestCol), 600 + Math.random() * 800);
}

// Schedule bot move whenever it becomes a bot's turn.
function c4MaybeBotTurn(room) {
  const g = room.game;
  if (!g || g.type !== "c4" || g.phase !== "c4-playing") return;
  if (isBot(g.currentTurn)) c4BotMove(room);
}

// ============================================================
//   CRAZY EIGHTS (UNO-style card game)
// ============================================================
// Classic Crazy Eights with a standard 52-card deck. Match suit or rank of
// the discard pile top; 8s are wild (play anytime, pick a new suit).
// Supports 2-6 players including bots. First to empty their hand wins the
// round and earns points based on opponents' remaining cards.
//
// Card representation: { suit: 'H'|'D'|'C'|'S', rank: '2'..'A' }
// Point values: 8 = 50, face cards (J/Q/K) = 10, A = 1, 2-7/9-10 = face value
const C8_SUITS = ["H","D","C","S"];
const C8_RANKS = ["2","3","4","5","6","7","8","9","10","J","Q","K","A"];
const C8_SPECIAL_RANKS = ["S","R","+2"]; // per-suit specials (1 each per suit)
const C8_WILD_RANKS = ["+4","SC"];         // suitless wilds (2 of each)
const C8_IS_WILD = new Set(["8","+4","SC"]);
const C8_IS_ACTION = new Set(["S","R","+2","+4","SC"]);

function c8NewDeck() {
  const deck = [];
  // Standard cards: 2-A in each suit (includes 8s as basic wilds)
  for (const s of C8_SUITS) for (const r of C8_RANKS) deck.push({ suit: s, rank: r });
  // Action cards: Skip, Reverse, +2 — one per suit
  for (const s of C8_SUITS) for (const r of C8_SPECIAL_RANKS) deck.push({ suit: s, rank: r });
  // Wild cards: +4 and Stack-Color — 2 of each, no suit
  for (const r of C8_WILD_RANKS) { deck.push({ suit: "W", rank: r }); deck.push({ suit: "W", rank: r }); }
  // Shuffle (Fisher-Yates)
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function c8CardPoints(card) {
  if (C8_IS_WILD.has(card.rank)) return 50;
  if (C8_IS_ACTION.has(card.rank)) return 20;
  if (["J","Q","K"].includes(card.rank)) return 10;
  if (card.rank === "A") return 1;
  return parseInt(card.rank) || 0;
}

function c8HandPoints(hand) {
  return hand.reduce((s, c) => s + c8CardPoints(c), 0);
}

function c8CanPlay(card, topCard, activeSuit) {
  if (C8_IS_WILD.has(card.rank)) return true; // 8, +4, SC always playable
  if (card.suit === (activeSuit || topCard.suit)) return true; // suit match
  if (card.rank === topCard.rank) return true; // rank match (including S on S, R on R, +2 on +2)
  return false;
}

function startCrazy8Game(room, numRounds) {
  const playerIds = [...room.players.keys()];
  const totalRounds = Math.min(Math.max(numRounds || 3, 1), 7);
  // Deal: 7 cards each for 2-3 players, 5 for 4+
  const cardsPerHand = playerIds.length <= 3 ? 7 : 5;
  const deck = c8NewDeck();
  const hands = new Map();
  for (const pid of playerIds) {
    hands.set(pid, deck.splice(0, cardsPerHand));
  }
  // Flip first card to discard — skip wilds and action cards
  let firstCard;
  do {
    firstCard = deck.shift();
    if (C8_IS_WILD.has(firstCard.rank) || C8_IS_ACTION.has(firstCard.rank)) { deck.push(firstCard); firstCard = null; }
  } while (!firstCard);

  room.game = {
    type: "crazy8", phase: "crazy8-playing",
    round: 1, totalRounds,
    playerIds,
    turnIdx: 0, // index into playerIds
    direction: 1, // 1 = forward, -1 = backward
    hands,
    drawPile: deck,
    discardPile: [firstCard],
    activeSuit: firstCard.suit, // current suit to match
    lastPlay: null,
    drewThisTurn: false,
    scores: new Map(playerIds.map(id => [id, 0])),
    activePlayers: new Set(playerIds),
    roundScoreDeltas: {},
    timerEnd: null
  };
  const firstName = room.players.get(playerIds[0])?.name || "Player";
  addSystemMessage(room, `🃏 Crazy Eights — Round 1 of ${totalRounds}. ${firstName} goes first.`);
  broadcastRoom(room);
  c8MaybeBotTurn(room);
}

function c8TopCard(g) { return g.discardPile[g.discardPile.length - 1]; }
function c8CurrentPlayer(g) { return g.playerIds[g.turnIdx]; }

// Auto-reshuffle: when the draw pile gets low (≤5 cards), scoop up the discard
// pile (except the top card), shuffle it back in, and notify clients for animation.
const C8_RESHUFFLE_THRESHOLD = 5;
function c8MaybeReshuffle(room) {
  const g = room.game;
  if (!g || g.type !== "crazy8") return false;
  if (g.drawPile.length > C8_RESHUFFLE_THRESHOLD) return false;
  if (g.discardPile.length <= 1) return false; // nothing to reclaim
  const top = g.discardPile.pop();
  const reclaimed = g.discardPile;
  g.discardPile = [top];
  // Shuffle reclaimed cards
  for (let i = reclaimed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [reclaimed[i], reclaimed[j]] = [reclaimed[j], reclaimed[i]];
  }
  g.drawPile.push(...reclaimed);
  // Notify all clients so they can show the reshuffle animation
  io.to(room.code).emit("game:c8Reshuffle", { newDrawCount: g.drawPile.length });
  addSystemMessage(room, `🔄 Draw pile reshuffled! (${g.drawPile.length} cards)`);
  return true;
}

function c8AdvanceTurn(room) {
  const g = room.game;
  g.turnIdx = (g.turnIdx + g.direction + g.playerIds.length) % g.playerIds.length;
  g.drewThisTurn = false;
  c8MaybeReshuffle(room);
  broadcastRoom(room);
  c8MaybeBotTurn(room);
}

function c8HandlePlay(room, socketId, cardIdx, chosenSuit) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-playing") return;
  if (c8CurrentPlayer(g) !== socketId) return;
  const hand = g.hands.get(socketId);
  if (!hand || cardIdx < 0 || cardIdx >= hand.length) return;
  const card = hand[cardIdx];
  if (!c8CanPlay(card, c8TopCard(g), g.activeSuit)) return;

  // Play the card
  hand.splice(cardIdx, 1);
  g.discardPile.push(card);
  const playerName = room.players.get(socketId)?.name || "???";
  g.lastPlay = { playerId: socketId, card, playerName };

  // Resolve suit (wilds pick a suit)
  if (C8_IS_WILD.has(card.rank)) {
    g.activeSuit = (chosenSuit && C8_SUITS.includes(chosenSuit)) ? chosenSuit : (card.suit !== "W" ? card.suit : "H");
  } else {
    g.activeSuit = card.suit;
  }

  // === Stack-Color (SC) — play ALL cards of the chosen suit from hand ===
  if (card.rank === "SC") {
    const stackSuit = g.activeSuit;
    const stacked = [];
    for (let i = hand.length - 1; i >= 0; i--) {
      if (hand[i].suit === stackSuit) { stacked.push(hand[i]); g.discardPile.push(hand[i]); hand.splice(i, 1); }
    }
    if (stacked.length > 0) {
      g.lastPlay.stacked = stacked;
      addSystemMessage(room, `🃏 ${playerName} stacked ${stacked.length} ${stackSuit === "H"?"♥":stackSuit==="D"?"♦":stackSuit==="C"?"♣":"♠"} card${stacked.length!==1?"s":""}!`);
    }
  }

  // Check if this player won the round
  if (hand.length === 0) {
    c8EndRound(room, socketId);
    return;
  }

  // === Apply action effects before advancing turn ===
  if (card.rank === "S") {
    // Skip — advance past next player
    addSystemMessage(room, `⏭ ${playerName} played Skip!`);
    c8AdvanceTurn(room); // move to next player
    c8AdvanceTurn(room); // skip them
    return;
  }
  if (card.rank === "R") {
    // Reverse direction (in 2-player acts like skip)
    g.direction *= -1;
    addSystemMessage(room, `🔄 ${playerName} reversed!`);
    if (g.playerIds.length === 2) {
      // In 2-player, reverse = skip (you go again after advancing)
      c8AdvanceTurn(room);
      c8AdvanceTurn(room);
    } else {
      c8AdvanceTurn(room);
    }
    return;
  }
  if (card.rank === "+2") {
    // Draw Two — next player draws 2 and loses turn
    c8AdvanceTurnRaw(g);
    const victim = c8CurrentPlayer(g);
    c8ForceDrawCards(room, victim, 2);
    addSystemMessage(room, `➕ ${playerName} played +2! ${room.players.get(victim)?.name || "???"} draws 2.`);
    c8AdvanceTurn(room); // skip their turn
    return;
  }
  if (card.rank === "+4") {
    // Wild Draw Four — next player draws 4 and loses turn
    c8AdvanceTurnRaw(g);
    const victim = c8CurrentPlayer(g);
    c8ForceDrawCards(room, victim, 4);
    addSystemMessage(room, `🔥 ${playerName} played +4! ${room.players.get(victim)?.name || "???"} draws 4.`);
    c8AdvanceTurn(room); // skip their turn
    return;
  }

  // Normal card or 8 (wild) — just advance
  c8AdvanceTurn(room);
}

// Advance turn index without broadcasting (used internally before applying effects)
function c8AdvanceTurnRaw(g) {
  g.turnIdx = (g.turnIdx + g.direction + g.playerIds.length) % g.playerIds.length;
  g.drewThisTurn = false;
}

// Force a player to draw N cards from the pile
function c8ForceDrawCards(room, playerId, count) {
  const g = room.game;
  const hand = g.hands.get(playerId);
  if (!hand) return;
  for (let i = 0; i < count; i++) {
    if (g.drawPile.length === 0) {
      // Reshuffle discard (keep top card)
      const top = g.discardPile.pop();
      g.drawPile = g.discardPile;
      g.discardPile = [top];
      for (let j = g.drawPile.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [g.drawPile[j], g.drawPile[k]] = [g.drawPile[k], g.drawPile[j]];
      }
    }
    if (g.drawPile.length === 0) break;
    hand.push(g.drawPile.pop());
  }
  // Notify the player what they drew
  if (!isBot(playerId)) {
    const sock = io.sockets.sockets.get(playerId);
    if (sock) sock.emit("game:c8Hand", { hand });
  }
}

function c8HandleDraw(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-playing") return;
  if (c8CurrentPlayer(g) !== socketId) return;
  if (g.drewThisTurn) return; // already drew this turn
  // If draw pile is empty, shuffle discard pile back in (keep top card)
  if (g.drawPile.length === 0) {
    const top = g.discardPile.pop();
    g.drawPile = g.discardPile;
    g.discardPile = [top];
    for (let i = g.drawPile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [g.drawPile[i], g.drawPile[j]] = [g.drawPile[j], g.drawPile[i]];
    }
  }
  if (g.drawPile.length === 0) {
    // No cards left at all — skip turn
    c8AdvanceTurn(room);
    return;
  }
  const drawn = g.drawPile.pop();
  g.hands.get(socketId).push(drawn);
  g.drewThisTurn = true;
  // Notify only the drawing player what they got (bots don't need this)
  if (!isBot(socketId)) {
    const sock = io.sockets.sockets.get(socketId);
    const drawnPlayable = c8CanPlay(drawn, c8TopCard(g), g.activeSuit);
    if (sock) sock.emit("game:c8Drew", { card: drawn, canPlay: drawnPlayable });
  }
  // Check if the drawn card (or any card now) is playable.
  // If nothing is playable, auto-advance — no pass button needed.
  const hand = g.hands.get(socketId);
  const top = c8TopCard(g);
  const hasPlayable = hand.some(c => c8CanPlay(c, top, g.activeSuit));
  if (!hasPlayable) {
    // Brief delay so the player sees the drawn card before turn moves on
    broadcastRoom(room);
    setTimeout(() => {
      if (g.phase === "crazy8-playing" && c8CurrentPlayer(g) === socketId) {
        c8AdvanceTurn(room);
      }
    }, isBot(socketId) ? 400 : 800);
    return;
  }
  broadcastRoom(room);
  // If bot drew, let the bot AI decide what to play
  if (isBot(socketId)) {
    setTimeout(() => c8BotAfterDraw(room, socketId, drawn), 500 + Math.random() * 500);
  }
}

// c8HandlePass removed — drawing auto-advances if nothing is playable

function c8EndRound(room, winnerId) {
  const g = room.game;
  clearRoomTimer(room);
  // Score: winner gets sum of all opponents' remaining card points
  let points = 0;
  for (const [pid, hand] of g.hands) {
    if (pid !== winnerId) points += c8HandPoints(hand);
  }
  g.scores.set(winnerId, (g.scores.get(winnerId) || 0) + points);
  g.roundScoreDeltas = { [winnerId]: points };
  g.lastPlay = { playerId: winnerId, playerName: room.players.get(winnerId)?.name || "???", wonRound: true };
  const winnerName = room.players.get(winnerId)?.name || "Player";
  addSystemMessage(room, `🏆 ${winnerName} wins round ${g.round}! (+${points} pts)`);
  g.phase = "crazy8-results";
  broadcastRoom(room);
  // If bots are present, auto-advance after a delay
  c8MaybeAutoAdvance(room);
}

function c8NextRound(room, socketId) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-results") return;
  if (g.round >= g.totalRounds) {
    c8FinishGame(room);
    return;
  }
  g.round++;
  const cardsPerHand = g.playerIds.length <= 3 ? 7 : 5;
  const deck = c8NewDeck();
  g.hands = new Map();
  for (const pid of g.playerIds) g.hands.set(pid, deck.splice(0, cardsPerHand));
  let firstCard;
  do { firstCard = deck.shift(); if (C8_IS_WILD.has(firstCard.rank) || C8_IS_ACTION.has(firstCard.rank)) { deck.push(firstCard); firstCard = null; } } while (!firstCard);
  g.drawPile = deck;
  g.discardPile = [firstCard];
  g.activeSuit = firstCard.suit;
  g.lastPlay = null;
  g.drewThisTurn = false;
  // Rotate starting player each round
  g.turnIdx = (g.round - 1) % g.playerIds.length;
  g.phase = "crazy8-playing";
  const firstName = room.players.get(g.playerIds[g.turnIdx])?.name || "Player";
  addSystemMessage(room, `Round ${g.round}/${g.totalRounds} — ${firstName} goes first.`);
  broadcastRoom(room);
  c8MaybeBotTurn(room);
}

function c8FinishGame(room) {
  const g = room.game;
  g.phase = "gameover";
  clearRoomTimer(room);
  awardGameCoins(room);
  broadcastRoom(room);
}

// ── Crazy Eights Bot AI ──
function c8BotPickSuit(hand) {
  const counts = { H: 0, D: 0, C: 0, S: 0 };
  for (const c of hand) if (c.suit !== "W" && !C8_IS_WILD.has(c.rank)) counts[c.suit]++;
  let best = "H", bestN = -1;
  for (const [s, n] of Object.entries(counts)) if (n > bestN) { bestN = n; best = s; }
  return best;
}

function c8BotChooseCard(hand, topCard, activeSuit) {
  const playable = [];
  for (let i = 0; i < hand.length; i++) {
    if (c8CanPlay(hand[i], topCard, activeSuit)) playable.push(i);
  }
  if (playable.length === 0) return -1;
  // Priority: +2/+4 > Skip/Reverse > normal high-value > wilds (save)
  const pri = (r) => { if (r==="+2"||r==="+4") return 4; if (r==="S"||r==="R") return 3; if (C8_IS_WILD.has(r)) return 0; return 2; };
  playable.sort((a, b) => {
    const pa = pri(hand[a].rank), pb = pri(hand[b].rank);
    if (pa !== pb) return pb - pa;
    return c8CardPoints(hand[b]) - c8CardPoints(hand[a]);
  });
  return playable[0];
}

function c8MaybeBotTurn(room) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-playing") return;
  const pid = c8CurrentPlayer(g);
  if (!isBot(pid)) return;
  const hand = g.hands.get(pid);
  const top = c8TopCard(g);
  const cardIdx = c8BotChooseCard(hand, top, g.activeSuit);
  setTimeout(() => {
    if (cardIdx >= 0) {
      const card = hand[cardIdx];
      const suit = C8_IS_WILD.has(card.rank) ? c8BotPickSuit(hand) : undefined;
      c8HandlePlay(room, pid, cardIdx, suit);
    } else {
      c8HandleDraw(room, pid);
    }
  }, 800 + Math.random() * 1200);
}

function c8BotAfterDraw(room, botId, drawnCard) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-playing") return;
  if (c8CurrentPlayer(g) !== botId) return;
  const hand = g.hands.get(botId);
  const top = c8TopCard(g);
  if (c8CanPlay(drawnCard, top, g.activeSuit)) {
    const idx = hand.indexOf(drawnCard);
    const suit = C8_IS_WILD.has(drawnCard.rank) ? c8BotPickSuit(hand) : undefined;
    c8HandlePlay(room, botId, idx, suit);
  }
}

// If all remaining players after a round-end are bots, auto-advance.
// Otherwise the human clicks "Next Round".
function c8MaybeAutoAdvance(room) {
  const g = room.game;
  if (!g || g.type !== "crazy8" || g.phase !== "crazy8-results") return;
  const hasHuman = g.playerIds.some(pid => !isBot(pid));
  if (!hasHuman) {
    // All bots — just finish immediately (shouldn't really happen but be safe)
    setTimeout(() => c8NextRound(room), 1000);
  }
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

// ============================================================
//   GLOBAL CHAT
// ============================================================
// Global chat: persisted in SQLite, trimmed periodically
setInterval(() => { try { trimChat(); } catch {} }, 60 * 60 * 1000); // trim every hour

// ============================================================
//   ACHIEVEMENTS
// ============================================================
const ACHIEVEMENTS = [
  {id:"first_win",name:"First Victory",desc:"Win your first game",icon:"🏆",coins:50},
  {id:"win5",name:"Veteran",desc:"Win 5 games",icon:"🎖️",coins:100},
  {id:"win25",name:"Champion",desc:"Win 25 games",icon:"👑",coins:250},
  {id:"win100",name:"Legend",desc:"Win 100 games",icon:"⭐",coins:500},
  {id:"arcade_500",name:"Arcade Rat",desc:"Earn 500 arcade coins",icon:"🕹️",coins:75},
  {id:"arcade_2000",name:"High Scorer",desc:"Earn 2000 arcade coins",icon:"🎮",coins:200},
  {id:"dungeon_5",name:"Adventurer",desc:"Clear 5 dungeon areas",icon:"⚔️",coins:100},
  {id:"dungeon_10",name:"Dungeon Crawler",desc:"Clear 10 dungeon areas",icon:"🗡️",coins:200},
  {id:"dungeon_20",name:"Deep Diver",desc:"Clear 20 dungeon areas",icon:"🌊",coins:400},
  {id:"dungeon_all",name:"The Finisher",desc:"Clear all dungeon areas",icon:"♾️",coins:1000},
  {id:"coins_1000",name:"Thousandaire",desc:"Own 1,000 coins",icon:"💰",coins:0},
  {id:"coins_10000",name:"Rich",desc:"Own 10,000 coins",icon:"💰",coins:0},
  {id:"shop_5",name:"Fashionista",desc:"Buy 5 shop items",icon:"🛍️",coins:50},
  {id:"bug_report",name:"Bug Hunter",desc:"Submit a bug report",icon:"🐛",coins:25},
  {id:"chat_first",name:"Social Butterfly",desc:"Send your first chat message",icon:"💬",coins:10},
  {id:"blitz_kill",name:"Sharpshooter",desc:"Get a kill in Blitz",icon:"🎯",coins:30},
];

function checkAchievement(userId, achId) {
  if (!userId) return false;
  if (hasAchievement(userId, achId)) return false;
  awardAchievement(userId, achId);
  const ach = ACHIEVEMENTS.find(a => a.id === achId);
  if (ach && ach.coins > 0) {
    const user = getUserById(userId);
    if (user) setCoins(userId, user.coins + ach.coins);
  }
  // Notify user via socket
  for (const [, s] of io.sockets.sockets) {
    if (s.user && s.user.id === userId) {
      s.emit("achievement", { id: achId, name: ach?.name, icon: ach?.icon, coins: ach?.coins });
    }
  }
  return true;
}

function checkAllAchievements(userId) {
  const user = getUserById(userId);
  if (!user) return;
  const wins = user.total_points || 0;
  if (wins >= 1) checkAchievement(userId, "first_win");
  if (wins >= 5) checkAchievement(userId, "win5");
  if (wins >= 25) checkAchievement(userId, "win25");
  if (wins >= 100) checkAchievement(userId, "win100");
  if (user.coins >= 1000) checkAchievement(userId, "coins_1000");
  if (user.coins >= 10000) checkAchievement(userId, "coins_10000");
  const owned = (user.owned_items || "").split(",").filter(Boolean).length;
  if (owned >= 5) checkAchievement(userId, "shop_5");
}

app.get("/api/achievements", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const earned = getUserAchievements(sess.user_id);
  res.json({ achievements: ACHIEVEMENTS, earned });
});

app.post("/api/achievements/dungeon", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { areasCleared } = req.body || {};
  if (areasCleared >= 5) checkAchievement(sess.user_id, "dungeon_5");
  if (areasCleared >= 10) checkAchievement(sess.user_id, "dungeon_10");
  if (areasCleared >= 20) checkAchievement(sess.user_id, "dungeon_20");
  if (areasCleared >= 26) checkAchievement(sess.user_id, "dungeon_all");
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════
// CHAT MODERATION SYSTEM
// ═══════════════════════════════════════════════════
// Rate limiting: max 3 messages per 5 seconds per user
const chatRateMap = new Map(); // userId -> [timestamp, ...]
function checkChatRate(userId) {
  const now = Date.now(), window = 5000;
  const times = (chatRateMap.get(userId) || []).filter(t => now - t < window);
  chatRateMap.set(userId, times);
  if (times.length >= 3) return false;
  times.push(now);
  chatRateMap.set(userId, times);
  return true;
}

// Duplicate detection: block same message twice in a row
const lastMsgMap = new Map(); // userId -> { text, time }
function isDuplicate(userId, text) {
  const last = lastMsgMap.get(userId);
  if (last && last.text === text && Date.now() - last.time < 30000) return true;
  lastMsgMap.set(userId, { text, time: Date.now() });
  return false;
}

// Auto-escalation: track filter violations per user
const violationMap = new Map(); // userId -> { count, lastTime }
function recordViolation(userId) {
  const now = Date.now();
  const v = violationMap.get(userId) || { count: 0, lastTime: 0 };
  // Reset if last violation was over 1 hour ago
  if (now - v.lastTime > 3600000) v.count = 0;
  v.count++;
  v.lastTime = now;
  violationMap.set(userId, v);
  // Auto-mute escalation
  if (v.count >= 6) {
    setMutedUntil(userId, now + 3600000); // 1 hour
    return { autoMuted: true, duration: 60 };
  } else if (v.count >= 3) {
    setMutedUntil(userId, now + 600000); // 10 minutes
    return { autoMuted: true, duration: 10 };
  }
  return { autoMuted: false, remaining: (v.count >= 3 ? 0 : 3 - v.count) };
}

// Clean up rate maps every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, times] of chatRateMap) {
    const valid = times.filter(t => now - t < 5000);
    if (valid.length === 0) chatRateMap.delete(id); else chatRateMap.set(id, valid);
  }
  for (const [id, last] of lastMsgMap) {
    if (now - last.time > 60000) lastMsgMap.delete(id);
  }
  for (const [id, v] of violationMap) {
    if (now - v.lastTime > 3600000) violationMap.delete(id);
  }
}, 300000);

// ============================================================
//   DAILY CHALLENGES
// ============================================================
const CHALLENGE_POOL = [
  { key: 'arcade_3', name: 'Arcade Grinder', desc: 'Play 3 arcade games', goal: 3, reward: 75, icon: '🕹️' },
  { key: 'arcade_5', name: 'Arcade Marathon', desc: 'Play 5 arcade games', goal: 5, reward: 120, icon: '🎮' },
  { key: 'coins_100', name: 'Coin Collector', desc: 'Earn 100 coins', goal: 100, reward: 50, icon: '💰' },
  { key: 'coins_200', name: 'Big Earner', desc: 'Earn 200 coins', goal: 200, reward: 100, icon: '💰' },
  { key: 'chat_10', name: 'Social Butterfly', desc: 'Send 10 chat messages', goal: 10, reward: 40, icon: '💬' },
  { key: 'chat_25', name: 'Chatterbox', desc: 'Send 25 chat messages', goal: 25, reward: 80, icon: '💬' },
  { key: 'party_1', name: 'Party Starter', desc: 'Play 1 party game', goal: 1, reward: 60, icon: '🎭' },
  { key: 'party_3', name: 'Party Animal', desc: 'Play 3 party games', goal: 3, reward: 150, icon: '🎭' },
  { key: 'dungeon_5', name: 'Monster Slayer', desc: 'Kill 5 dungeon monsters', goal: 5, reward: 80, icon: '⚔️' },
  { key: 'dungeon_15', name: 'Dungeon Crawler', desc: 'Kill 15 dungeon monsters', goal: 15, reward: 150, icon: '⚔️' },
  { key: 'snake_50', name: 'Sssnake', desc: 'Score 50+ in Snake', goal: 1, reward: 100, icon: '🐍' },
  { key: 'memory_low', name: 'Sharp Mind', desc: 'Beat Memory Match in under 20 moves', goal: 1, reward: 100, icon: '🧠' },
];

function getTodayStr() { return new Date().toISOString().slice(0, 10); }

// Deterministic daily challenge selection using date as seed
function getDailyChallenges() {
  const day = getTodayStr();
  let seed = 0;
  for (const ch of day) seed = ((seed << 5) - seed + ch.charCodeAt(0)) | 0;
  seed = Math.abs(seed);
  const shuffled = [...CHALLENGE_POOL].sort((a, b) => {
    const ha = ((seed * 31 + a.key.charCodeAt(0)) | 0) % 1000;
    const hb = ((seed * 31 + b.key.charCodeAt(0)) | 0) % 1000;
    return ha - hb;
  });
  return shuffled.slice(0, 3);
}

app.get("/api/daily", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const challenges = getDailyChallenges();
  const day = getTodayStr();
  const progress = getDailyProgress(sess.user_id, day);
  const result = challenges.map(c => {
    const p = progress.find(x => x.challenge_key === c.key);
    return { ...c, progress: p?.progress || 0, claimed: !!(p?.claimed) };
  });
  // Time until reset (midnight UTC)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const resetIn = tomorrow - now;
  res.json({ challenges: result, resetIn });
});

app.post("/api/daily/claim", (req, res) => {
  const cookies = cookie.parse(req.headers.cookie || "");
  const sess = cookies.session ? getSession(cookies.session) : null;
  if (!sess) return res.status(401).json({ error: "Not logged in" });
  const { challengeKey } = req.body || {};
  const day = getTodayStr();
  const challenges = getDailyChallenges();
  const challenge = challenges.find(c => c.key === challengeKey);
  if (!challenge) return res.status(400).json({ error: "Invalid challenge" });
  const progress = getDailyProgress(sess.user_id, day);
  const p = progress.find(x => x.challenge_key === challengeKey);
  if (!p || p.progress < challenge.goal) return res.status(400).json({ error: "Challenge not complete" });
  if (p.claimed) return res.status(400).json({ error: "Already claimed" });
  claimDaily(sess.user_id, challengeKey, day);
  addCoins(sess.user_id, challenge.reward);
  res.json({ ok: true, reward: challenge.reward });
});

// Helper: track daily challenge progress (called from game completion handlers)
function trackDaily(userId, key, amount = 1) {
  if (!userId) return;
  const day = getTodayStr();
  incrementDaily(userId, key, day, amount);
}

// ============================================================
//   SPECTATOR MODE (Arcade)
// ============================================================
const liveArcadeGames = new Map(); // odataId -> { username, game, score, startedAt }

app.get("/api/arcade/live", (req, res) => {
  const list = [];
  for (const [id, g] of liveArcadeGames) {
    list.push({ id, username: g.username, game: g.game, score: g.score, startedAt: g.startedAt });
  }
  res.json({ games: list });
});

io.on("connection", (socket) => {

  // ----- Global Chat (persistent) -----
  socket.on("gchat:send", (msg) => {
    if (!socket.data.user) return;
    const text = (msg || "").toString().trim().slice(0, 200);
    if (!text) return;
    const uid = socket.data.user.id;
    const isUserStaff = isStaff(socket.data.user.username);

    // Check mute
    const freshUser = getUserById(uid);
    if (freshUser && freshUser.muted_until && freshUser.muted_until > Date.now()) {
      const remaining = Math.ceil((freshUser.muted_until - Date.now()) / 60000);
      socket.emit("gchat:blocked", `You're muted for ${remaining} more minute${remaining !== 1 ? 's' : ''}`);
      return;
    }
    // Rate limiting: 3 messages per 5 seconds (staff exempt)
    if (!isUserStaff && !checkChatRate(uid)) {
      socket.emit("gchat:blocked", "Slow down! Max 3 messages per 5 seconds.");
      return;
    }
    // Duplicate detection (staff exempt)
    if (!isUserStaff && isDuplicate(uid, text)) {
      socket.emit("gchat:blocked", "Don't send the same message twice.");
      return;
    }
    // Advanced profanity/slur filter
    const filterResult = checkMessage(text);
    if (filterResult) {
      const esc = recordViolation(uid);
      let feedback = "Message blocked for inappropriate language";
      if (filterResult.severity === 'severe') feedback = "Message blocked — slurs and hate speech are not tolerated";
      else if (filterResult.reason === 'evasion') feedback = "Message blocked — filter evasion detected";
      else if (filterResult.reason === 'spam') feedback = "Message blocked — character spam";
      if (esc.autoMuted) {
        feedback += `. Auto-muted for ${esc.duration} minutes.`;
        // Notify user about auto-mute
        socket.emit("gchat:muted", { minutes: esc.duration });
      }
      socket.emit("gchat:blocked", feedback);
      return;
    }
    // Word Spy anti-cheat: block messages containing the active spy word
    const roomCode = socketToRoom.get(socket.id);
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room && room.game && room.game.type === "wordspy" && room.game.wordData) {
        const word = room.game.wordData.word.toLowerCase();
        const normalized = text.toLowerCase().replace(/[^a-z]/g, "");
        const wordNorm = word.replace(/[^a-z]/g, "");
        if (wordNorm.length >= 3 && normalized.includes(wordNorm)) {
          socket.emit("gchat:blocked", "Can't say that word during Word Spy!");
          return;
        }
        const wordParts = word.split(/\s+/).filter(w => w.length >= 3);
        for (const part of wordParts) {
          const partNorm = part.replace(/[^a-z]/g, "");
          if (partNorm.length >= 3 && normalized.includes(partNorm)) {
            socket.emit("gchat:blocked", "Can't say that word during Word Spy!");
            return;
          }
        }
      }
    }
    // AI Moderation (async, only for messages that passed keyword filter)
    // Fire-and-forget style: send the message optimistically, delete if AI flags it
    const isUserMod = !!(freshUser && freshUser.is_mod);
    const isUserOwner = isOwner(socket.data.user.username);
    const entry = {
      user: socket.data.user.username,
      color: socket.data.user.nameColor || "#22aed1",
      text,
      time: Date.now(),
      isOwner: isUserOwner,
      isStaff: isUserStaff,
      isMod: isUserMod,
    };
    try { entry.id = saveChatMsg(entry.user, entry.color, entry.text, entry.time); } catch {}
    io.emit("gchat:msg", entry);
    checkAchievement(uid, "chat_first");
    trackDaily(uid, 'chat_10');
    trackDaily(uid, 'chat_25');
  });

  socket.on("gchat:history", (_, ack) => {
    if (typeof ack === "function") {
      try {
        const history = getChatHistory();
        // Attach role info to history messages
        const enriched = history.map(m => {
          const u = getUserByName(m.username);
          return { ...m, user: m.username, isOwner: isOwner(m.username), isStaff: isStaff(m.username), isMod: !!(u && u.is_mod) };
        });
        ack(enriched);
      } catch { ack([]); }
    }
  });

  // ----- Create room -----
  socket.on("room:create", ({ name, visibility, maxPlayers }, ack) => {
    const clean = sanitizeName(name);
    if (!clean) return ack?.({ error: "Name required (1-16 characters, no weird stuff)" });

    const roomMax = Math.min(Math.max(Number(maxPlayers) || 4, 2), MAX_PLAYERS);
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
      maxPlayers: roomMax,
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
    if (room.players.size + room.spectators.size >= (room.maxPlayers || MAX_PLAYERS)) return ack?.({ error: "Room is full" });

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

  // ----- Host adds a bot to the room -----
  socket.on("room:addBot", (_, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    if (room.hostId !== socket.id) return ack?.({ error: "Only the host can add bots" });
    if (room.game) return ack?.({ error: "Can't add bots during a game" });
    if (room.players.size >= (room.maxPlayers || MAX_PLAYERS)) return ack?.({ error: "Room is full" });
    const botId = makeBotId();
    const botName = pickBotName(room);
    room.players.set(botId, { id: botId, name: botName, isBot: true });
    addSystemMessage(room, `🤖 ${botName} (bot) joined`);
    broadcastRoom(room);
    ack?.({ ok: true });
  });

  // ----- Host removes a bot from the room -----
  socket.on("room:removeBot", ({ botId }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    if (room.hostId !== socket.id) return ack?.({ error: "Only the host can remove bots" });
    if (!isBot(botId)) return ack?.({ error: "Not a bot" });
    const bot = room.players.get(botId);
    if (!bot) return ack?.({ error: "Bot not found" });
    room.players.delete(botId);
    addSystemMessage(room, `🤖 ${bot.name} removed`);
    broadcastRoom(room);
    ack?.({ ok: true });
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
    } else if (room.mode === "c4") {
      if (room.players.size !== MIN_PLAYERS_C4) {
        return ack?.({ error: `Connect Four is exactly 2 players (room has ${room.players.size})` });
      }
      startC4Game(room, rounds || 3);
      ack?.({ ok: true });
    } else if (room.mode === "crazy8") {
      if (room.players.size < 2) {
        return ack?.({ error: "Need at least 2 players for Crazy Eights" });
      }
      if (room.players.size > 6) {
        return ack?.({ error: "Crazy Eights supports 2-6 players" });
      }
      startCrazy8Game(room, rounds || 3);
      ack?.({ ok: true });
    } else if (room.mode === "blitz") {
      if (room.players.size < 2) {
        return ack?.({ error: "Need at least 2 players for Blitz" });
      }
      // Blitz is real-time, not turn-based. Set up relay and tell clients.
      room.game = { type: "blitz", phase: "playing", startedAt: Date.now(), duration: 90000 };
      // Init bot players server-side before setting up relays
      initShooterBots(room.code, room);
      setupShooterRelay(socket, room.code);
      for (const [pid] of room.players) {
        if (isBot(pid)) continue;
        const s = io.sockets.sockets.get(pid);
        if (s && s !== socket) setupShooterRelay(s, room.code);
      }
      // Track kills for scoring
      room.game.kills = {}; // socketId -> kill count
      for (const [pid] of room.players) room.game.kills[pid] = 0;
      io.to(room.code).emit("game:blitzStart", { code: room.code, duration: 90000 });
      addSystemMessage(room, "💥 Blitz started! 90 seconds — most kills wins!");
      broadcastRoom(room);
      // Set timer to end the game
      setRoomTimer(room, 90000, () => endBlitzGame(room));
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

  // ----- Connect Four moves -----
  // Either player can play; c4HandleMove enforces turn order.
  socket.on("game:c4Move", ({ col }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    c4HandleMove(room, socket.id, Number(col));
    ack?.({ ok: true });
  });

  // ----- Crazy Eights -----
  socket.on("game:c8Play", ({ cardIdx, chosenSuit }, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    c8HandlePlay(room, socket.id, Number(cardIdx), chosenSuit);
    ack?.({ ok: true });
  });
  socket.on("game:c8Draw", (_, ack) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    c8HandleDraw(room, socket.id);
    ack?.({ ok: true });
  });

  // ----- Host advances to next round -----
  socket.on("game:nextRound", () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    // Connect Four is 2-player turn-based — either player can advance, no host check.
    if (room.game?.type === "c4") { c4NextRound(room, socket.id); return; }
    // Crazy Eights — either player can advance
    if (room.game?.type === "crazy8") { c8NextRound(room, socket.id); return; }
    if (room.hostId !== socket.id) return;
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

  // ----- Spectator Mode (Arcade) -----
  socket.on("arcade:start", ({ game }) => {
    if (!socket.data.user) return;
    const id = socket.data.user.id;
    liveArcadeGames.set(id, { username: socket.data.user.username, game, score: 0, startedAt: Date.now(), socketId: socket.id });
    socket.join(`spectate:${id}`);
    io.emit("arcade:liveUpdate");
  });

  socket.on("arcade:frame", ({ score, state }) => {
    if (!socket.data.user) return;
    const id = socket.data.user.id;
    const g = liveArcadeGames.get(id);
    if (g) { g.score = score || 0; }
    socket.to(`spectate:${id}`).emit("spectate:frame", { score, state });
  });

  socket.on("arcade:end", () => {
    if (!socket.data.user) return;
    const id = socket.data.user.id;
    liveArcadeGames.delete(id);
    io.to(`spectate:${id}`).emit("spectate:ended");
    socket.leave(`spectate:${id}`);
    io.emit("arcade:liveUpdate");
  });

  socket.on("spectate:join", ({ playerId }) => {
    socket.join(`spectate:${playerId}`);
  });

  socket.on("spectate:leave", ({ playerId }) => {
    socket.leave(`spectate:${playerId}`);
  });

  // ----- Disconnect handling -----
  socket.on("disconnect", () => {
    // Clean up live arcade games
    if (socket.data?.user?.id) {
      const id = socket.data.user.id;
      if (liveArcadeGames.has(id)) {
        liveArcadeGames.delete(id);
        io.emit("arcade:liveUpdate");
      }
    }
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

  // Room empty? Delete it. Only count real (non-bot) players.
  const realPlayers = [...room.players.values()].filter(p => !p.isBot);
  if (realPlayers.length === 0 && room.spectators.size === 0) {
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
