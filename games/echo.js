// Echo — Everyone answers a prompt. One player (the Echo) got a twist prompt.
// Group finds the odd answer. Answers are shown anonymously.

const PROMPT_PAIRS = [
  { normal: "Name a reason to cancel plans", echo: "Name a reason to cancel plans, but make it weird" },
  { normal: "What do you bring to a potluck?", echo: "What do you bring to a potluck at a funeral?" },
  { normal: "Describe your perfect Saturday", echo: "Describe your perfect Saturday if you were 80 years old" },
  { normal: "Name something you'd find in a kitchen", echo: "Name something you'd find in a haunted kitchen" },
  { normal: "Give a job interview tip", echo: "Give a job interview tip for a supervillain" },
  { normal: "Describe a good vacation", echo: "Describe a good vacation on no budget" },
  { normal: "Name a thing people collect", echo: "Name a thing only weirdos collect" },
  { normal: "What's the best excuse to leave a party early?", echo: "What's the worst excuse to leave a party early?" },
  { normal: "Give a compliment to a coworker", echo: "Give a compliment to a coworker that is secretly an insult" },
  { normal: "Name something you say before bed", echo: "Name something a vampire says before bed" },
  { normal: "Describe a first date", echo: "Describe a first date that definitely goes wrong" },
  { normal: "Name a red flag in a person", echo: "Name a red flag that is actually a green flag" },
  { normal: "What's in your dream house?", echo: "What's in your dream house if you had a villain lair?" },
  { normal: "Name a boring superpower", echo: "Name a superpower that sounds boring but is secretly amazing" },
  { normal: "Describe the best type of pizza", echo: "Describe a pizza nobody should ever order" },
];

const DEFAULT_ROUNDS = 5;
const TIMER_SUBMIT = 45_000;
const TIMER_DISCUSS = 60_000;
const TIMER_VOTE = 20_000;
const TIMER_INTERMISSION = 10_000;
const MAX_ANSWER_LEN = 40;

function pickPromptPairs(n) {
  const shuffled = [...PROMPT_PAIRS].sort(() => Math.random() - 0.5);
  return Array.from({ length: n }, (_, i) => shuffled[i % shuffled.length]);
}

