<!--
  HomePage.vue: 라이브러리 대시보드 - 컬렉션 카드 그리드 + 관리 액션
  상세: themeConfig.categories를 컬렉션 카드로 렌더. 상단 액션 바(새 컬렉션/가져오기/폴더 열기)와
        카드별 메뉴(이름변경/삭제/탐색기)에서 window.localcdocs IPC를 호출한다.
        데스크톱(Electron) 미구동 시 graceful 폴백(버튼 비활성 + 안내).
  생성일: 2026-04-08 | 수정일: 2026-06-22
-->
<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useData } from 'vitepress'

const { theme } = useData()

// 컬렉션 목록: config.mts의 themeConfig.categories ({label, path, dir})
const categories = computed(() => theme.value.categories || [])

// Electron preload 브리지(window.localcdocs). 브라우저/CLI 단독 구동 시 없음 → 폴백.
const api = ref(null)
onMounted(() => {
  if (typeof window !== 'undefined' && window.localcdocs) {
    api.value = window.localcdocs
  }
  // 네이티브 메뉴 '새 컬렉션' 진입(#new-collection) → 모달 자동 오픈 후 해시 정리
  if (typeof window !== 'undefined' && window.location.hash === '#new-collection') {
    history.replaceState(null, '', window.location.pathname)
    openCreateModal()
  }
})
const hasApi = computed(() => !!api.value)

// 토스트 안내 문구(성공/실패). 일정 시간 후 자동 사라짐.
const toast = ref('')
let toastTimer = null
function showToast(msg) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 4000)
}

// 카드별 케밥 메뉴 열림 상태(dir 기준 단일 오픈)
const openMenu = ref(null)
function toggleMenu(dir) {
  openMenu.value = openMenu.value === dir ? null : dir
}
function closeMenu() {
  openMenu.value = null
}

// 관리 작업 후 공통 안내: 서버 재시작으로 곧 화면이 갱신됨
const REFRESH_HINT = '곧 화면이 자동으로 갱신됩니다.'

// ── 이름 입력 모달 ──────────────────────────────────────────
// Electron BrowserWindow는 window.prompt를 지원하지 않으므로 커스텀 모달로 이름을 입력받는다.
// mode: 'create'(새 컬렉션) | 'rename'(이름변경). rename은 target(cat)을 함께 보관.
const modal = ref({ open: false, mode: 'create', value: '', target: null, busy: false })
const modalInput = ref(null)
// 모달이 열리면 입력란에 자동 포커스
watch(() => modal.value.open, (open) => {
  if (open) nextTick(() => { if (modalInput.value) modalInput.value.focus() })
})

function openCreateModal() {
  if (!hasApi.value) return
  closeMenu()
  modal.value = { open: true, mode: 'create', value: '', target: null, busy: false }
}
function openRenameModal(cat) {
  if (!hasApi.value) return
  closeMenu()
  modal.value = { open: true, mode: 'rename', value: cat.label, target: cat, busy: false }
}
function closeModal() {
  modal.value = { ...modal.value, open: false, busy: false }
}
async function confirmModal() {
  const m = modal.value
  const name = (m.value || '').trim()
  if (!name || m.busy || !hasApi.value) return
  modal.value = { ...m, busy: true }
  try {
    if (m.mode === 'create') {
      const res = await api.value.createCollection(name)
      if (res && res.ok) { showToast(`컬렉션 "${name}"을(를) 만들었습니다. ${REFRESH_HINT}`); closeModal() }
      else { showToast(`생성 실패: ${(res && res.error) || '알 수 없는 오류'}`); modal.value = { ...modal.value, busy: false } }
    } else {
      if (name === m.target.dir || name === m.target.label) { closeModal(); return }
      const res = await api.value.renameCollection(m.target.dir, name)
      if (res && res.ok) { showToast(`이름을 "${name}"(으)로 변경했습니다. ${REFRESH_HINT}`); closeModal() }
      else { showToast(`이름변경 실패: ${(res && res.error) || '알 수 없는 오류'}`); modal.value = { ...modal.value, busy: false } }
    }
  } catch (e) {
    showToast(`작업 실패: ${e.message || e}`)
    modal.value = { ...modal.value, busy: false }
  }
}

async function onImport() {
  if (!hasApi.value) return
  try {
    const res = await api.value.importFolder()
    if (res && res.ok) showToast(`폴더 "${res.name || ''}"을(를) 가져왔습니다. ${REFRESH_HINT}`)
    else if (res && res.error) showToast(`가져오기 실패: ${res.error}`)
    // 사용자가 취소한 경우(res.ok=false, error 없음)는 조용히 무시
  } catch (e) {
    showToast(`가져오기 실패: ${e.message || e}`)
  }
}

