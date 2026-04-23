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
//   5. Game starts → switch to game view, handle phases.
// ============================================================

const $ = (id) => document.getElementById(id);

// ============================================================
//   PROFILE & SHOP SYSTEM (localStorage)
// ============================================================

const NAME_COLORS = [
  { id: "default", name: "Default", color: "#0b4d6e", price: 0 },
  { id: "cyan", name: "Cyan", color: "#1ab5d5", price: 30 },
  { id: "emerald", name: "Emerald", color: "#2d9e5a", price: 30 },
  { id: "sunset", name: "Sunset", color: "#e87830", price: 50 },
  { id: "magenta", name: "Magenta", color: "#c740a0", price: 50 },
  { id: "gold", name: "Gold", color: "#c89020", price: 80 },
  { id: "violet", name: "Violet", color: "#7c3aed", price: 80 },
  { id: "crimson", name: "Crimson", color: "#dc2626", price: 100 },
  { id: "aurora", name: "Aurora", color: "linear-gradient(90deg,#1ab5d5,#2d9e5a,#c89020)", price: 150, gradient: true },
];

const TITLES = [
  { id: "none", name: "None", price: 0 },
  { id: "spy-hunter", name: "Spy Hunter", price: 60 },
  { id: "off-key-legend", name: "Off-Key Legend", price: 60 },
  { id: "chain-breaker", name: "Chain Breaker", price: 60 },
  { id: "smooth-talker", name: "Smooth Talker", price: 100 },
  { id: "detective", name: "Detective", price: 100 },
  { id: "mastermind", name: "Mastermind", price: 150 },
  { id: "shadow", name: "The Shadow", price: 200 },
  { id: "lobby-legend", name: "Lobby Legend", price: 300 },
];

const DEFAULT_PROFILE = {
  name: "",
  colorId: "default",
  titleId: "none",
  coins: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  totalPoints: 0,
  owned: ["default", "none"],  // owned item IDs (colors + titles)
};

function loadProfile() {
  try {
    const raw = localStorage.getItem("lobby98_profile");
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULT_PROFILE, ...p, owned: [...new Set([...DEFAULT_PROFILE.owned, ...(p.owned || [])])] };
    }
  } catch {}
  return { ...DEFAULT_PROFILE, owned: [...DEFAULT_PROFILE.owned] };
}

function saveProfile(profile) {
  try { localStorage.setItem("lobby98_profile", JSON.stringify(profile)); } catch {}
}

let profile = loadProfile();

function getNameColor() {
  const c = NAME_COLORS.find(x => x.id === profile.colorId);
  return c ? c.color : NAME_COLORS[0].color;
}

function getTitle() {
  const t = TITLES.find(x => x.id === profile.titleId);
  return t && t.id !== "none" ? t.name : null;
}

function awardCoins(points) {
  if (points <= 0) return;
  profile.coins += points;
  profile.totalPoints += points;
  saveProfile(profile);
  updateCoinsDisplay();
}

function recordGameEnd(won) {
  profile.gamesPlayed++;
  if (won) profile.gamesWon++;
  saveProfile(profile);
}

function updateCoinsDisplay() {
  $("coins-btn").textContent = profile.coins;
  const shopCoins = $("shop-coins");
  if (shopCoins) shopCoins.textContent = profile.coins;
}

// Auto-fill name inputs from profile
function prefillName() {
  if (profile.name) {
    const ci = $("create-name-input");
    const ji = $("join-name-input");
    if (ci && !ci.value) ci.value = profile.name;
    if (ji && !ji.value) ji.value = profile.name;
  }
}

// ============================================================
//   PROFILE OVERLAY
// ============================================================

function openProfile() {
  $("profile-overlay").hidden = false;
  $("profile-name-input").value = profile.name;
  $("stat-games").textContent = profile.gamesPlayed;
  $("stat-wins").textContent = profile.gamesWon;
  $("stat-points").textContent = profile.totalPoints;
  const title = getTitle();
  $("profile-equipped-title").textContent = title || "None";
  renderColorPicker();
}

function renderColorPicker() {
  const grid = $("color-picker");
  grid.innerHTML = "";
  for (const c of NAME_COLORS) {
    if (!profile.owned.includes(c.id)) continue;
    const swatch = document.createElement("div");
    swatch.className = `color-swatch ${profile.colorId === c.id ? "selected" : ""}`;
    swatch.style.background = c.gradient ? c.color : c.color;
    swatch.title = c.name;
    swatch.addEventListener("click", () => {
      profile.colorId = c.id;
      renderColorPicker();
    });
    grid.appendChild(swatch);
  }
}

$("profile-btn").addEventListener("click", openProfile);
$("profile-close").addEventListener("click", () => { $("profile-overlay").hidden = true; });
$("profile-save").addEventListener("click", () => {
  const newName = $("profile-name-input").value.trim().slice(0, 16);
  if (newName) profile.name = newName;
  saveProfile(profile);
  prefillName();
  $("profile-overlay").hidden = true;
});

// ============================================================
//   SHOP OVERLAY
// ============================================================

function openShop() {
  $("shop-overlay").hidden = false;
  updateCoinsDisplay();
  renderShop();
}

