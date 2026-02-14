<template>
  <div class="game-page">
    <!-- ── Header ── -->
    <header class="game-header">
      <div class="header-left">
        <button class="btn btn-outline btn-sm" @click="leaveRoom">
          {{ spectateMode ? '退出观战' : '退出' }}
        </button>
        <span class="room-tag">房间 {{ roomId }}</span>
        <span v-if="spectateMode" class="spec-tag">观战中</span>
      </div>
      <div class="header-center">
        <span class="player-label" :class="{ active: currentTurn === 0 }">
          <span class="stone-icon stone-black-sm" v-if="firstPlayer === 0"></span>
          <span class="stone-icon stone-white-sm" v-else-if="firstPlayer === 1"></span>
          {{ players[0]?.name || '等待中...' }}
        </span>
        <span class="vs">VS</span>
        <span class="player-label" :class="{ active: currentTurn === 1 }">
          <span class="stone-icon stone-black-sm" v-if="firstPlayer === 1"></span>
          <span class="stone-icon stone-white-sm" v-else-if="firstPlayer === 0"></span>
          {{ players[1]?.name || '等待中...' }}
        </span>
      </div>
      <div class="header-right">
        <span v-if="spectatorCount > 0" class="spec-badge">{{ spectatorCount }}人观战</span>
        <span v-if="gameState === 'PLAYING'" class="timer" :class="timerClass">
          {{ timeLeft }}s
        </span>
      </div>
    </header>

    <!-- ── Main content ── -->
    <main class="game-main">
      <!-- Connecting -->
      <div v-if="gameState === 'CONNECTING'" class="state-panel fade-in text-center">
        <div class="spinner"></div>
        <p class="mt-2">正在连接服务器...</p>
      </div>

      <!-- Waiting for opponent -->
      <div v-else-if="gameState === 'WAITING'" class="state-panel fade-in text-center">
        <div class="waiting-icon">&#9203;</div>
        <h2>等待玩家加入</h2>
        <p class="text-muted mt-1">房间号: <strong class="text-primary">{{ roomId }}</strong></p>
        <p class="text-muted">{{ playerCount }} / 2 玩家</p>

        <div class="player-slots mt-3">
          <div v-for="i in 2" :key="i - 1" class="player-slot" :class="{ filled: players[i - 1]?.name }">
            <span v-if="players[i - 1]?.name" class="slot-name">{{ players[i - 1].name }}</span>
            <span v-else class="slot-empty">空位</span>
            <span v-if="i === 1 && players[0]?.name" class="host-badge">房主</span>
            <button
              v-if="!spectateMode && playerIndex === 0 && i > 1 && players[i - 1]?.name"
              class="kick-btn"
              @click="confirmKick(i - 1)"
            >&#10005;</button>
          </div>
        </div>

        <button
          v-if="!spectateMode && playerIndex === 0 && playerCount >= 2"
          class="btn btn-primary btn-lg mt-3"
          @click="startGame"
        >
          开始游戏
        </button>
        <p v-else-if="!spectateMode && playerIndex === 0" class="text-muted mt-2">至少需要2名玩家</p>
      </div>

      <!-- Dice rolling -->
      <div v-else-if="gameState === 'ROLLING'" class="state-panel fade-in text-center">
        <h2 class="mb-2">掷骰子决定先手</h2>
        <div class="dice-area">
          <div class="dice-player">
            <span class="dice-name">{{ players[0]?.name }}</span>
            <div class="dice" :class="{ rolling: diceRolling }">
              {{ diceValues[0] || '?' }}
            </div>
          </div>
          <div class="dice-vs">VS</div>
          <div class="dice-player">
            <span class="dice-name">{{ players[1]?.name }}</span>
            <div class="dice" :class="{ rolling: diceRolling }">
              {{ diceValues[1] || '?' }}
            </div>
          </div>
        </div>
        <p v-if="diceTie" class="text-warning mt-2">平局！重新掷骰子...</p>
        <p v-if="firstPlayer >= 0" class="text-success mt-2">
          {{ players[firstPlayer]?.name }} 执黑先手！
        </p>
      </div>

      <!-- Playing -->
      <div v-else-if="gameState === 'PLAYING'" class="play-area fade-in">
        <PlayerBar ref="playerBarRef" :players="players" :my-index="playerIndex" @send-emoji="onSendEmoji" />
        <div class="turn-info">
          <span v-if="!spectateMode && isMyTurn" class="turn-text turn-mine">轮到你落子</span>
          <span v-else-if="!spectateMode" class="turn-text turn-other">对手思考中...</span>
          <span v-else class="turn-text turn-other">{{ players[currentTurn]?.name }} 思考中...</span>
          <span class="move-counter">第 {{ moveCount + 1 }} 手</span>
          <button v-if="canRequestUndo" class="btn btn-outline btn-sm undo-btn" @click="requestUndo">悔棋</button>
        </div>

        <div class="board-container">
          <div class="board">
            <div class="board-inner">
              <!-- Grid lines -->
              <div v-for="r in 15" :key="'h'+r" class="grid-line-h" :style="{ top: ((r-1) / 14 * 100) + '%' }"></div>
              <div v-for="c in 15" :key="'v'+c" class="grid-line-v" :style="{ left: ((c-1) / 14 * 100) + '%' }"></div>

              <!-- Star points -->
              <div v-for="(p, i) in starPoints" :key="'star'+i"
                class="star-point"
                :style="{ left: (p[1] / 14 * 100) + '%', top: (p[0] / 14 * 100) + '%' }">
              </div>

              <!-- Stones -->
              <template v-for="r in 15" :key="'row'+r">
                <div
                  v-for="c in 15"
                  :key="'cell'+r+'-'+c"
                  class="cell"
                  :style="{ left: ((c-1) / 14 * 100) + '%', top: ((r-1) / 14 * 100) + '%' }"
                  @click.stop="placeStone(r-1, c-1)"
                >
                  <div v-if="board[r-1][c-1] === 1" class="stone stone-black"
                    :class="{ 'last-move': isLastMove(r-1, c-1), 'win-stone': isWinStone(r-1, c-1) }">
                    <div v-if="isLastMove(r-1, c-1)" class="last-dot"></div>
                  </div>
                  <div v-else-if="board[r-1][c-1] === 2" class="stone stone-white"
                    :class="{ 'last-move': isLastMove(r-1, c-1), 'win-stone': isWinStone(r-1, c-1) }">
                    <div v-if="isLastMove(r-1, c-1)" class="last-dot last-dot-dark"></div>
                  </div>
                  <div v-else-if="!spectateMode && isMyTurn && gameState === 'PLAYING'" class="stone-hover"></div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="gameState === 'FINISHED'" class="play-area fade-in">
        <div class="result-banner text-center">
          <template v-if="winner === -1">
            <div class="result-icon">&#129309;</div>
            <h2 class="text-warning">平局！</h2>
          </template>
          <template v-else-if="spectateMode">
            <div class="result-icon">&#127942;</div>
            <h2 class="text-success">{{ players[winner]?.name || '玩家' }} 获胜！</h2>
          </template>
          <template v-else>
            <div class="result-icon">{{ isWinner ? '&#127942;' : '&#128546;' }}</div>
            <h2 :class="isWinner ? 'text-success' : 'text-danger'">
              {{ isWinner ? '你赢了！' : '你输了！' }}
            </h2>
          </template>
          <p v-if="finishReason === 'disconnect'" class="text-muted mt-1">
            {{ spectateMode ? '有玩家断开连接' : '对手已断开连接' }}
          </p>
          <p v-else-if="finishReason === 'five_in_row'" class="text-muted mt-1">
            五子连珠！
          </p>
        </div>

        <!-- Show final board -->
        <div class="board-container mt-2">
          <div class="board">
            <div class="board-inner">
              <div v-for="r in 15" :key="'h'+r" class="grid-line-h" :style="{ top: ((r-1) / 14 * 100) + '%' }"></div>
              <div v-for="c in 15" :key="'v'+c" class="grid-line-v" :style="{ left: ((c-1) / 14 * 100) + '%' }"></div>
              <div v-for="(p, i) in starPoints" :key="'star'+i"
                class="star-point"
                :style="{ left: (p[1] / 14 * 100) + '%', top: (p[0] / 14 * 100) + '%' }">
              </div>
              <template v-for="r in 15" :key="'row'+r">
                <div
                  v-for="c in 15"
                  :key="'cell'+r+'-'+c"
                  class="cell"
                  :style="{ left: ((c-1) / 14 * 100) + '%', top: ((r-1) / 14 * 100) + '%' }"
                >
                  <div v-if="board[r-1][c-1] === 1" class="stone stone-black"
                    :class="{ 'last-move': isLastMove(r-1, c-1), 'win-stone': isWinStone(r-1, c-1) }">
                    <div v-if="isLastMove(r-1, c-1)" class="last-dot"></div>
                  </div>
                  <div v-else-if="board[r-1][c-1] === 2" class="stone stone-white"
                    :class="{ 'last-move': isLastMove(r-1, c-1), 'win-stone': isWinStone(r-1, c-1) }">
                    <div v-if="isLastMove(r-1, c-1)" class="last-dot last-dot-dark"></div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <div class="text-center mt-3">
          <button class="btn btn-primary btn-lg" @click="leaveRoom">返回大厅</button>
        </div>
      </div>

      <!-- Room dissolved -->
      <div v-else-if="gameState === 'DISSOLVED'" class="state-panel fade-in text-center">
        <div class="waiting-icon">&#9203;</div>
        <h2 class="text-warning">房间已解散</h2>
        <p class="text-muted mt-1">{{ dissolveMessage }}</p>
        <button class="btn btn-primary btn-lg mt-3" @click="leaveRoom">返回大厅</button>
      </div>

      <!-- Undo request overlay -->
      <div v-if="undoPending" class="undo-overlay">
        <div class="undo-modal">
          <template v-if="spectateMode">
            <p class="undo-text">{{ players[undoRequesterIdx]?.name }} 请求悔棋</p>
            <p class="undo-countdown">{{ undoCountdown }}s</p>
          </template>
          <template v-else-if="undoRequesterIdx === playerIndex">
            <p class="undo-text">等待对方回应悔棋请求...</p>
            <p class="undo-countdown">{{ undoCountdown }}s</p>
          </template>
          <template v-else>
            <p class="undo-text">{{ players[undoRequesterIdx]?.name }} 请求悔棋</p>
            <p class="undo-countdown">{{ undoCountdown }}s</p>
            <div class="undo-actions">
              <button class="btn btn-success" @click="respondUndo(true)">同意</button>
              <button class="btn btn-outline" @click="respondUndo(false)">拒绝</button>
            </div>
          </template>
        </div>
      </div>

      <!-- Error toast -->
      <div v-if="errorMsg" class="toast-error" @click="errorMsg = ''">
        {{ errorMsg }}
      </div>

      <!-- Kick confirm modal -->
      <div v-if="kickTarget >= 0" class="kick-overlay" @click="kickTarget = -1">
        <div class="kick-modal" @click.stop>
          <p class="kick-modal-text">确定要踢出 <strong>{{ players[kickTarget]?.name || '玩家' }}</strong> 吗？</p>
          <p class="kick-modal-warn">踢出后对方30秒内无法再次加入</p>
          <div class="kick-modal-actions">
            <button class="btn btn-outline" @click="kickTarget = -1">取消</button>
            <button class="btn btn-danger" @click="doKick">确认踢出</button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import PlayerBar from '../components/PlayerBar.vue';

