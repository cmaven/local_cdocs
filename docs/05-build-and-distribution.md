<!-- 05-build-and-distribution.md: 크로스플랫폼 빌드 및 배포 (Windows + Linux) | 생성일: 2026-06-22 | 수정일: 2026-06-22 -->

# 05. 빌드 및 배포

## 개요

local_cdocs는 `electron-builder`를 사용해 **Windows(NSIS 설치본 + portable)와 Linux(AppImage)** 패키지를 동일한 코드베이스에서 생성합니다. Node.js가 설치되지 않은 환경에서도 단독 실행 가능한 배포본을 만드는 것이 목표입니다.

---

## electron-builder 설정 (`electron-builder.yml`)

```yaml
appId: com.cmaven.localcdocs
productName: local-cdocs
copyright: Copyright © 2026 cmaven

# asar 비활성화: VitePress가 node_modules/.bin/vitepress를 실제 파일로 spawn 해야 하므로
# (asar 내부 바이너리는 자식 프로세스로 직접 실행 불가) 압축 아카이브를 끈다.
asar: false

directories:
  output: dist
  buildResources: build

# 번들에 포함할 파일/폴더
files:
  - electron/**/*
  - vitepress-core/**/*
  - docs-template/**/*
  - package.json
  # node_modules는 dependencies만 자동 포함됨(electron-builder 기본).
  # vitepress는 devDependency라 명시적으로 포함해야 한다.
  - node_modules/**/*

# devDependency(vitepress 등)도 런타임에 필요하므로 prune 비활성
npmRebuild: false

win:
  target:
    - target: nsis
      arch:
        - x64
    - target: portable
      arch:
        - x64
  icon: build/icon.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: local-cdocs

portable:
  artifactName: local-cdocs-portable-${version}.exe

linux:
  target:
    - AppImage
  category: Utility
  synopsis: Local Markdown viewer (cdocs desktop edition)

appImage:
  artifactName: local-cdocs-${version}.AppImage
```

---

## asar: false 이유

VitePress dev 서버는 **런타임에 자식 프로세스로 spawn**됩니다. asar 아카이브 내부의 바이너리는 자식 프로세스로 직접 실행할 수 없으므로 `asar: false`로 압축을 비활성화합니다. 대신 `node_modules/**/*`를 `files`에 명시해 전체 트리를 번들에 포함합니다.

---

## 빌드 스크립트 (`package.json`)

```json
"scripts": {
  "vp:dev": "vitepress dev vitepress-core",
  "start": "electron .",
  "dev": "electron .",
  "build:win": "electron-builder --win",
  "build:linux": "electron-builder --linux",
  "build:all": "electron-builder --win --linux",
  "pack": "electron-builder --dir"
}
```

| 명령 | 설명 |
|------|------|
| `npm run build:win` | Windows: NSIS 설치본 + portable.exe 생성 |
| `npm run build:linux` | Linux: AppImage 생성 |
| `npm run build:all` | Windows + Linux 동시 빌드 |
| `npm run pack` | 설치본 생성 없이 `dist/win-unpacked/` 또는 `dist/linux-unpacked/`만 생성 (빠른 검증용) |

---

## 배포 형태와 산출물

```
dist/
├── local-cdocs Setup 1.0.0.exe          ← Windows NSIS 설치 마법사
├── local-cdocs-portable-1.0.0.exe       ← Windows 무설치 단일 실행 파일
├── local-cdocs-1.0.0.AppImage           ← Linux 범용 단일 실행 파일
└── win-unpacked/                        ← 압축 전 앱 폴더 (검증용)
    └── local-cdocs.exe                  ← 직접 실행 가능
```

| 형태 | 특징 |
|------|------|
| NSIS 설치본 | 설치 마법사, 시작메뉴/바탕화면 바로가기, 제어판 제거 지원 |
| portable.exe | 단일 파일, 설치 불필요, USB 이동 가능 |
| AppImage | 설치 없이 실행 권한만 부여하면 실행 (`chmod +x`) |

---

## win32 네이티브 바이너리 — optionalDependencies

