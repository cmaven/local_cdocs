<!-- WORK_LOG.md: local_cdocs 팀 작업 로그 | 생성일: 2026-06-22 -->

# WORK_LOG — local_cdocs

병렬 agent 작업 추적. 작업 전 이 파일을 읽고, 수정 중인 파일은 `⚠️ 수정 중` 표시.

## 파일 소유권 (충돌 방지)

| 영역 | 파일 | 담당 |
|------|------|------|
| VitePress 동적화 | `vitepress-core/.vitepress/config.ts` | impl-agent |
| Electron 셸 | `electron/main.cjs`, `electron/preload.cjs`, `electron/server.cjs` | impl-agent |
| 패키징 | `electron-builder.yml`, `build/` | impl-agent |
| 템플릿 | `docs-template/**` | impl-agent |
| 프로젝트 문서 | `docs/**` | docs-agent |
| 공용(읽기전용) | `PLAN.md`, `package.json` | orchestrator |

## 진행 상황

- [x] orchestrator: 스캐폴딩(dirs, vitepress-core 이식, package.json), npm install(백그라운드)
- [x] impl-agent: config.ts→config.mts ENV 동적화(LOCAL_DOCS_DIR/PORT) + electron(main/preload/splash) + chokidar 실시간감지 + docs-template + electron-builder.yml
      ⚠️ 주의: config.ts → config.mts 로 이름 변경(ESM 강제, vitepress ESM require 충돌 회피). vitepress-core/package.json("type":"module") 추가됨. package.json 루트는 미변경(CJS 유지).
- [x] docs-agent: docs/ 설계 문서 7종 작성 (README + 01~06, mermaid 포함)
- [x] orchestrator: 통합 검증 — VitePress 임의폴더(sample) 렌더 200 OK, 폴더별 사이드바 동적화 확인, .cjs 문법 통과
- [x] orchestrator: Windows .exe 빌드 (Wine+wine32 설치, rcedit/프리픽스 이슈 해결) → Setup.exe + portable.exe 생성
- [x] orchestrator: Windows 런타임 기동 실패(VitePress 서버) 3대 원인 해결 — 자세히는 docs/08
      1) vitepress가 devDep라 패키지 제외 → dependencies로 이동
      2) Linux 빌드라 .bin/vitepress.cmd 없음 → spawn을 process.execPath+ELECTRON_RUN_AS_NODE로 변경(main.cjs)
      3) esbuild/rollup 네이티브가 Linux용 → win32 바이너리 npm pack 주입 + optionalDependencies 선언
      검증: 패키지 내 vitepress/win32 esbuild.exe(PE32+) 포함 확인, Linux에서 execPath 기동방식 200 OK
- [x] orchestrator: 레이아웃 버그 2건 수정(style.css) — ① 와이드에서 제목/상단 목차 겹침(≥960px VPLocalNav 숨김+상단여백), ② 좁은 창 왼쪽 공백 과다(padding-left를 ≥960px에서만 적용)
- [x] orchestrator: 카테고리 구조 변경 — "아무 폴더명=카테고리"(연도 강제 제거). config.mts 재작성(topLevelFolders/scanCategory/firstPageOf 등) + CategoryDropdown.vue 매칭을 cat.dir로 변경. 하위폴더=접이식 그룹, 루트 평면 .md 폴백. 테스트폴더 8개 라우트 200 검증. docs/06 갱신.
- [ ] (남은 단계) Windows 실기에서 새 설치본(~130M) 실행 검증:
      · 레이아웃 ①②는 WSL 무디스플레이로 시각 미검증 → 넓은/좁은 창 실제 확인 필요
      · 카테고리 드롭다운/사이드바가 폴더명대로 나오는지 확인
      · \\wsl$ UNC 경로 대신 일반 Windows 경로 권장

## Windows 검증 시 점검 체크포인트 (orchestrator 코드리뷰, 미수정 — 실기 검증 필요)

리뷰 결과 main.cjs 로직은 견고하나, WSL에서 런타임 검증 불가한 아래 2건은 Windows에서 실제 확인 권장.
(추측 기반 blind 수정은 동작 중인 VitePress 기동을 깨뜨릴 위험이 있어 의도적으로 미수정.)

