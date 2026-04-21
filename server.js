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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(path.join(__dirname, "public")));

// ============================================================
//   ROOM SYSTEM
// ============================================================
// rooms is a Map<code, Room> where Room is:
//   {
//     code: "ABCD",
//     hostId: <socket id>,
//     players: Map<socket.id, { id, name }>,
//     mode: "frequency" | "wordspy" | etc (null = no game picked yet)
//     chat: [{ id, name, text, ts, system }]  (last 50 kept)
//     createdAt: Date.now()
//   }

const rooms = new Map();
const socketToRoom = new Map(); // socket.id → room code, for quick lookup

// Characters used in room codes. No O/0/I/1/L to avoid confusion.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const MAX_PLAYERS = 12;
const MAX_CHAT = 50;

function generateCode() {
  // Keep trying until we get one that isn't in use. 30^4 = 810,000 combos,
  // collisions are extremely unlikely even with thousands of rooms.
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < CODE_LEN; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  // Fall back to a 5-char code if we somehow can't find a 4 (basically never)
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

// Take a user-entered name and make it safe + unique within the room.
// Strips control chars, trims, caps length, adds "(2)" etc if taken.
function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  // Remove anything that isn't printable. Allow letters/digits/spaces/basic punctuation.
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
  // What gets sent to clients whenever the room state changes.
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    players: [...room.players.values()].map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.id === room.hostId
    }))
  };
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
      mode: null,
      chat: [],
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
    if (room.players.size >= MAX_PLAYERS) return ack?.({ error: "Room is full" });

    const clean = sanitizeName(name);
    if (!clean) return ack?.({ error: "Name required (1-16 characters, no weird stuff)" });

    const finalName = uniqueNameInRoom(room, clean);
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
    const player = room.players.get(socket.id);
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
    room.mode = mode || null;
    broadcastRoom(room);
    if (mode) addSystemMessage(room, `Host picked: ${mode}`);
  });

  // ----- Host kicks someone -----
  socket.on("room:kick", ({ playerId }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (playerId === socket.id) return; // can't kick yourself
    const target = room.players.get(playerId);
    if (!target) return;

    // Tell the target they were kicked, then disconnect them from the room
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

  const player = room.players.get(socket.id);
  if (!player) return;
  room.players.delete(socket.id);
  socket.leave(code);

  // Room empty? Delete it.
  if (room.players.size === 0) {
    rooms.delete(code);
    return;
  }

  // Host left? Migrate to next player (by insertion order — Map preserves it)
  if (room.hostId === socket.id) {
    const newHost = room.players.values().next().value;
    room.hostId = newHost.id;
    addSystemMessage(room, `${player.name} left. ${newHost.name} is now the host.`);
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
