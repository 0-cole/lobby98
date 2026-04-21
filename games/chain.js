// Chain — Players take turns adding ONE word to build a sentence.
// The Saboteur must sneak in their secret target word.
// Anyone can call out the Saboteur — right or wrong, there's a penalty.

const STARTING_PHRASES = [
  "Once upon a time,",
  "Deep in the jungle,",
  "Yesterday at the mall,",
  "On the way to school,",
  "In a world without pizza,",
  "Every morning without fail,",
  "My grandmother always said,",
  "The astronaut looked down and",
  "Nobody expected that",
  "Three hours before midnight,",
];

const TARGET_WORDS = [
  "pineapple", "submarine", "grandma", "betrayal", "Wisconsin",
  "spatula", "tornado", "encyclopedia", "flamingo", "spaghetti",
  "trampoline", "avalanche", "harmonica", "caterpillar", "marshmallow",
  "saxophone", "umbrella", "quarterback", "parachute", "lollipop",
];

const DEFAULT_ROUNDS = 5;
const TIMER_TURN = 10_000;
const TIMER_RESULTS = 15_000;
const TIMER_INTERMISSION = 10_000;
const MAX_TURNS = 20;
const WORD_LIMIT = 1;   // one word per turn

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

export const chainGame = {
  start(room, ctx, options) {
    const playerIds = [...room.players.keys()];
    const totalRounds = Math.min(options?.rounds || DEFAULT_ROUNDS, 10);
    const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
    const saboteurOrder = Array.from({ length: totalRounds }, (_, i) => shuffled[i % shuffled.length]);

    room.game = {
      phase: "chain",
      round: 1,
      totalRounds,
      saboteurId: saboteurOrder[0],
      saboteurName: room.players.get(saboteurOrder[0])?.name || "???",
      saboteurOrder,
      targetWord: pick(TARGET_WORDS),
      startingPhrase: pick(STARTING_PHRASES),
      words: [],                // array of { playerId, word }
      turnOrder: [],            // cycle of active players
      turnIndex: 0,
      accusation: null,         // { accuserId, accusedId } if someone called it
      scores: new Map(playerIds.map(id => [id, 0])),
      activePlayers: new Set(playerIds),
      roundScoreDeltas: {},
      timerEnd: null
    };

    this._setupTurnOrder(room);
    this._notifyPlayers(room, ctx);
    ctx.addSystemMessage(room, `🔗 Chain — Round 1 of ${totalRounds}. Build the sentence word by word!`);
    ctx.broadcastRoom(room);

    this._startNextTurn(room, ctx);
  },

  handleEvent(room, ctx, socketId, action, payload) {
    if (action === "addWord") {
      this._handleAddWord(room, ctx, socketId, payload.word);
    } else if (action === "callSaboteur") {
      this._handleCallSaboteur(room, ctx, socketId, payload.accusedId);
    } else if (action === "nextRound") {
      this._advanceToNextRound(room, ctx);
    }
  },

  handleDisconnect(room, ctx, socketId) {
    const g = room.game;
    if (!g) return;

    g.activePlayers.delete(socketId);

    if (g.activePlayers.size < 2) {
      ctx.clearRoomTimer(room);
      room.game = null;
      room.mode = null;
      ctx.addSystemMessage(room, `Not enough players — game ended.`);
      return;
    }

    // Remove from turn order
    const turnIdx = g.turnOrder.indexOf(socketId);
    if (turnIdx > -1) {
      g.turnOrder.splice(turnIdx, 1);
      if (g.turnIndex >= g.turnOrder.length) g.turnIndex = 0;
      else if (turnIdx < g.turnIndex) g.turnIndex--;
    }

    if (socketId === g.saboteurId && g.phase === "chain") {
      ctx.clearRoomTimer(room);
      ctx.addSystemMessage(room, `The Saboteur disconnected — restarting round...`);
      this._startNextRoundSameRound(room, ctx);
      return;
    }

    // If it was their turn, skip to next
    if (g.phase === "chain" && g.turnOrder.length > 0) {
      if (turnIdx <= g.turnIndex) {
        ctx.clearRoomTimer(room);
        this._startNextTurn(room, ctx);
      } else {
        ctx.broadcastRoom(room);
      }
    } else {
      ctx.broadcastRoom(room);
    }
  },

  _setupTurnOrder(room) {
    const g = room.game;
    g.turnOrder = [...g.activePlayers].sort(() => Math.random() - 0.5);
    g.turnIndex = 0;
  },

  _notifyPlayers(room, ctx) {
    const g = room.game;
    for (const pid of g.activePlayers) {
      if (!room.players.has(pid)) continue;
      const isSaboteur = pid === g.saboteurId;
      ctx.io.to(pid).emit("game:yourChain", {
        isSaboteur,
        targetWord: isSaboteur ? g.targetWord : null,
        startingPhrase: g.startingPhrase,
        round: g.round
      });
    }
  },

  _startNextTurn(room, ctx) {
    const g = room.game;
    if (g.phase !== "chain") return;

    // Check end conditions
    if (g.words.length >= MAX_TURNS) {
      ctx.clearRoomTimer(room);
      this._endChain(room, ctx);
      return;
    }

    if (g.turnOrder.length === 0) {
      ctx.clearRoomTimer(room);
      this._endChain(room, ctx);
      return;
    }

    g.turnIndex = g.turnIndex % g.turnOrder.length;
    g.timerEnd = Date.now() + TIMER_TURN;
    ctx.broadcastRoom(room);

    const currentPlayerId = g.turnOrder[g.turnIndex];
    ctx.setRoomTimer(room, TIMER_TURN, () => {
      if (g.phase !== "chain") return;
      if (g.turnOrder[g.turnIndex] !== currentPlayerId) return;
      // Auto-add a placeholder
      g.words.push({ playerId: currentPlayerId, word: "..." });
      g.turnIndex = (g.turnIndex + 1) % g.turnOrder.length;
      this._startNextTurn(room, ctx);
    });
  },

  _handleAddWord(room, ctx, socketId, word) {
    const g = room.game;
    if (!g || g.phase !== "chain") return;
    if (g.turnOrder[g.turnIndex] !== socketId) return;

    const clean = (word || "").trim().split(/\s+/)[0].substring(0, 20);
    if (!clean) return;

    ctx.clearRoomTimer(room);
    g.words.push({ playerId: socketId, word: clean });
    g.turnIndex = (g.turnIndex + 1) % g.turnOrder.length;
    ctx.broadcastRoom(room);

    if (g.words.length >= MAX_TURNS) {
      this._endChain(room, ctx);
    } else {
      this._startNextTurn(room, ctx);
    }
  },

  _handleCallSaboteur(room, ctx, accuserId, accusedId) {
    const g = room.game;
    if (!g || g.phase !== "chain") return;
    if (!g.activePlayers.has(accuserId)) return;
    if (!g.activePlayers.has(accusedId)) return;
    if (accuserId === accusedId) return;
    // Current player can't accuse on their turn
    if (g.turnOrder[g.turnIndex] === accuserId) return;

    ctx.clearRoomTimer(room);
    g.accusation = { accuserId, accusedId };
    this._endChain(room, ctx);
  },

  _endChain(room, ctx) {
    const g = room.game;
    g.phase = "results";
    ctx.clearRoomTimer(room);

    const sentence = g.startingPhrase + " " + g.words.map(w => w.word).join(" ");
    const sentenceLower = sentence.toLowerCase();
    const targetUsed = sentenceLower.includes(g.targetWord.toLowerCase());
    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 0;

    if (g.accusation) {
      const { accuserId, accusedId } = g.accusation;
      const correctAccusation = accusedId === g.saboteurId;
      if (correctAccusation) {
        deltas[accuserId] = (deltas[accuserId] || 0) + 3;
        for (const pid of g.activePlayers) {
          if (pid !== accuserId && pid !== g.saboteurId) {
            deltas[pid] = (deltas[pid] || 0) + 1;
          }
        }
        ctx.addSystemMessage(room, `🚨 ${room.players.get(accuserId)?.name} correctly caught ${g.saboteurName}!`);
      } else {
        deltas[g.saboteurId] = (deltas[g.saboteurId] || 0) + 3;
        deltas[accusedId] = (deltas[accusedId] || 0) - 1;
        ctx.addSystemMessage(room, `😂 Wrong! ${g.saboteurName} was the Saboteur and gets away!`);
      }
    } else if (targetUsed) {
      deltas[g.saboteurId] = (deltas[g.saboteurId] || 0) + 4;
      ctx.addSystemMessage(room, `🎉 ${g.saboteurName} sneaked in "${g.targetWord}" without being caught! (+4)`);
    } else {
      for (const pid of g.activePlayers) deltas[pid] = (deltas[pid] || 0) + 1;
      ctx.addSystemMessage(room, `😅 The Saboteur wimped out — "${g.targetWord}" never made it in. Everyone gets +1!`);
    }

    for (const [pid, delta] of Object.entries(deltas)) {
      if (delta < 0) {
        g.scores.set(pid, Math.max(0, (g.scores.get(pid) || 0) + delta));
      } else {
        g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
      }
    }
    g.roundScoreDeltas = deltas;
    g.finalSentence = sentence;
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

  _startNextRound(room, ctx, sameRound = false) {
    const g = room.game;
    if (!sameRound) g.round++;
    g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));

    if (g.activePlayers.size < 2) {
      g.phase = "gameover";
      ctx.addSystemMessage(room, `Not enough players — game over!`);
      ctx.broadcastRoom(room);
      return;
    }

    g.saboteurId = g.saboteurOrder[g.round - 1];
    if (!g.activePlayers.has(g.saboteurId)) {
      const remaining = [...g.activePlayers];
      g.saboteurId = pick(remaining);
    }
    g.saboteurName = room.players.get(g.saboteurId)?.name || "???";
    g.targetWord = pick(TARGET_WORDS);
    g.startingPhrase = pick(STARTING_PHRASES);
    g.words = [];
    g.accusation = null;
    g.finalSentence = null;
    g.roundScoreDeltas = {};
    g.phase = "chain";

    this._setupTurnOrder(room);
    this._notifyPlayers(room, ctx);
    ctx.addSystemMessage(room, `🔗 Round ${g.round} of ${g.totalRounds}. Build the sentence!`);
    ctx.broadcastRoom(room);
    this._startNextTurn(room, ctx);
  },

  _startNextRoundSameRound(room, ctx) {
    this._startNextRound(room, ctx, true);
  }
};
