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
const socket = io();

// ============================================================
//   ROUTING
// ============================================================
const PAGES = ["page-auth","page-dashboard","page-play","page-room","page-game","page-kicked","page-arcade","page-shop","page-settings"];

function showPage(id) {
  PAGES.forEach(p => { const el = $(p); if (el) el.hidden = p !== id; });
  // Update nav
  const map = {"page-dashboard":"dashboard","page-play":"play","page-room":"play","page-game":"play","page-arcade":"arcade","page-shop":"shop","page-settings":"settings"};
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.page === map[id]));
}

// Nav links
document.querySelectorAll(".nav-link").forEach(l => {
  l.addEventListener("click", () => {
    if (!user) return;
    // Don't navigate away from active room/game
    if (currentRoom && (l.dataset.page === "dashboard" || l.dataset.page === "arcade" || l.dataset.page === "shop" || l.dataset.page === "settings")) {
      if (!confirm("Leave the current room?")) return;
      socket.emit("room:leave");
      resetRoomState();
    }
    showPage("page-" + l.dataset.page);
    if (l.dataset.page === "shop") loadShop();
    if (l.dataset.page === "settings") loadSettings();
    if (l.dataset.page === "play") prefillName();
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
    if (data.loggedIn) { user = data.user; updateUI(); showPage("page-dashboard"); }
    else { user = null; updateUI(); }
  } catch { user = null; updateUI(); }
}

async function authSubmit(endpoint, form, errorEl) {
  errorEl.textContent = "";
  const fd = new FormData(form);
  const body = { username: fd.get("username"), password: fd.get("password") };
  try {
    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { errorEl.textContent = data.error || "Error"; return; }
    user = data.user; updateUI(); showPage("page-dashboard");
    // Reconnect socket so it picks up the new session cookie
    socket.disconnect(); socket.connect();
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
  clearTI();
  $("chat-messages").innerHTML = ""; $("player-list").innerHTML = "";
}

$("form-create").addEventListener("submit", e => {
  e.preventDefault(); $("create-error").textContent = "";
  socket.emit("room:create", { name: new FormData(e.target).get("name") }, resp => {
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
  if (amHost && ["frequency","wordspy","chain"].includes(snap.mode)) {
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
  badge.textContent = snap.game?.type === "wordspy" ? "🕵️ Word Spy" : snap.game?.type === "chain" ? "⛓️ Chain" : "🎵 Frequency";
  updateRound(snap.game); syncChat(); renderPhase(snap); showPage("page-game");
}

function updateRound(g) { if (g) $("game-round-badge").textContent = `Round ${g.round}/${g.totalRounds}`; }

function renderPhase(snap) {
  const g = snap.game; if (!g) return;
  ["phase-prompting","phase-voting","phase-results","phase-gameover","phase-discuss","phase-intermission","phase-ws-clues","phase-ws-discuss","phase-ws-voting","phase-ws-spyguess","phase-ws-results","phase-chain-building","phase-chain-results"].forEach(id => { const el = $(id); if (el) el.hidden = true; });
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
    switchToGame(snap);
  } else { resetRoomState(); showPage("page-room"); /* stay in room lobby */ }
});
socket.on("game:yourPrompt", ({ prompt }) => { myPrompt = prompt; $("prompt-text").textContent = prompt; });
socket.on("game:yourWord", ({ word, category, isSpy }) => { myWord = { word, category, isSpy }; hasSubmittedClue=false;hasSubmittedSpyGuess=false; });
socket.on("game:yourChainRole", ({ isSaboteur, targetWord, starter }) => { myChainRole = { isSaboteur, targetWord, starter }; hasAccused=false; });
socket.on("chat:message", msg => { addChat(msg); scrollChat(); });
socket.on("room:kicked", ({ by }) => { $("kicked-by").textContent = by ? `(by ${by})` : ""; resetRoomState(); showPage("page-kicked"); });
socket.on("disconnect", () => { if (me) { resetRoomState(); showPage("page-dashboard"); } });

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
    game.init(container, async (score) => {
      // Submit score to server
      try {
        const res = await fetch("/api/arcade/score", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({game:gameId,score}) });
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
  try {
    const res = await fetch("/api/shop");
    const data = await res.json();
    if (data.user) { user = data.user; updateUI(); }
    renderShop(data.items, data.user);
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
checkSession();
