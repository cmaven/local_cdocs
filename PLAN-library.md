<!-- PLAN-library.md: 관리형 라이브러리 UX 전환 계획 | 생성일: 2026-06-22 -->

# local_cdocs — 관리형 라이브러리(Managed Library) 전환 계획

> 현재 "임의 폴더 열기" 모델 → **고정 라이브러리 루트 + 컬렉션 관리 UI**로 전환.
> 사용자는 `Documents/local-cdocs`(고정 루트) 아래에 **컬렉션 폴더**를 만들거나 가져오고,
> 각 컬렉션이 카테고리로 렌더된다. 탐색기에서 헤맬 필요 없이 앱 안에서 관리.

## 1. 확정 결정사항

| 항목 | 결정 |
|---|---|
| UX 모델 | 관리형 라이브러리 (고정 루트 + 관리 UI) |
| 라이브러리 루트 | `app.getPath('documents')/local-cdocs` (Windows: `C:/Users/<user>/Documents/local-cdocs`) |
| 관리 기능 | ① 새 컬렉션 만들기 ② 기존 폴더 가져오기(복사) ③ 이름변경/삭제 ④ 탐색기에서 열기 |

## 2. 현재 문제(status_03) 요약 → 이 계획으로 해소

- 평면 폴더(하위 폴더 없는 .md 묶음)를 열면 드롭다운/홈 카드가 비어 "hierarchy 깨짐". → 라이브러리 루트는 **항상 컬렉션 폴더 단위**이므로 카테고리가 채워짐.
- 기본 베이스가 `resources/app/docs-template`(Program Files, 쓰기 부적합). → **Documents/local-cdocs**로 이동.
- 브랜딩이 "Tech Docs Portal"로 하드코딩. → 중립 브랜딩("local-cdocs / 내 Markdown 라이브러리")으로 변경.

## 3. 동작 모델

```
Documents/local-cdocs/            ← 고정 라이브러리 루트 (= VitePress srcDir)
├── index.md                      ← 라이브러리 대시보드(홈). 앱이 자동 생성/관리
├── 시작하기/                      ← 최초 실행 시 시드되는 환영 컬렉션(docs-template 복사)
│   └── index.md
├── 내프로젝트A/                   ← 사용자가 "새 컬렉션"으로 생성
│   ├── index.md
│   └── ...
└── 가져온문서/                    ← 사용자가 "폴더 가져오기"로 외부 .md 폴더 복사
    └── ...
```

- 앱 실행 → **항상 라이브러리 루트를 연다**(기존 lastFolder/docs-template 기본 로직 대체).
- 컬렉션 = 루트 직속 폴더 → 기존 config.mts의 "폴더=카테고리" 로직이 그대로 적용(드롭다운/사이드바/홈 카드 자동 생성).
- 관리 작업(생성/가져오기/이름변경/삭제) 후 → chokidar가 감지 → dev 서버 재시작 → 화면 자동 갱신.

## 4. 구현 설계

### 4.1 Electron 메인 (main.cjs)
- `LIBRARY_ROOT = path.join(app.getPath('documents'), 'local-cdocs')`.
- 최초 실행: 루트 없으면 생성 + `docs-template/` 내용을 `시작하기/` 컬렉션으로 시드 + 루트 `index.md`(HomePage) 생성.
- `createWindow`: `loadFolder(LIBRARY_ROOT)` 고정. (lastFolder 영속은 "마지막 본 페이지" 수준으로 축소하거나 제거)
- 신규 IPC 핸들러(파일시스템은 메인에서 수행):
  | IPC | 동작 |
  |---|---|
  | `library:root` | 루트 경로 반환 |
  | `library:list` | 컬렉션(폴더) 목록 + 메타(파일 수, index 제목) |
  | `library:create` | 이름 검증 후 새 폴더 + 기본 index.md 생성 |
  | `library:import` | `showOpenDialog`(폴더) → `fs.cp`로 루트에 복사(이름 충돌 처리) |
  | `library:rename` | 폴더 이름 변경(검증·충돌 처리) |
  | `library:delete` | `shell.trashItem`으로 휴지통 이동(확인 후) |
  | `library:reveal` | `shell.openPath`/`showItemInFolder`로 탐색기 열기 |
- chokidar watch 대상 = LIBRARY_ROOT (이미 구현된 watch 재사용).

### 4.2 preload.cjs
- contextBridge로 위 IPC를 안전하게 노출: `window.localcdocs.{root,list,create,import,rename,delete,reveal}`.

### 4.3 VitePress 테마 — 라이브러리 대시보드
- **HomePage.vue 개편**: 기존 카드 그리드를 "컬렉션 대시보드"로.
  - 상단 액션 바: `+ 새 컬렉션`, `폴더 가져오기`, `라이브러리 폴더 열기`.
  - 컬렉션 카드: 제목/문서 수 + 우측 케밥 메뉴(이름변경·삭제·탐색기).
  - 모든 동작은 `window.localcdocs.*` IPC 호출 → 완료 후 안내(서버 재시작으로 곧 갱신).
- 브랜딩 중립화: `config.mts` title/description, HomePage 히어로 문구, 사이드바 헤더("Tech Docs Portal"→"local-cdocs").
- 빈 라이브러리/IPC 부재(브라우저 단독 구동) 시 graceful 폴백(버튼 비활성 + 안내).

### 4.4 네이티브 메뉴 (main.cjs)
- `파일` 메뉴에 추가: `새 컬렉션`, `폴더 가져오기`, `라이브러리 폴더 열기`. (대시보드와 동일 IPC 재사용)

## 5. 작업 단계(Phase)

- **Phase 0** — 라이브러리 루트 확립: LIBRARY_ROOT 상수, 최초 시드, `loadFolder(LIBRARY_ROOT)` 고정. (Electron 없이 VitePress가 루트 렌더되는지 Linux 검증)
- **Phase 1** — IPC 핸들러 + preload 브리지(create/import/rename/delete/reveal/list/root). 메인 단위 동작을 Node 스크립트로 검증.
- **Phase 2** — HomePage 대시보드 개편 + 브랜딩 중립화. IPC 연동.
- **Phase 3** — 네이티브 메뉴 연동.
- **Phase 4** — 통합 검증(라우팅/IPC/fs) + 재빌드 + Windows 실기 검증(시각).

## 6. 결정 필요/리스크

- **삭제는 휴지통(trash) 권장** (영구삭제 대신) — 안전.
- **관리 작업 후 서버 재시작 reload**: 컬렉션 생성/삭제 시 화면이 잠깐 새로고침됨(홈으로). 동작상 자연스러우나 인지 필요. (대안: 부분 갱신은 추가 작업)
- **라이브러리 위치 변경**: 기본 Documents/local-cdocs 고정. "위치 바꾸기"는 후순위 옵션으로 둘 수 있음.
- **WSL 시각 검증 불가**: 대시보드 UI 모양은 Windows 실기 확인 필요(레이아웃처럼).

## 7. 완료 기준

1. 앱 실행 → 항상 `Documents/local-cdocs` 라이브러리 열림(최초 시드된 "시작하기" 보임).
2. 대시보드에서 새 컬렉션 생성 → 폴더 생성 + 곧 카드/드롭다운에 반영.
3. 외부 폴더 가져오기 → 복사되어 컬렉션으로 추가.
4. 컬렉션 이름변경/삭제(휴지통)/탐색기 열기 동작.
5. 브랜딩이 "Tech Docs Portal"이 아닌 중립 표기.
