<!-- 02-tech-decisions.md: local_cdocs 핵심 기술 결정과 근거 | 생성일: 2026-06-22 | 수정일: 2026-06-22 -->

# 02. 기술 결정 근거

## 1. 왜 Electron + VitePress인가?

### 대안 비교표

| 항목 | Electron + VitePress | Tauri + Node 사이드카 | 경량 렌더러(marked.js 등) |
|------|---------------------|----------------------|--------------------------|
| 설치 용량 | ~150MB | ~20MB (단, Node 사이드카 필요 시 증가) | ~30MB |
| 출력 퀄리티 | 웹 cdocs와 100% 동일 | Node 사이드카 구성에 따라 동일 가능 | 커스텀 컴포넌트 미지원 |
| 실시간 감지 | VitePress HMR + chokidar | 별도 구현 필요 | 별도 구현 필요 |
| 빌드 난이도 | 보통 (기존 config.mts 재사용) | 높음 (Rust 빌드 + Node 사이드카 구성) | 낮음 (하지만 기능 한계) |
| cdocs 코드 재사용 | 매우 높음 (config.mts + theme 전부) | 중간 | 낮음 (완전 재구현 필요) |
| Mermaid/검색/다크모드 | 즉시 지원 (cdocs 그대로) | 별도 구현 필요 | 별도 구현 필요 |

### 결론

**Tauri**는 번들 용량이 작지만, Node.js 기반인 VitePress와 Markdown 처리 파이프라인을 그대로 쓰려면 Node.js 사이드카(sidecar)가 결국 필요합니다. 이 경우 Tauri의 용량 이점이 상당 부분 상쇄되고, 빌드 복잡도는 오히려 높아집니다.

**경량 렌더러**는 구현이 간단하지만, cdocs의 커스텀 컴포넌트(Mermaid, Tabs, Steps, Callout 등 18종)를 재현하려면 사실상 VitePress 스택을 다시 구현해야 합니다.

**Electron + VitePress**는 기존 cdocs의 `config.mts`와 `theme/` 디렉토리를 거의 그대로 이식(porting)할 수 있어, 개발 비용이 가장 낮고 출력 품질이 가장 높습니다. 번들 용량 ~150MB는 이 프로젝트의 사용 맥락(사내 도구)에서 수용 가능한 트레이드오프입니다.

---

## 2. ESM vs CommonJS 분리 전략 (.mts 확장자)

### 문제

- **VitePress**: ESM(ECMAScript Modules) 기반. `import`/`export` 사용, `"type": "module"` 필요.
- **Electron 메인 프로세스**: Electron 33 시점에서 `require()` 기반 CommonJS가 안정적. `.cjs` 확장자로 명시적 CommonJS 선언.

같은 `package.json`에서 두 런타임을 혼용하면 `ERR_REQUIRE_ESM` 또는 `__dirname is not defined` 오류가 발생합니다.

VitePress 설정 파일도 원래 `config.ts`이지만, 루트 `package.json`에 `"type": "module"`이 없을 때 `.ts`는 Node가 CJS로 해석하려 해서 ESM import 구문에서 충돌이 납니다.

### 해결책

Electron 메인/프리로드/서버 파일을 모두 `.cjs` 확장자로 작성하고,
VitePress 설정은 `.mts`(TypeScript ESM 명시 확장자)로 작성합니다.

```
electron/
├── main.cjs      ← CommonJS (require, module.exports)
├── preload.cjs   ← CommonJS (contextBridge)
└── server.cjs    ← CommonJS (child_process로 VitePress spawn)

vitepress-core/.vitepress/
└── config.mts    ← TypeScript ESM (.mts = 항상 ESM, "type" 필드 무관)
```

`vitepress-core/package.json`에 `"type": "module"`을 추가해 해당 디렉토리 전체를 ESM으로 처리합니다. 루트 `package.json`은 CJS(기본값)로 유지해 Electron이 `require()`를 사용할 수 있습니다.

VitePress 서버는 별도 Node.js 자식 프로세스로 실행되므로, 해당 프로세스 내부에서는 ESM을 완전히 자유롭게 사용할 수 있습니다. 두 런타임이 **프로세스 경계**로 격리되어 충돌이 원천 차단됩니다.

---

## 3. vitepress를 dependencies로 — 번들 포함 필수

`electron-builder`는 `devDependencies`를 빌드 산출물에서 제외합니다. vitepress는 **런타임**에 VitePress dev 서버를 자식 프로세스로 띄우므로, 배포본 안에 반드시 포함되어야 합니다.

```json
// package.json
"dependencies": {
  "vitepress": "^1.6.3",
  "vue": "^3.5.13",
  "mermaid": "^11.14.0",
  "chokidar": "^3.6.0",
  "gray-matter": "^4.0.3",
  "get-port": "^5.1.1"
}
```

`devDependencies`에 두면 패키지 안에 vitepress가 없어 Windows 실행 시 `문서 서버가 예기치 않게 종료` 오류가 납니다. 상세 내용은 [08. 크로스플랫폼 런타임 번들링](./08-cross-platform-runtime-bundling.md) 참조.

---

## 4. process.execPath + ELECTRON_RUN_AS_NODE spawn

VitePress 자식 프로세스를 띄우는 방법으로 `spawn('node', ...)` 또는 `spawn('.bin/vitepress.cmd', ...)`를 쓰면:

- **Windows 배포본에는 Node.js가 없다** — Electron이 내장한 Node를 쓰므로 독립 `node` 바이너리가 없음.
- **Linux 빌드 시 `.bin/vitepress.cmd` 셰임이 생성되지 않는다** — npm이 OS에 맞는 셰임만 생성.
- **경로에 공백이 있으면 `shell:true`로도 인자가 잘린다** — NSIS 기본 설치 경로 `C:\Program Files\local-cdocs`에 공백 포함.

