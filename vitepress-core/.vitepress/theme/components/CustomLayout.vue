<!-- CustomLayout.vue: VitePress DefaultTheme 확장 레이아웃 + 사이드바 토글 | 수정일: 2026-07-08 -->
<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { ref, watchEffect, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import CategoryDropdown from './CategoryDropdown.vue'
import VersionSelector from './VersionSelector.vue'
import SidebarFooter from './SidebarFooter.vue'
import DocHeader from './DocHeader.vue'
import SettingsModal from './SettingsModal.vue'
import {
  settings,
  loadSettings,
  applyCssVars,
  resolveIsDark,
  openSettings,
} from '../composables/useSettings'

const { Layout } = DefaultTheme
const { frontmatter, isDark, theme } = useData()
const route = useRoute()
const sidebarCollapsed = ref(false)

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  if (typeof document !== 'undefined') {
    document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed.value)
  }
}

function openSearch() {
  const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
  document.dispatchEvent(event)
}

watchEffect(() => {
  const isHome = frontmatter.value.layout === 'home' || frontmatter.value.layout === 'page'
  if (!isHome && typeof document !== 'undefined') {
    document.body.classList.add('hide-navbar')
  } else if (typeof document !== 'undefined') {
    document.body.classList.remove('hide-navbar')
  }
})

// 시스템 다크모드 추종 리스너 (SidebarFooter에서 이동)
let mql = null
let onSys = null

onMounted(async () => {
  // 저장된 설정 로드 후 CSS 변수/테마 적용 (IPC 우선 → localStorage 폴백)
  await loadSettings()
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

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove('hide-navbar')
    document.body.classList.remove('sidebar-collapsed')
  }
})
</script>

<template>
  <Layout>
    <template #sidebar-nav-before>
      <!-- 헤더 + 카테고리/버전 드롭다운을 하나의 sticky 블록으로 묶어, 좁은 화면에서
           사이드바를 스크롤해도 항상 상단에 고정되도록 한다(드롭다운이 헤더 밑으로 사라지는 현상 방지). -->
      <div class="sidebar-top">
        <div class="sidebar-header">
          <a href="/" class="sidebar-title">local-cdocs</a>
          <!-- 빌드 버전 표시: v{version}·{sha7}, 툴팁=빌드 날짜 -->
          <span
            v-if="theme.appVersion"
            class="sidebar-version"
            :title="theme.appVersion.builtAt ? '빌드: ' + theme.appVersion.builtAt : ''"
          >{{ theme.appVersion.text }}</span>
          <button class="sidebar-toggle" @click="toggleSidebar" title="사이드바 닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
        </div>
        <CategoryDropdown />
        <VersionSelector />
      </div>
    </template>
    <template #sidebar-nav-after>
      <SidebarFooter />
    </template>
    <template #doc-before>
      <DocHeader />
    </template>
    <template #nav-bar-content-after>
      <!-- 상단 nav 우측: 문서 보기 설정 기어 버튼 -->
      <button class="nav-settings-btn" @click="openSettings" title="문서 보기 설정" aria-label="설정">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
    </template>
  </Layout>

  <!-- 설정 모달: 전역 1회 마운트 (Teleport로 body에 렌더됨) -->
  <SettingsModal />

  <!-- 사이드바 닫힌 상태: 플로팅 버튼 -->
  <Transition name="float">
    <div v-if="sidebarCollapsed" class="floating-buttons">
      <a href="/" class="float-btn" title="홈으로">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>
        </svg>
      </a>
      <button @click="toggleSidebar" class="float-btn" title="사이드바 열기">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>
        </svg>
      </button>
      <button @click="openSearch" class="float-btn" title="검색 (Ctrl+K)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
/* 헤더 + 드롭다운 묶음: 사이드바 스크롤과 무관하게 항상 상단 고정.
   불투명 배경으로 스크롤되는 항목을 완전히 덮어 비침(틈)도 함께 방지한다. */
.sidebar-top {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--vp-sidebar-bg-color, #ffffff);
  /* VPSidebar 좌우 padding(32px)을 음수 마진으로 상쇄해 불투명 배경이 사이드바 전체 폭을
     덮도록 한다. VitePress 항목 캐럿(.caret)은 margin-right:-7px로 컨테이너 밖까지 튀어나오는데,
     배경이 그 영역과 스크롤바 거터까지 덮어야 스크롤 시 캐럿/끝 글자가 옆으로 새지 않는다.
     padding으로 내부 콘텐츠 위치는 그대로 유지. */
  margin-left: -32px;
  margin-right: -32px;
  padding-left: 32px;
  padding-right: 32px;
}
/* sticky 블록 최상단 경계의 서브픽셀 틈으로 항목 글자가 비치는 현상 차단(상단을 위로 더 덮음) */
.sidebar-top::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -12px;
  height: 12px;
  background: var(--vp-sidebar-bg-color, #ffffff);
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.75rem;
  border-bottom: 1px solid var(--vp-c-border);
}
/* 토글 버튼을 오른쪽 끝으로 밀기 (타이틀+버전 왼쪽, 토글 오른쪽) */
.sidebar-header .sidebar-toggle {
  margin-left: auto;
}
.sidebar-header .sidebar-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: color 0.2s;
  padding: 0;
  border: none;
}
.sidebar-header .sidebar-title:hover {
  color: var(--vp-c-brand-1);
}
/* 버전 배지: 타이틀 baseline 정렬, 음영 처리로 보조 정보임을 시각화 */
.sidebar-version {
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
  font-weight: 400;
  letter-spacing: 0.01em;
  vertical-align: baseline;
  flex-shrink: 0;
  cursor: default;
}
.sidebar-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
}
.sidebar-toggle:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* 플로팅 버튼 */
.floating-buttons {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  display: flex;
  gap: 0.25rem;
  z-index: 100;
  background: var(--vp-sidebar-bg-color, #ffffff);
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  padding: 0.25rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.float-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s;
}
.float-btn:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* 상단 nav 기어 버튼: VitePress 소셜 링크(.VPSocialLink)와 정렬 */
.nav-settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.2s;
}
.nav-settings-btn:hover {
  color: var(--vp-c-text-1);
}

/* 플로팅 버튼 애니메이션 */
.float-enter-active,
.float-leave-active {
  transition: all 0.2s ease;
}
.float-enter-from,
.float-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
</style>
