<!-- 09-managed-library.md: 관리형 라이브러리 백엔드(고정 루트/시드/fs 순수함수/IPC 6종/preload) | 생성일: 2026-06-22 -->

# 09. 관리형 라이브러리 백엔드 (Managed Library)

> 이 문서는 Electron 메인 프로세스(`electron/main.cjs`)와 preload 브리지(`electron/preload.cjs`)가
> "관리형 라이브러리" 모델을 어떻게 구현하는지를 **실제 코드 발췌**와 함께 설명한다.
> 임의 폴더 열기 모델을 폐기하고, 항상 **고정 라이브러리 루트** 하나만 열어
> 그 안의 컬렉션 폴더를 앱 안에서 생성/가져오기/이름변경/삭제/탐색기열기 한다.

관련 문서: [10. IPC와 대시보드](./10-ipc-and-dashboard.md)

---

## 1. 설계 개요

핵심 아이디어는 세 가지다.

1. **고정 루트(LIBRARY_ROOT)**: 앱은 항상 `Documents/local-cdocs` 한 폴더만 연다. 사용자가 폴더를 직접 고를 필요가 없다.
2. **fs 순수 함수 분리**: 파일시스템 조작 로직을 `root`를 명시적으로 받는 순수 함수로 분리해, 단위 검증이 가능하고 IPC 핸들러는 얇은 래퍼가 된다.
3. **경로 탈출 차단**: 모든 컬렉션 조작은 루트 직속 단일 세그먼트만 허용한다. `..`, 경로 구분자, 중첩 경로를 거부해 `LIBRARY_ROOT` 밖으로 나가지 못하게 한다.

```mermaid
flowchart TD
  R[window.localcdocs.*<br/>렌더러 호출] --> P[preload.cjs<br/>contextBridge]
  P --> I[ipcMain.handle('library:*')<br/>얇은 래퍼 + try/catch]
  I --> F[fs 순수 함수<br/>validate/resolveChild/uniqueDest/...]
  F --> FS[(LIBRARY_ROOT<br/>Documents/local-cdocs)]
  M[네이티브 메뉴] --> I
```

---

## 2. 고정 라이브러리 루트

루트는 OS의 문서 폴더 아래 `local-cdocs`로 고정된다. `app.getPath('documents')`를 쓰므로 Windows에서는 `C:/Users/<user>/Documents/local-cdocs`가 된다.

```js
// electron/main.cjs
// 라이브러리 루트: 항상 이 폴더를 연다(임의 폴더 열기 모델 폐기).
// Windows: C:/Users/<user>/Documents/local-cdocs
const LIBRARY_ROOT = path.join(app.getPath('documents'), 'local-cdocs')
```

창을 만들 때 사용자가 마지막에 본 폴더 같은 영속 상태를 복원하지 않고, **무조건** 이 루트를 연다.

```js
// electron/main.cjs — createWindow()
buildMenu()
loadSplash('라이브러리를 준비하는 중...')

// 관리형 라이브러리: 항상 고정 루트를 연다.
loadFolder(LIBRARY_ROOT)
```

---

## 3. 최초 시드 (ensureLibrary)

`loadFolder`는 서버를 띄우기 전에 `ensureLibrary`를 호출해 루트와 초기 콘텐츠를 보장한다. 이 함수는 **idempotent**하다 — 이미 있는 것은 건드리지 않으므로 매 실행마다 안전하게 호출할 수 있다.

```js
// electron/main.cjs
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
```

세 가지를 보장한다.

- **루트 폴더**: `mkdirSync(..., { recursive: true })`.
- **시작하기 컬렉션**: `docs-template/`를 `시작하기/`로 통째로 복사 — 첫 실행 시 빈 화면 대신 환영 컬렉션을 보여준다.
- **루트 `index.md`**: `layout: page` + `<HomePage />`. 이 한 파일이 [대시보드](./10-ipc-and-dashboard.md)를 렌더한다.

`loadFolder`에서의 호출 위치:

```js
// electron/main.cjs — loadFolder()
loadSplash('라이브러리를 여는 중...')

// 라이브러리 루트 보장(루트/시드/index.md). idempotent.
ensureLibrary(folder, DOCS_TEMPLATE)
```

---

## 4. fs 순수 함수 (단위 검증 가능)

파일시스템 로직은 Electron API에 의존하지 않는 순수 함수로 분리되어 있다. 모두 `root`를 **명시적 인자**로 받으므로 테스트에서 임시 디렉토리를 넘겨 검증할 수 있고, 핸들러는 단지 `LIBRARY_ROOT`를 넘겨주는 얇은 래퍼가 된다. 파일 끝에서 이들을 export한다.

