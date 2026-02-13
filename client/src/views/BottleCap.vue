<template>
  <div class="game-page">
    <!-- ── Header ── -->
    <header class="game-header">
      <div class="header-left">
        <button class="btn btn-outline btn-sm" @click="leaveRoom">
          {{ spectateMode ? '退出观战' : '退出' }}
        </button>
        <span class="room-tag">房间 {{ roomId }}</span>
        <span class="type-tag">猜瓶盖 {{ Math.round(turnTimeLimit / 1000) }}s</span>
        <span v-if="spectateMode" class="spec-tag">观战中</span>
      </div>
      <div class="header-right">
        <span v-if="spectatorCount > 0" class="spec-badge">{{ spectatorCount }}人观战</span>
      </div>
    </header>

    <!-- ── Main content ── -->
    <main class="game-main">
      <!-- Connecting -->
      <div v-if="gameState === 'CONNECTING'" class="state-panel fade-in text-center">
        <div class="spinner"></div>
        <p class="mt-2">正在连接服务器...</p>
      </div>

      <!-- Waiting for players -->
      <div v-else-if="gameState === 'WAITING'" class="state-panel fade-in text-center">
        <div class="waiting-icon">&#9203;</div>
        <h2>等待玩家加入</h2>
        <p class="text-muted mt-1">房间号: <strong class="text-primary">{{ roomId }}</strong></p>
        <p class="text-muted">{{ playerList.filter(p=>p).length }} / {{ maxPlayersDisplay }} 玩家</p>

        <div class="player-slots mt-3">
          <div v-for="(slot, i) in maxPlayersDisplay" :key="i" class="player-slot" :class="{ filled: playerList[i] }">
            <span v-if="playerList[i]" class="slot-name">{{ playerList[i].name }}</span>
            <span v-else class="slot-empty">空位</span>
            <span v-if="i === 0 && playerList[i]" class="host-badge">房主</span>
            <button
              v-if="!spectateMode && playerIndex === 0 && i > 0 && playerList[i]"
              class="kick-btn"
              @click="confirmKick(i)"
            >&#10005;</button>
          </div>
        </div>

        <button
          v-if="!spectateMode && playerIndex === 0 && playerList.filter(p=>p).length >= 2"
          class="btn btn-primary btn-lg mt-3"
          @click="startGame"
        >
          开始游戏
        </button>
        <p v-else-if="!spectateMode && playerIndex === 0" class="text-muted mt-2">至少需要2名玩家</p>
      </div>

      <!-- Rolling dice -->
      <div v-else-if="gameState === 'ROLLING'" class="state-panel fade-in text-center">
        <h2>掷骰子决定庄家</h2>
        <div class="dice-area mt-3">
          <template v-for="(p, i) in playerList" :key="i">
            <div v-if="p" class="dice-player">
              <span class="dice-name">{{ p.name }}</span>
              <div class="dice" :class="{ rolling: diceRolling }">
                {{ diceValues[i] || '?' }}
              </div>
            </div>
          </template>
        </div>
        <p v-if="diceTie" class="text-warning mt-2">平局！重新掷骰子...</p>
      </div>

      <!-- In-game states: HIDING / GUESSING / ROUND_RESULT -->
      <div v-else-if="['HIDING', 'GUESSING', 'ROUND_RESULT'].includes(gameState)" class="play-area fade-in">
        <!-- Player strip -->
        <div class="player-strip">
          <div
            v-for="(p, i) in playerList"
            :key="i"
            class="ps-item"
            :class="{
              active: isPlayerActive(i),
              me: i === playerIndex && !spectateMode,
              dealer: i === dealerIndex,
              disconnected: !p,
            }"
          >
            <div class="ps-name">{{ p ? p.name : '离线' }}</div>
            <div class="ps-role">
              <span v-if="i === dealerIndex" class="dealer-badge">庄</span>
              <span v-if="p" class="loss-count">输{{ p.losses }}次</span>
            </div>
          </div>
        </div>

        <!-- Turn timer -->
        <div v-if="turnTimeLeft > 0 && gameState !== 'ROUND_RESULT'" class="turn-timer-bar">
          <span class="timer-text" :class="{ urgent: turnTimeLeft <= 3 }">{{ turnTimeLeft }}s</span>
          <div class="timer-track">
            <div class="timer-fill" :class="{ urgent: turnTimeLeft <= 3 }" :style="{ width: timerPercent + '%' }"></div>
          </div>
        </div>

        <!-- Hand visual area -->
        <div class="hand-stage">
          <div class="hand-flip-container" :class="{ flipped: handFlipped }">
            <!-- Front face: palm with caps (shown during HIDING for dealer) -->
            <div class="hand-face hand-front">
              <div class="palm">
                <svg viewBox="0 0 200 180" class="palm-svg">
                  <path d="M40,170 Q20,120 30,80 Q35,60 50,55 Q55,40 70,35 Q80,25 95,30 Q105,20 115,25 Q125,15 140,25 Q155,20 160,40 Q175,50 170,80 Q180,120 160,170 Z"
                    fill="rgba(220,180,140,0.3)" stroke="rgba(220,180,140,0.5)" stroke-width="2"/>
                </svg>
                <!-- Caps on palm (only for dealer in HIDING) -->
                <div v-if="gameState === 'HIDING' && isDealer && !spectateMode" class="caps-on-palm">
                  <div
                    v-for="i in selectedCapCount"
                    :key="'palm-'+i"
                    class="bottle-cap cap-on-palm"
                    :style="capPosition(i - 1, selectedCapCount)"
                  >
                    <div class="cap-inner"></div>
                  </div>
                </div>
                <!-- Revealed caps in ROUND_RESULT -->
                <div v-if="gameState === 'ROUND_RESULT' && revealedCount >= 0" class="caps-on-palm">
                  <div
                    v-for="i in revealedCount"
                    :key="'reveal-'+i"
                    class="bottle-cap cap-on-palm cap-revealed"
                    :style="capPosition(i - 1, revealedCount)"
                  >
                    <div class="cap-inner"></div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Back face: closed hand with ? -->
            <div class="hand-face hand-back">
              <div class="closed-hand">
                <svg viewBox="0 0 200 180" class="palm-svg">
                  <path d="M45,170 Q30,130 35,90 Q38,70 55,60 Q60,45 75,42 Q85,32 100,38 Q115,30 125,38 Q135,28 145,38 Q160,35 165,55 Q175,65 170,90 Q178,130 155,170 Z"
                    fill="rgba(190,150,110,0.3)" stroke="rgba(190,150,110,0.5)" stroke-width="2"/>
                </svg>
                <div class="mystery-mark">?</div>
              </div>
            </div>
          </div>
        </div>

        <!-- HIDING: dealer picks cap count -->
        <div v-if="gameState === 'HIDING'" class="action-section">
          <div v-if="isDealer && !spectateMode" class="hiding-controls">
            <h3>选择藏入瓶盖数量</h3>
            <div class="cap-pool">
              <button
                v-for="i in maxCaps + 1"
                :key="i - 1"
                class="cap-btn"
                :class="{ selected: selectedCapCount === i - 1 }"
                @click="selectedCapCount = i - 1"
              >
                {{ i - 1 }}
              </button>
            </div>
            <button class="btn btn-primary mt-2" @click="hideCaps">
              确定 (藏 {{ selectedCapCount }} 个)
            </button>
          </div>
          <div v-else class="text-center text-muted">
            <p>{{ dealerName }} 正在藏瓶盖...</p>
          </div>
        </div>

        <!-- GUESSING: current guesser picks a number -->
        <div v-if="gameState === 'GUESSING'" class="action-section">
          <div class="guess-info text-center">
            <p>
              <strong class="text-primary">{{ currentGuesserName }}</strong>
              的回合
              <span v-if="isCurrentGuesser && !spectateMode" class="text-accent"> (你来猜)</span>
            </p>
          </div>

          <div v-if="isCurrentGuesser && !spectateMode" class="guess-controls">
            <h3>选择一个数字</h3>
            <div class="number-grid">
              <button
                v-for="i in maxCaps + 1"
                :key="i - 1"
                class="num-btn"
                :class="{
                  used: guessedNumbers.includes(i - 1),
                  selected: selectedGuess === i - 1,
                }"
                :disabled="guessedNumbers.includes(i - 1)"
                @click="selectedGuess = i - 1"
              >
                {{ i - 1 }}
              </button>
            </div>
            <button
              class="btn btn-primary mt-2"
              :disabled="selectedGuess < 0 || guessedNumbers.includes(selectedGuess)"
              @click="submitGuess"
            >
              确定猜 {{ selectedGuess >= 0 ? selectedGuess : '?' }}
            </button>
          </div>
          <div v-else-if="!isCurrentGuesser" class="text-center text-muted">
            <p>等待 {{ currentGuesserName }} 猜数...</p>
          </div>

          <!-- Guess history -->
          <div v-if="guessHistory.length > 0" class="guess-history mt-2">
            <div
              v-for="(g, gi) in guessHistory"
              :key="gi"
              class="guess-toast"
              :class="{ correct: g.correct }"
              :style="{ animationDelay: gi * 0.1 + 's' }"
            >
              <span class="gt-name">{{ g.name }}</span>
              <span class="gt-text">猜了</span>
              <span class="gt-number">{{ g.number }}</span>
              <span v-if="g.isTimeout" class="gt-timeout">(超时)</span>
              <span v-if="g.correct" class="gt-correct">&#10003;</span>
              <span v-else class="gt-wrong">&#10007;</span>
            </div>
          </div>
        </div>

        <!-- ROUND_RESULT overlay -->
        <div v-if="roundResult" class="round-overlay" @click="roundResult = null">
          <div class="round-card" @click.stop>
            <div class="reveal-number">
              <span class="rn-label">瓶盖数量</span>
              <span class="rn-value">{{ roundResult.revealedCount }}</span>
            </div>
            <p class="rr-text" :class="roundResult.dealerLost ? 'text-success' : 'text-danger'">
              <template v-if="roundResult.dealerLost">
                没人猜中！<strong>{{ roundResult.dealerName }}</strong> (庄家) 输了
              </template>
              <template v-else>
                <strong>{{ roundResult.loserName }}</strong> 猜中了，输了！
              </template>
            </p>
            <p class="rr-next text-muted">
              下一轮庄家: {{ roundResult.nextDealerName }}
            </p>
          </div>
        </div>
      </div>

      <!-- Room dissolved -->
      <div v-else-if="gameState === 'DISSOLVED'" class="state-panel fade-in text-center">
        <div class="waiting-icon">&#9203;</div>
        <h2 class="text-warning">房间已解散</h2>
        <p class="text-muted mt-1">{{ dissolveMessage }}</p>
        <button class="btn btn-primary btn-lg mt-3" @click="leaveRoom">返回大厅</button>
      </div>

      <!-- Error toast -->
      <div v-if="errorMsg" class="toast-error" @click="errorMsg = ''">{{ errorMsg }}</div>
      <!-- Guess notification -->
      <div v-if="guessNotify" class="toast-info">{{ guessNotify }}</div>

      <!-- Kick confirm modal -->
      <div v-if="kickTarget >= 0" class="kick-overlay" @click="kickTarget = -1">
        <div class="kick-modal" @click.stop>
          <p class="kick-modal-text">确定要踢出 <strong>{{ playerList[kickTarget]?.name || '玩家' }}</strong> 吗？</p>
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({ roomId: String, spectateMode: { type: Boolean, default: false } });
const router = useRouter();

