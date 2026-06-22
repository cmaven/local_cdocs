<!-- PLAN.md: local_cdocs (Windows 로컬 MD 뷰어) 구현 계획 | 생성일: 2026-06-22 -->

# local_cdocs — Windows 로컬 Markdown 뷰어 구현 계획

> cdocs(VitePress 웹 문서 포털)를 Windows 데스크톱 앱으로 이식.
> 사용자가 폴더를 선택하면 그 안의 `.md`를 cdocs와 동일한 웹 화면으로 렌더링하고,
> 파일 추가/삭제를 실시간 감지해 사이드바·홈을 자동 갱신한다.

## 1. 확정된 결정사항

| 항목 | 결정 |
|---|---|
| 구현 방식 | **Electron + VitePress 번들** (출력 퀄리티 = 웹 cdocs 100% 동일, 기존 코드 재사용) |
| 문서 폴더 | **사용자 폴더 선택 + chokidar 실시간 감지** |
| 기능 범위 | 자동 사이드바/홈 · Mermaid · 로컬 검색 · 다크모드 · 커스텀 컴포넌트 전부 |
| 배포 | electron-builder → Windows `.exe` (NSIS 설치본 + portable) |

## 2. 아키텍처

```
local_cdocs/
├── electron/
│   ├── main.js          # Electron 메인: 창 생성, 폴더 선택 다이얼로그,
│   │                    #   VitePress dev 서버 child_process 기동/종료
│   ├── preload.js       # 렌더러 ↔ 메인 IPC 브리지 (폴더 선택, 상태)
│   └── server.js        # VitePress dev 서버 래퍼 (createServer API 사용)
├── vitepress-core/      # cdocs/docs/.vitepress 를 이식 (테마+config+컴포넌트)
│   ├── config.ts        # docsRoot 를 ENV(LOCAL_DOCS_DIR)로 주입받게 수정
│   └── theme/           # cdocs 컴포넌트 전부 복사
├── docs-template/       # 최초 실행 시 보여줄 환영/샘플 문서
├── package.json         # electron, electron-builder, vitepress 등
└── electron-builder.yml # Windows 패키징 설정
```

### 동작 흐름
1. 앱 실행 → 마지막에 열었던 폴더 자동 로드(없으면 환영 화면).
2. "폴더 열기" → OS 폴더 선택 다이얼로그(`dialog.showOpenDialog`).
3. 선택 경로를 `LOCAL_DOCS_DIR` ENV로 VitePress dev 서버를 자식 프로세스로 기동.
4. Electron `BrowserWindow`가 `http://localhost:<port>` 로드.
5. chokidar가 폴더 watch → `.md` 추가/삭제 시 config 재평가(서버 재시작 디바운스 2초) → 창 자동 새로고침.

## 3. 핵심 기술 과제와 해결책

| 과제 | 해결 |
|---|---|
| **config.ts의 docsRoot 하드코딩** (`__dirname/..`) | `process.env.LOCAL_DOCS_DIR ?? 기본경로` 로 변경. 사이드바/홈/카테고리 스캔 함수 모두 이 변수 기준으로 동작. |
| **임의 폴더를 VitePress srcDir로 지정** | VitePress `srcDir` 옵션을 ENV 경로로 설정. dev 서버를 코드(`createServer`)로 띄워 옵션 주입. |
| **포트 충돌** | 빈 포트 동적 할당(get-port) 후 Electron에 전달. |
| **실시간 자동 사이드바** | 기존 config.ts의 `auto-restart-on-new-docs` 플러그인 로직 재사용. dev 서버 재시작은 main.js가 관리(child kill→respawn). |
| **앱 종료 시 좀비 프로세스** | `app.on('before-quit')`에서 자식 VitePress 프로세스 정리. |
| **첫 실행 사용성** | 폴더 미선택 시 docs-template의 사용법 안내 문서 표시. |

## 4. 작업 단계 (Phase)

### Phase 0 — 스캐폴딩
- [ ] `npm init`, electron / vitepress / chokidar / get-port / electron-builder 설치
- [ ] cdocs의 `docs/.vitepress/` (config.ts + theme + components 18종) → `vitepress-core/` 복사
- [ ] 파일 상단 주석(Rule 1) 정비

### Phase 1 — VitePress 동적 docsRoot
- [ ] config.ts: `docsRoot`를 `LOCAL_DOCS_DIR` ENV 기반으로 수정
- [ ] `server.js`: VitePress `createServer({ root, srcDir })` 래퍼 작성
- [ ] CLI로 임의 폴더 지정해 단독 구동 검증 (Electron 없이 먼저 확인)

### Phase 2 — Electron 셸
- [ ] `main.js`: BrowserWindow, 메뉴(폴더 열기/새로고침/다크모드/종료)
- [ ] 폴더 선택 다이얼로그 + 최근 폴더 영속화(electron-store)
- [ ] VitePress dev 서버 child_process 기동/종료 + 동적 포트
- [ ] `preload.js` IPC 브리지

### Phase 3 — 실시간 감지
- [ ] chokidar로 선택 폴더 watch
- [ ] `.md`/디렉토리 변경 → 서버 재시작(디바운스) → 창 reload
- [ ] 로딩 인디케이터(재시작 중 깜빡임 최소화)

### Phase 4 — 기능 검증
- [ ] 자동 사이드바/홈, Mermaid, 로컬 검색, 다크모드, 커스텀 컴포넌트 각각 동작 확인
- [ ] 샘플 폴더(cdocs/sample 재활용)로 회귀 테스트

### Phase 5 — 패키징/배포
- [ ] `electron-builder.yml`: Windows NSIS + portable, 앱 아이콘
- [ ] `.exe` 빌드 및 실제 Windows에서 설치/실행 검증
- [ ] README(설치·사용법) 작성

## 5. 리스크

- **VitePress dev 서버 기동 시간(수 초)** → 스플래시/로딩 화면으로 체감 완화. (프로덕션 빌드를 매번 하기엔 폴더가 가변이라 dev 서버가 적합)
- **Windows 경로/한글 폴더명 인코딩** → 경로 정규화·따옴표 처리 주의.
- **번들 용량 ~150MB** → 수용. (Tauri 대안은 Node 사이드카 필요로 이점 상쇄)

## 6. 검증 기준 (완료 정의)
1. 임의 폴더 선택 → cdocs와 시각적으로 동일한 화면.
2. 폴더에 `.md` 추가/삭제 시 5초 내 사이드바·홈 자동 반영.
3. Mermaid·검색·다크모드·커스텀 컴포넌트 정상.
4. 빌드된 `.exe`가 Node 미설치 Windows에서 단독 실행.
