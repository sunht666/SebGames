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
          {{ players[0]?.name || '等待中...' }}
        </span>
        <span class="vs">VS</span>
        <span class="player-label" :class="{ active: currentTurn === 1 }">
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

      <!-- Number setup -->
      <div v-else-if="gameState === 'SETUP'" class="state-panel fade-in">
        <!-- Spectator view -->
        <template v-if="spectateMode">
          <h2 class="text-center mb-2">玩家正在设置数字...</h2>
          <p class="text-center text-muted">设置限时: <span :class="setupTimeLeft <= 10 ? 'text-danger' : 'text-warning'">{{ setupTimeLeft }}s</span></p>
          <div class="confirm-status mt-2 text-center">
            <span :class="players[0].confirmed ? 'text-success' : 'text-muted'">
              {{ players[0].name || '玩家1' }} {{ players[0].confirmed ? '已确认' : '未确认' }}
            </span>
            <span class="mx">|</span>
            <span :class="players[1].confirmed ? 'text-success' : 'text-muted'">
              {{ players[1].name || '玩家2' }} {{ players[1].confirmed ? '已确认' : '未确认' }}
            </span>
          </div>
        </template>
        <!-- Player view -->
        <template v-else>
          <h2 class="text-center mb-2">设置你的秘密数字</h2>
          <p class="text-center text-muted mb-1">选择一个 1000-9999 的四位数</p>
          <p class="text-center">设置限时: <span :class="setupTimeLeft <= 10 ? 'text-danger' : 'text-warning'">{{ setupTimeLeft }}s</span></p>

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
        </template>
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
        <PlayerBar ref="playerBarRef" :players="players" :my-index="playerIndex" @send-emoji="onSendEmoji" />
        <div class="play-grid" :class="{ 'spec-grid': spectateMode }">
          <!-- Left: My info + Guess input (hidden for spectators) -->
          <div v-if="!spectateMode" class="play-left">
            <div class="card mb-2">
              <h3 class="section-title">我的数字</h3>
              <div class="my-number">{{ myNumber }}</div>
            </div>

            <!-- Guess input: 4 digit boxes with inline marks -->
            <div class="card mb-2">
              <h3 class="section-title">
                {{ isMyTurn ? '输入猜测 (点击上方标记)' : '对手思考中… 可先输入和标记' }}
              </h3>
              <div class="guess-area">
                <div class="digit-row">
                  <div v-for="pos in 4" :key="pos" class="digit-col">
                    <div class="mark-top" @click.stop="togglePicker(pos-1)">
                      <span v-if="getConfirmedDigit(pos-1)!==null" class="mval m-green">{{ getConfirmedDigit(pos-1) }}</span>
                      <span v-else-if="getPossibleDigits(pos-1).length" class="mval m-yellow">{{ getPossibleDigits(pos-1).join(' ') }}</span>
                      <span v-else class="mval m-hint">&#9650;</span>
                    </div>
                    <input
                      :ref="el => { if(el) digitRefs[pos-1]=el }"
                      class="digit-box"
                      type="text" inputmode="numeric" maxlength="1"
                      :value="digits[pos-1]"
                      :disabled="guessSubmitted"
                      @input="onDigitInput(pos-1,$event)"
                      @keydown="onDigitKeydown(pos-1,$event)"
                      @focus="$event.target.select()"
                    />
                    <!-- Floating popover -->
                    <div v-if="pickerPos === pos-1" class="mark-popover pop-top" @click.stop>
                      <div class="pop-digits">
                        <span v-for="d in getDigitsForPos(pos-1)" :key="d"
                          class="pop-d" :class="getMarkClass(pos-1, d)"
                          @click.stop="cycleMark(pos-1, d)">{{ d }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  class="btn mt-2" style="width:100%"
                  :class="isMyTurn ? 'btn-accent' : 'btn-outline'"
                  :disabled="!isMyTurn || !canGuess"
                  @click="submitGuess"
                >{{ isMyTurn ? '确定' : '对方思考中...' }}</button>
              </div>
            </div>
          </div>

          <!-- Right: History (two columns) -->
          <div class="play-right">
            <div class="card history-card">
              <h3 class="section-title">猜测历史</h3>
              <div v-if="history.length === 0" class="text-muted text-center mt-2">暂无记录</div>
              <div v-else class="history-cols">
                <div class="hist-col">
                  <div class="hist-col-title text-primary">{{ spectateMode ? (players[0]?.name || '玩家1') : '我' }}</div>
                  <div class="history-list">
                    <div v-for="(e, i) in col1History" :key="i" class="history-item mine" :class="{ reveal: e._animating }">
                      <span class="hist-round">#{{ e.roundNumber }}</span>
                      <span v-if="e.timeout" class="hist-guess text-muted">超时</span>
                      <span v-else class="hist-guess">{{ e.guess }}</span>
                      <span v-if="!e.timeout" class="hist-result"><span class="result-badge" :class="'result-'+e.correctCount">{{ e.correctCount }}A</span></span>
                    </div>
                  </div>
                </div>
                <div class="hist-col">
                  <div class="hist-col-title text-accent">{{ spectateMode ? (players[1]?.name || '玩家2') : '对手' }}</div>
                  <div class="history-list">
                    <div v-for="(e, i) in col2History" :key="i" class="history-item" :class="{ reveal: e._animating }">
                      <span class="hist-round">#{{ e.roundNumber }}</span>
                      <span v-if="e.timeout" class="hist-guess text-muted">超时</span>
                      <span v-else class="hist-guess">{{ e.guess }}</span>
                      <span v-if="!e.timeout" class="hist-result"><span class="result-badge" :class="'result-'+e.correctCount">{{ e.correctCount }}A</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="gameState === 'FINISHED'" class="state-panel fade-in text-center">
        <template v-if="spectateMode">
          <div class="result-icon">&#127942;</div>
          <h2 class="text-success">
            {{ players[winner]?.name || '玩家' }} 获胜！
          </h2>
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
        <div v-if="revealedNumbers" class="revealed-numbers mt-2">
          <div class="reveal-item">
            <span class="text-muted">{{ players[0]?.name || '玩家1' }}的数字:</span>
            <span class="reveal-num">{{ revealedNumbers[0] }}</span>
          </div>
          <div class="reveal-item">
            <span class="text-muted">{{ players[1]?.name || '玩家2' }}的数字:</span>
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
              :class="{ mine: !spectateMode && entry.playerIndex === playerIndex }"
            >
              <span class="hist-round">#{{ entry.roundNumber }}</span>
              <span class="hist-player" :class="entry.playerIndex === 0 ? 'text-primary' : 'text-accent'">
                {{ spectateMode ? (players[entry.playerIndex]?.name || '玩家') : (entry.playerIndex === playerIndex ? '我' : '对手') }}
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

      <!-- Room dissolved -->
      <div v-else-if="gameState === 'DISSOLVED'" class="state-panel fade-in text-center">
        <div class="waiting-icon">&#9203;</div>
        <h2 class="text-warning">房间已解散</h2>
        <p class="text-muted mt-1">{{ dissolveMessage }}</p>
        <button class="btn btn-primary btn-lg mt-3" @click="leaveRoom">返回大厅</button>
      </div>

      <!-- Error -->
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

    <!-- Floating card result overlay -->
    <div v-if="lastResult" class="card-overlay" :class="{ leaving: lastResultLeaving }" @click="dismissResult">
      <div class="card-float" :class="'glow-' + lastResult.correctCount">
        <div class="cf-label">
          {{ spectateMode ? (players[lastResult.playerIdx]?.name || '玩家') + ' 猜了' : (lastResult.isMine ? '你猜了' : '对手猜了') }}
        </div>
        <div class="cf-guess">{{ lastResult.guess }}</div>
        <div class="cf-divider"></div>
        <div class="cf-count"><span class="cf-num">{{ lastResult.correctCount }}</span><span class="cf-a">A</span></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
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
  { name: '', confirmed: false },
  { name: '', confirmed: false },
]);
const currentTurn = ref(-1);
const timeLeft = ref(30);
const turnTimeLimit = ref(30000);
const roundNumber = ref(0);
const history = reactive([]);
const winner = ref(-1);
const finishReason = ref('');
const revealedNumbers = ref(null);
const errorMsg = ref('');
const spectatorCount = ref(0);
const dissolveMessage = ref('');
const kickTarget = ref(-1);
const hasJoinedRoom = ref(false);
const playerBarRef = ref(null);

