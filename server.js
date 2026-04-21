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
import { pickPrompts } from "./prompts.js";

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
    if (room.mode !== "frequency") return ack?.({ error: "Pick a game mode first" });
    if (room.players.size < MIN_PLAYERS_FREQUENCY) {
      return ack?.({ error: `Need at least ${MIN_PLAYERS_FREQUENCY} players to start Frequency` });
    }

    startFrequencyGame(room, rounds || DEFAULT_ROUNDS);
    ack?.({ ok: true });
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
    handleVoteSubmit(room, socket.id, targetId);
    ack?.({ ok: true });
  });

  // ----- Host advances to next round -----
  socket.on("game:nextRound", () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    advanceToNextRound(room);
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
    handleGameDisconnect(room, socket.id);
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
