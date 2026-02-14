const BaseGame = require('./BaseGame');

const FRUITS = ['banana', 'strawberry', 'lime', 'plum'];
// Each fruit: count 1×3, 2×3, 3×3, 4×3, 5×2 = 14 cards per fruit, 56 total
const COUNT_COPIES = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 2 };

const STATES = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

class HalliGalli extends BaseGame {
  constructor(roomId, config = {}) {
    super(roomId, config);

    const mp = parseInt(config.maxPlayers, 10);
    this._maxPlayers = (!isNaN(mp) && mp >= 2 && mp <= 6) ? mp : 6;

    const tt = parseInt(config.turnTime, 10);
    this.turnTimeLimit = (!isNaN(tt) && tt >= 3 && tt <= 10) ? tt * 1000 : 5000;

    this.players = [];
    this.playOrder = [];       // active player indices (counter-clockwise)
    this.currentTurnIdx = -1;  // index into playOrder
    this.turnTimer = null;
    this.advanceTimer = null;
    this.bellLocked = false;
    this.bellLockTimer = null;
    this.waitingForFlip = false;
    this.roundNumber = 0;
  }

  get gameType() {
    return 'halli-galli';
  }

  get maxPlayers() {
    return this._maxPlayers;
  }

  // ── Deck ──

  buildDeck() {
    const deck = [];
    let idx = 0;
    for (const fruit of FRUITS) {
      for (const [countStr, copies] of Object.entries(COUNT_COPIES)) {
        const count = parseInt(countStr, 10);
        for (let c = 0; c < copies; c++) {
          deck.push({ id: `${fruit}-${count}-${idx}`, fruit, count });
          idx++;
        }
      }
    }
    return deck;
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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
      drawPile: [],
      discardPile: [],
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
      for (let i = 0; i < this.players.length; i++) {
        this.sendTo(i, { type: 'player_index_update', playerIndex: i });
      }
      this.broadcastPlayerList();
      return;
    }

    // In-game disconnect
    this.players[idx] = null;
    this.broadcast({ type: 'player_disconnected', playerIndex: idx, playerName });