const props = defineProps({ roomId: String, spectateMode: { type: Boolean, default: false } });
const router = useRouter();

// ── State ──
const ws = ref(null);
const playerId = ref(null);
const playerIndex = ref(-1);
const gameState = ref('CONNECTING');
const players = reactive([
  { name: '' },
  { name: '' },
]);
const currentTurn = ref(-1);
const firstPlayer = ref(-1); // who plays black
const timeLeft = ref(30);
const turnTimeLimit = ref(30000);
const moveCount = ref(0);
const board = reactive(createEmptyBoard());
const history = reactive([]);
const winner = ref(-1);
const winLine = ref(null);
const finishReason = ref('');
const errorMsg = ref('');
const spectatorCount = ref(0);
const dissolveMessage = ref('');
const kickTarget = ref(-1);
const hasJoinedRoom = ref(false);
const playerBarRef = ref(null);

// Dice
const diceValues = reactive([null, null]);
const diceRolling = ref(false);
const diceTie = ref(false);

// Undo
const undoPending = ref(false);
const undoRequesterIdx = ref(-1);
const undoCountdown = ref(0);
let undoCountdownInterval = null;
const myLastMoveCanUndo = ref(false);
const undoWindowOpen = ref(false);
let undoWindowTimer = null;

// Timer
let timerInterval = null;

