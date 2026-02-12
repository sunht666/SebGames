const TURN_TIME_LIMIT = 30000;

const STATES = {
  WAITING: 'WAITING',
  SETUP: 'SETUP',
  ROLLING: 'ROLLING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [null, null];
    this.state = STATES.WAITING;
    this.currentTurn = -1;
    this.turnTimer = null;
    this.turnStartTime = null;
    this.history = [];
    this.winner = -1;
    this.roundNumber = 0;
    this.createdAt = Date.now();
  }

  getPlayerCount() {
    return this.players.filter((p) => p !== null).length;
  }

  getPlayerIndex(playerId) {
    return this.players.findIndex((p) => p && p.id === playerId);
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) {
      if (p && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    }
  }

  sendTo(playerIndex, msg) {
    const player = this.players[playerIndex];
    if (player && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(msg));
    }
  }

  // ── Player management ──

  addPlayer(ws, playerId, playerName) {
    if (this.state !== STATES.WAITING) {
      return { success: false, error: '房间已满或游戏正在进行中' };
    }

    let slot = -1;
    for (let i = 0; i < 2; i++) {
      if (this.players[i] === null) {
        slot = i;
        break;
      }
    }
    if (slot === -1) {
      return { success: false, error: '房间已满' };
    }

    this.players[slot] = {
      ws,
      id: playerId,
      name: playerName,
      number: null,
      confirmed: false,
      dice: null,
      guessLock: false, // prevent double-submit
    };

    // Tell the joining player their slot info
    this.sendTo(slot, {
      type: 'room_joined',
      playerId,
      playerIndex: slot,
      roomId: this.roomId,
      playerName,
    });

    // Exchange player-joined notifications
    const other = 1 - slot;
    if (this.players[other]) {
      this.sendTo(other, {
        type: 'player_joined',
        playerIndex: slot,
        playerName,
      });
      this.sendTo(slot, {
        type: 'player_joined',
        playerIndex: other,
        playerName: this.players[other].name,
      });

      // Both present → move to SETUP
      this.state = STATES.SETUP;
      this.broadcast({ type: 'state_change', state: STATES.SETUP });
    }

    return { success: true };
  }

  removePlayer(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    this.players[idx] = null;
    this.clearTurnTimer();

    const other = 1 - idx;

    if (
      this.state === STATES.PLAYING ||
      this.state === STATES.ROLLING ||
      this.state === STATES.SETUP
    ) {
      if (this.players[other]) {
        this.state = STATES.FINISHED;
        this.winner = other;
        this.sendTo(other, {
          type: 'opponent_disconnected',
        });
        this.sendTo(other, {
          type: 'game_over',
          winner: other,
          reason: 'disconnect',
          numbers: null,
        });
      }
    } else {
      if (this.players[other]) {
        this.sendTo(other, { type: 'player_left', playerIndex: idx });
        this.state = STATES.WAITING;
        this.sendTo(other, { type: 'state_change', state: STATES.WAITING });
      }
    }
  }

  // ── Number setup ──

  setNumber(playerId, number, useRandom) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1 || this.state !== STATES.SETUP) return;

    if (useRandom) {
      number = Math.floor(Math.random() * 9000) + 1000;
    }

    if (!this.validateNumber(number)) {
      this.sendTo(idx, { type: 'error', message: '数字必须在1000-9999之间' });
      return;
    }

    this.players[idx].number = number;
    this.players[idx].confirmed = false;

    // Only send the number back to the owner — NEVER to the opponent
    this.sendTo(idx, { type: 'number_set', number });
  }

  confirmNumber(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1 || this.state !== STATES.SETUP) return;

    if (!this.players[idx].number) {
      this.sendTo(idx, { type: 'error', message: '请先设置数字' });
      return;
    }

    this.players[idx].confirmed = true;

    // Tell both that this player has confirmed (no number leaked)
    this.broadcast({ type: 'player_confirmed', playerIndex: idx });

    // Both confirmed → start dice
    if (this.players[0]?.confirmed && this.players[1]?.confirmed) {
      this.startDiceRoll();
    }
  }

  // ── Dice roll ──

  startDiceRoll() {
    this.state = STATES.ROLLING;
    this.broadcast({ type: 'state_change', state: STATES.ROLLING });
    // Short delay so clients see the state change first
    setTimeout(() => this.rollDice(), 800);
  }

  rollDice() {
    if (this.state !== STATES.ROLLING) return;

    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    this.players[0].dice = d1;
    this.players[1].dice = d2;

    this.broadcast({ type: 'dice_result', dice: [d1, d2] });

    if (d1 === d2) {
      // Tie — roll again
      setTimeout(() => {
        if (this.state === STATES.ROLLING) {
          this.broadcast({ type: 'dice_tie' });
          setTimeout(() => this.rollDice(), 1500);
        }
      }, 2200);
    } else {
      this.currentTurn = d1 > d2 ? 0 : 1;
      setTimeout(() => {
        if (this.state !== STATES.ROLLING) return;
        this.state = STATES.PLAYING;
        this.roundNumber = 1;
        this.broadcast({ type: 'state_change', state: STATES.PLAYING });
        this.broadcast({ type: 'first_player', playerIndex: this.currentTurn });
        this.startTurn();
      }, 2500);
    }
  }

  // ── Turns ──

  startTurn() {
    this.turnStartTime = Date.now();
    // Reset guess lock for current player
    const p = this.players[this.currentTurn];
    if (p) p.guessLock = false;

    this.broadcast({
      type: 'turn_start',
      playerIndex: this.currentTurn,
      roundNumber: this.roundNumber,
      timeLimit: TURN_TIME_LIMIT,
    });

    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => this.handleTimeout(), TURN_TIME_LIMIT + 1000);
  }

  handleTimeout() {
    if (this.state !== STATES.PLAYING) return;

    this.history.push({
      playerIndex: this.currentTurn,
      guess: null,
      correctCount: null,
      timeout: true,
      roundNumber: this.roundNumber,
    });

    this.broadcast({
      type: 'turn_timeout',
      playerIndex: this.currentTurn,
      roundNumber: this.roundNumber,
    });

    this.nextTurn();
  }

  submitGuess(playerId, guess) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1 || this.state !== STATES.PLAYING) return;

    if (idx !== this.currentTurn) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    // Prevent double-submit within the same turn
    if (this.players[idx].guessLock) {
      this.sendTo(idx, { type: 'error', message: '本回合已提交' });
      return;
    }

    // Server-side time enforcement
    const elapsed = Date.now() - this.turnStartTime;
    if (elapsed > TURN_TIME_LIMIT + 2000) {
      this.sendTo(idx, { type: 'error', message: '已超时' });
      return;
    }

    if (!this.validateNumber(guess)) {
      this.sendTo(idx, { type: 'error', message: '猜测数字必须在1000-9999之间' });
      return;
    }

    this.players[idx].guessLock = true;
    this.clearTurnTimer();

    // Compare with opponent's number — never expose the actual number
    const opponentNumber = this.players[1 - idx].number;
    const correctCount = this.compareNumbers(guess, opponentNumber);

    this.history.push({
      playerIndex: idx,
      guess,
      correctCount,
      timeout: false,
      roundNumber: this.roundNumber,
    });

    this.broadcast({
      type: 'guess_result',
      playerIndex: idx,
      guess,
      correctCount,
      roundNumber: this.roundNumber,
    });

    if (correctCount === 4) {
      this.state = STATES.FINISHED;
      this.winner = idx;
      // Reveal both numbers only when the game is over
      this.broadcast({
        type: 'game_over',
        winner: idx,
        reason: 'guessed',
        numbers: [this.players[0].number, this.players[1].number],
      });
      return;
    }

    this.nextTurn();
  }

  nextTurn() {
    this.currentTurn = 1 - this.currentTurn;
    this.roundNumber++;
    this.startTurn();
  }

  // ── Helpers ──

  compareNumbers(guess, target) {
    const g = String(guess);
    const t = String(target);
    let count = 0;
    for (let i = 0; i < 4; i++) {
      if (g[i] === t[i]) count++;
    }
    return count;
  }

  validateNumber(num) {
    const n = parseInt(num, 10);
    return !isNaN(n) && n >= 1000 && n <= 9999;
  }

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }
}

module.exports = GameRoom;
