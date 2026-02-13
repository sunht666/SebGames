const BaseGame = require('./BaseGame');

const SUITS = ['spade', 'heart', 'diamond', 'club'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_ORDER = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };

const STATES = {
  WAITING: 'WAITING',
  PLAYING: 'PLAYING',
  FINISHED: 'FINISHED',
};

class BluffCard extends BaseGame {
  constructor(roomId, config = {}) {
    super(roomId, config);

    const dc = parseInt(config.deckCount, 10);
    this.deckCount = (!isNaN(dc) && dc >= 1 && dc <= 4) ? dc : 1;
    this.shuffleMode = !!config.shuffleMode;

    const mp = parseInt(config.maxPlayers, 10);
    this._maxPlayers = (!isNaN(mp) && mp >= 2 && mp <= 6) ? mp : 6;

    const tt = parseInt(config.turnTime, 10);
    this.turnTimeLimit = (!isNaN(tt) && tt >= 15 && tt <= 30) ? tt * 1000 : 20000;
    this.turnTimer = null;

    this.players = [];
    this.playOrder = []; // indices into this.players for active players
    this.currentTurnIdx = -1; // index into playOrder
    this.pile = []; // array of plays: { playerIndex, cards, declaredRank, declaredCount }
    this.pileCards = []; // flat array of all card objects in pile
    this.lastPlay = null;
    this.winners = [];
    this.roundNumber = 0;
    this.challengeTimer = null;
  }

  get gameType() {
    return 'bluff-card';
  }

  get maxPlayers() {
    return this._maxPlayers;
  }

  // ── Deck ──

  buildDeck(count) {
    if (!count) count = this.deckCount;
    const deck = [];
    for (let d = 0; d < count; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          deck.push({ id: `${suit}-${rank}-${d}`, suit, rank, isJoker: false });
        }
      }
      deck.push({ id: `joker-big-${d}`, suit: 'joker', rank: 'BIG', isJoker: true });
      deck.push({ id: `joker-small-${d}`, suit: 'joker', rank: 'SMALL', isJoker: true });
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