// Star points on 15x15 board
const starPoints = [
  [3, 3], [3, 7], [3, 11],
  [7, 3], [7, 7], [7, 11],
  [11, 3], [11, 7], [11, 11],
];

// ── Computed ──
const playerCount = computed(() => players.filter(p => p.name).length);
const isMyTurn = computed(() => currentTurn.value === playerIndex.value);
const isWinner = computed(() => winner.value === playerIndex.value);

const canRequestUndo = computed(() => {
  if (props.spectateMode) return false;
  if (undoPending.value) return false;
  if (isMyTurn.value) return false;
  if (!myLastMoveCanUndo.value) return false;
  if (!undoWindowOpen.value) return false;
  return true;
});

const timerClass = computed(() => {
  if (timeLeft.value <= 5) return 'timer-danger';
  if (timeLeft.value <= 10) return 'timer-warning';
  return '';
});

function createEmptyBoard() {
  return Array.from({ length: 15 }, () => new Array(15).fill(0));
}

function isLastMove(r, c) {
  if (history.length === 0) return false;
  const last = history[history.length - 1];
  return last.row === r && last.col === c;
}

function isWinStone(r, c) {
  if (!winLine.value) return false;
  return winLine.value.some(p => p[0] === r && p[1] === c);
}

// ── Actions ──
function send(msg) {
  if (ws.value && ws.value.readyState === 1) {
    ws.value.send(JSON.stringify(msg));
  }
}

