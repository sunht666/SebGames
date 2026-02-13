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

  // ── Disconnect with grace period for reconnect ──

  handleDisconnect(playerId) {
    const idx = this.getPlayerIndex(playerId);
    if (idx === -1) return;

    // Active game: give grace period for mobile reconnect
    if (this.state !== 'WAITING' && this.state !== 'FINISHED') {
      if (!this._disconnectTimers) this._disconnectTimers = {};
      this.broadcast({ type: 'player_away', playerIndex: idx, playerName: this.players[idx].name });
      this._disconnectTimers[playerId] = setTimeout(() => {
        delete this._disconnectTimers[playerId];
        this.removePlayer(playerId);
      }, 30000);
      return;
    }

    this.removePlayer(playerId);
  }

  reconnectPlayer(ws, newPlayerId, playerName) {
    const idx = this.players.findIndex(p => p && p.name === playerName);
    if (idx === -1) return { success: false };

    const player = this.players[idx];

    // Cancel pending disconnect timer
    if (this._disconnectTimers && this._disconnectTimers[player.id]) {
      clearTimeout(this._disconnectTimers[player.id]);
      delete this._disconnectTimers[player.id];
    }

    // Close old ws
    try { player.ws.close(); } catch {}

    // Swap identity
    player.ws = ws;
    player.id = newPlayerId;

    this.sendReconnectState(idx);
    this.broadcast({ type: 'player_back', playerIndex: idx, playerName: player.name });
    return { success: true };
  }

  // Subclasses should override to send full game state
  sendReconnectState(playerIndex) {}

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
    // Clear any pending reconnect timers
    if (this._disconnectTimers) {
      for (const id in this._disconnectTimers) clearTimeout(this._disconnectTimers[id]);
      this._disconnectTimers = {};
    }
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
