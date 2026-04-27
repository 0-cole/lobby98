// client.js — Lobby 98 v3
const $ = id => document.getElementById(id);

// ============================================================
//   STATE
// ============================================================
let user = null;       // logged-in user object from server
let me = null;         // { id, name } in current room
let currentRoom = null;
let myPrompt = null, selectedRating = null, hasSubmittedRating = false;
let hasSubmittedVote = false, isSpectator = false, timerInterval = null;
let myWord = null, hasSubmittedClue = false, hasSubmittedSpyGuess = false;
let myChainRole = null, hasAccused = false, coinsAwarded = false;
let myEchoPrompt = null, hasSubmittedEchoAnswer = false;
const socket = io();
window._socket = socket;
let gchatInitialized = false;

// ============================================================
//   ANNOUNCEMENTS (stacking top bars)
// ============================================================
function showAnnouncement(text, type = 'info', autoClose = 0) {
  const container = $('announcements');
  if (!container) return;
  const bar = document.createElement('div');
  bar.className = `announce-bar ${type}`;
  bar.innerHTML = `<span>${esc(text)}</span><button class="announce-x" title="Dismiss">✕</button>`;
  const dismiss = () => { bar.style.animation = 'toastOut .2s ease forwards'; setTimeout(() => bar.remove(), 200); };
  bar.querySelector('.announce-x').addEventListener('click', dismiss);
  container.appendChild(bar);
  if (autoClose > 0) setTimeout(dismiss, autoClose);
}

function checkNewUserNotice() {
  if (!user || !user.createdAt) return;
  const age = Date.now() - user.createdAt;
  if (age < 86400000) {
    const hrs = Math.ceil((86400000 - age) / 3600000);
    showAnnouncement(`🕐 New account — chat and bug reports unlock in ${hrs} hour${hrs !== 1 ? 's' : ''}. Play some games in the meantime!`, 'warn');
  }
}

// ============================================================
//   ROUTING
// ============================================================
const PAGES = ["page-auth","page-dashboard","page-play","page-room","page-game","page-kicked","page-arcade","page-shop","page-settings","page-leaderboard","page-staff","page-dungeon","page-profile","page-market"];

function showPage(id) {
  PAGES.forEach(p => { const el = $(p); if (el) el.hidden = p !== id; });
  // Update nav
  const map = {"page-dashboard":"dashboard","page-play":"play","page-room":"play","page-game":"play","page-arcade":"arcade","page-shop":"shop","page-settings":"settings","page-leaderboard":"leaderboard","page-staff":"staff","page-dungeon":"dungeon","page-profile":"profile","page-market":"market"};
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.page === map[id]));
  // Show/hide global chat sidebar
  if (user && !GCHAT_HIDDEN_PAGES.has(id)) showGChat();
  else hideGChat();
}

// Nav links
document.querySelectorAll(".nav-link").forEach(l => {
  l.addEventListener("click", () => {
    if (!user) return;
    // Don't navigate away from active room/game
    if (currentRoom && (l.dataset.page === "dashboard" || l.dataset.page === "arcade" || l.dataset.page === "shop" || l.dataset.page === "settings" || l.dataset.page === "leaderboard" || l.dataset.page === "staff" || l.dataset.page === "dungeon" || l.dataset.page === "profile" || l.dataset.page === "market")) {
      if (!confirm("Leave the current room?")) return;
      socket.emit("room:leave");
      resetRoomState();
    }
    showPage("page-" + l.dataset.page);
    if (l.dataset.page === "shop") loadShop();
    if (l.dataset.page === "settings") loadSettings();
    if (l.dataset.page === "play") { prefillName(); loadRoomBrowser(); }
    if (l.dataset.page === "leaderboard") loadLeaderboard();
    if (l.dataset.page === "achievements") loadAchievements();
    if (l.dataset.page === "profile") loadProfile();
    if (l.dataset.page === "market") loadMarket();
  });
});

// Dashboard cards
document.querySelectorAll(".dash-card").forEach(c => {
  c.addEventListener("click", () => {
    const page = c.dataset.goto;
    if (page) { showPage("page-" + page); if (page === "shop") loadShop(); if (page === "settings") loadSettings(); if (page === "play") prefillName(); }
  });
});

function updateUI() {
  if (!user) { $("top-nav").hidden = true; showPage("page-auth"); return; }
  $("top-nav").hidden = false;
  $("nav-coins").textContent = "🪙 " + (user.coins || 0);
  $("nav-user").textContent = user.username;
  $("dash-greeting").textContent = `Welcome back, ${user.username}!`;
  $("ds-coins").textContent = user.coins || 0;
  $("ds-games").textContent = user.gamesPlayed || 0;
  $("ds-wins").textContent = user.gamesWon || 0;
  $("ds-points").textContent = user.totalPoints || 0;
  // Staff link visibility — checked every time UI updates
  const staffLink = $("nav-staff-link");
  if (staffLink) staffLink.hidden = !["cole"].includes(user.username.toLowerCase());
}

function prefillName() {
  if (user) {
    const ci = $("create-name-input"), ji = $("join-name-input");
    if (ci && !ci.value) ci.value = user.username;
    if (ji && !ji.value) ji.value = user.username;
  }
}

// ============================================================
//   AUTH
// ============================================================
async function checkSession() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.loggedIn) { user = data.user; updateUI(); showPage("page-dashboard"); checkStaff(); loadFakeNews(); initGChatOnce(); checkNewUserNotice(); }
    else { user = null; updateUI(); }
  } catch { user = null; updateUI(); }
}

// Refresh user data WITHOUT navigating — use after profile/shop changes
async function refreshUser() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    if (data.loggedIn) { user = data.user; updateUI(); }
  } catch {}
}

async function authSubmit(endpoint, form, errorEl) {
  errorEl.textContent = "";
  const fd = new FormData(form);
  const body = { username: fd.get("username"), password: fd.get("password") };
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Error"; return; }
    user = data.user; updateUI(); showPage("page-dashboard"); checkStaff(); loadFakeNews();
    // Reconnect socket so it picks up the new session cookie
    socket.disconnect(); socket.connect();
    // Init global chat after reconnect gives the middleware time to set socket.data.user
    setTimeout(initGChatOnce, 600);
    checkNewUserNotice();
  } catch { errorEl.textContent = "Network error"; }
}

$("form-register").addEventListener("submit", e => { e.preventDefault(); authSubmit("/api/register", e.target, $("register-error")); });
$("form-login").addEventListener("submit", e => { e.preventDefault(); authSubmit("/api/login", e.target, $("login-error")); });

$("logout-btn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  user = null; resetRoomState(); updateUI();
  socket.disconnect(); socket.connect();
});

socket.on("user:updated", u => { user = u; updateUI(); });

// ============================================================
//   ROOM — create / join / leave
// ============================================================
function resetRoomState() {
  me = null; currentRoom = null; myPrompt = null; selectedRating = null;
  hasSubmittedRating = false; hasSubmittedVote = false; isSpectator = false;
  myWord = null; hasSubmittedClue = false; hasSubmittedSpyGuess = false;
  myChainRole = null; hasAccused = false; coinsAwarded = false;
  myEchoPrompt = null; hasSubmittedEchoAnswer = false;
  clearTI();
  $("chat-messages").innerHTML = ""; $("player-list").innerHTML = "";
}

$("form-create").addEventListener("submit", e => {
  e.preventDefault(); $("create-error").textContent = "";
  const fd = new FormData(e.target);
  const vis = document.getElementById("create-visibility");
  socket.emit("room:create", { name: fd.get("name"), visibility: vis ? vis.value : "public" }, resp => {
    if (resp?.error) { $("create-error").textContent = resp.error; return; }
    me = resp.you; isSpectator = false; enterRoom(resp.snapshot, resp.chat);
  });
});

$("form-join").addEventListener("submit", e => {
  e.preventDefault(); $("join-error").textContent = "";
  const fd = new FormData(e.target);
  socket.emit("room:join", { name: fd.get("name"), code: fd.get("code") }, resp => {
    if (resp?.error) { $("join-error").textContent = resp.error; return; }
    me = resp.you; isSpectator = !!resp.spectator; enterRoom(resp.snapshot, resp.chat);
  });
});

function enterRoom(snap, chatHistory) {
  currentRoom = snap; coinsAwarded = false;
  $("room-code").textContent = snap.code;
  renderRoom(snap); renderChat(chatHistory);
  if (snap.game && snap.game.phase !== "gameover") switchToGame(snap);
  else showPage("page-room");
}

$("leave-btn").addEventListener("click", () => { socket.emit("room:leave"); resetRoomState(); showPage("page-play"); });
$("back-home-btn").addEventListener("click", () => { resetRoomState(); showPage("page-dashboard"); });
$("copy-code-btn").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("room-code").textContent); $("copy-code-btn").textContent = "Copied!"; setTimeout(() => $("copy-code-btn").textContent = "Copy", 1200); } catch {}
});

// ============================================================
//   ROOM RENDERING
// ============================================================
function renderRoom(snap) {
  currentRoom = snap;
  const list = $("player-list"); list.innerHTML = "";
  const amHost = me && snap.hostId === me.id;
  for (const p of snap.players) {
    const li = document.createElement("li"); li.className = "player-item";
    const isMe = me && p.id === me.id;
    li.innerHTML = `<span class="player-dot"></span><span class="player-name">${esc(p.name)}</span>${isMe?'<span class="player-you-tag">(you)</span>':""}${p.isHost?'<span class="player-host-badge">Host</span>':""}${amHost&&!isMe?`<button class="player-kick-btn can-kick" data-kid="${p.id}">✕</button>`:""}`;
    const kb = li.querySelector(".player-kick-btn");
    if (kb) kb.addEventListener("click", () => { if (confirm(`Kick ${p.name}?`)) socket.emit("room:kick", { playerId: p.id }); });
    list.appendChild(li);
  }
  if (snap.spectators?.length) {
    const sh = document.createElement("li"); sh.className = "player-item"; sh.innerHTML = '<span class="player-name" style="color:var(--ink3);font-style:italic">Spectators 👻</span>'; list.appendChild(sh);
    for (const s of snap.spectators) { const li = document.createElement("li"); li.className = "player-item"; li.innerHTML = `<span class="player-dot" style="opacity:.4"></span><span class="player-name">${esc(s.name)}</span>${me&&s.id===me.id?'<span class="player-you-tag">(you)</span>':""}`; list.appendChild(li); }
  }
  $("player-count").textContent = `${snap.players.length}/12`;
  renderGamePicker(snap);
}

function renderGamePicker(snap) {
  const amHost = me && snap.hostId === me.id;
  const hn = $("host-note"), sa = $("start-game-area"), sn = $("start-game-note");
  if (snap.game) { hn.textContent = "Game in progress"; sa.hidden = true; return; }
  hn.textContent = amHost ? (snap.mode ? `You picked: ${snap.mode}` : "Pick a game") : (snap.mode ? `Host picked: ${snap.mode}` : "(waiting for host)");
  if (amHost && ["frequency","wordspy","chain","echo","blitz"].includes(snap.mode)) {
    sa.hidden = false;
    if (snap.players.length < 3) { sn.textContent = `Need 3+ players (${snap.players.length} now)`; $("start-game-btn").disabled = true; }
    else { sn.textContent = `${snap.players.length} players ready`; $("start-game-btn").disabled = false; }
  } else sa.hidden = true;
  document.querySelectorAll(".game-card").forEach(c => { c.classList.toggle("selected", c.dataset.mode === snap.mode); });
}

document.querySelectorAll(".game-card").forEach(c => { c.addEventListener("click", () => { if (c.classList.contains("soon") || !currentRoom || !me || currentRoom.hostId !== me.id || currentRoom.game) return; socket.emit("room:setMode", { mode: c.dataset.mode }); }); });
$("start-game-btn").addEventListener("click", () => { socket.emit("game:start", { rounds: Number($("rounds-select").value) || 5 }, r => { if (r?.error) $("start-game-note").textContent = r.error; }); });

