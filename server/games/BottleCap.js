const BaseGame = require('./BaseGame');

const STATES = {
  WAITING: 'WAITING',
  ROLLING: 'ROLLING',
  HIDING: 'HIDING',
  GUESSING: 'GUESSING',
  ROUND_RESULT: 'ROUND_RESULT',
  FINISHED: 'FINISHED',
};

class BottleCap extends BaseGame {
  constructor(roomId, config = {}) {
    super(roomId, config);

    const mp = parseInt(config.maxPlayers, 10);
    this._maxPlayers = (!isNaN(mp) && mp >= 2 && mp <= 6) ? mp : 6;

    const tt = parseInt(config.turnTime, 10);
    this.turnTimeLimit = (!isNaN(tt) && tt >= 6 && tt <= 30) ? tt * 1000 : 12000;

    this.players = [];
    this.dealerIndex = -1;
    this.dealerCapCount = -1; // hidden caps 0 ~ n-1
    this.guessOrder = [];     // player indices, counter-clockwise excluding dealer
    this.currentGuesserIdx = -1; // index into guessOrder
    this.guessedNumbers = []; // numbers already guessed this round
    this.turnTimer = null;
    this.roundResultTimer = null;
    this.roundPlayerCount = 0; // player count at start of hiding phase, stays constant for the round
  }

  get gameType() {
    return 'bottle-cap';
  }

  get maxPlayers() {
    return this._maxPlayers;
  }

  // ── Player management ──

  addPlayer(ws, playerId, playerName) {
    if (this.state !== STATES.WAITING) {
      return { success: false, error: '游戏已开始' };
    }
    if (this.players.length >= this._maxPlayers) {
      return { success: false, error: '房间已满' };
    }

    const slot = this.players.length;
    this.players.push({
      ws,
      id: playerId,
      name: playerName,
      losses: 0,
    });

    this.sendTo(slot, {
      type: 'room_joined',
      playerId,
      playerIndex: slot,
      roomId: this.roomId,
      playerName,
      gameType: this.gameType,
      maxPlayers: this._maxPlayers,
      turnTimeLimit: this.turnTimeLimit,
    });

    for (let i = 0; i < this.players.length; i++) {
      if (i !== slot) {
        this.sendTo(i, { type: 'player_joined', playerIndex: slot, playerName });
        this.sendTo(slot, { type: 'player_joined', playerIndex: i, playerName: this.players[i].name });
      }
    }

    this.broadcastPlayerList();
    return { success: true };
  }

  removePlayer(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const playerName = this.players[idx].name;

    if (this.state === STATES.WAITING) {
      this.players[idx] = null;
      this.players = this.players.filter(p => p !== null);
      this.broadcast({ type: 'player_left', playerIndex: idx });
      this.broadcastPlayerList();
      return;
    }

    // In-game disconnect
    this.players[idx] = null;
    this.broadcast({ type: 'player_disconnected', playerIndex: idx, playerName });

    const activePlayers = this.players.filter(p => p !== null);
    if (activePlayers.length <= 1) {
      this.dissolveGame();
      return;
    }

    // If dealer left during HIDING, auto-hide random
    if (this.state === STATES.HIDING && idx === this.dealerIndex) {
      this.clearTimer();
      this.dealerCapCount = Math.floor(Math.random() * this.roundPlayerCount);
      this.onCapsHidden();
      return;
    }

    // If current guesser left during GUESSING, skip to next
    if (this.state === STATES.GUESSING) {
      const goIdx = this.guessOrder.indexOf(idx);
      if (goIdx !== -1) {
        const wasCurrentGuesser = (goIdx === this.currentGuesserIdx);
        this.guessOrder.splice(goIdx, 1);
        if (this.guessOrder.length === 0) {
          // Nobody left to guess → dealer loses
          this.endRound(this.dealerIndex, true);
          return;
        }
        // Only adjust index if removed player was BEFORE current guesser
        if (goIdx < this.currentGuesserIdx) {
          this.currentGuesserIdx--;
        }
        // If current guesser left, index now points to the next in line (due to splice)
        // Check bounds
        if (this.currentGuesserIdx >= this.guessOrder.length) {
          // All guessers done, nobody guessed right → dealer loses
          this.endRound(this.dealerIndex, true);
          return;
        }
        if (wasCurrentGuesser) {
          this.clearTimer();
          this.broadcastGuessTurn();
        }
      }
    }
  }

  broadcastPlayerList() {
    this.broadcast({
      type: 'player_list',
      players: this.players.map(p =>
        p ? { name: p.name, losses: p.losses } : null
      ),
      maxPlayers: this._maxPlayers,
    });
  }

  // ── Game start ──

  handleMessage(playerId, msg) {
    switch (msg.type) {
      case 'start_game':
        this.handleStartGame(playerId);
        break;
      case 'hide_caps':
        this.handleHideCaps(playerId, msg);
        break;
      case 'guess_number':
        this.handleGuessNumber(playerId, msg);
        break;
    }
  }