  sortHand(hand) {
    return hand.sort((a, b) => {
      if (a.isJoker && b.isJoker) return a.rank === 'BIG' ? -1 : 1;
      if (a.isJoker) return -1;
      if (b.isJoker) return 1;
      return (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0);
    });
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
      hand: [],
      ready: false,
    });

    this.sendTo(slot, {
      type: 'room_joined',
      playerId,
      playerIndex: slot,
      roomId: this.roomId,
      playerName,
      gameType: this.gameType,
      maxPlayers: this._maxPlayers,
      deckCount: this.deckCount,
      shuffleMode: this.shuffleMode,
      turnTimeLimit: this.turnTimeLimit,
    });

    // Notify all existing players
    for (let i = 0; i < this.players.length; i++) {
      if (i !== slot) {
        this.sendTo(i, {
          type: 'player_joined',
          playerIndex: slot,
          playerName,
        });
        this.sendTo(slot, {
          type: 'player_joined',
          playerIndex: i,
          playerName: this.players[i].name,
        });
      }
    }

    // Broadcast updated player list
    this.broadcastPlayerList();

    return { success: true };
  }

  removePlayer(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const playerName = this.players[idx].name;

    if (this.state === STATES.PLAYING) {
      // Remove from play order
      const poIdx = this.playOrder.indexOf(idx);

      // Mark player as disconnected
      this.players[idx] = null;

      if (poIdx !== -1) {
        // Was current player's turn?
        const wasCurrentTurn = poIdx === this.currentTurnIdx;
        this.playOrder.splice(poIdx, 1);

        if (this.playOrder.length <= 1) {
          this.endGame();
          return;
        }

        if (wasCurrentTurn) {
          // Adjust index
          if (this.currentTurnIdx >= this.playOrder.length) {
            this.currentTurnIdx = 0;
          }
          this.broadcast({
            type: 'player_disconnected',
            playerIndex: idx,
            playerName,
          });
          this.broadcastTurn();
        } else {
          // Adjust current turn index if needed
          if (poIdx < this.currentTurnIdx) {
            this.currentTurnIdx--;
          }
          this.broadcast({
            type: 'player_disconnected',
            playerIndex: idx,
            playerName,
          });
        }
      } else {
        this.broadcast({
          type: 'player_disconnected',
          playerIndex: idx,
          playerName,
        });
      }
    } else {
      // WAITING state
      this.players[idx] = null;
      // Compact player array for waiting state
      this.players = this.players.filter(p => p !== null);
      this.broadcast({ type: 'player_left', playerIndex: idx });
      // Send updated indices to all remaining players (host promotion)
      for (let i = 0; i < this.players.length; i++) {
        this.sendTo(i, { type: 'player_index_update', playerIndex: i });
      }
      this.broadcastPlayerList();
    }
  }

  broadcastPlayerList() {
    this.broadcast({
      type: 'player_list',
      players: this.players.map((p) =>
        p ? { name: p.name, cardCount: p.hand.length, ready: p.ready } : null
      ),
      maxPlayers: this._maxPlayers,
    });
  }

  // ── Game start ──

  startGame() {
    let deck;
    if (this.shuffleMode) {
      deck = this.shuffle(this.buildDeck(this.deckCount + 1));
      deck = deck.slice(0, this.deckCount * 54);
    } else {
      deck = this.shuffle(this.buildDeck());
    }

    // Deal evenly
    let cardIdx = 0;
    while (cardIdx < deck.length) {
      for (let i = 0; i < this.players.length && cardIdx < deck.length; i++) {
        if (this.players[i]) {
          this.players[i].hand.push(deck[cardIdx]);
          cardIdx++;
        }
      }
    }

    // Sort hands
    for (const p of this.players) {
      if (p) this.sortHand(p.hand);
    }

    this.state = STATES.PLAYING;

    // Counter-clockwise: reverse natural order
    this.playOrder = [];
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (this.players[i]) this.playOrder.push(i);
    }

    this.currentTurnIdx = 0;
    this.pile = [];
    this.pileCards = [];
    this.lastPlay = null;
    this.roundNumber = 1;

    this.broadcast({ type: 'state_change', state: STATES.PLAYING });

    // Send each player their hand
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i]) {
        this.sendTo(i, {
          type: 'hand_update',
          hand: this.players[i].hand,
        });
      }
    }

    this.broadcastPlayerList();
    this.broadcastTurn();
  }

  // ── Message dispatch ──

  handleMessage(playerId, msg) {
    if (this.turnTimer && ['play_cards', 'challenge', 'pass'].includes(msg.type)) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    switch (msg.type) {
      case 'start_game':
        this.handleStartGame(playerId);
        break;
      case 'play_cards':
        this.handlePlayCards(playerId, msg);
        break;
      case 'challenge':
        this.handleChallenge(playerId);
        break;
      case 'pass':
        this.handlePass(playerId);
        break;
    }
  }

  handleStartGame(playerId) {
    if (this.state !== STATES.WAITING) return;
    // Only host (first player) can start
    if (!this.players[0] || this.players[0].id !== playerId) return;
    if (this.players.filter(p => p !== null).length < 2) return;
    this.startGame();
  }

  handlePlayCards(playerId, msg) {
    if (this.state !== STATES.PLAYING) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
    if (idx !== currentPlayerIdx) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    const { cardIds, declaredRank, declaredCount } = msg;

    // Validate
    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      this.sendTo(idx, { type: 'error', message: '请选择要出的牌' });
      return;
    }

    if (!declaredRank || !declaredCount) {
      this.sendTo(idx, { type: 'error', message: '请声明牌的点数和张数' });
      return;
    }

    if (declaredCount !== cardIds.length) {
      this.sendTo(idx, { type: 'error', message: '声明张数与实际出牌数不符' });
      return;
    }

    // Validate rank is a real rank
    if (!RANKS.includes(declaredRank)) {
      this.sendTo(idx, { type: 'error', message: '无效的点数声明' });
      return;
    }

    // If following (lastPlay exists), must declare same rank
    if (this.lastPlay && this.lastPlay.declaredRank !== declaredRank) {
      this.sendTo(idx, { type: 'error', message: `必须声明 ${this.lastPlay.declaredRank}` });
      return;
    }

    // Validate player owns cards
    const player = this.players[idx];
    const playedCards = [];
    for (const cid of cardIds) {
      const cardIndex = player.hand.findIndex(c => c.id === cid);
      if (cardIndex === -1) {
        this.sendTo(idx, { type: 'error', message: '你没有这张牌' });
        return;
      }
      playedCards.push(player.hand[cardIndex]);
    }

    // Remove cards from hand
    for (const cid of cardIds) {
      const ci = player.hand.findIndex(c => c.id === cid);
      if (ci !== -1) player.hand.splice(ci, 1);
    }

    // Add to pile
    const play = {
      playerIndex: idx,
      cards: playedCards,
      declaredRank,
      declaredCount,
    };
    this.pile.push(play);
    this.pileCards.push(...playedCards);
    this.lastPlay = play;

    // Broadcast (face-down — no card details)
    this.broadcast({
      type: 'cards_played',
      playerIndex: idx,
      playerName: player.name,
      declaredRank,
      declaredCount,
      pileCount: this.pileCards.length,
    });

    // Send updated hand
    this.sendTo(idx, { type: 'hand_update', hand: player.hand });

    // Broadcast updated player list (card counts)
    this.broadcastPlayerList();

    // Check win condition — first player to empty hand wins, game ends
    if (player.hand.length === 0) {
      this.winners.push(idx);
      this.endGame();
      return;
    }

    // Advance turn
    this.advanceTurn();
  }

  handleChallenge(playerId) {
    if (this.state !== STATES.PLAYING) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
    if (idx !== currentPlayerIdx) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    if (!this.lastPlay) {
      this.sendTo(idx, { type: 'error', message: '没有可质疑的出牌' });
      return;
    }

    if (this.lastPlay.playerIndex === idx) {
      this.sendTo(idx, { type: 'error', message: '不能质疑自己的出牌' });
      return;
    }

    // Check if last play was a bluff
    const declaredRank = this.lastPlay.declaredRank;
    const lastCards = this.lastPlay.cards;
    const isBluff = lastCards.some(c => !c.isJoker && c.rank !== declaredRank);

    let loserIdx;
    let winnerIdx;
    if (isBluff) {
      // Bluff found — challenger wins
      loserIdx = this.lastPlay.playerIndex;
      winnerIdx = idx;
    } else {
      // No bluff — challenger loses
      loserIdx = idx;
      winnerIdx = this.lastPlay.playerIndex;
    }

    // Broadcast challenge result with revealed cards
    this.broadcast({
      type: 'challenge_result',
      challengerIndex: idx,
      challengerName: this.players[idx]?.name,
      challengedIndex: this.lastPlay.playerIndex,
      challengedName: this.players[this.lastPlay.playerIndex]?.name,
      revealedCards: lastCards,
      allPileCards: [...this.pileCards],
      declaredRank,
      isBluff,
      loserIndex: loserIdx,
      loserName: this.players[loserIdx]?.name,
      winnerIndex: winnerIdx,
      winnerName: this.players[winnerIdx]?.name,
    });

    // Loser takes all pile cards
    const loser = this.players[loserIdx];
    if (loser) {
      loser.hand.push(...this.pileCards);
      this.sortHand(loser.hand);
      this.sendTo(loserIdx, { type: 'hand_update', hand: loser.hand });
    }

    // Clear pile
    this.pile = [];
    this.pileCards = [];
    this.lastPlay = null;
    this.roundNumber++;

    this.broadcastPlayerList();

    // Winner starts next round — after 3s delay
    const winnerPoIdx = this.playOrder.indexOf(winnerIdx);
    if (winnerPoIdx !== -1) {
      this.currentTurnIdx = winnerPoIdx;
    }

    // Delay before next turn (4s to view all pile cards)
    this.challengeTimer = setTimeout(() => {
      this.challengeTimer = null;
      this.broadcast({ type: 'new_round', roundNumber: this.roundNumber });
      this.broadcastTurn();
    }, 4000);
  }

  handlePass(playerId) {
    if (this.state !== STATES.PLAYING) return;
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
    if (idx !== currentPlayerIdx) {
      this.sendTo(idx, { type: 'error', message: '还没有轮到你' });
      return;
    }

    // Can only pass if there's a lastPlay (round starter must play)
    if (!this.lastPlay) {
      this.sendTo(idx, { type: 'error', message: '新一轮必须出牌' });
      return;
    }

    this.broadcast({
      type: 'player_passed',
      playerIndex: idx,
      playerName: this.players[idx]?.name,
    });

    this.advanceTurn();
  }

  // ── Turn management ──

  advanceTurn() {
    if (this.state !== STATES.PLAYING) return;

    this.currentTurnIdx = (this.currentTurnIdx + 1) % this.playOrder.length;

    // Check if we've rotated back to the last player who played
    if (this.lastPlay) {
      const lastPlayerIdx = this.lastPlay.playerIndex;
      const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
      if (currentPlayerIdx === lastPlayerIdx) {
        // Full rotation — clear pile, new round
        this.pile = [];
        this.pileCards = [];
        this.lastPlay = null;
        this.roundNumber++;
        this.broadcast({
          type: 'new_round',
          roundNumber: this.roundNumber,
          starterIndex: currentPlayerIdx,
          starterName: this.players[currentPlayerIdx]?.name,
        });
      }
    }

    this.broadcastTurn();
  }

  broadcastTurn() {
    if (this.state !== STATES.PLAYING || this.playOrder.length === 0) return;

    if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; }

    const currentPlayerIdx = this.playOrder[this.currentTurnIdx];
    const canChallenge = this.lastPlay !== null && this.lastPlay.playerIndex !== currentPlayerIdx;
    const canPass = this.lastPlay !== null;
    const mustPlay = this.lastPlay === null; // Round starter must play

    this.broadcast({
      type: 'turn_start',
      playerIndex: currentPlayerIdx,
      playerName: this.players[currentPlayerIdx]?.name,
      canChallenge,
      canPass,
      mustPlay,
      declaredRank: this.lastPlay?.declaredRank || null,
      pileCount: this.pileCards.length,
      roundNumber: this.roundNumber,
      timeLimit: this.turnTimeLimit,
    });

    // Auto timeout: pass or auto-play first card
    this.turnTimer = setTimeout(() => {
      this.turnTimer = null;
      if (this.state !== STATES.PLAYING) return;
      const cpIdx = this.playOrder[this.currentTurnIdx];
      if (cpIdx === undefined) return;
      const player = this.players[cpIdx];
      if (!player) return;

      if (this.lastPlay) {
        // Can pass - auto pass
        this.broadcast({ type: 'player_passed', playerIndex: cpIdx, playerName: player.name, isTimeout: true });
        this.advanceTurn();
      } else {
        // Round starter must play - auto play first card
        const card = player.hand[0];
        if (!card) return;
        const declaredRank = card.isJoker ? 'A' : card.rank;
        this.handlePlayCards(player.id, { cardIds: [card.id], declaredRank, declaredCount: 1 });
      }
    }, this.turnTimeLimit);
  }

  // ── Win/Loss ──

  endGame() {
    if (this.challengeTimer) {
      clearTimeout(this.challengeTimer);
      this.challengeTimer = null;
    }
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
    this.state = STATES.FINISHED;

    // Last player(s) remaining are losers
    for (const pi of this.playOrder) {
      if (!this.winners.includes(pi)) {
        this.winners.push(pi);
      }
    }

    const rankings = this.winners.map((pi, rank) => ({
      playerIndex: pi,
      playerName: this.players[pi]?.name || '玩家',
      rank: rank + 1,
      isWinner: rank === 0,
      isLoser: rank === this.winners.length - 1,
    }));

    this.broadcast({
      type: 'game_over',
      rankings,
      winner: this.winners[0],
    });

    this.scheduleDissolve();
  }

  // ── Spectators ──

  getSpectateState() {
    return {
      type: 'spectate_joined',
      roomId: this.roomId,
      gameType: this.gameType,
      state: this.state,
      players: this.players.map((p) =>
        p ? { name: p.name, cardCount: p.hand.length, ready: p.ready } : null
      ),
      maxPlayers: this._maxPlayers,
      currentTurn: this.playOrder.length > 0 ? this.playOrder[this.currentTurnIdx] : -1,
      lastPlay: this.lastPlay ? {
        playerIndex: this.lastPlay.playerIndex,
        playerName: this.players[this.lastPlay.playerIndex]?.name,
        declaredRank: this.lastPlay.declaredRank,
        declaredCount: this.lastPlay.declaredCount,
      } : null,
      pileCount: this.pileCards.length,
      roundNumber: this.roundNumber,
      winners: this.winners.map((pi, rank) => ({
        playerIndex: pi,
        playerName: this.players[pi]?.name,
        rank: rank + 1,
      })),
      spectatorCount: this.spectators.length,
      deckCount: this.deckCount,
      shuffleMode: this.shuffleMode,
      turnTimeLimit: this.turnTimeLimit,
      playOrder: this.playOrder,
    };
  }
}

module.exports = BluffCard;
