<!-- 08-cross-platform-runtime-bundling.md: Linux에서 빌드한 Windows 앱이 런타임에 VitePress를 못 띄우는 문제와 해결 | 생성일: 2026-06-22 -->

# Linux 빌드 → Windows 실행 시 VitePress 기동 실패와 해결

이 앱은 **런타임에 VitePress dev 서버(Node 툴체인)를 자식 프로세스로 실행**하는 구조다.
그래서 설치본 `.exe`를 **Linux(WSL)에서 빌드**하면, Windows에서 실행할 때
`문서 서버가 예기치 않게 종료되었습니다` / `VitePress 서버 응답 시간 초과` 오류가 난다.
실제로 겪은 문제이며, 원인은 **3가지가 겹쳐** 있었다.

## 원인 1 — VitePress가 devDependency라 패키지에서 제외됨

electron-builder는 `files`에 `node_modules/**/*`를 써도 **devDependencies는 빌드 산출물에서 제외**한다
(production 의존성 트리만 포함). `vitepress`/`gray-matter`가 `devDependencies`에 있어서
**vitepress·vite·esbuild가 통째로 패키지에 안 들어갔다.**

**해결**: 런타임에 필요한 패키지는 `dependencies`로 옮긴다.
```jsonc
// package.json
"dependencies": {
  "vitepress": "^1.6.3",     // devDependencies → dependencies 이동
  "gray-matter": "^4.0.3",
  // ... vue, mermaid, chokidar, electron-store, get-port
},
"devDependencies": {
  "electron": "^33.2.0",      // 빌드 전용만 남김
  "electron-builder": "^25.1.8"
}
```
> 확인법: 빌드 후 `dist/win-unpacked/resources/app/node_modules/vitepress/` 가 존재해야 한다.

## 원인 2 — `.bin/vitepress.cmd` 셰임이 없음

`node_modules/.bin/`의 실행 셰임은 **npm install 시점의 OS에 맞춰 생성**된다.
Linux에서 설치하면 `.bin/vitepress`(심볼릭 링크)만 생기고, Windows용 `.bin/vitepress.cmd`는 **없다.**
그래서 `spawn('node_modules/.bin/vitepress.cmd', ...)`가 Windows에서 즉시 실패한다.

**해결**: 셰임에 의존하지 말고, **Electron 실행파일을 node 모드로 써서 vitepress의 JS 진입점을 직접 실행**한다.
```js
// electron/main.cjs
const VITEPRESS_ENTRY = path.join(APP_ROOT, 'node_modules', 'vitepress', 'bin', 'vitepress.js')

vpProcess = spawn(process.execPath, [VITEPRESS_ENTRY, 'dev', VITEPRESS_CORE], {
  cwd: APP_ROOT,
  env: { ...env, ELECTRON_RUN_AS_NODE: '1' },  // Electron exe를 순수 node처럼 동작
  windowsHide: true,
})
```
`ELECTRON_RUN_AS_NODE=1`이면 별도 Node 설치 없이 Electron 바이너리가 Node 역할을 한다.
`.cmd`/`shell:true`가 불필요해져 **경로 공백·OS 차이 문제도 사라진다.**

## 원인 3 — 네이티브 바이너리가 Linux용

VitePress → Vite는 **esbuild**(OS별 실행파일)와 **rollup**(OS별 `.node`)을 쓴다.
Linux에서 설치하면 `@esbuild/linux-x64`(ELF), `@rollup/rollup-linux-x64-gnu`만 들어가
**Windows에서 로드 불가** → 서버가 죽는다.

**해결**: Windows용 네이티브 패키지를 node_modules에 주입하고 `optionalDependencies`로 선언한다.
```bash
# 버전은 설치된 esbuild/rollup과 정확히 일치시킨다 (예: 0.21.5 / 4.62.2)
cd /tmp && npm pack @esbuild/win32-x64@0.21.5 @rollup/rollup-win32-x64-msvc@4.62.2
cd <프로젝트>/local_cdocs
mkdir -p node_modules/@esbuild/win32-x64 node_modules/@rollup/rollup-win32-x64-msvc
tar xzf /tmp/esbuild-win32-x64-0.21.5.tgz            -C node_modules/@esbuild/win32-x64 --strip-components=1
tar xzf /tmp/rollup-rollup-win32-x64-msvc-4.62.2.tgz -C node_modules/@rollup/rollup-win32-x64-msvc --strip-components=1
```
```jsonc
// package.json — electron-builder가 win32 타깃 빌드에 포함하도록 선언
"optionalDependencies": {
  "@esbuild/win32-x64": "0.21.5",
  "@rollup/rollup-win32-x64-msvc": "4.62.2"
}
```
> npm은 `--os=win32` 플래그로도 타 플랫폼 패키지 직접 설치를 거부(EBADPLATFORM)하므로 `npm pack` + 수동 압축해제가 확실하다.
> 확인법: `dist/win-unpacked/resources/app/node_modules/@esbuild/win32-x64/esbuild.exe` 가 **PE32+ (MS Windows)** 여야 한다.

## 가장 깔끔한 방법 — 그냥 Windows에서 빌드

위 3가지는 모두 **"Linux에서 Windows 앱을 크로스 빌드"하기 때문에** 생기는 문제다.
**실제 Windows에서 빌드하면** npm이 알아서 Windows용 셰임·네이티브 바이너리를 깔아주므로
원인 2·3이 원천적으로 사라진다(원인 1은 `dependencies` 정리로 동일하게 필요).
```powershell
# Windows에서
npm install
npm run build:win
```

## 참고 — `\\wsl$` 경로 주의

Windows 앱에서 문서 폴더를 `\\wsl$\Ubuntu\...` 같은 **WSL 네트워크 경로(UNC)**로 지정하면,
toolchain이 정상이어도 Vite의 파일 접근/감시가 느리거나 **실시간 자동 갱신이 안 될 수 있다.**
가능하면 문서를 **일반 Windows 경로(예: `C:\Users\<나>\Documents\docs`)**에 두고 테스트하는 것을 권장한다.
