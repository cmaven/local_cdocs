/**
 * main.cjs: Electron 메인 프로세스 (CommonJS)
 * 상세: 관리형 라이브러리 모델. 고정 라이브러리 루트(Documents/local-cdocs)를
 *       항상 열고, 그 안의 컬렉션 폴더를 생성/가져오기/이름변경/삭제/탐색기열기 한다.
 *       VitePress dev 서버 자식 프로세스 기동/종료, 선호 포트 고정, chokidar 실시간 감지,
 *       라이브러리 IPC 핸들러, 설정 영속 IPC(settings:get/set), 네이티브 메뉴(라이브러리용),
 *       페이지 내 검색 IPC(find:start/stop/result).
 * 생성일: 2026-06-22 | 수정일: 2026-07-15
 */
const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')
const net = require('node:net')

const chokidar = require('chokidar')
const getPort = require('get-port') // v5: CJS default export (함수)
// electron-store v8(CJS) — v9+는 ESM 전용이므로 업그레이드 금지
const Store = require('electron-store')
const store = new Store()

// ── 빌드 정보 로드 (CI 빌드 시 electron/build-info.json 생성됨, 없으면 dev fallback) ──
let buildInfo = { sha: 'dev', builtAt: '' }
try {
  buildInfo = JSON.parse(fs.readFileSync(path.join(__dirname, 'build-info.json'), 'utf-8'))
} catch {
  // 로컬 dev 환경: build-info.json 없음 → sha='dev', builtAt='' 유지
}

// ── 경로 상수 ──────────────────────────────────────────────
// 앱 루트(개발 시 프로젝트 루트, 패키징 시 app.asar 또는 resources)
const APP_ROOT = path.resolve(__dirname, '..')
const VITEPRESS_CORE = path.join(APP_ROOT, 'vitepress-core')
const DOCS_TEMPLATE = path.join(APP_ROOT, 'docs-template')

// 라이브러리 루트: 항상 이 폴더를 연다(임의 폴더 열기 모델 폐기).
// Windows: C:/Users/<user>/Documents/local-cdocs
const LIBRARY_ROOT = path.join(app.getPath('documents'), 'local-cdocs')

// VitePress CLI의 JS 진입점(bin/vitepress.js). .bin/*.cmd 셰임에 의존하지 않고
// Electron 실행파일을 node 모드(ELECTRON_RUN_AS_NODE=1)로 직접 구동한다.
// → 별도 node 설치 불필요 + Linux에서 빌드한 Windows 패키지에서도 동작(크로스플랫폼 안전).
const VITEPRESS_ENTRY = path.join(APP_ROOT, 'node_modules', 'vitepress', 'bin', 'vitepress.js')

// ── 런타임 상태 ────────────────────────────────────────────
let win = null
let vpProcess = null // 현재 VitePress 자식 프로세스
let watcher = null // chokidar 인스턴스
let currentFolder = null // 현재 로드된 문서 폴더(항상 LIBRARY_ROOT)
let currentPort = null // 현재 VitePress 포트
let restartTimer = null // 디바운스 타이머
let isRestarting = false // 재시작 중 가드

// ════════════════════════════════════════════════════════════
// 라이브러리 fs 로직 (순수 함수로 분리 — 단위 검증 가능)
// 모든 함수는 root를 명시적으로 받아 LIBRARY_ROOT 외 경로 접근을 차단한다.
// ════════════════════════════════════════════════════════════

