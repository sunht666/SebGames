const BaseGame = require('./BaseGame');

const STATES = {
  WAITING: 'WAITING',
  ROLLING: 'ROLLING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

const BOARD_SIZE = 15;

class Gomoku extends BaseGame {
  constructor(roomId, config = {}) {
    super(roomId, config);
    this.players = [null, null];
    this.currentTurn = -1;
    this.turnTimer = null;
    this.turnStartTime = null;
    this.history = []; // { playerIndex, row, col, moveNumber }
    this.winner = -1;
    this.winLine = null; // [[r,c], ...] winning 5 stones
    this.board = this.createBoard();
    this.moveCount = 0;

    // Configurable turn time: 15-60s, default 30s
    const t = parseInt(config.turnTime, 10);
    this.turnTimeLimit = (!isNaN(t) && t >= 15 && t <= 60) ? t * 1000 : 30000;
  }

  get gameType() {
    return 'gomoku';
  }

  get maxPlayers() {
    return 2;
  }

  createBoard() {
    return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(0));
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
      dice: null,
    };

    this.sendTo(slot, {
      type: 'room_joined',
      playerId,
      playerIndex: slot,
      roomId: this.roomId,
      playerName,
    });

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
    }

    this.broadcastPlayerList();
    return { success: true };
  }

  broadcastPlayerList() {
    this.broadcast({
      type: 'player_list',
      players: this.players.map(p =>
        p ? { name: p.name } : null
      ),
    });
  }

  removePlayer(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    this.players[idx] = null;
    this.clearTurnTimer();

    const other = 1 - idx;

    if (this.state === STATES.PLAYING || this.state === STATES.ROLLING) {
      if (this.players[other]) {
        this.state = STATES.FINISHED;
        this.winner = other;
        this.sendTo(other, { type: 'opponent_disconnected' });
        this.sendTo(other, {
          type: 'game_over',
          winner: other,
          reason: 'disconnect',
        });
        const specMsg = JSON.stringify({
          type: 'game_over',
          winner: other,
          reason: 'disconnect',
        });
        for (const s of this.spectators) {
          if (s.readyState === 1) s.send(specMsg);
        }
        this.scheduleDissolve();
      }
    } else {
      if (this.players[other]) {
        if (other !== 0) {
          this.players[0] = this.players[other];
          this.players[other] = null;
          this.sendTo(0, { type: 'player_index_update', playerIndex: 0 });
        }
        this.sendTo(0, { type: 'player_left', playerIndex: idx });
        this.state = STATES.WAITING;
        this.sendTo(0, { type: 'state_change', state: STATES.WAITING });
        this.broadcastPlayerList();
      }
    }
  }

  // ── Message dispatch ──

  handleMessage(playerId, msg) {
    switch (msg.type) {
      case 'start_game':
        this.handleStartGame(playerId);
        break;
      case 'place_stone':
        this.placeStone(playerId, msg.row, msg.col);
        break;
    }
  }

  handleStartGame(playerId) {
    if (this.state !== STATES.WAITING) return;
    if (!this.players[0] || this.players[0].id !== playerId) return;
    if (this.getPlayerCount() < 2) return;
    this.startDiceRoll();
  }

  // ── Dice roll ──

  startDiceRoll() {
    this.state = STATES.ROLLING;
    this.broadcast({ type: 'state_change', state: STATES.ROLLING });
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
      setTimeout(() => {
        if (this.state === STATES.ROLLING) {
          this.broadcast({ type: 'dice_tie' });
          setTimeout(() => this.rollDice(), 1500);
        }
      }, 2200);
    } else {
      // Winner gets black (plays first)
      this.currentTurn = d1 > d2 ? 0 : 1;
      setTimeout(() => {
        if (this.state !== STATES.ROLLING) return;
        this.state = STATES.PLAYING;
        this.board = this.createBoard();
        this.history = [];
        this.moveCount = 0;
        this.winner = -1;
        this.winLine = null;
        this.broadcast({ type: 'state_change', state: STATES.PLAYING });
        this.broadcast({ type: 'first_player', playerIndex: this.currentTurn });
        this.startTurn();
      }, 2500);
    }
  }

  // ── Turns ──

  startTurn() {
    this.turnStartTime = Date.now();

    this.broadcast({
      type: 'turn_start',
      playerIndex: this.currentTurn,
      timeLimit: this.turnTimeLimit,
    });

    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => this.handleTimeout(), this.turnTimeLimit + 1000);
  }

  handleTimeout() {
    if (this.state !== STATES.PLAYING) return;

    // Auto-place on a random empty cell
    const emptyCells = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.board[r][c] === 0) emptyCells.push([r, c]);
      }
    }

    if (emptyCells.length === 0) return;

    const [row, col] = emptyCells[Math.floor(Math.random() * emptyCells.length)];

    this.broadcast({
      type: 'turn_timeout',
      playerIndex: this.currentTurn,
    });

    this.executePlace(this.currentTurn, row, col);
  }

  // ── Stone placement ──

  placeStone(playerId, row, col) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1 || this.state !== STATES.PLAYING) return;

    if (idx !== this.currentTurn) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    const elapsed = Date.now() - this.turnStartTime;
    if (elapsed > this.turnTimeLimit + 2000) {
      this.sendTo(idx, { type: 'error', message: '已超时' });
      return;
    }

    if (!this.isValidPosition(row, col)) {
      this.sendTo(idx, { type: 'error', message: '无效位置' });
      return;
    }

    if (this.board[row][col] !== 0) {
      this.sendTo(idx, { type: 'error', message: '该位置已有棋子' });
      return;
    }

    this.clearTurnTimer();
    this.executePlace(idx, row, col);
  }

  executePlace(playerIndex, row, col) {
    // stone: 1 = black (first player), 2 = white (second player)
    const stoneValue = this.getStoneForPlayer(playerIndex);
    this.board[row][col] = stoneValue;
    this.moveCount++;

    const move = { playerIndex, row, col, moveNumber: this.moveCount };
    this.history.push(move);

    this.broadcast({
      type: 'stone_placed',
      playerIndex,
      row,
      col,
      stone: stoneValue,
      moveNumber: this.moveCount,
    });

    // Check win
    const winResult = this.checkWin(row, col, stoneValue);
    if (winResult) {
      this.state = STATES.FINISHED;
      this.winner = playerIndex;
      this.winLine = winResult;
      setTimeout(() => {
        this.broadcast({
          type: 'game_over',
          winner: playerIndex,
          reason: 'five_in_row',
          winLine: winResult,
        });
        this.scheduleDissolve();
      }, 500);
      return;
    }

    // Check draw
    if (this.moveCount >= BOARD_SIZE * BOARD_SIZE) {
      this.state = STATES.FINISHED;
      this.winner = -1;
      setTimeout(() => {
        this.broadcast({
          type: 'game_over',
          winner: -1,
          reason: 'draw',
        });
        this.scheduleDissolve();
      }, 500);
      return;
    }

    // Next turn
    this.currentTurn = 1 - this.currentTurn;
    this.startTurn();
  }

  // The first player (decided by dice) plays black (1), second plays white (2)
  getStoneForPlayer(playerIndex) {
    // this.currentTurn was set during dice roll to the first player
    // First player determined at dice roll is always black
    // We need to know who the first player was
    return this.isFirstPlayer(playerIndex) ? 1 : 2;
  }

  isFirstPlayer(playerIndex) {
    // The first player was decided during dice, and is the one who played move #1
    // We can check from history or from the dice result
    if (this.history.length > 0) {
      return this.history[0].playerIndex === playerIndex;
    }
    // Before any move, currentTurn is the first player
    return this.currentTurn === playerIndex;
  }

  isValidPosition(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  // ── Win check ──

  checkWin(row, col, stone) {
    const directions = [
      [0, 1],   // horizontal
      [1, 0],   // vertical
      [1, 1],   // diagonal \
      [1, -1],  // diagonal /
    ];

    for (const [dr, dc] of directions) {
      const line = [[row, col]];

      // Forward direction
      for (let i = 1; i < 5; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (!this.isValidPosition(r, c) || this.board[r][c] !== stone) break;
        line.push([r, c]);
      }

      // Backward direction
      for (let i = 1; i < 5; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (!this.isValidPosition(r, c) || this.board[r][c] !== stone) break;
        line.push([r, c]);
      }

      if (line.length >= 5) {
        // Sort line for consistent order
        line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return line;
      }
    }

    return null;
  }

  // ── Helpers ──

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // ── Reconnect ──

  sendReconnectState(playerIndex) {
    const msg = {
      type: 'reconnected',
      playerIndex,
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.players.map(p => p ? { name: p.name } : null),
      currentTurn: this.currentTurn,
      board: this.board,
      history: this.history,
      moveCount: this.moveCount,
      winner: this.winner,
      winLine: this.winLine,
      spectatorCount: this.spectators.length,
      turnTimeLimit: this.turnTimeLimit,
    };
    if (this.players[0]?.dice != null) {
      msg.dice = [this.players[0].dice, this.players[1].dice];
    }
    if (this.state === STATES.PLAYING && this.turnStartTime) {
      msg.turnTimeRemaining = Math.max(0, this.turnTimeLimit - (Date.now() - this.turnStartTime));
    }
    this.sendTo(playerIndex, msg);
  }

  // ── Spectators ──

  getSpectateState() {
    const state = {
      type: 'spectate_joined',
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.players.map(p => p ? { name: p.name } : null),
      currentTurn: this.currentTurn,
      board: this.board,
      history: this.history,
      moveCount: this.moveCount,
      winner: this.winner,
      winLine: this.winLine,
      spectatorCount: this.spectators.length,
      turnTimeLimit: this.turnTimeLimit,
    };
    if (this.players[0]?.dice != null) {
      state.dice = [this.players[0].dice, this.players[1].dice];
    }
    return state;
  }
}

module.exports = Gomoku;