// ── State ──
const ws = ref(null);
const playerId = ref(null);
const playerIndex = ref(-1);
const gameState = ref('CONNECTING');
const playerList = ref([]);
const maxPlayersDisplay = ref(6);
const spectatorCount = ref(0);
const errorMsg = ref('');
const dissolveMessage = ref('');
const kickTarget = ref(-1);

// Game state
const dealerIndex = ref(-1);
const dealerName = ref('');
const maxCaps = ref(1);
const currentGuesserIndex = ref(-1);
const currentGuesserName = ref('');
const guessedNumbers = ref([]);
const guessHistory = ref([]);
const revealedCount = ref(-1);
const roundResult = ref(null);

// Dice
const diceValues = ref([]);
const diceRolling = ref(false);
const diceTie = ref(false);

// UI state
const selectedCapCount = ref(0);
const selectedGuess = ref(-1);
const handFlipped = ref(false);
const guessNotify = ref('');
const turnTimeLimit = ref(12000);
const turnTimeLeft = ref(0);
let turnCountdown = null;

// ── Computed ──
const isDealer = computed(() => playerIndex.value === dealerIndex.value);
const isCurrentGuesser = computed(() => playerIndex.value === currentGuesserIndex.value);
const timerPercent = computed(() => turnTimeLimit.value > 0 ? (turnTimeLeft.value / (turnTimeLimit.value / 1000)) * 100 : 0);

