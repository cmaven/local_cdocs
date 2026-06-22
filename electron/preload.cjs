/**
 * preload.cjs: 렌더러 ↔ 메인 IPC 브리지 (contextBridge)
 * 상세: 관리형 라이브러리 API를 window.localcdocs로 노출(컬렉션 생성/가져오기/
 *       이름변경/삭제/탐색기열기/루트조회). 기존 window.localCdocs(상태 구독 등)도 유지.
 * 생성일: 2026-06-22 | 수정일: 2026-06-22
 */
const { contextBridge, ipcRenderer } = require('electron')

// ── 관리형 라이브러리 API (공유 IPC 계약) ──────────────────
// dir = LIBRARY_ROOT 직속 폴더명(= config의 cat.dir)
contextBridge.exposeInMainWorld('localcdocs', {
  // 라이브러리 루트 경로 조회
  getRoot: () => ipcRenderer.invoke('library:getRoot'),
  // 새 컬렉션 생성 → { ok, name?, error? }
  createCollection: (name) => ipcRenderer.invoke('library:createCollection', name),
  // 외부 폴더 가져오기(다이얼로그 → 복사) → { ok, name?, error? }
  importFolder: () => ipcRenderer.invoke('library:importFolder'),
  // 컬렉션 이름 변경 → { ok, name?, error? }
  renameCollection: (dir, newName) => ipcRenderer.invoke('library:renameCollection', dir, newName),
  // 컬렉션 삭제(휴지통) → { ok, error? }
  deleteCollection: (dir) => ipcRenderer.invoke('library:deleteCollection', dir),
  // 탐색기에서 열기(dir 없으면 루트)
  reveal: (dir) => ipcRenderer.invoke('library:reveal', dir),
})

// ── 기존 상태/유틸 API (호환 유지) ─────────────────────────
contextBridge.exposeInMainWorld('localCdocs', {
  // 수동 새로고침 요청(서버 재시작 없이 창만 reload) — 메인의 reload IPC가 없으면 무시됨
  reload: () => ipcRenderer.send('local-cdocs:reload'),
  // 서버 상태 변경(기동/재시작/준비완료) 구독 → 스플래시 UI 갱신용
  onStatus: (cb) => {
    const handler = (_evt, payload) => cb(payload)
    ipcRenderer.on('local-cdocs:status', handler)
    // 구독 해제 함수 반환
    return () => ipcRenderer.removeListener('local-cdocs:status', handler)
  },
})