// 컬렉션 이름 검증: 빈값/경로구분자/'..'/예약문자 금지.
// 반환: { ok:true } 또는 { ok:false, error }
function validateCollectionName(name) {
  if (typeof name !== 'string') return { ok: false, error: '\uc774\ub984\uc774 \uc62c\ubc14\ub974\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.' }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: '\uc774\ub984\uc744 \uc785\ub825\ud558\uc138\uc694.' }
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: '\uc0ac\uc6a9\ud560 \uc218 \uc5c6\ub294 \uc774\ub984\uc785\ub2c8\ub2e4.' }
  // \uacbd\ub85c \uad6c\ubd84\uc790(/ \\) \ucc28\ub2e8
  if (/[\\/]/.test(trimmed)) return { ok: false, error: '\uc774\ub984\uc5d0 \uacbd\ub85c \uad6c\ubd84\uc790(/ \\)\ub97c \uc4f8 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' }
  // Windows \uae08\uc9c0 \ubb38\uc790(< > : " | ? *)\uc640 \uc81c\uc5b4 \ubb38\uc790\ub9cc \ucc28\ub2e8. \uacf5\ubc31/\ud558\uc774\ud508/\uc5b8\ub354\uc2a4\ucf54\uc5b4\ub294 \ud5c8\uc6a9.
  if (/[<>:"|?*\u0000-\u001f]/.test(trimmed)) return { ok: false, error: '\uc774\ub984\uc5d0 \uc0ac\uc6a9\ud560 \uc218 \uc5c6\ub294 \ubb38\uc790\uac00 \uc788\uc2b5\ub2c8\ub2e4.' }
  // Windows \uc608\uc57d \ub514\ubc14\uc774\uc2a4\uba85(CON/PRN/AUX/NUL/COM1-9/LPT1-9) \ucc28\ub2e8(\ub300\uc18c\ubb38\uc790 \ubb34\uc2dc)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(trimmed)) return { ok: false, error: '\uc608\uc57d\ub41c \uc774\ub984\uc740 \uc0ac\uc6a9\ud560 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.' }
  return { ok: true, name: trimmed }
}
// 주어진 경로가 root 직속(자식)인지 확인 → 디렉토리 탈출/중첩 차단.
// 반환: 정규화된 절대 경로 또는 null(루트 밖이거나 직속이 아님).
function resolveChild(root, dir) {
  if (typeof dir !== 'string' || !dir) return null
  // 단일 세그먼트만 허용(경로 구분자 포함 시 거부)
  if (/[\\/]/.test(dir) || dir === '.' || dir === '..') return null
  const target = path.resolve(root, dir)
  const parent = path.dirname(target)
  if (parent !== path.resolve(root)) return null // root 직속이 아니면 거부
  return target
}

// root/cat/project가 모두 단일 세그먼트 자식인지 검증 → 손자(프로젝트) 절대 경로 또는 null.
// 카테고리(cat) 폴더의 직속 하위 폴더(project)만 허용 → 디렉토리 탈출/중첩 차단.
function resolveGrandchild(root, cat, project) {
  const catPath = resolveChild(root, cat)
  if (!catPath) return null
  return resolveChild(catPath, project)
}

// 프로젝트(카테고리 하위 폴더) 이름 변경: 원본/대상 검증 → renameSync.
// 반환: { ok:true, name } 또는 { ok:false, error }
function renameProject(root, cat, project, newName) {
  const src = resolveGrandchild(root, cat, project)
  if (!src) return { ok: false, error: '대상 프로젝트가 올바르지 않습니다.' }
  if (!fs.existsSync(src)) return { ok: false, error: '프로젝트를 찾을 수 없습니다.' }
  const v = validateCollectionName(newName)
  if (!v.ok) return v
  const catPath = resolveChild(root, cat)
  const dest = resolveChild(catPath, v.name)
  if (!dest) return { ok: false, error: '사용할 수 없는 이름입니다.' }
  if (path.resolve(dest) !== path.resolve(src) && fs.existsSync(dest)) {
    return { ok: false, error: '같은 이름의 프로젝트가 이미 있습니다.' }
  }
  try {
    fs.renameSync(src, dest)
    return { ok: true, name: v.name }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// 이름 충돌 시 ' (2)', ' (3)' ... suffix를 붙여 사용 가능한 경로를 찾는다.
// 반환: { dir, dest } (실제 사용할 폴더명과 절대 경로)
function uniqueDest(root, baseName) {
  let candidate = baseName
  let dest = path.join(root, candidate)
  let n = 2
  while (fs.existsSync(dest)) {
    candidate = `${baseName}-${n}`
    dest = path.join(root, candidate)
    n += 1
  }
  return { dir: candidate, dest }
}

// 라이브러리 루트 보장 + 최초 시드(시작하기 컬렉션 + 루트 index.md).
// 이미 있으면 건드리지 않는다(idempotent).
function ensureLibrary(root, templateDir) {
  // 루트 생성
  fs.mkdirSync(root, { recursive: true })

  // 시작하기 컬렉션 시드: docs-template/ 내용을 복사. 폴더가 없을 때만.
  const seedDir = path.join(root, '시작하기')
  if (!fs.existsSync(seedDir) && fs.existsSync(templateDir)) {
    try {
      fs.cpSync(templateDir, seedDir, { recursive: true })
    } catch (e) {
      console.error('[local-cdocs] 시작하기 시드 실패:', e)
    }
  }

  // 마이그레이션: 과거 시드가 남긴 시작하기/index.md(루트 대시보드 누수)를 제거.
  // 카테고리 직속 index.md가 사이드바에 군더더기 항목을 만들므로, <HomePage>를 담은 누수본만 정리한다.
  const seedIndex = path.join(seedDir, 'index.md')
  try {
    if (fs.existsSync(seedIndex) && fs.readFileSync(seedIndex, 'utf-8').includes('<HomePage')) {
      fs.rmSync(seedIndex)
    }
  } catch (e) {
    console.error('[local-cdocs] 시작하기 index.md 정리 실패:', e)
  }

  // 루트 index.md(라이브러리 대시보드 = HomePage). 없을 때만 생성.
  const indexPath = path.join(root, 'index.md')
  if (!fs.existsSync(indexPath)) {
    try {
      fs.writeFileSync(indexPath, '---\nlayout: page\n---\n\n<HomePage />\n', 'utf-8')
    } catch (e) {
      console.error('[local-cdocs] 루트 index.md 생성 실패:', e)
    }
  }
}

// 새 컬렉션 생성: 검증 → 중복 확인 → 폴더만 생성(빈 상태는 홈에서 처리).
// 반환: { ok:true } 또는 { ok:false, error }
function createCollection(root, name) {
  const v = validateCollectionName(name)
  if (!v.ok) return v
  const dest = resolveChild(root, v.name)
  if (!dest) return { ok: false, error: '사용할 수 없는 이름입니다.' }
  if (fs.existsSync(dest)) return { ok: false, error: '같은 이름의 컬렉션이 이미 있습니다.' }
  try {
    fs.mkdirSync(dest, { recursive: false })
    return { ok: true, name: v.name }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// 외부 폴더를 라이브러리로 복사(재귀). 이름 충돌 시 suffix.
// 반환: { ok:true, name } 또는 { ok:false, error }
function importFolderTo(root, srcPath) {
  if (typeof srcPath !== 'string' || !srcPath) return { ok: false, error: '원본 경로가 없습니다.' }
  let stat
  try {
    stat = fs.statSync(srcPath)
  } catch {
    return { ok: false, error: '원본 폴더를 찾을 수 없습니다.' }
  }
  if (!stat.isDirectory()) return { ok: false, error: '폴더만 가져올 수 있습니다.' }
  const base = path.basename(srcPath)
  const nameCheck = validateCollectionName(base)
  if (!nameCheck.ok) return { ok: false, error: '폴더 이름을 컬렉션 이름으로 쓸 수 없습니다.' }
  const { dir, dest } = uniqueDest(root, base)
  try {
    fs.cpSync(srcPath, dest, { recursive: true })
    return { ok: true, name: dir }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// 컬렉션 이름 변경: 원본/대상 검증 → renameSync.
// 반환: { ok:true, name } 또는 { ok:false, error }
function renameCollection(root, dir, newName) {
  const src = resolveChild(root, dir)
  if (!src) return { ok: false, error: '대상 컬렉션이 올바르지 않습니다.' }
  if (!fs.existsSync(src)) return { ok: false, error: '컬렉션을 찾을 수 없습니다.' }
  const v = validateCollectionName(newName)
  if (!v.ok) return v
  const dest = resolveChild(root, v.name)
  if (!dest) return { ok: false, error: '사용할 수 없는 이름입니다.' }
  if (path.resolve(dest) !== path.resolve(src) && fs.existsSync(dest)) {
    return { ok: false, error: '같은 이름의 컬렉션이 이미 있습니다.' }
  }
  try {
    fs.renameSync(src, dest)
    return { ok: true, name: v.name }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── 유틸: 렌더러에 상태 메시지 전송 ────────────────────────
function sendStatus(message, hint) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('local-cdocs:status', { message, hint })
  }
}

// ── 유틸: 스플래시 화면 로드 ───────────────────────────────
function loadSplash(message) {
  if (!win || win.isDestroyed()) return
  win.loadFile(path.join(__dirname, 'splash.html')).then(() => {
    if (message) sendStatus(message)
  }).catch(() => {})
}

// ── 유틸: 포트가 응답할 때까지 대기(서버 ready 감지) ───────
function waitForPort(port, { timeout = 60000, interval = 250 } = {}) {
  const deadline = Date.now() + timeout
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => { socket.destroy(); resolve() })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) return reject(new Error('VitePress 서버 응답 시간 초과'))
        setTimeout(tryConnect, interval)
      })
    }
    tryConnect()
  })
}