function isPlayerActive(i) {
  if (gameState.value === 'HIDING') return i === dealerIndex.value;
  if (gameState.value === 'GUESSING') return i === currentGuesserIndex.value;
  return false;
}

function capPosition(idx, total) {
  if (total <= 0) return {};
  const positions = [
    [{ x: 85, y: 90 }],
    [{ x: 65, y: 85 }, { x: 110, y: 95 }],
    [{ x: 55, y: 80 }, { x: 95, y: 100 }, { x: 120, y: 75 }],
    [{ x: 50, y: 75 }, { x: 85, y: 100 }, { x: 115, y: 80 }, { x: 75, y: 60 }],
    [{ x: 45, y: 75 }, { x: 80, y: 100 }, { x: 110, y: 80 }, { x: 70, y: 55 }, { x: 125, y: 60 }],
  ];
  const layout = positions[Math.min(total - 1, positions.length - 1)];
  const pos = layout[idx % layout.length];
  return { left: pos.x + 'px', top: pos.y + 'px' };
}

function startTurnTimer(ms) {
  if (turnCountdown) clearInterval(turnCountdown);
  turnTimeLeft.value = Math.ceil(ms / 1000);
  turnCountdown = setInterval(() => {
    turnTimeLeft.value--;
    if (turnTimeLeft.value <= 0) {
      clearInterval(turnCountdown);
      turnCountdown = null;
    }
  }, 1000);
}

