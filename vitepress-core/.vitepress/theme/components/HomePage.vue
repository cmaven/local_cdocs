<!--
  HomePage.vue: 라이브러리 대시보드 - 카테고리(년도) 섹션 + 프로젝트 카드 그리드 + 관리 액션
  상세: themeConfig.homeProjects({year, dir, items:[{name,desc,href,dir}]})를 "카테고리 섹션 + 프로젝트 카드"로 렌더.
        섹션 헤더에 카테고리(최상위 폴더) 관리 메뉴(이름변경/탐색기/삭제), 각 카드에 프로젝트(하위 폴더) 관리 메뉴.
        프로젝트가 적은 섹션은 같은 행에 나란히 배치(섹션 단위 grid). 상단 액션 바 + window.localcdocs IPC.
        Electron 미구동 시 graceful 폴백(버튼 비활성 + 안내).
  생성일: 2026-04-08 | 수정일: 2026-06-25
-->
<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { useData } from 'vitepress'

const { theme } = useData()

// 카테고리 그룹: config.mts의 themeConfig.homeProjects.
// year=표시명(formatName), dir=원본 폴더명(관리 IPC용), items=하위 프로젝트(또는 직속 .md) 카드.
// item.dir = 프로젝트(하위 폴더)명. null이면 직속 .md/폴백 카드 → 프로젝트 단위 관리 메뉴 미노출.
const groups = computed(() => theme.value.homeProjects || [])

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

// 케밥 메뉴 열림 상태 — 카테고리/프로젝트가 섞이므로 합성 키(string)로 단일 오픈 관리.
const openMenu = ref(null)
function catKey(g) { return 'cat:' + g.dir }
function projKey(catDir, item) { return 'proj:' + catDir + '/' + item.dir }
function toggleMenu(key) {
  openMenu.value = openMenu.value === key ? null : key
}
function closeMenu() {
  openMenu.value = null
}

// 관리 작업 후 공통 안내: 서버 재시작으로 곧 화면이 갱신됨
const REFRESH_HINT = '곧 화면이 자동으로 갱신됩니다.'

// ── 이름 입력 모달 ──────────────────────────────────────────
// Electron BrowserWindow는 window.prompt를 지원하지 않으므로 커스텀 모달로 이름을 입력받는다.
// mode: 'create'(새 컬렉션) | 'rename'(이름변경).
// rename은 target에 kind('collection'|'project')와 식별자(dir / cat+project)를 함께 보관.
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
// 카테고리(최상위 폴더) 이름변경
function openRenameModal(g) {
  if (!hasApi.value) return
  closeMenu()
  modal.value = {
    open: true, mode: 'rename', value: g.year, busy: false,
    target: { kind: 'collection', dir: g.dir, label: g.year },
  }
}
// 프로젝트(카테고리 하위 폴더) 이름변경
function openProjectRenameModal(catDir, item) {
  if (!hasApi.value || !item.dir) return
  closeMenu()
  modal.value = {
    open: true, mode: 'rename', value: item.name, busy: false,
    target: { kind: 'project', cat: catDir, project: item.dir, label: item.name },
  }
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
      return
    }
    // rename — 카테고리/프로젝트 분기
    const t = m.target
    let res
    if (t.kind === 'project') {
      if (name === t.project || name === t.label) { closeModal(); return }
      res = await api.value.renameProject(t.cat, t.project, name)
    } else {
      if (name === t.dir || name === t.label) { closeModal(); return }
      res = await api.value.renameCollection(t.dir, name)
    }
    if (res && res.ok) { showToast(`이름을 "${name}"(으)로 변경했습니다. ${REFRESH_HINT}`); closeModal() }
    else { showToast(`이름변경 실패: ${(res && res.error) || '알 수 없는 오류'}`); modal.value = { ...modal.value, busy: false } }
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

