<template>
  <div class="player-bar">
    <div
      v-for="(p, i) in players"
      :key="i"
      class="pb-item"
      :class="{ 'pb-me': i === myIndex }"
      @click.stop="onAvatarClick(i)"
    >
      <div class="pb-avatar-wrap">
        <div class="pb-avatar">
          <svg viewBox="0 0 40 40" class="pb-face">
            <circle cx="20" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>
            <path d="M8 36 Q8 24 20 24 Q32 24 32 36" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.25"/>
          </svg>
        </div>
        <div v-if="emojiState[i]" :key="emojiState[i].key" class="pb-emoji">
          {{ emojiState[i].emoji }}
        </div>
      </div>
      <div class="pb-name">{{ p?.name || '离线' }}</div>
      <div v-if="pickerOpen && i === myIndex" class="pb-picker" @click.stop>
        <span
          v-for="e in emojiList"
          :key="e"
          class="pb-pick-item"
          @click.stop="selectEmoji(e)"
        >{{ e }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';

const props = defineProps({
  players: { type: Array, required: true },
  myIndex: { type: Number, default: -1 },
});

const emit = defineEmits(['send-emoji']);

const emojiList = ['😀','😂','🥰','😎','😤','😭','🤔','👍'];
const pickerOpen = ref(false);
const emojiState = reactive({});
const emojiTimers = {};
let emojiKey = 0;

function onAvatarClick(i) {
  if (i !== props.myIndex || props.myIndex === -1) return;
  pickerOpen.value = !pickerOpen.value;
}

function selectEmoji(emoji) {
  pickerOpen.value = false;
  emit('send-emoji', emoji);
}

function showEmoji(playerIndex, emoji) {
  if (emojiTimers[playerIndex]) clearTimeout(emojiTimers[playerIndex]);
  emojiKey++;
  emojiState[playerIndex] = { emoji, key: emojiKey };
  emojiTimers[playerIndex] = setTimeout(() => {
    delete emojiState[playerIndex];
  }, 3500);
}

function closePicker() {
  pickerOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', closePicker);
});

onUnmounted(() => {
  document.removeEventListener('click', closePicker);
  for (const key in emojiTimers) clearTimeout(emojiTimers[key]);
});

defineExpose({ showEmoji });
</script>

<style scoped>
.player-bar {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 10px 0;
  margin-bottom: 12px;
  overflow: visible;
}

.pb-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;
  cursor: default;
  min-width: 56px;
}

.pb-item.pb-me {
  cursor: pointer;
}

.pb-avatar-wrap {
  position: relative;
}

.pb-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.2s;
}

.pb-me .pb-avatar {
  border-color: var(--accent);
}

.pb-face {
  width: 32px;
  height: 32px;
  color: var(--text-muted);
}

.pb-name {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  max-width: 64px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.pb-me .pb-name {
  color: var(--accent);
}

.pb-emoji {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 1.6rem;
  line-height: 1;
  pointer-events: none;
  z-index: 10;
  animation: emojiPop 0.35s ease-out;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.3));
}

@keyframes emojiPop {
  0% { transform: translateX(-50%) scale(1.8); opacity: 0.5; }
  100% { transform: translateX(-50%) scale(1); opacity: 1; }
}

.pb-picker {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 20;
  animation: pickerIn 0.15s ease-out;
}

@keyframes pickerIn {
  from { opacity: 0; transform: translateX(-50%) scale(0.9) translateY(-4px); }
  to { opacity: 1; transform: translateX(-50%) scale(1) translateY(0); }
}

.pb-pick-item {
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s, transform 0.1s;
}

.pb-pick-item:hover {
  background: var(--surface);
  transform: scale(1.15);
}

.pb-pick-item:active {
  transform: scale(0.95);
}

@media (max-width: 700px) {
  .player-bar { gap: 12px; padding: 8px 0; margin-bottom: 8px; }
  .pb-avatar { width: 40px; height: 40px; }
  .pb-face { width: 26px; height: 26px; }
  .pb-name { font-size: 0.65rem; max-width: 52px; }
  .pb-emoji { font-size: 1.3rem; }
  .pb-pick-item { font-size: 1.3rem; width: 34px; height: 34px; }
  .pb-picker { padding: 6px; gap: 2px; }
  .pb-item { min-width: 48px; }
}
</style>
