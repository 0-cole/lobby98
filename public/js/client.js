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

// Local state
let me = null;        // { id, name, isHost }
let currentRoom = null; // last snapshot from server
let myPrompt = null;  // the prompt I received this round
let selectedRating = null;
let hasSubmittedRating = false;
let hasSubmittedVote = false;
let isSpectator = false;
let timerInterval = null;

// Word Spy state
let myWordSpyInfo = null; // { word, category, isSpy }
let hasSubmittedClue = false;
let hasSubmittedSpyGuess = false;

// Echo state
let myEchoInfo = null; // { prompt, isEcho }
let hasSubmittedAnswer = false;

// Chain state
let myChainInfo = null; // { isSaboteur, targetWord, startingPhrase }
let hasSubmittedWord = false;

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

  // Show start button if host + playable mode selected
  const playableModes = ["frequency", "wordspy", "echo", "chain"];
  if (amHost && playableModes.includes(snapshot.mode)) {
    startArea.hidden = false;
    const labels = { frequency: "Frequency", wordspy: "Word Spy", echo: "Echo", chain: "Chain" };
    const icons = { frequency: "🎵", wordspy: "🕵️", echo: "🔊", chain: "🔗" };
    const minPlayers = { frequency: 3, wordspy: 3, echo: 3, chain: 2 };
    
    const modeLabel = labels[snapshot.mode] || snapshot.mode;
    const modeIcon = icons[snapshot.mode] || "";
    const min = minPlayers[snapshot.mode] || 3;

    $("start-game-btn").textContent = `${modeIcon} Start ${modeLabel}`;
    if (snapshot.players.length < min) {
      startNote.textContent = `Need at least ${min} players (${snapshot.players.length} now)`;
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

  // Hide all phases
  ["phase-prompting", "phase-voting", "phase-results", "phase-gameover",
   "phase-discuss", "phase-intermission",
   "phase-wordspy-clues", "phase-wordspy-guess",
   "phase-echo-answering", "phase-echo-discuss",
   "phase-chain"].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });

  // Update mode badge
  const modeBadge = $("game-mode-badge");
  if (modeBadge) {
    const badges = { frequency: "🎵 Frequency", wordspy: "🕵️ Word Spy", echo: "🔊 Echo", chain: "🔗 Chain" };
    modeBadge.textContent = badges[game.mode] || game.mode;
  }

  updateGameRoundBadge(game);
  startTimerDisplay(game.timerEnd, game.phase);

  switch (game.phase) {
    // ── Frequency phases ──
    case "prompting":
      renderPromptingPhase(snapshot);
      break;
    case "discuss":
      renderDiscussPhase(snapshot);
      break;
    // ── Word Spy phases ──
    case "clues":
      renderWordSpyCluesPhase(snapshot);
      break;
    case "spy-guess":
      renderWordSpyGuessPhase(snapshot);
      break;
    // ── Echo phases ──
    case "answering":
      renderEchoAnsweringPhase(snapshot);
      break;
    // ── Chain phases ──
    case "chain":
      renderChainPhase(snapshot);
      break;
    // ── Shared phases ──
    case "voting":
      renderVotingPhase(snapshot);
      break;
    case "results":
      renderResultsPhase(snapshot);
      break;
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
  
  if (!timerEnd || !timerEl || phase === "results" || phase === "gameover") {
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

// --- Word Spy: Clues phase ---
function renderWordSpyCluesPhase(snapshot) {
  $("phase-wordspy-clues").hidden = false;
  const game = snapshot.game;

  if (myWordSpyInfo) {
    const isSpy = myWordSpyInfo.isSpy;
    $("wordspy-word").textContent = isSpy ? "🕵️ YOU ARE THE SPY" : myWordSpyInfo.word;
    $("wordspy-word").style.color = isSpy ? "#ef4444" : "";
    $("wordspy-category").textContent = `Category: ${myWordSpyInfo.category}`;
  }

  // Render clues so far
  const cluesList = $("wordspy-clues-list");
  cluesList.innerHTML = "";
  (game.clues || []).forEach(c => {
    const isMe = me && c.playerId === me.id;
    const div = document.createElement("div");
    div.className = `rating-card ${isMe ? "rating-card-me" : ""}`;
    div.innerHTML = `<span class="rating-card-name">${escapeHtml(c.name)}</span><span class="rating-card-value" style="font-size:14px;">${escapeHtml(c.text)}</span>`;
    cluesList.appendChild(div);
  });

  // Turn indicator
  const currentTurnId = (game.turnOrder || [])[game.turnIndex];
  const isMyTurn = me && currentTurnId === me.id;
  const turnPlayer = snapshot.players.find(p => p.id === currentTurnId);
  const turnName = turnPlayer ? turnPlayer.name : "?";

  const indicator = $("wordspy-turn-indicator");
  if (currentTurnId) {
    indicator.textContent = isMyTurn ? "✏️ Your turn — give a clue!" : `⏳ ${escapeHtml(turnName)}'s turn...`;
  } else {
    indicator.textContent = "All clues in!";
  }

  const submitArea = $("wordspy-clue-submit-area");
  if (isMyTurn && !hasSubmittedClue && !isSpectator) {
    submitArea.hidden = false;
    $("submit-clue-btn").disabled = $("wordspy-clue-input").value.trim() === "";
  } else {
    submitArea.hidden = true;
  }
}

// --- Word Spy: Spy Guess phase ---
function renderWordSpyGuessPhase(snapshot) {
  $("phase-wordspy-guess").hidden = false;
  const game = snapshot.game;
  const isSpy = myWordSpyInfo?.isSpy || (me && game.spyId === me.id);

  if (isSpy && !hasSubmittedSpyGuess && !isSpectator) {
    $("wordspy-guess-area").hidden = false;
    $("wordspy-guess-waiting").hidden = true;
    $("submit-spy-guess-btn").disabled = $("wordspy-guess-input").value.trim() === "";
  } else {
    $("wordspy-guess-area").hidden = true;
    $("wordspy-guess-waiting").hidden = false;
  }
}

// --- Echo: Answering phase ---
function renderEchoAnsweringPhase(snapshot) {
  $("phase-echo-answering").hidden = false;
  const game = snapshot.game;

  if (myEchoInfo) {
    $("echo-prompt-text").textContent = myEchoInfo.prompt;
  }

  if (hasSubmittedAnswer || isSpectator) {
    $("echo-answer-submit-area").hidden = true;
    $("echo-answer-waiting").hidden = false;
    $("echo-answers-progress").textContent = `${game.answersSubmitted.length}/${game.playerCount}`;
  } else {
    $("echo-answer-submit-area").hidden = false;
    $("echo-answer-waiting").hidden = true;
    $("submit-echo-answer-btn").disabled = $("echo-answer-input").value.trim() === "";
  }
}

// --- Chain: Chain phase ---
function renderChainPhase(snapshot) {
  $("phase-chain").hidden = false;
  const game = snapshot.game;

  // Render sentence
  const sentence = (game.startingPhrase || "") + " " + (game.words || []).map(w => w.word).join(" ");
  $("chain-sentence").textContent = sentence;

  // Saboteur hint
  const hintArea = $("chain-saboteur-hint");
  if (myChainInfo && myChainInfo.isSaboteur) {
    hintArea.hidden = false;
    $("chain-target-word").textContent = myChainInfo.targetWord;
  } else {
    hintArea.hidden = true;
  }

  // Turn indicator
  const currentTurnId = (game.turnOrder || [])[game.turnIndex];
  const isMyTurn = me && currentTurnId === me.id;
  const turnPlayer = snapshot.players.find(p => p.id === currentTurnId);
  const turnName = turnPlayer ? turnPlayer.name : "?";

  const indicator = $("chain-turn-indicator");
  indicator.textContent = isMyTurn ? "✏️ Your turn — add a word!" : `⏳ ${escapeHtml(turnName)}'s turn...`;

  const submitArea = $("chain-word-submit-area");
  if (isMyTurn && !isSpectator) {
    submitArea.hidden = false;
    $("submit-chain-word-btn").disabled = $("chain-word-input").value.trim() === "";
    // Don't focus if we already have focus to avoid stealing from chat
    if (document.activeElement !== $("chain-word-input") && document.activeElement !== $("chat-input")) {
       // optional focus
    }
  } else {
    submitArea.hidden = true;
  }

  // Accuse buttons
  const accuseArea = $("chain-accuse-area");
  accuseArea.innerHTML = "";
  if (!isSpectator && !isMyTurn) {
    const title = document.createElement("p");
    title.className = "phase-instruction";
    title.textContent = "Think someone's the Saboteur?";
    accuseArea.appendChild(title);

    const btnGrid = document.createElement("div");
    btnGrid.style.display = "flex";
    btnGrid.style.flexWrap = "wrap";
    btnGrid.style.gap = "8px";
    btnGrid.style.justifyContent = "center";

    snapshot.players.forEach(p => {
      if (me && p.id === me.id) return;
      const btn = document.createElement("button");
      btn.className = "neo-btn neo-btn-sm neo-btn-danger";
      btn.textContent = `Accuse ${p.name}`;
      btn.addEventListener("click", () => {
        if (!confirm(`Are you sure ${p.name} is the Saboteur? Penalty if wrong!`)) return;
        socket.emit("game:callSaboteur", { accusedId: p.id });
      });
      btnGrid.appendChild(btn);
    });
    accuseArea.appendChild(btnGrid);
  }
}

// --- Voting phase (shared: Frequency + Word Spy + Echo) ---
function renderVotingPhase(snapshot) {
  $("phase-voting").hidden = false;
  const game = snapshot.game;
  const container = $("ratings-reveal");
  container.innerHTML = "";

  const isWordSpy = game.mode === "wordspy";
  const isEcho = game.mode === "echo";

  if ($("voting-title")) {
    if (isWordSpy) $("voting-title").textContent = "Who is the Spy? 🕵️";
    else if (isEcho) $("voting-title").textContent = "Which Answer is the Echo's? 🔊";
    else $("voting-title").textContent = "Who's the Off-Key? 🔍";
  }
  if ($("voting-desc")) {
    if (isWordSpy) $("voting-desc").textContent = "Everyone gave a clue — but one player is the Spy. Vote for who you think it is!";
    else if (isEcho) $("voting-desc").textContent = "One of these answers came from a slightly different prompt. Find it!";
    else $("voting-desc").textContent = "Everyone rated the prompt — but someone had a different prompt. Vote for who you think it was!";
  }

  const canVote = !isSpectator && !hasSubmittedVote;

  if (isWordSpy) {
    // ... (rest of Word Spy voting logic)
    (game.clues || []).forEach(c => {
      const card = document.createElement("div");
      const isMe = me && c.playerId === me.id;
      card.className = `rating-card ${isMe ? "rating-card-me" : ""}`;
      card.innerHTML = `
        <div class="rating-card-info">
          <span class="rating-card-name">${escapeHtml(c.name)}${isMe ? " (you)" : ""}</span>
        </div>
        <div class="rating-card-value" style="font-size:13px;">${escapeHtml(c.text)}</div>
        ${canVote && !isMe ? `<button class="neo-btn neo-btn-vote" data-vote-id="${c.playerId}">Vote</button>` : ""}
      `;
      const voteBtn = card.querySelector(".neo-btn-vote");
      if (voteBtn) {
        voteBtn.addEventListener("click", () => {
          if (hasSubmittedVote) return;
          hasSubmittedVote = true;
          socket.emit("game:submitVote", { targetId: c.playerId }, () => {});
          container.querySelectorAll(".neo-btn-vote").forEach(b => { b.disabled = true; });
          voteBtn.textContent = "Voted!";
          $("vote-waiting").hidden = false;
        });
      }
      container.appendChild(card);
    });
  } else if (isEcho) {
    // Render anonymous answers for Echo voting
    (game.anonymousAnswers || []).forEach(ans => {
      const card = document.createElement("div");
      card.className = "rating-card anonymous-card";
      card.innerHTML = `
        <div class="rating-card-value" style="font-size:16px; margin: 10px 0;">${escapeHtml(ans.text)}</div>
        ${canVote ? `<button class="neo-btn neo-btn-vote" data-answer-slot="${ans.slot}">This is the Echo</button>` : ""}
      `;
      const voteBtn = card.querySelector(".neo-btn-vote");
      if (voteBtn) {
        voteBtn.addEventListener("click", () => {
          if (hasSubmittedVote) return;
          hasSubmittedVote = true;
          // For Echo, we vote for the slot/playerId associated with that answer
          const targetId = game.turnOrder[ans.slot];
          socket.emit("game:submitVote", { targetId }, () => {});
          container.querySelectorAll(".neo-btn-vote").forEach(b => { b.disabled = true; });
          voteBtn.textContent = "Voted!";
          $("vote-waiting").hidden = false;
        });
      }
      container.appendChild(card);
    });
  } else if (game.revealedRatings) {
    renderRatingsCards(container, snapshot, game.revealedRatings, canVote);
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

  if (game.mode === "wordspy") {
    renderWordSpyResults(snapshot);
    return;
  }
  if (game.mode === "echo") {
    renderEchoResults(snapshot);
    return;
  }
  if (game.mode === "chain") {
    renderChainResults(snapshot);
    return;
  }

  // Off-Key reveal
  const offKeyName = game.offKeyName || "???";
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

// --- Word Spy results ---
function renderWordSpyResults(snapshot) {
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  const spyName = game.spyName || "???";
  const isSpyMe = me && game.spyId === me.id;
  const word = game.secretWord || "?";
  const category = game.secretCategory || "?";
  const guessCorrect = game.spyGuess && game.spyGuess.toLowerCase() === word.toLowerCase();

  let headline, sub;
  if (!game.spyCaught) {
    headline = `🕵️ ${escapeHtml(spyName)} was the Spy and blended in!`;
    sub = `The word was <strong>${escapeHtml(word)}</strong> (${escapeHtml(category)})`;
  } else if (guessCorrect) {
    headline = `🤯 ${escapeHtml(spyName)} was caught but guessed the word!`;
    sub = `The word was <strong>${escapeHtml(word)}</strong> — and they knew it!`;
  } else {
    headline = `🎉 The Spy (${escapeHtml(spyName)}) was caught!`;
    sub = `The word was <strong>${escapeHtml(word)}</strong>` +
      (game.spyGuess ? ` — they guessed "${escapeHtml(game.spyGuess)}".` : ` — they ran out of time.`);
  }

  $("offkey-reveal").innerHTML = `
    <div class="offkey-reveal-card ${isSpyMe ? "offkey-reveal-me" : ""}">
      <span class="offkey-label">${headline}</span>
    </div>
  `;
  $("prompts-comparison").innerHTML = `
    <div class="prompt-compare-grid">
      <div class="prompt-compare-card">
        <span class="prompt-compare-label">The secret word</span>
        <p class="prompt-compare-text">${escapeHtml(word)}</p>
      </div>
      <div class="prompt-compare-card offkey-prompt">
        <span class="prompt-compare-label">Category</span>
        <p class="prompt-compare-text">${escapeHtml(category)}</p>
      </div>
    </div>
    <p style="text-align:center;margin-top:10px;">${sub}</p>
  `;

  // Score deltas
  const deltasEl = $("round-score-deltas");
  deltasEl.innerHTML = "";
  if (game.roundScoreDeltas) {
    for (const p of snapshot.players) {
      const delta = game.roundScoreDeltas[p.id];
      if (delta === undefined) continue;
      const isMe = me && p.id === me.id;
      const div = document.createElement("div");
      div.className = `score-delta-item ${isMe ? "score-delta-me" : ""}`;
      div.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="score-delta-value ${delta > 0 ? "delta-positive" : ""}">+${delta}</span>`;
      deltasEl.appendChild(div);
    }
  }

  if (amHost) {
    $("results-host-area").hidden = false;
  } else {
    $("results-host-area").hidden = true;
  }
}

// --- Echo results ---
function renderEchoResults(snapshot) {
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  const echoName = game.echoName || "???";
  const isEchoMe = me && game.echoId === me.id;

  $("offkey-reveal").innerHTML = `
    <div class="offkey-reveal-card ${isEchoMe ? "offkey-reveal-me" : ""}">
      <span class="offkey-label">The Echo was</span>
      <span class="offkey-name">${escapeHtml(echoName)}${isEchoMe ? " (you!)" : ""}</span>
    </div>
  `;

  $("prompts-comparison").innerHTML = `
    <div class="prompt-compare-grid">
      <div class="prompt-compare-card">
        <span class="prompt-compare-label">Group prompt</span>
        <p class="prompt-compare-text">${escapeHtml(game.normalPrompt)}</p>
      </div>
      <div class="prompt-compare-card offkey-prompt">
        <span class="prompt-compare-label">Echo prompt</span>
        <p class="prompt-compare-text">${escapeHtml(game.echoPrompt)}</p>
      </div>
    </div>
  `;

  const deltasEl = $("round-score-deltas");
  deltasEl.innerHTML = "";
  if (game.roundScoreDeltas) {
    snapshot.players.forEach(p => {
      const delta = game.roundScoreDeltas[p.id];
      if (delta === undefined) return;
      const isMe = me && p.id === me.id;
      const div = document.createElement("div");
      div.className = `score-delta-item ${isMe ? "score-delta-me" : ""}`;
      div.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="score-delta-value ${delta > 0 ? "delta-positive" : ""}">+${delta}</span>`;
      deltasEl.appendChild(div);
    });
  }

  $("results-host-area").hidden = !amHost;
}

// --- Chain results ---
function renderChainResults(snapshot) {
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

  const saboteurName = game.saboteurName || "???";
  const isSaboteurMe = me && game.saboteurId === me.id;

  $("offkey-reveal").innerHTML = `
    <div class="offkey-reveal-card ${isSaboteurMe ? "offkey-reveal-me" : ""}">
      <span class="offkey-label">The Saboteur was</span>
      <span class="offkey-name">${escapeHtml(saboteurName)}${isSaboteurMe ? " (you!)" : ""}</span>
    </div>
  `;

  $("prompts-comparison").innerHTML = `
    <div class="glass-panel" style="padding:15px; margin-top:10px; border:1px solid var(--deep-blue); text-align:center;">
       <span style="font-size:0.8em; text-transform:uppercase; color:var(--deep-blue); font-weight:bold;">The Final Sentence</span>
       <p style="font-size:1.2em; font-weight:bold; margin-top:8px;">"${escapeHtml(game.finalSentence)}"</p>
       <div style="margin-top:10px; font-size:0.9em;">
         Target word was: <span style="color:#ef4444; font-weight:bold;">${escapeHtml(game.targetWord)}</span>
       </div>
    </div>
  `;

  const deltasEl = $("round-score-deltas");
  deltasEl.innerHTML = "";
  if (game.roundScoreDeltas) {
    snapshot.players.forEach(p => {
      const delta = game.roundScoreDeltas[p.id];
      if (delta === undefined) return;
      const isMe = me && p.id === me.id;
      const div = document.createElement("div");
      div.className = `score-delta-item ${isMe ? "score-delta-me" : ""}`;
      div.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="score-delta-value ${delta > 0 ? "delta-positive" : (delta < 0 ? "delta-negative" : "")}">${delta > 0 ? '+' : ''}${delta}</span>`;
      deltasEl.appendChild(div);
    });
  }

  $("results-host-area").hidden = !amHost;
}

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
function renderGameOverPhase(snapshot) {
  $("phase-gameover").hidden = false;
  const game = snapshot.game;
  const amHost = me && snapshot.hostId === me.id;

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
//   WORD SPY CONTROLS
// ============================================================

$("wordspy-clue-input").addEventListener("input", () => {
  $("submit-clue-btn").disabled = $("wordspy-clue-input").value.trim() === "";
});

$("submit-clue-btn").addEventListener("click", () => {
  if (hasSubmittedClue) return;
  const clue = $("wordspy-clue-input").value.trim();
  if (!clue) return;
  hasSubmittedClue = true;
  $("submit-clue-btn").disabled = true;
  $("submit-clue-btn").textContent = "Sent!";
  socket.emit("game:submitClue", { clue }, () => {});
  $("wordspy-clue-submit-area").hidden = true;
});

$("wordspy-guess-input").addEventListener("input", () => {
  $("submit-spy-guess-btn").disabled = $("wordspy-guess-input").value.trim() === "";
});

$("submit-spy-guess-btn").addEventListener("click", () => {
  if (hasSubmittedSpyGuess) return;
  const guess = $("wordspy-guess-input").value.trim();
  if (!guess) return;
  hasSubmittedSpyGuess = true;
  $("submit-spy-guess-btn").disabled = true;
  $("submit-spy-guess-btn").textContent = "Guessed!";
  socket.emit("game:submitSpyGuess", { guess }, () => {});
  $("wordspy-guess-area").hidden = true;
  $("wordspy-guess-waiting").hidden = false;
});

// ============================================================
//   ECHO CONTROLS
// ============================================================

$("echo-answer-input").addEventListener("input", () => {
  $("submit-echo-answer-btn").disabled = $("echo-answer-input").value.trim() === "";
});

$("submit-echo-answer-btn").addEventListener("click", () => {
  if (hasSubmittedAnswer) return;
  const answer = $("echo-answer-input").value.trim();
  if (!answer) return;
  hasSubmittedAnswer = true;
  $("submit-echo-answer-btn").disabled = true;
  $("submit-echo-answer-btn").textContent = "Submitted!";
  socket.emit("game:submitAnswer", { answer }, () => {});
  $("echo-answer-submit-area").hidden = true;
  $("echo-answer-waiting").hidden = false;
});

// ============================================================
//   CHAIN CONTROLS
// ============================================================

$("chain-word-input").addEventListener("input", () => {
  $("submit-chain-word-btn").disabled = $("chain-word-input").value.trim() === "";
});

$("submit-chain-word-btn").addEventListener("click", () => {
  const word = $("chain-word-input").value.trim().split(/\s+/)[0];
  if (!word) return;
  $("submit-chain-word-btn").disabled = true;
  socket.emit("game:addWord", { word }, (resp) => {
    if (resp?.ok) {
       $("chain-word-input").value = "";
    } else {
       $("submit-chain-word-btn").disabled = false;
    }
  });
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
      // Reset round state on new round
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
      if (phase === "clues" && (snapshot.game.round !== prevRound || prevPhase !== "clues")) {
        hasSubmittedClue = false;
        hasSubmittedVote = false;
        hasSubmittedSpyGuess = false;
        $("wordspy-clue-input").value = "";
        $("wordspy-guess-input").value = "";
      }
      if (phase === "voting" && prevPhase !== "voting") {
        hasSubmittedVote = false;
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
    clearTimerInterval();
    show("view-room");
  }
});

socket.on("game:yourPrompt", ({ prompt, round }) => {
  myPrompt = prompt;
  $("prompt-text").textContent = prompt;
});

socket.on("game:yourWordSpy", ({ word, category, isSpy }) => {
  myWordSpyInfo = { word, category, isSpy };
  hasSubmittedClue = false;
  hasSubmittedSpyGuess = false;
  $("wordspy-clue-input").value = "";
  $("wordspy-guess-input").value = "";
  $("submit-clue-btn").textContent = "Send";
  $("submit-spy-guess-btn").textContent = "Guess";
});

socket.on("game:yourEcho", ({ prompt, isEcho }) => {
  myEchoInfo = { prompt, isEcho };
  hasSubmittedAnswer = false;
  $("echo-answer-input").value = "";
  $("submit-echo-answer-btn").textContent = "Submit";
});

socket.on("game:yourChain", ({ isSaboteur, targetWord, startingPhrase }) => {
  myChainInfo = { isSaboteur, targetWord, startingPhrase };
  hasSubmittedWord = false;
  $("chain-word-input").value = "";
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