```js
// electron/main.cjs — 파일 하단
// 단위 검증용 export (Electron 런타임에선 무시됨)
module.exports = {
  validateCollectionName,
  resolveChild,
  uniqueDest,
  ensureLibrary,
  createCollection,
  importFolderTo,
  renameCollection,
}
```

### 4.1 이름 검증 — validateCollectionName

빈값, 경로 구분자, `.`/`..`, Windows 금지 문자, 제어 문자, 예약 디바이스명을 차단한다. 공백/하이픈/언더스코어는 **허용**한다(컬렉션 이름으로 자연스럽기 때문). 아래는 원본 소스(에러 메시지가 `\uXXXX` 이스케이프로 작성됨)를 가독성을 위해 한글로 디코드해 표기한 것으로, **정규식과 분기 로직은 원본과 동일**하다.

```js
// electron/main.cjs
// 컬렉션 이름 검증: 빈값/경로구분자/'..'/예약문자 금지.
// 반환: { ok:true } 또는 { ok:false, error }
function validateCollectionName(name) {
  if (typeof name !== 'string') return { ok: false, error: '이름이 올바르지 않습니다.' }
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: '이름을 입력하세요.' }
  if (trimmed === '.' || trimmed === '..') return { ok: false, error: '사용할 수 없는 이름입니다.' }
  // 경로 구분자(/ \) 차단
  if (/[\\/]/.test(trimmed)) return { ok: false, error: '이름에 경로 구분자를 쓸 수 없습니다.' }
  // Windows 금지 문자(< > : " | ? *)와 제어 문자(\u0000-\u001f)만 차단. 공백/하이픈/언더스코어는 허용.
  if (/[<>:"|?*\u0000-\u001f]/.test(trimmed)) return { ok: false, error: '이름에 사용할 수 없는 문자가 있습니다.' }
  // Windows 예약 디바이스명(CON/PRN/AUX/NUL/COM1-9/LPT1-9) 차단(대소문자 무시)
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(trimmed)) return { ok: false, error: '예약된 이름은 사용할 수 없습니다.' }
  return { ok: true, name: trimmed }
}
```

### 4.2 경로 탈출 차단 — resolveChild

검증의 핵심. 주어진 `dir`이 `root`의 **직속 자식**인지 확인한다. 단일 세그먼트가 아니거나 `path.resolve` 후 부모가 루트가 아니면 `null`을 반환해 거부한다.

```js
// electron/main.cjs
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
```

이 함수는 **이중 방어**다. ① 문자열 패턴으로 구분자/`..`를 먼저 거른 뒤, ② `path.resolve`로 실제 정규화한 경로의 부모가 루트와 일치하는지 비교한다. 따라서 `../../etc/passwd`, `sub/dir`, 절대 경로 주입 같은 입력은 모두 `null`이 되어 그 이후 fs 호출이 일어나지 않는다.

### 4.3 이름 충돌 처리 — uniqueDest

가져오기 등에서 같은 이름이 이미 있으면 `-2`, `-3` … 접미사를 붙여 사용 가능한 경로를 찾는다. (접미사는 공백 없는 형태로, URL 인코딩 문제를 피한다.)

```js
// electron/main.cjs
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
```

### 4.4 컬렉션 생성 — createCollection

검증 → `resolveChild`로 안전 경로 확보 → 중복 확인 → 폴더 + 기본 `index.md` 생성. `mkdirSync`에 `recursive: false`를 쓰는 점에 주목 — 직속 폴더 하나만 만든다.

```js
// electron/main.cjs
function createCollection(root, name) {
  const v = validateCollectionName(name)
  if (!v.ok) return v
  const dest = resolveChild(root, v.name)
  if (!dest) return { ok: false, error: '사용할 수 없는 이름입니다.' }
  if (fs.existsSync(dest)) return { ok: false, error: '같은 이름의 컬렉션이 이미 있습니다.' }
  try {
    fs.mkdirSync(dest, { recursive: false })
    fs.writeFileSync(path.join(dest, 'index.md'), `# ${v.name}\n`, 'utf-8')
    return { ok: true, name: v.name }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