export const echoGame = {
  start(room, ctx, options) {
    const playerIds = [...room.players.keys()];
    const totalRounds = Math.min(options?.rounds || DEFAULT_ROUNDS, 10);
    const prompts = pickPromptPairs(totalRounds);

    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const echoOrder = Array.from({ length: totalRounds }, (_, i) => shuffled[i % shuffled.length]);

    room.game = {
      phase: "answering",
      round: 1,
      totalRounds,
      echoId: echoOrder[0],
      echoName: room.players.get(echoOrder[0])?.name || "???",
      echoOrder,
      promptPair: prompts[0],
      prompts,
      answers: new Map(),       // playerId -> answer text
      votes: new Map(),         // voterId -> answerId (playerId they voted)
      answerOrder: [],          // shuffled array of playerIds used to anonymise display
      scores: new Map(playerIds.map(id => [id, 0])),
      activePlayers: new Set(playerIds),
      roundScoreDeltas: {},
      timerEnd: null
    };

    this._sendPromptsToPlayers(room, ctx);
    ctx.addSystemMessage(room, `🔊 Echo — Round 1 of ${totalRounds}. Answer the prompt! (45s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_SUBMIT, () => this._forceSubmitEnd(room, ctx));
  },

  handleEvent(room, ctx, socketId, action, payload) {
    if (action === "submitAnswer") {
      this._handleAnswerSubmit(room, ctx, socketId, payload.answer);
    } else if (action === "submitVote") {
      this._handleVoteSubmit(room, ctx, socketId, payload.targetId);
    } else if (action === "nextRound") {
      this._advanceToNextRound(room, ctx);
    }
  },

  handleDisconnect(room, ctx, socketId) {
    const g = room.game;
    if (!g) return;

    g.activePlayers.delete(socketId);
    g.answers.delete(socketId);
    g.votes.delete(socketId);

    if (g.activePlayers.size < 3) {
      ctx.clearRoomTimer(room);
      room.game = null;
      room.mode = null;
      ctx.addSystemMessage(room, `Not enough players — game ended.`);
      return;
    }

    if (g.phase === "answering" && socketId === g.echoId) {
      ctx.clearRoomTimer(room);
      ctx.addSystemMessage(room, `The Echo disconnected — restarting round...`);
      this._reassignEcho(room, ctx);
      return;
    }

    if ((g.phase === "discuss" || g.phase === "voting") && socketId === g.echoId) {
      ctx.clearRoomTimer(room);
      this._transitionToResults(room, ctx, true);
      return;
    }

    if (g.phase === "answering" && g.answers.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToDiscuss(room, ctx);
    } else if (g.phase === "voting" && g.votes.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToResults(room, ctx);
    } else {
      ctx.broadcastRoom(room);
    }
  },

  _sendPromptsToPlayers(room, ctx) {
    const g = room.game;
    for (const pid of g.activePlayers) {
      if (!room.players.has(pid)) continue;
      const isEcho = pid === g.echoId;
      const prompt = isEcho ? g.promptPair.echo : g.promptPair.normal;
      ctx.io.to(pid).emit("game:yourEcho", { prompt, round: g.round, isEcho });
    }
  },

  _reassignEcho(room, ctx) {
    const g = room.game;
    const remaining = [...g.activePlayers];
    g.echoId = remaining[Math.floor(Math.random() * remaining.length)];
    g.echoName = room.players.get(g.echoId)?.name || "???";
    g.answers = new Map();
    g.votes = new Map();
    g.phase = "answering";
    this._sendPromptsToPlayers(room, ctx);
    ctx.broadcastRoom(room);
    ctx.setRoomTimer(room, TIMER_SUBMIT, () => this._forceSubmitEnd(room, ctx));
  },

  _handleAnswerSubmit(room, ctx, socketId, answer) {
    const g = room.game;
    if (!g || g.phase !== "answering") return;
    if (!g.activePlayers.has(socketId) || g.answers.has(socketId)) return;

    const clean = (answer || "").trim().substring(0, MAX_ANSWER_LEN);
    if (!clean) return;

    g.answers.set(socketId, clean);
    ctx.broadcastRoom(room);

    if (g.answers.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToDiscuss(room, ctx);
    }
  },

  _forceSubmitEnd(room, ctx) {
    const g = room.game;
    if (!g || g.phase !== "answering") return;
    for (const pid of g.activePlayers) {
      if (!g.answers.has(pid)) {
        g.answers.set(pid, "*(no answer)*");
        const name = room.players.get(pid)?.name || "???";
        ctx.addSystemMessage(room, `⏰ ${name} didn't answer in time`);
      }
    }
    this._transitionToDiscuss(room, ctx);
  },

  _transitionToDiscuss(room, ctx) {
    const g = room.game;
    // Shuffle the answer order for anonymous display
    g.answerOrder = [...g.activePlayers].sort(() => Math.random() - 0.5);
    g.phase = "discuss";
    g.timerEnd = Date.now() + TIMER_DISCUSS;
    ctx.addSystemMessage(room, `📨 All answers in! Read them — one's the Echo. (60s)`);
    ctx.broadcastRoom(room);
    ctx.setRoomTimer(room, TIMER_DISCUSS, () => this._transitionToVoting(room, ctx));
  },

  _transitionToVoting(room, ctx) {
    const g = room.game;
    g.phase = "voting";
    g.timerEnd = Date.now() + TIMER_VOTE;
    ctx.addSystemMessage(room, `⏳ Vote — which answer is the Echo's? (20s)`);
    ctx.broadcastRoom(room);
    ctx.setRoomTimer(room, TIMER_VOTE, () => this._transitionToResults(room, ctx));
  },

  _handleVoteSubmit(room, ctx, socketId, targetId) {
    const g = room.game;
    if (!g || g.phase !== "voting") return;
    if (!g.activePlayers.has(socketId) || g.votes.has(socketId)) return;
    if (!g.answers.has(targetId)) return;

    g.votes.set(socketId, targetId);
    ctx.broadcastRoom(room);

    if (g.votes.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToResults(room, ctx);
    }
  },

  _transitionToResults(room, ctx, echoDisconnected = false) {
    const g = room.game;
    g.phase = "results";
    ctx.clearRoomTimer(room);

    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 0;

    if (echoDisconnected) {
      g.roundScoreDeltas = deltas;
      ctx.addSystemMessage(room, `The Echo disconnected! No winner this round.`);
      ctx.broadcastRoom(room);
      return;
    }

    let echoVotes = 0;
    for (const [, targetId] of g.votes) {
      if (targetId === g.echoId) echoVotes++;
    }

    const majority = Math.floor(g.activePlayers.size / 2) + 1;
    const echoCaught = echoVotes >= majority;

    if (echoCaught) {
      for (const [voterId, targetId] of g.votes) {
        if (targetId === g.echoId) {
          deltas[voterId] = (deltas[voterId] || 0) + 2;
        }
      }
    } else {
      deltas[g.echoId] = (deltas[g.echoId] || 0) + 3;
    }

    for (const [pid, delta] of Object.entries(deltas)) {
      g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
    }
    g.roundScoreDeltas = deltas;

    if (echoCaught) {
      ctx.addSystemMessage(room, `🎯 The Echo was ${g.echoName} — they were found!`);
    } else {
      ctx.addSystemMessage(room, `😎 The Echo was ${g.echoName} — they blended in!`);
    }
    ctx.broadcastRoom(room);
  },

  _advanceToNextRound(room, ctx) {
    const g = room.game;
    if (!g || g.phase !== "results") return;

    if (g.round >= g.totalRounds) {
      g.phase = "gameover";
      ctx.clearRoomTimer(room);
      ctx.addSystemMessage(room, `🏆 Game over! Check the final scores.`);
      ctx.broadcastRoom(room);
      ctx.setRoomTimer(room, 30_000, () => {
        if (room.game?.phase === "gameover") ctx.backToLobby(room);
      });
      return;
    }

    g.phase = "intermission";
    g.timerEnd = Date.now() + TIMER_INTERMISSION;
    ctx.addSystemMessage(room, `⏸ Next round in 10 seconds...`);
    ctx.broadcastRoom(room);
    ctx.setRoomTimer(room, TIMER_INTERMISSION, () => this._startNextRound(room, ctx));
  },

  _startNextRound(room, ctx) {
    const g = room.game;
    g.round++;
    g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));

    if (g.activePlayers.size < 3) {
      g.phase = "gameover";
      ctx.addSystemMessage(room, `Not enough players — game over!`);
      ctx.broadcastRoom(room);
      return;
    }

    g.echoId = g.echoOrder[g.round - 1];
    g.echoName = room.players.get(g.echoId)?.name || "???";
    if (!g.activePlayers.has(g.echoId)) {
      const remaining = [...g.activePlayers];
      g.echoId = remaining[Math.floor(Math.random() * remaining.length)];
      g.echoName = room.players.get(g.echoId)?.name || "???";
    }

    g.promptPair = g.prompts[g.round - 1];
    g.answers = new Map();
    g.votes = new Map();
    g.answerOrder = [];
    g.roundScoreDeltas = {};
    g.phase = "answering";

    this._sendPromptsToPlayers(room, ctx);
    ctx.addSystemMessage(room, `🔊 Round ${g.round} of ${g.totalRounds}. Answer the prompt! (45s)`);
    ctx.broadcastRoom(room);
    ctx.setRoomTimer(room, TIMER_SUBMIT, () => this._forceSubmitEnd(room, ctx));
  }
};