// ── VitePress 자식 프로세스 종료(좀비 방지) ────────────────
function killVitePress() {
  return new Promise((resolve) => {
    if (!vpProcess) return resolve()
    const proc = vpProcess
    vpProcess = null
    proc.removeAllListeners('exit')
    proc.once('exit', () => resolve())
    try {
      if (process.platform === 'win32') {
        // Windows: 프로세스 트리 전체 종료
        spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'])
      } else {
        proc.kill('SIGTERM')
      }
    } catch {
      resolve()
    }
    // 안전장치: 2초 내 미종료 시 강제 resolve
    setTimeout(resolve, 2000)
  })
}

// ── VitePress dev 서버를 지정 폴더로 기동 ─────────────────
async function startVitePress(folder) {
  // 기존 서버 정리
  await killVitePress()

  // 선호 포트 배열로 고정 할당(get-port v5).
  // 같은 origin(127.0.0.1:4873)이 유지되어야 localStorage(테마/설정)가 재시작 후에도 살아남는다.
  // 모두 점유된 경우 get-port가 임의 포트로 fallback하지만, 그 경우에도 Phase 2 IPC 영속화가 보증한다.
  currentPort = await getPort({ port: [4873, 4874, 4875, 4876, 4877] })

  sendStatus('문서 서버를 기동하는 중...', folder)

  // ENV로 LOCAL_DOCS_DIR(콘텐츠 폴더) + LOCAL_DOCS_PORT + 버전/SHA/빌드일 주입.
  const env = {
    ...process.env,
    LOCAL_DOCS_DIR: folder,
    LOCAL_DOCS_PORT: String(currentPort),
    ELECTRON_RUN_AS_NODE: '1', // Electron 실행파일을 순수 node처럼 동작시킴
    CDOCS_APP_VERSION: app.getVersion(),          // package.json version (예: 1.0.0)
    CDOCS_BUILD_SHA: buildInfo.sha,               // 커밋 SHA 앞 7자리, 또는 'dev'
    CDOCS_BUILT_AT: buildInfo.builtAt,            // YYYY-MM-DD, 없으면 ''
  }

  // process.execPath(= Electron exe)를 node 모드로 사용해 vitepress JS 진입점을 실행.
  // shell 불필요(.cmd 셰임 의존 제거) → 경로 공백/크로스플랫폼 문제 없음.
  vpProcess = spawn(process.execPath, [VITEPRESS_ENTRY, 'dev', VITEPRESS_CORE], {
    cwd: APP_ROOT,
    env,
    windowsHide: true,
  })

  vpProcess.stdout?.on('data', (d) => process.stdout.write(`[vitepress] ${d}`))
  vpProcess.stderr?.on('data', (d) => process.stderr.write(`[vitepress] ${d}`))
  vpProcess.on('exit', (code) => {
    // 예기치 않은 종료(재시작이 아닌 경우)
    if (!isRestarting && code !== 0 && code !== null) {
      sendStatus('문서 서버가 예기치 않게 종료되었습니다.', '새로고침을 시도하세요.')
    }
  })

  // 포트 listen 대기 후 URL 로드
  await waitForPort(currentPort)
  return currentPort
}

