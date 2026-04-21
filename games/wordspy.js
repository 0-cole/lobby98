const DICTIONARY = {
  "Geography": ["volcano", "desert", "waterfall", "canyon", "island", "glacier"],
  "Animals": ["penguin", "kangaroo", "elephant", "octopus", "platypus", "chameleon"],
  "Food": ["pizza", "sushi", "taco", "spaghetti", "hamburger", "ice cream"],
  "Household Objects": ["toaster", "vacuum", "microwave", "toothbrush", "pillow", "mirror"],
  "Professions": ["firefighter", "astronaut", "chef", "detective", "plumber", "doctor"],
  "Emotions": ["jealousy", "excitement", "nostalgia", "confusion", "anxiety", "relief"]
};

const DEFAULT_ROUNDS = 5;
const TIMER_CLUE = 20_000;
const TIMER_DISCUSS = 45_000;
const TIMER_VOTE = 20_000;
const TIMER_SPY_GUESS = 30_000;
const TIMER_INTERMISSION = 10_000;

function getRandomWord() {
  const cats = Object.keys(DICTIONARY);
  const category = cats[Math.floor(Math.random() * cats.length)];
  const words = DICTIONARY[category];
  const word = words[Math.floor(Math.random() * words.length)];
  return { category, word };
}

export const wordspyGame = {
  start(room, ctx, options) {
    const playerIds = [...room.players.keys()];
    const totalRounds = Math.min(options?.rounds || DEFAULT_ROUNDS, 10);

    const shuffledPlayers = [...playerIds].sort(() => Math.random() - 0.5);
    const spyOrder = [];
    for (let i = 0; i < totalRounds; i++) {
      spyOrder.push(shuffledPlayers[i % shuffledPlayers.length]);
    }

    room.game = {
      phase: "clues",
      round: 1,
      totalRounds,
      spyId: spyOrder[0],
      spyName: room.players.get(spyOrder[0])?.name || "???",
      spyOrder,
      secretPair: getRandomWord(),
      clues: [],
      turnOrder: [],
      turnIndex: 0,
      votes: new Map(),
      spyGuess: null,
      scores: new Map(playerIds.map(id => [id, 0])),
      activePlayers: new Set(playerIds),
      roundScoreDeltas: {},
      timerEnd: null
    };

    this._startCluePhase(room, ctx);
  },

  handleEvent(room, ctx, socketId, action, payload) {
    if (action === "submitClue") {
      this._handleClueSubmit(room, ctx, socketId, payload.clue);
    } else if (action === "submitVote") {
      this._handleVoteSubmit(room, ctx, socketId, payload.targetId);
    } else if (action === "submitSpyGuess") {
      this._handleSpyGuessSubmit(room, ctx, socketId, payload.guess);
    } else if (action === "nextRound") {
      this._advanceToNextRound(room, ctx);
    }
  },

  handleDisconnect(room, ctx, socketId) {
    const g = room.game;
    if (!g) return;

    g.activePlayers.delete(socketId);
    g.votes.delete(socketId);

    if (g.activePlayers.size < 3) {
      ctx.clearRoomTimer(room);
      room.game = null;
      room.mode = null;
      ctx.addSystemMessage(room, `Not enough players — game ended.`);
      return;
    }

    if (socketId === g.spyId) {
      if (g.phase === "clues") {
        ctx.clearRoomTimer(room);
        ctx.addSystemMessage(room, `The Spy disconnected — restarting round...`);
        this._startNextRound(room, ctx, true);
        return;
      } else if (g.phase === "discuss" || g.phase === "voting" || g.phase === "spy-guess") {
        ctx.clearRoomTimer(room);
        this._transitionToResults(room, ctx, { spyDisconnected: true });
        return;
      }
    }

    if (g.phase === "clues") {
      // If the current turn player disconnected, skip them
      if (g.turnOrder[g.turnIndex] === socketId) {
        ctx.clearRoomTimer(room);
        this._handleClueSubmit(room, ctx, socketId, "*(disconnected)*", true);
      } else {
        // Remove from turn order
        const idx = g.turnOrder.indexOf(socketId);
        if (idx > -1) {
          g.turnOrder.splice(idx, 1);
          if (idx < g.turnIndex) g.turnIndex--;
        }
        ctx.broadcastRoom(room);
      }
    } else if (g.phase === "voting" && g.votes.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._checkVotes(room, ctx);
    } else {
      ctx.broadcastRoom(room);
    }
  },

  _startCluePhase(room, ctx) {
    const g = room.game;
    g.phase = "clues";
    g.clues = [];
    g.votes = new Map();
    g.spyGuess = null;
    g.roundScoreDeltas = {};
    
    // Randomize turn order for clues
    g.turnOrder = [...g.activePlayers].sort(() => Math.random() - 0.5);
    g.turnIndex = 0;

    for (const pid of g.activePlayers) {
      if (!room.players.has(pid)) continue;
      const isSpy = pid === g.spyId;
      const word = isSpy ? "???" : g.secretPair.word;
      ctx.io.to(pid).emit("game:yourWordSpy", { 
        word, 
        category: g.secretPair.category,
        isSpy 
      });
    }

    ctx.addSystemMessage(room, `🕵️ Word Spy — Round ${g.round}. Clue time!`);
    this._startNextTurn(room, ctx);
  },

  _startNextTurn(room, ctx) {
    const g = room.game;
    if (g.turnIndex >= g.turnOrder.length) {
      this._transitionToDiscuss(room, ctx);
      return;
    }

    const currentPlayerId = g.turnOrder[g.turnIndex];
    g.timerEnd = Date.now() + TIMER_CLUE;
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_CLUE, () => {
      this._handleClueSubmit(room, ctx, currentPlayerId, "*(out of time)*", true);
    });
  },

  _handleClueSubmit(room, ctx, socketId, clueText, forced = false) {
    const g = room.game;
    if (!g || g.phase !== "clues") return;
    if (g.turnOrder[g.turnIndex] !== socketId) return;

    ctx.clearRoomTimer(room);
    const cleanClue = (clueText || "").trim().substring(0, 30);
    g.clues.push({
      playerId: socketId,
      name: room.players.get(socketId)?.name || "???",
      text: cleanClue || "*(empty)*"
    });

    g.turnIndex++;
    this._startNextTurn(room, ctx);
  },

  _transitionToDiscuss(room, ctx) {
    const g = room.game;
    g.phase = "discuss";
    g.timerEnd = Date.now() + TIMER_DISCUSS;
    ctx.addSystemMessage(room, `All clues are in! Discuss — who is the Spy? (45s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_DISCUSS, () => {
      this._transitionToVoting(room, ctx);
    });
  },

  _transitionToVoting(room, ctx) {
    const g = room.game;
    g.phase = "voting";
    g.timerEnd = Date.now() + TIMER_VOTE;
    ctx.addSystemMessage(room, `⏳ Vote for the Spy! (20s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_VOTE, () => {
      this._checkVotes(room, ctx);
    });
  },

  _handleVoteSubmit(room, ctx, socketId, targetId) {
    const g = room.game;
    if (!g || g.phase !== "voting") return;
    if (!g.activePlayers.has(socketId)) return;
    if (g.votes.has(socketId)) return;
    if (!g.activePlayers.has(targetId)) return;

    g.votes.set(socketId, targetId);
    ctx.broadcastRoom(room);

    if (g.votes.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._checkVotes(room, ctx);
    }
  },

  _checkVotes(room, ctx) {
    const g = room.game;
    let spyVotes = 0;
    for (const [, targetId] of g.votes) {
      if (targetId === g.spyId) spyVotes++;
    }

    const majorityThreshold = Math.floor(g.activePlayers.size / 2) + 1;
    g.spyCaught = spyVotes >= majorityThreshold;

    if (g.spyCaught) {
      g.phase = "spy-guess";
      g.timerEnd = Date.now() + TIMER_SPY_GUESS;
      ctx.addSystemMessage(room, `🚨 The Spy was caught! But they get one chance to guess the word... (30s)`);
      ctx.broadcastRoom(room);

      ctx.setRoomTimer(room, TIMER_SPY_GUESS, () => {
        this._transitionToResults(room, ctx);
      });
    } else {
      this._transitionToResults(room, ctx);
    }
  },

  _handleSpyGuessSubmit(room, ctx, socketId, guess) {
    const g = room.game;
    if (!g || g.phase !== "spy-guess") return;
    if (socketId !== g.spyId) return;

    g.spyGuess = (guess || "").trim().toLowerCase();
    ctx.clearRoomTimer(room);
    this._transitionToResults(room, ctx);
  },

  _transitionToResults(room, ctx, opts = {}) {
    const g = room.game;
    g.phase = "results";
    ctx.clearRoomTimer(room);

    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 0;

    if (opts.spyDisconnected) {
      g.roundScoreDeltas = deltas;
      ctx.addSystemMessage(room, `The Spy disconnected! No winner this round.`);
      ctx.broadcastRoom(room);
      return;
    }

    const correctWord = g.secretPair.word.toLowerCase();
    const guessCorrect = g.spyGuess === correctWord;
    
    if (g.spyCaught) {
      if (guessCorrect) {
        deltas[g.spyId] = 4;
        ctx.addSystemMessage(room, `🤯 The Spy (${g.spyName}) was caught, BUT correctly guessed the word: ${g.secretPair.word}!`);
      } else {
        // Group wins
        for (const [voterId, targetId] of g.votes) {
          if (targetId === g.spyId && voterId !== g.spyId) {
            deltas[voterId] = 2;
          }
        }
        ctx.addSystemMessage(room, `🎉 The Spy (${g.spyName}) was caught and failed to guess the word (${g.secretPair.word})!`);
      }
    } else {
      deltas[g.spyId] = 3;
      ctx.addSystemMessage(room, `🕵️ The Spy (${g.spyName}) got away with it! The word was: ${g.secretPair.word}.`);
    }

    for (const [pid, delta] of Object.entries(deltas)) {
      g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
    }
    g.roundScoreDeltas = deltas;
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
        if (room.game && room.game.phase === "gameover") {
          ctx.backToLobby(room);
        }
      });
      return;
    }

    g.phase = "intermission";
    g.timerEnd = Date.now() + TIMER_INTERMISSION;
    ctx.addSystemMessage(room, `⏸ Next round in 10 seconds...`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_INTERMISSION, () => {
      this._startNextRound(room, ctx);
    });
  },

  _startNextRound(room, ctx, sameRound = false) {
    const g = room.game;
    if (!sameRound) g.round++;
    
    g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));
    if (g.activePlayers.size < 3) {
      g.phase = "gameover";
      ctx.addSystemMessage(room, `Not enough players — game over!`);
      ctx.broadcastRoom(room);
      return;
    }

    if (!sameRound) {
      g.spyId = g.spyOrder[g.round - 1];
    }
    
    if (!g.activePlayers.has(g.spyId)) {
      const remaining = [...g.activePlayers];
      g.spyId = remaining[Math.floor(Math.random() * remaining.length)];
    }
    g.spyName = room.players.get(g.spyId)?.name || "???";
    g.secretPair = getRandomWord();
    
    this._startCluePhase(room, ctx);
  }
};