// ============================================================
//   GAME VIEW
// ============================================================
function switchToGame(snap) {
  $("game-room-code").textContent = snap.code;
  const badge = $("game-mode-badge");
  badge.textContent = snap.game?.type === "wordspy" ? "🕵️ Word Spy" : snap.game?.type === "chain" ? "⛓️ Chain" : snap.game?.type === "echo" ? "🔊 Echo" : "🎵 Frequency";
  updateRound(snap.game); syncChat(); renderPhase(snap); showPage("page-game");
}

function updateRound(g) { if (g) $("game-round-badge").textContent = `Round ${g.round}/${g.totalRounds}`; }

function renderPhase(snap) {
  const g = snap.game; if (!g) return;
  ["phase-prompting","phase-voting","phase-results","phase-gameover","phase-discuss","phase-intermission","phase-ws-clues","phase-ws-discuss","phase-ws-voting","phase-ws-spyguess","phase-ws-results","phase-chain-building","phase-chain-results","phase-echo-submit","phase-echo-discuss","phase-echo-voting","phase-echo-results"].forEach(id => { const el = $(id); if (el) el.hidden = true; });
  updateRound(g); startTimer(g.timerEnd, g.phase);
  const ph = g.phase;
  if (ph === "prompting") renderPrompting(snap);
  else if (ph === "discuss") renderDiscuss(snap);
  else if (ph === "voting") renderVoting(snap);
  else if (ph === "results") renderResults(snap);
  else if (ph === "ws-clues") renderWSClues(snap);
  else if (ph === "ws-discuss") renderWSDiscuss(snap);
  else if (ph === "ws-voting") renderWSVoting(snap);
  else if (ph === "ws-spyguess") renderWSSpyGuess(snap);
  else if (ph === "ws-results") renderWSResults(snap);
  else if (ph === "chain-building") renderChainBuilding(snap);
  else if (ph === "chain-results") renderChainResults(snap);
  else if (ph === "echo-submit") renderEchoSubmit(snap);
  else if (ph === "echo-discuss") renderEchoDiscuss(snap);
  else if (ph === "echo-voting") renderEchoVoting(snap);
  else if (ph === "echo-results") renderEchoResults(snap);
  else if (ph === "intermission") renderIntermission(snap);
  else if (ph === "gameover") renderGameOver(snap);
}

// Timer
function clearTI() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
function startTimer(end, phase) {
  clearTI(); const el = $("game-timer"); const wrap = document.querySelector(".timer-wrap");
  if (!end || !el || ["results","gameover","ws-results","chain-results"].includes(phase)) { if (wrap) wrap.style.display = "none"; return; }
  if (wrap) wrap.style.display = "flex";
  const upd = () => { const r = Math.max(0, Math.ceil((end - Date.now()) / 1000)); el.textContent = r + "s"; el.classList.toggle("timer-urgent", r <= 5); if (r <= 0) clearTI(); };
  upd(); timerInterval = setInterval(upd, 250);
}

// === FREQUENCY ===
function renderPrompting(snap) {
  $("phase-prompting").hidden = false; const g = snap.game;
  if (isSpectator) { $("prompt-text").textContent = "Spectating 👻"; $("rating-picker").hidden = true; $("rating-submit-area").hidden = true; $("rating-waiting").hidden = false; $("ratings-progress").textContent = `${g.ratingsSubmitted.length}/${g.playerCount}`; return; }
  if (myPrompt) $("prompt-text").textContent = myPrompt;
  $("rating-picker").hidden = false;
  if (hasSubmittedRating) { $("rating-submit-area").hidden = true; $("rating-waiting").hidden = false; $("ratings-progress").textContent = `${g.ratingsSubmitted.length}/${g.playerCount}`; document.querySelectorAll(".rating-btn").forEach(b => b.disabled = true); }
  else { $("rating-submit-area").hidden = false; $("rating-waiting").hidden = true; document.querySelectorAll(".rating-btn").forEach(b => { b.disabled = false; b.classList.toggle("selected", Number(b.dataset.val) === selectedRating); }); $("submit-rating-btn").disabled = selectedRating === null; }
}
function renderDiscuss(snap) {
  let el = $("phase-discuss"); if (!el.innerHTML) el.innerHTML = `<h3 class="ph-title">📢 Discussion</h3><p class="ph-inst">Ratings revealed — discuss who seems off!</p><div class="ratings-reveal" id="discuss-ratings-reveal"></div>`;
  el.hidden = false;
  if (snap.game.revealedRatings) renderRatingCards($("discuss-ratings-reveal"), snap, snap.game.revealedRatings, false);
}
function renderVoting(snap) {
  $("phase-voting").hidden = false; const g = snap.game;
  if (g.revealedRatings) renderRatingCards($("ratings-reveal"), snap, g.revealedRatings, !isSpectator && !hasSubmittedVote);
  if (hasSubmittedVote || isSpectator) { $("vote-waiting").hidden = false; $("votes-progress").textContent = `${g.votesSubmitted.length}/${g.playerCount}`; } else $("vote-waiting").hidden = true;
}
function renderRatingCards(container, snap, ratings, showVote) {
  container.innerHTML = "";
  const entries = snap.players.filter(p => ratings[p.id] !== undefined).map(p => ({ ...p, rating: ratings[p.id] })).sort((a, b) => a.rating - b.rating);
  for (const p of entries) {
    const isMe = me && p.id === me.id;
    const card = document.createElement("div"); card.className = `rating-card ${isMe ? "rating-card-me" : ""}`;
    card.innerHTML = `<div class="rating-card-info"><span class="rating-card-name">${esc(p.name)}${isMe?" (you)":""}</span>${p.isHost?'<span class="player-host-badge">Host</span>':""}</div><div class="rating-card-value">${p.rating}</div>${showVote&&!isMe?`<button class="neo-btn-vote" data-vid="${p.id}">Vote</button>`:""}`;
    const vb = card.querySelector(".neo-btn-vote");
    if (vb) vb.addEventListener("click", () => { if (hasSubmittedVote) return; hasSubmittedVote = true; socket.emit("game:submitVote", { targetId: p.id }); container.querySelectorAll(".neo-btn-vote").forEach(b => { b.disabled = true; b.classList.remove("neo-btn-vote-active"); }); vb.classList.add("neo-btn-vote-active"); vb.textContent = "Voted!"; $("vote-waiting").hidden = false; });
    container.appendChild(card);
  }
}
function renderResults(snap) {
  $("phase-results").hidden = false; const g = snap.game, amHost = me && snap.hostId === me.id;
  const okp = snap.players.find(p => p.id === g.offKeyId); const okn = okp ? okp.name : "???"; const isMe = me && g.offKeyId === me.id;
  $("offkey-reveal").innerHTML = `<div class="offkey-reveal-card ${isMe?"offkey-reveal-me":""}"><span class="offkey-label">The Off-Key was</span><span class="offkey-name">${esc(okn)}${isMe?" (you!)":""}</span></div>`;
  $("prompts-comparison").innerHTML = `<div class="prompt-compare-grid"><div class="prompt-compare-card"><span class="prompt-compare-label">Group prompt</span><p class="prompt-compare-text">${esc(g.normalPrompt)}</p></div><div class="prompt-compare-card offkey-prompt"><span class="prompt-compare-label">Off-Key prompt</span><p class="prompt-compare-text">${esc(g.offKeyPrompt)}</p></div></div>`;
  renderScoreTable($("round-scores"), snap, g, "offKeyId", "🎵");
  const na = $("next-round-area"); if (amHost) { na.hidden = false; $("next-round-btn").textContent = g.round >= g.totalRounds ? "🏆 See Final Scores" : "Next Round →"; } else na.hidden = true;
}
$("next-round-btn").addEventListener("click", () => socket.emit("game:nextRound"));

function renderScoreTable(el, snap, g, roleKey, roleEmoji) {
  el.innerHTML = "<h4 class='scores-subtitle'>This round</h4>";
  const t = document.createElement("div"); t.className = "scores-table";
  for (const p of snap.players) {
    const delta = g.roundScoreDeltas?.[p.id] || 0, total = g.scores?.[p.id] || 0, isRole = roleKey && p.id === g[roleKey];
    const row = document.createElement("div"); row.className = `score-row ${isRole?"score-row-offkey":""} ${me&&p.id===me.id?"score-row-me":""}`;
    let extra = "";
    if (g.revealedVotes) { const vf = g.revealedVotes[p.id]; const vn = snap.players.find(x=>x.id===vf)?.name||"—"; const vc = roleKey && vf === g[roleKey]; extra = `<span class="score-vote ${vc?"vote-correct":"vote-wrong"}">→ ${esc(vn)}</span>`; }
    if (g.revealedRatings?.[p.id] !== undefined) extra = `<span class="score-rating">${g.revealedRatings[p.id]}</span>` + extra;
    row.innerHTML = `<span class="score-name">${esc(p.name)}${isRole?" "+roleEmoji:""}</span>${extra}<span class="score-delta ${delta>0?"delta-pos":delta<0?"delta-neg":""}">${delta>0?"+"+delta:delta===0?"—":delta}</span><span class="score-total">${total} pts</span>`;
    t.appendChild(row);
  }
  el.appendChild(t);
}

function renderIntermission(snap) {
  const el = $("phase-intermission"); if (!el.innerHTML) el.innerHTML = `<div class="intermission-display"><div class="intermission-icon">⏸</div><h3 class="ph-title">Next round soon...</h3><div class="spinner"></div></div>`;
  el.hidden = false;
}