function stopTurnTimer() {
  if (turnCountdown) { clearInterval(turnCountdown); turnCountdown = null; }
  turnTimeLeft.value = 0;
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

function hideCaps() {
  send({ type: 'hide_caps', count: selectedCapCount.value });
}

function submitGuess() {
  if (selectedGuess.value < 0) return;
  send({ type: 'guess_number', number: selectedGuess.value });
}

function leaveRoom() {
  send({ type: 'leave_room' });
  cleanup();
  router.push('/');
}

// ── WebSocket ──
function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${protocol}://${location.host}/ws`;
  const socket = new WebSocket(url);
  ws.value = socket;

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    handleServerMessage(msg);
  };

  socket.onclose = () => {
    if (gameState.value !== 'FINISHED' && gameState.value !== 'DISSOLVED') {
      gameState.value = 'CONNECTING';
      setTimeout(() => { if (gameState.value === 'CONNECTING') connect(); }, 2000);
    }
  };

  socket.onerror = () => { errorMsg.value = '连接出错'; };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'connected':
      playerId.value = msg.playerId;
      if (props.spectateMode) {
        send({ type: 'spectate', roomId: parseInt(props.roomId, 10) });
      } else {
        send({
          type: 'join_room',
          roomId: parseInt(props.roomId, 10),
          playerName: sessionStorage.getItem('playerName') || '玩家',
        });
      }
      break;

    case 'room_joined':
      playerIndex.value = msg.playerIndex;
      gameState.value = 'WAITING';
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      break;

    case 'spectate_joined':
      gameState.value = msg.state;
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      dealerIndex.value = msg.dealerIndex;
      dealerName.value = msg.dealerName || '';
      maxCaps.value = msg.maxCaps || 1;
      guessedNumbers.value = msg.guessedNumbers || [];
      spectatorCount.value = msg.spectatorCount;
      if (msg.revealedCount >= 0) revealedCount.value = msg.revealedCount;
      if (msg.currentGuesserIdx >= 0 && msg.guessOrder) {
        currentGuesserIndex.value = msg.guessOrder[msg.currentGuesserIdx] ?? -1;
        const guesser = playerList.value[currentGuesserIndex.value];
        currentGuesserName.value = guesser?.name || '';
      }
      // Hand should be flipped (showing back) during GUESSING
      handFlipped.value = msg.state === 'GUESSING';
      break;

    case 'player_joined': break;

    case 'player_list':
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || maxPlayersDisplay.value;
      break;

    case 'state_change':
      gameState.value = msg.state;
      if (msg.state === 'GUESSING') {
        handFlipped.value = true;
      }
      break;

    case 'dice_result':
      diceRolling.value = false;
      diceValues.value = msg.dice;
      break;

    case 'dice_tie':
      diceTie.value = true;
      setTimeout(() => {
        diceTie.value = false;
        diceRolling.value = true;
        diceValues.value = msg.tiedPlayers
          ? diceValues.value.map((v, i) => msg.tiedPlayers.includes(i) ? null : v)
          : diceValues.value.map(() => null);
      }, 1000);
      break;

    case 'dealer_chosen':
      dealerIndex.value = msg.dealerIndex;
      dealerName.value = msg.dealerName;
      break;

    case 'hiding_phase':
      gameState.value = 'HIDING';
      dealerIndex.value = msg.dealerIndex;
      dealerName.value = msg.dealerName;
      maxCaps.value = msg.maxCaps;
      selectedCapCount.value = 0;
      guessHistory.value = [];
      guessedNumbers.value = [];
      revealedCount.value = -1;
      handFlipped.value = false;
      selectedGuess.value = -1;
      if (msg.timeLimit) startTurnTimer(msg.timeLimit);
      break;

    case 'caps_hidden':
      stopTurnTimer();
      handFlipped.value = true;
      break;

    case 'guess_turn':
      currentGuesserIndex.value = msg.guesserIndex;
      currentGuesserName.value = msg.guesserName;
      guessedNumbers.value = msg.guessedNumbers || [];
      maxCaps.value = msg.maxCaps;
      selectedGuess.value = -1;
      if (msg.timeLimit) startTurnTimer(msg.timeLimit);
      break;

    case 'number_guessed':
      stopTurnTimer();
      guessedNumbers.value = msg.guessedNumbers || [];
      guessHistory.value.push({
        name: msg.guesserName,
        number: msg.number,
        correct: msg.correct,
        isTimeout: msg.isTimeout,
      });
      if (!msg.correct) {
        guessNotify.value = `${msg.guesserName} 猜了 ${msg.number}，不对！`;
        setTimeout(() => { guessNotify.value = ''; }, 2000);
      }
      break;

    case 'round_result':
      gameState.value = 'ROUND_RESULT';
      stopTurnTimer();
      revealedCount.value = msg.revealedCount;
      handFlipped.value = false; // flip back to show palm with revealed caps
      roundResult.value = msg;
      setTimeout(() => { roundResult.value = null; }, 4000);
      break;

    case 'player_disconnected':
      showError(`${msg.playerName} 已断开连接`);
      break;

    case 'player_left': break;

    case 'player_index_update':
      playerIndex.value = msg.playerIndex;
      break;

    case 'room_dissolved':
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = msg.message;
      if (msg.redirect) {
        setTimeout(() => { cleanup(); router.push('/'); }, 3000);
      }
      break;

    case 'kicked':
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = msg.message;
      setTimeout(() => { cleanup(); router.push('/'); }, 3000);
      break;

    case 'player_kicked':
      break;

    case 'spectator_count':
      spectatorCount.value = msg.count;
      break;

    case 'error':
      showError(msg.message);
      break;
  }
}

