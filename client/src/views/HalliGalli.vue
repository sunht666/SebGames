<template>
  <div class="game-page">
    <!-- ── Header ── -->
    <header class="game-header">
      <div class="header-left">
        <button class="btn btn-outline btn-sm" @click="leaveRoom">
          {{ spectateMode ? '退出观战' : '退出' }}
        </button>
        <span class="room-tag">房间 {{ roomId }}</span>
        <span class="type-tag">德国心脏病 {{ Math.round(turnTimeLimit / 1000) }}s</span>
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
        <div class="waiting-icon">&#128276;</div>
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

      <!-- Playing -->
      <div v-else-if="gameState === 'PLAYING'" class="play-area fade-in">
        <!-- Player strip -->
        <div class="player-strip">
          <div
            v-for="(p, i) in playerList"
            :key="i"
            class="ps-item"
            :class="{
              active: currentTurn === i,
              me: i === playerIndex && !spectateMode,
              eliminated: p && p.totalCards === 0,
              disconnected: !p,
            }"
          >
            <div class="ps-name">{{ p ? p.name : '离线' }}</div>
            <div class="ps-cards">
              <span v-if="p && p.totalCards > 0" class="card-count">{{ p.totalCards }}张</span>
              <span v-else-if="p" class="elim-label">淘汰</span>
            </div>
          </div>
        </div>

        <!-- Turn timer -->
        <div v-if="turnTimeLeft > 0 && !bellLocked" class="turn-timer-bar">
          <span class="timer-text" :class="{ urgent: turnTimeLeft <= 2 }">{{ turnTimeLeft }}s</span>
          <div class="timer-track">
            <div class="timer-fill" :class="{ urgent: turnTimeLeft <= 2 }" :style="{ width: timerPercent + '%' }"></div>
          </div>
        </div>

        <!-- Table area: circular layout with bell in center -->
        <div class="table-area">
          <!-- Bell in center -->
          <div class="bell-container">
            <button
              class="bell-btn"
              :class="{ pressed: bellPressed, locked: bellLocked, shaking: bellShaking }"
              :disabled="spectateMode || bellLocked || !playOrder.includes(playerIndex)"
              @click="ringBell"
            >
              <div class="bell-body">
                <div class="bell-dome"></div>
                <div class="bell-rim"></div>
                <div class="bell-clapper"></div>
              </div>
              <div class="bell-base"></div>
            </button>
            <div v-if="bellResultText" class="bell-result-text" :class="bellResultClass">
              {{ bellResultText }}
            </div>
          </div>

          <!-- Player card slots around the bell -->
          <div class="table-ring" :class="'ring-' + activePlayerCount">
            <div
              v-for="(pi, slotIdx) in playOrder"
              :key="'tc-' + pi"
              class="table-card-slot"
              :class="{
                active: currentTurn === pi,
                'just-flipped': lastFlipPlayer === pi,
                me: pi === playerIndex && !spectateMode,
              }"
              :style="slotPosition(slotIdx, playOrder.length)"
            >
              <div class="tc-label">
                <span class="tc-name" :class="{ 'tc-active': currentTurn === pi }">{{ playerList[pi]?.name }}</span>
                <span class="tc-pile">{{ playerList[pi]?.drawCount || 0 }}张</span>
              </div>
              <!-- Face-up card -->
              <div v-if="playerList[pi]?.topCard" class="fruit-card" :class="'fc-' + playerList[pi].topCard.fruit">
                <div class="fc-corner fc-tl">
                  <span class="fc-count">{{ playerList[pi].topCard.count }}</span>
                  <span class="fc-fruit-sm">{{ fruitEmoji(playerList[pi].topCard.fruit) }}</span>
                </div>
                <div class="fc-center">
                  <div class="fc-fruits" :class="'fc-layout-' + playerList[pi].topCard.count">
                    <span v-for="n in playerList[pi].topCard.count" :key="n" class="fc-fruit-icon">{{ fruitEmoji(playerList[pi].topCard.fruit) }}</span>
                  </div>
                </div>
                <div class="fc-corner fc-br">
                  <span class="fc-count">{{ playerList[pi].topCard.count }}</span>
                  <span class="fc-fruit-sm">{{ fruitEmoji(playerList[pi].topCard.fruit) }}</span>
                </div>
              </div>
              <!-- Draw pile (card back) behind face-up card -->
              <div v-if="playerList[pi]?.drawCount > 0" class="card-back-stack">
                <div class="card-back"></div>
              </div>
              <!-- No face-up card yet -->
              <div v-if="!playerList[pi]?.topCard" class="fruit-card-empty">
                <span class="empty-text">未翻牌</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Flip button (for current player) -->
        <div v-if="!spectateMode && isMyTurn && !bellLocked" class="flip-action">
          <button class="btn btn-primary btn-lg flip-btn" @click="flipCard">
            翻牌
          </button>
        </div>
        <div v-else-if="!spectateMode && !bellLocked && playOrder.includes(playerIndex)" class="flip-action text-center">
          <p class="text-muted">等待 {{ currentTurnName }} 翻牌...</p>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="gameState === 'FINISHED'" class="state-panel fade-in text-center">
        <div class="result-icon">&#127942;</div>
        <h2 class="text-success">游戏结束</h2>
        <div class="rankings mt-3">
          <div v-for="r in rankings" :key="r.playerIndex" class="rank-item" :class="{ first: r.rank === 1 }">
            <span class="rank-num">#{{ r.rank }}</span>
            <span class="rank-name">{{ r.playerName }}</span>
            <span v-if="r.rank === 1" class="rank-label text-success">胜利</span>
            <span v-else class="rank-label text-danger">淘汰</span>
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

      <!-- Error toast -->
      <div v-if="errorMsg" class="toast-error" @click="errorMsg = ''">{{ errorMsg }}</div>
      <!-- Info toast -->
      <div v-if="infoNotify" class="toast-info">{{ infoNotify }}</div>

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

      <!-- Bell result overlay -->
      <div v-if="bellOverlay" class="bell-overlay" @click="bellOverlay = null">
        <div class="bell-overlay-card" :class="bellOverlay.correct ? 'bo-correct' : 'bo-wrong'" @click.stop>
          <div class="bo-icon">{{ bellOverlay.correct ? '&#9989;' : '&#10060;' }}</div>
          <h3>{{ bellOverlay.correct ? '抢铃成功！' : '抢铃失败！' }}</h3>
          <p class="bo-who">{{ bellOverlay.ringerName }}</p>
          <p v-if="bellOverlay.correct" class="bo-detail text-success">
            场上恰好有 5 个 {{ fruitName(bellOverlay.fruit) }}，赢得 {{ bellOverlay.cardsWon }} 张牌
          </p>
          <p v-else class="bo-detail text-danger">
            没有恰好 5 个同种水果，罚交 {{ bellOverlay.cardsLost }} 张牌
          </p>
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
const currentTurn = ref(-1);
const currentTurnName = ref('');
const spectatorCount = ref(0);
const errorMsg = ref('');
const dissolveMessage = ref('');
const kickTarget = ref(-1);
const hasJoinedRoom = ref(false);