function renderGameOver(snap) {
  $("phase-gameover").hidden = false; const g = snap.game, amHost = me && snap.hostId === me.id;
  if (!coinsAwarded && me && g.scores[me.id] !== undefined) { coinsAwarded = true; /* coins awarded server-side, just refresh user */ checkSession(); }
  const sb = snap.players.filter(p => g.scores[p.id] !== undefined).map(p => ({ ...p, score: g.scores[p.id] || 0 })).sort((a, b) => b.score - a.score);
  const c = $("final-scoreboard"); c.innerHTML = "";
  sb.forEach((p, i) => { const isMe = me && p.id === me.id; const m = i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`; const d = document.createElement("div"); d.className = `scoreboard-entry ${i===0?"scoreboard-winner":""} ${isMe?"scoreboard-me":""}`; d.innerHTML = `<span class="scoreboard-rank">${m}</span><span class="scoreboard-name">${esc(p.name)}${isMe?" (you)":""}</span><span class="scoreboard-score">${p.score} pts</span>`; c.appendChild(d); });
  const ba = $("back-lobby-area"); ba.hidden = !amHost;
}
$("back-lobby-btn").addEventListener("click", () => socket.emit("game:backToLobby"));

// === WORD SPY ===
function renderWSClueList(cid, clues, players, curId) {
  const l = $(cid); if (!l) return; l.innerHTML = "";
  for (const c of clues) { const p = players.find(x=>x.id===c.id); const li = document.createElement("li"); li.className = `clue-item ${c.clue==="(no clue)"?"no-clue":""} ${c.id===curId?"current-turn":""}`; li.innerHTML = `<span class="clue-author">${esc(p?.name||"???")}</span><span class="clue-text">${esc(c.clue)}</span>`; l.appendChild(li); }
}
function renderWSClues(snap) {
  $("phase-ws-clues").hidden = false; const g = snap.game;
  if (isSpectator) { $("ws-word-label").textContent = "Spectating 👻"; $("ws-word-text").textContent = "???"; $("ws-word-text").classList.remove("spy-word"); $("ws-category-text").textContent = `Category: ${g.category}`; $("ws-clue-input-area").hidden = true; }
  else if (myWord) { if (myWord.isSpy) { $("ws-word-label").textContent = "You are the SPY!"; $("ws-word-text").textContent = "???"; $("ws-word-text").classList.add("spy-word"); } else { $("ws-word-label").textContent = "Your word"; $("ws-word-text").textContent = myWord.word; $("ws-word-text").classList.remove("spy-word"); } $("ws-category-text").textContent = `Category: ${myWord.category}`; }
  const cp = g.turnOrder?.[g.currentTurn]; const cpn = snap.players.find(p=>p.id===cp); const isMy = me && cp === me.id && !isSpectator;
  const ti = $("ws-turn-indicator");
  if (g.currentTurn >= g.turnOrder.length) { ti.textContent = "All clues given!"; ti.classList.remove("your-turn"); $("ws-clue-input-area").hidden = true; }
  else if (isMy && !hasSubmittedClue) { ti.textContent = "YOUR TURN — give a clue!"; ti.classList.add("your-turn"); $("ws-clue-input-area").hidden = false; $("ws-clue-input").focus(); }
  else { ti.textContent = `${cpn?.name||"???"}'s turn...`; ti.classList.remove("your-turn"); $("ws-clue-input-area").hidden = true; }
  renderWSClueList("ws-clue-list", g.clues, snap.players, cp);
}
function renderWSDiscuss(snap) { $("phase-ws-discuss").hidden = false; const g = snap.game; if (myWord) { $("ws-discuss-word-label").textContent = myWord.isSpy?"You are the SPY!":"Your word"; $("ws-discuss-word-text").textContent = myWord.isSpy?"???":myWord.word; $("ws-discuss-category-text").textContent = `Category: ${myWord.category}`; } renderWSClueList("ws-discuss-clue-list", g.clues, snap.players, null); }
function renderWSVoting(snap) {
  $("phase-ws-voting").hidden = false; const g = snap.game;
  renderWSClueList("ws-voting-clue-list", g.clues, snap.players, null);
  const grid = $("ws-vote-grid"); grid.innerHTML = "";
  const done = isSpectator || hasSubmittedVote;
  for (const p of snap.players) {
    const isMe = me && p.id === me.id;
    const card = document.createElement("div"); card.className = `vote-card ${done?"disabled":""} ${isMe?"is-me":""}`;
    const clue = g.clues.find(c=>c.id===p.id)?.clue||"—";
    card.innerHTML = `<span class="vote-card-name">${esc(p.name)}${isMe?" (you)":""}</span><span class="vote-card-clue">"${esc(clue)}"</span>${!isMe&&!done?'<span class="vote-card-label">Vote</span>':""}`;
    if (!isMe && !done) card.addEventListener("click", () => { if (hasSubmittedVote) return; hasSubmittedVote = true; socket.emit("game:submitVote",{targetId:p.id}); grid.querySelectorAll(".vote-card").forEach(c=>c.classList.add("disabled")); card.classList.remove("disabled"); card.classList.add("voted"); $("ws-vote-waiting").hidden = false; });
    grid.appendChild(card);
  }
  if (done) { $("ws-vote-waiting").hidden = false; $("ws-votes-progress").textContent = `${g.votesSubmitted.length}/${g.playerCount}`; } else $("ws-vote-waiting").hidden = true;
}
function renderWSSpyGuess(snap) {
  $("phase-ws-spyguess").hidden = false; const g = snap.game;
  $("ws-spyguess-category").textContent = `Category: ${g.category}`;
  const amSpy = me && g.spyId === me.id;
  if (amSpy && !hasSubmittedSpyGuess && !isSpectator) { $("ws-spyguess-instruction").textContent = "You were caught! Guess the word to still win!"; $("ws-guess-input-area").hidden = false; $("ws-guess-waiting").hidden = true; $("ws-guess-input").focus(); }
  else { $("ws-guess-input-area").hidden = true; $("ws-guess-waiting").hidden = false; $("ws-guess-waiting-text").textContent = amSpy ? "Guess submitted..." : "Waiting for Spy's guess..."; }
}
function renderWSResults(snap) {
  $("phase-ws-results").hidden = false; const g = snap.game, amHost = me && snap.hostId === me.id;
  let cls, detail;
  if (g.spyCaught && !g.spyGuessedCorrectly) { cls = "spy-caught"; detail = "Caught — couldn't guess the word!"; }
  else if (g.spyCaught && g.spyGuessedCorrectly) { cls = "spy-guessed"; detail = `Caught but guessed "${esc(g.word)}"! Spy wins!`; }
  else { cls = "spy-escaped"; detail = "Blended in perfectly!"; }
  $("ws-result-reveal").innerHTML = `<div class="ws-result-card ${cls}"><div class="ws-result-label">The Spy was</div><div class="ws-result-name">${esc(g.spyName||"???")}</div><div class="ws-result-detail">${detail}</div></div>`;
  $("ws-word-reveal").innerHTML = `<div class="ws-word-reveal-label">The word was</div><div class="ws-word-reveal-word">${esc(g.word)}</div><div class="ws-word-reveal-cat">Category: ${esc(g.category)}</div>`;
  renderScoreTable($("ws-round-scores"), snap, g, "spyId", "🕵️");
  const na = $("ws-next-round-area"); if (amHost) { na.hidden = false; $("ws-next-round-btn").textContent = g.round >= g.totalRounds ? "🏆 See Final Scores" : "Next Round →"; } else na.hidden = true;
}
$("ws-clue-submit").addEventListener("click", () => { const i = $("ws-clue-input"); const c = i.value.trim(); if (!c||hasSubmittedClue) return; hasSubmittedClue=true; socket.emit("game:submitClue",{clue:c}); i.value=""; $("ws-clue-input-area").hidden=true; });
$("ws-clue-input").addEventListener("keydown", e => { if (e.key==="Enter"){e.preventDefault();$("ws-clue-submit").click();} });
$("ws-guess-submit").addEventListener("click", () => { const i=$("ws-guess-input"); const g=i.value.trim(); if(!g||hasSubmittedSpyGuess)return; hasSubmittedSpyGuess=true; socket.emit("game:spyGuess",{guess:g}); i.value=""; $("ws-guess-input-area").hidden=true; $("ws-guess-waiting").hidden=false; });
$("ws-guess-input").addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();$("ws-guess-submit").click();} });
$("ws-next-round-btn").addEventListener("click", () => socket.emit("game:nextRound"));

// === CHAIN ===
function renderChainBuilding(snap) {
  $("phase-chain-building").hidden = false; const g = snap.game;
  if (isSpectator) { $("chain-role-label").textContent = "Spectating 👻"; $("chain-role-text").textContent = ""; $("chain-word-input-area").hidden = true; $("chain-accuse-area").hidden = true; }
  else if (myChainRole) { if (myChainRole.isSaboteur) { $("chain-role-label").textContent = "You are the SABOTEUR!"; $("chain-role-text").innerHTML = `Sneak in: <span class="chain-target-word">${esc(myChainRole.targetWord)}</span>`; $("chain-role-text").classList.add("saboteur"); } else { $("chain-role-label").textContent = "Builder"; $("chain-role-text").textContent = "Add words. Watch for the Saboteur!"; $("chain-role-text").classList.remove("saboteur"); } }
  const se = $("chain-sentence-display"); se.innerHTML = `<span class="chain-starter">${esc(g.starter)}</span> `;
  for (let i = 0; i < g.sentence.length; i++) { const e = g.sentence[i]; const sp = document.createElement("span"); sp.className = `chain-word ${i===g.sentence.length-1?"new-word":""} ${e.word==="..."?"skipped":""}`; sp.textContent = e.word+" "; se.appendChild(sp); }
  const ato = g.turnOrder.filter(id => snap.players.some(p=>p.id===id));
  const cp = ato.length > 0 ? ato[g.currentTurn % ato.length] : null;
  const cpn = snap.players.find(p=>p.id===cp); const isMy = me && cp === me.id && !isSpectator;
  const ti = $("chain-turn-indicator");
  if (isMy) { ti.textContent = "YOUR TURN — add a word!"; ti.classList.add("your-turn"); $("chain-word-input-area").hidden = false; $("chain-word-input").focus(); }
  else { ti.textContent = `${cpn?.name||"???"}'s turn...`; ti.classList.remove("your-turn"); $("chain-word-input-area").hidden = true; }
  $("chain-word-count").textContent = `${g.sentence.length}/20 words`;
  if (!isSpectator && !hasAccused && g.sentence.length >= 2) {
    $("chain-accuse-area").hidden = false; const gr = $("chain-accuse-grid"); gr.innerHTML = "";
    for (const p of snap.players) { if (me && p.id === me.id) continue; const b = document.createElement("button"); b.className = "chain-accuse-btn"; b.textContent = `Accuse ${p.name}`; b.addEventListener("click", () => { if (hasAccused) return; if (!confirm(`Accuse ${p.name}? Ends the round!`)) return; hasAccused=true; socket.emit("game:chainAccuse",{accusedId:p.id}); $("chain-accuse-area").hidden=true; }); gr.appendChild(b); }
  } else $("chain-accuse-area").hidden = true;
}
function renderChainResults(snap) {
  $("phase-chain-results").hidden = false; const g = snap.game, amHost = me && snap.hostId === me.id;
  let cls, detail;
  if (g.accusation?.accuserId && g.accusationCorrect) { const an = snap.players.find(p=>p.id===g.accusation.accuserId)?.name||"???"; cls="spy-caught"; detail=`${an} correctly caught ${g.saboteurName}!`; }
  else if (g.accusation?.accuserId && !g.accusationCorrect) { const an = snap.players.find(p=>p.id===g.accusation.accuserId)?.name||"???"; const wn = snap.players.find(p=>p.id===g.accusation.accusedId)?.name||"???"; cls="spy-escaped"; detail=`${an} accused ${wn}... wrong! ${g.saboteurName} was it!`; }
  else if (g.wordSneakedIn) { cls="spy-guessed"; detail=`${g.saboteurName} sneaked in "${g.targetWord}"!`; }
  else { cls="spy-caught"; detail=`${g.saboteurName} couldn't sneak "${g.targetWord}" in`; }
  $("chain-result-reveal").innerHTML = `<div class="ws-result-card ${cls}"><div class="ws-result-name">${esc(detail)}</div></div>`;
  const sf = $("chain-sentence-final"); const tl = g.targetWord?.toLowerCase()||"";
  let sh = `<span class="chain-starter">${esc(g.starter)}</span> `;
  for (const e of g.sentence) { sh += e.word.toLowerCase()===tl ? `<span class="chain-target-inline">${esc(e.word)}</span> ` : e.word==="..." ? `<span style="color:var(--ink3);font-style:italic">...</span> ` : `${esc(e.word)} `; }
  sf.innerHTML = sh;
  const rs = $("chain-round-scores"); rs.innerHTML = "<h4 class='scores-subtitle'>This round</h4>";
  const t = document.createElement("div"); t.className = "scores-table";
  for (const p of snap.players) { const d=g.roundScoreDeltas?.[p.id]||0,tot=g.scores?.[p.id]||0,isSab=p.id===g.saboteurId; const row=document.createElement("div"); row.className=`score-row ${isSab?"score-row-offkey":""} ${me&&p.id===me.id?"score-row-me":""}`; row.innerHTML=`<span class="score-name">${esc(p.name)}${isSab?" ⛓️":""}</span><span class="score-delta ${d>0?"delta-pos":d<0?"delta-neg":""}">${d>0?"+"+d:d===0?"—":d}</span><span class="score-total">${tot} pts</span>`; t.appendChild(row); }
  rs.appendChild(t);
  const na = $("chain-next-round-area"); if (amHost) { na.hidden = false; $("chain-next-round-btn").textContent = g.round >= g.totalRounds ? "🏆 See Final Scores" : "Next Round →"; } else na.hidden = true;
}
$("chain-word-submit").addEventListener("click", () => { const i=$("chain-word-input"); const w=i.value.trim().split(/\s+/)[0]; if(!w)return; socket.emit("game:chainWord",{word:w}); i.value=""; });
$("chain-word-input").addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();$("chain-word-submit").click();} if(e.key===" ")e.preventDefault(); });
$("chain-next-round-btn").addEventListener("click", () => socket.emit("game:nextRound"));

// === RATING PICKER ===
document.querySelectorAll(".rating-btn").forEach(b => { b.addEventListener("click", () => { if(hasSubmittedRating)return; selectedRating=Number(b.dataset.val); document.querySelectorAll(".rating-btn").forEach(x=>x.classList.toggle("selected",Number(x.dataset.val)===selectedRating)); $("submit-rating-btn").disabled=false; }); });
$("submit-rating-btn").addEventListener("click", () => { if(selectedRating===null||hasSubmittedRating)return; hasSubmittedRating=true; $("submit-rating-btn").disabled=true; $("submit-rating-btn").textContent="Locked in!"; document.querySelectorAll(".rating-btn").forEach(b=>b.disabled=true); socket.emit("game:submitRating",{rating:selectedRating}); $("rating-submit-area").hidden=true; $("rating-waiting").hidden=false; });

