<template>
  <div class="home">
    <div class="home-card card">
      <h1 class="title">SebGames</h1>
      <p class="subtitle">多人在线游戏平台</p>

      <div class="form-group mt-3">
        <label>你的昵称</label>
        <input
          v-model="playerName"
          class="input"
          placeholder="输入昵称"
          maxlength="10"
        />
      </div>

      <!-- Game type selector -->
      <div class="game-selector mt-3">
        <label>选择游戏</label>
        <div class="game-cards">
          <div
            class="game-card"
            :class="{ selected: selectedGame === 'number-mine' }"
            @click="selectedGame = 'number-mine'"
          >
            <div class="game-card-icon">&#128163;</div>
            <div class="game-card-name">数字排雷</div>
            <div class="game-card-desc">2人猜数对战</div>
          </div>
          <div
            class="game-card"
            :class="{ selected: selectedGame === 'bluff-card' }"
            @click="selectedGame = 'bluff-card'"
          >
            <div class="game-card-icon">&#127183;</div>
            <div class="game-card-name">唬牌</div>
            <div class="game-card-desc">2-6人吹牛牌</div>
          </div>
          <div
            class="game-card"
            :class="{ selected: selectedGame === 'bottle-cap' }"
            @click="selectedGame = 'bottle-cap'"
          >
            <div class="game-card-icon">&#127866;</div>
            <div class="game-card-name">猜瓶盖</div>
            <div class="game-card-desc">2-6人猜数游戏</div>
          </div>
          <div
            class="game-card"
            :class="{ selected: selectedGame === 'halli-galli' }"
            @click="selectedGame = 'halli-galli'"
          >
            <div class="game-card-icon">&#128276;</div>
            <div class="game-card-name">德国心脏病</div>
            <div class="game-card-desc">2-6人抢铃游戏</div>
          </div>
        </div>
      </div>

      <!-- Per-game config -->
      <div v-if="selectedGame === 'number-mine'" class="game-config mt-2">
        <label>回合限时: {{ nmTurnTime }}秒</label>
        <input type="range" class="slider" v-model.number="nmTurnTime" min="15" max="60" step="5" />
      </div>
      <div v-if="selectedGame === 'bluff-card'" class="game-config mt-2">
        <label>牌组数量: {{ bcDeckCount }}副</label>
        <input type="range" class="slider" v-model.number="bcDeckCount" min="1" max="4" step="1" />
        <label class="mt-1">回合限时: {{ bcTurnTime }}秒</label>
        <input type="range" class="slider" v-model.number="bcTurnTime" min="15" max="30" step="5" />
        <label class="mt-1 checkbox-row">
          <input type="checkbox" v-model="bcShuffleMode" class="checkbox" />
          <span>乱序模式 <small class="text-muted">(多抽1副牌随机丢弃,防算牌)</small></span>
        </label>
      </div>
      <div v-if="selectedGame === 'bottle-cap'" class="game-config mt-2">
        <label>回合限时: {{ bcapTurnTime }}秒</label>
        <input type="range" class="slider" v-model.number="bcapTurnTime" min="6" max="30" step="2" />
      </div>
      <div v-if="selectedGame === 'halli-galli'" class="game-config mt-2">
        <label>翻牌限时: {{ hgTurnTime }}秒</label>
        <input type="range" class="slider" v-model.number="hgTurnTime" min="3" max="10" step="1" />
      </div>

      <div class="form-group mt-2">
        <label>房间号 (1000-9999)</label>
        <input
          v-model="roomId"
          class="input input-lg"
          placeholder="1234"
          maxlength="4"
          @keyup.enter="joinRoom"
        />
      </div>

      <div class="actions mt-3">
        <button class="btn btn-primary btn-lg" :disabled="!canJoin" @click="joinRoom">
          加入房间
        </button>
        <button class="btn btn-outline" :disabled="!hasName || creating" @click="createRoom">
          {{ creating ? '创建中...' : '创建房间' }}
        </button>
      </div>

      <p v-if="error" class="error mt-2">
        {{ error }}
        <button v-if="canSpectateRoom" class="btn btn-sm btn-accent ml-1" @click="goSpectate(spectateRoomId, spectateGameType)">
          观战
        </button>
      </p>

      <!-- Room list -->
      <div class="room-list mt-3">
        <div class="room-list-header">
          <h3>房间列表</h3>
          <button class="btn btn-outline btn-sm" @click="fetchRooms" :disabled="roomsLoading">
            {{ roomsLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>

        <div v-if="roomsLoading && roomList.length === 0" class="text-center text-muted" style="padding:16px 0">
          加载中...
        </div>
        <div v-else-if="roomList.length === 0" class="text-center text-muted" style="padding:16px 0">
          暂无房间
        </div>
        <div v-else class="rooms">
          <!-- Waiting rooms (can join) -->
          <div
            v-for="r in waitingRooms"
            :key="r.roomId"
            class="room-item room-waiting"
          >
            <div class="room-info">
              <div class="room-info-top">
                <span class="room-id">{{ r.roomId }}</span>
                <span class="game-badge" :class="'badge-' + r.gameType">{{ gameLabel(r.gameType) }}</span>
              </div>
              <span class="room-players">{{ r.players.filter(p=>p).map(p=>p.name).join('') }} 等待中</span>
            </div>
            <button class="btn btn-primary btn-sm" @click="joinSpecificRoom(r.roomId, r.gameType)">加入</button>
          </div>
          <!-- Active games (can spectate) -->
          <div
            v-for="r in activeRooms"
            :key="r.roomId"
            class="room-item room-active"
          >
            <div class="room-info">
              <div class="room-info-top">
                <span class="room-id">{{ r.roomId }}</span>
                <span class="game-badge" :class="'badge-' + r.gameType">{{ gameLabel(r.gameType) }}</span>
              </div>
              <span class="room-players">
                {{ r.players.filter(p=>p).map(p=>p.name).join(' vs ') }}
              </span>
              <span class="room-meta">
                <template v-if="r.gameType === 'number-mine'">第{{ r.roundNumber }}回合</template>
                <template v-else>游戏中</template>
                <span v-if="r.spectatorCount" class="spec-count">{{ r.spectatorCount }}人观战</span>
              </span>
            </div>
            <button class="btn btn-accent btn-sm" @click="goSpectate(r.roomId, r.gameType)">观战</button>
          </div>
        </div>
      </div>

      <!-- Rules -->
      <div class="rules mt-3">
        <h3>{{ selectedGame === 'number-mine' ? '数字排雷规则' : selectedGame === 'bluff-card' ? '唬牌规则' : selectedGame === 'bottle-cap' ? '猜瓶盖规则' : '德国心脏病规则' }}</h3>
        <ul v-if="selectedGame === 'number-mine'">
          <li>两位玩家各自设定一个 4 位数 (1000-9999)</li>
          <li>掷骰子决定先手，点数大者先猜</li>
          <li>回合制轮流猜对方的数字</li>
          <li>每回合限时可自定义 (15-60秒)</li>
          <li>只有数字和位数都对才算正确</li>
          <li>先猜中全部 4 位的玩家获胜</li>
        </ul>
        <ul v-else-if="selectedGame === 'bluff-card'">
          <li>2-6 名玩家，使用 1-4 副扑克牌（含大小王）</li>
          <li>房主可在 2-6 人时随时开始游戏</li>
          <li>发牌后逆时针轮流出牌，每回合限时 15-30 秒</li>
          <li>出牌时声明牌的点数和张数，牌面朝下</li>
          <li>跟牌时必须声明与上家相同的点数</li>
          <li>可以选择质疑上家：如果上家有任何一张不是声明的点数（王除外），质疑成功</li>
          <li>质疑失败者或被揭穿者收走牌堆所有牌</li>
          <li>乱序模式：从多 1 副牌中随机抽取，防止算牌</li>
          <li>最先出完手牌者获胜，最后剩牌者失败</li>
        </ul>
        <ul v-else-if="selectedGame === 'bottle-cap'">
          <li>2-6 名玩家，掷骰子决定第一个庄家</li>
          <li>庄家在手中藏入 0 到 n-1 个瓶盖（n=玩家数）</li>
          <li>其他玩家逆时针依次猜庄家手中的瓶盖数</li>
          <li>每个数字只能被猜一次，不能重复</li>
          <li>猜中者输，成为下一轮庄家</li>
          <li>如果没人猜中，庄家输，继续当庄</li>
          <li>超时未操作将自动随机选择</li>
        </ul>
        <ul v-else>
          <li>2-6 名玩家，使用 56 张水果牌（香蕉、草莓、柠檬、葡萄）</li>
          <li>每张牌显示 1-5 个同种水果</li>
          <li>轮流从自己的牌堆翻一张牌到弃牌堆（面朝上）</li>
          <li>所有玩家面前的顶牌同时可见</li>
          <li>当场上所有顶牌中恰好有 5 个同种水果时，抢按铃！</li>
          <li>抢铃成功：赢得所有玩家弃牌堆的牌</li>
          <li>抢铃失败（没有恰好 5 个）：每位其他玩家获得你 1 张牌作为惩罚</li>
          <li>牌用完的玩家被淘汰，最后留下的玩家获胜</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const playerName = ref('');
const roomId = ref('');
const error = ref('');
const canSpectateRoom = ref(false);
const spectateRoomId = ref('');
const spectateGameType = ref('number-mine');

// Game selection
const selectedGame = ref('number-mine');

// Number mine config
const nmTurnTime = ref(30);

// Bluff card config
const bcDeckCount = ref(1);
const bcTurnTime = ref(20);
const bcShuffleMode = ref(false);

// Bottle cap config
const bcapTurnTime = ref(12);

// Halli Galli config
const hgTurnTime = ref(5);

// Room list
const roomList = ref([]);
const roomsLoading = ref(false);
let refreshTimer = null;

const GAME_ROUTE_MAP = {
  'number-mine': { play: 'NumberMine', spectate: 'SpectateNumberMine' },
  'bluff-card': { play: 'BluffCard', spectate: 'SpectateBluffCard' },
  'bottle-cap': { play: 'BottleCap', spectate: 'SpectateBottleCap' },
  'halli-galli': { play: 'HalliGalli', spectate: 'SpectateHalliGalli' },
};

function gameLabel(type) {
  if (type === 'number-mine') return '数字排雷';
  if (type === 'bluff-card') return '唬牌';
  if (type === 'bottle-cap') return '猜瓶盖';
  if (type === 'halli-galli') return '德国心脏病';
  return type;
}

const waitingRooms = computed(() =>
  roomList.value.filter((r) => r.state === 'WAITING' && r.playerCount < r.maxPlayers)
);

const activeRooms = computed(() =>
  roomList.value.filter(
    (r) => r.state === 'PLAYING' || r.state === 'ROLLING' || r.state === 'SETUP' ||
           r.state === 'HIDING' || r.state === 'GUESSING' || r.state === 'ROUND_RESULT'
  )
);

const creating = ref(false);

const hasName = computed(() => playerName.value.trim().length > 0);

const canJoin = computed(() => {
  const id = parseInt(roomId.value, 10);
  return hasName.value && id >= 1000 && id <= 9999;
});

function getConfig() {
  if (selectedGame.value === 'number-mine') {
    return { turnTime: nmTurnTime.value };
  }
  if (selectedGame.value === 'bluff-card') {
    return { deckCount: bcDeckCount.value, turnTime: bcTurnTime.value, shuffleMode: bcShuffleMode.value };
  }
  if (selectedGame.value === 'bottle-cap') {
    return { turnTime: bcapTurnTime.value };
  }
  if (selectedGame.value === 'halli-galli') {
    return { turnTime: hgTurnTime.value };
  }
  return {};
}

async function createRoom() {
  if (!hasName.value) return;
  error.value = '';
  creating.value = true;
  try {
    const res = await fetch('/api/create-room', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameType: selectedGame.value, config: getConfig() }),
    });
    const data = await res.json();
    if (data.roomId) {
      saveAndGo(data.roomId, data.gameType || selectedGame.value);
    } else {
      error.value = data.error || '创建失败';
    }
  } catch {
    error.value = '服务器连接失败';
  }
  creating.value = false;
}