// ── 카테고리(최상위 폴더) 단위 작업 ────────────────────────
async function onDelete(g) {
  closeMenu()
  if (!hasApi.value) return
  if (!window.confirm(`컬렉션 "${g.year}"을(를) 삭제할까요? (휴지통으로 이동)`)) return
  try {
    const res = await api.value.deleteCollection(g.dir)
    if (res && res.ok) showToast(`컬렉션 "${g.year}"을(를) 삭제했습니다. ${REFRESH_HINT}`)
    else showToast(`삭제 실패: ${(res && res.error) || '알 수 없는 오류'}`)
  } catch (e) {
    showToast(`삭제 실패: ${e.message || e}`)
  }
}

async function onReveal(g) {
  closeMenu()
  if (!hasApi.value) return
  try {
    await api.value.reveal(g.dir)
  } catch (e) {
    showToast(`탐색기 열기 실패: ${e.message || e}`)
  }
}

// 빈 컬렉션 카드 클릭 — 이동할 페이지가 없으므로 폴더를 파일탐색기에서 연다(reveal).
// Electron 미구동(web/dev) 시 api 없음 → 클릭 무동작 + 안내 토스트만.
async function onRevealEmpty(g) {
  if (!hasApi.value) {
    showToast('데스크톱 앱에서 폴더를 열어 프로젝트를 추가하세요.')
    return
  }
  try {
    await api.value.reveal(g.dir)
  } catch (e) {
    showToast(`탐색기 열기 실패: ${e.message || e}`)
  }
}

// ── 프로젝트(카테고리 하위 폴더) 단위 작업 ──────────────────
async function onDeleteProject(catDir, item) {
  closeMenu()
  if (!hasApi.value || !item.dir) return
  if (!window.confirm(`프로젝트 "${item.name}"을(를) 삭제할까요? (휴지통으로 이동)`)) return
  try {
    const res = await api.value.deleteProject(catDir, item.dir)
    if (res && res.ok) showToast(`프로젝트 "${item.name}"을(를) 삭제했습니다. ${REFRESH_HINT}`)
    else showToast(`삭제 실패: ${(res && res.error) || '알 수 없는 오류'}`)
  } catch (e) {
    showToast(`삭제 실패: ${e.message || e}`)
  }
}

async function onRevealProject(catDir, item) {
  closeMenu()
  if (!hasApi.value || !item.dir) return
  try {
    await api.value.revealProject(catDir, item.dir)
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
      <div v-if="groups.length === 0" class="empty-state">
        <p class="empty-title">아직 컬렉션이 없습니다.</p>
        <p class="empty-desc">첫 컬렉션을 만들어 보세요.</p>
        <button class="btn-brand" :disabled="!hasApi" @click.stop="openCreateModal">+ 새 컬렉션</button>
      </div>

      <!-- 카테고리 섹션(프로젝트 적은 섹션은 같은 행에 나란히) + 프로젝트 카드 -->
      <div v-else class="group-list">
        <section v-for="g in groups" :key="g.dir" class="cat-section">
          <div class="cat-header">
            <h2 class="cat-title"><span class="cat-dot">•</span>{{ g.year }}</h2>
            <div v-if="hasApi" class="card-menu-wrap">
              <button class="kebab" title="카테고리 메뉴" @click.stop="toggleMenu(catKey(g))">⋯</button>
              <div v-if="openMenu === catKey(g)" class="card-menu" @click.stop>
                <button @click="openRenameModal(g)">이름변경</button>
                <button @click="onReveal(g)">탐색기</button>
                <button class="danger" @click="onDelete(g)">삭제</button>
              </div>
            </div>
          </div>

          <div class="card-grid">
            <!-- 빈 컬렉션(empty=true): 이동할 페이지가 없으므로 라우터 이동 대신 클릭 시 폴더를 reveal -->
            <button
              v-if="g.empty"
              type="button"
              class="project-card project-card--empty"
              @click.stop="onRevealEmpty(g)"
            >
              <span class="project-card-body">
                <span class="card-name card-name--empty">비어 있음 · 프로젝트를 추가하세요</span>
                <span class="card-desc">{{ hasApi ? '클릭하면 폴더가 열립니다.' : '데스크톱 앱에서 폴더를 열 수 있습니다.' }}</span>
              </span>
            </button>

            <!-- 일반(비어있지 않은) 컬렉션: 기존 프로젝트 카드 -->
            <template v-else>
              <div v-for="item in g.items" :key="item.href" class="project-card">
                <a :href="item.href" class="project-card-body">
                  <h3 class="card-name">{{ item.name }}</h3>
                  <p v-if="item.desc" class="card-desc">{{ item.desc }}</p>
                </a>
                <!-- 프로젝트(하위 폴더) 카드만 관리 메뉴 노출 -->
                <div v-if="hasApi && item.dir" class="card-menu-wrap">
                  <button class="kebab" title="프로젝트 메뉴" @click.stop.prevent="toggleMenu(projKey(g.dir, item))">⋯</button>
                  <div v-if="openMenu === projKey(g.dir, item)" class="card-menu" @click.stop>
                    <button @click="openProjectRenameModal(g.dir, item)">이름변경</button>
                    <button @click="onRevealProject(g.dir, item)">탐색기</button>
                    <button class="danger" @click="onDeleteProject(g.dir, item)">삭제</button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </section>
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

/* 카테고리 섹션 목록 — 프로젝트가 적은 섹션은 같은 행에 나란히 배치(Q3).
   섹션을 grid 아이템으로 흐름 배치하고, 좁은 화면에선 1열로 떨어진다. */
.group-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
  gap: 1.5rem 2rem;
  align-items: start;
}
.cat-section { min-width: 0; }

.cat-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; margin-bottom: 0.75rem;
}
.cat-title {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 1.2rem; font-weight: 700; margin: 0; border: none; padding: 0;
  color: var(--vp-c-text-1);
}
.cat-dot { color: var(--vp-c-brand-1); }