```

### 4.5 외부 폴더 가져오기 — importFolderTo

원본이 실제 디렉토리인지, 그 basename이 유효한 컬렉션 이름인지 검증한 뒤 `uniqueDest`로 충돌을 피해 재귀 복사한다. **이동이 아니라 복사**라 원본은 그대로 남는다.

```js
// electron/main.cjs
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
```

### 4.6 이름 변경 — renameCollection

원본과 대상 **양쪽** 모두 `resolveChild`로 검증한다. 같은 이름(대소문자 차이 등)으로의 변경은 충돌로 보지 않도록 `path.resolve` 비교로 자기 자신을 예외 처리한다.

```js
// electron/main.cjs
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
```

---

## 5. IPC 핸들러 6종

모든 핸들러는 **얇은 래퍼**다. `LIBRARY_ROOT`를 순수 함수에 넘기고, 예외를 `{ ok:false, error }`로 변환해 렌더러가 항상 직렬화 가능한 결과를 받게 한다.

```js
// electron/main.cjs
// IPC 핸들러 (공유 계약: window.localcdocs)
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
```

삭제는 **영구 삭제가 아니라 휴지통 이동**이다. `shell.trashItem`을 쓰고, 그 전에 `resolveChild`로 대상이 루트 직속인지 다시 확인한다.

```js
// electron/main.cjs
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
```

가져오기와 탐색기 열기는 Electron API(다이얼로그/셸)를 쓰므로 메인에 별도 래퍼가 있다. 가져오기는 폴더 선택 다이얼로그를 띄운 뒤 `importFolderTo`에 위임하고, reveal은 `dir`이 있으면 `resolveChild`로 검증 후 그 폴더를, 없으면 루트를 연다.

```js
// electron/main.cjs
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
```

| IPC 채널 | 핸들러 | 비고 |
|---|---|---|
| `library:getRoot` | `() => LIBRARY_ROOT` | 루트 경로 반환 |
| `library:createCollection` | `createCollection(LIBRARY_ROOT, name)` | 검증 + 폴더/index.md 생성 |
| `library:importFolder` | `pickAndImportFolder()` | 다이얼로그 → `cpSync` 복사 |
| `library:renameCollection` | `renameCollection(LIBRARY_ROOT, dir, newName)` | 양쪽 검증 |
| `library:deleteCollection` | `shell.trashItem(target)` | **휴지통 이동**(영구삭제 X) |
| `library:reveal` | `revealCollection(dir)` | `shell.openPath`, dir 없으면 루트 |

---

## 6. preload contextBridge

렌더러는 메인의 `ipcRenderer`에 직접 닿지 않는다. preload가 `contextBridge.exposeInMainWorld`로 안전한 함수 표면만 노출한다. `dir`은 `LIBRARY_ROOT` 직속 폴더명(= config의 `cat.dir`)이다.

```js
// electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron')

// 관리형 라이브러리 API (공유 IPC 계약)
// dir = LIBRARY_ROOT 직속 폴더명(= config의 cat.dir)
contextBridge.exposeInMainWorld('localcdocs', {
  getRoot: () => ipcRenderer.invoke('library:getRoot'),
  createCollection: (name) => ipcRenderer.invoke('library:createCollection', name),
  importFolder: () => ipcRenderer.invoke('library:importFolder'),
  renameCollection: (dir, newName) => ipcRenderer.invoke('library:renameCollection', dir, newName),
  deleteCollection: (dir) => ipcRenderer.invoke('library:deleteCollection', dir),
  reveal: (dir) => ipcRenderer.invoke('library:reveal', dir),
})
```

`webPreferences`는 `contextIsolation: true`, `nodeIntegration: false`로 설정되어 있어, 렌더러는 위 화이트리스트된 함수 외에는 Node/IPC에 접근할 수 없다.

---

## 7. 보안 요약: LIBRARY_ROOT 밖 경로 차단

관리형 모델의 보안은 "렌더러가 보내는 `dir`/`name`을 절대 신뢰하지 않는다"에 기반한다. 방어선은 다음과 같다.

1. **단일 루트 고정** — 조작 대상은 언제나 `LIBRARY_ROOT`. 렌더러는 임의 절대 경로를 지정할 수 없다(생성/이름변경/삭제 모두 `dir`/`name` 세그먼트만 받음).
2. **resolveChild 이중 검증** — 문자열 패턴(`[\\/]`, `.`, `..`)으로 1차 거른 뒤, `path.resolve` 후 부모가 루트와 동일한지 비교해 디렉토리 탈출·중첩을 막는다.
3. **이름 화이트리스트** — `validateCollectionName`이 Windows 금지 문자·제어 문자·예약 디바이스명을 차단.
4. **삭제 = 휴지통** — `shell.trashItem`으로 복구 가능. 영구 삭제 경로가 없다.
5. **contextIsolation** — preload가 노출한 6개 함수 외 IPC 표면이 없다.

요컨대 렌더러가 `deleteCollection('../../../Windows')` 같은 입력을 보내더라도 `resolveChild`가 `null`을 반환해 그 이후 fs 호출 자체가 일어나지 않는다.