function showError(message) {
  errorMsg.value = message;
  setTimeout(() => { if (errorMsg.value === message) errorMsg.value = ''; }, 3000);
}

function cleanup() {
  stopTurnTimer();
  if (ws.value) { ws.value.onclose = null; ws.value.close(); ws.value = null; }
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
  // Init dice rolling state
  diceRolling.value = true;
  connect();
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  cleanup();
});
</script>

<style scoped>
/* ═══════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════ */
.game-header {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 12px 20px; background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 10;
}
.header-left { display: flex; align-items: center; gap: 12px; }
.room-tag {
  font-size: 0.85rem; color: var(--text-muted);
  background: var(--card); padding: 4px 10px; border-radius: 4px;
}
.type-tag {
  font-size: 0.75rem; color: #d4a53c;
  background: rgba(212,165,60,0.15); padding: 3px 8px;
  border-radius: 4px; font-weight: 600;
}
.spec-tag {
  font-size: 0.75rem; color: var(--accent);
  background: rgba(253,121,168,0.15); padding: 3px 8px;
  border-radius: 4px; font-weight: 600;
}
.header-right { display: flex; align-items: center; gap: 8px; }
.spec-badge {
  font-size: 0.75rem; color: var(--accent);
  background: rgba(253,121,168,0.12); padding: 3px 8px;
  border-radius: 4px; white-space: nowrap;
}