function startGame() { send({ type: 'start_game' }); }

function confirmKick(targetIndex) {
  kickTarget.value = targetIndex;
}

function doKick() {
  if (kickTarget.value >= 0) {
    send({ type: 'kick_player', targetIndex: kickTarget.value });
    kickTarget.value = -1;
  }
}

function onSendEmoji(emoji) { send({ type: 'send_emoji', emoji }); }

function requestUndo() {
  send({ type: 'request_undo' });
}

function respondUndo(accept) {
  send({ type: 'respond_undo', accept });
}

function startUndoCountdown() {
  clearUndoCountdown();
  undoCountdown.value = 10;
  undoCountdownInterval = setInterval(() => {
    undoCountdown.value--;
    if (undoCountdown.value <= 0) clearUndoCountdown();
  }, 1000);
}

function clearUndoCountdown() {
  if (undoCountdownInterval) { clearInterval(undoCountdownInterval); undoCountdownInterval = null; }
}

function placeStone(row, col) {
  if (props.spectateMode) return;
  if (gameState.value !== 'PLAYING') return;
  if (!isMyTurn.value) return;
  if (undoPending.value) return;
  if (board[row][col] !== 0) return;
  send({ type: 'place_stone', row, col });
}

function onBoardClick() {
  // handled by cell clicks
}

function leaveRoom() {
  send({ type: 'leave_room' });
  cleanup();
  router.push('/');
}