function renderShop() {
  const container = $("shop-categories");
  container.innerHTML = "";

  // Name Colors
  const colorSection = document.createElement("div");
  colorSection.className = "shop-category";
  colorSection.innerHTML = `<div class="shop-category-title">Name Colors</div>`;
  const colorGrid = document.createElement("div");
  colorGrid.className = "shop-grid";
  for (const c of NAME_COLORS) {
    if (c.id === "default") continue;
    const owned = profile.owned.includes(c.id);
    const equipped = profile.colorId === c.id;
    const canAfford = profile.coins >= c.price;
    const item = document.createElement("div");
    item.className = `shop-item ${owned ? "owned" : ""} ${equipped ? "equipped" : ""} ${!owned && !canAfford ? "too-expensive" : ""}`;
    item.innerHTML = `
      <div class="shop-item-preview" style="${c.gradient ? `background:${c.color};-webkit-background-clip:text;background-clip:text;color:transparent;` : `color:${c.color};`}">Aa</div>
      <div class="shop-item-name">${c.name}</div>
      ${owned ? (equipped ? '<div class="shop-item-status">equipped</div>' : '<div class="shop-item-status" style="color:var(--accent)">owned</div>') : `<div class="shop-item-price">${c.price}</div>`}
    `;
    item.addEventListener("click", () => {
      if (owned) {
        profile.colorId = c.id;
        saveProfile(profile);
        renderShop();
      } else if (canAfford) {
        profile.coins -= c.price;
        profile.owned.push(c.id);
        profile.colorId = c.id;
        saveProfile(profile);
        updateCoinsDisplay();
        renderShop();
      }
    });
    colorGrid.appendChild(item);
  }
  colorSection.appendChild(colorGrid);
  container.appendChild(colorSection);

  // Titles
  const titleSection = document.createElement("div");
  titleSection.className = "shop-category";
  titleSection.innerHTML = `<div class="shop-category-title">Titles</div>`;
  const titleGrid = document.createElement("div");
  titleGrid.className = "shop-grid";
  for (const t of TITLES) {
    if (t.id === "none") continue;
    const owned = profile.owned.includes(t.id);
    const equipped = profile.titleId === t.id;
    const canAfford = profile.coins >= t.price;
    const item = document.createElement("div");
    item.className = `shop-item ${owned ? "owned" : ""} ${equipped ? "equipped" : ""} ${!owned && !canAfford ? "too-expensive" : ""}`;
    item.innerHTML = `
      <div class="shop-item-preview" style="font-size:14px;">🏷️</div>
      <div class="shop-item-name">${t.name}</div>
      ${owned ? (equipped ? '<div class="shop-item-status">equipped</div>' : '<div class="shop-item-status" style="color:var(--accent)">owned</div>') : `<div class="shop-item-price">${t.price}</div>`}
    `;
    item.addEventListener("click", () => {
      if (owned) {
        profile.titleId = t.id;
        saveProfile(profile);
        renderShop();
      } else if (canAfford) {
        profile.coins -= t.price;
        profile.owned.push(t.id);
        profile.titleId = t.id;
        saveProfile(profile);
        updateCoinsDisplay();
        renderShop();
      }
    });
    titleGrid.appendChild(item);
  }
  titleSection.appendChild(titleGrid);
  container.appendChild(titleSection);
}

$("shop-btn").addEventListener("click", openShop);
$("coins-btn").addEventListener("click", openShop);
$("shop-close").addEventListener("click", () => { $("shop-overlay").hidden = true; });

// Close overlays on backdrop click
$("profile-overlay").addEventListener("click", (e) => { if (e.target === $("profile-overlay")) $("profile-overlay").hidden = true; });
$("shop-overlay").addEventListener("click", (e) => { if (e.target === $("shop-overlay")) $("shop-overlay").hidden = true; });

// ============================================================
//   GAME STATE
// ============================================================

// Local state
let me = null;        // { id, name, isHost }
let currentRoom = null; // last snapshot from server
let myPrompt = null;  // the prompt I received this round (Frequency)
let selectedRating = null;
let hasSubmittedRating = false;
let hasSubmittedVote = false;
let isSpectator = false;
let timerInterval = null;

// Word Spy state
let myWord = null;        // { word, category, isSpy }
let hasSubmittedClue = false;
let hasSubmittedSpyGuess = false;

// Chain state
let myChainRole = null;   // { isSaboteur, targetWord, starter }
let hasAccused = false;

const socket = io();