// ── 폴더 로드(전체 흐름): 라이브러리 보장 → 서버 기동 → 로드 → watch ──
async function loadFolder(folder) {
  currentFolder = folder

  loadSplash('라이브러리를 여는 중...')

  // 라이브러리 루트 보장(루트/시드/index.md). idempotent.
  ensureLibrary(folder, DOCS_TEMPLATE)

  try {
    const port = await startVitePress(folder)
    await win.loadURL(`http://127.0.0.1:${port}/`)
    setupWatcher(folder)
  } catch (e) {
    console.error('[local-cdocs] 라이브러리 로드 실패:', e)
    loadSplash('문서 서버 기동에 실패했습니다: ' + e.message)
  }
}

// ── chokidar로 폴더 watch → .md/디렉토리 변경 시 디바운스 재시작 ──
function setupWatcher(folder) {
  if (watcher) { watcher.close(); watcher = null }

  watcher = chokidar.watch(folder, {
    ignored: /(^|[/\\])\.|node_modules/, // 숨김 파일/node_modules 무시
    ignoreInitial: true, // 초기 스캔 이벤트 무시
    persistent: true,
    depth: 99,
  })

  const onChange = (reason) => () => scheduleRestart(reason)

  watcher
    .on('add', (p) => { if (p.endsWith('.md')) scheduleRestart(`새 문서: ${p}`) })
    .on('unlink', (p) => { if (p.endsWith('.md')) scheduleRestart(`문서 삭제: ${p}`) })
    .on('addDir', onChange('새 디렉토리'))
    .on('unlinkDir', onChange('디렉토리 삭제'))
}