// ============================================================
//   CHAT
// ============================================================
function renderChat(hist) { const m=$("chat-messages"); m.innerHTML=""; for (const msg of hist) addChat(msg); scrollChat(); }
function addChat(msg) {
  ["chat-messages","game-chat-messages"].forEach(id => { const c=$(id); if(!c)return; const li=document.createElement("li"); if(msg.system){li.className="chat-system";li.textContent=`— ${msg.text} —`;} else { const isH=currentRoom&&msg.playerId===currentRoom.hostId; li.innerHTML=`<span class="chat-author ${isH?"host-author":""}">${esc(msg.name)}:</span><span class="chat-text">${esc(msg.text)}</span>`; } c.appendChild(li); });
}
function scrollChat() { ["chat-messages","game-chat-messages"].forEach(id => { const e=$(id); if(e) e.scrollTop=e.scrollHeight; }); }
function syncChat() { const s=$("chat-messages"),d=$("game-chat-messages"); if(s&&d){d.innerHTML=s.innerHTML;d.scrollTop=d.scrollHeight;} }
function sendChat(inp) { const t=inp.value.trim(); if(!t)return; socket.emit("chat:send",{text:t}); inp.value=""; }
$("chat-form").addEventListener("submit", e => { e.preventDefault(); sendChat($("chat-input")); });
$("game-chat-form").addEventListener("submit", e => { e.preventDefault(); sendChat($("game-chat-input")); });

// ============================================================
//   SOCKET EVENTS
// ============================================================
socket.on("room:update", snap => {
  const prevRound = currentRoom?.game?.round, prevPhase = currentRoom?.game?.phase;
  currentRoom = snap; renderRoom(snap);
  if (snap.game) {
    const ph = snap.game.phase;
    if (ph === "prompting" && (snap.game.round !== prevRound || prevPhase !== "prompting")) { hasSubmittedRating=false;hasSubmittedVote=false;selectedRating=null;$("submit-rating-btn").textContent="Lock in";document.querySelectorAll(".rating-btn").forEach(b=>{b.classList.remove("selected");b.disabled=false;}); }
    if (ph === "voting" && prevPhase !== "voting") hasSubmittedVote = false;
    if (ph === "ws-clues" && (snap.game.round !== prevRound || prevPhase !== "ws-clues")) { hasSubmittedClue=false;hasSubmittedVote=false;hasSubmittedSpyGuess=false; }
    if (ph === "ws-voting" && prevPhase !== "ws-voting") hasSubmittedVote = false;
    if (ph === "chain-building" && (snap.game.round !== prevRound || prevPhase !== "chain-building")) hasAccused = false;
    if (ph === "echo-submit" && (snap.game.round !== prevRound || prevPhase !== "echo-submit")) { hasSubmittedEchoAnswer = false; hasSubmittedVote = false; }
    if (ph === "echo-voting" && prevPhase !== "echo-voting") hasSubmittedVote = false;
    switchToGame(snap);
  } else { resetRoomState(); showPage("page-room"); /* stay in room lobby */ }
});
socket.on("game:yourPrompt", ({ prompt }) => { myPrompt = prompt; $("prompt-text").textContent = prompt; });
socket.on("game:echoPrompt", ({ prompt, isEcho }) => { myEchoPrompt = prompt; hasSubmittedEchoAnswer = false; });
socket.on("game:yourWord", ({ word, category, isSpy }) => { myWord = { word, category, isSpy }; hasSubmittedClue=false;hasSubmittedSpyGuess=false; });
socket.on("game:yourChainRole", ({ isSaboteur, targetWord, starter }) => { myChainRole = { isSaboteur, targetWord, starter }; hasAccused=false; });
socket.on("chat:message", msg => { addChat(msg); scrollChat(); });
socket.on("room:kicked", ({ by }) => { $("kicked-by").textContent = by ? `(by ${by})` : ""; resetRoomState(); showPage("page-kicked"); });
socket.on("disconnect", () => { if (me) { resetRoomState(); showPage("page-dashboard"); } });
socket.on("kicked", ({ reason }) => { showAnnouncement("You've been kicked: " + (reason || "No reason"), "danger"); setTimeout(() => location.reload(), 2500); });
socket.on("banned", ({ reason }) => { showAnnouncement("You've been banned: " + (reason || "No reason"), "danger"); setTimeout(() => location.reload(), 2500); });

// ============================================================
//   ARCADE
// ============================================================
let currentArcade = null;
document.querySelectorAll(".arcade-card").forEach(c => {
  c.addEventListener("click", () => {
    const gameId = c.dataset.arcade;
    const game = window.ArcadeGames?.[gameId];
    if (!game) return;
    if (currentArcade) currentArcade.cleanup?.();
    $("arcade-play-area").hidden = false;
    document.querySelector(".arcade-grid").hidden = true;
    const container = $("arcade-game-container"); container.innerHTML = "";
    currentArcade = game;
    game.init(container, async (score, elapsed) => {
      // Submit score to server
      try {
        const res = await fetch("/api/arcade/score", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({game:gameId, score, elapsed}) });
        const data = await res.json();
        if (data.user) { user = data.user; updateUI(); }
      } catch {}
    });
  });
});
$("arcade-back").addEventListener("click", () => {
  if (currentArcade) currentArcade.cleanup?.();
  currentArcade = null;
  $("arcade-play-area").hidden = true;
  document.querySelector(".arcade-grid").hidden = false;
  $("arcade-game-container").innerHTML = "";
});

// ============================================================
//   SHOP
// ============================================================
async function loadShop() {
  const shopPage = $("page-shop");
  const scrollY = shopPage ? shopPage.scrollTop || window.scrollY : 0;
  try {
    const res = await fetch("/api/shop");
    const data = await res.json();
    if (data.user) { user = data.user; updateUI(); }
    renderShop(data.items, data.user);
    // Restore scroll position after rebuild
    requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
  } catch {}
}
function renderShop(items, u) {
  $("shop-coins").textContent = "🪙 " + (u?.coins || 0);
  const container = $("shop-content"); container.innerHTML = "";
  const owned = u?.ownedItems || ["default","none"];
  // Colors
  const cs = document.createElement("div"); cs.className = "shop-category";
  cs.innerHTML = `<div class="shop-cat-title">Name Colors</div>`;
  const cg = document.createElement("div"); cg.className = "shop-grid";
  for (const c of items.colors) {
    if (c.id === "default") continue;
    const o = owned.includes(c.id), eq = u?.nameColor === c.id, af = (u?.coins||0) >= c.price;
    const d = document.createElement("div"); d.className = `shop-item ${o?"owned":""} ${eq?"equipped":""} ${!o&&!af?"too-exp":""}`;
    d.innerHTML = `<div class="shop-preview" style="${c.gradient?`background:${c.color};-webkit-background-clip:text;background-clip:text;color:transparent;`:`color:${c.color};`}">Aa</div><div class="shop-name">${c.name}</div>${o?(eq?'<div class="shop-status" style="color:var(--accent)">equipped</div>':'<div class="shop-status" style="color:var(--success)">owned</div>'):`<div class="shop-price">${c.price}</div>`}`;
    d.addEventListener("click", async () => {
      if (o) { await fetch("/api/shop/equip",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"color",itemId:c.id})}); }
      else if (af) { await fetch("/api/shop/buy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:c.id})}); }
      else return;
      loadShop();
    });
    cg.appendChild(d);
  }
  cs.appendChild(cg); container.appendChild(cs);
  // Titles
  const ts = document.createElement("div"); ts.className = "shop-category";
  ts.innerHTML = `<div class="shop-cat-title">Titles</div>`;
  const tg = document.createElement("div"); tg.className = "shop-grid";
  for (const t of items.titles) {
    if (t.id === "none") continue;
    const o = owned.includes(t.id), eq = u?.title === t.id, af = (u?.coins||0) >= t.price;
    const d = document.createElement("div"); d.className = `shop-item ${o?"owned":""} ${eq?"equipped":""} ${!o&&!af?"too-exp":""}`;
    d.innerHTML = `<div class="shop-preview" style="font-size:14px">🏷️</div><div class="shop-name">${t.name}</div>${o?(eq?'<div class="shop-status" style="color:var(--accent)">equipped</div>':'<div class="shop-status" style="color:var(--success)">owned</div>'):`<div class="shop-price">${t.price}</div>`}`;
    d.addEventListener("click", async () => {
      if (o) { await fetch("/api/shop/equip",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"title",itemId:t.id})}); }
      else if (af) { await fetch("/api/shop/buy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:t.id})}); }
      else return;
      loadShop();
    });
    tg.appendChild(d);
  }
  ts.appendChild(tg); container.appendChild(ts);

  // Borders
  if (items.borders) {
    const bs = document.createElement('div'); bs.className = 'shop-category';
    bs.innerHTML = '<div class="shop-cat-title">Profile Borders</div>';
    const bg = document.createElement('div'); bg.className = 'shop-grid';
    for (const b of items.borders) {
      if (b.id === "none") continue;
      const o = owned.includes(b.id), eq = u?.pfpBorder === b.id, af = (u?.coins||0) >= b.price;
      const d = document.createElement('div');
      d.className = `shop-item ${o?"owned":""} ${eq?"equipped":""} ${!o&&!af?"too-exp":""}`;
      d.innerHTML = `<div class="shop-preview"><span class="pfp-circle" style="box-shadow:${b.style};font-size:20px;padding:4px;display:inline-block;border-radius:50%">😎</span></div><div class="shop-name">${b.name}</div>${o?(eq?'<div class="shop-status" style="color:var(--accent)">equipped</div>':'<div class="shop-status" style="color:var(--success)">owned</div>'):`<div class="shop-price">${b.price}</div>`}`;
      d.addEventListener('click', async () => {
        if (o) { await fetch("/api/profile/border",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({border:b.id})}); }
        else if (af) { await fetch("/api/shop/buy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:b.id})}); }
        else return;
        loadShop();
      });
      bg.appendChild(d);
    }
    bs.appendChild(bg); container.appendChild(bs);
  }
}

