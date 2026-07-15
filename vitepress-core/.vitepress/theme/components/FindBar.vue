<!-- FindBar.vue: Ctrl+F 페이지 내 검색바 (Electron findInPage 기반) | 생성일: 2026-07-15 -->
<script setup>
import { ref, watch, onUnmounted } from 'vue'

const visible = ref(false)
const query = ref('')
const current = ref(0)
const total = ref(0)

let debounceTimer = null
let unsubResult = null

// find API: Electron 환경에서만 사용 가능
const find = typeof window !== 'undefined' && window.cdocs?.find

// 결과 구독
function subscribeResult() {
  if (!find || unsubResult) return
  unsubResult = find.onResult((r) => {
    current.value = r.activeMatchOrdinal ?? 0
    total.value = r.matches ?? 0
  })
}

function unsubscribeResult() {
  if (unsubResult) {
    unsubResult()
    unsubResult = null
  }
}

// 검색 실행 (debounce 150ms)
function triggerSearch(text) {
  if (!find) return
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    find.start(text, { forward: true, findNext: false })
  }, 150)
}

watch(query, (val) => {
  if (!visible.value) return
  if (!val) {
    clearTimeout(debounceTimer)
    find?.stop()
    current.value = 0
    total.value = 0
    return
  }
  triggerSearch(val)
})

function goNext() {
  if (!find || !query.value) return
  find.start(query.value, { forward: true, findNext: true })
}

function goPrev() {
  if (!find || !query.value) return
  find.start(query.value, { forward: false, findNext: true })
}

function close() {
  find?.stop()
  visible.value = false
  query.value = ''
  current.value = 0
  total.value = 0
  unsubscribeResult()
}

function onKeydown(e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) goPrev()
    else goNext()
  } else if (e.key === 'Escape') {
    close()
  }
}

// 외부에서 열기 (CustomLayout에서 호출)
function open() {
  visible.value = true
  subscribeResult()
}

// 검색바 input 요소에 포커스
const inputRef = ref(null)
watch(visible, (val) => {
  if (val) {
    // nextTick 없이도 v-if 이후 DOM이 존재하도록 setTimeout 사용
    setTimeout(() => inputRef.value?.focus(), 30)
  }
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
  unsubscribeResult()
})

defineExpose({ open, close })
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="find-bar" role="search" aria-label="페이지 내 검색">
      <input
        ref="inputRef"
        v-model="query"
        class="find-input"
        type="text"
        placeholder="페이지에서 찾기..."
        @keydown="onKeydown"
        aria-label="검색어 입력"
      />
      <span class="find-count" aria-live="polite">
        <template v-if="total > 0">{{ current }}/{{ total }}</template>
        <template v-else-if="query && total === 0">없음</template>
      </span>
      <button class="find-btn" @click="goPrev" title="이전 (Shift+Enter)" aria-label="이전">▲</button>
      <button class="find-btn" @click="goNext" title="다음 (Enter)" aria-label="다음">▼</button>
      <button class="find-btn find-close" @click="close" title="닫기 (Esc)" aria-label="닫기">✕</button>
    </div>
  </Teleport>
</template>

<style scoped>
.find-bar {
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 1900;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--vp-c-bg-elv, #ffffff);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  min-width: 280px;
}

.find-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  line-height: 1.5;
  padding: 2px 4px;
  min-width: 0;
}

.find-input::placeholder {
  color: var(--vp-c-text-3);
}

.find-count {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  white-space: nowrap;
  min-width: 40px;
  text-align: center;
}

.find-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  font-size: 0.75rem;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}

.find-btn:hover {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.find-close {
  font-size: 0.875rem;
  color: var(--vp-c-text-3);
}

.find-close:hover {
  background: var(--vp-c-danger-soft, rgba(255, 80, 80, 0.1));
  color: var(--vp-c-danger-1, #f43f5e);
}
</style>