// Setup
const myNumber = ref(null);
const myNumberInput = ref('');
const myConfirmed = ref(false);
const opponentConfirmed = ref(false);
const setupTimeLeft = ref(60);
let setupTimerInterval = null;

// Dice
const diceValues = reactive([null, null]);
const diceRolling = ref(false);
const diceTie = ref(false);
const firstPlayerIndex = ref(-1);

// Guess: 4 individual digit boxes
const digits = reactive(['', '', '', '']);
const digitRefs = ref([]);
const guessSubmitted = ref(false);

// Player count for waiting state
const playerCount = computed(() => players.filter(p => p.name).length);

// Guess result card overlay
const lastResult = ref(null);
const lastResultLeaving = ref(false);

// Mark picker
const pickerPos = ref(-1);

// Timer
let timerInterval = null;

// Marks: marks[position][digit] = 'none' | 'possible' | 'confirmed' | 'excluded'
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

const col1History = computed(() => {
  if (props.spectateMode) return history.filter(e => e.playerIndex === 0);
  return history.filter(e => e.playerIndex === playerIndex.value);
});
const col2History = computed(() => {
  if (props.spectateMode) return history.filter(e => e.playerIndex === 1);
  return history.filter(e => e.playerIndex !== playerIndex.value);
});

const canConfirm = computed(() => {
  if (myConfirmed.value) return false;
  const n = parseInt(myNumberInput.value, 10);
  return !isNaN(n) && n >= 1000 && n <= 9999;
});

