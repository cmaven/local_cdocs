<!--
  Mermaid.vue: Mermaid 다이어그램 렌더링 + 확대(줌/팬) 모달
  상세: 그래프 하단 "확대하기" 버튼 → 전체화면 모달에서 휠/버튼 확대·축소, 드래그 이동(pan), 리셋, ESC 닫기.
        넓은 그래프(width 과다)가 본문에서 잘려 보일 때 모달로 자유롭게 탐색한다. 외부 의존성 없이 CSS transform 기반.
  생성일: 2026-04-08 | 수정일: 2026-06-24
-->
<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useData } from 'vitepress'

const props = defineProps({ chart: { type: String, required: true } })
const container = ref(null)
const { isDark } = useData()

// 렌더된 SVG 마크업(모달에서 재사용)
const svgCode = ref('')

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
    svgCode.value = svg
  } catch {
    container.value.innerHTML = '<pre style="color:red">Mermaid 렌더링 실패</pre>'
    svgCode.value = ''
  }
}

onMounted(render)
watch(isDark, render)

// ── 확대 모달 (줌/팬) ───────────────────────────────────────
const zoomOpen = ref(false)
const stage = ref(null)          // 변환 대상 래퍼
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const MIN = 0.2
const MAX = 8

let dragging = false
let startX = 0, startY = 0, startTx = 0, startTy = 0

function clampScale(s) { return Math.min(MAX, Math.max(MIN, s)) }

function applyTransform() {
  if (stage.value) {
    stage.value.style.transform = `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`
  }
}

function resetView() {
  scale.value = 1; tx.value = 0; ty.value = 0
  nextTick(applyTransform)
}

function openZoom() {
  if (!svgCode.value) return
  zoomOpen.value = true
  resetView()
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
  }
}

function closeZoom() {
  zoomOpen.value = false
  dragging = false
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', onKey)
  }
}

function onKey(e) {
  if (e.key === 'Escape') closeZoom()
  else if (e.key === '+' || e.key === '=') zoomBy(1.2)
  else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.2)
  else if (e.key === '0') resetView()
}

// 버튼/키보드 확대축소 — 뷰포트 중심 기준
function zoomBy(factor) {
  const rect = stage.value?.parentElement?.getBoundingClientRect()
  const cx = rect ? rect.width / 2 : 0
  const cy = rect ? rect.height / 2 : 0
  zoomAt(cx, cy, factor)
}

// (cx,cy)는 viewport(컨테이너) 좌표. 해당 지점이 고정되도록 translate 보정.
function zoomAt(cx, cy, factor) {
  const next = clampScale(scale.value * factor)
  const ratio = next / scale.value
  if (ratio === 1) return
  tx.value = cx - (cx - tx.value) * ratio
  ty.value = cy - (cy - ty.value) * ratio
  scale.value = next
  applyTransform()
}

function onWheel(e) {
  e.preventDefault()
  const rect = e.currentTarget.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  zoomAt(cx, cy, e.deltaY < 0 ? 1.15 : 1 / 1.15)
}

function onDown(e) {
  dragging = true
  startX = e.clientX; startY = e.clientY
  startTx = tx.value; startTy = ty.value
}
function onMove(e) {
  if (!dragging) return
  tx.value = startTx + (e.clientX - startX)
  ty.value = startTy + (e.clientY - startY)
  applyTransform()
}
function onUp() { dragging = false }

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = ''
    window.removeEventListener('keydown', onKey)
  }
})
</script>