// ---------- View switching ----------
function show(viewId) {
  ["view-home", "view-room", "view-game", "view-kicked"].forEach(v => {
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
    isSpectator = false;
    profile.name = resp.you.name;
    saveProfile(profile);
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
    isSpectator = !!resp.spectator;
    profile.name = resp.you.name;
    saveProfile(profile);
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

  // If a game is active, go to game view
  if (snapshot.game && snapshot.game.phase !== "gameover") {
    switchToGameView(snapshot);
  } else {
    show("view-room");
  }
  setTimeout(() => $("chat-input").focus(), 100);
}

function leaveRoom() {
  socket.emit("room:leave");
  resetLocalState();
  show("view-home");
}

function resetLocalState() {
  me = null;
  currentRoom = null;
  myPrompt = null;
  selectedRating = null;
  hasSubmittedRating = false;
  hasSubmittedVote = false;
  isSpectator = false;
  myWord = null;
  hasSubmittedClue = false;
  hasSubmittedSpyGuess = false;
  myChainRole = null;
  hasAccused = false;
  coinsAwardedThisGame = false;
  clearTimerInterval();
  $("header-right").innerHTML = "";
  $("chat-messages").innerHTML = "";
  $("player-list").innerHTML = "";
}

$("leave-btn").addEventListener("click", leaveRoom);
$("back-home-btn").addEventListener("click", () => {
  resetLocalState();
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
  const spectatorTag = isSpectator ? " 👻" : "";
  el.innerHTML = `<span class="user-chip ${amHost ? "host" : ""}">${escapeHtml(me.name)}${amHost ? " (host)" : ""}${spectatorTag}</span>`;
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

  // Show spectators
  if (snapshot.spectators && snapshot.spectators.length > 0) {
    const specHeader = document.createElement("li");
    specHeader.className = "player-item spectator-header";
    specHeader.innerHTML = `<span class="player-name" style="color:var(--ink-mute);font-style:italic;">Spectators 👻</span>`;
    list.appendChild(specHeader);
    for (const s of snapshot.spectators) {
      const li = document.createElement("li");
      li.className = "player-item spectator-item";
      const isMe = me && s.id === me.id;
      li.innerHTML = `
        <span class="player-dot spectator-dot"></span>
        <span class="player-name">${escapeHtml(s.name)}</span>
        ${isMe ? '<span class="player-you-tag">(you)</span>' : ""}
      `;
      list.appendChild(li);
    }
  }

  $("player-count").textContent = `${snapshot.players.length}/12`;
  renderHeader();
  renderGamePicker(snapshot);
}

// ---------- Game picker ----------
function renderGamePicker(snapshot) {
  const amHost = me && snapshot.hostId === me.id;
  const hostNote = $("host-note");
  const startArea = $("start-game-area");
  const startNote = $("start-game-note");

  if (snapshot.game) {
    // Game in progress — hide the picker
    hostNote.textContent = "Game in progress";
    startArea.hidden = true;
    return;
  }

  if (amHost) {
    hostNote.textContent = snapshot.mode
      ? `You picked: ${snapshot.mode}`
      : "You're the host — pick a game";
  } else {
    hostNote.textContent = snapshot.mode
      ? `Host picked: ${snapshot.mode}`
      : "(waiting for host to pick)";
  }

  // Show start button if host + mode selected
  if (amHost && (snapshot.mode === "frequency" || snapshot.mode === "wordspy" || snapshot.mode === "chain")) {
    startArea.hidden = false;
    const minP = snapshot.mode === "wordspy" ? 3 : 3;
    if (snapshot.players.length < minP) {
      startNote.textContent = `Need at least ${minP} players (${snapshot.players.length} now)`;
      $("start-game-btn").disabled = true;
    } else {
      startNote.textContent = `${snapshot.players.length} players ready`;
      $("start-game-btn").disabled = false;
    }
  } else {
    startArea.hidden = true;
  }

  // Mark the selected card
  document.querySelectorAll(".game-card").forEach(card => {
    if (card.dataset.mode === snapshot.mode) card.classList.add("selected");
    else card.classList.remove("selected");
  });
}

// Click game card
document.querySelectorAll(".game-card").forEach(card => {
  card.addEventListener("click", () => {
    if (card.classList.contains("soon")) return;
    if (!currentRoom || !me || currentRoom.hostId !== me.id) return;
    if (currentRoom.game) return;
    socket.emit("room:setMode", { mode: card.dataset.mode });
  });
});

// Start game button
$("start-game-btn").addEventListener("click", () => {
  const rounds = Number($("rounds-select").value) || 5;
  socket.emit("game:start", { rounds }, (resp) => {
    if (resp?.error) {
      $("start-game-note").textContent = resp.error;
    }
  });
});

// ============================================================
//   GAME VIEW
// ============================================================

function switchToGameView(snapshot) {
  $("game-room-code").textContent = snapshot.code;
  // Set mode badge
  const badge = $("game-mode-badge");
  if (snapshot.game?.type === "wordspy") {
    badge.textContent = "🕵️ Word Spy";
  } else if (snapshot.game?.type === "chain") {
    badge.textContent = "⛓️ Chain";
  } else {
    badge.textContent = "🎵 Frequency";
  }
  updateGameRoundBadge(snapshot.game);
  syncGameChat();
  renderGamePhase(snapshot);
  show("view-game");
}

function updateGameRoundBadge(game) {
  if (!game) return;
  $("game-round-badge").textContent = `Round ${game.round}/${game.totalRounds}`;
}

function renderGamePhase(snapshot) {
  const game = snapshot.game;
  if (!game) return;

  // Hide all phases (both Frequency and Word Spy)
  ["phase-prompting", "phase-voting", "phase-results", "phase-gameover",
   "phase-discuss", "phase-intermission",
   "phase-ws-clues", "phase-ws-discuss", "phase-ws-voting",
   "phase-ws-spyguess", "phase-ws-results",
   "phase-chain-building", "phase-chain-results"].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });

  updateGameRoundBadge(game);
  startTimerDisplay(game.timerEnd, game.phase);

  switch (game.phase) {
    // Frequency phases
    case "prompting":
      renderPromptingPhase(snapshot);
      break;
    case "discuss":
      renderDiscussPhase(snapshot);
      break;
    case "voting":
      renderVotingPhase(snapshot);
      break;
    case "results":
      renderResultsPhase(snapshot);
      break;
    // Word Spy phases
    case "ws-clues":
      renderWSCluesPhase(snapshot);
      break;
    case "ws-discuss":
      renderWSDiscussPhase(snapshot);
      break;
    case "ws-voting":
      renderWSVotingPhase(snapshot);
      break;
    case "ws-spyguess":
      renderWSSpyGuessPhase(snapshot);
      break;
    case "ws-results":
      renderWSResultsPhase(snapshot);
      break;
    // Chain phases
    case "chain-building":
      renderChainBuildingPhase(snapshot);
      break;
    case "chain-results":
      renderChainResultsPhase(snapshot);
      break;
    // Shared phases
    case "intermission":
      renderIntermissionPhase(snapshot);
      break;
    case "gameover":
      renderGameOverPhase(snapshot);
      break;
  }
}

// --- Timer display ---
function clearTimerInterval() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimerDisplay(timerEnd, phase) {
  clearTimerInterval();
  const timerEl = $("game-timer");
  const timerWrapper = document.querySelector(".game-timer-wrapper");
  
  if (!timerEnd || !timerEl || phase === "results" || phase === "gameover" || phase === "ws-results" || phase === "chain-results") {
    if (timerWrapper) timerWrapper.style.display = "none";
    return;
  }
  if (timerWrapper) timerWrapper.style.display = "flex";

  function update() {
    const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
    timerEl.textContent = `${remaining}s`;
    timerEl.classList.toggle("timer-urgent", remaining <= 5);
    if (remaining <= 0) clearTimerInterval();
  }
  update();
  timerInterval = setInterval(update, 250);
}

// --- Prompting phase ---
function renderPromptingPhase(snapshot) {
  $("phase-prompting").hidden = false;
  const game = snapshot.game;

  if (isSpectator) {
    $("prompt-text").textContent = "You're spectating this round 👻";
    $("rating-picker").hidden = true;
    $("rating-submit-area").hidden = true;
    $("rating-waiting").hidden = false;
    $("ratings-progress").textContent = `${game.ratingsSubmitted.length}/${game.playerCount}`;
    return;
  }

  if (myPrompt) {
    $("prompt-text").textContent = myPrompt;
  }

  $("rating-picker").hidden = false;

  if (hasSubmittedRating) {
    $("rating-submit-area").hidden = true;
    $("rating-waiting").hidden = false;
    $("ratings-progress").textContent = `${game.ratingsSubmitted.length}/${game.playerCount}`;
    // Disable rating buttons
    document.querySelectorAll(".rating-btn").forEach(btn => btn.disabled = true);
  } else {
    $("rating-submit-area").hidden = false;
    $("rating-waiting").hidden = true;
    document.querySelectorAll(".rating-btn").forEach(btn => {
      btn.disabled = false;
      btn.classList.toggle("selected", Number(btn.dataset.val) === selectedRating);
    });
    $("submit-rating-btn").disabled = selectedRating === null;
  }
}

// --- Discuss phase ---
function renderDiscussPhase(snapshot) {
  // Reuse voting container but without vote buttons
  let el = $("phase-discuss");
  if (!el) {
    // Create discuss phase element dynamically
    el = document.createElement("div");
    el.className = "game-phase";
    el.id = "phase-discuss";
    el.innerHTML = `
      <h3 class="phase-title">📢 Discussion Time</h3>
      <p class="phase-instruction">All ratings revealed — discuss who seems off!</p>
      <div class="ratings-reveal" id="discuss-ratings-reveal"></div>
      <p class="discuss-timer-note" id="discuss-timer-note">Voting begins soon...</p>
    `;
    $("phase-prompting").parentNode.appendChild(el);
  }
  el.hidden = false;

  const game = snapshot.game;
  const ratingsEl = $("discuss-ratings-reveal");
  ratingsEl.innerHTML = "";

  if (game.revealedRatings) {
    renderRatingsCards(ratingsEl, snapshot, game.revealedRatings, false);
  }
}

// --- Voting phase ---
function renderVotingPhase(snapshot) {
  $("phase-voting").hidden = false;
  const game = snapshot.game;
  const container = $("ratings-reveal");
  container.innerHTML = "";

  if (game.revealedRatings) {
    renderRatingsCards(container, snapshot, game.revealedRatings, !isSpectator && !hasSubmittedVote);
  }

  if (hasSubmittedVote || isSpectator) {
    $("vote-waiting").hidden = false;
    $("votes-progress").textContent = `${game.votesSubmitted.length}/${game.playerCount}`;
  } else {
    $("vote-waiting").hidden = true;
  }
}

function renderRatingsCards(container, snapshot, ratings, showVoteButtons) {
  // Sort by rating value for a nice scale display
  const players = snapshot.players;
  const entries = players
    .filter(p => ratings[p.id] !== undefined)
    .map(p => ({ ...p, rating: ratings[p.id] }))
    .sort((a, b) => a.rating - b.rating);

  for (const p of entries) {
    const card = document.createElement("div");
    const isMe = me && p.id === me.id;
    card.className = `rating-card ${isMe ? "rating-card-me" : ""}`;
    card.innerHTML = `
      <div class="rating-card-info">
        <span class="rating-card-name">${escapeHtml(p.name)}${isMe ? " (you)" : ""}</span>
        ${p.isHost ? '<span class="player-host-badge">Host</span>' : ""}
      </div>
      <div class="rating-card-value">${p.rating}</div>
      ${showVoteButtons && !isMe
        ? `<button class="neo-btn neo-btn-vote" data-vote-id="${p.id}">Vote</button>`
        : ""}
    `;

    const voteBtn = card.querySelector(".neo-btn-vote");
    if (voteBtn) {
      voteBtn.addEventListener("click", () => {
        if (hasSubmittedVote) return;
        hasSubmittedVote = true;
        socket.emit("game:submitVote", { targetId: p.id }, () => {});
        // Disable all vote buttons immediately
        container.querySelectorAll(".neo-btn-vote").forEach(b => {
          b.disabled = true;
          b.classList.remove("neo-btn-vote-active");
        });
        voteBtn.classList.add("neo-btn-vote-active");
        voteBtn.textContent = "Voted!";
        $("vote-waiting").hidden = false;
      });
    }
    container.appendChild(card);
  }
}

// --- Results phase ---
function renderResultsPhase(snapshot) {
  $("phase-results").hidden = false;
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  // Off-Key reveal
  const offKeyPlayer = snapshot.players.find(p => p.id === game.offKeyId);
  const offKeyName = offKeyPlayer ? offKeyPlayer.name : "???";
  const isOffKeyMe = me && game.offKeyId === me.id;

  $("offkey-reveal").innerHTML = `
    <div class="offkey-reveal-card ${isOffKeyMe ? "offkey-reveal-me" : ""}">
      <span class="offkey-label">The Off-Key was</span>
      <span class="offkey-name">${escapeHtml(offKeyName)}${isOffKeyMe ? " (you!)" : ""}</span>
    </div>
  `;

  // Show both prompts
  $("prompts-comparison").innerHTML = `
    <div class="prompt-compare-grid">
      <div class="prompt-compare-card">
        <span class="prompt-compare-label">Group prompt</span>
        <p class="prompt-compare-text">${escapeHtml(game.normalPrompt)}</p>
      </div>
      <div class="prompt-compare-card offkey-prompt">
        <span class="prompt-compare-label">Off-Key prompt</span>
        <p class="prompt-compare-text">${escapeHtml(game.offKeyPrompt)}</p>
      </div>
    </div>
  `;

  // Score deltas + ratings + votes
  const scoresEl = $("round-scores");
  scoresEl.innerHTML = "<h4 class='scores-subtitle'>This round</h4>";

  const table = document.createElement("div");
  table.className = "scores-table";

  for (const p of snapshot.players) {
    const rating = game.revealedRatings?.[p.id];
    const votedFor = game.revealedVotes?.[p.id];
    const votedForName = snapshot.players.find(x => x.id === votedFor)?.name || "—";
    const delta = game.roundScoreDeltas?.[p.id] || 0;
    const total = game.scores?.[p.id] || 0;
    const isOffKey = p.id === game.offKeyId;
    const votedCorrectly = votedFor === game.offKeyId;

    const row = document.createElement("div");
    row.className = `score-row ${isOffKey ? "score-row-offkey" : ""} ${me && p.id === me.id ? "score-row-me" : ""}`;
    row.innerHTML = `
      <span class="score-name">${escapeHtml(p.name)}${isOffKey ? " 🎵" : ""}</span>
      <span class="score-rating">rated ${rating ?? "—"}</span>
      <span class="score-vote ${votedCorrectly ? "vote-correct" : "vote-wrong"}">voted ${escapeHtml(votedForName)}</span>
      <span class="score-delta ${delta > 0 ? "delta-pos" : ""}">${delta > 0 ? "+" + delta : delta === 0 ? "—" : delta}</span>
      <span class="score-total">${total} pts</span>
    `;
    table.appendChild(row);
  }
  scoresEl.appendChild(table);

  // Next round / game over button (host only)
  const nextArea = $("next-round-area");
  if (amHost) {
    nextArea.hidden = false;
    if (game.round >= game.totalRounds) {
      $("next-round-btn").textContent = "🏆 See Final Scores";
    } else {
      $("next-round-btn").textContent = "Next Round →";
    }
  } else {
    nextArea.hidden = true;
  }
}

$("next-round-btn").addEventListener("click", () => {
  socket.emit("game:nextRound");
});

// --- Intermission phase ---
function renderIntermissionPhase(snapshot) {
  let el = $("phase-intermission");
  if (!el) {
    el = document.createElement("div");
    el.className = "game-phase";
    el.id = "phase-intermission";
    el.innerHTML = `
      <div class="intermission-display">
        <div class="intermission-icon">⏸</div>
        <h3 class="phase-title">Next round starting soon...</h3>
        <div class="waiting-spinner"></div>
      </div>
    `;
    $("phase-prompting").parentNode.appendChild(el);
  }
  el.hidden = false;
}

// --- Game over phase ---
// Track if we already awarded coins this game (to avoid double-awarding on re-renders)
let coinsAwardedThisGame = false;

function renderGameOverPhase(snapshot) {
  $("phase-gameover").hidden = false;
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  // Award coins once per game
  if (!coinsAwardedThisGame && me && game.scores[me.id] !== undefined) {
    coinsAwardedThisGame = true;
    const myScore = game.scores[me.id] || 0;
    awardCoins(myScore);

    // Check if I won (top score)
    const allScores = Object.values(game.scores);
    const maxScore = Math.max(...allScores);
    recordGameEnd(myScore === maxScore && myScore > 0);
  }

  // Build sorted scoreboard
  const scoreboard = snapshot.players
    .filter(p => game.scores[p.id] !== undefined)
    .map(p => ({ ...p, score: game.scores[p.id] || 0 }))
    .sort((a, b) => b.score - a.score);

  const container = $("final-scoreboard");
  container.innerHTML = "";

  scoreboard.forEach((p, i) => {
    const isMe = me && p.id === me.id;
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    const card = document.createElement("div");
    card.className = `scoreboard-entry ${i === 0 ? "scoreboard-winner" : ""} ${isMe ? "scoreboard-me" : ""}`;
    card.innerHTML = `
      <span class="scoreboard-rank">${medal}</span>
      <span class="scoreboard-name">${escapeHtml(p.name)}${isMe ? " (you)" : ""}</span>
      <span class="scoreboard-score">${p.score} pts</span>
    `;
    container.appendChild(card);
  });

  // Back to lobby button (host only)
  const backArea = $("back-lobby-area");
  if (amHost) {
    backArea.hidden = false;
  } else {
    backArea.hidden = true;
  }
}

$("back-lobby-btn").addEventListener("click", () => {
  socket.emit("game:backToLobby");
});

// ============================================================
//   WORD SPY PHASES
// ============================================================

function renderWSClueList(containerId, clues, players, currentTurnId) {
  const list = $(containerId);
  if (!list) return;
  list.innerHTML = "";
  for (const c of clues) {
    const p = players.find(x => x.id === c.id);
    const li = document.createElement("li");
    const isNoClue = c.clue === "(no clue)";
    const isCurrent = c.id === currentTurnId;
    li.className = `ws-clue-item ${isNoClue ? "no-clue" : ""} ${isCurrent ? "current-turn" : ""}`;
    li.innerHTML = `
      <span class="ws-clue-author">${escapeHtml(p?.name || "???")}</span>
      <span class="ws-clue-text">${escapeHtml(c.clue)}</span>
    `;
    list.appendChild(li);
  }
}

function renderWSCluesPhase(snapshot) {
  $("phase-ws-clues").hidden = false;
  const game = snapshot.game;

  // Word display
  if (isSpectator) {
    $("ws-word-label").textContent = "You're spectating 👻";
    $("ws-word-text").textContent = "???";
    $("ws-word-text").classList.remove("spy-word");
    $("ws-category-text").textContent = `Category: ${game.category}`;
    $("ws-clue-input-area").hidden = true;
  } else if (myWord) {
    if (myWord.isSpy) {
      $("ws-word-label").textContent = "You are the SPY!";
      $("ws-word-text").textContent = "???";
      $("ws-word-text").classList.add("spy-word");
    } else {
      $("ws-word-label").textContent = "Your word";
      $("ws-word-text").textContent = myWord.word;
      $("ws-word-text").classList.remove("spy-word");
    }
    $("ws-category-text").textContent = `Category: ${myWord.category}`;
  }

  // Turn indicator
  const currentPid = game.turnOrder?.[game.currentTurn];
  const currentPlayer = snapshot.players.find(p => p.id === currentPid);
  const isMyTurn = me && currentPid === me.id && !isSpectator;

  if (game.currentTurn >= game.turnOrder.length) {
    $("ws-turn-indicator").textContent = "All clues given!";
    $("ws-turn-indicator").classList.remove("your-turn");
    $("ws-clue-input-area").hidden = true;
  } else if (isMyTurn && !hasSubmittedClue) {
    $("ws-turn-indicator").textContent = "YOUR TURN — give a clue!";
    $("ws-turn-indicator").classList.add("your-turn");
    $("ws-clue-input-area").hidden = false;
    $("ws-clue-input").focus();
  } else {
    $("ws-turn-indicator").textContent = `${currentPlayer?.name || "???"}'s turn...`;
    $("ws-turn-indicator").classList.remove("your-turn");
    $("ws-clue-input-area").hidden = true;
  }

  // Clue list
  renderWSClueList("ws-clue-list", game.clues, snapshot.players, currentPid);
}

function renderWSDiscussPhase(snapshot) {
  $("phase-ws-discuss").hidden = false;
  const game = snapshot.game;

  // Show word/spy status again for reference
  if (isSpectator) {
    $("ws-discuss-word-label").textContent = "You're spectating 👻";
    $("ws-discuss-word-text").textContent = "???";
  } else if (myWord) {
    if (myWord.isSpy) {
      $("ws-discuss-word-label").textContent = "You are the SPY!";
      $("ws-discuss-word-text").textContent = "???";
    } else {
      $("ws-discuss-word-label").textContent = "Your word";
      $("ws-discuss-word-text").textContent = myWord.word;
    }
    $("ws-discuss-category-text").textContent = `Category: ${myWord.category}`;
  }

  renderWSClueList("ws-discuss-clue-list", game.clues, snapshot.players, null);
}

function renderWSVotingPhase(snapshot) {
  $("phase-ws-voting").hidden = false;
  const game = snapshot.game;

  // Show clues for reference
  renderWSClueList("ws-voting-clue-list", game.clues, snapshot.players, null);

  // Vote grid
  const grid = $("ws-vote-grid");
  grid.innerHTML = "";

  if (isSpectator || hasSubmittedVote) {
    // Show waiting state
    for (const p of snapshot.players) {
      if (!game.clues.find(c => c.id === p.id)) continue;
      const card = document.createElement("div");
      const isMe = me && p.id === me.id;
      card.className = `ws-vote-card disabled`;
      const clue = game.clues.find(c => c.id === p.id)?.clue || "—";
      card.innerHTML = `
        <span class="ws-vote-card-name">${escapeHtml(p.name)}</span>
        <span class="ws-vote-card-clue">"${escapeHtml(clue)}"</span>
      `;
      grid.appendChild(card);
    }
    $("ws-vote-waiting").hidden = false;
    $("ws-votes-progress").textContent = `${game.votesSubmitted.length}/${game.playerCount}`;
  } else {
    $("ws-vote-waiting").hidden = true;
    for (const p of snapshot.players) {
      const isMe = me && p.id === me.id;
      const card = document.createElement("div");
      card.className = `ws-vote-card ${isMe ? "is-me" : ""}`;
      const clue = game.clues.find(c => c.id === p.id)?.clue || "—";
      card.innerHTML = `
        <span class="ws-vote-card-name">${escapeHtml(p.name)}${isMe ? " (you)" : ""}</span>
        <span class="ws-vote-card-clue">"${escapeHtml(clue)}"</span>
        ${!isMe ? '<span class="ws-vote-card-label">Vote</span>' : '<span class="ws-vote-card-label" style="opacity:0.3">can\'t vote self</span>'}
      `;
      if (!isMe) {
        card.addEventListener("click", () => {
          if (hasSubmittedVote) return;
          hasSubmittedVote = true;
          socket.emit("game:submitVote", { targetId: p.id });
          // Mark voted
          grid.querySelectorAll(".ws-vote-card").forEach(c => {
            c.classList.add("disabled");
            c.querySelector(".ws-vote-card-label").textContent = "";
          });
          card.classList.remove("disabled");
          card.classList.add("voted");
          card.querySelector(".ws-vote-card-label").textContent = "Voted!";
          $("ws-vote-waiting").hidden = false;
        });
      }
      grid.appendChild(card);
    }
  }
}

function renderWSSpyGuessPhase(snapshot) {
  $("phase-ws-spyguess").hidden = false;
  const game = snapshot.game;

  $("ws-spyguess-category").textContent = `Category: ${game.category}`;

  const amSpy = me && game.spyId === me.id;

  if (amSpy && !hasSubmittedSpyGuess && !isSpectator) {
    $("ws-spyguess-instruction").textContent = "The group caught you! Guess the word to still win!";
    $("ws-guess-input-area").hidden = false;
    $("ws-guess-waiting").hidden = true;
    $("ws-guess-input").focus();
  } else {
    if (amSpy) {
      $("ws-spyguess-instruction").textContent = "Your guess has been submitted...";
    } else {
      $("ws-spyguess-instruction").textContent = `The Spy was caught! Waiting for their guess...`;
    }
    $("ws-guess-input-area").hidden = true;
    $("ws-guess-waiting").hidden = false;
    $("ws-guess-waiting-text").textContent = amSpy ? "Waiting for result..." : "Waiting for the Spy's guess...";
  }
}

function renderWSResultsPhase(snapshot) {
  $("phase-ws-results").hidden = false;
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  // Result reveal
  const reveal = $("ws-result-reveal");
  let cardClass, labelText, detailText;

  if (game.spyCaught && !game.spyGuessedCorrectly) {
    cardClass = "spy-caught";
    labelText = "The Spy was";
    detailText = "Caught and couldn't guess the word!";
  } else if (game.spyCaught && game.spyGuessedCorrectly) {
    cardClass = "spy-guessed";
    labelText = "The Spy was";
    detailText = `Caught — but correctly guessed "${escapeHtml(game.word)}"! Spy wins!`;
  } else {
    cardClass = "spy-escaped";
    labelText = "The Spy was";
    detailText = "Blended in perfectly!";
  }

  reveal.innerHTML = `
    <div class="ws-result-card ${cardClass}">
      <div class="ws-result-label">${labelText}</div>
      <div class="ws-result-name">${escapeHtml(game.spyName || "???")}</div>
      <div class="ws-result-detail">${detailText}</div>
    </div>
  `;

  // Word reveal
  $("ws-word-reveal").innerHTML = `
    <div class="ws-word-reveal-label">The word was</div>
    <div class="ws-word-reveal-word">${escapeHtml(game.word)}</div>
    <div class="ws-word-reveal-cat">Category: ${escapeHtml(game.category)}</div>
  `;

  // Score table
  const scoresEl = $("ws-round-scores");
  scoresEl.innerHTML = "<h4 class='scores-subtitle'>This round</h4>";
  const table = document.createElement("div");
  table.className = "scores-table";

  for (const p of snapshot.players) {
    const votedFor = game.revealedVotes?.[p.id];
    const votedForName = snapshot.players.find(x => x.id === votedFor)?.name || "—";
    const delta = game.roundScoreDeltas?.[p.id] || 0;
    const total = game.scores?.[p.id] || 0;
    const isSpy = p.id === game.spyId;
    const votedCorrectly = votedFor === game.spyId;

    const row = document.createElement("div");
    row.className = `score-row ${isSpy ? "score-row-offkey" : ""} ${me && p.id === me.id ? "score-row-me" : ""}`;
    row.innerHTML = `
      <span class="score-name">${escapeHtml(p.name)}${isSpy ? " 🕵️" : ""}</span>
      <span class="score-vote ${votedCorrectly ? "vote-correct" : "vote-wrong"}">voted ${escapeHtml(votedForName)}</span>
      <span class="score-delta ${delta > 0 ? "delta-pos" : ""}">${delta > 0 ? "+" + delta : delta === 0 ? "—" : delta}</span>
      <span class="score-total">${total} pts</span>
    `;
    table.appendChild(row);
  }
  scoresEl.appendChild(table);

  // Next round button (host only)
  const nextArea = $("ws-next-round-area");
  if (amHost) {
    nextArea.hidden = false;
    if (game.round >= game.totalRounds) {
      $("ws-next-round-btn").textContent = "🏆 See Final Scores";
    } else {
      $("ws-next-round-btn").textContent = "Next Round →";
    }
  } else {
    nextArea.hidden = true;
  }
}

// WS event handlers
$("ws-clue-submit").addEventListener("click", () => {
  const input = $("ws-clue-input");
  const clue = input.value.trim();
  if (!clue || hasSubmittedClue) return;
  hasSubmittedClue = true;
  socket.emit("game:submitClue", { clue });
  input.value = "";
  $("ws-clue-input-area").hidden = true;
});

// Allow Enter key to submit clue
$("ws-clue-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("ws-clue-submit").click();
  }
});