/* 프로젝트 카드 그리드 — 섹션 내부는 세로 스택(섹션 폭을 일정하게 유지) */
.card-grid { display: flex; flex-direction: column; gap: 0.75rem; }

.project-card {
  position: relative;
  display: flex; flex-direction: column;
  border-radius: 12px; min-height: 5rem;
  border: 1px solid var(--vp-c-border);
  transition: all 0.2s;
}
.project-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}
/* 카드 본문(링크) — 우측 케밥과 겹치지 않도록 padding-right 확보 */
.project-card-body {
  display: block; padding: 1.25rem 2.5rem 1.25rem 1.25rem;
  color: var(--vp-c-text-1); text-decoration: none;
}
.card-name { font-size: 1.05rem; font-weight: 600; margin: 0; word-break: break-word; }

/* 빈 컬렉션 카드 — 점선 테두리 + 흐린 톤으로 "콘텐츠 없음"을 드러낸다.
   button 요소이므로 기본 버튼 스타일을 제거하고 카드 레이아웃을 따른다. */
.project-card--empty {
  border-style: dashed;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  width: 100%;
  padding: 0;
}
.project-card--empty:hover { border-color: var(--vp-c-brand-1); }
.project-card--empty .project-card-body { width: 100%; }
.card-name--empty { display: block; color: var(--vp-c-text-2); font-weight: 600; }
.card-desc {
  margin: 0.4rem 0 0; font-size: 0.875rem; color: var(--vp-c-text-2);
  line-height: 1.5; word-break: break-word;
}

/* 케밥 메뉴 — 카테고리 헤더 / 프로젝트 카드 공용 */
.card-menu-wrap { position: relative; flex-shrink: 0; }
/* 프로젝트 카드 내 케밥은 우상단 고정(링크 위에 떠 있음) */
.project-card > .card-menu-wrap { position: absolute; top: 0.5rem; right: 0.5rem; z-index: 5; }
.kebab {
  border: none; background: none; cursor: pointer; font-size: 1.25rem; line-height: 1;
  color: var(--vp-c-text-2); padding: 0.15rem 0.35rem; border-radius: 6px; transition: all 0.2s;
}
.kebab:hover { color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.card-menu {
  position: absolute; top: 1.9rem; right: 0; z-index: 20; min-width: 8rem;
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