// Game state
const playOrder = ref([]);
const bellLocked = ref(false);
const rankings = ref([]);
const roundNumber = ref(0);

// UI state
const bellPressed = ref(false);
const bellShaking = ref(false);
const bellResultText = ref('');
const bellResultClass = ref('');
const bellOverlay = ref(null);
const lastFlipPlayer = ref(-1);
const infoNotify = ref('');
const turnTimeLimit = ref(5000);
const turnTimeLeft = ref(0);
let turnCountdown = null;

// ── Computed ──
const isMyTurn = computed(() => currentTurn.value === playerIndex.value);
const timerPercent = computed(() => turnTimeLimit.value > 0 ? (turnTimeLeft.value / (turnTimeLimit.value / 1000)) * 100 : 0);
const activePlayerCount = computed(() => playOrder.value.length);

// Position player card slots in a ring around the bell
function slotPosition(slotIdx, total) {
  // On mobile, use a simple flex layout (handled by CSS)
  if (window.innerWidth <= 700) return {};
  const radius = total <= 3 ? 140 : total <= 4 ? 160 : 170;
  // Start from top, distribute evenly clockwise
  const angle = (slotIdx / total) * 360 - 90;
  const rad = (angle * Math.PI) / 180;
  const x = Math.cos(rad) * radius;
  const y = Math.sin(rad) * radius;
  return { transform: `translate(${x}px, ${y}px)` };
}