$("ws-guess-submit").addEventListener("click", () => {
  const input = $("ws-guess-input");
  const guess = input.value.trim();
  if (!guess || hasSubmittedSpyGuess) return;
  hasSubmittedSpyGuess = true;
  socket.emit("game:spyGuess", { guess });
  input.value = "";
  $("ws-guess-input-area").hidden = true;
  $("ws-guess-waiting").hidden = false;
  $("ws-guess-waiting-text").textContent = "Guess submitted!";
});

$("ws-guess-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("ws-guess-submit").click();
  }
});

$("ws-next-round-btn").addEventListener("click", () => {
  socket.emit("game:nextRound");
});

// ============================================================
//   CHAIN PHASES
// ============================================================

function renderChainBuildingPhase(snapshot) {
  $("phase-chain-building").hidden = false;
  const game = snapshot.game;

  // Role card
  if (isSpectator) {
    $("chain-role-label").textContent = "You're spectating 👻";
    $("chain-role-text").textContent = "";
    $("chain-role-text").classList.remove("saboteur");
    $("chain-word-input-area").hidden = true;
    $("chain-accuse-area").hidden = true;
  } else if (myChainRole) {
    if (myChainRole.isSaboteur) {
      $("chain-role-label").textContent = "You are the SABOTEUR!";
      $("chain-role-text").innerHTML = `Sneak this word in: <span class="chain-target-word">${escapeHtml(myChainRole.targetWord)}</span>`;
      $("chain-role-text").classList.add("saboteur");
    } else {
      $("chain-role-label").textContent = "You're a builder";
      $("chain-role-text").textContent = "Add words to the sentence. Watch for the Saboteur!";
      $("chain-role-text").classList.remove("saboteur");
    }
  }

  // Sentence display
  const sentenceEl = $("chain-sentence-display");
  sentenceEl.innerHTML = `<span class="chain-starter">${escapeHtml(game.starter)}</span> `;
  for (let i = 0; i < game.sentence.length; i++) {
    const entry = game.sentence[i];
    const isSkipped = entry.word === "...";
    const isNew = i === game.sentence.length - 1;
    const span = document.createElement("span");
    span.className = `chain-word ${isNew ? "new-word" : ""} ${isSkipped ? "skipped" : ""}`;
    span.textContent = entry.word + " ";
    sentenceEl.appendChild(span);
  }

  // Turn indicator
  const activeTurnOrder = game.turnOrder.filter(id =>
    snapshot.players.some(p => p.id === id)
  );
  const currentPid = activeTurnOrder.length > 0
    ? activeTurnOrder[game.currentTurn % activeTurnOrder.length]
    : null;
  const currentPlayer = snapshot.players.find(p => p.id === currentPid);
  const isMyTurn = me && currentPid === me.id && !isSpectator;

  const turnEl = $("chain-turn-indicator");
  if (isMyTurn) {
    turnEl.textContent = "YOUR TURN — add a word!";
    turnEl.classList.add("your-turn");
    $("chain-word-input-area").hidden = false;
    $("chain-word-input").focus();
  } else {
    turnEl.textContent = `${currentPlayer?.name || "???"}'s turn...`;
    turnEl.classList.remove("your-turn");
    $("chain-word-input-area").hidden = true;
  }

  // Word count
  $("chain-word-count").textContent = `${game.sentence.length}/20 words`;

  // Accuse area — show for non-spectators, hide if already accused
  if (!isSpectator && !hasAccused && game.sentence.length >= 2) {
    $("chain-accuse-area").hidden = false;
    const grid = $("chain-accuse-grid");
    grid.innerHTML = "";
    for (const p of snapshot.players) {
      if (me && p.id === me.id) continue; // can't accuse yourself
      const btn = document.createElement("button");
      btn.className = "chain-accuse-btn";
      btn.textContent = `Accuse ${p.name}`;
      btn.addEventListener("click", () => {
        if (hasAccused) return;
        if (!confirm(`Accuse ${p.name} of being the Saboteur? This ends the round immediately!`)) return;
        hasAccused = true;
        socket.emit("game:chainAccuse", { accusedId: p.id });
        $("chain-accuse-area").hidden = true;
      });
      grid.appendChild(btn);
    }
  } else {
    $("chain-accuse-area").hidden = true;
  }
}

