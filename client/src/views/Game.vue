<template>
  <div class="game-page">
    <!-- ── Header ── -->
    <header class="game-header">
      <div class="header-left">
        <button class="btn btn-outline btn-sm" @click="leaveRoom">退出</button>
        <span class="room-tag">房间 {{ roomId }}</span>
      </div>
      <div class="header-center">
        <span class="player-label" :class="{ active: currentTurn === 0 }">
          {{ players[0]?.name || '等待中...' }}
        </span>
        <span class="vs">VS</span>
        <span class="player-label" :class="{ active: currentTurn === 1 }">
          {{ players[1]?.name || '等待中...' }}
        </span>
      </div>
      <div class="header-right">
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
        <h2>等待对手加入</h2>
        <p class="text-muted mt-1">房间号: <strong class="text-primary">{{ roomId }}</strong></p>
        <p class="text-muted">将房间号分享给朋友即可开始</p>
      </div>

      <!-- Number setup -->
      <div v-else-if="gameState === 'SETUP'" class="state-panel fade-in">
        <h2 class="text-center mb-2">设置你的秘密数字</h2>
        <p class="text-center text-muted mb-2">选择一个 1000-9999 的四位数</p>

        <div class="setup-area">
          <div class="number-input-row">
            <input
              v-model="myNumberInput"
              class="input input-lg"
              placeholder="输入数字"
              maxlength="4"
              :disabled="myConfirmed"
              @input="onNumberInput"
            />
            <button
              class="btn btn-outline"
              :disabled="myConfirmed"
              @click="randomNumber"
            >
              随机
            </button>
          </div>

          <div class="setup-actions mt-2">
            <button
              class="btn btn-success btn-lg"
              :disabled="!canConfirm"
              @click="confirmMyNumber"
            >
              {{ myConfirmed ? '已确认' : '确认数字' }}
            </button>
          </div>

          <div class="confirm-status mt-2 text-center">
            <span :class="myConfirmed ? 'text-success' : 'text-muted'">
              {{ myConfirmed ? '你已确认' : '你未确认' }}
            </span>
            <span class="mx">|</span>
            <span :class="opponentConfirmed ? 'text-success' : 'text-muted'">
              {{ opponentConfirmed ? '对手已确认' : '对手未确认' }}
            </span>
          </div>
        </div>
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
        <p v-if="firstPlayerIndex >= 0" class="text-success mt-2">
          {{ players[firstPlayerIndex]?.name }} 先手！
        </p>
      </div>

      <!-- Playing -->
      <div v-else-if="gameState === 'PLAYING'" class="play-area fade-in">
        <div class="play-grid">
          <!-- Left: My info + Guess input -->
          <div class="play-left">
            <div class="card mb-2">
              <h3 class="section-title">我的数字</h3>
              <div class="my-number">{{ myNumber }}</div>
            </div>

            <!-- Guess input (only when it's my turn) -->
            <div class="card mb-2">
              <h3 class="section-title">
                {{ isMyTurn ? '输入你的猜测' : '等待对手猜测...' }}
              </h3>
              <div v-if="isMyTurn" class="guess-input-area">
                <input
                  ref="guessInputRef"
                  v-model="guessInput"
                  class="input input-lg"
                  placeholder="猜测数字"
                  maxlength="4"
                  @input="onGuessInput"
                  @keyup.enter="submitGuess"
                />
                <button
                  class="btn btn-accent btn-lg mt-1"
                  :disabled="!canGuess"
                  @click="submitGuess"
                >
                  确定
                </button>
              </div>
              <div v-else class="waiting-turn">
                <div class="spinner-sm"></div>
                <span>对手思考中...</span>
              </div>
            </div>

            <!-- Marking board -->
            <div class="card">
              <h3 class="section-title">标记板</h3>
              <p class="text-muted" style="font-size:0.8rem">点击数字切换: 灰=未知 / 黄=可能 / 绿=确认</p>
              <div class="mark-board mt-1">
                <div v-for="pos in 4" :key="pos" class="mark-col">
                  <div class="mark-pos-label">第{{ pos }}位</div>
                  <div
                    v-for="d in getDigitsForPos(pos - 1)"
                    :key="d"
                    class="mark-digit"
                    :class="markClass(pos - 1, d)"
                    @click="toggleMark(pos - 1, d)"
                  >
                    {{ d }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: History -->
          <div class="play-right">
            <div class="card history-card">
              <h3 class="section-title">猜测历史</h3>
              <div v-if="history.length === 0" class="text-muted text-center mt-2">
                暂无记录
              </div>
              <div v-else class="history-list">
                <div
                  v-for="(entry, i) in history"
                  :key="i"
                  class="history-item"
                  :class="{
                    mine: entry.playerIndex === playerIndex,
                    reveal: entry._animating
                  }"
                >
                  <span class="hist-round">#{{ entry.roundNumber }}</span>
                  <span class="hist-player" :class="entry.playerIndex === playerIndex ? 'text-primary' : 'text-accent'">
                    {{ entry.playerIndex === playerIndex ? '我' : '对手' }}
                  </span>
                  <span v-if="entry.timeout" class="hist-guess text-muted">超时</span>
                  <span v-else class="hist-guess">{{ entry.guess }}</span>
                  <span v-if="!entry.timeout" class="hist-result">
                    <span
                      class="result-badge"
                      :class="'result-' + entry.correctCount"
                    >
                      {{ entry.correctCount }}A
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="gameState === 'FINISHED'" class="state-panel fade-in text-center">
        <div class="result-icon">{{ isWinner ? '&#127942;' : '&#128546;' }}</div>
        <h2 :class="isWinner ? 'text-success' : 'text-danger'">
          {{ isWinner ? '你赢了！' : '你输了！' }}
        </h2>
        <p v-if="finishReason === 'disconnect'" class="text-muted mt-1">
          对手已断开连接
        </p>
        <div v-if="revealedNumbers" class="revealed-numbers mt-2">
          <div class="reveal-item">
            <span class="text-muted">{{ players[0]?.name }}的数字:</span>
            <span class="reveal-num">{{ revealedNumbers[0] }}</span>
          </div>
          <div class="reveal-item">
            <span class="text-muted">{{ players[1]?.name }}的数字:</span>
            <span class="reveal-num">{{ revealedNumbers[1] }}</span>
          </div>
        </div>

        <!-- Show full history in game over -->
        <div v-if="history.length" class="card mt-3" style="text-align:left">
          <h3 class="section-title">完整记录</h3>
          <div class="history-list">
            <div
              v-for="(entry, i) in history"
              :key="i"
              class="history-item"
              :class="{ mine: entry.playerIndex === playerIndex }"
            >
              <span class="hist-round">#{{ entry.roundNumber }}</span>
              <span class="hist-player" :class="entry.playerIndex === playerIndex ? 'text-primary' : 'text-accent'">
                {{ entry.playerIndex === playerIndex ? '我' : '对手' }}
              </span>
              <span v-if="entry.timeout" class="hist-guess text-muted">超时</span>
              <span v-else class="hist-guess">{{ entry.guess }}</span>
              <span v-if="!entry.timeout" class="hist-result">
                <span class="result-badge" :class="'result-' + entry.correctCount">
                  {{ entry.correctCount }}A
                </span>
              </span>
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg mt-3" @click="leaveRoom">返回大厅</button>
      </div>

      <!-- Error -->
      <div v-if="errorMsg" class="toast-error" @click="errorMsg = ''">
        {{ errorMsg }}
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({ roomId: String });
const router = useRouter();

// ── State ──
const ws = ref(null);
const playerId = ref(null);
const playerIndex = ref(-1);
const gameState = ref('CONNECTING');
const players = reactive([
  { name: '', confirmed: false },
  { name: '', confirmed: false },
]);
const currentTurn = ref(-1);
const timeLeft = ref(30);
const roundNumber = ref(0);
const history = reactive([]);
const winner = ref(-1);
const finishReason = ref('');
const revealedNumbers = ref(null);
const errorMsg = ref('');

// Setup
const myNumber = ref(null);
const myNumberInput = ref('');
const myConfirmed = ref(false);
const opponentConfirmed = ref(false);

// Dice
const diceValues = reactive([null, null]);
const diceRolling = ref(false);
const diceTie = ref(false);
const firstPlayerIndex = ref(-1);

// Guess
const guessInput = ref('');
const guessInputRef = ref(null);
const guessSubmitted = ref(false);

// Timer
let timerInterval = null;

// Marks: marks[position][digit] = 'none' | 'possible' | 'confirmed'
const marks = reactive(
  Array.from({ length: 4 }, () => {
    const obj = {};
    for (let d = 0; d <= 9; d++) obj[d] = 'none';
    return obj;
  })
);

// ── Computed ──
const isMyTurn = computed(() => currentTurn.value === playerIndex.value);
const isWinner = computed(() => winner.value === playerIndex.value);

const canConfirm = computed(() => {
  if (myConfirmed.value) return false;
  const n = parseInt(myNumberInput.value, 10);
  return !isNaN(n) && n >= 1000 && n <= 9999;
});

const canGuess = computed(() => {
  if (guessSubmitted.value) return false;
  const n = parseInt(guessInput.value, 10);
  return !isNaN(n) && n >= 1000 && n <= 9999;
});

const timerClass = computed(() => {
  if (timeLeft.value <= 5) return 'timer-danger';
  if (timeLeft.value <= 10) return 'timer-warning';
  return '';
});

// ── Helpers ──
function getDigitsForPos(pos) {
  return pos === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
}

function markClass(pos, digit) {
  const state = marks[pos][digit];
  if (state === 'confirmed') return 'mark-confirmed';
  if (state === 'possible') return 'mark-possible';
  return 'mark-none';
}

function toggleMark(pos, digit) {
  const cur = marks[pos][digit];
  if (cur === 'none') {
    marks[pos][digit] = 'possible';
  } else if (cur === 'possible') {
    // If setting to confirmed, clear any other confirmed in this position
    for (const d in marks[pos]) {
      if (marks[pos][d] === 'confirmed') marks[pos][d] = 'none';
    }
    marks[pos][digit] = 'confirmed';
  } else {
    marks[pos][digit] = 'none';
  }
}

function onNumberInput() {
  myNumberInput.value = myNumberInput.value.replace(/\D/g, '');
}

function onGuessInput() {
  guessInput.value = guessInput.value.replace(/\D/g, '');
}

// ── Actions ──
function send(msg) {
  if (ws.value && ws.value.readyState === 1) {
    ws.value.send(JSON.stringify(msg));
  }
}

function randomNumber() {
  send({ type: 'set_number', random: true });
}

function confirmMyNumber() {
  if (!canConfirm.value) return;
  send({ type: 'set_number', number: parseInt(myNumberInput.value, 10) });
  // Wait briefly, then confirm
  setTimeout(() => send({ type: 'confirm_number' }), 100);
}

function submitGuess() {
  if (!canGuess.value || !isMyTurn.value) return;
  guessSubmitted.value = true;
  send({ type: 'guess', number: parseInt(guessInput.value, 10) });
}

function leaveRoom() {
  send({ type: 'leave_room' });
  cleanup();
  router.push('/');
}

// ── Timer ──
function startTimer() {
  stopTimer();
  timeLeft.value = 30;
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

  socket.onopen = () => {
    // Wait for 'connected' message
  };

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
    if (gameState.value !== 'FINISHED') {
      gameState.value = 'CONNECTING';
      // Try to reconnect after 2s
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
      // Join the room
      send({
        type: 'join_room',
        roomId: parseInt(props.roomId, 10),
        playerName: sessionStorage.getItem('playerName') || '玩家',
      });
      break;

    case 'room_joined':
      playerIndex.value = msg.playerIndex;
      players[msg.playerIndex].name = msg.playerName;
      gameState.value = 'WAITING';
      break;

    case 'player_joined':
      players[msg.playerIndex].name = msg.playerName;
      break;

    case 'state_change':
      gameState.value = msg.state;
      if (msg.state === 'ROLLING') {
        diceRolling.value = true;
        diceValues[0] = null;
        diceValues[1] = null;
        diceTie.value = false;
        firstPlayerIndex.value = -1;
      }
      break;

    case 'number_set':
      myNumber.value = msg.number;
      myNumberInput.value = String(msg.number);
      break;

    case 'player_confirmed':
      players[msg.playerIndex].confirmed = true;
      if (msg.playerIndex === playerIndex.value) {
        myConfirmed.value = true;
      } else {
        opponentConfirmed.value = true;
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
      firstPlayerIndex.value = msg.playerIndex;
      break;

    case 'turn_start':
      currentTurn.value = msg.playerIndex;
      roundNumber.value = msg.roundNumber;
      guessInput.value = '';
      guessSubmitted.value = false;
      startTimer();
      // Focus the input when it's my turn
      if (msg.playerIndex === playerIndex.value) {
        nextTick(() => guessInputRef.value?.focus());
      }
      break;

    case 'guess_result': {
      const entry = {
        playerIndex: msg.playerIndex,
        guess: msg.guess,
        correctCount: msg.correctCount,
        timeout: false,
        roundNumber: msg.roundNumber,
        _animating: true,
      };
      history.push(entry);
      // Remove animation flag after a bit
      setTimeout(() => {
        entry._animating = false;
      }, 800);
      break;
    }

    case 'turn_timeout':
      stopTimer();
      history.push({
        playerIndex: msg.playerIndex,
        guess: null,
        correctCount: null,
        timeout: true,
        roundNumber: msg.roundNumber,
        _animating: false,
      });
      break;

    case 'game_over':
      stopTimer();
      gameState.value = 'FINISHED';
      winner.value = msg.winner;
      finishReason.value = msg.reason;
      revealedNumbers.value = msg.numbers;
      break;

    case 'opponent_disconnected':
      errorMsg.value = '对手已断开连接';
      break;

    case 'player_left':
      players[msg.playerIndex].name = '';
      players[msg.playerIndex].confirmed = false;
      break;

    case 'room_left':
      break;

    case 'error':
      errorMsg.value = msg.message;
      setTimeout(() => {
        if (errorMsg.value === msg.message) errorMsg.value = '';
      }, 3000);
      break;
  }
}

function cleanup() {
  stopTimer();
  if (ws.value) {
    ws.value.onclose = null;
    ws.value.close();
    ws.value = null;
  }
}

onMounted(() => {
  if (!sessionStorage.getItem('playerName')) {
    router.push('/');
    return;
  }
  connect();
});

onUnmounted(() => {
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
}

.player-label.active {
  background: var(--primary);
  color: #fff;
  animation: pulse 1.5s ease-in-out infinite;
}

.vs {
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 700;
}

.header-right {
  min-width: 60px;
  text-align: right;
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

/* ── Main ── */
.game-main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
  min-height: calc(100vh - 60px);
}

/* ── State panels ── */
.state-panel {
  max-width: 500px;
  margin: 60px auto;
}

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

.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── Setup ── */
.setup-area {
  max-width: 360px;
  margin: 0 auto;
}

.number-input-row {
  display: flex;
  gap: 10px;
}

.number-input-row .input {
  flex: 1;
}

.setup-actions {
  text-align: center;
}

.setup-actions .btn {
  width: 100%;
}

.confirm-status {
  font-size: 0.9rem;
}

.mx {
  margin: 0 10px;
  color: var(--border);
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

.dice-vs {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* ── Playing grid ── */
.play-area {
  width: 100%;
}

.play-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 700px) {
  .play-grid {
    grid-template-columns: 1fr;
  }
}

.section-title {
  font-size: 0.9rem;
  color: var(--primary-light);
  margin-bottom: 10px;
  font-weight: 600;
}

.my-number {
  font-size: 2.2rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  text-align: center;
  color: var(--success);
  padding: 10px;
  background: rgba(0, 184, 148, 0.08);
  border-radius: var(--radius-sm);
}

/* ── Guess input ── */
.guess-input-area {
  text-align: center;
}

.guess-input-area .btn {
  width: 100%;
}

.waiting-turn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: var(--text-muted);
}

/* ── Mark board ── */
.mark-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.mark-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.mark-pos-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 600;
}

.mark-digit {
  width: 30px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.mark-none {
  background: var(--surface);
  color: var(--text-muted);
  border: 1px solid transparent;
}

.mark-none:hover {
  border-color: var(--border);
}

.mark-possible {
  background: rgba(253, 203, 110, 0.2);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.mark-confirmed {
  background: rgba(0, 184, 148, 0.2);
  color: var(--success);
  border: 1px solid var(--success);
  font-weight: 800;
}

/* ── History ── */
.history-card {
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  border-left: 3px solid transparent;
}

.history-item.mine {
  border-left-color: var(--primary);
}

.history-item:not(.mine) {
  border-left-color: var(--accent);
}

.history-item.reveal {
  animation: flipIn 0.5s ease-out;
}

.hist-round {
  color: var(--text-muted);
  font-size: 0.8rem;
  min-width: 28px;
}

.hist-player {
  font-weight: 600;
  min-width: 32px;
}

.hist-guess {
  font-weight: 700;
  letter-spacing: 0.15em;
  font-variant-numeric: tabular-nums;
  flex: 1;
}

.hist-result {
  text-align: right;
}

.result-badge {
  padding: 2px 10px;
  border-radius: 10px;
  font-weight: 700;
  font-size: 0.85rem;
}

.result-0 {
  background: rgba(99, 110, 114, 0.2);
  color: var(--text-muted);
}
.result-1 {
  background: rgba(225, 112, 85, 0.2);
  color: var(--danger);
}
.result-2 {
  background: rgba(253, 203, 110, 0.2);
  color: var(--warning);
}
.result-3 {
  background: rgba(162, 155, 254, 0.2);
  color: var(--primary-light);
}
.result-4 {
  background: rgba(0, 184, 148, 0.3);
  color: var(--success);
}

/* ── Game over ── */
.result-icon {
  font-size: 4rem;
  margin-bottom: 10px;
}

.revealed-numbers {
  display: flex;
  gap: 24px;
  justify-content: center;
}

.reveal-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.reveal-num {
  font-size: 1.8rem;
  font-weight: 800;
  letter-spacing: 0.2em;
  color: var(--primary-light);
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
</style>
