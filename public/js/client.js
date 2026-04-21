// client.js — Lobby 98 (scribbl-style, no accounts)
// ============================================================
// Flow:
//   1. Page loads → show home view (create or join a room).
//   2. Submit create → socket emits "room:create" → server creates room,
//      acks with code + snapshot → client switches to room view.
//   3. Submit join  → socket emits "room:join"  → server adds player,
//      acks with snapshot → client switches to room view.
//   4. In room: send chat, see player list update live, host picks game,
//      host can kick others. Leave returns to home.
// ============================================================

const $ = (id) => document.getElementById(id);

// Local state — "who am I" and "what room am I in"
let me = null;   // { id, name, isHost }
let currentRoom = null; // last snapshot from server

// One socket, opened immediately. Note: the server accepts connections from
// anyone — you're only "in" a room after emitting room:create or room:join.
const socket = io();

// ---------- View switching ----------
function show(viewId) {
  ["view-home", "view-room", "view-kicked"].forEach(v => {
    $(v).hidden = v !== viewId;
  });
}

// ---------- Home: create & join ----------
$("form-create").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = new FormData(e.target).get("name");
  $("create-error").textContent = "";

  socket.emit("room:create", { name }, (resp) => {
    if (resp?.error) {
      $("create-error").textContent = resp.error;
      return;
    }
    me = resp.you;
    enterRoom(resp.snapshot, resp.chat);
  });
});

$("form-join").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target);
  const name = data.get("name");
  const code = data.get("code");
  $("join-error").textContent = "";

  socket.emit("room:join", { name, code }, (resp) => {
    if (resp?.error) {
      $("join-error").textContent = resp.error;
      return;
    }
    me = resp.you;
    enterRoom(resp.snapshot, resp.chat);
  });
});

// ---------- Entering / leaving a room ----------
function enterRoom(snapshot, chatHistory) {
  currentRoom = snapshot;
  $("room-code").textContent = snapshot.code;
  renderRoom(snapshot);
  renderChat(chatHistory);
  renderHeader();
  show("view-room");
  // Focus chat for quick vibing
  setTimeout(() => $("chat-input").focus(), 100);
}

function leaveRoom() {
  socket.emit("room:leave");
  me = null;
  currentRoom = null;
  $("header-right").innerHTML = "";
  $("chat-messages").innerHTML = "";
  $("player-list").innerHTML = "";
  show("view-home");
}

$("leave-btn").addEventListener("click", leaveRoom);
$("back-home-btn").addEventListener("click", () => {
  me = null;
  currentRoom = null;
  $("header-right").innerHTML = "";
  show("view-home");
});

// ---------- Copy room code ----------
$("copy-code-btn").addEventListener("click", async () => {
  const code = $("room-code").textContent;
  try {
    await navigator.clipboard.writeText(code);
    const btn = $("copy-code-btn");
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1200);
  } catch {
    // Fallback: just select the code so the user can copy manually
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($("room-code"));
    sel.removeAllRanges();
    sel.addRange(range);
  }
});

// ---------- Header chip ----------
function renderHeader() {
  const el = $("header-right");
  if (!me) { el.innerHTML = ""; return; }
  const amHost = currentRoom && currentRoom.hostId === me.id;
  el.innerHTML = `<span class="user-chip ${amHost ? "host" : ""}">${escapeHtml(me.name)}${amHost ? " (host)" : ""}</span>`;
}

