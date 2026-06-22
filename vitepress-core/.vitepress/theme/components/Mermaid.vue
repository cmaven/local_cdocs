<!--
  Mermaid.vue: Mermaid 다이어그램 렌더링 컴포넌트
  생성일: 2026-04-08 | 수정일: 2026-04-08
-->
<script setup>
import { ref, onMounted, watch } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({ chart: { type: String, required: true } })
const container = ref(null)
const { isDark } = useData()

// 다크모드: 박스가 배경(--vp-c-bg-elv ≈ #222827)과 확실히 구분되도록 밝은 채움 + 민트 테두리.
// (flowchart 노드 / sequence actor·note·alt 블록 모두 커버)
const DARK_VARS = {
  darkMode: true,
  background: '#222827',
  primaryColor: '#33403e',
  primaryBorderColor: '#30e3ca',
  primaryTextColor: '#eaf1ee',
  secondaryColor: '#2c3a37',
  tertiaryColor: '#3a4845',
  lineColor: '#9aa7a3',
  textColor: '#d6dcda',
  // sequence diagram
  actorBkg: '#33403e',
  actorBorder: '#30e3ca',
  actorTextColor: '#eaf1ee',
  actorLineColor: '#9aa7a3',
  signalColor: '#cdd5d2',
  signalTextColor: '#eaf1ee',
  labelBoxBkgColor: '#33403e',
  labelBoxBorderColor: '#30e3ca',
  labelTextColor: '#eaf1ee',
  loopTextColor: '#eaf1ee',
  noteBkgColor: '#3a4845',
  noteTextColor: '#eaf1ee',
  noteBorderColor: '#30e3ca',
  altSectionBkgColor: '#2a322f',
  activationBkgColor: '#3a4845',
}

async function render() {
  if (!container.value) return
  const { default: mermaid } = await import('mermaid')
  // 웹폰트(SUITE 등)가 로드된 뒤 측정/렌더해야 박스 크기 오차로 인한 글자 잘림이 없음.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    try { await document.fonts.ready } catch {}
  }
  const dark = isDark.value
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    // 'inherit' 대신 구체 폰트 지정 → 측정 폰트와 렌더 폰트 일치(잘림 방지)
    fontFamily: '"SUITE Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", "Malgun Gothic", sans-serif',
    theme: dark ? 'dark' : 'default',
    themeVariables: dark ? DARK_VARS : undefined,
    // mermaid 내부 렌더/측정 시에도 라벨 line-height를 타이트하게(글자 잘림 방지)
    themeCSS: '.nodeLabel,.edgeLabel,.label,.nodeLabel p,foreignObject div,foreignObject span{line-height:1.3 !important;}',
    flowchart: { useMaxWidth: true, htmlLabels: true, padding: 12 },
    sequence: { useMaxWidth: true },
  })
  const id = 'mermaid-' + Math.random().toString(36).slice(2)
  try {
    const { svg } = await mermaid.render(id, props.chart.replaceAll('\\n', '\n'))
    container.value.innerHTML = svg
  } catch {
    container.value.innerHTML = '<pre style="color:red">Mermaid 렌더링 실패</pre>'
  }
}

onMounted(render)
watch(isDark, render)
</script>

<template>
  <div class="my-6 flex justify-center overflow-x-auto rounded-lg border p-4" style="border-color: var(--vp-c-border); background: var(--vp-c-bg-elv);">
    <div ref="container" class="mermaid-wrapper" />
  </div>
</template>