해결: Electron 실행 파일을 node 모드로 재사용합니다.

```js
// electron/main.cjs
const VITEPRESS_ENTRY = path.join(APP_ROOT, 'node_modules', 'vitepress', 'bin', 'vitepress.js')

vpProcess = spawn(process.execPath, [VITEPRESS_ENTRY, 'dev', VITEPRESS_CORE], {
  cwd: APP_ROOT,
  env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  windowsHide: true,
})
```

`ELECTRON_RUN_AS_NODE=1`로 설정하면 Electron 바이너리가 GUI 없이 순수 Node.js처럼 동작합니다. 별도 Node 설치 불필요, `.cmd`/`shell:true` 불필요, 공백 경로 문제 없음.

---

## 5. 관리형 라이브러리 채택 이유

초기 "임의 폴더 열기" 모델에서 **고정 라이브러리 루트 + 컬렉션 관리 UI** 모델로 전환한 근거:

| 문제 | 관리형 라이브러리로 해소 |
|------|------------------------|
| 평면 폴더(하위 폴더 없는 .md 묶음)를 열면 카테고리가 비어 홈/드롭다운이 깨짐 | 루트가 항상 컬렉션(폴더) 단위이므로 카테고리 자동 채워짐 |
| 기본 베이스가 `resources/app/docs-template`(Program Files, 쓰기 부적합) | `Documents/local-cdocs`로 고정, 쓰기 가능한 사용자 영역 |
| 브랜딩이 "Tech Docs Portal"로 하드코딩 | 중립 브랜딩("local-cdocs")으로 변경 |

라이브러리 루트는 `app.getPath('documents')/local-cdocs`로 고정됩니다. 최초 실행 시 없으면 생성하고, `docs-template/`을 "시작하기" 컬렉션으로 시드합니다. 이후 앱은 항상 이 루트를 엽니다.

---

## 6. electron-store v8 선택 이유

`electron-store`는 영속(persistent) 설정 저장에 사용합니다.

| 버전 | 모듈 방식 | Electron 호환성 |
|------|----------|----------------|
| v9+ | ESM only | Electron 메인(.cjs)에서 `require()` 불가 |
| **v8.2.0** | CommonJS 지원 | `.cjs` 파일에서 `require('electron-store')` 정상 동작 |

`package.json`에 `"electron-store": "^8.2.0"`으로 고정한 이유입니다. v9로 업그레이드하면 async dynamic `import()`로 전환해야 해 초기화 흐름이 복잡해집니다.

---

## 7. get-port v5 선택 이유

`get-port`는 사용 가능한 빈 TCP 포트를 동적으로 할당합니다.

| 버전 | 모듈 방식 | 비고 |
|------|----------|------|
| v6+ | ESM only | `.cjs`에서 `require()` 불가 |
| **v5.1.1** | CommonJS 지원 | `const getPort = require('get-port')` 정상 동작 |

electron-store v8과 동일한 이유로 CJS 호환 버전을 유지합니다.

---

## 8. VitePress dev 서버 vs 프로덕션 빌드

사용자가 관리하는 라이브러리 루트는 **실행 시점에 결정**됩니다. VitePress 프로덕션 빌드(`vitepress build`)는 빌드 시 srcDir을 고정하므로 가변 경로에 맞지 않습니다. **dev 서버**(`vitepress dev`)는 설정을 런타임에 읽으므로, 컬렉션이 추가/삭제될 때마다 서버를 재시작하는 방식으로 임의 경로를 지원합니다.

dev 서버의 기동 지연(수 초)은 스플래시 화면 + 로딩 인디케이터로 체감을 완화합니다.

---

## 9. chokidar v3 선택 이유

`chokidar`는 파일 시스템 변경을 감지합니다. v3은 CommonJS를 지원하므로 `.cjs` 메인 프로세스에서 `require('chokidar')`로 바로 사용할 수 있습니다. v4+는 ESM 전환 예정이므로 현재 스택에서는 v3을 유지합니다.

VitePress 내부에도 파일 감시자가 있지만, **사이드바/홈 자동 갱신**을 위해서는 config.mts가 재평가되어야 하므로 서버 전체를 재시작해야 합니다. chokidar는 Electron 메인 프로세스가 독립적으로 이 재시작 트리거를 담당합니다.

---

## 요약

| 결정 | 선택 | 핵심 이유 |
|------|------|---------|
| 앱 프레임워크 | Electron 33 | cdocs 코드 재사용, 빌드 난이도 최소 |
| 렌더링 엔진 | VitePress dev 서버 | 가변 srcDir 지원, HMR 내장 |
| ESM/CJS 분리 | .cjs + .mts (프로세스 경계) | 런타임 충돌 원천 차단 |
| vitepress 배치 | dependencies (번들 포함) | 배포본 런타임에 필수 |
| VitePress spawn | process.execPath + ELECTRON_RUN_AS_NODE | OS별 셰임 의존 제거, 공백 경로 안전 |
| 라이브러리 모델 | 관리형 (고정 루트 + 컬렉션 UI) | 카테고리 구조 보장, 쓰기 가능 경로 |
| 영속 저장 | electron-store v8 | CJS 호환 마지막 메이저 버전 |
| 포트 할당 | get-port v5 | CJS 호환 마지막 메이저 버전 |
| 파일 감시 | chokidar v3 | CJS 호환, Electron 메인에서 직접 사용 |
