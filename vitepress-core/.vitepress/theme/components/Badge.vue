<!--
  Badge.vue: 9가지 스타일을 지원하는 인라인 배지 컴포넌트 (old 디자인 매칭)
  생성일: 2026-04-08 | 수정일: 2026-04-09
-->
<script setup>
import { computed, useAttrs } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({
  type: { type: String, default: 'default' },
  title: String,
  value: String,
})

const attrs = useAttrs()
const { isDark } = useData()

const lightColors = {
  info: { bg: '#e0f2fe', accent: '#0284c7', text: '#ffffff' },
  success: { bg: '#dcfce7', accent: '#16a34a', text: '#ffffff' },
  warning: { bg: '#fef9c3', accent: '#ca8a04', text: '#ffffff' },
  danger: { bg: '#fee2e2', accent: '#dc2626', text: '#ffffff' },
  note: { bg: '#e0e7ff', accent: '#4f46e5', text: '#ffffff' },
  tip: { bg: '#dcfce7', accent: '#16a34a', text: '#ffffff' },
  important: { bg: '#ede9fe', accent: '#7c3aed', text: '#ffffff' },
  caution: { bg: '#ffedd5', accent: '#ea580c', text: '#ffffff' },
  default: { bg: '#f1f5f9', accent: '#475569', text: '#ffffff' },
}

const darkColors = {
  info: { bg: '#0c4a6e', accent: '#38bdf8', text: '#ffffff' },
  success: { bg: '#064e3b', accent: '#4ade80', text: '#ffffff' },
  warning: { bg: '#451a03', accent: '#facc15', text: '#1a1a1a' },
  danger: { bg: '#450a0a', accent: '#f87171', text: '#ffffff' },
  note: { bg: '#1e1b4b', accent: '#818cf8', text: '#ffffff' },
  tip: { bg: '#064e3b', accent: '#4ade80', text: '#ffffff' },
  important: { bg: '#2e1065', accent: '#a78bfa', text: '#ffffff' },
  caution: { bg: '#431407', accent: '#fb923c', text: '#1a1a1a' },
  default: { bg: '#334155', accent: '#94a3b8', text: '#ffffff' },
}

// type prop 우선, 없으면 style 속성에서 읽기 (하위호환)
const badgeType = computed(() => {
  if (props.type !== 'default') return props.type
  // style="info" 형태로 전달된 경우 (Vue가 attrs로 전달하지 않으므로 type 사용 권장)
  return 'default'
})

const colors = computed(() => {
  const map = isDark.value ? darkColors : lightColors
  return map[badgeType.value] || map.default
})
</script>

<template>
  <span class="mdx-badge">
    <span v-if="title" class="badge-title" :style="{ backgroundColor: colors.bg, color: colors.accent }">{{ title }}</span>
    <span v-if="value" class="badge-value" :style="{ backgroundColor: colors.accent, color: colors.text }">{{ value }}</span>
    <span v-if="$slots.default" class="badge-value" :style="{ backgroundColor: colors.accent, color: colors.text }"><slot /></span>
  </span>
</template>

<style scoped>
.mdx-badge {
  display: inline-flex;
  align-items: stretch;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 999px;
  overflow: hidden;
  line-height: 1;
  vertical-align: middle;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}
.badge-title,
.badge-value {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
}
.badge-title {
  font-weight: 600;
}
</style>