function renderChainResultsPhase(snapshot) {
  $("phase-chain-results").hidden = false;
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  // Result reveal
  const reveal = $("chain-result-reveal");
  let cardClass, labelText, detailText;

  if (game.accusation && game.accusationCorrect) {
    cardClass = "spy-caught";
    const accuserName = snapshot.players.find(p => p.id === game.accusation.accuserId)?.name || "???";
    labelText = `${accuserName} correctly accused`;
    detailText = `${game.saboteurName} was the Saboteur!`;
  } else if (game.accusation && !game.accusationCorrect) {
    cardClass = "spy-escaped";
    const accuserName = snapshot.players.find(p => p.id === game.accusation.accuserId)?.name || "???";
    const wrongName = snapshot.players.find(p => p.id === game.accusation.accusedId)?.name || "???";
    labelText = `${accuserName} accused ${wrongName}... WRONG!`;
    detailText = `${game.saboteurName} was the real Saboteur!`;
  } else if (game.wordSneakedIn) {
    cardClass = "spy-guessed";
    labelText = "Word sneaked in!";
    detailText = `${game.saboteurName} got "${game.targetWord}" into the sentence!`;
  } else {
    cardClass = "spy-caught";
    labelText = "Saboteur failed!";
    detailText = `${game.saboteurName} couldn't sneak in "${game.targetWord}"`;
  }

  reveal.innerHTML = `
    <div class="ws-result-card ${cardClass}">
      <div class="ws-result-label">${labelText}</div>
      <div class="ws-result-name">${escapeHtml(detailText)}</div>
    </div>
  `;

  // Final sentence with target word highlighted
  const sentenceEl = $("chain-sentence-final");
  const targetLower = game.targetWord.toLowerCase();
  let sentenceHtml = `<span class="chain-starter">${escapeHtml(game.starter)}</span> `;
  for (const entry of game.sentence) {
    const isTarget = entry.word.toLowerCase() === targetLower;
    if (isTarget) {
      sentenceHtml += `<span class="chain-target-inline">${escapeHtml(entry.word)}</span> `;
    } else if (entry.word === "...") {
      sentenceHtml += `<span class="chain-word skipped">...</span> `;
    } else {
      sentenceHtml += `${escapeHtml(entry.word)} `;
    }
  }
  sentenceEl.innerHTML = sentenceHtml;

  // Score table
  const scoresEl = $("chain-round-scores");
  scoresEl.innerHTML = "<h4 class='scores-subtitle'>This round</h4>";
  const table = document.createElement("div");
  table.className = "scores-table";

  for (const p of snapshot.players) {
    const delta = game.roundScoreDeltas?.[p.id] || 0;
    const total = game.scores?.[p.id] || 0;
    const isSab = p.id === game.saboteurId;

    const row = document.createElement("div");
    row.className = `score-row ${isSab ? "score-row-offkey" : ""} ${me && p.id === me.id ? "score-row-me" : ""}`;
    row.innerHTML = `
      <span class="score-name">${escapeHtml(p.name)}${isSab ? " ⛓️" : ""}</span>
      <span class="score-delta ${delta > 0 ? "delta-pos" : delta < 0 ? "delta-neg" : ""}">${delta > 0 ? "+" + delta : delta === 0 ? "—" : delta}</span>
      <span class="score-total">${total} pts</span>
    `;
    table.appendChild(row);
  }
  scoresEl.appendChild(table);

  // Next round button
  const nextArea = $("chain-next-round-area");
  if (amHost) {
    nextArea.hidden = false;
    const btn = $("chain-next-round-btn");
    if (game.round >= game.totalRounds) {
      btn.textContent = "🏆 See Final Scores";
    } else {
      btn.textContent = "Next Round →";
    }
  } else {
    nextArea.hidden = true;
  }
}

