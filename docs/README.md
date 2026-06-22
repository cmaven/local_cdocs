<!-- README.md: local_cdocs 개발자 문서 인덱스 | 생성일: 2026-06-22 | 수정일: 2026-06-22 -->

# local_cdocs 개발자 문서

local_cdocs(로컬 Markdown 뷰어) 프로젝트의 설계·구현 가이드입니다.
cdocs(VitePress 웹 문서 포털)를 **Electron 데스크톱 앱**으로 이식한 프로젝트로,
**Windows·Linux** 양쪽에서 동작하는 **관리형 라이브러리** 모델입니다.

이 문서들은 "비슷한 프로그램을 직접 만들려는 개발자"가 따라 만들 수 있도록
**실제 코드 발췌와 근거**를 담았습니다.

## 문서 목록

### 설계 · 아키텍처
| 문서 | 설명 |
|------|------|
| [01. 전체 아키텍처](./01-architecture.md) | 3프로세스 모델(Electron 메인 / VitePress 자식 / 렌더러), 관리형 라이브러리 동작 흐름 (Mermaid 포함) |
| [02. 기술 결정 근거](./02-tech-decisions.md) | Electron+VitePress 선택, ESM/CJS 분리(.mts), vitepress를 dependencies로, execPath spawn, 관리형 라이브러리 채택 이유 |
| [03. VitePress 동적 srcDir](./03-vitepress-dynamic-srcdir.md) | 임의 폴더를 문서 루트(srcDir)로 쓰는 메커니즘 + 폴더=카테고리 스캔 로직 코드 |
| [04. 실시간 파일 감시](./04-realtime-watch.md) | chokidar → 디바운스 재시작 → 창 리로드, 좀비 프로세스 방지 코드 |

### 관리형 라이브러리 · UI
| 문서 | 설명 |
|------|------|
| [09. 관리형 라이브러리 (백엔드)](./09-managed-library.md) | 고정 루트·시드, 컬렉션 fs 함수(검증/경로탈출 차단/충돌 suffix), IPC 핸들러 6종, preload 브리지 |
| [10. IPC · 대시보드 UI](./10-ipc-and-dashboard.md) | window.localcdocs API, 대시보드 구조, window.prompt 대체 커스텀 모달, 메뉴 해시 연동, 드롭다운 URL 인코딩 처리 |
| [11. 테마 · Mermaid](./11-theming-and-mermaid.md) | 민트/다크 테마, 코드블록 대비, Mermaid 다크 색·글자 잘림(line-height) 해결, 다크 토글 |

### 빌드 · 배포
| 문서 | 설명 |
|------|------|
| [05. 빌드 및 배포](./05-build-and-distribution.md) | 크로스플랫폼 빌드(Win NSIS+portable / Linux AppImage), `build:all`, electron-builder.yml·scripts 발췌 |
| [07. Linux/WSL에서 Windows 빌드](./07-windows-build-on-linux.md) | Wine이란 무엇인가, Windows .exe 빌드에 필요한 작업·재현 절차 |
| [08. 크로스 빌드 런타임 번들 문제](./08-cross-platform-runtime-bundling.md) | Linux 빌드 → Windows 실행 시 기동 실패 3대 원인과 해결 (devDep 제외, .cmd 셰임, 네이티브 바이너리) |

### 사용자 가이드
| 문서 | 설명 |
|------|------|
| [06. 사용자 가이드](./06-usage.md) | 설치, 관리형 라이브러리, 대시보드에서 컬렉션 관리, 폴더 구조, 단축키 |

## 프로젝트 핵심 개요

- **목표**: VitePress로 렌더링되는 로컬 Markdown 뷰어 (웹 cdocs와 동일한 화면)
- **플랫폼**: Windows · Linux 데스크톱 (Electron 33)
- **모델**: 고정 라이브러리 루트(`Documents/local-cdocs`)를 항상 열고, 그 안의 **폴더 하나 = 컬렉션 = 카테고리**
- **핵심 기능**: 대시보드에서 컬렉션 생성/가져오기/이름변경/삭제 · 폴더 스캔 자동 사이드바/홈 · chokidar 실시간 감지 자동 갱신
- **배포**: Windows NSIS 설치본 + portable `.exe`, Linux AppImage (Node.js 미설치 환경에서 단독 실행)

관련 문서: [PLAN.md](../PLAN.md) · [PLAN-library.md](../PLAN-library.md) · 팀 작업 로그 [WORK_LOG.md](../WORK_LOG.md)
