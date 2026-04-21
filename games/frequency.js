import { pickPrompts } from "../prompts.js";

const DEFAULT_ROUNDS = 5;
const TIMER_SUBMIT = 30_000;
const TIMER_DISCUSS = 60_000;
const TIMER_VOTE = 20_000;
const TIMER_INTERMISSION = 10_000;

export const frequencyGame = {
  start(room, ctx, options) {
    const playerIds = [...room.players.keys()];
    const totalRounds = Math.min(options?.rounds || DEFAULT_ROUNDS, 10);
    const prompts = pickPrompts(totalRounds);

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
      offKeyName: room.players.get(offKeyOrder[0])?.name || "???",
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

    this._sendPromptsToPlayers(room, ctx);
    ctx.addSystemMessage(room, `🎵 Frequency — Round 1 of ${totalRounds}. Rate the prompt! (30s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_SUBMIT, () => this._forceSubmitPhaseEnd(room, ctx));
  },

  handleEvent(room, ctx, socketId, action, payload) {
    if (action === "submitRating") {
      this._handleRatingSubmit(room, ctx, socketId, payload.rating);
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
    g.ratings.delete(socketId);
    g.votes.delete(socketId);

    if (g.activePlayers.size < 2) {
      ctx.clearRoomTimer(room);
      room.game = null;
      room.mode = null;
      ctx.addSystemMessage(room, `Not enough players — game ended.`);
      return;
    }

    if (g.phase === "prompting" && socketId === g.offKeyId) {
      ctx.clearRoomTimer(room);
      ctx.addSystemMessage(room, `The Off-Key disconnected — restarting round with remaining players...`);
      const remaining = [...g.activePlayers];
      g.offKeyId = remaining[Math.floor(Math.random() * remaining.length)];
      g.offKeyName = room.players.get(g.offKeyId)?.name || "???";
      g.ratings = new Map();
      g.votes = new Map();
      g.phase = "prompting";
      this._sendPromptsToPlayers(room, ctx);
      ctx.broadcastRoom(room);
      ctx.setRoomTimer(room, TIMER_SUBMIT, () => this._forceSubmitPhaseEnd(room, ctx));
      return;
    }

    if ((g.phase === "discuss" || g.phase === "voting") && socketId === g.offKeyId) {
      ctx.clearRoomTimer(room);
      this._transitionToResults(room, ctx, true);
      return;
    }

    if (g.phase === "prompting" && g.ratings.size >= g.activePlayers.size) {
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
      const isOffKey = pid === g.offKeyId;
      const prompt = isOffKey ? g.promptPair.offkey : g.promptPair.normal;
      ctx.io.to(pid).emit("game:yourPrompt", { prompt, round: g.round });
    }
  },

  _handleRatingSubmit(room, ctx, socketId, rating) {
    const g = room.game;
    if (!g || g.phase !== "prompting") return;
    if (!g.activePlayers.has(socketId)) return;
    if (g.ratings.has(socketId)) return;

    const val = Math.round(Number(rating));
    if (val < 1 || val > 10 || isNaN(val)) return;

    g.ratings.set(socketId, val);
    ctx.broadcastRoom(room);

    if (g.ratings.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToDiscuss(room, ctx);
    }
  },

  _forceSubmitPhaseEnd(room, ctx) {
    const g = room.game;
    if (!g || g.phase !== "prompting") return;

    for (const pid of g.activePlayers) {
      if (!g.ratings.has(pid)) {
        g.ratings.set(pid, 5);
        const pname = room.players.get(pid)?.name || "???";
        ctx.addSystemMessage(room, `⏰ ${pname} didn't submit in time — defaulted to 5`);
      }
    }
    this._transitionToDiscuss(room, ctx);
  },

  _transitionToDiscuss(room, ctx) {
    const g = room.game;
    g.phase = "discuss";
    g.timerEnd = Date.now() + TIMER_DISCUSS;
    ctx.addSystemMessage(room, `All ratings are in! Discuss — who seems off? 🔍 (60s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_DISCUSS, () => {
      this._transitionToVoting(room, ctx);
    });
  },

  _transitionToVoting(room, ctx) {
    const g = room.game;
    g.phase = "voting";
    g.timerEnd = Date.now() + TIMER_VOTE;
    ctx.addSystemMessage(room, `⏳ Time to vote! Who is the Off-Key? (20s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_VOTE, () => {
      this._forceVotePhaseEnd(room, ctx);
    });
  },

  _handleVoteSubmit(room, ctx, socketId, targetId) {
    const g = room.game;
    if (!g || g.phase !== "voting") return;
    if (!g.activePlayers.has(socketId)) return;
    if (g.votes.has(socketId)) return;
    if (socketId === targetId) return;
    if (!g.activePlayers.has(targetId)) return;

    g.votes.set(socketId, targetId);
    ctx.broadcastRoom(room);

    if (g.votes.size >= g.activePlayers.size) {
      ctx.clearRoomTimer(room);
      this._transitionToResults(room, ctx);
    }
  },

  _forceVotePhaseEnd(room, ctx) {
    const g = room.game;
    if (!g || g.phase !== "voting") return;
    this._transitionToResults(room, ctx);
  },

  _transitionToResults(room, ctx, offKeyDisconnected = false) {
    const g = room.game;
    g.phase = "results";
    ctx.clearRoomTimer(room);

    const deltas = {};
    for (const pid of g.activePlayers) deltas[pid] = 0;

    if (offKeyDisconnected) {
      g.roundScoreDeltas = deltas;
      ctx.addSystemMessage(room, `The Off-Key disconnected! No winner this round.`);
      ctx.broadcastRoom(room);
      return;
    }

    let offKeyVotes = 0;
    for (const [voterId, targetId] of g.votes) {
      if (targetId === g.offKeyId) {
        offKeyVotes++;
      }
    }

    const majorityThreshold = Math.floor(g.activePlayers.size / 2) + 1;
    const offKeyCaught = offKeyVotes >= majorityThreshold;

    if (offKeyCaught) {
      for (const [voterId, targetId] of g.votes) {
        if (targetId === g.offKeyId) {
          deltas[voterId] = (deltas[voterId] || 0) + 2;
        }
      }
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
      deltas[g.offKeyId] = (deltas[g.offKeyId] || 0) + 3;
    }

    for (const [pid, delta] of Object.entries(deltas)) {
      g.scores.set(pid, (g.scores.get(pid) || 0) + delta);
    }
    g.roundScoreDeltas = deltas;

    const offKeyName = room.players.get(g.offKeyId)?.name || "???";
    if (offKeyCaught) {
      ctx.addSystemMessage(room, `🎯 The Off-Key was ${offKeyName} — the group caught them!`);
    } else {
      ctx.addSystemMessage(room, `😎 The Off-Key was ${offKeyName} — they blended in!`);
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

  _startNextRound(room, ctx) {
    const g = room.game;
    g.round++;
    g.phase = "prompting";
    g.offKeyId = g.offKeyOrder[g.round - 1];
    g.offKeyName = room.players.get(g.offKeyId)?.name || "???";
    g.promptPair = g.prompts[g.round - 1];
    g.ratings = new Map();
    g.votes = new Map();
    g.roundScoreDeltas = {};

    g.activePlayers = new Set([...room.players.keys()].filter(id => g.scores.has(id)));

    if (g.activePlayers.size < 2) {
      g.phase = "gameover";
      ctx.addSystemMessage(room, `Not enough players — game over!`);
      ctx.broadcastRoom(room);
      return;
    }

    if (!g.activePlayers.has(g.offKeyId)) {
      const remaining = [...g.activePlayers];
      g.offKeyId = remaining[Math.floor(Math.random() * remaining.length)];
      g.offKeyName = room.players.get(g.offKeyId)?.name || "???";
    }

    this._sendPromptsToPlayers(room, ctx);
    ctx.addSystemMessage(room, `🎵 Round ${g.round} of ${g.totalRounds}. Rate the prompt! (30s)`);
    ctx.broadcastRoom(room);

    ctx.setRoomTimer(room, TIMER_SUBMIT, () => {
      this._forceSubmitPhaseEnd(room, ctx);
    });
  }
};
