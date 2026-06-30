<!-- SettingsPanel.vue: 문서 보기 설정 팝오버(테마/줄간격/폰트크기/영역별 폰트) | 생성일: 2026-06-30 -->
<script setup>
import { onMounted, ref } from 'vue'
import { useData } from 'vitepress'
import {
  settings,
  FONT_OPTIONS,
  saveSettings,
  applyCssVars,
  resolveIsDark,
  resetSettings,
} from '../composables/useSettings'

const emit = defineEmits(['close'])
const { isDark } = useData()

// 패널 루트 참조: 마운트 시 포커스를 줘 @keydown.esc 가 동작하도록 보장
const panelRef = ref(null)
onMounted(() => panelRef.value?.focus())

// 테마 적용: 현재 themeMode를 실제 다크 여부로 반영
function applyTheme() {
  isDark.value = resolveIsDark(settings.themeMode)
}

// 모든 컨트롤 변경 시 호출: 저장 + CSS 변수 적용 + 테마 적용
function onChange() {
  saveSettings()
  applyCssVars()
  applyTheme()
}

// 테마 세그먼트 버튼 클릭
function setTheme(mode) {
  settings.themeMode = mode
  onChange()
}

// 기본값으로 초기화
function onReset() {
  resetSettings()
  onChange()
}
</script>

<template>
  <div ref="panelRef" class="settings-panel" tabindex="-1" @keydown.esc="emit('close')">
    <!-- 헤더 -->
    <div class="sp-header">
      <span class="sp-title">문서 보기 설정</span>
      <button class="sp-close" title="닫기" @click="emit('close')">×</button>
    </div>

    <!-- 테마 -->
    <div class="sp-section">
      <label class="sp-label">테마</label>
      <div class="sp-segment">
        <button
          :class="{ active: settings.themeMode === 'light' }"
          @click="setTheme('light')"
        >라이트</button>
        <button
          :class="{ active: settings.themeMode === 'dark' }"
          @click="setTheme('dark')"
        >다크</button>
        <button
          :class="{ active: settings.themeMode === 'system' }"
          @click="setTheme('system')"
        >시스템</button>
      </div>
    </div>

    <!-- 줄간격 -->
    <div class="sp-section">
      <label class="sp-label">
        줄간격 <span class="sp-value">{{ settings.lineHeight.toFixed(2) }}</span>
      </label>
      <input
        type="range"
        min="1.4"
        max="2.4"
        step="0.05"
        v-model.number="settings.lineHeight"
        @input="onChange"
      />
    </div>

    <!-- 폰트 크기 -->
    <div class="sp-section">
      <label class="sp-label">
        폰트 크기 <span class="sp-value">{{ settings.fontSize }}px</span>
      </label>
      <input
        type="range"
        min="13"
        max="20"
        step="1"
        v-model.number="settings.fontSize"
        @input="onChange"
      />
    </div>

    <!-- 영역별 폰트 -->
    <div class="sp-section">
      <label class="sp-label">좌측 사이드바</label>
      <select v-model="settings.fontSidebar" @change="onChange">
        <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>
    </div>
    <div class="sp-section">
      <label class="sp-label">우측 목차</label>
      <select v-model="settings.fontToc" @change="onChange">
        <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>
    </div>
    <div class="sp-section">
      <label class="sp-label">content 제목</label>
      <select v-model="settings.fontHeading" @change="onChange">
        <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>
    </div>
    <div class="sp-section">
      <label class="sp-label">content 내용</label>
      <select v-model="settings.fontBody" @change="onChange">
        <option v-for="f in FONT_OPTIONS" :key="f.value" :value="f.value">{{ f.label }}</option>
      </select>
    </div>

    <!-- 초기화 -->
    <button class="sp-reset" @click="onReset">기본값으로 초기화</button>
  </div>
</template>

<style scoped>
.settings-panel {
  width: 248px;
  padding: 0.85rem;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  box-sizing: border-box;
  outline: none; /* tabindex 포커스 링 숨김(ESC 키 수신용 포커스) */
}

/* 헤더 */
.sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sp-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}
.sp-close {
  border: none;
  background: none;
  color: var(--vp-c-text-2);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
  border-radius: 4px;
}
.sp-close:hover {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* 섹션 */
.sp-section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.sp-label {
  font-size: 0.74rem;
  color: var(--vp-c-text-2);
  font-weight: 600;
}
.sp-value {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

/* 테마 세그먼트 */
.sp-segment {
  display: flex;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  overflow: hidden;
}
.sp-segment button {
  flex: 1;
  border: none;
  background: none;
  color: var(--vp-c-text-2);
  font-size: 0.74rem;
  padding: 0.35rem 0;
  cursor: pointer;
  transition: all 0.15s;
}
.sp-segment button:not(:last-child) {
  border-right: 1px solid var(--vp-c-border);
}
.sp-segment button:hover {
  background: var(--vp-c-brand-soft);
}
.sp-segment button.active {
  background: var(--vp-c-brand-1);
  color: #ffffff;
}

/* 슬라이더 */
.sp-section input[type='range'] {
  width: 100%;
  accent-color: var(--vp-c-brand-1);
  cursor: pointer;
}

/* 셀렉트 */
.sp-section select {
  width: 100%;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.78rem;
  cursor: pointer;
}

/* 초기화 버튼 */
.sp-reset {
  margin-top: 0.2rem;
  padding: 0.45rem 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: none;
  color: var(--vp-c-text-2);
  font-size: 0.76rem;
  cursor: pointer;
  transition: all 0.15s;
}
.sp-reset:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
</style>
