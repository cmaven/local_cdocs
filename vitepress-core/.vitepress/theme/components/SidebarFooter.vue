<!-- SidebarFooter.vue: 사이드바 하단 - 검색 + 아이콘(토글/GitHub/설정) | 수정일: 2026-07-01 -->
<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { useData } from 'vitepress'
import {
  settings,
  loadSettings,
  saveSettings,
  applyCssVars,
  resolveIsDark,
  openSettings,
} from '../composables/useSettings'

const { isDark } = useData()

function toggleDark() {
  isDark.value = !isDark.value
  // 빠른 토글이 설정과 동기화되도록 themeMode도 갱신
  settings.themeMode = isDark.value ? 'dark' : 'light'
  saveSettings()
}

// 시스템 다크모드 추종 리스너
let mql = null
let onSys = null

onMounted(() => {
  // 저장된 설정 로드 후 CSS 변수/테마 적용
  loadSettings()
  applyCssVars()
  isDark.value = resolveIsDark(settings.themeMode)

  if (typeof window !== 'undefined') {
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    onSys = () => {
      if (settings.themeMode === 'system') isDark.value = mql.matches
    }
    mql.addEventListener('change', onSys)
  }
})

onBeforeUnmount(() => {
  if (mql && onSys) mql.removeEventListener('change', onSys)
})

function openSearch() {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    bubbles: true,
  })
  document.dispatchEvent(event)
}
</script>

<template>
  <div class="sidebar-footer">
    <!-- Row 1: Search -->
    <div class="footer-search" @click="openSearch">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span class="search-text">검색...</span>
      <kbd class="search-kbd">Ctrl+K</kbd>
    </div>

    <!-- Row 2: Icons -->
    <div class="footer-icons">
      <!-- Dark/Light Toggle -->
      <button @click="toggleDark" class="footer-icon" :title="isDark ? 'Light mode' : 'Dark mode'">
        <svg v-if="isDark" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>

      <!-- GitHub Icon -->
      <a href="https://github.com/cmaven/local_cdocs" target="_blank" rel="noopener noreferrer" class="footer-icon" title="GitHub">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      </a>

      <!-- Settings (톱니바퀴) Icon → 전역 설정 모달 열기 -->
      <button class="footer-icon" @click="openSettings" title="설정">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-top: 1px solid var(--vp-c-border);
  /* 사이드바 스크롤 컨테이너(.VPSidebar) 하단에 sticky 고정 */
  position: sticky;
  bottom: 0;
  background: var(--vp-sidebar-bg-color, #ffffff);
  z-index: 2;
  box-sizing: border-box;
  /* VPSidebar 좌우 padding(32px)을 음수 마진으로 상쇄해 불투명 배경이 사이드바 전체 폭을
     덮도록 한다. 스크롤 시 항목 캐럿/끝 글자가 footer 옆으로 새는 것까지 차단.
     padding으로 내부 콘텐츠 위치는 그대로 유지. (.sidebar-top 과 동일 기법) */
  margin-left: -32px;
  margin-right: -32px;
  padding-left: calc(0.75rem + 32px);
  padding-right: calc(0.75rem + 32px);
}
/* sticky 블록 최상단 경계의 서브픽셀 틈으로 스크롤되는 항목 글자(다크모드 녹색)가
   비쳐 튀어나오는 현상 차단(footer 위쪽을 불투명 배경으로 더 덮음). */
.sidebar-footer::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: 12px;
  background: var(--vp-sidebar-bg-color, #ffffff);
}

/* Row 1: Search */
.footer-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.8rem;
  background: rgba(234, 233, 239, 0.18);
}
.footer-search:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}
.search-text { flex: 1; }
.search-kbd {
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

/* Row 2: Icons */
.footer-icons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.footer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
  background: none;
  border: none;
  text-decoration: none;
}
.footer-icon:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}


</style>
