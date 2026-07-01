<!-- SettingsModal.vue: 문서 보기 설정을 content 영역 중앙에 띄우는 Teleport 모달(오버레이+ESC+스크롤잠금) | 생성일: 2026-07-01 -->
<script setup>
import { watch, onBeforeUnmount } from 'vue'
import { settingsOpen, closeSettings } from '../composables/useSettings'
import SettingsPanel from './SettingsPanel.vue'

// ESC 키 핸들러: 모달이 열려있을 때만 반응
function onKey(e) {
  if (e.key === 'Escape') closeSettings()
}

// 모달 열림 상태 감지: 열리면 body 스크롤 잠금 + ESC 리스너 등록, 닫히면 해제
watch(settingsOpen, (open) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  if (open) {
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
  } else {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', onKey)
  }
})

// 컴포넌트 언마운트 시 리스너 제거 + body overflow 복원
onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-modal">
      <div v-if="settingsOpen" class="settings-overlay" @click.self="closeSettings">
        <SettingsPanel @close="closeSettings" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* 오버레이: 화면 전체를 어둡게 dim하고 SettingsPanel을 중앙 정렬 */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

/* 페이드 트랜지션 */
.settings-modal-enter-active,
.settings-modal-leave-active {
  transition: opacity 0.2s ease;
}
.settings-modal-enter-from,
.settings-modal-leave-to {
  opacity: 0;
}
</style>
