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
import { frequencyGame } from "./games/frequency.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, "public")));

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
const DEFAULT_ROUNDS = 5;

// Phase timers (in ms)
const TIMER_SUBMIT = 30_000;    // 30 seconds to rate
const TIMER_DISCUSS = 60_000;   // 60 seconds discussion
const TIMER_VOTE = 20_000;      // 20 seconds to vote
const TIMER_INTERMISSION = 10_000; // 10 seconds breather

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
    phase: g.phase,
    round: g.round,
    totalRounds: g.totalRounds,
    ratingsSubmitted: [...g.ratings.keys()],
    votesSubmitted: [...g.votes.keys()],
    scores: Object.fromEntries(g.scores),
    timerEnd: g.timerEnd || null,
    playerCount: g.activePlayers.size
  };

  // Revealed data — only present in certain phases
  if (g.phase === "discuss" || g.phase === "voting" || g.phase === "results" || g.phase === "gameover") {
    snap.revealedRatings = Object.fromEntries(g.ratings);
  }
  if (g.phase === "results" || g.phase === "gameover") {
    snap.revealedVotes = Object.fromEntries(g.votes);
    snap.offKeyId = g.offKeyId;
    snap.offKeyName = g.offKeyName;
    snap.offKeyPrompt = g.promptPair.offkey;
    snap.normalPrompt = g.promptPair.normal;
    snap.roundScoreDeltas = g.roundScoreDeltas || {};
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
//   GAME MODULES
// ============================================================

const GAMES = {
  frequency: frequencyGame
};

function getRoomContext() {
  return {
    io,
    broadcastRoom,
    addSystemMessage,
    clearRoomTimer,
    setRoomTimer,
    backToLobby
  };
}

// ============================================================
//   SOCKET.IO EVENTS
// ============================================================

io.on("connection", (socket) => {

  // ----- Create room -----
  socket.on("room:create", ({ name }, ack) => {
    const clean = sanitizeName(name);
    if (!clean) return ack?.({ error: "Name required (1-16 characters, no weird stuff)" });

    const code = generateCode();
    const room = {
      code,
      hostId: socket.id,
      players: new Map(),
      spectators: new Map(),   // Ghost Mode: players who joined mid-game
      mode: null,
      chat: [],
      game: null,
      _timer: null,
      createdAt: Date.now()
    };
    room.players.set(socket.id, { id: socket.id, name: clean });
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);

    ack?.({ ok: true, code, you: { id: socket.id, name: clean }, snapshot: roomSnapshot(room), chat: room.chat });
    addSystemMessage(room, `${clean} created the room`);
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
    if (!room.mode || !GAMES[room.mode]) return ack?.({ error: "Pick a valid game mode first" });
    
    // Check min players if we added it to game modules later, for now just hardcode 3 for Frequency
    if (room.mode === "frequency" && room.players.size < MIN_PLAYERS_FREQUENCY) {
      return ack?.({ error: `Need at least ${MIN_PLAYERS_FREQUENCY} players to start Frequency` });
    }

    GAMES[room.mode].start(room, getRoomContext(), { rounds });
    ack?.({ ok: true });
  });

  // ----- Game Events Generic Handler -----
  function handleGameEvent(action, payload, ack) {
    const code = socketToRoom.get(socket.id);
    if (!code) return ack?.({ error: "Not in a room" });
    const room = rooms.get(code);
    if (!room) return ack?.({ error: "Room gone" });
    if (!room.game || !room.mode || !GAMES[room.mode]) return ack?.({ error: "No game in progress" });

    GAMES[room.mode].handleEvent(room, getRoomContext(), socket.id, action, payload);
    ack?.({ ok: true });
  }

  socket.on("game:submitRating", (payload, ack) => handleGameEvent("submitRating", payload, ack));
  socket.on("game:submitVote", (payload, ack) => handleGameEvent("submitVote", payload, ack));
  socket.on("game:nextRound", (payload, ack) => {
    // Only host
    const code = socketToRoom.get(socket.id);
    if (code && rooms.get(code)?.hostId === socket.id) {
      handleGameEvent("nextRound", payload, ack);
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
  if (room.game && room.mode && GAMES[room.mode]) {
    GAMES[room.mode].handleDisconnect(room, getRoomContext(), socket.id);
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
//   SERVER START
// ============================================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`💾 Lobby 98 running at http://localhost:${PORT}`);
});