async function onOpenLibrary() {
  if (!hasApi.value) return
  try {
    await api.value.reveal()
  } catch (e) {
    showToast(`폴더 열기 실패: ${e.message || e}`)
  }
}

async function onDelete(cat) {
  closeMenu()
  if (!hasApi.value) return
  if (!window.confirm(`컬렉션 "${cat.label}"을(를) 삭제할까요? (휴지통으로 이동)`)) return
  try {
    const res = await api.value.deleteCollection(cat.dir)
    if (res && res.ok) showToast(`컬렉션 "${cat.label}"을(를) 삭제했습니다. ${REFRESH_HINT}`)
    else showToast(`삭제 실패: ${(res && res.error) || '알 수 없는 오류'}`)
  } catch (e) {
    showToast(`삭제 실패: ${e.message || e}`)
  }
}

async function onReveal(cat) {
  closeMenu()
  if (!hasApi.value) return
  try {
    await api.value.reveal(cat.dir)
  } catch (e) {
    showToast(`탐색기 열기 실패: ${e.message || e}`)
  }
}
</script>

<template>
  <main class="home-page" @click="closeMenu">
    <div class="home-container">
      <!-- Hero -->
      <div class="hero-section">
        <h1 class="hero-title">local-cdocs</h1>
        <p class="hero-desc">
          내 Markdown 문서 라이브러리.<br/>
          컬렉션을 만들고 가져와 한곳에서 관리하세요.
        </p>
      </div>

      <!-- 상단 액션 바 -->
      <div class="action-bar">
        <button class="btn-brand" :disabled="!hasApi" @click.stop="openCreateModal">+ 새 컬렉션</button>
        <button class="btn-outline" :disabled="!hasApi" @click.stop="onImport">폴더 가져오기</button>
        <button class="btn-outline" :disabled="!hasApi" @click.stop="onOpenLibrary">라이브러리 폴더 열기</button>
        <span v-if="!hasApi" class="api-note">데스크톱 앱에서 사용 가능합니다.</span>
      </div>

      <!-- 빈 라이브러리 안내 -->
      <div v-if="categories.length === 0" class="empty-state">
        <p class="empty-title">아직 컬렉션이 없습니다.</p>
        <p class="empty-desc">첫 컬렉션을 만들어 보세요.</p>
        <button class="btn-brand" :disabled="!hasApi" @click.stop="openCreateModal">+ 새 컬렉션</button>
      </div>

      <!-- 컬렉션 카드 그리드 -->
      <div v-else class="card-grid">
        <div v-for="cat in categories" :key="cat.dir" class="collection-card">
          <div class="card-top">
            <h3 class="card-name">{{ cat.label }}</h3>
            <div v-if="hasApi" class="card-menu-wrap">
              <button class="kebab" title="메뉴" @click.stop="toggleMenu(cat.dir)">⋯</button>
              <div v-if="openMenu === cat.dir" class="card-menu" @click.stop>
                <button @click="openRenameModal(cat)">이름변경</button>
                <button @click="onReveal(cat)">탐색기</button>
                <button class="danger" @click="onDelete(cat)">삭제</button>
              </div>
            </div>
          </div>
          <a :href="cat.path" class="card-open">열기 →</a>
        </div>
      </div>

      <!-- Footer -->
      <footer class="home-footer">
        local-cdocs — 내 Markdown 문서 라이브러리
      </footer>
    </div>

    <!-- 토스트 안내 -->
    <Transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </Transition>

    <!-- 이름 입력 모달 (window.prompt 대체) -->
    <Transition name="modal">
      <div v-if="modal.open" class="modal-overlay" @click.self="closeModal">
        <div class="modal-box" @click.stop>
          <h3 class="modal-title">{{ modal.mode === 'create' ? '새 컬렉션' : '이름 변경' }}</h3>
          <input
            ref="modalInput"
            class="modal-input"
            v-model="modal.value"
            :placeholder="modal.mode === 'create' ? '컬렉션 이름' : '새 이름'"
            @keydown.enter="confirmModal"
            @keydown.esc="closeModal"
          />
          <div class="modal-actions">
            <button class="btn-outline" @click="closeModal">취소</button>
            <button class="btn-brand" :disabled="!modal.value.trim() || modal.busy" @click="confirmModal">확인</button>
          </div>
        </div>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.home-page { min-height: 100vh; padding: 4rem 1rem; }
.home-container { max-width: 90rem; margin: 0 auto; padding: 0 2rem; }