// ============================================================
//   SETTINGS
// ============================================================
function loadSettings() {
  const ss = $("settings-stats"); if (!user) return;
  ss.innerHTML = `<div class="ss-item"><div class="ss-val">${user.coins}</div><div class="ss-lbl">Coins</div></div><div class="ss-item"><div class="ss-val">${user.gamesPlayed}</div><div class="ss-lbl">Games Played</div></div><div class="ss-item"><div class="ss-val">${user.gamesWon}</div><div class="ss-lbl">Games Won</div></div><div class="ss-item"><div class="ss-val">${user.totalPoints}</div><div class="ss-lbl">Total Points</div></div>`;
}
$("form-password").addEventListener("submit", async e => {
  e.preventDefault(); $("password-error").textContent = ""; $("password-ok").textContent = "";
  const fd = new FormData(e.target);
  try {
    const res = await fetch("/api/settings/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:fd.get("current"),newPassword:fd.get("newpass")})});
    const data = await res.json();
    if (!res.ok) $("password-error").textContent = data.error;
    else { $("password-ok").textContent = "Password updated!"; e.target.reset(); }
  } catch { $("password-error").textContent = "Network error"; }
});

// ============================================================
//   UTILS
// ============================================================
function esc(s) { const d=document.createElement("div"); d.textContent=s??""; return d.innerHTML; }
const ci = document.querySelector(".code-input");
if (ci) ci.addEventListener("input", e => { e.target.value = e.target.value.toUpperCase(); });

// ============================================================
//   INIT
// ============================================================

// Poppable bubbles
(function spawnPopBubbles() {
  const container = document.getElementById('pop-bubbles');
  if (!container) return;
  function spawn() {
    const b = document.createElement('div');
    b.className = 'pop-bubble';
    const size = 20 + Math.random() * 50;
    b.style.width = size + 'px'; b.style.height = size + 'px';
    b.style.left = (Math.random() * 100) + '%';
    b.style.bottom = '-' + size + 'px';
    b.style.animationDuration = (14 + Math.random() * 12) + 's';
    b.style.animationDelay = '0s';
    b.addEventListener('click', () => {
      b.style.animation = 'popBurst 0.3s ease-out forwards';
      b.style.pointerEvents = 'none';
      setTimeout(() => b.remove(), 350);
    });
    container.appendChild(b);
    setTimeout(() => { if (b.parentNode) b.remove(); }, 28000);
  }
  setInterval(spawn, 2500);
  for (let i = 0; i < 4; i++) setTimeout(spawn, i * 600);
})();

// Fake news
async function loadFakeNews() {
  try {
    const res = await fetch('/api/fakenews');
    const data = await res.json();
    const el = document.getElementById('fake-news-text');
    if (el) el.textContent = data.headline;
  } catch {}
}
// News ticker — load multiple headlines
async function loadTicker() {
  try {
    const headlines = [];
    for (let i = 0; i < 6; i++) {
      const res = await fetch('/api/fakenews');
      const data = await res.json();
      if (data.headline && !headlines.includes(data.headline)) headlines.push(data.headline);
    }
    const tickerEl = document.getElementById('ticker-text');
    if (tickerEl && headlines.length > 0) {
      const joined = headlines.join('  ·  ');
      tickerEl.textContent = joined;
      // Adjust speed based on length
      const dur = Math.max(20, joined.length * 0.25);
      tickerEl.style.setProperty('--ticker-dur', dur + 's');
    }
  } catch {}
}
loadTicker(); setInterval(loadTicker, 120000); // refresh every 2 min
const fnBtn = document.getElementById('fake-news-refresh');
if (fnBtn) fnBtn.addEventListener('click', loadFakeNews);

// Staff check
let isStaffUser = false, isModUser = false, isOwnerUser = false;
async function checkStaff() {
  try {
    const res = await fetch('/api/staff/check');
    const data = await res.json();
    isOwnerUser = data.isOwner;
    isStaffUser = data.isStaff;
    isModUser = data.isMod;
    const link = document.getElementById('nav-staff-link');
    if (link) link.hidden = !(data.isStaff || data.isMod);
    if (data.isStaff || data.isMod) document.body.classList.add('is-staff');
    else document.body.classList.remove('is-staff');
    if (data.isOwner) document.body.classList.add('is-owner');
    else document.body.classList.remove('is-owner');
  } catch {}
}

// Leaderboard
async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const c = document.getElementById('leaderboard-content');
    if (!c) return;
    c.innerHTML = '<div class="lb-table"></div>';
    const t = c.querySelector('.lb-table');
    data.leaderboard.forEach((p, i) => {
      const isMe = user && p.username.toLowerCase() === user.username.toLowerCase();
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      const row = document.createElement('div');
      row.className = `lb-row ${i < 3 ? 'lb-top' : ''} ${isMe ? 'lb-me' : ''}`;
      row.innerHTML = `<span class="lb-rank">${rank}</span><span class="lb-name">${esc(p.username)}${isMe ? ' (you)' : ''}</span><span class="lb-val">${p.totalPoints} pts</span><span class="lb-label">🪙 ${p.coins}</span>`;
      t.appendChild(row);
    });
    if (data.leaderboard.length === 0) c.innerHTML = '<p style="color:var(--ink3);text-align:center">No players yet. Be the first!</p>';
  } catch {}
}

// Staff panel
const staffCoinsBtn = document.getElementById('staff-coins-btn');
if (staffCoinsBtn) staffCoinsBtn.addEventListener('click', async () => {
  const u = document.getElementById('staff-coins-user').value.trim();
  const a = document.getElementById('staff-coins-amount').value;
  const msg = document.getElementById('staff-coins-msg');
  msg.textContent = '';
  try {
    const res = await fetch('/api/staff/givecoins', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({username:u, amount:Number(a)}) });
    const data = await res.json();
    msg.textContent = data.message || data.error;
    msg.style.color = res.ok ? 'var(--success)' : 'var(--danger)';
  } catch { msg.textContent = 'Network error'; }
});

const staffEventBtn = document.getElementById('staff-event-btn');
if (staffEventBtn) staffEventBtn.addEventListener('click', async () => {
  const ev = document.getElementById('staff-event-select').value;
  const msg = document.getElementById('staff-event-msg');
  try {
    const res = await fetch('/api/staff/event', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({event:ev}) });
    const data = await res.json();
    msg.textContent = data.event ? `Event set: ${data.event}` : 'Event cleared';
    msg.style.color = 'var(--success)';
  } catch { msg.textContent = 'Error'; }
});

const staffBroadcastBtn = document.getElementById('staff-broadcast-btn');
if (staffBroadcastBtn) staffBroadcastBtn.addEventListener('click', async () => {
  const text = document.getElementById('staff-broadcast-text').value.trim();
  if (!text) return;
  await fetch('/api/staff/broadcast', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({message:text}) });
  document.getElementById('staff-broadcast-text').value = '';
});

const staffLookupBtn = document.getElementById('staff-lookup-btn');
if (staffLookupBtn) staffLookupBtn.addEventListener('click', async () => {
  const u = document.getElementById('staff-lookup-user').value.trim();
  const r = document.getElementById('staff-lookup-result');
  try {
    const res = await fetch(`/api/staff/lookup?username=${encodeURIComponent(u)}`);
    const data = await res.json();
    if (data.user) {
      const p = data.user;
      let statusBadges = '';
      if (p.isBanned) statusBadges += '<span class="staff-user-badge banned">Banned</span> ';
      if (p.isStaff) statusBadges += '<span class="staff-user-badge" style="background:rgba(255,215,0,0.15);color:#ffd700">Staff</span> ';
      if (p.isMod) statusBadges += '<span class="staff-user-badge mod">Mod</span> ';
      if (p.mutedUntil && p.mutedUntil > Date.now()) {
        const mins = Math.ceil((p.mutedUntil - Date.now()) / 60000);
        statusBadges += `<span class="staff-user-badge muted">Muted ${mins}m</span> `;
      }
      r.innerHTML = `<div style="padding:10px;background:var(--neo);border-radius:10px;margin-top:8px"><strong>${esc(p.username)}</strong> ${statusBadges}<br>🪙 ${p.coins} coins · 🎮 ${p.gamesPlayed} games · 🏆 ${p.gamesWon} wins · ⭐ ${p.totalPoints} pts<br>Color: ${p.nameColor} · Title: ${p.title}<br>Owned: ${p.ownedItems.join(', ')}</div>`;
    } else r.innerHTML = `<p style="color:var(--danger)">Not found</p>`;
  } catch { r.innerHTML = 'Error'; }
});

// Site events (socket)
socket.on('site:event', ({ event }) => {
  document.body.classList.remove('chaos-mode');
  const existing = document.querySelector('.event-banner');
  if (existing) existing.remove();
  if (!event) return;
  const names = { 'double-coins': '🪙 DOUBLE COINS ACTIVE!', 'happy-hour': '🎉 HAPPY HOUR — 1.5x Coins!', 'chaos-mode': '🌀 CHAOS MODE' };
  const banner = document.createElement('div');
  banner.className = 'event-banner';
  banner.textContent = names[event] || event;
  document.body.prepend(banner);
  if (event === 'chaos-mode') document.body.classList.add('chaos-mode');
});

socket.on('site:broadcast', ({ message, from }) => {
  showAnnouncement(`📢 ${from}: ${message}`, 'broadcast');
});

socket.on('site:userEvent', ({ event, user: who }) => {
  if (event === 'nuke-ui') {
    document.querySelectorAll('.glass-card, .btn, .nav-link, .dash-card').forEach(el => {
      el.style.transition = 'all 1.5s cubic-bezier(0.55, 0, 1, 0.45)';
      el.style.transform = `translateY(${window.innerHeight + 200}px) rotate(${Math.random()*60-30}deg)`;
      el.style.opacity = '0';
    });
    setTimeout(() => {
      document.querySelectorAll('.glass-card, .btn, .nav-link, .dash-card').forEach(el => {
        el.style.transition = 'all 0.5s ease-out';
        el.style.transform = '';
        el.style.opacity = '';
      });
    }, 4000);
  }
  if (event === 'confetti') {
    for (let i = 0; i < 80; i++) {
      const c = document.createElement('div');
      const colors = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6bea','#ff8c00'];
      c.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}%;width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random()>.5?'50%':'2px'};z-index:9999;pointer-events:none;animation:confettiFall ${2+Math.random()*3}s linear forwards`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 5500);
    }
  }
  if (event === 'rename-site') {
    const name = prompt(`${who} is renaming the site! (This would prompt on their end — for now it's a demo)`);
    // In a real implementation, this would broadcast the new name
  }
});

// Check for active event on load
async function checkSiteEvent() {
  try {
    const res = await fetch('/api/staff/event');
    const data = await res.json();
    if (data.event) socket.emit(''); // trigger will come from server
  } catch {}
}

// Confetti animation
const confettiStyle = document.createElement('style');
confettiStyle.textContent = '@keyframes confettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}';
document.head.appendChild(confettiStyle);

// Add events section to shop
const origLoadShop = loadShop;
loadShop = async function() {
  await origLoadShop();
  // Append events section
  const container = document.getElementById('shop-content');
  if (!container) return;
  try {
    const res = await fetch('/api/shop');
    const data = await res.json();
    if (!data.items?.events) return;
    const es = document.createElement('div');
    es.className = 'shop-category';
    es.innerHTML = '<div class="shop-cat-title">🎪 Site Events (one-time use)</div>';
    const eg = document.createElement('div');
    eg.className = 'shop-grid';
    for (const e of data.items.events) {
      const af = (data.user?.coins || 0) >= e.price;
      const d = document.createElement('div');
      d.className = `shop-item ${!af ? 'too-exp' : ''}`;
      d.innerHTML = `<div class="shop-preview">🎪</div><div class="shop-name">${e.name}</div><div class="shop-price">${e.price}</div>`;
      d.addEventListener('click', async () => {
        if (!af) return;
        if (!confirm(`Spend ${e.price} coins on "${e.name}"? This triggers immediately for everyone!`)) return;
        await fetch('/api/shop/event', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({eventId:e.id}) });
        loadShop();
      });
      eg.appendChild(d);
    }
    es.appendChild(eg);
    container.appendChild(es);
  } catch {}
};

// ============================================================
//   ECHO RENDERING
// ============================================================
function renderEchoSubmit(snap) {
  $("phase-echo-submit").hidden = false; const g = snap.game;
  $("echo-prompt-text").textContent = myEchoPrompt || "Loading...";
  if (hasSubmittedEchoAnswer || isSpectator) {
    $("echo-answer-area").hidden = true; $("echo-submit-waiting").hidden = false;
    $("echo-answers-progress").textContent = `${g.answersSubmitted?.length||0}/${g.playerCount}`;
  } else {
    $("echo-answer-area").hidden = false; $("echo-submit-waiting").hidden = true;
    $("echo-answer-input").focus();
  }
}
function renderEchoDiscuss(snap) {
  $("phase-echo-discuss").hidden = false; const g = snap.game;
  const container = $("echo-answers-reveal"); container.innerHTML = "";
  for (const a of (g.shuffledAnswers || [])) {
    const card = document.createElement("div"); card.className = "rating-card";
    card.innerHTML = `<div class="rating-card-info"><span class="rating-card-name" style="font-style:italic">"${esc(a.text)}"</span></div>`;
    container.appendChild(card);
  }
}
function renderEchoVoting(snap) {
  $("phase-echo-voting").hidden = false; const g = snap.game;
  const grid = $("echo-vote-grid"); grid.innerHTML = "";
  const done = isSpectator || hasSubmittedVote;
  for (const a of (g.shuffledAnswers || [])) {
    const isMe = me && a.id === me.id;
    const card = document.createElement("div");
    card.className = `vote-card ${done?"disabled":""} ${isMe?"is-me":""}`;
    card.innerHTML = `<span class="vote-card-name" style="font-style:italic">"${esc(a.text)}"</span>${!isMe&&!done?'<span class="vote-card-label">This one</span>':""}`;
    if (!isMe && !done) card.addEventListener("click", () => {
      if (hasSubmittedVote) return; hasSubmittedVote = true;
      socket.emit("game:submitVote", { targetId: a.id });
      grid.querySelectorAll(".vote-card").forEach(c => c.classList.add("disabled"));
      card.classList.remove("disabled"); card.classList.add("voted");
      $("echo-vote-waiting").hidden = false;
    });
    grid.appendChild(card);
  }
  if (done) { $("echo-vote-waiting").hidden = false; $("echo-votes-progress").textContent = `${g.votesSubmitted?.length||0}/${g.playerCount}`; }
}
function renderEchoResults(snap) {
  $("phase-echo-results").hidden = false; const g = snap.game, amHost = me && snap.hostId === me.id;
  const echoName = g.echoName || "???";
  const caught = Object.values(g.revealedVotes || {}).some(v => v === g.echoId);
  $("echo-result-reveal").innerHTML = `<div class="ws-result-card ${caught?"spy-caught":"spy-escaped"}"><div class="ws-result-label">The Echo was</div><div class="ws-result-name">${esc(echoName)}</div><div class="ws-result-detail">${caught?"Caught!":"Blended in!"}</div></div>`;
  $("echo-prompts-compare").innerHTML = `<div class="prompt-compare-grid"><div class="prompt-compare-card"><span class="prompt-compare-label">Normal prompt</span><p class="prompt-compare-text">${esc(g.normalPrompt)}</p></div><div class="prompt-compare-card offkey-prompt"><span class="prompt-compare-label">Echo prompt</span><p class="prompt-compare-text">${esc(g.echoPrompt)}</p></div></div>`;
  renderScoreTable($("echo-round-scores"), snap, g, "echoId", "🔊");
  const na = $("echo-next-area"); if (amHost) { na.hidden = false; $("echo-next-btn").textContent = g.round >= g.totalRounds ? "🏆 See Final Scores" : "Next Round →"; } else na.hidden = true;
}
$("echo-answer-btn").addEventListener("click", () => {
  const inp = $("echo-answer-input"); const text = inp.value.trim();
  if (!text || hasSubmittedEchoAnswer) return;
  hasSubmittedEchoAnswer = true;
  socket.emit("game:echoAnswer", { text });
  inp.value = ""; $("echo-answer-area").hidden = true; $("echo-submit-waiting").hidden = false;
});
$("echo-answer-input").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); $("echo-answer-btn").click(); } });
$("echo-next-btn").addEventListener("click", () => socket.emit("game:nextRound"));