/* ═══════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════ */
.game-main {
  max-width: 900px; margin: 0 auto;
  padding: 20px; min-height: calc(100vh - 60px);
}
.state-panel { max-width: 500px; margin: 60px auto; }
.waiting-icon { font-size: 3rem; margin-bottom: 12px; }
.spinner {
  width: 40px; height: 40px;
  border: 3px solid var(--border); border-top-color: var(--primary);
  border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ═══════════════════════════════════════════════
   WAITING — PLAYER SLOTS
   ═══════════════════════════════════════════════ */
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
  position: fixed; inset: 0; z-index: 60;
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

/* ═══════════════════════════════════════════════
   DICE
   ═══════════════════════════════════════════════ */
.dice-area {
  display: flex; justify-content: center;
  gap: 20px; flex-wrap: wrap;
}
.dice-player {
  display: flex; flex-direction: column;
  align-items: center; gap: 8px;
}
.dice-name {
  font-size: 0.85rem; color: var(--text-muted); font-weight: 600;
}
.dice {
  width: 72px; height: 72px;
  background: var(--surface); border: 2px solid var(--border);
  border-radius: 12px; display: flex;
  align-items: center; justify-content: center;
  font-size: 2rem; font-weight: 800; color: var(--text);
  transition: all 0.3s;
}
.dice.rolling {
  animation: diceRoll 0.6s ease-in-out infinite;
}
@keyframes diceRoll {
  0%, 100% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(15deg) scale(1.05); }
  75% { transform: rotate(-15deg) scale(1.05); }
}

/* ═══════════════════════════════════════════════
   PLAYING — PLAYER STRIP
   ═══════════════════════════════════════════════ */
.player-strip {
  display: flex; gap: 8px; overflow-x: auto;
  padding-bottom: 8px; margin-bottom: 16px;
}
.ps-item {
  flex: 0 0 auto; min-width: 80px; padding: 10px 14px;
  background: var(--surface); border: 2px solid var(--border);
  border-radius: var(--radius-sm); text-align: center; transition: all 0.3s;
  position: relative;
}
.ps-item.active {
  border-color: var(--primary); background: rgba(108,92,231,0.12);
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(108,92,231,0.3); }
  50% { box-shadow: 0 0 0 6px rgba(108,92,231,0); }
}
.ps-item.me { box-shadow: 0 0 0 1px var(--accent); }
.ps-item.dealer { border-color: var(--warning); }
.ps-item.disconnected { opacity: 0.3; }
.ps-name {
  font-weight: 600; font-size: 0.82rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ps-role { display: flex; gap: 6px; align-items: center; justify-content: center; margin-top: 2px; }
.dealer-badge {
  font-size: 0.6rem; background: var(--warning); color: #000;
  padding: 0 4px; border-radius: 3px; font-weight: 700;
}
.loss-count { font-size: 0.72rem; color: var(--text-muted); }

/* ── Turn timer bar ── */
.turn-timer-bar {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px; padding: 0 4px;
}
.timer-text {
  font-size: 0.82rem; font-weight: 700;
  color: var(--text-muted); min-width: 30px;
}
.timer-text.urgent { color: var(--danger); }
.timer-track {
  flex: 1; height: 4px; background: var(--border);
  border-radius: 2px; overflow: hidden;
}
.timer-fill {
  height: 100%; background: var(--primary);
  border-radius: 2px; transition: width 1s linear;
}
.timer-fill.urgent { background: var(--danger); }

/* ═══════════════════════════════════════════════
   HAND VISUAL — 3D FLIP
   ═══════════════════════════════════════════════ */
.hand-stage {
  display: flex; justify-content: center;
  margin-bottom: 20px; perspective: 800px;
}
.hand-flip-container {
  width: 220px; height: 200px;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}
.hand-flip-container.flipped {
  transform: rotateX(180deg);
}
.hand-face {
  position: absolute; inset: 0;
  backface-visibility: hidden;
  display: flex; align-items: center; justify-content: center;
}
.hand-back {
  transform: rotateX(180deg);
}

.palm, .closed-hand {
  width: 200px; height: 180px; position: relative;
}
.palm-svg {
  width: 100%; height: 100%;
}

.mystery-mark {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 3.5rem; font-weight: 900;
  color: rgba(212,165,60,0.6);
  text-shadow: 0 2px 8px rgba(0,0,0,0.3);
  animation: mysteryPulse 2s ease-in-out infinite;
}
@keyframes mysteryPulse {
  0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
}

/* ═══════════════════════════════════════════════
   BOTTLE CAP VISUAL
   ═══════════════════════════════════════════════ */
.bottle-cap {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f5d76e, #c5961e 60%, #8a6914);
  box-shadow:
    0 2px 6px rgba(0,0,0,0.4),
    inset 0 1px 2px rgba(255,255,255,0.5);
  position: relative;
  display: flex; align-items: center; justify-content: center;
}
.bottle-cap::before {
  content: '';
  position: absolute; inset: -3px;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    rgba(197,150,30,0.8) 0deg, transparent 12deg,
    transparent 24deg, rgba(197,150,30,0.8) 24deg,
    rgba(197,150,30,0.8) 36deg, transparent 36deg,
    transparent 48deg, rgba(197,150,30,0.8) 48deg,
    rgba(197,150,30,0.8) 60deg, transparent 60deg,
    transparent 72deg, rgba(197,150,30,0.8) 72deg,
    rgba(197,150,30,0.8) 84deg, transparent 84deg,
    transparent 96deg, rgba(197,150,30,0.8) 96deg,
    rgba(197,150,30,0.8) 108deg, transparent 108deg,
    transparent 120deg, rgba(197,150,30,0.8) 120deg,
    rgba(197,150,30,0.8) 132deg, transparent 132deg,
    transparent 144deg, rgba(197,150,30,0.8) 144deg,
    rgba(197,150,30,0.8) 156deg, transparent 156deg,
    transparent 168deg, rgba(197,150,30,0.8) 168deg,
    rgba(197,150,30,0.8) 180deg, transparent 180deg,
    transparent 192deg, rgba(197,150,30,0.8) 192deg,
    rgba(197,150,30,0.8) 204deg, transparent 204deg,
    transparent 216deg, rgba(197,150,30,0.8) 216deg,
    rgba(197,150,30,0.8) 228deg, transparent 228deg,
    transparent 240deg, rgba(197,150,30,0.8) 240deg,
    rgba(197,150,30,0.8) 252deg, transparent 252deg,
    transparent 264deg, rgba(197,150,30,0.8) 264deg,
    rgba(197,150,30,0.8) 276deg, transparent 276deg,
    transparent 288deg, rgba(197,150,30,0.8) 288deg,
    rgba(197,150,30,0.8) 300deg, transparent 300deg,
    transparent 312deg, rgba(197,150,30,0.8) 312deg,
    rgba(197,150,30,0.8) 324deg, transparent 324deg,
    transparent 336deg, rgba(197,150,30,0.8) 336deg,
    rgba(197,150,30,0.8) 348deg, transparent 348deg
  );
  z-index: -1;
}
.cap-inner {
  width: 18px; height: 18px;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 40%, #fbe67a, #d4a53c);
  border: 1px solid rgba(138,105,20,0.4);
}