1. **[중] spawn 경로 공백 문제** — `main.cjs` `startVitePress()`의 `spawn(VITEPRESS_BIN, ['dev', VITEPRESS_CORE], { shell: true(win) })`.
   NSIS 기본 설치 경로 `C:\Program Files\local-cdocs`에는 **공백**이 있는데, `shell:true`는 인자를 자동 인용하지 않아 경로가 공백에서 잘릴 수 있음.
   → Windows 구동 시 서버가 안 뜨면 이 부분. 해결책: 경로를 `"`로 인용하거나, `cmd.exe /c`에 인용된 명령 전달, 또는 node로 vitepress JS 엔트리 직접 실행(shell 회피).
2. **[하] 다크모드 토글 비영속** — 메뉴의 `classList.toggle('dark')`는 시각적 토글만 하고 VitePress의 `vitepress-theme-appearance`(localStorage)와 분리됨.
   파일 변경으로 서버 재시작→reload 시 토글 상태 소실. VitePress 우상단 기본 토글 버튼은 정상 영속되므로, 메뉴 토글을 localStorage 연동 또는 제거 검토.

## 라운드 2: 관리형 라이브러리 전환 (PLAN-library.md) — 팀 분담

| 트랙 | 소유 파일 | 담당 |
|------|-----------|------|
| A 백엔드(Electron) | `electron/main.cjs`, `electron/preload.cjs` | backend-agent |
| B 프론트(테마) | `vitepress-core/.vitepress/theme/components/HomePage.vue`, `config.mts`(브랜딩만), `theme/components/CustomLayout.vue`(브랜딩만) | frontend-agent |
| 통합/빌드 | 검증·재빌드·docs | orchestrator |

### 공유 IPC 계약 (양 트랙 동일하게 사용)
`window.localcdocs = { getRoot():Promise<string>; createCollection(name):Promise<{ok,error?}>; importFolder():Promise<{ok,name?,error?}>; renameCollection(dir,newName):Promise<{ok,error?}>; deleteCollection(dir):Promise<{ok,error?}>; reveal(dir?):Promise<void> }` (dir=원본 폴더명 = config의 cat.dir)

### 트랙 B(frontend-agent) 완료 — 2026-06-22
- [x] `HomePage.vue` 전면 개편 → 라이브러리 대시보드. 데이터=`theme.categories`({label,path,dir}). 상단 액션바(새 컬렉션/가져오기/라이브러리 폴더 열기) + 컬렉션 카드(열기 링크 cat.path) + 케밥 메뉴(이름변경/탐색기/삭제). 모든 동작은 공유 IPC 호출, 완료 후 토스트("곧 갱신됩니다"). 빈 라이브러리/IPC 부재 시 graceful 폴백(버튼 disabled + "데스크톱 앱에서 사용 가능").
  · IPC 사용: createCollection(name) / importFolder() / renameCollection(cat.dir,newName) / deleteCollection(cat.dir) / reveal(cat.dir), 루트는 reveal(). getRoot는 미사용(불필요).
- [x] 브랜딩 중립화: `config.mts` title `Tech Docs Portal`→`local-cdocs`, description `사내 기술 문서 포털`→`내 Markdown 라이브러리`(문자열만, 스캔로직 무수정). `CustomLayout.vue` 사이드바 헤더 `Tech Docs Portal`→`local-cdocs`(href="/" 유지). HomePage 히어로/푸터 문구 중립화.
- 검증: /tmp/libtest(컬렉션 2개)로 dev 서버 기동 → 루트 200, 컬렉션 라우트 200, 로그에 Vue 컴파일 에러 0. HomePage.vue/CustomLayout.vue @vue/compiler-sfc 직접 컴파일 OK(바인딩 전부 해소). 소유 외 파일(main.cjs/preload.cjs) 무수정. PID 종료 + fuser -k 5361. (GUI 시각검증은 WSL 불가 — 코드/렌더200 수준)

### 라운드 2 완료 (2026-06-22)
- [x] backend-agent: LIBRARY_ROOT(Documents/local-cdocs) 고정 + 시드(시작하기) + IPC 6종(getRoot/createCollection/importFolder/renameCollection/deleteCollection(휴지통)/reveal) + preload 노출 + 라이브러리 메뉴. fs 순수함수 분리 + 단위테스트 42건 PASS. electron-store 사용 제거(package.json엔 잔존 — 무해, 후순위 정리).
- [x] frontend-agent: HomePage→라이브러리 대시보드(액션바+컬렉션 카드+케밥) + 브랜딩 중립화(local-cdocs).
- [x] orchestrator(통합): 버그 2건 수정 후 빌드.
      · 이름검증 정규식이 공백·하이픈 차단 → backend가 수정(Windows 금지문자+제어문자+예약명만 차단).
      · **window.prompt가 Electron 미지원** → HomePage에 커스텀 입력 모달(생성/이름변경) 구현, 메뉴 '새 컬렉션'은 `#new-collection` 해시로 대시보드 모달 오픈. (window.confirm/alert는 Electron 지원 → 삭제 확인은 유지)
      · 검증: IPC 계약 6종 일치, window.prompt 호출 0, HomePage.vue SFC 컴파일 OK, dev 렌더 200(한글/하이픈 폴더 라우트 포함).
