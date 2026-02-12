const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');
const { createGame, isValidGameType } = require('./games');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ── State ──
const rooms = new Map();

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
  const playerId = crypto.randomUUID();
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
      } else {
        currentRoom.removePlayer(playerId);
      }
      if (currentRoom.getPlayerCount() === 0 && currentRoom.getSpectatorCount() === 0) {
        rooms.delete(currentRoom.roomId);
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