// ── 디바운스 2초 후 서버 재시작 → 창 reload ───────────────
function scheduleRestart(reason) {
  console.log(`[local-cdocs] 변경 감지: ${reason}`)
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(async () => {
    if (isRestarting || !currentFolder) return
    isRestarting = true
    loadSplash('라이브러리가 변경되어 갱신하는 중...')
    try {
      const port = await startVitePress(currentFolder)
      await win.loadURL(`http://127.0.0.1:${port}/`)
    } catch (e) {
      console.error('[local-cdocs] 재시작 실패:', e)
      loadSplash('재시작 실패: ' + e.message)
    } finally {
      isRestarting = false
    }
  }, 2000)
}

// ── 메뉴/IPC에서 공유하는 라이브러리 액션 래퍼 ─────────────

// 폴더 가져오기: 다이얼로그 → 복사. 반환: { ok, name?, error? }
async function pickAndImportFolder() {
  const result = await dialog.showOpenDialog(win, {
    title: '가져올 폴더 선택',
    properties: ['openDirectory'],
    defaultPath: app.getPath('documents'),
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: 'canceled' }
  }
  return importFolderTo(LIBRARY_ROOT, result.filePaths[0])
}

// 라이브러리/컬렉션 탐색기 열기. dir 없으면 루트.
async function revealCollection(dir) {
  let target = LIBRARY_ROOT
  if (dir) {
    const resolved = resolveChild(LIBRARY_ROOT, dir)
    if (!resolved) return // 루트 밖이면 무시
    target = resolved
  }
  await shell.openPath(target)
}