  handleStartGame(playerId) {
    if (this.state !== STATES.WAITING) return;
    if (!this.players[0] || this.players[0].id !== playerId) return;
    if (this.getPlayerCount() < 2) return;
    this.startRolling();
  }

  // ── Dice rolling ──

  startRolling() {
    this.state = STATES.ROLLING;
    this.broadcast({ type: 'state_change', state: STATES.ROLLING });
    setTimeout(() => this.rollDice(), 800);
  }

  rollDice() {
    if (this.state !== STATES.ROLLING) return;

    const dice = [];
    for (let i = 0; i < this.players.length; i++) {
      dice.push(this.players[i] ? Math.floor(Math.random() * 6) + 1 : 0);
    }

    this.broadcast({ type: 'dice_result', dice });

    // Find highest
    const maxVal = Math.max(...dice);
    const winners = dice.reduce((acc, v, i) => {
      if (v === maxVal && this.players[i]) acc.push(i);
      return acc;
    }, []);

    if (winners.length > 1) {
      // Tie — re-roll after delay
      setTimeout(() => {
        if (this.state === STATES.ROLLING) {
          this.broadcast({ type: 'dice_tie', tiedPlayers: winners });
          setTimeout(() => this.rollDice(), 1500);
        }
      }, 1500);
    } else {
      this.dealerIndex = winners[0];
      setTimeout(() => {
        if (this.state !== STATES.ROLLING) return;
        this.broadcast({
          type: 'dealer_chosen',
          dealerIndex: this.dealerIndex,
          dealerName: this.players[this.dealerIndex]?.name,
        });
        setTimeout(() => this.startHidingPhase(), 1500);
      }, 1500);
    }
  }

  // ── Hiding phase ──