const canGuess = computed(() => {
  if (guessSubmitted.value) return false;
  if (digits.some(d => d === '')) return false;
  const n = parseInt(digits.join(''), 10);
  return n >= 1000 && n <= 9999;
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

// Mark helpers
function getConfirmedDigit(pos) {
  for (let d = 0; d <= 9; d++) { if (marks[pos][d] === 'confirmed') return d; }
  return null;
}
function getPossibleDigits(pos) {
  const r = [];
  for (let d = 0; d <= 9; d++) { if (marks[pos][d] === 'possible') r.push(d); }
  return r;
}
function togglePicker(pos) {
  pickerPos.value = pickerPos.value === pos ? -1 : pos;
}
// Cycle: none → possible(黄) → confirmed(绿) → excluded(红) → none
function cycleMark(pos, digit) {
  const cur = marks[pos][digit];
  const next = cur === 'none' ? 'possible' : cur === 'possible' ? 'confirmed' : cur === 'confirmed' ? 'excluded' : 'none';
  // Confirmed is exclusive: clear other confirmed in same position
  if (next === 'confirmed') {
    for (let d = 0; d <= 9; d++) { if (marks[pos][d] === 'confirmed') marks[pos][d] = 'none'; }
  }
  marks[pos][digit] = next;
}
function getMarkClass(pos, digit) {
  const s = marks[pos][digit];
  if (s === 'confirmed') return 'pop-on-g';
  if (s === 'possible') return 'pop-on-y';
  if (s === 'excluded') return 'pop-on-r';
  return '';
}
function closePicker() { pickerPos.value = -1; }

// Digit box input
function onDigitInput(pos, event) {
  const raw = event.target.value.replace(/\D/g, '');
  const val = raw.slice(-1);
  if (pos === 0 && val === '0') { event.target.value = digits[pos]; return; }
  digits[pos] = val;
  event.target.value = val;
  if (val && pos < 3) nextTick(() => digitRefs.value[pos + 1]?.focus());
}
function onDigitKeydown(pos, event) {
  if (event.key === 'Backspace' && digits[pos] === '' && pos > 0) {
    nextTick(() => digitRefs.value[pos - 1]?.focus());
  }
  if (event.key === 'Enter') submitGuess();
}

function onNumberInput() {
  myNumberInput.value = myNumberInput.value.replace(/\D/g, '');
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
  pickerPos.value = -1;
  send({ type: 'guess', number: parseInt(digits.join(''), 10) });
}

function dismissResult() {
  lastResultLeaving.value = true;
  setTimeout(() => { lastResult.value = null; lastResultLeaving.value = false; }, 400);
}

function leaveRoom() {
  send({ type: 'leave_room' });
  cleanup();
  router.push('/');
}

// ── Timer ──
function startTimer() {
  stopTimer();
  timeLeft.value = Math.round(turnTimeLimit.value / 1000);
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

// ── Setup countdown ──
function startSetupCountdown() {
  stopSetupCountdown();
  setupTimeLeft.value = 60;
  setupTimerInterval = setInterval(() => {
    setupTimeLeft.value--;
    if (setupTimeLeft.value <= 0) {
      setupTimeLeft.value = 0;
      stopSetupCountdown();
    }
  }, 1000);
}

function stopSetupCountdown() {
  if (setupTimerInterval) {
    clearInterval(setupTimerInterval);
    setupTimerInterval = null;
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
    if (gameState.value !== 'FINISHED' && gameState.value !== 'DISSOLVED') {
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
      for (let i = 0; i < 2; i++) {
        if (msg.players[i]) {
          players[i].name = msg.players[i].name;
          players[i].confirmed = msg.players[i].confirmed;
        } else {
          players[i].name = '';
          players[i].confirmed = false;
        }
      }
      currentTurn.value = msg.currentTurn;
      roundNumber.value = msg.roundNumber;
      winner.value = msg.winner;
      history.splice(0, history.length, ...msg.history);
      spectatorCount.value = msg.spectatorCount;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      if (msg.dice) {
        diceValues[0] = msg.dice[0];
        diceValues[1] = msg.dice[1];
      }
      if (msg.numbers) {
        revealedNumbers.value = msg.numbers;
      }
      if (msg.myNumber != null) {
        myNumber.value = msg.myNumber;
        myNumberInput.value = String(msg.myNumber);
      }
      if (msg.myConfirmed) {
        myConfirmed.value = true;
      }
      if (msg.state === 'PLAYING') {
        if (msg.turnTimeRemaining != null) {
          timeLeft.value = Math.ceil(msg.turnTimeRemaining / 1000);
        }
        startTimer();
      }
      if (msg.state === 'SETUP') startSetupCountdown();
      break;

    case 'reconnect_failed':
      hasJoinedRoom.value = false;
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = '房间已解散';
      setTimeout(() => { cleanup(); router.push('/'); }, 2000);
      break;

    case 'spectate_joined':
      gameState.value = msg.state;
      for (let i = 0; i < 2; i++) {
        if (msg.players[i]) {
          players[i].name = msg.players[i].name;
          players[i].confirmed = msg.players[i].confirmed;
        }
      }
      currentTurn.value = msg.currentTurn;
      roundNumber.value = msg.roundNumber;
      winner.value = msg.winner;
      history.splice(0, history.length, ...msg.history);
      spectatorCount.value = msg.spectatorCount;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      if (msg.dice) {
        diceValues[0] = msg.dice[0];
        diceValues[1] = msg.dice[1];
      }
      if (msg.numbers) {
        revealedNumbers.value = msg.numbers;
      }
      if (msg.state === 'PLAYING') {
        startTimer();
      }
      if (msg.state === 'SETUP') {
        startSetupCountdown();
      }
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
          players[i].confirmed = !!msg.players[i].confirmed;
        } else {
          players[i].name = '';
          players[i].confirmed = false;
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
      if (msg.state === 'SETUP') {
        startSetupCountdown();
      } else {
        stopSetupCountdown();
      }
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
      guessSubmitted.value = false;
      if (msg.timeLimit) turnTimeLimit.value = msg.timeLimit;
      startTimer();
      if (!props.spectateMode && msg.playerIndex === playerIndex.value) {
        // Only auto-focus first box if nothing pre-typed
        if (digits.every(d => d === '')) {
          nextTick(() => digitRefs.value[0]?.focus());
        }
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
      setTimeout(() => { entry._animating = false; }, 800);

      // Clear my digit boxes after my guess is confirmed
      if (!props.spectateMode && msg.playerIndex === playerIndex.value) {
        digits[0] = ''; digits[1] = ''; digits[2] = ''; digits[3] = '';
      }
      // Show floating card overlay
      lastResult.value = {
        guess: msg.guess,
        correctCount: msg.correctCount,
        isMine: msg.playerIndex === playerIndex.value,
        playerIdx: msg.playerIndex,
      };
      lastResultLeaving.value = false;
      setTimeout(() => {
        lastResultLeaving.value = true;
        setTimeout(() => { lastResult.value = null; lastResultLeaving.value = false; }, 500);
      }, 2200);
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
      stopSetupCountdown();
      gameState.value = 'FINISHED';
      winner.value = msg.winner;
      finishReason.value = msg.reason;
      revealedNumbers.value = msg.numbers;
      break;

    case 'room_dissolved':
      stopTimer();
      stopSetupCountdown();
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
      players[msg.playerIndex].confirmed = false;
      break;

    case 'player_index_update':
      playerIndex.value = msg.playerIndex;
      break;

    case 'room_left':
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

function cleanup() {
  stopTimer();
  stopSetupCountdown();
  if (ws.value) {
    ws.value.onclose = null;
    ws.value.close();
    ws.value = null;
  }
}

// ── Visibility change: fix mobile background disconnect ──
function onVisibilityChange() {
  if (document.visibilityState !== 'visible') return;
  if (gameState.value === 'FINISHED' || gameState.value === 'DISSOLVED') return;

  // WS died while in background → reconnect immediately
  if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
    gameState.value = 'CONNECTING';
    connect();
    return;
  }

  // WS still alive but UI state may be stale
  if (!props.spectateMode && gameState.value === 'PLAYING' && isMyTurn.value) {
    guessSubmitted.value = false;
    nextTick(() => digitRefs.value[0]?.focus());
  }
}

onMounted(() => {
  if (!props.spectateMode && !sessionStorage.getItem('playerName')) {
    router.push('/');
    return;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  document.addEventListener('click', closePicker);
  connect();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  document.removeEventListener('click', closePicker);
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
  min-width: 0;
}

.number-input-row .input {
  flex: 1;
  min-width: 0;
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

.play-grid.spec-grid {
  grid-template-columns: 1fr;
  max-width: 600px;
  margin: 0 auto;
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

/* ── Digit boxes + marks ── */
.guess-area { text-align: center; }

.digit-row {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.digit-col {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 56px;
}

.digit-box {
  width: 52px;
  height: 56px;
  text-align: center;
  font-size: 1.6rem;
  font-weight: 800;
  border: 2px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  outline: none;
  caret-color: var(--primary);
  transition: border-color 0.2s;
}

.digit-box:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(108,92,231,0.25);
}

.digit-box:disabled { opacity: 0.5; }

.mark-top {
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  width: 100%;
}

.mval {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  line-height: 1.2;
  transition: transform 0.15s;
}

.mark-top:active .mval { transform: scale(0.9); }

.m-green { color: var(--success); background: rgba(0,184,148,0.18); }
.m-yellow { color: var(--warning); background: rgba(253,203,110,0.15); font-size: 0.65rem; }
.m-hint { color: var(--text-muted); opacity: 0.25; font-size: 0.55rem; }

/* ── Floating mark popover ── */
.mark-popover {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  animation: popoverIn 0.15s ease-out;
}
.pop-top { bottom: calc(100% + 4px); }
.pop-bot { top: calc(100% + 4px); }

@keyframes popoverIn {
  from { opacity: 0; transform: translateX(-50%) scale(0.9); }
  to   { opacity: 1; transform: translateX(-50%) scale(1); }
}

.pop-title {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-align: center;
  margin-bottom: 4px;
}

.pop-digits {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px;
}

.pop-d {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8rem; font-weight: 600;
  border-radius: 5px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all 0.1s;
}
.pop-d:active { transform: scale(0.92); }
.pop-on-g { background: rgba(0,184,148,0.2); color: var(--success); border-color: var(--success); font-weight: 800; }
.pop-on-y { background: rgba(253,203,110,0.2); color: var(--warning); border-color: var(--warning); font-weight: 800; }
.pop-on-r { background: rgba(225,112,85,0.2); color: var(--danger); border-color: var(--danger); font-weight: 800; }

.waiting-turn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: var(--text-muted);
}

/* ── History (two columns) ── */
.history-card {
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.history-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.hist-col-title {
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  font-size: 0.82rem;
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

/* ── Floating card overlay ── */
.card-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(3px);
  animation: overlayIn 0.3s ease-out;
}
.card-overlay.leaving {
  animation: overlayOut 0.45s ease-in forwards;
}

@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes overlayOut { to { opacity: 0; } }

.card-float {
  width: 200px;
  padding: 28px 20px;
  border-radius: 16px;
  background: linear-gradient(145deg, var(--card) 0%, var(--surface) 100%);
  border: 1.5px solid var(--border);
  text-align: center;
  animation: cardDeal 0.6s cubic-bezier(0.17, 0.67, 0.29, 1.3) both;
  transform-style: preserve-3d;
}
.card-overlay.leaving .card-float {
  animation: cardFly 0.45s ease-in forwards;
}

@keyframes cardDeal {
  0% {
    transform: perspective(800px) rotateY(180deg) scale(0.3) translateY(60px);
    opacity: 0;
    box-shadow: none;
  }
  55% {
    transform: perspective(800px) rotateY(-15deg) scale(1.06) translateY(-10px);
    opacity: 1;
  }
  75% {
    transform: perspective(800px) rotateY(5deg) scale(0.98) translateY(0);
  }
  100% {
    transform: perspective(800px) rotateY(0deg) scale(1) translateY(0);
    opacity: 1;
  }
}

@keyframes cardFly {
  to {
    transform: perspective(800px) rotateX(-15deg) scale(0.5) translateY(-120px);
    opacity: 0;
  }
}

.cf-label { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 6px; }
.cf-guess {
  font-size: 1.8rem; font-weight: 800; letter-spacing: 0.35em;
  margin-bottom: 8px;
}
.cf-divider {
  width: 40px; height: 2px; margin: 0 auto 10px;
  background: var(--border); border-radius: 1px;
}
.cf-count { display: inline-flex; align-items: baseline; gap: 2px; }
.cf-num { font-size: 2.8rem; font-weight: 900; text-shadow: 0 0 25px currentColor; }
.cf-a { font-size: 1.2rem; font-weight: 700; }

.glow-0 { box-shadow: 0 8px 40px rgba(99,110,114,0.2); }
.glow-0 .cf-num, .glow-0 .cf-a { color: var(--text-muted); }
.glow-1 { box-shadow: 0 8px 40px rgba(225,112,85,0.3); border-color: var(--danger); }
.glow-1 .cf-num, .glow-1 .cf-a { color: var(--danger); }
.glow-2 { box-shadow: 0 8px 40px rgba(253,203,110,0.35); border-color: var(--warning); }
.glow-2 .cf-num, .glow-2 .cf-a { color: var(--warning); }
.glow-3 { box-shadow: 0 8px 40px rgba(162,155,254,0.4); border-color: var(--primary-light); }
.glow-3 .cf-num, .glow-3 .cf-a { color: var(--primary-light); }
.glow-4 {
  box-shadow: 0 8px 50px rgba(0,184,148,0.5), 0 0 80px rgba(0,184,148,0.2);
  border-color: var(--success); background: linear-gradient(145deg, rgba(0,184,148,0.12), var(--surface));
}
.glow-4 .cf-num, .glow-4 .cf-a { color: var(--success); }

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
  .card { padding: 14px 12px; }
  .setup-area { max-width: 100%; }
  .number-input-row .input { letter-spacing: 0.15em; font-size: 1.1rem; padding: 10px; }
  .my-number { font-size: 1.5rem; padding: 8px; letter-spacing: 0.2em; }
  .digit-row { gap: 6px; }
  .digit-col { width: 48px; }
  .digit-box { width: 44px; height: 48px; font-size: 1.3rem; }
  .mval { font-size: 0.65rem; }
  .mark-popover { width: 140px; padding: 5px 6px; }
  .pop-d { width: 22px; height: 22px; font-size: 0.7rem; }
  .history-card { max-height: none; }
  .history-cols { gap: 6px; }
  .history-item { gap: 4px; padding: 4px 6px; font-size: 0.78rem; }
  .hist-round { min-width: 22px; font-size: 0.7rem; }
  .card-float { width: 170px; padding: 22px 16px; }
  .cf-guess { font-size: 1.4rem; }
  .cf-num { font-size: 2.2rem; }
  .dice { width: 60px; height: 60px; font-size: 1.6rem; }
  .state-panel { margin: 30px auto; }
  .play-grid { gap: 12px; }
  .spec-tag { display: none; }
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