.caps-on-palm {
  position: absolute; inset: 0; pointer-events: none;
}
.cap-on-palm {
  position: absolute;
  animation: capPlace 0.4s ease-out both;
}
.cap-revealed {
  animation: capReveal 0.6s ease-out both;
}
@keyframes capPlace {
  from { transform: scale(0) translateY(-20px); opacity: 0; }
  to { transform: scale(1) translateY(0); opacity: 1; }
}
@keyframes capReveal {
  0% { transform: scale(0) rotate(180deg); opacity: 0; }
  60% { transform: scale(1.2) rotate(-10deg); opacity: 1; }
  100% { transform: scale(1) rotate(0); opacity: 1; }
}

/* ═══════════════════════════════════════════════
   HIDING CONTROLS
   ═══════════════════════════════════════════════ */
.action-section {
  background: var(--surface);
  border-radius: var(--radius); padding: 20px;
  text-align: center;
}
.hiding-controls h3, .guess-controls h3 {
  font-size: 0.95rem; color: var(--primary-light);
  margin-bottom: 12px;
}
.cap-pool {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.cap-btn {
  width: 52px; height: 52px;
  border-radius: 50%;
  background: var(--card); border: 2px solid var(--border);
  color: var(--text); font-size: 1.2rem; font-weight: 800;
  cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.cap-btn:hover { border-color: var(--primary); }
.cap-btn.selected {
  border-color: #d4a53c;
  background: rgba(212,165,60,0.2);
  box-shadow: 0 0 0 2px rgba(212,165,60,0.4);
  color: #f5d76e;
}

/* ═══════════════════════════════════════════════
   GUESSING CONTROLS
   ═══════════════════════════════════════════════ */
.guess-info {
  margin-bottom: 12px;
}
.number-grid {
  display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;
}
.num-btn {
  width: 52px; height: 52px;
  border-radius: var(--radius-sm);
  background: var(--card); border: 2px solid var(--border);
  color: var(--text); font-size: 1.2rem; font-weight: 800;
  cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
}
.num-btn:hover:not(:disabled) { border-color: var(--primary); }
.num-btn.used {
  opacity: 0.3; cursor: not-allowed;
  text-decoration: line-through;
  background: var(--surface);
}
.num-btn.selected {
  border-color: var(--primary);
  background: rgba(108,92,231,0.2);
  box-shadow: 0 0 0 2px rgba(108,92,231,0.4);
  color: var(--primary-light);
}

/* ═══════════════════════════════════════════════
   GUESS HISTORY
   ═══════════════════════════════════════════════ */
.guess-history {
  display: flex; flex-direction: column;
  gap: 6px; max-width: 300px; margin: 12px auto 0;
}
.guess-toast {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px; background: var(--card);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--border);
  animation: guessSlide 0.4s ease-out both;
}
.guess-toast.correct {
  border-left-color: var(--danger);
  background: rgba(225,112,85,0.1);
}
@keyframes guessSlide {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}
.gt-name { font-weight: 700; font-size: 0.85rem; color: var(--primary-light); }
.gt-text { font-size: 0.82rem; color: var(--text-muted); }
.gt-number {
  font-weight: 800; font-size: 1.1rem; color: var(--text);
  background: var(--surface); padding: 2px 10px; border-radius: 4px;
}
.gt-timeout { font-size: 0.72rem; color: var(--warning); }
.gt-correct { color: var(--danger); font-weight: 800; }
.gt-wrong { color: var(--text-muted); }

/* ═══════════════════════════════════════════════
   ROUND RESULT OVERLAY
   ═══════════════════════════════════════════════ */
.round-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  animation: overlayIn 0.3s ease-out;
}
@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

