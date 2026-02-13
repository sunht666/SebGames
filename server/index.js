const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');
const { createGame, isValidGameType } = require('./games');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ── Heartbeat: detect dead connections (mobile background, etc.) ──
const HEARTBEAT_INTERVAL = 25000;
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws._isAlive === false) return ws.terminate();
    ws._isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

// ── State ──
const rooms = new Map();
const kickBans = new Map(); // roomId → Map<ip, expiryTimestamp>

// ── Rate limiting (HTTP) ──
const httpLimits = new Map();

function httpRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  let entry = httpLimits.get(ip);
  if (!entry || now > entry.resetTime) {
    entry = { count: 0, resetTime: now + 60000 };
    httpLimits.set(ip, entry);
  }
  entry.count++;
  if (entry.count > 120) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }
  next();
}

// Clean up stale rate-limit entries every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of httpLimits) {
    if (now > e.resetTime) httpLimits.delete(ip);
  }
}, 300000);

// Clean up empty / stale rooms every minute
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.getPlayerCount() === 0 && room.getSpectatorCount() === 0 && now - room.createdAt > 60000) {
      rooms.delete(id);
    }
  }
  // Clean up expired kick bans
  for (const [roomId, bans] of kickBans) {
    for (const [ip, expiry] of bans) {
      if (now >= expiry) bans.delete(ip);
    }
    if (bans.size === 0) kickBans.delete(roomId);
  }
}, 60000);

// ── Middleware ──
app.use(express.json());
app.use(httpRateLimit);

// Serve built client in production
app.use(express.static(path.join(__dirname, '../client/dist')));

// ── REST API ──
app.get('/api/room/:roomId', (req, res) => {
  const roomId = parseInt(req.params.roomId, 10);
  if (isNaN(roomId) || roomId < 1000 || roomId > 9999) {
    return res.status(400).json({ error: '房间号必须在1000-9999之间' });
  }
  const room = rooms.get(roomId);
  if (!room) {
    return res.json({ exists: false, players: 0 });
  }
  return res.json({
    exists: true,
    players: room.getPlayerCount(),
    state: room.state,
    gameType: room.gameType,
    maxPlayers: room.maxPlayers,
  });
});

// Create room — POST with { gameType, config }
app.post('/api/create-room', (req, res) => {
  const { gameType = 'number-mine', config = {} } = req.body || {};

  if (!isValidGameType(gameType)) {
    return res.status(400).json({ error: '未知游戏类型' });
  }

  for (let attempt = 0; attempt < 100; attempt++) {
    const id = Math.floor(Math.random() * 9000) + 1000;
    if (!rooms.has(id)) {
      const game = createGame(id, gameType, config);
      game.onDissolve = (roomId) => rooms.delete(roomId);
      rooms.set(id, game);
      return res.json({ roomId: id, gameType });
    }
  }
  return res.status(503).json({ error: '暂时无法创建房间，请稍后再试' });
});