// ============================================================
//   ROOM BROWSER
// ============================================================
let roomFilter = "all";
async function loadRoomBrowser() {
  try {
    const res = await fetch("/api/rooms");
    const data = await res.json();
    renderRoomBrowser(data.rooms || []);
  } catch {}
}
function renderRoomBrowser(roomList) {
  const container = $("room-browser"); if (!container) return;
  const filtered = roomFilter === "all" ? roomList : roomList.filter(r => r.mode === roomFilter);
  if (filtered.length === 0) {
    container.innerHTML = `<p style="color:var(--ink3);text-align:center;padding:12px">No ${roomFilter === "all" ? "" : roomFilter + " "}rooms open. Create one!</p>`;
    return;
  }
  container.innerHTML = "";
  for (const r of filtered) {
    const card = document.createElement("div");
    card.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--neo);border-radius:10px;margin-bottom:6px;box-shadow:inset 1px 1px 3px var(--neo-lo),inset -1px -1px 3px var(--neo-hi);cursor:pointer;transition:all 0.15s";
    card.innerHTML = `
      <span style="font-weight:800;font-size:18px;color:var(--deep);letter-spacing:3px;min-width:70px">${r.code}</span>
      <span style="flex:1;font-weight:600;color:var(--ink)">${esc(r.hostName)}'s room</span>
      <span style="font-size:12px;color:var(--ink3)">${r.mode || "no game"}</span>
      <span style="font-size:12px;color:var(--mid)">${r.playerCount}/12</span>
      ${r.inGame ? '<span style="font-size:11px;color:var(--warn);font-weight:700">IN GAME</span>' : '<span style="font-size:11px;color:var(--success);font-weight:700">OPEN</span>'}
    `;
    card.addEventListener("click", () => {
      const nameInp = $("join-name-input");
      const name = nameInp?.value?.trim() || user?.username || "Player";
      socket.emit("room:join", { name, code: r.code }, resp => {
        if (resp?.error) { showAnnouncement(resp.error, 'danger', 5000); return; }
        me = resp.you; isSpectator = !!resp.spectator; enterRoom(resp.snapshot, resp.chat);
      });
    });
    card.addEventListener("mouseenter", () => card.style.transform = "translateY(-1px)");
    card.addEventListener("mouseleave", () => card.style.transform = "");
    container.appendChild(card);
  }
}
const refreshRoomsBtn = document.getElementById("refresh-rooms-btn");
if (refreshRoomsBtn) refreshRoomsBtn.addEventListener("click", loadRoomBrowser);
document.querySelectorAll(".filter-btn").forEach(b => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    roomFilter = b.dataset.filter;
    loadRoomBrowser();
  });
});
socket.on("rooms:update", renderRoomBrowser);

// ============================================================
//   PROFILE PAGE
// ============================================================
const PFP_EMOJIS = ["😎","😊","🤓","😈","🥳","🤠","👻","🐱","🐶","🦊","🐸","🐼","🦄","🐉","🎮","🎯","🔥","⭐","💎","🌊","🌸","🍕","🎸","🚀"];
const SHOP_COLORS = [
  { id: "default", name: "Default", color: "#0b4d6e" },
  { id: "cyan", name: "Cyan", color: "#1ab5d5" },
  { id: "emerald", name: "Emerald", color: "#2d9e5a" },
  { id: "sunset", name: "Sunset", color: "#e87830" },
  { id: "magenta", name: "Magenta", color: "#c740a0" },
  { id: "gold", name: "Gold", color: "#c89020" },
  { id: "violet", name: "Violet", color: "#7c3aed" },
  { id: "crimson", name: "Crimson", color: "#dc2626" },
  { id: "ice", name: "Ice Blue", color: "#38bdf8" },
  { id: "forest", name: "Forest", color: "#15803d" },
  { id: "bubblegum", name: "Bubblegum", color: "#f472b6" },
  { id: "midnight", name: "Midnight", color: "#1e1b4b" },
  { id: "neon", name: "Neon Pink", color: "#f43f8e" },
];
const SHOP_TITLES = [
  { id: "none", name: "None" },
  { id: "spy-hunter", name: "Spy Hunter" },
  { id: "offkey-legend", name: "Off-Key Legend" },
  { id: "chain-breaker", name: "Chain Breaker" },
  { id: "smooth-talker", name: "Smooth Talker" },
  { id: "detective", name: "Detective" },
  { id: "speedrunner", name: "Speedrunner" },
  { id: "brainiac", name: "Brainiac" },
  { id: "snake-charmer", name: "Snake Charmer" },
  { id: "mastermind", name: "Mastermind" },
  { id: "shadow", name: "The Shadow" },
  { id: "arcade-king", name: "Arcade King" },
  { id: "sharpshooter", name: "Sharpshooter" },
  { id: "lobby-legend", name: "Lobby Legend" },
  { id: "the-goat", name: "The G.O.A.T." },
];

const BORDER_STYLES = {
  "none": "none",
  "glow-cyan": "0 0 12px #1ab5d5, 0 0 24px rgba(26,181,213,0.3)",
  "glow-gold": "0 0 12px #ffd700, 0 0 24px rgba(255,215,0,0.3)",
  "glow-pink": "0 0 12px #f472b6, 0 0 24px rgba(244,114,182,0.3)",
  "glow-fire": "0 0 8px #ff4500, 0 0 16px #ff6b00, 0 0 28px rgba(255,69,0,0.3)",
  "glow-rainbow": "0 0 8px #ff0000, 0 0 12px #ff8800, 0 0 16px #ffff00, 0 0 20px #00ff00, 0 0 24px #0088ff",
  "glow-shadow": "0 0 15px #1e1b4b, 0 0 30px rgba(30,27,75,0.5)",
};
function getBorderStyle(id) { return BORDER_STYLES[id] || "none"; }

function loadProfile() {
  if (!user) return;
  $("profile-pfp").innerHTML = `<span class="pfp-circle" style="box-shadow:${getBorderStyle(user.pfpBorder)}"><span class="pfp-emoji">${user.pfpEmoji || '😎'}</span></span>`;
  $("profile-username").textContent = user.username;
  const titleDisplay = $("profile-title-display");
  if (user.title === "custom" && user.customTitle) titleDisplay.textContent = user.customTitle;
  else { const t = SHOP_TITLES.find(x => x.id === user.title); titleDisplay.textContent = t && t.id !== "none" ? t.name : ""; }

  // PFP picker
  const pfpPicker = $("pfp-picker"); pfpPicker.innerHTML = "";
  for (const emoji of PFP_EMOJIS) {
    const btn = document.createElement("span");
    btn.textContent = emoji;
    btn.style.cssText = `cursor:pointer;padding:6px;border-radius:10px;transition:all 0.15s;${user.pfpEmoji === emoji ? "background:var(--accent);box-shadow:0 0 0 2px var(--accent);" : ""}`;
    btn.addEventListener("click", async () => {
      await fetch("/api/profile/update", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ pfpEmoji: emoji }) });
      await refreshUser(); loadProfile();
    });
    pfpPicker.appendChild(btn);
  }

  // Color picker
  const colorPicker = $("profile-color-picker"); colorPicker.innerHTML = "";
  const owned = user.ownedItems || [];
  for (const c of SHOP_COLORS) {
    if (!owned.includes(c.id)) continue;
    const swatch = document.createElement("div");
    swatch.style.cssText = `width:36px;height:36px;border-radius:10px;background:${c.color};cursor:pointer;transition:all 0.15s;border:3px solid ${user.nameColor === c.id ? "var(--deep)" : "transparent"};box-shadow:2px 2px 5px var(--neo-lo),-1px -1px 4px var(--neo-hi)`;
    swatch.title = c.name;
    swatch.addEventListener("click", async () => {
      await fetch("/api/profile/update", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ nameColor: c.id }) });
      await refreshUser(); loadProfile();
    });
    colorPicker.appendChild(swatch);
  }

  // Title picker
  const titlePicker = $("profile-title-picker"); titlePicker.innerHTML = "";
  for (const t of SHOP_TITLES) {
    if (t.id !== "none" && !owned.includes(t.id)) continue;
    const btn = document.createElement("button");
    btn.className = `btn btn-sm ${user.title === t.id ? "btn-primary" : "btn-ghost"}`;
    btn.textContent = t.id === "none" ? "None" : t.name;
    btn.style.fontSize = "12px";
    btn.addEventListener("click", async () => {
      await fetch("/api/profile/update", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ title: t.id }) });
      await refreshUser(); loadProfile();
    });
    titlePicker.appendChild(btn);
  }
  if (user.title === "custom" && user.customTitle) {
    const customBtn = document.createElement("button");
    customBtn.className = "btn btn-sm btn-primary"; customBtn.textContent = user.customTitle;
    customBtn.style.fontSize = "12px";
    titlePicker.appendChild(customBtn);
  }

  // Inventory
  const inv = $("profile-inventory"); inv.innerHTML = "";
  for (const itemId of owned) {
    if (itemId === "default" || itemId === "none") continue;
    const c = SHOP_COLORS.find(x => x.id === itemId);
    const t = SHOP_TITLES.find(x => x.id === itemId);
    const chip = document.createElement("span");
    chip.style.cssText = "padding:5px 12px;border-radius:999px;font-size:12px;font-weight:700;background:var(--neo);box-shadow:1px 1px 3px var(--neo-lo),-1px -1px 3px var(--neo-hi)";
    if (c) { chip.textContent = c.name; chip.style.color = c.color; }
    else if (t) { chip.textContent = t.name; chip.style.color = "var(--mid)"; }
    else { chip.textContent = itemId; }
    inv.appendChild(chip);
  }
}

$("custom-title-btn").addEventListener("click", async () => {
  const inp = $("custom-title-input"); const text = inp.value.trim();
  $("custom-title-error").textContent = "";
  if (!text) return;
  if (text.split(/\s+/).length > 2) { $("custom-title-error").textContent = "Max 2 words"; return; }
  try {
    const res = await fetch("/api/profile/update", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ title: "custom", customTitle: text }) });
    const data = await res.json();
    if (!res.ok) { $("custom-title-error").textContent = data.error; return; }
    if (data.user) { user = data.user; updateUI(); }
    inp.value = ""; loadProfile();
  } catch { $("custom-title-error").textContent = "Error"; }
});