    const poIdx = this.playOrder.indexOf(idx);
    if (poIdx !== -1) {
      const wasCurrentTurn = poIdx === this.currentTurnIdx;
      this.playOrder.splice(poIdx, 1);

      if (this.playOrder.length <= 1) {
        this.endGame();
        return;
      }

      if (wasCurrentTurn) {
        if (this.currentTurnIdx >= this.playOrder.length) {
          this.currentTurnIdx = 0;
        }
        this.clearAllTimers();
        this.broadcastTurn();
      } else if (poIdx < this.currentTurnIdx) {
        this.currentTurnIdx--;
      }
    } else {
      // Player not in playOrder (already eliminated), check remaining active
      const activePlayers = this.players.filter(p => p !== null);
      if (activePlayers.length <= 1) {
        this.dissolveGame();
      }
    }
  }

  broadcastPlayerList() {
    this.broadcast({
      type: 'player_list',
      players: this.getTableState(),
      maxPlayers: this._maxPlayers,
    });
  }

  getTableState() {
    return this.players.map(p => {
      if (!p) return null;
      const topCard = p.discardPile.length > 0
        ? p.discardPile[p.discardPile.length - 1]
        : null;
      return {
        name: p.name,
        drawCount: p.drawPile.length,
        discardCount: p.discardPile.length,
        totalCards: p.drawPile.length + p.discardPile.length,
        topCard,
      };
    });
  }

  // ── Game start ──

  handleMessage(playerId, msg) {
    switch (msg.type) {
      case 'start_game':
        this.handleStartGame(playerId);
        break;
      case 'flip_card':
        this.handleFlipCard(playerId);
        break;
      case 'ring_bell':
        this.handleRingBell(playerId);
        break;
    }
  }

  handleStartGame(playerId) {
    if (this.state !== STATES.WAITING) return;
    if (!this.players[0] || this.players[0].id !== playerId) return;
    if (this.getPlayerCount() < 2) return;
    this.startGame();
  }

  startGame() {
    const deck = this.shuffle(this.buildDeck());

    // Deal evenly
    let cardIdx = 0;
    while (cardIdx < deck.length) {
      for (let i = 0; i < this.players.length && cardIdx < deck.length; i++) {
        if (this.players[i]) {
          this.players[i].drawPile.push(deck[cardIdx]);
          cardIdx++;
        }
      }
    }

    this.state = STATES.PLAYING;

    // Counter-clockwise play order
    this.playOrder = [];
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (this.players[i]) this.playOrder.push(i);
    }

    this.currentTurnIdx = 0;
    this.roundNumber = 1;
    this.bellLocked = false;

    this.broadcast({ type: 'state_change', state: STATES.PLAYING });
    this.broadcastPlayerList();
    this.broadcastTurn();
  }

  // ── Flip card ──

  handleFlipCard(playerId) {
    if (this.state !== STATES.PLAYING) return;
    if (this.bellLocked) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
    if (idx !== currentPlayerIdx) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你翻牌' });
      return;
    }

    if (!this.waitingForFlip) return;

    this.doFlip(idx);
  }

  doFlip(playerIdx) {
    this.clearTurnTimer();
    this.waitingForFlip = false;

    const player = this.players[playerIdx];
    if (!player) return;

    // If draw pile is empty, recycle discard pile
    if (player.drawPile.length === 0 && player.discardPile.length > 0) {
      player.drawPile = player.discardPile.reverse();
      player.discardPile = [];
      this.broadcast({
        type: 'pile_recycled',
        playerIndex: playerIdx,
        playerName: player.name,
      });
    }

    if (player.drawPile.length === 0) {
      // No cards left — skip
      this.advanceTurn();
      return;
    }

    // Flip top card
    const card = player.drawPile.pop();
    player.discardPile.push(card);
    this.roundNumber++;

    this.broadcast({
      type: 'card_flipped',
      playerIndex: playerIdx,
      playerName: player.name,
      card,
      tableState: this.getTableState(),
    });

    // After delay, advance to next player (if no bell)
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      if (this.state === STATES.PLAYING) {
        this.advanceTurn();
      }
    }, 3000);
  }

  // ── Bell ──

  handleRingBell(playerId) {
    if (this.state !== STATES.PLAYING) return;
    if (this.bellLocked) return;

    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    // Check player is still active
    if (!this.playOrder.includes(idx)) return;

    // Lock bell immediately
    this.bellLocked = true;
    const ringTime = Date.now();

    // Cancel pending timers
    this.clearAdvanceTimer();
    this.clearTurnTimer();

    // Check if exactly 5 of any fruit
    const matchedFruit = this.checkFruitCount();

    if (matchedFruit) {
      this.handleCorrectRing(idx, matchedFruit, ringTime);
    } else {
      this.handleWrongRing(idx, ringTime);
    }
  }

  checkFruitCount() {
    const counts = { banana: 0, strawberry: 0, lime: 0, plum: 0 };
    for (const pi of this.playOrder) {
      const p = this.players[pi];
      if (!p || p.discardPile.length === 0) continue;
      const topCard = p.discardPile[p.discardPile.length - 1];
      counts[topCard.fruit] += topCard.count;
    }
    for (const [fruit, count] of Object.entries(counts)) {
      if (count === 5) return fruit;
    }
    return null;
  }

  handleCorrectRing(playerIdx, fruit, ringTime) {
    const player = this.players[playerIdx];

    // Collect all discard piles
    const collectedCards = [];
    for (const pi of this.playOrder) {
      const p = this.players[pi];
      if (!p) continue;
      collectedCards.push(...p.discardPile);
      p.discardPile = [];
    }

    // Add to ringer's draw pile (bottom)
    player.drawPile = [...this.shuffle(collectedCards), ...player.drawPile];

    this.broadcast({
      type: 'bell_result',
      ringerIndex: playerIdx,
      ringerName: player.name,
      correct: true,
      fruit,
      cardsWon: collectedCards.length,
      ringTime,
      tableState: this.getTableState(),
    });

    // Check for eliminations
    this.checkEliminations();
    if (this.state === STATES.FINISHED) return;

    // Next player after ringer
    const ringerPoIdx = this.playOrder.indexOf(playerIdx);
    if (ringerPoIdx !== -1) {
      this.currentTurnIdx = (ringerPoIdx + 1) % this.playOrder.length;
    }

    // Unlock bell and continue after delay
    this.bellLockTimer = setTimeout(() => {
      this.bellLocked = false;
      this.bellLockTimer = null;
      if (this.state === STATES.PLAYING) {
        this.broadcastTurn();
      }
    }, 2500);
  }

  handleWrongRing(playerIdx, ringTime) {
    const player = this.players[playerIdx];
    let penaltyCount = 0;

    // Penalty: give 1 card to each other player
    for (const pi of this.playOrder) {
      if (pi === playerIdx) continue;
      const p = this.players[pi];
      if (!p) continue;

      let card = null;
      if (player.drawPile.length > 0) {
        card = player.drawPile.pop();
      } else if (player.discardPile.length > 1) {
        // Keep at least the top card on discard
        card = player.discardPile.shift();
      }

      if (card) {
        p.drawPile.unshift(card);
        penaltyCount++;
      }
    }

    this.broadcast({
      type: 'bell_result',
      ringerIndex: playerIdx,
      ringerName: player.name,
      correct: false,
      cardsLost: penaltyCount,
      ringTime,
      tableState: this.getTableState(),
    });

    // Check for eliminations
    this.checkEliminations();
    if (this.state === STATES.FINISHED) return;

    // Continue from current position (next player after current)
    if (this.currentTurnIdx >= this.playOrder.length) {
      this.currentTurnIdx = 0;
    }

    // Unlock bell and continue
    // If the current player hadn't flipped yet, restart their turn (don't skip)
    const shouldAdvance = !this.waitingForFlip;
    this.bellLockTimer = setTimeout(() => {
      this.bellLocked = false;
      this.bellLockTimer = null;
      if (this.state === STATES.PLAYING) {
        if (shouldAdvance) {
          this.advanceTurn();
        } else {
          this.broadcastTurn();
        }
      }
    }, 2000);
  }

  checkEliminations() {
    const eliminated = [];
    for (const pi of this.playOrder) {
      const p = this.players[pi];
      if (!p) continue;
      if (p.drawPile.length === 0 && p.discardPile.length === 0) {
        eliminated.push(pi);
      }
    }

    for (const pi of eliminated) {
      this.playOrder = this.playOrder.filter(i => i !== pi);
      this.broadcast({
        type: 'player_eliminated',
        playerIndex: pi,
        playerName: this.players[pi]?.name,
      });
    }

    // Adjust currentTurnIdx
    if (this.playOrder.length > 0 && this.currentTurnIdx >= this.playOrder.length) {
      this.currentTurnIdx = 0;
    }

    if (this.playOrder.length <= 1) {
      this.endGame();
    }
  }

  // ── Turn management ──

  advanceTurn() {
    if (this.state !== STATES.PLAYING) return;
    if (this.playOrder.length === 0) return;

    this.currentTurnIdx = (this.currentTurnIdx + 1) % this.playOrder.length;

    // Check if next player needs pile recycling
    const nextPlayerIdx = this.playOrder[this.currentTurnIdx];
    const nextPlayer = this.players[nextPlayerIdx];
    if (nextPlayer && nextPlayer.drawPile.length === 0 && nextPlayer.discardPile.length > 0) {
      nextPlayer.drawPile = nextPlayer.discardPile.reverse();
      nextPlayer.discardPile = [];
      this.broadcast({
        type: 'pile_recycled',
        playerIndex: nextPlayerIdx,
        playerName: nextPlayer.name,
      });
      this.broadcastPlayerList();
    }

    // Check if next player has any cards
    if (nextPlayer && nextPlayer.drawPile.length === 0 && nextPlayer.discardPile.length === 0) {
      // This player should be eliminated
      this.checkEliminations();
      if (this.state === STATES.FINISHED) return;
      // Try again with updated playOrder
      if (this.playOrder.length > 0) {
        this.broadcastTurn();
      }
      return;
    }

    this.broadcastTurn();
  }

  broadcastTurn() {
    if (this.state !== STATES.PLAYING || this.playOrder.length === 0) return;
    this.clearTurnTimer();
    this.waitingForFlip = true;

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];

    this.broadcast({
      type: 'turn_start',
      playerIndex: currentPlayerIdx,
      playerName: this.players[currentPlayerIdx]?.name,
      timeLimit: this.turnTimeLimit,
      tableState: this.getTableState(),
      bellLocked: this.bellLocked,
      playOrder: this.playOrder,
    });

    // Auto-flip on timeout
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.state !== STATES.PLAYING) return;
      if (!this.waitingForFlip) return;
      const cpIdx = this.playOrder[this.currentTurnIdx];
      if (cpIdx === undefined) return;
      this.doFlip(cpIdx);
    }, this.turnTimeLimit);
  }

  // ── Timers ──

  clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  clearAdvanceTimer() {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  clearAllTimers() {
    this.clearTurnTimer();
    this.clearAdvanceTimer();
    if (this.bellLockTimer) {
      clearTimeout(this.bellLockTimer);
      this.bellLockTimer = null;
    }
  }

  // ── End game ──

  endGame() {
    this.clearAllTimers();
    this.state = STATES.FINISHED;
    this.bellLocked = true;

    const winner = this.playOrder.length > 0 ? this.playOrder[0] : -1;
    const rankings = [];

    // Winner is the last player standing
    if (winner >= 0 && this.players[winner]) {
      rankings.push({
        playerIndex: winner,
        playerName: this.players[winner].name,
        rank: 1,
        isWinner: true,
        totalCards: this.players[winner].drawPile.length + this.players[winner].discardPile.length,
      });
    }

    // All other players (eliminated order)
    let rank = 2;
    for (let i = 0; i < this.players.length; i++) {
      if (i === winner) continue;
      if (this.players[i]) {
        rankings.push({
          playerIndex: i,
          playerName: this.players[i].name,
          rank: rank++,
          isWinner: false,
          totalCards: 0,
        });
      }
    }

    this.broadcast({
      type: 'game_over',
      rankings,
      winner,
      winnerName: this.players[winner]?.name || '未知',
    });

    this.scheduleDissolve();
  }

  dissolveGame() {
    this.clearAllTimers();
    if (this._disconnectTimers) {
      for (const id in this._disconnectTimers) clearTimeout(this._disconnectTimers[id]);
      this._disconnectTimers = {};
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

  // ── Reconnect ──

  sendReconnectState(playerIndex) {
    const msg = {
      type: 'reconnected',
      playerIndex,
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.getTableState(),
      maxPlayers: this._maxPlayers,
      playOrder: this.playOrder,
      currentTurn: this.playOrder.length > 0 ? this.playOrder[this.currentTurnIdx] : -1,
      turnTimeLimit: this.turnTimeLimit,
      spectatorCount: this.spectators.length,
      bellLocked: this.bellLocked,
      roundNumber: this.roundNumber,
    };
    this.sendTo(playerIndex, msg);
  }

  // ── Spectator state ──

  getSpectateState() {
    return {
      type: 'spectate_joined',
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.getTableState(),
      maxPlayers: this._maxPlayers,
      playOrder: this.playOrder,
      currentTurn: this.playOrder.length > 0 ? this.playOrder[this.currentTurnIdx] : -1,
      turnTimeLimit: this.turnTimeLimit,
      spectatorCount: this.spectators.length,
      bellLocked: this.bellLocked,
      roundNumber: this.roundNumber,
    };
  }
}

module.exports = HalliGalli;
