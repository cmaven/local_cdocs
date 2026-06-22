<!-- 03-vitepress-dynamic-srcdir.md: 임의 폴더를 VitePress srcDir로 쓰는 메커니즘 | 생성일: 2026-06-22 | 수정일: 2026-06-22 -->

# 03. VitePress 동적 srcDir 메커니즘

## 핵심 개념

VitePress는 설정 파일(`config.mts`)이 있는 `.vitepress/` 디렉토리와
실제 마크다운 콘텐츠가 있는 `srcDir`을 분리할 수 있습니다.

local_cdocs는 이를 활용해 **테마/설정은 `vitepress-core/.vitepress/`** 에 고정하고,
**콘텐츠(마크다운)는 `LIBRARY_ROOT`(`Documents/local-cdocs`)** 에서 읽습니다.

```
vitepress-core/          ← VitePress 구동 디렉토리 (테마·설정 전용)
└── .vitepress/
    ├── config.mts       ← srcDir = LOCAL_DOCS_DIR ENV
    └── theme/           ← 커스텀 컴포넌트, 스타일

Documents/local-cdocs/   ← srcDir (콘텐츠 루트, 런타임 주입)
├── index.md
├── 시작하기/
└── 내프로젝트A/
```

---

## ENV 주입 방식

### docsRoot 결정 로직

`vitepress-core/.vitepress/config.mts` 최상단에서 `docsRoot`를 결정합니다.

```ts
// 사용자가 Electron에서 선택한 문서 폴더(ENV). 없으면 vitepress-core 상위를 기본값으로.
// 모든 스캔 함수(사이드바/카테고리/홈)와 srcDir이 이 경로를 기준으로 동작한다.
const docsRoot = process.env.LOCAL_DOCS_DIR
  ? path.resolve(process.env.LOCAL_DOCS_DIR)
  : path.resolve(__dirname, '..')
```

- **Electron 앱 내**: `LOCAL_DOCS_DIR=LIBRARY_ROOT`로 주입 → `Documents/local-cdocs`
- **CLI 단독 검증**: ENV 미설정 → `vitepress-core/..`(프로젝트 루트)을 폴백으로 사용

### VitePress srcDir 적용

```ts
export default defineConfig({
  // 사용자가 선택한 폴더(docsRoot)를 콘텐츠 소스로 사용.
  // .vitepress(테마/config)는 vitepress-core 안에 그대로 두고,
  // 마크다운만 외부 폴더에서 읽는다.
  srcDir: docsRoot,

  title: 'local-cdocs',
  description: '내 Markdown 라이브러리',
  // ...
})
```

`docsRoot`만 올바르게 주입되면 VitePress가 해당 폴더를 콘텐츠 루트로 인식합니다.

### 포트 주입

Electron이 동적으로 할당한 포트도 ENV로 주입합니다.

```ts
vite: {
  server: {
    host: '127.0.0.1',
    // Electron이 빈 포트를 동적 할당해 LOCAL_DOCS_PORT로 주입. 없으면 3030(CLI 단독용).
    port: process.env.LOCAL_DOCS_PORT ? Number(process.env.LOCAL_DOCS_PORT) : 3030,
    // 지정 포트가 사용 중이면 즉시 실패(임의 포트로 이동 방지)
    strictPort: true,
  },
}
```

---

## ESM 전용: .mts 확장자 이유

`config.ts`는 프로젝트 루트의 `package.json`에 `"type":"module"`이 없으면 CJS로 로드됩니다.
VitePress는 ESM 전용이므로 `require()` 방식 로드 시 충돌이 발생합니다.

`.mts` 확장자는 TypeScript에서 ESM 모듈임을 명시합니다. Node.js는 `.mts` → `.mjs`(ESM)로 처리하므로
`package.json` 설정과 무관하게 항상 ESM으로 로드됩니다.

또한 ESM에는 `__dirname`이 없으므로 `import.meta.url`에서 직접 계산합니다.

