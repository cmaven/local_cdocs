/**
 * config.mts: VitePress 사이트 설정 - 자동 사이드바 생성 포함 (ESM)
 * 상세: LOCAL_DOCS_DIR ENV로 지정된 사용자 폴더의 .md를 콘텐츠로, 본 테마를 UI로 렌더
 *       (ENV 미지정 시 vitepress-core/.. 기본 폴더 사용 — CLI 단독 검증용)
 *       package.json에 "type":"module"이 없어 .ts는 CJS로 로드돼 vitepress(ESM) require 실패 →
 *       .mts 확장자로 ESM 로딩을 강제한다. ESM이라 __dirname 대신 import.meta.url 사용.
 * 생성일: 2026-04-08 | 수정일: 2026-06-24
 */
import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'

// ESM에는 __dirname이 없으므로 import.meta.url에서 직접 계산
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 사용자가 Electron에서 선택한 문서 폴더(ENV). 없으면 vitepress-core 상위를 기본값으로.
// 모든 스캔 함수(사이드바/카테고리/홈)와 srcDir이 이 경로를 기준으로 동작한다.
const docsRoot = process.env.LOCAL_DOCS_DIR
  ? path.resolve(process.env.LOCAL_DOCS_DIR)
  : path.resolve(__dirname, '..')

/**
 * .md 파일에서 frontmatter title을 읽거나, 파일명을 포맷하여 반환
 */
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

/**
 * 디렉토리 내 .md 파일을 스캔하여 사이드바 아이템 배열 생성
 * index.md는 "개요"로 맨 앞에 배치
 */
function scanDirectory(dirPath: string, urlPrefix: string): { text: string; link: string }[] {
  if (!fs.existsSync(dirPath)) return []

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .sort()

  const items: { text: string; link: string }[] = []

  // index.md를 먼저 처리
  if (files.includes('index.md')) {
    const title = getTitle(path.join(dirPath, 'index.md'), 'index')
    items.push({ text: title, link: `${urlPrefix}` })
  }

  // 나머지 파일
  for (const file of files) {
    if (file === 'index.md') continue
    const name = file.replace('.md', '')
    const title = getTitle(path.join(dirPath, file), name)
    items.push({ text: title, link: `${urlPrefix}${name}` })
  }

  return items
}

/** 최상위 카테고리 후보 폴더 목록(숨김/public/.vitepress 제외, 정렬) */
function topLevelFolders(): string[] {
  if (!fs.existsSync(docsRoot)) return []
  return fs.readdirSync(docsRoot).filter(e => {
    if (e.startsWith('.') || e === 'public') return false
    try { return fs.statSync(path.join(docsRoot, e)).isDirectory() } catch { return false }
  }).sort()
}

/** 폴더의 직속 .md 파일(정렬) */
function mdFilesOf(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md') && !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile())
      .sort()
  } catch { return [] }
}

/** 폴더의 하위 디렉토리(정렬) */
function subDirsOf(dir: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter(d => !d.startsWith('.') && fs.statSync(path.join(dir, d)).isDirectory())
      .sort()
  } catch { return [] }
}

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

/**
 * 디렉토리명을 사람이 읽기 좋은 형태로 변환
 * project-alpha / local_docs → Project Alpha / Local Docs
 */
