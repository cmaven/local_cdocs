<!-- CustomLayout.vue: VitePress DefaultTheme 확장 레이아웃 + 사이드바 토글 | 수정일: 2026-06-25 -->
<script setup>
import DefaultTheme from 'vitepress/theme'
import { useData, useRoute } from 'vitepress'
import { ref, watchEffect, onUnmounted } from 'vue'
import CategoryDropdown from './CategoryDropdown.vue'
import VersionSelector from './VersionSelector.vue'
import SidebarFooter from './SidebarFooter.vue'
import DocHeader from './DocHeader.vue'

const { Layout } = DefaultTheme
const { frontmatter } = useData()
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
  </Layout>

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
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--vp-c-border);
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