```ts
// ESM에는 __dirname이 없으므로 import.meta.url에서 직접 계산
const __dirname = path.dirname(fileURLToPath(import.meta.url))
```

---

## 폴더=카테고리 스캔 함수

`docsRoot` 직속 폴더가 각각 하나의 카테고리(컬렉션)가 됩니다.
`LIBRARY_ROOT` 아래에 컬렉션 폴더를 만들면 자동으로 카테고리로 인식됩니다.

### topLevelFolders: 카테고리 후보 목록

```ts
/** 최상위 카테고리 후보 폴더 목록(숨김/public/.vitepress 제외, 정렬) */
function topLevelFolders(): string[] {
  if (!fs.existsSync(docsRoot)) return []
  return fs.readdirSync(docsRoot).filter(e => {
    if (e.startsWith('.') || e === 'public') return false
    try { return fs.statSync(path.join(docsRoot, e)).isDirectory() } catch { return false }
  }).sort()
}
```

숨김 파일(`.`으로 시작), `public/`은 제외하고 나머지 폴더를 알파벳 순으로 반환합니다.

### scanCategory: 카테고리 내부 사이드바 항목 생성

```ts
/**
 * 카테고리 폴더 내부 → 사이드바 아이템.
 * 직속 .md는 항목으로(index.md는 "개요"로 맨 앞), 하위 폴더는 접이식 그룹으로.
 */
function scanCategory(catPath: string, urlBase: string): any[] {
  const items: any[] = []
  const md = mdFilesOf(catPath)
  if (md.includes('index.md')) {
    items.push({ text: getTitle(path.join(catPath, 'index.md'), 'index'), link: urlBase })
  }
  for (const f of md) {
    if (f === 'index.md') continue
    const name = f.replace(/\.md$/, '')
    items.push({ text: getTitle(path.join(catPath, f), name), link: `${urlBase}${name}` })
  }
  for (const d of subDirsOf(catPath)) {
    const subItems = scanDirectory(path.join(catPath, d), `${urlBase}${d}/`)
    if (subItems.length) {
      items.push({ text: formatName(d), collapsed: true, items: subItems })
    }
  }
  return items
}
```

- 카테고리 직속 `.md` → 사이드바 항목 (`index.md`는 "개요"로 맨 앞 배치)
- 하위 폴더 → `collapsed: true` 접이식 그룹

### firstPageOf: 카테고리 진입 링크 결정

카테고리 드롭다운 클릭 시 어느 페이지로 이동할지 결정합니다.

```ts
/** 카테고리 폴더의 첫 페이지 링크(index → 첫 .md → 첫 하위폴더의 첫 페이지) */
function firstPageOf(cat: string): string | null {
  const catPath = path.join(docsRoot, cat)
  const md = mdFilesOf(catPath)
  if (md.includes('index.md')) return `/${cat}/`
  if (md.length) return `/${cat}/${md[0].replace(/\.md$/, '')}`
  for (const d of subDirsOf(catPath)) {
    const dmd = mdFilesOf(path.join(catPath, d))
    if (dmd.includes('index.md')) return `/${cat}/${d}/`
    if (dmd.length) return `/${cat}/${d}/${dmd[0].replace(/\.md$/, '')}`
  }
  return null
}
```

우선순위: `index.md` → 첫 번째 `.md` → 하위 폴더의 `index.md` → 하위 폴더의 첫 `.md`

---

## 자동 사이드바 생성 (generateSidebar)