function fruitEmoji(fruit) {
  const map = { banana: '\u{1F34C}', strawberry: '\u{1F353}', lime: '\u{1F34B}', plum: '\u{1F347}' };
  return map[fruit] || '';
}

function fruitName(fruit) {
  const map = { banana: '香蕉', strawberry: '草莓', lime: '柠檬', plum: '葡萄' };
  return map[fruit] || fruit;
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

function flipCard() { send({ type: 'flip_card' }); }

function ringBell() {
  if (bellLocked.value || !playOrder.value.includes(playerIndex.value)) return;
  bellPressed.value = true;
  setTimeout(() => { bellPressed.value = false; }, 300);
  send({ type: 'ring_bell' });
}

function confirmKick(targetIndex) { kickTarget.value = targetIndex; }

function doKick() {
  if (kickTarget.value >= 0) {
    send({ type: 'kick_player', targetIndex: kickTarget.value });
    kickTarget.value = -1;
  }
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
      gameState.value = 'WAITING';
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      break;

    case 'reconnected':
      hasJoinedRoom.value = true;
      playerIndex.value = msg.playerIndex;
      gameState.value = msg.state;
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      playOrder.value = msg.playOrder || [];
      currentTurn.value = msg.currentTurn ?? -1;
      bellLocked.value = !!msg.bellLocked;
      spectatorCount.value = msg.spectatorCount || 0;
      roundNumber.value = msg.roundNumber || 0;
      updateCurrentTurnName();
      break;

    case 'reconnect_failed':
      hasJoinedRoom.value = false;
      gameState.value = 'DISSOLVED';
      dissolveMessage.value = '房间已解散';
      setTimeout(() => { cleanup(); router.push('/'); }, 2000);
      break;

    case 'spectate_joined':
      gameState.value = msg.state;
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      playOrder.value = msg.playOrder || [];
      currentTurn.value = msg.currentTurn ?? -1;
      bellLocked.value = !!msg.bellLocked;
      spectatorCount.value = msg.spectatorCount;
      roundNumber.value = msg.roundNumber || 0;
      updateCurrentTurnName();
      break;

    case 'player_joined': break;

    case 'player_list':
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || maxPlayersDisplay.value;
      break;

    case 'state_change':
      gameState.value = msg.state;
      break;

    case 'turn_start':
      currentTurn.value = msg.playerIndex;
      currentTurnName.value = msg.playerName || '';
      if (msg.tableState) playerList.value = msg.tableState;
      bellLocked.value = !!msg.bellLocked;
      if (msg.timeLimit) startTurnTimer(msg.timeLimit);
      break;

    case 'card_flipped':
      stopTurnTimer();
      lastFlipPlayer.value = msg.playerIndex;
      setTimeout(() => { lastFlipPlayer.value = -1; }, 800);
      if (msg.tableState) playerList.value = msg.tableState;
      break;

    case 'bell_result':
      stopTurnTimer();
      bellLocked.value = true;
      if (msg.tableState) playerList.value = msg.tableState;

      if (msg.correct) {
        bellResultText.value = `${msg.ringerName} 抢铃成功！+${msg.cardsWon}`;
        bellResultClass.value = 'br-correct';
        bellShaking.value = false;
      } else {
        bellResultText.value = `${msg.ringerName} 抢错了！-${msg.cardsLost}`;
        bellResultClass.value = 'br-wrong';
        bellShaking.value = true;
        setTimeout(() => { bellShaking.value = false; }, 500);
      }
      bellOverlay.value = msg;
      setTimeout(() => { bellResultText.value = ''; bellOverlay.value = null; }, 2500);
      break;

    case 'player_eliminated':
      playOrder.value = playOrder.value.filter(i => i !== msg.playerIndex);
      showInfo(`${msg.playerName} 已被淘汰！`);
      break;

    case 'pile_recycled':
      if (msg.playerIndex !== playerIndex.value || props.spectateMode) {
        showInfo(`${msg.playerName} 的弃牌堆已翻转为抽牌堆`);
      }
      break;

    case 'player_disconnected':
      showError(`${msg.playerName} 已断开连接`);
      break;

    case 'player_away':
      showError(`${msg.playerName} 暂时离线，等待重连...`);
      break;

    case 'player_back':
      showError(`${msg.playerName} 已回来`);
      break;

    case 'player_left': break;

    case 'player_index_update':
      playerIndex.value = msg.playerIndex;
      break;

    case 'game_over':
      gameState.value = 'FINISHED';
      rankings.value = msg.rankings || [];
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

    case 'player_kicked': break;

    case 'spectator_count':
      spectatorCount.value = msg.count;
      break;

    case 'error':
      showError(msg.message);
      break;
  }
}