// ============================================================
//   EXPANDED STAFF HANDLERS
// ============================================================
const staffBanBtn = document.getElementById("staff-ban-btn");
if (staffBanBtn) staffBanBtn.addEventListener("click", async () => {
  const u = $("staff-ban-user").value.trim(), r = $("staff-ban-reason").value.trim();
  const msg = $("staff-ban-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/ban", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,reason:r}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffUnbanBtn = document.getElementById("staff-unban-btn");
if (staffUnbanBtn) staffUnbanBtn.addEventListener("click", async () => {
  const u = $("staff-ban-user").value.trim();
  const msg = $("staff-ban-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/ban", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,unban:true}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffItemBtn = document.getElementById("staff-item-btn");
if (staffItemBtn) staffItemBtn.addEventListener("click", async () => {
  const u = $("staff-item-user").value.trim(), id = $("staff-item-id").value.trim();
  const msg = $("staff-item-msg"); msg.textContent = "";
  try {
    const res = await fetch("/api/staff/giveitem", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,itemId:id}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffConfettiBtn = document.getElementById("staff-confetti-btn");
if (staffConfettiBtn) staffConfettiBtn.addEventListener("click", async () => {
  await fetch("/api/staff/confetti", { method:"POST" });
});
const staffNukeBtn = document.getElementById("staff-nuke-btn");
if (staffNukeBtn) staffNukeBtn.addEventListener("click", () => {
  socket.emit(""); // Trigger local nuke for testing
  document.querySelectorAll('.glass-card, .btn').forEach(el => {
    el.style.transition = 'all 1.5s cubic-bezier(0.55, 0, 1, 0.45)';
    el.style.transform = `translateY(${window.innerHeight + 200}px) rotate(${Math.random()*60-30}deg)`;
    el.style.opacity = '0';
  });
  setTimeout(() => {
    document.querySelectorAll('.glass-card, .btn').forEach(el => {
      el.style.transition = 'all 0.5s ease-out'; el.style.transform = ''; el.style.opacity = '';
    });
  }, 4000);
  fetch("/api/staff/confetti", { method:"POST" }); // also send confetti
});
const staffSelfCoinsBtn = document.getElementById("staff-selfcoins-btn");
if (staffSelfCoinsBtn) staffSelfCoinsBtn.addEventListener("click", async () => {
  if (!user) return;
  await fetch("/api/staff/givecoins", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:user.username,amount:1000}) });
  await refreshUser();
});

// ── Delete All Accounts ──
const staffDeleteAllBtn = document.getElementById("staff-deleteall-btn");
if (staffDeleteAllBtn) staffDeleteAllBtn.addEventListener("click", async () => {
  const msg = $("staff-deleteall-msg"); msg.textContent = "";
  if (!confirm("⚠️ This will DELETE every account except staff. Are you sure?")) return;
  if (!confirm("FINAL WARNING: This cannot be undone. Type OK to proceed.")) return;
  try {
    const res = await fetch("/api/staff/deleteallaccounts", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({confirm:"DELETE_ALL"}) });
    const data = await res.json();
    msg.textContent = data.message || data.error;
    msg.style.color = res.ok ? "var(--success)" : "var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Timeout / Mute ──
const staffMuteBtn = document.getElementById("staff-mute-btn");
if (staffMuteBtn) staffMuteBtn.addEventListener("click", async () => {
  const u = $("staff-mute-user").value.trim();
  const mins = $("staff-mute-mins").value || "10";
  const msg = $("staff-mute-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/timeout", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,minutes:Number(mins)}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffUnmuteBtn = document.getElementById("staff-unmute-btn");
if (staffUnmuteBtn) staffUnmuteBtn.addEventListener("click", async () => {
  const u = $("staff-mute-user").value.trim();
  const msg = $("staff-mute-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/timeout", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,minutes:0}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Kick User ──
const staffKickBtn = document.getElementById("staff-kick-btn");
if (staffKickBtn) staffKickBtn.addEventListener("click", async () => {
  const u = $("staff-kick-user").value.trim();
  const msg = $("staff-kick-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/kick", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Make / Remove Mod ──
const staffMakeModBtn = document.getElementById("staff-makemod-btn");
if (staffMakeModBtn) staffMakeModBtn.addEventListener("click", async () => {
  const u = $("staff-mod-user").value.trim();
  const msg = $("staff-mod-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/makemod", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,makeMod:true}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffRemoveModBtn = document.getElementById("staff-removemod-btn");
if (staffRemoveModBtn) staffRemoveModBtn.addEventListener("click", async () => {
  const u = $("staff-mod-user").value.trim();
  const msg = $("staff-mod-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/makemod", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,makeMod:false}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Chat Controls ──
const staffDelMsgBtn = document.getElementById("staff-delmsg-btn");
if (staffDelMsgBtn) staffDelMsgBtn.addEventListener("click", async () => {
  const id = $("staff-delmsg-id").value.trim();
  const msg = $("staff-chat-msg"); msg.textContent = "";
  if (!id) return;
  try {
    const res = await fetch("/api/staff/deletechat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({messageId:Number(id)}) });
    const data = await res.json(); msg.textContent = data.ok?"Deleted":"Error: "+(data.error||"failed"); msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffClearAllBtn = document.getElementById("staff-clearall-btn");
if (staffClearAllBtn) staffClearAllBtn.addEventListener("click", async () => {
  if (!confirm("Delete ALL chat messages? This cannot be undone.")) return;
  const msg = $("staff-chat-msg"); msg.textContent = "";
  try {
    const res = await fetch("/api/staff/clearallchat", { method:"POST" });
    const data = await res.json(); msg.textContent = data.ok?"All messages cleared":"Error"; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Reset Password ──
const staffResetPwBtn = document.getElementById("staff-resetpw-btn");
if (staffResetPwBtn) staffResetPwBtn.addEventListener("click", async () => {
  const u = $("staff-resetpw-user").value.trim();
  const pw = $("staff-resetpw-pass").value.trim();
  const msg = $("staff-resetpw-msg"); msg.textContent = "";
  if (!u || !pw) { msg.textContent = "Enter username and new password"; return; }
  try {
    const res = await fetch("/api/staff/resetpassword", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,newPassword:pw}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
    if (res.ok) { $("staff-resetpw-user").value = ""; $("staff-resetpw-pass").value = ""; }
  } catch { msg.textContent = "Error"; }
});

// ── User List ──
const staffUsersRefresh = document.getElementById("staff-users-refresh");
if (staffUsersRefresh) staffUsersRefresh.addEventListener("click", async () => {
  const list = $("staff-users-list");
  list.innerHTML = '<p style="color:var(--ink3)">Loading...</p>';
  try {
    const res = await fetch("/api/staff/users");
    const data = await res.json();
    if (!data.users || !data.users.length) { list.innerHTML = '<p style="color:var(--ink3)">No users</p>'; return; }
    list.innerHTML = data.users.map(u => {
      let badges = '';
      if (u.online) badges += '<span class="staff-user-badge online">Online</span>';
      if (u.is_banned) badges += '<span class="staff-user-badge banned">Banned</span>';
      if (u.is_staff) badges += '<span class="staff-user-badge" style="background:rgba(255,215,0,0.15);color:#ffd700">Staff</span>';
      if (u.is_mod) badges += '<span class="staff-user-badge mod">Mod</span>';
      if (u.muted_until && u.muted_until > Date.now()) badges += '<span class="staff-user-badge muted">Muted</span>';
      return `<div class="staff-user-row"><span class="staff-user-name">${esc(u.username)}</span><span style="font-size:11px;color:var(--ink3)">🪙${u.coins}</span>${badges}</div>`;
    }).join('');
  } catch { list.innerHTML = '<p style="color:var(--ink3)">Error loading</p>'; }
});

// ── Online count updater (staff panel) ──
setInterval(async () => {
  const el = $("staff-online-count");
  if (!el || document.getElementById("page-staff").hidden) return;
  try {
    const res = await fetch("/api/staff/onlinecount");
    const data = await res.json();
    el.textContent = data.count || 0;
  } catch {}
}, 5000);

// ── Owner: Staff Management ──
const staffPromoteBtn = document.getElementById("staff-promote-btn");
if (staffPromoteBtn) staffPromoteBtn.addEventListener("click", async () => {
  const u = $("staff-promote-user").value.trim();
  const msg = $("staff-promote-msg"); msg.textContent = "";
  if (!u) return;
  const perms = {};
  document.querySelectorAll("#staff-perms-grid input[type=checkbox]").forEach(cb => { if (cb.checked) perms[cb.dataset.perm] = true; });
  try {
    const res = await fetch("/api/staff/makestaff", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,makeStaff:true,perms}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});
const staffDemoteBtn = document.getElementById("staff-demote-btn");
if (staffDemoteBtn) staffDemoteBtn.addEventListener("click", async () => {
  const u = $("staff-promote-user").value.trim();
  const msg = $("staff-promote-msg"); msg.textContent = "";
  if (!u) return;
  try {
    const res = await fetch("/api/staff/makestaff", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,makeStaff:false}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Staff: Wipe User Progress ──
const staffWipeBtn = document.getElementById("staff-wipe-btn");
if (staffWipeBtn) staffWipeBtn.addEventListener("click", async () => {
  const u = $("staff-wipe-user").value.trim();
  const what = $("staff-wipe-what").value;
  const msg = $("staff-wipe-msg"); msg.textContent = "";
  if (!u) return;
  if (!confirm(`Wipe ${what} for ${u}? This cannot be undone.`)) return;
  try {
    const res = await fetch("/api/staff/wipeprogress", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:u,what}) });
    const data = await res.json(); msg.textContent = data.message||data.error; msg.style.color = res.ok?"var(--success)":"var(--danger)";
  } catch { msg.textContent = "Error"; }
});

// ── Self-Wipe (profile settings) ──
const wipeInput = document.getElementById("wipe-confirm-input");
const wipeBtn = document.getElementById("wipe-confirm-btn");
const WIPE_PHRASE = "I want to erase all the progress I have in everything I own.";
if (wipeInput && wipeBtn) {
  // Block paste
  wipeInput.addEventListener("paste", e => e.preventDefault());
  wipeInput.addEventListener("drop", e => e.preventDefault());
  // Enable button only when exact match
  wipeInput.addEventListener("input", () => {
    wipeBtn.disabled = wipeInput.value !== WIPE_PHRASE;
  });
  wipeBtn.addEventListener("click", async () => {
    const msg = $("wipe-msg"); msg.textContent = "";
    if (wipeInput.value !== WIPE_PHRASE) { msg.textContent = "Type the exact sentence."; msg.style.color = "var(--danger)"; return; }
    try {
      const res = await fetch("/api/profile/wipe", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({confirmation:wipeInput.value}) });
      const data = await res.json();
      if (res.ok) {
        msg.textContent = "All progress erased."; msg.style.color = "var(--success)";
        wipeInput.value = ""; wipeBtn.disabled = true;
        await refreshUser();
      } else { msg.textContent = data.error; msg.style.color = "var(--danger)"; }
    } catch { msg.textContent = "Error"; }
  });
}

// ============================================================
//   BUG REPORTS
// ============================================================
const bugModal = document.getElementById('bug-modal');
const bugReportBtn = document.getElementById('bug-report-btn');
const bugCancel = document.getElementById('bug-cancel');
const bugForm = document.getElementById('bug-form');

if (bugReportBtn) bugReportBtn.addEventListener('click', () => { bugModal.hidden = false; $('bug-success').textContent = ''; $('bug-error').textContent = ''; });
if (bugCancel) bugCancel.addEventListener('click', () => { bugModal.hidden = true; });
if (bugModal) bugModal.addEventListener('click', (e) => { if (e.target === bugModal) bugModal.hidden = true; });

if (bugForm) bugForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  $('bug-error').textContent = ''; $('bug-success').textContent = '';
  const title = $('bug-title').value.trim();
  const body = $('bug-body').value.trim();
  if (!title || !body) { $('bug-error').textContent = 'Fill in both fields'; return; }
  try {
    const res = await fetch('/api/bugs/submit', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ title, body }) });
    const data = await res.json();
    if (!res.ok) { $('bug-error').textContent = data.error; return; }
    $('bug-success').textContent = data.message;
    $('bug-title').value = ''; $('bug-body').value = '';
    setTimeout(() => { bugModal.hidden = true; }, 2000);
  } catch { $('bug-error').textContent = 'Network error'; }
});

// Staff bug viewer
const staffBugsRefresh = document.getElementById('staff-bugs-refresh');
if (staffBugsRefresh) staffBugsRefresh.addEventListener('click', loadBugReports);

async function loadBugReports() {
  const container = document.getElementById('staff-bugs-list');
  if (!container) return;
  try {
    const res = await fetch('/api/bugs?open=1');
    const data = await res.json();
    if (!data.reports || data.reports.length === 0) {
      container.innerHTML = '<p style="color:var(--success);text-align:center;padding:12px">No open bug reports! 🎉</p>';
      return;
    }
    container.innerHTML = '';
    for (const bug of data.reports) {
      const age = Math.round((Date.now() - bug.created_at) / 60000);
      const timeStr = age < 60 ? `${age}m ago` : age < 1440 ? `${Math.round(age/60)}h ago` : `${Math.round(age/1440)}d ago`;
      const div = document.createElement('div');
      div.className = 'bug-item';
      div.innerHTML = `
        <div class="bug-item-header">
          <span class="bug-item-title">${esc(bug.title)}</span>
          <span class="bug-item-meta">${esc(bug.username)} · ${timeStr}</span>
        </div>
        <div class="bug-item-body">${esc(bug.body)}</div>
        <div class="bug-item-actions">
          <button class="btn btn-sm btn-primary" data-bug-id="${bug.id}" data-action="resolved" style="font-size:11px;padding:4px 10px">✓ Resolve</button>
          <button class="btn btn-sm btn-ghost" data-bug-id="${bug.id}" data-action="delete" style="font-size:11px;padding:4px 10px">✕ Delete</button>
        </div>
      `;
      div.querySelectorAll('[data-bug-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await fetch('/api/bugs/resolve', { method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ id: Number(btn.dataset.bugId), status: btn.dataset.action }) });
          loadBugReports();
        });
      });
      container.appendChild(div);
    }
  } catch { container.innerHTML = '<p style="color:var(--danger)">Failed to load</p>'; }
}

// ============================================================
//   GLOBAL CHAT — persistent sidebar
// ============================================================
const gchatSidebar = $('gchat-sidebar');
const gchatMessages = $('gchat-messages');
const gchatForm = $('gchat-form');
const gchatInput = $('gchat-input');
let gchatVisible = false;

// Pages where chat sidebar is HIDDEN (party game rooms with their own chat)
const GCHAT_HIDDEN_PAGES = new Set(['page-auth','page-room','page-game','page-kicked']);

function showGChat() {
  if (!gchatSidebar) return;
  gchatSidebar.hidden = false;
  gchatVisible = true;
  document.body.classList.add('gchat-open');
  scrollGlobalChat();
}
function hideGChat() {
  if (!gchatSidebar) return;
  gchatSidebar.hidden = true;
  gchatVisible = false;
  document.body.classList.remove('gchat-open');
}

function initGChatOnce() {
  if (gchatInitialized) return;
  gchatInitialized = true;
  initChat();
  initAchievementListener();
}

function initChat() {
  if (!gchatSidebar || !window._socket) return;
  gchatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = gchatInput.value.trim();
    if (!text) return;
    window._socket.emit('gchat:send', text);
    gchatInput.value = '';
  });
  // Load history
  window._socket.emit('gchat:history', null, (history) => {
    if (history) history.forEach(addGChatMsg);
    scrollGlobalChat();
  });
  // Listen for new messages
  window._socket.on('gchat:msg', (msg) => {
    addGChatMsg(msg);
    scrollGlobalChat();
  });
  // Blocked message feedback (Word Spy anti-cheat, profanity, etc.)
  window._socket.on('gchat:blocked', (reason) => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-msg-text" style="color:#ef4444;font-style:italic">⚠️ ${esc(reason)}</span>`;
    gchatMessages.appendChild(div);
    scrollGlobalChat();
    setTimeout(() => div.remove(), 5000);
  });
  // Message deleted by staff
  window._socket.on('gchat:deleted', ({ messageId }) => {
    const el = gchatMessages.querySelector(`[data-msg-id="${messageId}"]`);
    if (el) { el.style.transition='opacity .2s'; el.style.opacity='0'; setTimeout(() => el.remove(), 200); }
  });
  // All messages cleared
  window._socket.on('gchat:cleared', () => {
    gchatMessages.innerHTML = '';
  });
  // Muted notification
  window._socket.on('gchat:muted', ({ minutes }) => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-msg-text" style="color:#ef4444;font-style:italic">🔇 You've been muted for ${minutes} minute${minutes!==1?'s':''}</span>`;
    gchatMessages.appendChild(div);
    scrollGlobalChat();
  });
}

function addGChatMsg(msg) {
  if (!gchatMessages) return;
  const div = document.createElement('div');
  div.className = 'chat-msg';
  if (msg.id) div.dataset.msgId = msg.id;
  const time = new Date(msg.time);
  const ts = `${time.getHours()}:${String(time.getMinutes()).padStart(2,'0')}`;
  // Role badge
  let badge = '';
  if (msg.isOwner) badge = '<span class="gchat-role-badge owner-badge">OWNER</span>';
  else if (msg.isStaff) badge = '<span class="gchat-role-badge staff-badge">STAFF</span>';
  else if (msg.isMod) badge = '<span class="gchat-role-badge mod-badge">MOD</span>';
  // Delete button (only visible to staff/mod via CSS)
  const delBtn = msg.id ? `<button class="gchat-delete-btn" data-del-id="${msg.id}" title="Delete message">✕</button>` : '';
  div.innerHTML = `${badge}<span class="chat-msg-user" style="color:${esc(msg.color)}">${esc(msg.user)}</span><span class="chat-msg-text">${esc(msg.text)}</span><span class="chat-msg-time">${ts}</span>${delBtn}`;
  // Wire delete button
  const delBtnEl = div.querySelector('.gchat-delete-btn');
  if (delBtnEl) {
    delBtnEl.addEventListener('click', () => {
      const id = delBtnEl.dataset.delId;
      fetch('/api/staff/deletechat', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({messageId:Number(id)}) });
    });
  }
  gchatMessages.appendChild(div);
  if (gchatMessages.children.length > 150) gchatMessages.removeChild(gchatMessages.firstChild);
}

function scrollGlobalChat() {
  if (gchatMessages) requestAnimationFrame(() => { gchatMessages.scrollTop = gchatMessages.scrollHeight; });
}

// ============================================================
//   ACHIEVEMENTS
// ============================================================
async function loadAchievements() {
  const container = $('achievements-content');
  if (!container) return;
  try {
    const res = await fetch('/api/achievements');
    const data = await res.json();
    if (!data.achievements) { container.innerHTML = '<p style="color:var(--ink3)">Failed to load</p>'; return; }
    const earned = new Set(data.earned || []);
    let html = '<div class="ach-grid">';
    for (const a of data.achievements) {
      const done = earned.has(a.id);
      html += `<div class="ach-card ${done ? 'earned' : 'locked'}">
        <span class="ach-icon">${a.icon}</span>
        <div class="ach-info">
          <div class="ach-name">${esc(a.name)}</div>
          <div class="ach-desc">${esc(a.desc)}</div>
          ${a.coins > 0 ? `<div class="ach-reward">${done ? '✓' : ''} +${a.coins} coins</div>` : ''}
        </div>
      </div>`;
    }
    html += '</div>';
    const earnedCount = data.earned?.length || 0;
    container.innerHTML = `<p style="color:var(--ink2);margin-bottom:12px;font-size:14px">${earnedCount}/${data.achievements.length} unlocked</p>` + html;
  } catch { container.innerHTML = '<p style="color:var(--danger)">Failed to load</p>'; }
}

// Achievement toast notification
function showAchievementToast(data) {
  const toast = document.createElement('div');
  toast.className = 'ach-toast';
  toast.innerHTML = `<span class="ach-toast-icon">${data.icon || '🏆'}</span><div class="ach-toast-text"><div class="ach-toast-title">Achievement Unlocked!</div>${esc(data.name)}${data.coins > 0 ? ` · +${data.coins} coins` : ''}</div>`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.remove(); }, 4000);
}

// Listen for achievement notifications via socket
function initAchievementListener() {
  if (window._socket) {
    window._socket.on('achievement', showAchievementToast);
  }
}

// Sync dungeon achievements after clearing areas
function syncDungeonAchievements(areasCleared) {
  fetch('/api/achievements/dungeon', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ areasCleared })
  }).catch(() => {});
}

// ============================================================
//   STOCK MARKET
// ============================================================
function loadMarket() {
  const container = $("market-content");
  if (container && window.StockMarket) window.StockMarket.load(container);
}

// ============================================================
//   BLITZ (Shooter)
// ============================================================
socket.on("game:blitzStart", ({ code }) => {
  // Switch to game view and init shooter
  showPage("page-game");
  $("game-mode-badge").textContent = "💥 Blitz";
  $("game-round-badge").textContent = "Live";
  $("game-room-code").textContent = code;
  document.querySelector(".timer-wrap").style.display = "none";
  const area = document.querySelector(".game-area");
  // Hide all phases
  area.querySelectorAll(".game-phase").forEach(p => p.hidden = true);
  // Create shooter container
  let sc = document.getElementById("shooter-container");
  if (!sc) { sc = document.createElement("div"); sc.id = "shooter-container"; sc.className = "game-phase"; area.appendChild(sc); }
  sc.hidden = false; sc.innerHTML = "";
  if (window.ShooterGame) {
    window.ShooterGame.init(sc, socket, code, socket.id, user?.username || me?.name || "Player");
  }
});

// ============================================================
//   DUNGEON
// ============================================================
const dgStartBtn = document.getElementById('dg-start-btn');
if (dgStartBtn) dgStartBtn.addEventListener('click', () => {
  const menu = document.getElementById('dg-menu');
  const playArea = document.getElementById('dg-play-area');
  menu.hidden = true;
  playArea.hidden = false;
  playArea.innerHTML = '';
  window.DungeonGame?.init(playArea, async (coins, areasCleared, kills) => {
    // Submit score
    try {
      const res = await fetch('/api/arcade/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: 'dungeon', score: coins, elapsed: 999999 })
      });
      const data = await res.json();
      if (data.user) { user = data.user; updateUI(); }
    } catch {}
    // Sync dungeon achievements
    syncDungeonAchievements(areasCleared);
  });
});

// ============================================================
//   COLOR THEMES
// ============================================================
const THEME_CLASSES = ['theme-midnight','theme-sunset','theme-golden','theme-forest','theme-sakura','theme-neon','theme-ocean','theme-lava','theme-arctic'];
function applyTheme(theme) {
  THEME_CLASSES.forEach(c => document.body.classList.remove(c));
  if (theme) document.body.classList.add(theme);
  localStorage.setItem('lobby98_theme', theme || '');
  // Update active swatch
  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.classList.toggle('active', (s.dataset.theme || '') === (theme || ''));
  });
}
// Init theme from localStorage
const savedTheme = localStorage.getItem('lobby98_theme') || '';
if (savedTheme) applyTheme(savedTheme);
// Theme swatch clicks
document.getElementById('theme-grid')?.addEventListener('click', e => {
  const swatch = e.target.closest('.theme-swatch');
  if (!swatch) return;
  applyTheme(swatch.dataset.theme || '');
});
// Mark active swatch on page load
setTimeout(() => applyTheme(savedTheme), 50);

// Dashboard changelog toggle
const dashChangelogToggle = document.getElementById('dash-changelog-toggle');
if (dashChangelogToggle) dashChangelogToggle.addEventListener('click', () => {
  const extra = $('dash-changelog-extra');
  if (!extra) return;
  extra.hidden = !extra.hidden;
  dashChangelogToggle.textContent = extra.hidden ? 'Show older updates' : 'Hide older updates';
});

checkSession();
checkStaff();
loadFakeNews();