// Chain event handlers
$("chain-word-submit").addEventListener("click", () => {
  const input = $("chain-word-input");
  const word = input.value.trim().split(/\s+/)[0]; // single word only
  if (!word) return;
  socket.emit("game:chainWord", { word });
  input.value = "";
});

$("chain-word-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("chain-word-submit").click();
  }
  // Block spaces — one word only
  if (e.key === " ") {
    e.preventDefault();
  }
});

$("chain-next-round-btn").addEventListener("click", () => {
  socket.emit("game:nextRound");
});

// ============================================================
//   RATING PICKER
// ============================================================

document.querySelectorAll(".rating-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    if (hasSubmittedRating) return;
    selectedRating = Number(btn.dataset.val);
    document.querySelectorAll(".rating-btn").forEach(b => {
      b.classList.toggle("selected", Number(b.dataset.val) === selectedRating);
    });
    $("submit-rating-btn").disabled = false;
  });
});

$("submit-rating-btn").addEventListener("click", () => {
  if (selectedRating === null || hasSubmittedRating) return;
  hasSubmittedRating = true;
  $("submit-rating-btn").disabled = true;
  $("submit-rating-btn").textContent = "Locked in!";
  document.querySelectorAll(".rating-btn").forEach(btn => btn.disabled = true);
  socket.emit("game:submitRating", { rating: selectedRating }, () => {});
  $("rating-submit-area").hidden = true;
  $("rating-waiting").hidden = false;
});