/* Hero */
.hero-section { text-align: center; margin-bottom: 2.5rem; }
.hero-title { font-size: 3rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 1rem; }
.hero-desc { font-size: 1.1rem; color: var(--vp-c-text-2); max-width: 36rem; margin: 0 auto; line-height: 1.7; }

/* 액션 바 */
.action-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem;
  justify-content: center; margin-bottom: 3rem;
}
.api-note { font-size: 0.875rem; color: var(--vp-c-text-3); }

.btn-brand {
  padding: 0.65rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;
  background: var(--vp-c-brand-1); color: #fff; border: none; cursor: pointer;
  transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.btn-brand:hover:not(:disabled) { opacity: 0.9; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.btn-outline {
  padding: 0.65rem 1.25rem; border-radius: 8px; font-weight: 500; font-size: 0.95rem;
  border: 1px solid var(--vp-c-border); background: transparent; color: var(--vp-c-text-1);
  cursor: pointer; transition: all 0.2s;
}
.btn-outline:hover:not(:disabled) { background: var(--vp-c-bg-soft); border-color: var(--vp-c-brand-1); }
.btn-brand:disabled, .btn-outline:disabled { opacity: 0.5; cursor: not-allowed; }

/* 빈 상태 */
.empty-state {
  text-align: center; padding: 4rem 1rem;
  border: 1px dashed var(--vp-c-border); border-radius: 12px;
}
.empty-title { font-size: 1.25rem; font-weight: 600; margin: 0 0 0.5rem; }
.empty-desc { color: var(--vp-c-text-2); margin: 0 0 1.5rem; }

/* Card Grid */
.card-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; }
@media (min-width: 1024px) { .card-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 1440px) { .card-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 640px) { .card-grid { grid-template-columns: 1fr; } }

.collection-card {
  display: flex; flex-direction: column; justify-content: space-between;
  padding: 1.5rem; border-radius: 12px; min-height: 7rem;
  border: 1px solid var(--vp-c-border); color: var(--vp-c-text-1);
  transition: all 0.2s;
}
.collection-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.card-name { font-size: 1.1rem; font-weight: 600; margin: 0; word-break: break-word; }
.card-open {
  margin-top: 1rem; font-size: 0.9rem; font-weight: 600;
  color: var(--vp-c-brand-1); text-decoration: none; align-self: flex-start;
}
.card-open:hover { text-decoration: underline; }

/* 케밥 메뉴 */
.card-menu-wrap { position: relative; flex-shrink: 0; }
.kebab {
  border: none; background: none; cursor: pointer; font-size: 1.25rem; line-height: 1;
  color: var(--vp-c-text-2); padding: 0 0.25rem; border-radius: 6px; transition: all 0.2s;
}
.kebab:hover { color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.card-menu {
  position: absolute; top: 1.75rem; right: 0; z-index: 20; min-width: 8rem;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-border); border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12); padding: 0.25rem; display: flex; flex-direction: column;
}
.card-menu button {
  text-align: left; border: none; background: none; cursor: pointer;
  padding: 0.5rem 0.75rem; border-radius: 6px; font-size: 0.9rem; color: var(--vp-c-text-1);
  transition: all 0.15s;
}
.card-menu button:hover { background: var(--vp-c-bg-soft); }
.card-menu button.danger { color: var(--vp-c-danger-1, #e11d48); }

/* Footer */
.home-footer {
  margin-top: 4rem; padding-top: 2rem;
  border-top: 1px solid var(--vp-c-border);
  text-align: center; font-size: 0.875rem; color: var(--vp-c-text-3);
}

/* 토스트 */
.toast {
  position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
  z-index: 200; max-width: 90vw; padding: 0.75rem 1.25rem; border-radius: 8px;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-border);
  box-shadow: 0 4px 20px rgba(0,0,0,0.18); font-size: 0.9rem; color: var(--vp-c-text-1);
}
.toast-enter-active, .toast-leave-active { transition: all 0.25s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }

/* 이름 입력 모달 */
.modal-overlay {
  position: fixed; inset: 0; z-index: 300; padding: 1rem;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  width: 100%; max-width: 24rem; padding: 1.5rem;
  background: var(--vp-c-bg); border: 1px solid var(--vp-c-border);
  border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}
.modal-title { font-size: 1.15rem; font-weight: 700; margin: 0 0 1rem; }
.modal-input {
  width: 100%; padding: 0.6rem 0.75rem; border-radius: 8px;
  border: 1px solid var(--vp-c-border); background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1); font-size: 0.95rem; outline: none; box-sizing: border-box;
}
.modal-input:focus { border-color: var(--vp-c-brand-1); box-shadow: 0 0 0 2px var(--vp-c-brand-soft); }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