  startHidingPhase() {
    if (this.state === STATES.FINISHED) return;
    this.state = STATES.HIDING;
    this.dealerCapCount = -1;
    this.guessedNumbers = [];

    // Lock player count for the entire round so disconnects don't change the number range
    this.roundPlayerCount = this.getPlayerCount();
    const n = this.roundPlayerCount;

    this.broadcast({
      type: 'hiding_phase',
      state: STATES.HIDING,
      dealerIndex: this.dealerIndex,
      dealerName: this.players[this.dealerIndex]?.name,
      maxCaps: n - 1,
      timeLimit: this.turnTimeLimit,
    });

    // Timer: if dealer doesn't pick, random
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.state !== STATES.HIDING) return;
      this.dealerCapCount = Math.floor(Math.random() * n);
      this.onCapsHidden();
    }, this.turnTimeLimit);
  }

  handleHideCaps(playerId, msg) {
    if (this.state !== STATES.HIDING) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx !== this.dealerIndex) {
      this.sendTo(idx, { type: 'error', message: '你不是庄家' });
      return;
    }

    const count = parseInt(msg.count, 10);
    const n = this.roundPlayerCount;
    if (isNaN(count) || count < 0 || count >= n) {
      this.sendTo(idx, { type: 'error', message: `请选择 0 到 ${n - 1} 之间的数字` });
      return;
    }

    this.clearTimer();
    this.dealerCapCount = count;
    this.onCapsHidden();
  }

  onCapsHidden() {
    // Notify all: caps are hidden (don't reveal count!)
    this.broadcast({
      type: 'caps_hidden',
      dealerIndex: this.dealerIndex,
      dealerName: this.players[this.dealerIndex]?.name,
    });

    // Build guess order: counter-clockwise from dealer
    this.buildGuessOrder();
    this.currentGuesserIdx = 0;

    setTimeout(() => this.startGuessingPhase(), 800);
  }

  buildGuessOrder() {
    this.guessOrder = [];
    const n = this.players.length;
    // Counter-clockwise = decreasing index, wrapping
    for (let offset = 1; offset < n; offset++) {
      const i = (this.dealerIndex - offset + n) % n;
      if (this.players[i]) {
        this.guessOrder.push(i);
      }
    }
  }

  // ── Guessing phase ──

  startGuessingPhase() {
    if (this.state === STATES.FINISHED) return;
    this.state = STATES.GUESSING;
    this.broadcast({ type: 'state_change', state: STATES.GUESSING });
    this.broadcastGuessTurn();
  }

  broadcastGuessTurn() {
    if (this.state !== STATES.GUESSING) return;
    if (this.currentGuesserIdx >= this.guessOrder.length) {
      // All guessers done, nobody guessed right → dealer loses
      this.endRound(this.dealerIndex, true);
      return;
    }

    this.clearTimer();

    const guesserIndex = this.guessOrder[this.currentGuesserIdx];
    const n = this.roundPlayerCount;
    const available = [];
    for (let i = 0; i < n; i++) {
      if (!this.guessedNumbers.includes(i)) {
        available.push(i);
      }
    }

    this.broadcast({
      type: 'guess_turn',
      guesserIndex,
      guesserName: this.players[guesserIndex]?.name,
      availableNumbers: available,
      guessedNumbers: this.guessedNumbers,
      timeLimit: this.turnTimeLimit,
      maxCaps: n - 1,
    });

    // Timer: auto-guess random from available
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.state !== STATES.GUESSING) return;
      if (available.length === 0) {
        this.endRound(this.dealerIndex, true);
        return;
      }
      const autoGuess = available[Math.floor(Math.random() * available.length)];
      this.processGuess(guesserIndex, autoGuess, true);
    }, this.turnTimeLimit);
  }

  handleGuessNumber(playerId, msg) {
    if (this.state !== STATES.GUESSING) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const currentGuesser = this.guessOrder[this.currentGuesserIdx];
    if (idx !== currentGuesser) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    const number = parseInt(msg.number, 10);
    const n = this.roundPlayerCount;
    if (isNaN(number) || number < 0 || number >= n) {
      this.sendTo(idx, { type: 'error', message: `请选择 0 到 ${n - 1} 之间的数字` });
      return;
    }

    if (this.guessedNumbers.includes(number)) {
      this.sendTo(idx, { type: 'error', message: '这个数字已经被猜过了' });
      return;
    }

    this.clearTimer();
    this.processGuess(idx, number, false);
  }

  processGuess(guesserIndex, number, isTimeout) {
    this.guessedNumbers.push(number);

    const correct = number === this.dealerCapCount;

    this.broadcast({
      type: 'number_guessed',
      guesserIndex,
      guesserName: this.players[guesserIndex]?.name,
      number,
      isTimeout,
      correct,
      guessedNumbers: this.guessedNumbers,
    });

    if (correct) {
      // Guesser loses, becomes next dealer
      this.endRound(guesserIndex, false);
    } else {
      // Move to next guesser
      this.currentGuesserIdx++;
      if (this.currentGuesserIdx >= this.guessOrder.length) {
        // All guessers done → dealer loses, stays dealer
        this.endRound(this.dealerIndex, true);
      } else {
        setTimeout(() => this.broadcastGuessTurn(), 800);
      }
    }
  }

  // ── Round result ──

  endRound(loserIndex, dealerLost) {
    this.clearTimer();
    this.state = STATES.ROUND_RESULT;

    if (this.players[loserIndex]) {
      this.players[loserIndex].losses++;
    }

    // Next dealer: if guesser guessed right, that guesser becomes dealer
    // If nobody guessed right (dealer lost), dealer stays
    const nextDealer = dealerLost ? this.dealerIndex : loserIndex;

    this.broadcast({
      type: 'round_result',
      state: STATES.ROUND_RESULT,
      loserIndex,
      loserName: this.players[loserIndex]?.name || '已离线',
      dealerLost,
      dealerIndex: this.dealerIndex,
      dealerName: this.players[this.dealerIndex]?.name || '已离线',
      revealedCount: this.dealerCapCount,
      nextDealerIndex: nextDealer,
      nextDealerName: this.players[nextDealer]?.name || '已离线',
      guessedNumbers: this.guessedNumbers,
    });

    this.broadcastPlayerList();

    // After 4 seconds, start next round
    this.roundResultTimer = setTimeout(() => {
      this.roundResultTimer = null;
      if (this.getPlayerCount() < 2) {
        this.dissolveGame();
        return;
      }
      // If next dealer disconnected, find next active player
      this.dealerIndex = this.findActiveDealer(nextDealer);
      this.startHidingPhase();
    }, 4000);
  }

  findActiveDealer(preferred) {
    if (this.players[preferred]) return preferred;
    // Find next active player clockwise
    for (let offset = 1; offset < this.players.length; offset++) {
      const i = (preferred + offset) % this.players.length;
      if (this.players[i]) return i;
    }
    return 0;
  }

  dissolveGame() {
    this.clearTimer();
    if (this.roundResultTimer) {
      clearTimeout(this.roundResultTimer);
      this.roundResultTimer = null;
    }
    this.state = STATES.FINISHED;
    this.broadcast({
      type: 'room_dissolved',
      message: '玩家不足，房间已解散',
      redirect: true,
    });
    if (this.onDissolve) {
      this.onDissolve(this.roomId);
    }
  }

  clearTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // ── Spectator state ──

  getSpectateState() {
    const isRevealed = this.state === STATES.ROUND_RESULT || this.state === STATES.FINISHED;

    return {
      type: 'spectate_joined',
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.players.map(p =>
        p ? { name: p.name, losses: p.losses } : null
      ),
      maxPlayers: this._maxPlayers,
      dealerIndex: this.dealerIndex,
      dealerName: this.players[this.dealerIndex]?.name,
      revealedCount: isRevealed ? this.dealerCapCount : -1,
      guessOrder: this.guessOrder,
      currentGuesserIdx: this.currentGuesserIdx,
      guessedNumbers: this.guessedNumbers,
      maxCaps: (this.roundPlayerCount || this.getPlayerCount()) - 1,
      turnTimeLimit: this.turnTimeLimit,
      spectatorCount: this.spectators.length,
    };
  }
}

module.exports = BottleCap;