function formatName(name: string): string {
  return name
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

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

// 사이드바 + 카테고리 + 홈 프로젝트 자동 생성
const sidebar = generateSidebar()
const categories = generateCategories()

export default defineConfig({
  // 사용자가 선택한 폴더(docsRoot)를 콘텐츠 소스로 사용.
  // .vitepress(테마/config)는 vitepress-core 안에 그대로 두고, 마크다운만 외부 폴더에서 읽는다.
  srcDir: docsRoot,

  title: 'local-cdocs',
  description: '내 Markdown 라이브러리',
  lang: 'ko-KR',

  // 모든 자동 생성 링크(사이드바/카테고리/홈)가 확장자 없는 형태이므로 cleanUrls로 정합.
  // dev/build 양쪽에서 /a/b/c ↔ /a/b/c.html 해석이 일관되어 중첩 경로 404를 예방한다.
  cleanUrls: true,

  head: [
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/sun-typeface/SUITE/fonts/variable/woff2/SUITE-Variable.css' }],
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/wan2land/d2coding/d2coding-ligature-full.css' }],
  ],

  themeConfig: {
    nav: [],
    sidebar,
    categories,

    search: {
      provider: 'local'
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cmaven' },
      {
        icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
        link: '/guide/',
        ariaLabel: 'Guide'
      }
    ],

    outline: {
      level: [2, 3],
      label: '목차'
    },

    darkModeSwitchLabel: '다크 모드',
    returnToTopLabel: '맨 위로',
    sidebarMenuLabel: '메뉴',
  },

  ignoreDeadLinks: true,

  markdown: {
    lineNumbers: true,
    config: (md) => {
      // mermaid 코드블록을 <Mermaid> 컴포넌트로 변환
      const fence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (token.info.trim() === 'mermaid') {
          const chart = token.content
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          return `<Mermaid chart="${chart}" />\n`
        }
        return fence(tokens, idx, options, env, self)
      }

      // .md 내 <model>, <base> 등 비표준 태그를 자동 이스케이프
      const knownHtml = new Set(['a','abbr','address','area','article','aside','audio','b','base','bdi','bdo','blockquote','body','br','button','canvas','caption','cite','code','col','colgroup','data','datalist','dd','del','details','dfn','dialog','div','dl','dt','em','embed','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','head','header','hgroup','hr','html','i','iframe','img','input','ins','kbd','label','legend','li','link','main','map','mark','menu','meta','meter','nav','noscript','object','ol','optgroup','option','output','p','param','picture','pre','progress','q','rp','rt','ruby','s','samp','script','search','section','select','slot','small','source','span','strong','style','sub','summary','sup','table','tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','u','ul','var','video','wbr','svg','path','circle','line','rect','text','g','defs','use','symbol'])
      const knownVue = new Set(['Badge','Button','Callout','Mermaid','Asciinema','Tabs','Tab','Steps','Step','Columns','Column','Details','Hint','Accordion','Accordions','HomePage'])

      const origHtmlInline = md.renderer.rules.html_inline
      md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
        const content = tokens[idx].content
        const m = content.match(/^<\/?([a-zA-Z][\w_-]*)/)
        if (m) {
          const tag = m[1]
          if (!knownHtml.has(tag.toLowerCase()) && !knownVue.has(tag) && !/^[A-Z]/.test(tag)) {
            return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
        }
        return origHtmlInline ? origHtmlInline(tokens, idx, options, env, self) : content
      }

      const origHtmlBlock = md.renderer.rules.html_block
      md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
        const content = tokens[idx].content
        const m = content.match(/^<\/?([a-zA-Z][\w_-]*)/)
        if (m) {
          const tag = m[1]
          if (!knownHtml.has(tag.toLowerCase()) && !knownVue.has(tag) && !/^[A-Z]/.test(tag)) {
            return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
        }
        return origHtmlBlock ? origHtmlBlock(tokens, idx, options, env, self) : content
      }
    },
  },

  vite: {
    server: {
      host: '127.0.0.1',
      // Electron이 빈 포트를 동적 할당해 LOCAL_DOCS_PORT로 주입. 없으면 3030(CLI 단독용).
      port: process.env.LOCAL_DOCS_PORT ? Number(process.env.LOCAL_DOCS_PORT) : 3030,
      // 지정 포트가 사용 중이면 즉시 실패(임의 포트로 이동 방지) → Electron이 정확한 포트로 로드 가능
      strictPort: true,
    },
    plugins: [{
      name: 'auto-restart-on-new-docs',
      configureServer(server) {
        // Electron 셸에서 구동될 때(LOCAL_DOCS_DIR 설정됨)는 재시작 주체를 Electron(main.cjs)으로 일원화한다.
        // 이 경우 Electron이 chokidar로 watch → 자식 프로세스를 kill/respawn 하므로 플러그인은 비활성.
        // ENV 미설정(CLI 단독 구동) 시에만 plugin이 process.exit로 재시작을 유도한다.
        if (process.env.LOCAL_DOCS_DIR) return

        const watcher = server.watcher
        let restartTimer: ReturnType<typeof setTimeout> | null = null
        let isRestarting = false

        function scheduleRestart(reason: string) {
          if (isRestarting) return
          console.log(`[auto-sidebar] ${reason}`)
          if (restartTimer) clearTimeout(restartTimer)
          // 2초 디바운스: 마지막 변경 후 2초 뒤 재시작
          restartTimer = setTimeout(() => {
            console.log('[auto-sidebar] 서버 재시작 중...')
            process.exit(0)  // docs:watch 루프가 자동으로 재시작
          }, 2000)
        }

        function isDocsPath(p: string) {
          return p.startsWith(docsRoot) && !p.includes('.vitepress') && !p.includes('node_modules')
        }

        watcher.on('addDir', (p: string) => { if (isDocsPath(p)) scheduleRestart(`새 디렉토리: ${p}`) })
        watcher.on('add', (p: string) => { if (p.endsWith('.md') && isDocsPath(p)) scheduleRestart(`새 문서: ${p}`) })
        watcher.on('unlink', (p: string) => { if (p.endsWith('.md') && isDocsPath(p)) scheduleRestart(`문서 삭제: ${p}`) })
        watcher.on('unlinkDir', (p: string) => { if (isDocsPath(p)) scheduleRestart(`디렉토리 삭제: ${p}`) })
      }
    }]
  }
})