async function fetchRooms() {
  roomsLoading.value = true;
  try {
    const res = await fetch('/api/rooms');
    roomList.value = await res.json();
  } catch {
    // ignore
  }
  roomsLoading.value = false;
}

function joinSpecificRoom(id, gameType) {
  if (!playerName.value.trim()) {
    error.value = '请先输入昵称';
    canSpectateRoom.value = false;
    return;
  }
  roomId.value = String(id);
  // Use the room's game type for routing
  joinRoomWithType(id, gameType);
}

async function joinRoom() {
  if (!canJoin.value) return;
  error.value = '';
  canSpectateRoom.value = false;

  try {
    const res = await fetch(`/api/room/${roomId.value}`);
    const data = await res.json();
    if (data.exists && data.players >= (data.maxPlayers || 2)) {
      error.value = '房间已满';
      canSpectateRoom.value = true;
      spectateRoomId.value = roomId.value;
      spectateGameType.value = data.gameType || 'number-mine';
      return;
    }
    if (data.exists && data.state !== 'WAITING') {
      error.value = '该房间游戏已开始';
      canSpectateRoom.value = true;
      spectateRoomId.value = roomId.value;
      spectateGameType.value = data.gameType || 'number-mine';
      return;
    }
    // Route based on existing room's gameType, or selected game for new rooms
    const gameType = data.exists ? (data.gameType || 'number-mine') : selectedGame.value;
    saveAndGo(roomId.value, gameType);
  } catch {
    // Server might be down, proceed with selected game type
    saveAndGo(roomId.value, selectedGame.value);
  }
}