```ts
/**
 * 자동 사이드바 생성 — 최상위 "아무 폴더명"이나 카테고리/그룹이 된다(연도 강제 없음).
 * 각 카테고리는 /<folder>/ 경로에 사이드바를 갖는다.
 * 추가로, 루트에 직속 .md가 있으면(폴더 없이 평면 배치) "/" 사이드바로 폴백 노출.
 */
function generateSidebar(): Record<string, any[]> {
  const sidebar: Record<string, any[]> = {}
  for (const cat of topLevelFolders()) {
    const items = scanCategory(path.join(docsRoot, cat), `/${cat}/`)
    if (items.length) {
      sidebar[`/${cat}/`] = [{ text: formatName(cat), items }]
    }
  }
  // 루트 평면 .md 폴백(index.md 제외)
  const rootLoose = mdFilesOf(docsRoot).filter(f => f !== 'index.md')
  if (rootLoose.length) {
    const items = rootLoose.map(f => {
      const name = f.replace(/\.md$/, '')
      return { text: getTitle(path.join(docsRoot, f), name), link: `/${name}` }
    })
    sidebar['/'] = [{ text: formatName(path.basename(docsRoot)) || '문서', items }]
  }
  return sidebar
}
```

- `/{cat}/` 경로별로 독립 사이드바 생성 → 카테고리 이동 시 사이드바 전환
- 루트에 폴더 없이 `.md`만 있을 경우 `/` 사이드바로 폴백

---

## 카테고리 드롭다운 목록 (generateCategories)

```ts
/**
 * 카테고리 드롭다운 목록 — 최상위 폴더별 1개.
 * dir = 원본 폴더명(URL 경로 매칭용), label = 표시명(formatName), path = 첫 페이지 링크.
 */
function generateCategories(): { label: string; path: string; dir: string }[] {
  const categories: { label: string; path: string; dir: string }[] = []
  for (const cat of topLevelFolders()) {
    const link = firstPageOf(cat)
    if (link) categories.push({ label: formatName(cat), path: link, dir: cat })
  }
  return categories
}
```

- `dir` 필드: 원본 폴더명 그대로 → `CategoryDropdown.vue`에서 URL 경로 매칭에 사용
- `label` 필드: `formatName()`으로 사람이 읽기 좋게 변환 (`my-docs` → `My Docs`)
- `path` 필드: `firstPageOf()`가 결정한 첫 진입 링크

> **URL 인코딩 주의**: `CategoryDropdown.vue`는 `decodeURIComponent(route.path)` 후 `cat.dir`과 비교합니다.
> 공백이 있는 폴더명(예: `my docs`)이 URL에서 `%20`으로 인코딩되더라도 올바르게 매칭됩니다.

---

## 타이틀 결정 로직 (getTitle)

```ts
function getTitle(filePath: string, fileName: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(content)
    if (data.title) return data.title
  } catch {}
  if (fileName === 'index') return '개요'
  return fileName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
```

우선순위: frontmatter `title` → (`index`인 경우 `"개요"`) → 파일명 포맷 변환

---

## 폴더명 표시 변환 (formatName)

```ts
function formatName(name: string): string {
  return name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
```

예: `project-alpha` → `Project Alpha`, `local_docs` → `Local Docs`

---

## 빌드 시점 vs 런타임

모든 스캔 함수는 VitePress **서버 기동 시점**(config.mts 평가 시)에 파일 시스템을 읽습니다.
런타임에 폴더가 추가/삭제되면 사이드바가 갱신되지 않으므로 서버 재시작이 필요합니다.
이것이 chokidar 감시 후 서버를 재시작(kill → respawn)하는 이유입니다.

```ts
// 사이드바 + 카테고리 + 홈 프로젝트 자동 생성 (서버 기동 시 1회 실행)
const sidebar = generateSidebar()
const categories = generateCategories()
const homeProjects = generateHomeProjects()
```

---

## CLI 단독 검증 방법

Electron 없이 VitePress만 기동해 동적 srcDir 기능을 검증할 수 있습니다.

```bash
# 임의 폴더를 srcDir로 지정해 VitePress 기동
LOCAL_DOCS_DIR=/path/to/any/folder npm run vp:dev
# → http://127.0.0.1:3030 에서 해당 폴더의 .md가 렌더링되면 성공
```

`package.json`의 `"vp:dev": "vitepress dev vitepress-core"` 스크립트를 사용합니다.