.round-card {
  background: linear-gradient(145deg, var(--card) 0%, var(--surface) 100%);
  border: 1.5px solid var(--border); border-radius: 16px;
  padding: 28px 32px; text-align: center;
  max-width: 380px; width: 90%;
  animation: popUp 0.4s cubic-bezier(0.17,0.67,0.29,1.3) both;
}
@keyframes popUp {
  0% { transform: scale(0.3) translateY(40px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}

.reveal-number {
  margin-bottom: 16px;
}
.rn-label {
  display: block; font-size: 0.85rem;
  color: var(--text-muted); margin-bottom: 8px;
}
.rn-value {
  display: inline-block;
  font-size: 3.5rem; font-weight: 900;
  color: #f5d76e;
  text-shadow: 0 2px 12px rgba(212,165,60,0.5);
  animation: numberReveal 0.6s ease-out both;
}
@keyframes numberReveal {
  0% { transform: perspective(600px) rotateY(180deg) scale(0.5); opacity: 0; }
  60% { transform: perspective(600px) rotateY(-10deg) scale(1.1); opacity: 1; }
  100% { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
}

.rr-text { font-size: 1rem; font-weight: 600; margin-bottom: 8px; }
.rr-next { font-size: 0.85rem; }

/* ═══════════════════════════════════════════════
   TOASTS
   ═══════════════════════════════════════════════ */
.toast-error {
  position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%); background: var(--danger);
  color: #fff; padding: 10px 24px; border-radius: var(--radius);
  font-size: 0.9rem; cursor: pointer; z-index: 100;
  animation: fadeIn 0.3s ease-out;
}
.toast-info {
  position: fixed; top: 40%; left: 50%;
  transform: translate(-50%, -50%); background: var(--primary);
  color: #fff; padding: 14px 32px; border-radius: var(--radius);
  font-size: 1.1rem; font-weight: 600; z-index: 99;
  animation: fadeIn 0.3s ease-out;
}

/* ═══════════════════════════════════════════════
   MOBILE
   ═══════════════════════════════════════════════ */
.game-page { overflow-x: hidden; max-width: 100vw; }

@media (max-width: 700px) {
  .game-header { flex-wrap: wrap; gap: 6px; padding: 8px 10px; }
  .game-main { padding: 10px; }

  .dice { width: 60px; height: 60px; font-size: 1.6rem; }
  .dice-area { gap: 12px; }

  .hand-flip-container { width: 180px; height: 170px; }
  .palm, .closed-hand { width: 170px; height: 160px; }
  .bottle-cap { width: 26px; height: 26px; }
  .cap-inner { width: 14px; height: 14px; }
  .mystery-mark { font-size: 2.8rem; }

  .cap-btn, .num-btn { width: 44px; height: 44px; font-size: 1rem; }

  .player-strip { gap: 6px; }
  .ps-item { min-width: 64px; padding: 8px 10px; }
  .ps-name { font-size: 0.75rem; }
  .state-panel { margin: 30px auto; }
  .spec-tag { display: none; }
}
</style>