// 새 컬렉션(네이티브 메뉴용). BrowserWindow는 window.prompt를 지원하지 않으므로,
// 대시보드(홈)로 이동하며 해시(#new-collection)를 붙여 대시보드의 커스텀 입력 모달을 자동으로 연다.
// 실제 생성은 대시보드 모달 → window.localcdocs.createCollection IPC가 담당.
function promptCreateCollection() {
  if (!win || win.isDestroyed() || !currentPort) return
  win.loadURL(`http://127.0.0.1:${currentPort}/#new-collection`).catch(() => {})
}

// ── 애플리케이션 메뉴(라이브러리용) ────────────────────────
function buildMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        { label: '새 컬렉션...', accelerator: 'CmdOrCtrl+N', click: () => promptCreateCollection() },
        { label: '폴더 가져오기...', click: () => pickAndImportFolder() },
        { label: '라이브러리 폴더 열기', click: () => revealCollection() },
        { type: 'separator' },
        { label: '새로고침', accelerator: 'CmdOrCtrl+R', click: () => { if (win) win.reload() } },
        { type: 'separator' },
        { label: '종료', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '보기',
      submenu: [
        {
          label: '다크 모드 토글',
          accelerator: 'CmdOrCtrl+D',
          click: () => {
            // VitePress 정식 appearance 스위치(.VPSwitchAppearance)를 클릭한다.
            // 단순 classList.toggle('dark')는 CSS만 바꾸고 VitePress의 isDark 상태를 갱신하지 않아
            // Mermaid 등 isDark에 반응하는 컴포넌트가 라이트 테마로 남는 문제가 있다.
            // 정식 스위치는 isDark 갱신 + localStorage 영속까지 처리. (네비바가 숨겨져도 DOM엔 존재)
            if (win) {
              win.webContents.executeJavaScript(
                "(function(){var s=document.querySelector('.VPSwitchAppearance');" +
                "if(s){s.click();return 'switch';}" +
                "document.documentElement.classList.toggle('dark');return 'fallback';})()"
              ).catch(() => {})
            }
          },
        },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── 창 생성 ────────────────────────────────────────────────
function createWindow() {
  // 창 제목: 버전·SHA를 고정 표시 → 설치 직후 타이틀바만 봐도 어떤 빌드인지 확인 가능
  const windowTitle = `local-cdocs v${app.getVersion()}·${buildInfo.sha}`

  win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: windowTitle,
    backgroundColor: '#1b1b1f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // VitePress 페이지 타이틀이 창 제목을 덮어쓰지 않도록 고정
  win.on('page-title-updated', (e) => e.preventDefault())

  // 페이지 내 검색 결과를 렌더러로 전달 (채널: find:result)
  win.webContents.on('found-in-page', (_e, r) => {
    win.webContents.send('find:result', {
      activeMatchOrdinal: r.activeMatchOrdinal,
      matches: r.matches,
    })
  })

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  buildMenu()
  loadSplash('라이브러리를 준비하는 중...')

  // 관리형 라이브러리: 항상 고정 루트를 연다.
  loadFolder(LIBRARY_ROOT)
}

// ── IPC 핸들러 (공유 계약: window.localcdocs) ──────────────
// 모든 핸들러는 LIBRARY_ROOT 외 경로 접근을 차단하고 try/catch로 안전 반환.

ipcMain.handle('library:getRoot', () => LIBRARY_ROOT)

ipcMain.handle('library:createCollection', (_evt, name) => {
  try {
    return createCollection(LIBRARY_ROOT, name)
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:importFolder', async () => {
  try {
    return await pickAndImportFolder()
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:renameCollection', (_evt, dir, newName) => {
  try {
    return renameCollection(LIBRARY_ROOT, dir, newName)
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:deleteCollection', async (_evt, dir) => {
  try {
    const target = resolveChild(LIBRARY_ROOT, dir)
    if (!target) return { ok: false, error: '대상 컬렉션이 올바르지 않습니다.' }
    if (!fs.existsSync(target)) return { ok: false, error: '컬렉션을 찾을 수 없습니다.' }
    // 영구삭제 금지 — 휴지통으로 이동
    await shell.trashItem(target)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:reveal', async (_evt, dir) => {
  try {
    await revealCollection(dir)
  } catch (e) {
    console.error('[local-cdocs] reveal 실패:', e)
  }
})

// ── 프로젝트(카테고리 하위 폴더) 단위 관리 ─────────────────
ipcMain.handle('library:renameProject', (_evt, cat, project, newName) => {
  try {
    return renameProject(LIBRARY_ROOT, cat, project, newName)
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:deleteProject', async (_evt, cat, project) => {
  try {
    const target = resolveGrandchild(LIBRARY_ROOT, cat, project)
    if (!target) return { ok: false, error: '대상 프로젝트가 올바르지 않습니다.' }
    if (!fs.existsSync(target)) return { ok: false, error: '프로젝트를 찾을 수 없습니다.' }
    // 영구삭제 금지 — 휴지통으로 이동
    await shell.trashItem(target)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('library:revealProject', async (_evt, cat, project) => {
  try {
    const target = resolveGrandchild(LIBRARY_ROOT, cat, project)
    if (target) await shell.openPath(target)
  } catch (e) {
    console.error('[local-cdocs] revealProject 실패:', e)
  }
})

// ── 설정 영속 IPC (electron-store 기반) ─────────────────────
// 채널: settings:get / settings:set (preload 계약과 동일 — 이름 변경 금지)
// key 'cdocsSettings'에 테마·폰트·줄간격 등 사용자 설정 객체를 통째로 저장한다.
// localStorage(origin 단위)와 달리 포트가 바뀌어도 항상 동일한 값을 반환한다.
ipcMain.handle('settings:get', () => store.get('cdocsSettings') ?? null)
ipcMain.handle('settings:set', (_evt, value) => { store.set('cdocsSettings', value) })

// ── 페이지 내 검색 IPC (채널: find:start / find:stop) ───────
// 채널명 변경 금지 — preload.cjs 계약과 동일
ipcMain.handle('find:start', (_evt, text, opts) => {
  if (!win) return
  // 빈 문자열은 findInPage 예외 → stopFindInPage로 처리
  if (!text) {
    win.webContents.stopFindInPage('clearSelection')
    return
  }
  win.webContents.findInPage(text, opts)
})
ipcMain.handle('find:stop', () => {
  if (!win) return
  win.webContents.stopFindInPage('clearSelection')
})

// ── 앱 라이프사이클 ────────────────────────────────────────
// 단일 인스턴스 보장(중복 실행 방지)
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })

  app.whenReady().then(createWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

// 모든 창 종료 시 자식 프로세스 정리 후 앱 종료
app.on('window-all-closed', async () => {
  if (watcher) { await watcher.close(); watcher = null }
  await killVitePress()
  if (process.platform !== 'darwin') app.quit()
})

// 종료 직전 자식 VitePress 프로세스 확실히 정리(좀비 방지)
app.on('before-quit', async (e) => {
  if (vpProcess || watcher) {
    e.preventDefault()
    if (watcher) { await watcher.close(); watcher = null }
    await killVitePress()
    app.exit(0)
  }
})

// ── 단위 검증용 export (Electron 런타임에선 무시됨) ─────────
// require.main !== module 이면서 module.exports 접근 가능한 환경(순수 Node 테스트)에서
// fs 순수 함수를 직접 검증할 수 있도록 노출한다.
module.exports = {
  validateCollectionName,
  resolveChild,
  uniqueDest,
  ensureLibrary,
  createCollection,
  importFolderTo,
  renameCollection,
  resolveGrandchild,
  renameProject,
}