// ── Timer ──
function startTimer(fromMs) {
  stopTimer();
  timeLeft.value = fromMs ? Math.ceil(fromMs / 1000) : Math.round(turnTimeLimit.value / 1000);
  timerInterval = setInterval(() => {
    timeLeft.value--;
    if (timeLeft.value <= 0) {
      timeLeft.value = 0;
      stopTimer();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ── WebSocket ──
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;

  const socket = new WebSocket(url);
  ws.value = socket;

  socket.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    handleServerMessage(msg);
  };

  socket.onclose = () => {
    if (gameState.value !== 'FINISHED' && gameState.value !== 'DISSOLVED') {
      gameState.value = 'CONNECTING';
      setTimeout(() => {
        if (gameState.value === 'CONNECTING') connect();
      }, 2000);
    }
  };

  socket.onerror = () => {
    errorMsg.value = '连接出错';
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'connected':
      playerId.value = msg.playerId;
      if (props.spectateMode) {
        send({ type: 'spectate', roomId: parseInt(props.roomId, 10) });
      } else if (hasJoinedRoom.value) {
        send({
          type: 'reconnect',
          roomId: parseInt(props.roomId, 10),
          playerName: sessionStorage.getItem('playerName') || '玩家',
        });
      } else {
        send({
          type: 'join_room',
          roomId: parseInt(props.roomId, 10),
          playerName: sessionStorage.getItem('playerName') || '玩家',
        });
      }
      break;

    case 'room_joined':
      hasJoinedRoom.value = true;
      playerIndex.value = msg.playerIndex;
      players[msg.playerIndex].name = msg.playerName;
      gameState.value = 'WAITING';
      break;

    case 'reconnected':
      hasJoinedRoom.value = true;
      playerIndex.value = msg.playerIndex;
      gameState.value = msg.state;
      restoreState(msg);
      break;

    case 'reconnect_failed':
      hasJoinedRoom.value = false;
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = '房间已解散';
      setTimeout(() => { cleanup(); router.push('/'); }, 2000);
      break;

    case 'spectate_joined':
      gameState.value = msg.state;
      restoreState(msg);
      break;

    case 'spectator_count':
      spectatorCount.value = msg.count;
      break;

    case 'player_joined':
      players[msg.playerIndex].name = msg.playerName;
      break;

    case 'player_list':
      for (let i = 0; i < 2; i++) {
        if (msg.players && msg.players[i]) {
          players[i].name = msg.players[i].name;
        } else {
          players[i].name = '';
        }
      }
      break;

    case 'kicked':
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = msg.message;
      setTimeout(() => { cleanup(); router.push('/'); }, 3000);
      break;

    case 'state_change':
      gameState.value = msg.state;
      if (msg.state === 'ROLLING') {
        diceRolling.value = true;
        diceValues[0] = null;
        diceValues[1] = null;
        diceTie.value = false;
        firstPlayer.value = -1;
      }
      break;

    case 'dice_result':
      diceRolling.value = false;
      diceValues[0] = msg.dice[0];
      diceValues[1] = msg.dice[1];
      break;

    case 'dice_tie':
      diceTie.value = true;
      setTimeout(() => {
        diceTie.value = false;
        diceRolling.value = true;
        diceValues[0] = null;
        diceValues[1] = null;
      }, 1200);
      break;

    case 'first_player':
      firstPlayer.value = msg.playerIndex;
      break;

    case 'turn_start':
      currentTurn.value = msg.playerIndex;
      if (msg.timeLimit) turnTimeLimit.value = msg.timeLimit;
      startTimer();
      // Open undo window if it's opponent's turn and I can undo
      if (!props.spectateMode && msg.playerIndex !== playerIndex.value && myLastMoveCanUndo.value) {
        undoWindowOpen.value = true;
        clearTimeout(undoWindowTimer);
        undoWindowTimer = setTimeout(() => { undoWindowOpen.value = false; }, 5000);
      } else {
        undoWindowOpen.value = false;
      }
      break;

    case 'stone_placed': {
      board[msg.row][msg.col] = msg.stone;
      moveCount.value = msg.moveNumber;
      history.push({ playerIndex: msg.playerIndex, row: msg.row, col: msg.col, moveNumber: msg.moveNumber });
      // Track undo eligibility
      if (!props.spectateMode) {
        if (msg.playerIndex === playerIndex.value) {
          myLastMoveCanUndo.value = true;
        } else {
          myLastMoveCanUndo.value = false; // opponent moved, can't undo previous
        }
      }
      break;
    }

    case 'turn_timeout':
      stopTimer();
      myLastMoveCanUndo.value = false;
      undoWindowOpen.value = false;
      break;

    case 'undo_requested':
      undoPending.value = true;
      undoRequesterIdx.value = msg.playerIndex;
      undoWindowOpen.value = false;
      stopTimer();
      startUndoCountdown();
      break;

    case 'undo_accepted':
      undoPending.value = false;
      clearUndoCountdown();
      board[msg.row][msg.col] = 0;
      history.pop();
      moveCount.value--;
      if (!props.spectateMode && msg.playerIndex === playerIndex.value) {
        myLastMoveCanUndo.value = false;
      }
      // turn_start will follow from server
      break;

    case 'undo_rejected':
      undoPending.value = false;
      clearUndoCountdown();
      if (msg.timeRemaining != null) {
        startTimer(msg.timeRemaining);
      }
      break;

    case 'game_over':
      stopTimer();
      gameState.value = 'FINISHED';
      winner.value = msg.winner;
      finishReason.value = msg.reason;
      if (msg.winLine) winLine.value = msg.winLine;
      break;

    case 'room_dissolved':
      stopTimer();
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = msg.message;
      if (msg.redirect) {
        setTimeout(() => {
          cleanup();
          router.push('/');
        }, 3000);
      }
      break;

    case 'opponent_disconnected':
      errorMsg.value = '对手已断开连接';
      break;

    case 'player_away':
      errorMsg.value = `${msg.playerName} 暂时离线，等待重连...`;
      break;

    case 'player_back':
      errorMsg.value = `${msg.playerName} 已回来`;
      setTimeout(() => { if (errorMsg.value === `${msg.playerName} 已回来`) errorMsg.value = ''; }, 2000);
      break;

    case 'player_left':
      players[msg.playerIndex].name = '';
      break;

    case 'player_index_update':
      playerIndex.value = msg.playerIndex;
      break;

    case 'player_emoji':
      playerBarRef.value?.showEmoji(msg.playerIndex, msg.emoji);
      break;

    case 'error':
      errorMsg.value = msg.message;
      setTimeout(() => {
        if (errorMsg.value === msg.message) errorMsg.value = '';
      }, 3000);
      break;
  }
}

function restoreState(msg) {
  for (let i = 0; i < 2; i++) {
    if (msg.players[i]) {
      players[i].name = msg.players[i].name;
    } else {
      players[i].name = '';
    }
  }
  currentTurn.value = msg.currentTurn;
  winner.value = msg.winner;
  if (msg.winLine) winLine.value = msg.winLine;
  moveCount.value = msg.moveCount || 0;
  spectatorCount.value = msg.spectatorCount;
  if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;

  // Restore board
  if (msg.board) {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        board[r][c] = msg.board[r][c];
      }
    }
  }

  // Restore history
  history.splice(0, history.length, ...(msg.history || []));

  // Determine first player from history
  if (msg.history && msg.history.length > 0) {
    firstPlayer.value = msg.history[0].playerIndex;
  }

  if (msg.dice) {
    diceValues[0] = msg.dice[0];
    diceValues[1] = msg.dice[1];
  }

  if (msg.state === 'PLAYING') {
    if (msg.undoRequester >= 0) {
      undoPending.value = true;
      undoRequesterIdx.value = msg.undoRequester;
    } else if (msg.turnTimeRemaining != null) {
      startTimer(msg.turnTimeRemaining);
    } else {
      startTimer();
    }
  }
}

