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
.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-bottom: 1px solid var(--vp-c-border);
  /* 사이드바 스크롤 시에도 홈 링크가 항상 상단에 보이도록 고정 (좁은 화면 포함) */
  position: sticky;
  top: 0;
  z-index: 3;
  background: var(--vp-sidebar-bg-color, #ffffff);
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