// Room listing for home page
app.get('/api/rooms', (_req, res) => {
  const list = [];
  for (const [id, room] of rooms) {
    const playerCount = room.getPlayerCount();
    if (playerCount === 0) continue;
    list.push({
      roomId: id,
      gameType: room.gameType,
      maxPlayers: room.maxPlayers,
      state: room.state,
      players: room.players.map((p) => (p ? { name: p.name } : null)),
      playerCount,
      spectatorCount: room.getSpectatorCount(),
      roundNumber: room.roundNumber || 0,
    });
  }
  res.json(list);
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// ── WebSocket ──
wss.on('connection', (ws, req) => {
  ws._isAlive = true;
  ws.on('pong', () => { ws._isAlive = true; });

  const playerId = crypto.randomUUID();
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  ws._clientIp = clientIp;
  let currentRoom = null;
  let isSpectator = false;

  // Per-connection rate limit: max 10 messages per second
  let wsRate = { count: 0, resetTime: Date.now() + 1000 };

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now > wsRate.resetTime) {
      wsRate = { count: 0, resetTime: now + 1000 };
    }
    wsRate.count++;
    if (wsRate.count > 10) {
      ws.send(JSON.stringify({ type: 'error', message: '消息过于频繁' }));
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: '无效消息' }));
      return;
    }

    handleMessage(ws, playerId, msg);
  });

  ws.on('close', () => {
    if (currentRoom) {
      if (isSpectator) {
        currentRoom.removeSpectator(ws);
        if (currentRoom.getPlayerCount() === 0 && currentRoom.getSpectatorCount() === 0) {
          rooms.delete(currentRoom.roomId);
        }
      } else {
        currentRoom.handleDisconnect(playerId);
      }
      currentRoom = null;
    }
  });

  // Send connection acknowledgement
  ws.send(JSON.stringify({ type: 'connected', playerId }));

  // ── Message router ──
  function handleMessage(ws, playerId, msg) {
    switch (msg.type) {
      case 'join_room': {
        if (currentRoom) {
          ws.send(JSON.stringify({ type: 'error', message: '你已在房间中' }));
          return;
        }
        const roomId = parseInt(msg.roomId, 10);
        if (isNaN(roomId) || roomId < 1000 || roomId > 9999) {
          ws.send(JSON.stringify({ type: 'error', message: '房间号必须在1000-9999之间' }));
          return;
        }

        let room = rooms.get(roomId);
        if (!room) {
          // Auto-create default NumberMine for backward compat
          room = createGame(roomId, 'number-mine', {});
          room.onDissolve = (rid) => rooms.delete(rid);
          rooms.set(roomId, room);
        }

        // Check kick ban
        const roomBans = kickBans.get(roomId);
        if (roomBans) {
          const banExpiry = roomBans.get(clientIp);
          if (banExpiry && Date.now() < banExpiry) {
            const remaining = Math.ceil((banExpiry - Date.now()) / 1000);
            ws.send(JSON.stringify({ type: 'error', message: `你已被踢出，${remaining}秒后可重新加入` }));
            return;
          }
        }

        const result = room.addPlayer(ws, playerId, msg.playerName || '玩家');
        if (result.success) {
          currentRoom = room;
        } else {
          ws.send(JSON.stringify({ type: 'error', message: result.error }));
        }
        break;
      }

      case 'spectate': {
        if (currentRoom) {
          ws.send(JSON.stringify({ type: 'error', message: '你已在房间中' }));
          return;
        }
        const specRoomId = parseInt(msg.roomId, 10);
        if (isNaN(specRoomId) || specRoomId < 1000 || specRoomId > 9999) {
          ws.send(JSON.stringify({ type: 'error', message: '房间号必须在1000-9999之间' }));
          return;
        }
        const specRoom = rooms.get(specRoomId);
        if (!specRoom) {
          ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
          return;
        }
        currentRoom = specRoom;
        isSpectator = true;
        specRoom.addSpectator(ws);
        break;
      }

      case 'reconnect': {
        if (currentRoom) {
          ws.send(JSON.stringify({ type: 'error', message: '你已在房间中' }));
          return;
        }
        const rcRoomId = parseInt(msg.roomId, 10);
        if (isNaN(rcRoomId) || rcRoomId < 1000 || rcRoomId > 9999) {
          ws.send(JSON.stringify({ type: 'reconnect_failed' }));
          return;
        }
        const rcRoom = rooms.get(rcRoomId);
        if (!rcRoom) {
          ws.send(JSON.stringify({ type: 'reconnect_failed' }));
          return;
        }
        const rcResult = rcRoom.reconnectPlayer(ws, playerId, msg.playerName);
        if (rcResult.success) {
          currentRoom = rcRoom;
        } else {
          ws.send(JSON.stringify({ type: 'reconnect_failed' }));
        }
        break;
      }

      case 'leave_room': {
        if (!currentRoom) return;
        if (isSpectator) {
          currentRoom.removeSpectator(ws);
          if (currentRoom.getPlayerCount() === 0 && currentRoom.getSpectatorCount() === 0) {
            rooms.delete(currentRoom.roomId);
          }
        } else {
          currentRoom.removePlayer(playerId);
          if (currentRoom.getPlayerCount() === 0 && currentRoom.getSpectatorCount() === 0) {
            rooms.delete(currentRoom.roomId);
          }
        }
        currentRoom = null;
        isSpectator = false;
        ws.send(JSON.stringify({ type: 'room_left' }));
        break;
      }

      case 'kick_player': {
        if (!currentRoom || isSpectator) return;
        if (currentRoom.state !== 'WAITING') {
          ws.send(JSON.stringify({ type: 'error', message: '游戏进行中不能踢人' }));
          return;
        }
        // Only host (player[0]) can kick
        if (!currentRoom.players[0] || currentRoom.players[0].id !== playerId) {
          ws.send(JSON.stringify({ type: 'error', message: '只有房主可以踢人' }));
          return;
        }
        const targetIndex = parseInt(msg.targetIndex, 10);
        if (isNaN(targetIndex) || targetIndex <= 0) {
          ws.send(JSON.stringify({ type: 'error', message: '无效的目标' }));
          return;
        }
        const target = currentRoom.players[targetIndex];
        if (!target) {
          ws.send(JSON.stringify({ type: 'error', message: '该玩家不存在' }));
          return;
        }
        const targetIp = target.ws._clientIp;
        const targetPlayerId = target.id;
        const targetName = target.name;

        // Send kicked notification to target
        if (target.ws.readyState === 1) {
          target.ws.send(JSON.stringify({ type: 'kicked', message: '你已被房主踢出房间，30秒内无法再次加入' }));
        }

        // Add kick ban (30 seconds)
        const roomId = currentRoom.roomId;
        if (!kickBans.has(roomId)) kickBans.set(roomId, new Map());
        if (targetIp) kickBans.get(roomId).set(targetIp, Date.now() + 30000);

        // Remove player from game
        currentRoom.removePlayer(targetPlayerId);

        // Broadcast notification
        currentRoom.broadcast({
          type: 'player_kicked',
          playerIndex: targetIndex,
          playerName: targetName,
        });

        break;
      }

      default: {
        // Delegate game-specific messages to the room
        if (currentRoom && !isSpectator) {
          currentRoom.handleMessage(playerId, msg);
        } else {
          ws.send(JSON.stringify({ type: 'error', message: '未知消息类型' }));
        }
      }
    }
  }
});

// ── Start ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