Linux에서 빌드하면 VitePress/Vite가 사용하는 네이티브 바이너리(esbuild, rollup)가 **Linux용**으로만 설치됩니다. Windows 배포본 실행 시 로드 불가로 서버가 죽습니다.

해결: Windows용 네이티브 패키지를 `optionalDependencies`로 선언해 번들에 포함합니다.

```json
// package.json
"optionalDependencies": {
  "@esbuild/win32-x64": "0.21.5",
  "@rollup/rollup-win32-x64-msvc": "4.62.2"
}
```

버전은 설치된 esbuild/rollup 버전과 **정확히 일치**시켜야 합니다. npm은 `--os=win32` 직접 설치를 거부(EBADPLATFORM)하므로 `npm pack`으로 수동 주입합니다. 상세 절차는 [08. 크로스플랫폼 런타임 번들링](./08-cross-platform-runtime-bundling.md) 참조.

---

## 의존성 배치 전략

electron-builder는 `devDependencies`를 번들에서 제외합니다. VitePress는 **런타임**에 필요하므로 `dependencies`에 배치합니다.

```json
// package.json
"dependencies": {
  "vitepress": "^1.6.3",    // 런타임 VitePress dev 서버 — dependencies 필수
  "vue": "^3.5.13",
  "mermaid": "^11.14.0",
  "chokidar": "^3.6.0",
  "electron-store": "^8.2.0",
  "get-port": "^5.1.1",
  "gray-matter": "^4.0.3",
  "asciinema-player": "^3.15.1"
},
"devDependencies": {
  "electron": "^33.2.0",      // 빌드 도구만
  "electron-builder": "^25.1.8"
}
```

---

## Linux에서 Windows 빌드 (Wine 필요)

WSL/Linux에서 `npm run build:win`을 실행하려면 Wine이 필요합니다. NSIS 설치본 생성 단계에서 Wine이 32비트 스텁을 실행하므로 `wine32:i386`까지 설치해야 합니다.

```bash
# Wine 설치 (Ubuntu/WSL)
sudo apt-get install -y wine
sudo dpkg --add-architecture i386 && sudo apt-get update
sudo apt-get install -y wine32:i386

# 빌드
npm run build:win
```

Wine 설치 없이 Windows 실행 폴더만 필요하면 `npm run pack`으로 `win-unpacked/`까지만 생성합니다. 상세 트러블슈팅은 [07. Linux에서 Windows 빌드](./07-windows-build-on-linux.md) 참조.

가장 간단한 방법은 **실제 Windows에서 빌드**하는 것입니다.

```powershell
# Windows(PowerShell)에서
npm install
npm run build:win   # Wine 불필요 → dist/에 Setup.exe + portable.exe
```

---

## 번들 용량

| 구성 요소 | 예상 용량 |
|----------|---------|
| Electron 런타임 (Chromium + Node.js) | ~100MB |
| VitePress + node_modules | ~40MB |
| 앱 소스 (electron/, vitepress-core/) | ~5MB |
| **합계** | **~145MB** |

번들 크기 ~150MB는 사내 도구 배포 맥락에서 수용 가능합니다. 기술 결정 상세는 [02. 기술 결정 근거](./02-tech-decisions.md) 참조.

---

## 빌드 환경 요구사항

| 항목 | 요구사항 |
|------|---------|
| OS | Windows 10+ 또는 WSL2/Linux (크로스 빌드 시 Wine 필요) |
| Node.js | 18+ |
| npm | 8+ |
| electron-builder | ^25.1.8 (devDependencies에 포함) |

---

## 배포 검증 기준

빌드된 패키지가 아래 조건을 만족해야 배포 완료로 간주합니다.

1. Node.js 미설치 Windows 10/11에서 설치본 실행 성공
2. 앱 실행 후 `Documents/local-cdocs` 라이브러리 자동 생성 및 "시작하기" 컬렉션 시드
3. 대시보드에서 컬렉션 생성/가져오기/이름변경/삭제 정상 동작
4. Mermaid 다크모드 포함 다이어그램 렌더링 정상
5. NSIS 설치본: 제어판 → 프로그램 제거 정상 동작