// ---------- Player list ----------
function renderRoom(snapshot) {
  currentRoom = snapshot;
  const list = $("player-list");
  list.innerHTML = "";

  const amHost = me && snapshot.hostId === me.id;

  for (const p of snapshot.players) {
    const li = document.createElement("li");
    li.className = "player-item";

    const isMe = me && p.id === me.id;
    const kickBtn = (amHost && !isMe)
      ? `<button class="player-kick-btn can-kick" data-kick-id="${p.id}" title="Kick this player">✕</button>`
      : "";
    const hostBadge = p.isHost ? `<span class="player-host-badge">Host</span>` : "";
    const youTag = isMe ? `<span class="player-you-tag">(you)</span>` : "";

    li.innerHTML = `
      <span class="player-dot"></span>
      <span class="player-name">${escapeHtml(p.name)}</span>
      ${youTag}
      ${hostBadge}
      ${kickBtn}
    `;

    const btn = li.querySelector(".player-kick-btn");
    if (btn) {
      btn.addEventListener("click", () => {
        if (!confirm(`Kick ${p.name}?`)) return;
        socket.emit("room:kick", { playerId: p.id });
      });
    }
    list.appendChild(li);
  }

  $("player-count").textContent = `${snapshot.players.length}/12`;
  renderHeader();
  renderGamePicker(snapshot);
}

// ---------- Game picker ----------
function renderGamePicker(snapshot) {
  const amHost = me && snapshot.hostId === me.id;
  const hostNote = $("host-note");

  if (amHost) {
    hostNote.textContent = snapshot.mode
      ? `you picked: ${snapshot.mode} (games coming in the next update)`
      : "you're the host — pick a game when it's ready";
  } else {
    hostNote.textContent = snapshot.mode
      ? `host picked: ${snapshot.mode}`
      : "(waiting for host to pick)";
  }

  // Mark the selected card, if any
  document.querySelectorAll(".game-card").forEach(card => {
    if (card.dataset.mode === snapshot.mode) card.classList.add("selected");
    else card.classList.remove("selected");
  });
}

// Click game card — only host can do this, and only when games are actually ready.
// All games are "soon" right now, so clicks are no-ops visually.
document.querySelectorAll(".game-card").forEach(card => {
  card.addEventListener("click", () => {
    if (card.classList.contains("soon")) return;
    if (!currentRoom || !me || currentRoom.hostId !== me.id) return;
    socket.emit("room:setMode", { mode: card.dataset.mode });
  });
});

// ---------- Chat ----------
function renderChat(history) {
  const msgs = $("chat-messages");
  msgs.innerHTML = "";
  for (const m of history) addChatMessage(m);
  scrollChatToBottom();
}

function addChatMessage(msg) {
  const li = document.createElement("li");
  if (msg.system) {
    li.className = "chat-system";
    li.textContent = `— ${msg.text} —`;
  } else {
    const isHostAuthor = currentRoom && msg.playerId === currentRoom.hostId;
    li.innerHTML = `
      <span class="chat-author ${isHostAuthor ? "host-author" : ""}">${escapeHtml(msg.name)}:</span>
      <span class="chat-text">${escapeHtml(msg.text)}</span>
    `;
  }
  $("chat-messages").appendChild(li);
}

function scrollChatToBottom() {
  const msgs = $("chat-messages");
  msgs.scrollTop = msgs.scrollHeight;
}

$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  socket.emit("chat:send", { text }, (ack) => {
    if (ack?.error) console.warn(ack.error);
  });
  input.value = "";
});

// ---------- Socket events ----------
socket.on("room:update", (snapshot) => {
  renderRoom(snapshot);
});

socket.on("chat:message", (msg) => {
  addChatMessage(msg);
  scrollChatToBottom();
});

socket.on("room:kicked", ({ by }) => {
  $("kicked-by").textContent = by ? `(by ${by})` : "";
  me = null;
  currentRoom = null;
  $("header-right").innerHTML = "";
  show("view-kicked");
});

socket.on("disconnect", () => {
  // If we get dropped, bounce back to home. Don't show an error if we
  // were the one leaving on purpose (handled by leaveRoom already).
  if (me) {
    me = null;
    currentRoom = null;
    $("header-right").innerHTML = "";
    show("view-home");
  }
});

// ---------- Utils ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Kick off ----------
// Auto-uppercase the room code input as user types
const codeInput = document.querySelector(".code-input");
if (codeInput) {
  codeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
}

show("view-home");