// ============================================================
//   CHAT (shared between lobby and game views)
// ============================================================

function renderChat(history) {
  const msgs = $("chat-messages");
  msgs.innerHTML = "";
  for (const m of history) addChatMessage(m);
  scrollChatToBottom();
}

function addChatMessage(msg) {
  // Add to both chat containers
  ["chat-messages", "game-chat-messages"].forEach(containerId => {
    const container = $(containerId);
    if (!container) return;

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
    container.appendChild(li);
  });
}

function scrollChatToBottom() {
  ["chat-messages", "game-chat-messages"].forEach(id => {
    const el = $(id);
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function syncGameChat() {
  // Obsolete: addChatMessage already updates both containers in real time.
}

// Lobby chat form
$("chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("chat-input");
  sendChat(input);
});

// Game chat form
$("game-chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("game-chat-input");
  sendChat(input);
});

function sendChat(inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  socket.emit("chat:send", { text }, (ack) => {
    if (ack?.error) console.warn(ack.error);
  });
  inputEl.value = "";
}

// ============================================================
//   SOCKET EVENTS
// ============================================================

socket.on("room:update", (snapshot) => {
  const wasInGame = currentRoom?.game?.phase && currentRoom.game.phase !== "gameover";
  const prevRound = currentRoom?.game?.round;
  const prevPhase = currentRoom?.game?.phase;
  currentRoom = snapshot;

  renderRoom(snapshot);

  if (snapshot.game) {
    const phase = snapshot.game.phase;
    // Switch to game view if a game started
    if (phase !== "gameover" || !wasInGame) {
      // Frequency: reset round state on new round
      if (phase === "prompting" && (snapshot.game.round !== prevRound || prevPhase !== "prompting")) {
        hasSubmittedRating = false;
        hasSubmittedVote = false;
        selectedRating = null;
        $("submit-rating-btn").textContent = "Lock in";
        document.querySelectorAll(".rating-btn").forEach(b => {
          b.classList.remove("selected");
          b.disabled = false;
        });
      }
      if (phase === "voting" && prevPhase !== "voting") {
        hasSubmittedVote = false;
      }

      // Word Spy: reset round state on new round
      if (phase === "ws-clues" && (snapshot.game.round !== prevRound || prevPhase !== "ws-clues")) {
        hasSubmittedClue = false;
        hasSubmittedVote = false;
        hasSubmittedSpyGuess = false;
      }
      if (phase === "ws-voting" && prevPhase !== "ws-voting") {
        hasSubmittedVote = false;
      }
      if (phase === "ws-spyguess") {
        // Don't reset spy guess — it should persist
      }

      // Chain: reset round state on new round
      if (phase === "chain-building" && (snapshot.game.round !== prevRound || prevPhase !== "chain-building")) {
        hasAccused = false;
      }

      switchToGameView(snapshot);
    } else if (phase === "gameover") {
      switchToGameView(snapshot);
    }
  } else {
    // No game — back to lobby view
    hasSubmittedRating = false;
    hasSubmittedVote = false;
    selectedRating = null;
    myPrompt = null;
    myWord = null;
    hasSubmittedClue = false;
    hasSubmittedSpyGuess = false;
    myChainRole = null;
    hasAccused = false;
    coinsAwardedThisGame = false;
    clearTimerInterval();
    show("view-room");
  }
});

socket.on("game:yourPrompt", ({ prompt, round }) => {
  myPrompt = prompt;
  $("prompt-text").textContent = prompt;
});

socket.on("game:yourWord", ({ word, category, isSpy, round }) => {
  myWord = { word, category, isSpy };
  hasSubmittedClue = false;
  hasSubmittedSpyGuess = false;
});

socket.on("game:yourChainRole", ({ isSaboteur, targetWord, starter, round }) => {
  myChainRole = { isSaboteur, targetWord, starter };
  hasAccused = false;
});

socket.on("chat:message", (msg) => {
  addChatMessage(msg);
  scrollChatToBottom();
});

socket.on("room:kicked", ({ by }) => {
  $("kicked-by").textContent = by ? `(by ${by})` : "";
  resetLocalState();
  show("view-kicked");
});

socket.on("disconnect", () => {
  if (me) {
    resetLocalState();
    show("view-home");
  }
});

// ============================================================
//   UTILS
// ============================================================

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// Auto-uppercase the room code input
const codeInput = document.querySelector(".code-input");
if (codeInput) {
  codeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });
}

show("view-home");
prefillName();
updateCoinsDisplay();