function joinRoomWithType(id, gameType) {
  const name = playerName.value.trim();
  sessionStorage.setItem('playerName', name);
  localStorage.setItem('playerName', name);
  const routes = GAME_ROUTE_MAP[gameType] || GAME_ROUTE_MAP['number-mine'];
  router.push({ name: routes.play, params: { roomId: String(id) } });
}

function saveAndGo(id, gameType) {
  const name = playerName.value.trim();
  sessionStorage.setItem('playerName', name);
  localStorage.setItem('playerName', name);
  const routes = GAME_ROUTE_MAP[gameType] || GAME_ROUTE_MAP['number-mine'];
  router.push({ name: routes.play, params: { roomId: String(id) } });
}

function goSpectate(id, gameType) {
  const gt = gameType || 'number-mine';
  const routes = GAME_ROUTE_MAP[gt] || GAME_ROUTE_MAP['number-mine'];
  router.push({ name: routes.spectate, params: { roomId: String(id) } });
}

onMounted(() => {
  const saved = localStorage.getItem('playerName');
  if (saved) playerName.value = saved;
  fetchRooms();
  refreshTimer = setInterval(fetchRooms, 5000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped>
.home {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.home-card {
  max-width: 500px;
  width: 100%;
  animation: fadeIn 0.5s ease-out;
}

.title {
  font-size: 2rem;
  background: linear-gradient(135deg, var(--primary-light), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: var(--text-muted);
  font-size: 0.95rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 500;
}

.form-group .input {
  width: 100%;
}

/* ── Game selector ── */
.game-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.game-selector label {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-weight: 500;
}

.game-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.game-card {
  padding: 14px 10px;
  background: var(--surface);
  border: 2px solid var(--border);
  border-radius: var(--radius);
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.game-card:hover {
  border-color: var(--primary);
}

.game-card.selected {
  border-color: var(--primary);
  background: rgba(108, 92, 231, 0.1);
  box-shadow: 0 0 0 1px var(--primary);
}

.game-card-icon {
  font-size: 1.8rem;
  margin-bottom: 4px;
}

.game-card-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}

.game-card-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* ── Game config ── */
.game-config {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
}

.game-config label {
  font-size: 0.82rem;
  color: var(--text-muted);
  font-weight: 500;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
  cursor: pointer;
}

.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border);
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  border: 2px solid var(--primary-light);
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--primary);
  cursor: pointer;
  border: 2px solid var(--primary-light);
}

.actions {
  display: flex;
  gap: 12px;
}

.actions .btn-lg {
  flex: 1;
}

.error {
  color: var(--danger);
  font-size: 0.9rem;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ml-1 {
  margin-left: 4px;
}

/* ── Room list ── */
.room-list {
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.room-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.room-list-header h3 {
  font-size: 0.95rem;
  color: var(--primary-light);
}

.rooms {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
}

.room-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface);
  border-radius: var(--radius-sm);
  border-left: 3px solid transparent;
}

.room-waiting {
  border-left-color: var(--warning);
}

.room-active {
  border-left-color: var(--success);
}

.room-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.room-info-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-id {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}

.game-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.badge-number-mine {
  background: rgba(225, 112, 85, 0.2);
  color: var(--danger);
}

.badge-bluff-card {
  background: rgba(108, 92, 231, 0.2);
  color: var(--primary-light);
}

.badge-bottle-cap {
  background: rgba(212, 165, 60, 0.2);
  color: #d4a53c;
}

.badge-halli-galli {
  background: rgba(225, 112, 85, 0.2);
  color: #e17055;
}

.room-players {
  font-size: 0.82rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.room-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.spec-count {
  margin-left: 6px;
  color: var(--accent);
}

.rules {
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.rules h3 {
  font-size: 0.95rem;
  margin-bottom: 8px;
  color: var(--primary-light);
}

.rules ul {
  padding-left: 18px;
  font-size: 0.85rem;
  color: var(--text-muted);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