- [ ] Windows 실기 검증: 라이브러리 자동 생성/시드, 대시보드에서 컬렉션 생성·가져오기·이름변경·삭제·탐색기, 모달 동작.

### 라운드 3: status_04~07 수정 (2026-06-22)
- [x] 카테고리 드롭다운: 같은 이름 컬렉션('docs','docs (2)')이 콘텐츠에서 둘 다 'Docs'로 표시 → CategoryDropdown.vue에서 `decodeURIComponent(route.path)` 후 매칭(공백 폴더명 %20 인코딩 대응). + main.cjs uniqueDest 자동 접미사 `' (n)'`→`'-n'`(공백 없는 URL).
- [x] 다크모드 mermaid 안 보임: 메뉴 다크토글이 classList.toggle('dark')만 해 VitePress isDark 미갱신 → mermaid 라이트 테마 렌더. → 메뉴 토글이 `.VPSwitchAppearance` 정식 스위치 클릭(isDark 동기화+영속). (shiki는 기본 듀얼테마라 코드블록은 .dark로 적응 — 토글 정상화로 함께 해결 기대)
- [x] 검증: 문법/SFC 컴파일 OK, 공백 폴더 라우트 200, 패키지 반영 확인(VPSwitchAppearance/decodeURIComponent/-n). mermaid 다크·드롭다운 라벨은 WSL 시각 미검증 → Windows 확인 필요.

## 라운드 4: 개발자용 docs 갱신 (실제 코드 발췌 포함) — 팀 분담
| 트랙 | 소유 docs 파일 | 읽을 소스 |
|------|----------------|-----------|
| doc-core | 01-architecture.md, 03-vitepress-dynamic-srcdir.md, 04-realtime-watch.md | electron/main.cjs, vitepress-core/.vitepress/config.mts |
| doc-lib (신규) | 09-managed-library.md, 10-ipc-and-dashboard.md | main.cjs, preload.cjs, HomePage.vue, CategoryDropdown.vue |
| doc-build | 02-tech-decisions.md, 05-build-and-distribution.md, 11-theming-and-mermaid.md(신규) | electron-builder.yml, package.json, Mermaid.vue, style.css |
| orchestrator | README.md(인덱스), 07/08 점검 | - |
주의: 각 트랙은 소유 docs만 수정. 코드는 실제 파일에서 발췌(창작 금지). 07/08은 이미 최신.

### 라운드 4 완료 (2026-06-22)
- [x] doc-core: 01-architecture(관리형 라이브러리 흐름+mermaid 갱신), 03(config.mts 동적 srcDir/스캔 코드), 04(chokidar/killVitePress 코드) 갱신.
- [x] doc-lib: 09-managed-library(신규, fs 함수/IPC 6종/preload 코드), 10-ipc-and-dashboard(신규, window.localcdocs API/커스텀 모달/해시/decodeURIComponent) 작성.
- [x] doc-build: 02-tech-decisions(보강), 05-build-and-distribution(크로스플랫폼 전면 갱신), 11-theming-and-mermaid(신규, 다크/코드블록/mermaid DARK_VARS·글자잘림) 작성.
- [x] orchestrator: README.md 인덱스 갱신(09–11 추가, 그룹화), 전체 렌더 200 검증, 코드 발췌 실제 소스 일치 확인. **09에 섞인 리터럴 제어문자(validateCollectionName 정규식) 정리** → file이 정상 텍스트로 인식. 모든 docs 제어문자 0.

## 핵심 설계 메모 (impl-agent 필독)

- VitePress 실행: `vitepress dev vitepress-core` (config는 vitepress-core/.vitepress/config.ts)
- 사용자 폴더 주입: `config.ts`에서 `srcDir: process.env.LOCAL_DOCS_DIR` + 모든 스캔 함수의 `docsRoot`를 `process.env.LOCAL_DOCS_DIR` 기준으로 변경
- 사용자 폴더에 index.md 없으면 → 앱이 HomePage 랜딩용 index.md 자동 생성(또는 fallback)
- Electron main은 CommonJS(.cjs), VitePress는 자식 프로세스로 분리 → ESM/CJS 충돌 회피