function updateCurrentTurnName() {
  if (currentTurn.value >= 0 && playerList.value[currentTurn.value]) {
    currentTurnName.value = playerList.value[currentTurn.value].name;
  }
}

function showError(message) {
  errorMsg.value = message;
  setTimeout(() => { if (errorMsg.value === message) errorMsg.value = ''; }, 3000);
}

function showInfo(message) {
  infoNotify.value = message;
  setTimeout(() => { if (infoNotify.value === message) infoNotify.value = ''; }, 2500);
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
  font-size: 0.75rem; color: #e17055;
  background: rgba(225,112,85,0.15); padding: 3px 8px;
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

/* ═══════════════════════════════════════════════
   PLAYING — PLAYER STRIP
   ═══════════════════════════════════════════════ */
.player-strip {
  display: flex; gap: 8px; overflow-x: auto;
  padding-bottom: 8px; margin-bottom: 12px;
}
.ps-item {
  flex: 0 0 auto; min-width: 80px; padding: 10px 14px;
  background: var(--surface); border: 2px solid var(--border);
  border-radius: var(--radius-sm); text-align: center; transition: all 0.3s;
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
.ps-item.eliminated { opacity: 0.3; }
.ps-item.disconnected { opacity: 0.3; }
.ps-name {
  font-weight: 600; font-size: 0.82rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ps-cards { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.card-count { color: var(--text-muted); }
.elim-label { color: var(--danger); font-weight: 700; font-size: 0.7rem; }

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
   TABLE AREA
   ═══════════════════════════════════════════════ */
.table-area {
  background: radial-gradient(ellipse at center, rgba(30,100,50,0.45) 0%, rgba(15,60,30,0.35) 100%);
  border: 2px solid rgba(40,120,60,0.35);
  border-radius: 50%;
  padding: 40px;
  margin: 0 auto 16px;
  width: 460px; height: 460px;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.1);
}

/* Ring of player cards positioned around the bell */
.table-ring {
  position: absolute; inset: 0;
  display: flex; align-items: center; justify-content: center;
}

.table-card-slot {
  position: absolute;
  display: flex; flex-direction: column;
  align-items: center; gap: 6px;
  transition: all 0.3s;
}
.table-card-slot.active .tc-name {
  color: var(--primary-light);
}
.table-card-slot.me .tc-name {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.table-card-slot.just-flipped .fruit-card {
  animation: cardFlipIn 0.5s ease-out;
}
@keyframes cardFlipIn {
  0% { transform: perspective(600px) rotateY(180deg) scale(0.8); opacity: 0; }
  60% { transform: perspective(600px) rotateY(-10deg) scale(1.02); opacity: 1; }
  100% { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
}

.tc-label {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
}
.tc-name {
  font-size: 0.78rem; font-weight: 700;
  color: rgba(255,255,255,0.7); white-space: nowrap;
  max-width: 90px; overflow: hidden; text-overflow: ellipsis;
  transition: color 0.3s;
}
.tc-name.tc-active {
  color: #ffd700;
  text-shadow: 0 0 6px rgba(255,215,0,0.4);
}
.tc-pile {
  font-size: 0.65rem; color: rgba(255,255,255,0.4);
}

/* ═══════════════════════════════════════════════
   FRUIT CARD (扑克牌风格水果卡)
   ═══════════════════════════════════════════════ */
.fruit-card {
  width: 88px; height: 124px;
  border-radius: 10px;
  position: relative;
  box-shadow:
    0 3px 10px rgba(0,0,0,0.25),
    inset 0 1px 0 rgba(255,255,255,0.9);
  user-select: none;
  overflow: hidden;
  z-index: 2;
}

/* Fruit-specific backgrounds */
.fc-banana {
  background: linear-gradient(165deg, #fffef0 0%, #fff3b8 50%, #ffe88a 100%);
  border: 2px solid #d4b84a;
}
.fc-strawberry {
  background: linear-gradient(165deg, #fff5f5 0%, #ffd0d0 50%, #ffb0b0 100%);
  border: 2px solid #d87070;
}
.fc-lime {
  background: linear-gradient(165deg, #f5fff5 0%, #d0f5d0 50%, #a8e8a8 100%);
  border: 2px solid #6caa6c;
}
.fc-plum {
  background: linear-gradient(165deg, #f8f0ff 0%, #e0ccf5 50%, #d0b8ee 100%);
  border: 2px solid #9a78c0;
}

.fruit-card::before {
  content: '';
  position: absolute; inset: 4px;
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 6px;
  pointer-events: none;
}

/* Corner rank+suit */
.fc-corner {
  position: absolute;
  display: flex; flex-direction: column;
  align-items: center; line-height: 1;
}
.fc-tl { top: 5px; left: 6px; }
.fc-br { bottom: 5px; right: 6px; transform: rotate(180deg); }
.fc-count {
  font-size: 1rem; font-weight: 800;
  color: #333;
}
.fc-fruit-sm { font-size: 0.8rem; margin-top: -1px; }

/* Center fruits */
.fc-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.fc-fruits {
  display: flex; flex-wrap: wrap;
  justify-content: center; align-items: center;
  gap: 3px;
}
.fc-fruit-icon { font-size: 1.5rem; line-height: 1; }

/* Layouts for different counts */
.fc-layout-1 { width: 36px; }
.fc-layout-1 .fc-fruit-icon { font-size: 2.2rem; }
.fc-layout-2 { width: 36px; flex-direction: column; gap: 4px; }
.fc-layout-2 .fc-fruit-icon { font-size: 1.6rem; }
.fc-layout-3 { width: 48px; }
.fc-layout-3 .fc-fruit-icon { font-size: 1.3rem; }
.fc-layout-4 { width: 48px; }
.fc-layout-4 .fc-fruit-icon { font-size: 1.3rem; }
.fc-layout-5 { width: 48px; }
.fc-layout-5 .fc-fruit-icon { font-size: 1.1rem; }

/* Fruit-specific count colors */
.fc-banana .fc-count { color: #a07800; }
.fc-strawberry .fc-count { color: #cc2222; }
.fc-lime .fc-count { color: #1a7a1a; }
.fc-plum .fc-count { color: #6a0dad; }

/* Card back (draw pile) */
.card-back-stack {
  position: absolute;
  top: 24px; left: 50%;
  transform: translateX(-50%);
  z-index: 1;
}
.card-back {
  width: 88px; height: 124px;
  border-radius: 10px;
  background:
    repeating-linear-gradient(
      45deg,
      #2a5298 0px, #2a5298 4px,
      #1e3a6e 4px, #1e3a6e 8px
    );
  border: 2px solid #1a2e5a;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  position: relative;
}
.card-back::before {
  content: '';
  position: absolute; inset: 5px;
  border: 1.5px solid rgba(255,255,255,0.15);
  border-radius: 6px;
}
.card-back::after {
  content: '🃏';
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.6rem;
  opacity: 0.4;
}

/* Empty card slot */
.fruit-card-empty {
  width: 88px; height: 124px;
  border: 2px dashed rgba(255,255,255,0.18);
  border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  z-index: 2;
}
.empty-text { color: rgba(255,255,255,0.3); font-size: 0.8rem; }

/* ═══════════════════════════════════════════════
   BELL
   ═══════════════════════════════════════════════ */
.bell-container {
  display: flex; flex-direction: column;
  align-items: center; gap: 8px;
}

.bell-btn {
  width: 110px; height: 110px;
  border-radius: 50%;
  border: none;
  background: radial-gradient(circle at 35% 35%, #e8e8e8, #b0b0b0 60%, #808080);
  box-shadow:
    0 4px 12px rgba(0,0,0,0.4),
    0 0 0 4px rgba(180,180,180,0.3),
    inset 0 2px 4px rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
  display: flex; align-items: center; justify-content: center;
  flex-direction: column;
}

.bell-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow:
    0 6px 16px rgba(0,0,0,0.5),
    0 0 0 4px rgba(200,180,60,0.4),
    inset 0 2px 4px rgba(255,255,255,0.5);
}

.bell-btn:active:not(:disabled), .bell-btn.pressed {
  transform: scale(0.92);
  box-shadow:
    0 2px 6px rgba(0,0,0,0.4),
    inset 0 2px 8px rgba(0,0,0,0.2);
}

.bell-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.bell-btn.locked {
  opacity: 0.6;
}

.bell-btn.shaking {
  animation: bellShake 0.4s ease-out;
}

@keyframes bellShake {
  0%, 100% { transform: translateX(0) rotate(0); }
  20% { transform: translateX(-4px) rotate(-3deg); }
  40% { transform: translateX(4px) rotate(3deg); }
  60% { transform: translateX(-3px) rotate(-2deg); }
  80% { transform: translateX(3px) rotate(2deg); }
}

/* Bell visual elements */
.bell-body {
  position: relative;
  width: 50px; height: 50px;
}

.bell-dome {
  position: absolute;
  width: 46px; height: 38px;
  bottom: 12px; left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(ellipse at 40% 30%, #ffd700, #daa520 50%, #b8860b);
  border-radius: 50% 50% 5px 5px;
  box-shadow:
    inset 0 -3px 6px rgba(0,0,0,0.2),
    inset 0 3px 6px rgba(255,255,200,0.4);
}

.bell-rim {
  position: absolute;
  width: 52px; height: 8px;
  bottom: 8px; left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(180deg, #daa520, #b8860b);
  border-radius: 0 0 4px 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.bell-clapper {
  position: absolute;
  width: 6px; height: 10px;
  bottom: 4px; left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle at 50% 30%, #444, #222);
  border-radius: 50% 50% 50% 50%;
}

.bell-base {
  width: 80px; height: 6px;
  background: linear-gradient(180deg, #666, #444);
  border-radius: 3px;
  margin-top: -2px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.bell-result-text {
  font-size: 0.85rem; font-weight: 700;
  padding: 4px 14px; border-radius: 12px;
  animation: fadeIn 0.3s ease-out;
}
.br-correct {
  color: #00b894; background: rgba(0,184,148,0.15);
}
.br-wrong {
  color: #e17055; background: rgba(225,112,85,0.15);
}

/* ═══════════════════════════════════════════════
   FLIP ACTION
   ═══════════════════════════════════════════════ */
.flip-action {
  text-align: center; margin-bottom: 16px;
}
.flip-btn {
  min-width: 160px;
  animation: pulse 2s ease-in-out infinite;
}

/* ═══════════════════════════════════════════════
   BELL RESULT OVERLAY
   ═══════════════════════════════════════════════ */
.bell-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  animation: overlayIn 0.3s ease-out;
}
@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

.bell-overlay-card {
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
.bell-overlay-card.bo-correct {
  border-color: var(--success);
}
.bell-overlay-card.bo-wrong {
  border-color: var(--danger);
}
.bo-icon { font-size: 2.5rem; margin-bottom: 8px; }
.bell-overlay-card h3 { font-size: 1.3rem; margin-bottom: 8px; }
.bo-who {
  font-size: 1.1rem; font-weight: 700;
  color: var(--primary-light); margin-bottom: 8px;
}
.bo-detail { font-size: 0.95rem; font-weight: 600; }

/* ═══════════════════════════════════════════════
   RANKINGS / GAME OVER
   ═══════════════════════════════════════════════ */
.result-icon { font-size: 4rem; margin-bottom: 10px; }
.rankings {
  display: flex; flex-direction: column; gap: 8px;
  max-width: 300px; margin: 0 auto;
}
.rank-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; background: var(--surface);
  border-radius: var(--radius-sm); border-left: 3px solid var(--border);
}
.rank-item.first {
  border-left-color: var(--success); background: rgba(0,184,148,0.08);
}
.rank-num { font-weight: 800; font-size: 1.1rem; min-width: 30px; color: var(--text-muted); }
.rank-name { flex: 1; font-weight: 600; }
.rank-label { font-size: 0.8rem; font-weight: 700; }

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

  .table-area {
    width: 100%; height: auto;
    border-radius: 16px;
    padding: 16px; margin-bottom: 12px;
  }
  .table-ring {
    position: relative;
    display: flex; flex-wrap: wrap;
    justify-content: center; gap: 12px;
    margin-top: 16px;
  }
  .table-card-slot {
    position: relative !important;
    transform: none !important;
  }

  .fruit-card { width: 64px; height: 90px; }
  .fruit-card-empty { width: 64px; height: 90px; }
  .fc-count { font-size: 0.78rem; }
  .fc-fruit-sm { font-size: 0.62rem; }
  .fc-fruit-icon { font-size: 1.1rem; }
  .fc-layout-1 .fc-fruit-icon { font-size: 1.5rem; }
  .fc-layout-2 .fc-fruit-icon { font-size: 1.1rem; }
  .fc-layout-3 .fc-fruit-icon { font-size: 0.95rem; }
  .fc-layout-4 .fc-fruit-icon { font-size: 0.95rem; }
  .fc-layout-5 .fc-fruit-icon { font-size: 0.85rem; }
  .fc-tl { top: 3px; left: 4px; }
  .fc-br { bottom: 3px; right: 4px; }

  .card-back-stack { display: none; }

  .bell-btn { width: 80px; height: 80px; }
  .bell-body { width: 36px; height: 36px; }
  .bell-dome { width: 34px; height: 28px; }
  .bell-rim { width: 38px; height: 6px; }
  .bell-base { width: 58px; height: 5px; }
  .bell-container { margin-bottom: 8px; }

  .player-strip { gap: 6px; }
  .ps-item { min-width: 64px; padding: 8px 10px; }
  .ps-name { font-size: 0.75rem; }
  .state-panel { margin: 30px auto; }
  .spec-tag { display: none; }

  .tc-name { font-size: 0.7rem; }
  .tc-pile { font-size: 0.6rem; }
}
</style>
