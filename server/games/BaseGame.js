class BaseGame {
  constructor(roomId, config = {}) {
    this.roomId = roomId;
    this.config = config;
    this.players = [];
    this.spectators = [];
    this.state = 'WAITING';
    this.createdAt = Date.now();
    this.onDissolve = null;
    this.dissolveTimer = null;
  }

  // Subclasses must override
  get gameType() {
    throw new Error('gameType not implemented');
  }

  get maxPlayers() {
    return 2;
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
    for (const s of this.spectators) {
      if (s.readyState === 1) {
        s.send(data);
      }
    }
  }

  sendTo(playerIndex, msg) {
    const player = this.players[playerIndex];
    if (player && player.ws.readyState === 1) {
      player.ws.send(JSON.stringify(msg));
    }
  }

  // Subclasses must override
  addPlayer(ws, playerId, playerName) {
    throw new Error('addPlayer not implemented');
  }

  // Subclasses must override
  removePlayer(playerId) {
    throw new Error('removePlayer not implemented');
  }

  // Subclasses must override
  handleMessage(playerId, msg) {
    throw new Error('handleMessage not implemented');
  }

  // Subclasses must override
  getSpectateState() {
    throw new Error('getSpectateState not implemented');
  }

  addSpectator(ws) {
    this.spectators.push(ws);
    const state = this.getSpectateState();
    ws.send(JSON.stringify(state));
    this.broadcastSpectatorCount();
  }

  removeSpectator(ws) {
    const idx = this.spectators.indexOf(ws);
    if (idx !== -1) {
      this.spectators.splice(idx, 1);
      this.broadcastSpectatorCount();
    }
  }

  broadcastSpectatorCount() {
    const msg = JSON.stringify({
      type: 'spectator_count',
      count: this.spectators.length,
    });
    for (const p of this.players) {
      if (p && p.ws.readyState === 1) p.ws.send(msg);
    }
    for (const s of this.spectators) {
      if (s.readyState === 1) s.send(msg);
    }
  }

  getSpectatorCount() {
    return this.spectators.length;
  }

  scheduleDissolve(delay = 10000) {
    if (this.dissolveTimer) return;
    this.dissolveTimer = setTimeout(() => {
      this.broadcast({
        type: 'room_dissolved',
        message: '游戏已结束，房间即将解散',
        redirect: true,
      });
      this.players = this.players.map(() => null);
      if (this.onDissolve) {
        this.onDissolve(this.roomId);
      }
    }, delay);
  }
}

module.exports = BaseGame;