<template>
  <div class="mermaid-block">
    <div class="mermaid-box">
      <div ref="container" class="mermaid-wrapper" />
    </div>
    <div class="mermaid-actions">
      <button type="button" class="zoom-btn" :disabled="!svgCode" @click="openZoom" title="그래프 확대">
        🔍 확대하기
      </button>
    </div>
  </div>

  <!-- 확대 모달 -->
  <Teleport to="body">
    <Transition name="zoom-modal">
      <div v-if="zoomOpen" class="zoom-overlay" @click.self="closeZoom">
        <!-- 줌/팬 무대 -->
        <div
          class="zoom-viewport"
          @wheel="onWheel"
          @mousedown="onDown"
          @mousemove="onMove"
          @mouseup="onUp"
          @mouseleave="onUp"
        >
          <div ref="stage" class="zoom-stage" v-html="svgCode" />
        </div>

        <!-- 컨트롤 바 -->
        <div class="zoom-controls" @mousedown.stop>
          <button type="button" @click="zoomBy(1.2)" title="확대 (+)">＋</button>
          <button type="button" @click="zoomBy(1 / 1.2)" title="축소 (-)">－</button>
          <button type="button" @click="resetView" title="원래대로 (0)">⤾</button>
          <span class="zoom-pct">{{ Math.round(scale * 100) }}%</span>
          <button type="button" class="zoom-close" @click="closeZoom" title="닫기 (Esc)">✕ 닫기</button>
        </div>
        <div class="zoom-hint">휠: 확대/축소 · 드래그: 이동 · Esc: 닫기</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.mermaid-block { margin: 1.5rem 0; }
.mermaid-box {
  display: flex; justify-content: center; overflow-x: auto;
  border: 1px solid var(--vp-c-border); border-radius: 0.5rem;
  background: var(--vp-c-bg-elv); padding: 1rem;
}
.mermaid-actions { display: flex; justify-content: flex-end; margin-top: 0.5rem; }
.zoom-btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.4rem 0.8rem; font-size: 0.85rem; font-weight: 600;
  border: 1px solid var(--vp-c-border); border-radius: 8px;
  background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  cursor: pointer; transition: all 0.15s;
}
.zoom-btn:hover:not(:disabled) { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.zoom-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 모달 */
.zoom-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.82);
  display: flex; align-items: center; justify-content: center;
}
.zoom-viewport {
  position: absolute; inset: 0;
  overflow: hidden; cursor: grab;
}
.zoom-viewport:active { cursor: grabbing; }
.zoom-stage {
  position: absolute; top: 0; left: 0;
  transform-origin: 0 0;
  will-change: transform;
  padding: 2rem;
}
/* 모달 안에서는 자연 크기로 그려 줌이 의미있게 동작하도록 max-width 해제 */
.zoom-stage :deep(svg) {
  max-width: none !important;
  height: auto;
  background: var(--vp-c-bg-elv);
  border-radius: 0.5rem;
}

.zoom-controls {
  position: absolute; bottom: 1.25rem; left: 50%; transform: translateX(-50%);
  z-index: 2001; display: flex; align-items: center; gap: 0.4rem;
  padding: 0.4rem 0.6rem; border-radius: 10px;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-border);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
}
.zoom-controls button {
  min-width: 2rem; height: 2rem; padding: 0 0.5rem;
  border: 1px solid var(--vp-c-border); border-radius: 7px;
  background: var(--vp-c-bg-soft); color: var(--vp-c-text-1);
  font-size: 1rem; cursor: pointer; transition: all 0.15s;
}
.zoom-controls button:hover { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.zoom-controls .zoom-close { width: auto; font-size: 0.85rem; font-weight: 600; }
.zoom-pct { min-width: 3rem; text-align: center; font-size: 0.85rem; color: var(--vp-c-text-2); font-variant-numeric: tabular-nums; }
.zoom-hint {
  position: absolute; top: 1rem; left: 50%; transform: translateX(-50%);
  z-index: 2001; font-size: 0.8rem; color: rgba(255, 255, 255, 0.75);
  pointer-events: none; user-select: none;
}

.zoom-modal-enter-active, .zoom-modal-leave-active { transition: opacity 0.2s ease; }
.zoom-modal-enter-from, .zoom-modal-leave-to { opacity: 0; }
</style>
