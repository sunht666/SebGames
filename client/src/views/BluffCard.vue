<template>
  <div class="game-page">
    <!-- ── Header ── -->
    <header class="game-header">
      <div class="header-left">
        <button class="btn btn-outline btn-sm" @click="leaveRoom">
          {{ spectateMode ? '退出观战' : '退出' }}
        </button>
        <span class="room-tag">房间 {{ roomId }}</span>
        <span class="type-tag">唬牌 {{ roomDeckCount }}副{{ roomShuffleMode ? ' 乱序' : '' }} {{ Math.round(turnTimeLimit / 1000) }}s</span>
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
              won: winners.some(w => w.playerIndex === i),
              disconnected: !p,
            }"
          >
            <div class="ps-name">{{ p ? p.name : '离线' }}</div>
            <div class="ps-cards">
              <span v-if="winners.some(w => w.playerIndex === i)" class="win-badge">
                #{{ winners.find(w => w.playerIndex === i).rank }}
              </span>
              <span v-else-if="p">{{ p.cardCount }}张</span>
            </div>
          </div>
        </div>

        <!-- Turn timer -->
        <div v-if="turnTimeLeft > 0" class="turn-timer-bar">
          <span class="timer-text" :class="{ urgent: turnTimeLeft <= 5 }">{{ turnTimeLeft }}s</span>
          <div class="timer-track">
            <div class="timer-fill" :class="{ urgent: turnTimeLeft <= 5 }" :style="{ width: timerPercent + '%' }"></div>
          </div>
        </div>

        <!-- Pile area -->
        <div class="pile-area">
          <div class="pile-visual" :class="{ collecting: isCollecting }">
            <!-- Stacked card backs -->
            <div class="card-back pile-back" v-if="pileCount > 0">
              <div class="card-back-inner">
                <div class="cb-pattern"></div>
              </div>
            </div>
            <div class="card-back pile-back pile-back-2" v-if="pileCount > 2"></div>
            <div class="card-back pile-back pile-back-3" v-if="pileCount > 5"></div>
            <div class="pile-count-badge" v-if="pileCount > 0">{{ pileCount }}</div>
            <div v-if="pileCount === 0" class="pile-empty">空</div>
          </div>
          <div class="pile-info">
            <div v-if="lastPlayInfo" class="last-play-info">
              <span class="lp-name">{{ lastPlayInfo.playerName }}</span>
              <span class="lp-text">声明了</span>
              <span class="lp-rank">{{ lastPlayInfo.declaredCount }}张{{ lastPlayInfo.declaredRank }}</span>
            </div>
            <div v-else class="last-play-info text-muted">新一轮开始</div>
          </div>
        </div>

        <!-- My hand (not shown to spectators) -->
        <div v-if="!spectateMode" class="my-hand-area">
          <h3 class="section-title">我的手牌 ({{ myHand.length }}张)
            <span v-if="selectedCards.size" class="sel-hint">· 已选 {{ selectedCards.size }} 张</span>
          </h3>
          <div class="hand-fan" ref="handFanRef">
            <div v-for="(row, ri) in handRows" :key="ri" class="hand-row">
              <div
                v-for="(card, ci) in row"
                :key="card.id"
                class="poker-card-wrap"
                :class="{ selected: selectedCards.has(card.id), dealing: isDealing }"
                :style="fanStyle(ri * cardsPerRow + ci)"
                @click="toggleCard(card)"
              >
                <div class="poker-card" :class="[cardColorClass(card), { 'is-joker': card.isJoker }]">
                  <div class="pc-corner pc-tl">
                    <span class="pc-rank">{{ shortRank(card) }}</span>
                    <span class="pc-suit">{{ suitSymbol(card) }}</span>
                  </div>
                  <div class="pc-center">
                    <template v-if="card.isJoker">
                      <span class="joker-star">&#9733;</span>
                      <span class="joker-label">{{ card.rank === 'BIG' ? 'JOKER' : 'joker' }}</span>
                    </template>
                    <template v-else>
                      <span class="center-suit">{{ suitSymbol(card) }}</span>
                    </template>
                  </div>
                  <div class="pc-corner pc-br">
                    <span class="pc-rank">{{ shortRank(card) }}</span>
                    <span class="pc-suit">{{ suitSymbol(card) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Action area -->
          <div v-if="isMyTurn" class="action-area mt-2">
            <div v-if="canPlayCards" class="play-action">
              <div class="rank-selector">
                <label>声明点数:</label>
                <select v-model="declareRank" class="input input-sm" :disabled="!!forcedRank">
                  <option v-for="r in ranks" :key="r" :value="r">{{ r }}</option>
                </select>
              </div>
              <button
                class="btn btn-primary"
                :disabled="selectedCards.size === 0"
                @click="playCards"
              >
                出牌 ({{ selectedCards.size }}张)
              </button>
            </div>
            <div class="secondary-actions">
              <button
                v-if="canChallenge"
                class="btn btn-danger"
                @click="challenge"
              >
                质疑
              </button>
              <button
                v-if="canPass"
                class="btn btn-outline"
                @click="pass"
              >
                跳过
              </button>
            </div>
          </div>
          <div v-else class="action-area mt-2 text-center text-muted">
            等待其他玩家...
          </div>
        </div>

        <!-- Challenge result overlay -->
        <div v-if="challengeResult" class="challenge-overlay" @click="challengeResult = null">
          <div class="challenge-card" @click.stop>
            <h3 :class="challengeResult.isBluff ? 'text-success' : 'text-danger'">
              {{ challengeResult.isBluff ? '质疑成功！' : '质疑失败！' }}
            </h3>
            <p class="cr-who">
              {{ challengeResult.challengerName }} 质疑了 {{ challengeResult.challengedName }}
            </p>
            <p class="cr-declare">声明: {{ challengeResult.declaredRank }}</p>
            <div class="cr-cards">
              <div
                v-for="(card, ci) in challengeResult.revealedCards"
                :key="card.id"
                class="poker-card cr-poker"
                :class="[
                  cardColorClass(card),
                  { 'is-joker': card.isJoker },
                  { 'cr-bluff': !card.isJoker && card.rank !== challengeResult.declaredRank }
                ]"
                :style="{ animationDelay: ci * 0.12 + 's' }"
              >
                <div class="pc-corner pc-tl">
                  <span class="pc-rank">{{ shortRank(card) }}</span>
                  <span class="pc-suit">{{ suitSymbol(card) }}</span>
                </div>
                <div class="pc-center">
                  <template v-if="card.isJoker">
                    <span class="joker-star">&#9733;</span>
                  </template>
                  <template v-else>
                    <span class="center-suit">{{ suitSymbol(card) }}</span>
                  </template>
                </div>
                <div class="pc-corner pc-br">
                  <span class="pc-rank">{{ shortRank(card) }}</span>
                  <span class="pc-suit">{{ suitSymbol(card) }}</span>
                </div>
              </div>
            </div>
            <p class="cr-result" :class="challengeResult.isBluff ? 'text-success' : 'text-danger'">
              {{ challengeResult.loserName }} 收走全部牌堆
            </p>
            <!-- All pile cards -->
            <div v-if="challengeResult.allPileCards && challengeResult.allPileCards.length > challengeResult.revealedCards.length" class="cr-pile-section">
              <p class="cr-pile-label">牌堆所有牌 ({{ challengeResult.allPileCards.length }}张)</p>
              <div class="cr-pile-cards">
                <div
                  v-for="(card, ci) in challengeResult.allPileCards"
                  :key="'pile-' + card.id"
                  class="poker-card cr-pile-poker"
                  :class="[cardColorClass(card), { 'is-joker': card.isJoker }]"
                  :style="{ animationDelay: (ci * 0.06 + 0.3) + 's' }"
                >
                  <div class="pc-corner pc-tl">
                    <span class="pc-rank">{{ shortRank(card) }}</span>
                    <span class="pc-suit">{{ suitSymbol(card) }}</span>
                  </div>
                  <div class="pc-center">
                    <template v-if="card.isJoker">
                      <span class="joker-star">&#9733;</span>
                    </template>
                    <template v-else>
                      <span class="center-suit">{{ suitSymbol(card) }}</span>
                    </template>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Game over -->
      <div v-else-if="gameState === 'FINISHED'" class="state-panel fade-in text-center">
        <div class="result-icon">&#127942;</div>
        <h2 class="text-success">游戏结束</h2>
        <div class="rankings mt-3">
          <div v-for="r in rankings" :key="r.playerIndex" class="rank-item" :class="{ first: r.rank === 1, last: r.isLoser }">
            <span class="rank-num">#{{ r.rank }}</span>
            <span class="rank-name">{{ r.playerName }}</span>
            <span v-if="r.rank === 1" class="rank-label text-success">胜利</span>
            <span v-else-if="r.isLoser" class="rank-label text-danger">失败</span>
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
      <!-- Pass notification -->
      <div v-if="passNotify" class="toast-info">{{ passNotify }}</div>
      <!-- Win notification -->
      <div v-if="winNotify" class="toast-success">{{ winNotify }}</div>

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
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({ roomId: String, spectateMode: { type: Boolean, default: false } });
const router = useRouter();

// ── State ──
const ws = ref(null);
const playerId = ref(null);
const playerIndex = ref(-1);
const gameState = ref('CONNECTING');
const playerList = ref([]);
const maxPlayersDisplay = ref(2);
const currentTurn = ref(-1);
const spectatorCount = ref(0);
const errorMsg = ref('');
const dissolveMessage = ref('');
const kickTarget = ref(-1);

// Game state
const myHand = ref([]);
const lastPlayInfo = ref(null);
const pileCount = ref(0);
const canChallenge = ref(false);
const canPass = ref(false);
const canPlayCards = ref(true);
const forcedRank = ref(null);
const winners = ref([]);
const rankings = ref([]);
const challengeResult = ref(null);
const roundNumber = ref(0);

// UI state
const selectedCards = reactive(new Set());
const declareRank = ref('A');
const passNotify = ref('');
const winNotify = ref('');
const handFanRef = ref(null);
const isDealing = ref(false);
const isCollecting = ref(false);
const roomDeckCount = ref(1);
const roomShuffleMode = ref(false);
const turnTimeLimit = ref(20000);
const turnTimeLeft = ref(0);
let turnCountdown = null;

const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ── Computed ──
const isMyTurn = computed(() => currentTurn.value === playerIndex.value);

const cardsPerRow = computed(() => {
  // Access myHand.value.length to re-trigger when hand changes
  void myHand.value.length;
  const slotW = window.innerWidth <= 700 ? 24 : 30;
  const containerW = window.innerWidth <= 700
    ? window.innerWidth - 52
    : Math.min(868, window.innerWidth - 72);
  return Math.max(1, Math.floor(containerW / slotW));
});

const handRows = computed(() => {
  const n = cardsPerRow.value;
  const rows = [];
  for (let i = 0; i < myHand.value.length; i += n) {
    rows.push(myHand.value.slice(i, i + n));
  }
  return rows;
});
const timerPercent = computed(() => turnTimeLimit.value > 0 ? (turnTimeLeft.value / (turnTimeLimit.value / 1000)) * 100 : 0);

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

// ── Card display helpers ──
function shortRank(card) {
  if (card.isJoker) return card.rank === 'BIG' ? '大' : '小';
  return card.rank;
}

function suitSymbol(card) {
  if (card.isJoker) return card.rank === 'BIG' ? '\u2605' : '\u2606';
  const map = { spade: '\u2660', heart: '\u2665', diamond: '\u2666', club: '\u2663' };
  return map[card.suit] || '';
}

function displayRank(card) {
  if (card.isJoker) return card.rank === 'BIG' ? '大王' : '小王';
  return card.rank;
}

function cardColorClass(card) {
  if (card.isJoker) return card.rank === 'BIG' ? 'pc-red' : 'pc-black';
  if (card.suit === 'heart' || card.suit === 'diamond') return 'pc-red';
  return 'pc-black';
}

// ── Fan layout ──
function fanStyle(idx) {
  const s = { zIndex: idx + 1 };
  if (isDealing.value) s.animationDelay = idx * 0.06 + 's';
  return s;
}

function toggleCard(card) {
  if (selectedCards.has(card.id)) {
    selectedCards.delete(card.id);
  } else {
    selectedCards.add(card.id);
  }
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

function playCards() {
  if (selectedCards.size === 0) return;
  const cardIds = [...selectedCards];
  send({
    type: 'play_cards',
    cardIds,
    declaredRank: forcedRank.value || declareRank.value,
    declaredCount: cardIds.length,
  });
  selectedCards.clear();
}

function challenge() { send({ type: 'challenge' }); }
function pass() { send({ type: 'pass' }); }

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
      roomDeckCount.value = msg.deckCount || 1;
      roomShuffleMode.value = !!msg.shuffleMode;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      break;

    case 'spectate_joined':
      gameState.value = msg.state;
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || 6;
      roomDeckCount.value = msg.deckCount || 1;
      roomShuffleMode.value = !!msg.shuffleMode;
      if (msg.turnTimeLimit) turnTimeLimit.value = msg.turnTimeLimit;
      currentTurn.value = msg.currentTurn;
      pileCount.value = msg.pileCount || 0;
      roundNumber.value = msg.roundNumber || 0;
      spectatorCount.value = msg.spectatorCount;
      winners.value = msg.winners || [];
      if (msg.lastPlay) lastPlayInfo.value = msg.lastPlay;
      break;

    case 'player_joined': break;

    case 'player_list':
      playerList.value = msg.players || [];
      maxPlayersDisplay.value = msg.maxPlayers || maxPlayersDisplay.value;
      break;

    case 'state_change':
      gameState.value = msg.state;
      break;

    case 'hand_update':
      if (myHand.value.length === 0 && msg.hand.length > 0) {
        isDealing.value = true;
        setTimeout(() => { isDealing.value = false; }, 400 + msg.hand.length * 60);
      }
      myHand.value = msg.hand;
      break;

    case 'turn_start':
      currentTurn.value = msg.playerIndex;
      canChallenge.value = !!msg.canChallenge;
      canPass.value = !!msg.canPass;
      canPlayCards.value = true;
      roundNumber.value = msg.roundNumber || roundNumber.value;
      pileCount.value = msg.pileCount || pileCount.value;
      if (msg.declaredRank) {
        forcedRank.value = msg.declaredRank;
        declareRank.value = msg.declaredRank;
      } else {
        forcedRank.value = null;
      }
      if (msg.timeLimit) {
        turnTimeLimit.value = msg.timeLimit;
        startTurnTimer(msg.timeLimit);
      }
      break;

    case 'cards_played':
      lastPlayInfo.value = {
        playerIndex: msg.playerIndex,
        playerName: msg.playerName,
        declaredRank: msg.declaredRank,
        declaredCount: msg.declaredCount,
      };
      pileCount.value = msg.pileCount;
      break;

    case 'challenge_result':
      challengeResult.value = msg;
      currentTurn.value = -1;
      setTimeout(() => { challengeResult.value = null; }, 4500);
      break;

    case 'player_passed':
      passNotify.value = msg.isTimeout ? `${msg.playerName} 超时自动跳过` : `${msg.playerName} 跳过`;
      setTimeout(() => { passNotify.value = ''; }, 2500);
      break;

    case 'player_won':
      winners.value.push({ playerIndex: msg.playerIndex, playerName: msg.playerName, rank: msg.rank });
      winNotify.value = `${msg.playerName} 出完了！排名第${msg.rank}`;
      setTimeout(() => { winNotify.value = ''; }, 2500);
      break;

    case 'new_round':
      lastPlayInfo.value = null;
      if (pileCount.value > 0) {
        isCollecting.value = true;
        setTimeout(() => { isCollecting.value = false; pileCount.value = 0; }, 600);
      } else {
        pileCount.value = 0;
      }
      roundNumber.value = msg.roundNumber;
      break;

    case 'player_disconnected':
      showError(`${msg.playerName} 已断开连接`);
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

    case 'player_kicked':
      break;

    case 'spectator_count':
      spectatorCount.value = msg.count;
      break;

    case 'room_left': break;

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
  if (turnCountdown) { clearInterval(turnCountdown); turnCountdown = null; }
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
.header-left { display: flex; align-items: center; gap: 12px; }
.room-tag {
  font-size: 0.85rem; color: var(--text-muted);
  background: var(--card); padding: 4px 10px; border-radius: 4px;
}
.type-tag {
  font-size: 0.75rem; color: var(--primary-light);
  background: rgba(108,92,231,0.15); padding: 3px 8px;
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
}
.ps-item.active {
  border-color: var(--primary); background: rgba(108,92,231,0.12);
  animation: pulse 1.5s ease-in-out infinite;
}
.ps-item.me { box-shadow: 0 0 0 1px var(--accent); }
.ps-item.won { border-color: var(--success); opacity: 0.7; }
.ps-item.disconnected { opacity: 0.3; }
.ps-name {
  font-weight: 600; font-size: 0.82rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ps-cards { font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; }
.win-badge { color: var(--success); font-weight: 700; }

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
   PILE AREA
   ═══════════════════════════════════════════════ */
.pile-area {
  display: flex; align-items: center; justify-content: center;
  gap: 24px; padding: 24px;
  background: rgba(20,80,40,0.35);
  border: 2px solid rgba(40,120,60,0.3);
  border-radius: 16px; margin-bottom: 16px;
}
.pile-visual {
  position: relative; width: 72px; height: 100px;
}

/* ── Card back (牌背) ── */
.card-back {
  width: 72px; height: 100px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a3a8a, #2255cc);
  border: 2.5px solid #4477ee;
  box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  overflow: hidden;
  position: absolute; top: 0; left: 0;
}
.card-back-inner {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  padding: 6px;
}
.cb-pattern {
  width: 100%; height: 100%;
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 4px,
      rgba(255,255,255,0.06) 4px,
      rgba(255,255,255,0.06) 8px
    );
}
.pile-back-2 { top: -3px; left: 3px; z-index: -1; }
.pile-back-3 { top: -6px; left: 6px; z-index: -2; }

.pile-count-badge {
  position: absolute; bottom: -6px; right: -6px;
  background: var(--accent); color: #fff;
  font-size: 0.7rem; font-weight: 800;
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  z-index: 5; box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.pile-empty {
  width: 72px; height: 100px;
  border: 2px dashed rgba(255,255,255,0.15);
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.2); font-size: 0.85rem;
}

.pile-info { max-width: 200px; }
.last-play-info { font-size: 0.9rem; color: var(--text); line-height: 1.6; }
.lp-name { font-weight: 700; color: var(--primary-light); }
.lp-text { color: var(--text-muted); }
.lp-rank { font-weight: 700; color: var(--warning); font-size: 1.05rem; }

/* ═══════════════════════════════════════════════
   POKER CARD (拟真扑克牌)
   ═══════════════════════════════════════════════ */
.poker-card {
  width: 68px; height: 96px;
  background: linear-gradient(165deg, #ffffff 0%, #f0f0f0 100%);
  border: 1.5px solid #c0c0c0;
  border-radius: 8px;
  position: relative;
  box-shadow:
    0 1px 3px rgba(0,0,0,0.15),
    inset 0 1px 0 rgba(255,255,255,0.8);
  user-select: none;
  overflow: hidden;
}
.poker-card::before {
  content: '';
  position: absolute; inset: 3px;
  border: 1px solid rgba(0,0,0,0.04);
  border-radius: 5px;
  pointer-events: none;
}

/* Corner rank+suit */
.pc-corner {
  position: absolute;
  display: flex; flex-direction: column;
  align-items: center; line-height: 1;
}
.pc-tl { top: 4px; left: 5px; }
.pc-br { bottom: 4px; right: 5px; transform: rotate(180deg); }
.pc-rank { font-size: 0.85rem; font-weight: 800; }
.pc-suit { font-size: 0.7rem; margin-top: -1px; }

/* Center */
.pc-center {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
.center-suit { font-size: 1.8rem; }

/* Colors */
.pc-red .pc-rank, .pc-red .pc-suit, .pc-red .center-suit,
.pc-red .joker-star, .pc-red .joker-label { color: #cc1111; }
.pc-black .pc-rank, .pc-black .pc-suit, .pc-black .center-suit,
.pc-black .joker-star, .pc-black .joker-label { color: #1a1a1a; }

/* Joker special */
.poker-card.is-joker {
  background: linear-gradient(165deg, #fffef5 0%, #f5f0e0 100%);
}
.joker-star { font-size: 1.6rem; display: block; }
.joker-label {
  font-size: 0.5rem; font-weight: 800;
  letter-spacing: 0.5px; margin-top: 0px;
}

/* ═══════════════════════════════════════════════
   HAND FAN (手牌扇形叠放)
   ═══════════════════════════════════════════════ */
.my-hand-area {
  background: var(--surface);
  border-radius: var(--radius); padding: 16px;
}
.section-title {
  font-size: 0.9rem; color: var(--primary-light);
  margin-bottom: 12px; font-weight: 600;
}
.sel-hint {
  color: var(--accent); font-size: 0.8rem;
}

.hand-fan {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 0 4px;
}

.hand-row {
  display: flex;
  justify-content: center;
  overflow: visible;
}

.poker-card-wrap {
  width: 30px;
  flex-shrink: 0;
  position: relative;
  cursor: pointer;
  transition: transform 0.15s ease, margin 0.15s ease;
}

/* Hover: push neighbors apart (no layout reflow — row is nowrap) */
.poker-card-wrap:hover {
  margin-left: 20px;
  margin-right: 20px;
  z-index: 999;
}

/* Selected: lift up */
.poker-card-wrap.selected {
  transform: translateY(-14px);
}
.poker-card-wrap.selected .poker-card {
  border-color: var(--accent);
  box-shadow:
    0 6px 18px rgba(253,121,168,0.35),
    0 0 0 2px var(--accent),
    inset 0 1px 0 rgba(255,255,255,0.8);
}

/* ── Deal animation ── */
@keyframes dealIn {
  0% { opacity: 0; transform: translateY(-100px) scale(0.3); }
  70% { opacity: 1; transform: translateY(4px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.poker-card-wrap.dealing {
  animation: dealIn 0.4s ease-out both;
}

/* ── Pile collect animation ── */
@keyframes collectPile {
  0% { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.3) translateY(-50px); opacity: 0; }
}
.pile-visual.collecting .pile-back {
  animation: collectPile 0.5s ease-in both;
}
.pile-visual.collecting .pile-back-2 { animation-delay: 0.06s; }
.pile-visual.collecting .pile-back-3 { animation-delay: 0.12s; }

/* ═══════════════════════════════════════════════
   ACTION AREA
   ═══════════════════════════════════════════════ */
.action-area {
  display: flex; flex-direction: column;
  gap: 10px; align-items: center;
}
.play-action {
  display: flex; align-items: center; gap: 12px;
  flex-wrap: wrap; justify-content: center;
}
.rank-selector { display: flex; align-items: center; gap: 6px; }
.rank-selector label {
  font-size: 0.82rem; color: var(--text-muted); white-space: nowrap;
}
.rank-selector select {
  background: var(--card); color: var(--text);
  border: 1px solid var(--border); border-radius: 4px;
  padding: 4px 8px; font-size: 0.9rem;
}
.secondary-actions { display: flex; gap: 10px; }

/* ═══════════════════════════════════════════════
   CHALLENGE OVERLAY
   ═══════════════════════════════════════════════ */
.challenge-overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
  animation: overlayIn 0.3s ease-out;
}
@keyframes overlayIn { from { opacity: 0; } to { opacity: 1; } }

.challenge-card {
  background: linear-gradient(145deg, var(--card) 0%, var(--surface) 100%);
  border: 1.5px solid var(--border); border-radius: 16px;
  padding: 28px 32px; text-align: center;
  max-width: 420px; width: 90%;
  animation: popUp 0.4s cubic-bezier(0.17,0.67,0.29,1.3) both;
}
@keyframes popUp {
  0% { transform: scale(0.3) translateY(40px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
.challenge-card h3 { font-size: 1.4rem; margin-bottom: 8px; }
.cr-who { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px; }
.cr-declare {
  font-size: 0.95rem; color: var(--warning);
  font-weight: 600; margin-bottom: 16px;
}

/* Challenge revealed cards */
.cr-cards {
  display: flex; justify-content: center;
  gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
}
.cr-poker {
  width: 60px; height: 84px;
  animation: flipReveal 0.5s ease-out both;
}
.cr-poker .pc-rank { font-size: 0.8rem; }
.cr-poker .pc-suit { font-size: 0.65rem; }
.cr-poker .center-suit { font-size: 1.5rem; }
.cr-poker .joker-star { font-size: 1.3rem; }
.cr-poker.cr-bluff {
  border: 2.5px solid var(--danger) !important;
  box-shadow: 0 0 12px rgba(225,112,85,0.4);
}
@keyframes flipReveal {
  0% { transform: perspective(600px) rotateY(180deg) scale(0.8); opacity: 0; }
  60% { transform: perspective(600px) rotateY(-10deg) scale(1.02); opacity: 1; }
  100% { transform: perspective(600px) rotateY(0) scale(1); opacity: 1; }
}
.cr-result { font-weight: 700; font-size: 1.05rem; margin-top: 4px; }

/* Pile cards section */
.cr-pile-section {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--border);
}
.cr-pile-label {
  font-size: 0.8rem; color: var(--text-muted);
  margin-bottom: 8px; font-weight: 600;
}
.cr-pile-cards {
  display: flex; justify-content: center;
  gap: 4px; flex-wrap: wrap; max-height: 140px; overflow-y: auto;
}
.cr-pile-poker {
  width: 40px; height: 56px; font-size: 0.7rem;
  animation: flipReveal 0.4s ease-out both;
}
.cr-pile-poker .pc-rank { font-size: 0.6rem; }
.cr-pile-poker .pc-suit { font-size: 0.5rem; }
.cr-pile-poker .center-suit { font-size: 1rem; }
.cr-pile-poker .joker-star { font-size: 0.9rem; }
.cr-pile-poker .pc-br { display: none; }

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
.rank-item.last {
  border-left-color: var(--danger); background: rgba(225,112,85,0.08);
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
.toast-success {
  position: fixed; bottom: 70px; left: 50%;
  transform: translateX(-50%); background: var(--success);
  color: #fff; padding: 8px 20px; border-radius: var(--radius);
  font-size: 0.85rem; z-index: 99; animation: fadeIn 0.3s ease-out;
}

/* ═══════════════════════════════════════════════
   MOBILE
   ═══════════════════════════════════════════════ */
.game-page { overflow-x: hidden; max-width: 100vw; }

@media (max-width: 700px) {
  .game-header { flex-wrap: wrap; gap: 6px; padding: 8px 10px; }
  .game-main { padding: 10px; }

  /* Smaller cards on mobile */
  .poker-card { width: 52px; height: 74px; }
  .poker-card-wrap { width: 24px; }
  .poker-card-wrap:hover { margin-left: 14px; margin-right: 14px; }
  .poker-card-wrap.selected { transform: translateY(-12px); }
  .pc-rank { font-size: 0.72rem; }
  .pc-suit { font-size: 0.58rem; }
  .center-suit { font-size: 1.3rem; }
  .joker-star { font-size: 1.2rem; }
  .joker-label { font-size: 0.4rem; }
  .pc-tl { top: 3px; left: 3px; }
  .pc-br { bottom: 3px; right: 3px; }

  .pile-area { padding: 16px; gap: 14px; }
  .card-back, .pile-empty { width: 56px; height: 80px; }
  .pile-visual { width: 56px; height: 80px; }

  .cr-poker { width: 48px; height: 68px; }
  .cr-poker .pc-rank { font-size: 0.7rem; }
  .cr-poker .center-suit { font-size: 1.1rem; }

  .player-strip { gap: 6px; }
  .ps-item { min-width: 64px; padding: 8px 10px; }
  .ps-name { font-size: 0.75rem; }
  .state-panel { margin: 30px auto; }
  .spec-tag { display: none; }
}
</style>