function cleanup() {
  stopTimer();
  clearUndoCountdown();
  clearTimeout(undoWindowTimer);
  if (ws.value) {
    ws.value.onclose = null;
    ws.value.close();
    ws.value = null;
  }
}

function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (gameState.value === 'FINISHED' || gameState.value === 'DISSOLVED') return;

  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    gameState.value = 'CONNECTING';
    connect();
  }
}

onMounted(() => {
  if (!props.spectateMode && !sessionStorage.getItem('playerName')) {
    router.push('/');
    return;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  connect();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  cleanup();
});
</script>

<style scoped>
/* ── Header ── */
.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.room-tag {
  font-size: 0.85rem;
  color: var(--text-muted);
  background: var(--card);
  padding: 4px 10px;
  border-radius: 4px;
}

.spec-tag {
  font-size: 0.75rem;
  color: var(--accent);
  background: rgba(253, 121, 168, 0.15);
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-label {
  font-weight: 600;
  font-size: 0.95rem;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.player-label.active {
  background: var(--primary);
  color: #fff;
  animation: pulse 1.5s ease-in-out infinite;
}

.stone-icon {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  vertical-align: middle;
}

.stone-black-sm {
  background: radial-gradient(circle at 35% 35%, #555, #111);
  box-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

.stone-white-sm {
  background: radial-gradient(circle at 35% 35%, #fff, #ccc);
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}

.vs {
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.header-right {
  min-width: 60px;
  text-align: right;
  display: flex;
  align-items: center;
  gap: 8px;
}

.spec-badge {
  font-size: 0.75rem;
  color: var(--accent);
  background: rgba(253, 121, 168, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.timer {
  font-size: 1.2rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 4px 12px;
  border-radius: var(--radius-sm);
  background: var(--card);
}

.timer-warning {
  color: var(--warning);
  background: rgba(253, 203, 110, 0.15);
}

.timer-danger {
  color: var(--danger);
  background: rgba(225, 112, 85, 0.15);
  animation: timerPulse 1s ease-in-out infinite;
}

@keyframes timerPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* ── Main ── */
.game-main {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

/* ── State panels ── */
.state-panel {
  max-width: 500px;
  margin: 60px auto;
}

.player-slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px; max-width: 400px; margin: 0 auto;
}
.player-slot {
  padding: 12px; background: var(--surface);
  border: 2px solid var(--border); border-radius: var(--radius-sm);
  text-align: center; position: relative;
}
.player-slot.filled {
  border-color: var(--primary); background: rgba(108,92,231,0.08);
}
.slot-name { font-weight: 700; font-size: 0.9rem; }
.slot-empty { color: var(--text-muted); font-size: 0.85rem; }
.host-badge {
  position: absolute; top: -8px; right: -8px;
  font-size: 0.6rem; background: var(--warning); color: #000;
  padding: 1px 5px; border-radius: 3px; font-weight: 700;
}
.kick-btn {
  position: absolute; top: 2px; left: 2px;
  background: none; border: none; color: var(--danger);
  cursor: pointer; font-size: 0.85rem; padding: 2px 5px;
  opacity: 0.6; transition: opacity 0.15s;
}
.kick-btn:hover { opacity: 1; }

.kick-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(3px);
  animation: kickFadeIn 0.2s ease-out;
}
@keyframes kickFadeIn { from { opacity: 0; } to { opacity: 1; } }
.kick-modal {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px 28px; text-align: center;
  max-width: 320px; width: 85%;
  animation: kickPopIn 0.25s cubic-bezier(0.17,0.67,0.29,1.2) both;
}
@keyframes kickPopIn {
  0% { transform: scale(0.85); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.kick-modal-text { font-size: 1rem; margin-bottom: 6px; }
.kick-modal-warn { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 18px; }
.kick-modal-actions { display: flex; gap: 12px; justify-content: center; }
.kick-modal-actions .btn { padding: 8px 20px; border-radius: 8px; font-size: 0.9rem; cursor: pointer; }
.btn-outline {
  background: transparent; border: 1px solid var(--border); color: var(--text);
}
.btn-outline:hover { background: var(--surface); }
.btn-danger {
  background: var(--danger); color: #fff; border: none;
}
.btn-danger:hover { filter: brightness(1.1); }

.waiting-icon {
  font-size: 3rem;
  margin-bottom: 12px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Dice ── */
.dice-area {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 30px;
  margin: 30px 0;
}

.dice-player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.dice-name {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.dice {
  width: 80px;
  height: 80px;
  background: var(--card);
  border: 2px solid var(--border);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.2rem;
  font-weight: 800;
  transition: all 0.3s;
}

.dice.rolling {
  animation: diceRoll 0.6s ease-in-out infinite;
  border-color: var(--primary);
}

@keyframes diceRoll {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(-10deg) scale(1.08); }
  75% { transform: rotate(10deg) scale(1.08); }
}

.dice-vs {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* ── Playing area ── */
.play-area {
  width: 100%;
}

.turn-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
}

.turn-text {
  font-size: 1rem;
  font-weight: 600;
  padding: 6px 16px;
  border-radius: var(--radius-sm);
}

.turn-mine {
  color: var(--success);
  background: rgba(0, 184, 148, 0.12);
}

.turn-other {
  color: var(--text-muted);
  background: var(--surface);
}

.move-counter {
  font-size: 0.85rem;
  color: var(--text-muted);
}

/* ── Board ── */
.board-container {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.board {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: #d4a44a;
  border-radius: 8px;
  padding: 4.5%;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
}

.board-inner {
  position: absolute;
  inset: 4.5%;
}

.grid-line-h {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.45);
}

.grid-line-v {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.45);
}

.star-point {
  position: absolute;
  width: 8px;
  height: 8px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
}

.cell {
  position: absolute;
  width: calc(100% / 14);
  height: calc(100% / 14);
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
}

/* ── Stones ── */
.stone {
  width: 88%;
  height: 88%;
  border-radius: 50%;
  position: relative;
  transition: transform 0.15s;
  animation: stoneDrop 0.2s ease-out;
}

@keyframes stoneDrop {
  from { transform: scale(0.5); opacity: 0.5; }
  to { transform: scale(1); opacity: 1; }
}

.stone-black {
  background: radial-gradient(circle at 35% 35%, #555, #111 60%, #000);
  box-shadow: 2px 2px 4px rgba(0,0,0,0.5), inset 0 1px 2px rgba(255,255,255,0.15);
}

.stone-white {
  background: radial-gradient(circle at 35% 35%, #fff, #ddd 50%, #bbb);
  box-shadow: 2px 2px 4px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.6);
}

.stone-hover {
  width: 60%;
  height: 60%;
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s;
}

.cell:hover .stone-hover {
  opacity: 0.3;
  background: var(--primary);
}

/* Last move marker */
.last-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28%;
  height: 28%;
  border-radius: 50%;
  background: #e74c3c;
  transform: translate(-50%, -50%);
}

.last-dot-dark {
  background: #e74c3c;
}

/* Win highlight */
.win-stone {
  animation: winPulse 1s ease-in-out infinite;
}

@keyframes winPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 184, 148, 0); }
  50% { box-shadow: 0 0 0 4px rgba(0, 184, 148, 0.5); }
}

/* ── Result banner ── */
.result-banner {
  padding: 20px 0;
}

.result-icon {
  font-size: 4rem;
  margin-bottom: 10px;
}

/* ── Toast ── */
.toast-error {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--danger);
  color: #fff;
  padding: 10px 24px;
  border-radius: var(--radius);
  font-size: 0.9rem;
  cursor: pointer;
  z-index: 100;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── Mobile ── */
.game-page {
  overflow-x: hidden;
  max-width: 100vw;
}

@media (max-width: 700px) {
  .game-header {
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 10px;
  }
  .header-left { order: 1; }
  .header-right { order: 2; }
  .header-center {
    order: 3;
    width: 100%;
    justify-content: center;
    gap: 6px;
  }
  .player-label {
    font-size: 0.8rem;
    padding: 3px 8px;
    max-width: 40vw;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .game-main { padding: 10px; }
  .state-panel { margin: 30px auto; }
  .dice { width: 60px; height: 60px; font-size: 1.6rem; }
  .spec-tag { display: none; }
  .board { padding: 3.5%; }
  .board-inner { inset: 3.5%; }
  .star-point { width: 6px; height: 6px; }
  .turn-info { gap: 10px; margin-bottom: 10px; }
  .turn-text { font-size: 0.9rem; padding: 4px 12px; }
  .board-container { max-width: 100%; }
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(108, 92, 231, 0.4); }
  50% { box-shadow: 0 0 0 6px rgba(108, 92, 231, 0); }
}

/* ── Undo ── */
.undo-btn {
  font-size: 0.8rem;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.undo-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(3px);
  animation: kickFadeIn 0.2s ease-out;
}

.undo-modal {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px 28px;
  text-align: center;
  max-width: 320px;
  width: 85%;
  animation: kickPopIn 0.25s cubic-bezier(0.17, 0.67, 0.29, 1.2) both;
}

.undo-text {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 8px;
}

.undo-countdown {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--warning);
  font-variant-numeric: tabular-nums;
  margin-bottom: 16px;
}

.undo-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.undo-actions .btn {
  padding: 8px 24px;
  border-radius: 8px;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.btn-success {
  background: var(--success);
  color: #fff;
  border: none;
}

.btn-success:hover {
  filter: brightness(1.1);
}
</style>
