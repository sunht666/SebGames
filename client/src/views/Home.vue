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

      <p v-if="error" class="error mt-2">{{ error }}</p>

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
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const playerName = ref('');
const roomId = ref('');
const error = ref('');

const canJoin = computed(() => {
  const id = parseInt(roomId.value, 10);
  return playerName.value.trim().length > 0 && id >= 1000 && id <= 9999;
});

function randomRoom() {
  roomId.value = String(Math.floor(Math.random() * 9000) + 1000);
}

async function joinRoom() {
  if (!canJoin.value) return;
  error.value = '';

  try {
    const res = await fetch(`/api/room/${roomId.value}`);
    const data = await res.json();
    if (data.exists && data.players >= 2) {
      error.value = '房间已满，请换一个房间号';
      return;
    }
    if (data.exists && data.state !== 'WAITING') {
      error.value = '该房间游戏已开始，请换一个房间号';
      return;
    }
  } catch {
    // Server might be down, proceed anyway — WS will fail gracefully
  }

  // Store name in sessionStorage for use in Game view
  sessionStorage.setItem('playerName', playerName.value.trim());
  router.push({ name: 'Game', params: { roomId: roomId.value } });
}
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
