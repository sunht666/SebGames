<template>
  <div class="home">
    <div class="home-card card">
      <h1 class="title">数字扫雷</h1>
      <p class="subtitle">双人数字猜谜对战游戏</p>

      <div class="form-group mt-3">
        <label>你的昵称</label>
        <input
          v-model="playerName"
          class="input"
          placeholder="输入昵称"
          maxlength="10"
        />
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
        <button class="btn btn-outline" @click="randomRoom">
          随机房间号
        </button>
      </div>

      <p v-if="error" class="error mt-2">
        {{ error }}
        <button v-if="canSpectateRoom" class="btn btn-sm btn-accent ml-1" @click="goSpectate(roomId)">
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
              <span class="room-id">{{ r.roomId }}</span>
              <span class="room-players">{{ r.players.filter(p=>p).map(p=>p.name).join('') }} 等待中</span>
            </div>
            <button class="btn btn-primary btn-sm" @click="joinSpecificRoom(r.roomId)">加入</button>
          </div>
          <!-- Active games (can spectate) -->
          <div
            v-for="r in activeRooms"
            :key="r.roomId"
            class="room-item room-active"
          >
            <div class="room-info">
              <span class="room-id">{{ r.roomId }}</span>
              <span class="room-players">
                {{ r.players.filter(p=>p).map(p=>p.name).join(' vs ') }}
              </span>
              <span class="room-meta">
                第{{ r.roundNumber }}回合
                <span v-if="r.spectatorCount" class="spec-count">{{ r.spectatorCount }}人观战</span>
              </span>
            </div>
            <button class="btn btn-accent btn-sm" @click="goSpectate(r.roomId)">观战</button>
          </div>
        </div>
      </div>

      <div class="rules mt-3">
        <h3>游戏规则</h3>
        <ul>
          <li>两位玩家各自设定一个 4 位数 (1000-9999)</li>
          <li>掷骰子决定先手，点数大者先猜</li>
          <li>回合制轮流猜对方的数字</li>
          <li>每回合限时 30 秒，超时跳过</li>
          <li>只有数字和位数都对才算正确</li>
          <li>先猜中全部 4 位的玩家获胜</li>
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

// Room list
const roomList = ref([]);
const roomsLoading = ref(false);
let refreshTimer = null;

const waitingRooms = computed(() =>
  roomList.value.filter((r) => r.state === 'WAITING' && r.playerCount === 1)
);

const activeRooms = computed(() =>
  roomList.value.filter(
    (r) => r.state === 'PLAYING' || r.state === 'ROLLING' || r.state === 'SETUP'
  )
);

const canJoin = computed(() => {
  const id = parseInt(roomId.value, 10);
  return playerName.value.trim().length > 0 && id >= 1000 && id <= 9999;
});

function randomRoom() {
  roomId.value = String(Math.floor(Math.random() * 9000) + 1000);
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

function joinSpecificRoom(id) {
  if (!playerName.value.trim()) {
    error.value = '请先输入昵称';
    canSpectateRoom.value = false;
    return;
  }
  roomId.value = String(id);
  joinRoom();
}

async function joinRoom() {
  if (!canJoin.value) return;
  error.value = '';
  canSpectateRoom.value = false;

  try {
    const res = await fetch(`/api/room/${roomId.value}`);
    const data = await res.json();
    if (data.exists && data.players >= 2) {
      error.value = '房间已满';
      canSpectateRoom.value = true;
      return;
    }
    if (data.exists && data.state !== 'WAITING') {
      error.value = '该房间游戏已开始';
      canSpectateRoom.value = true;
      return;
    }
  } catch {
    // Server might be down, proceed anyway — WS will fail gracefully
  }

  // Store name in sessionStorage for use in Game view
  sessionStorage.setItem('playerName', playerName.value.trim());
  router.push({ name: 'Game', params: { roomId: roomId.value } });
}

function goSpectate(id) {
  router.push({ name: 'Spectate', params: { roomId: String(id) } });
}

onMounted(() => {
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
  max-width: 460px;
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

.room-id {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
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
