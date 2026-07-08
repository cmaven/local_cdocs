/**
 * useSettings.ts: 사용자 문서 보기 설정(테마/줄간격/폰트크기/영역별 폰트) 상태 + 영속화(IPC 우선/localStorage 폴백) + CSS 변수 적용
 * 생성일: 2026-06-30 | 수정일: 2026-07-08
 */
import { reactive, ref } from 'vue'

/** 테마 모드: 라이트 / 다크 / 시스템 따라가기 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 폰트 선택 옵션 (드롭다운 항목) */
export interface FontOption {
  value: string
  label: string
  stack: string
}

/** 선택 가능한 폰트 목록 */
export const FONT_OPTIONS: FontOption[] = [
  {
    value: 'default',
    label: '기본(SUITE)',
    stack: "'SUITE Variable','SUITE-Regular',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  },
  {
    value: 'sans',
    label: '시스템 산세리프',
    stack: "system-ui,-apple-system,'Segoe UI',Roboto,'Malgun Gothic',sans-serif",
  },
  {
    value: 'serif',
    label: '세리프',
    stack: "Georgia,'Times New Roman','Noto Serif KR',serif",
  },
  {
    value: 'mono',
    label: '모노스페이스',
    stack: "'D2Coding ligature','D2Coding',Monaco,Consolas,monospace",
  },
]

/** 사용자 설정 스키마 */
export interface CdocsSettings {
  themeMode: ThemeMode
  lineHeight: number
  fontSize: number
  fontBody: string
  fontHeading: string
  fontSidebar: string
  fontToc: string
}

/** 기본 설정값 */
export const DEFAULT_SETTINGS: CdocsSettings = {
  themeMode: 'system',
  lineHeight: 1.85,
  fontSize: 16,
  fontBody: 'default',
  fontHeading: 'default',
  fontSidebar: 'default',
  fontToc: 'default',
}

/** localStorage 키 */
const STORAGE_KEY = 'cdocs-settings'

/** 전역 반응형 설정 상태 */
export const settings = reactive<CdocsSettings>({ ...DEFAULT_SETTINGS })

/** 폰트 value → CSS font-family stack 조회 (없으면 첫 항목) */
function fontStack(value: string): string {
  const found = FONT_OPTIONS.find((o) => o.value === value)
  return (found || FONT_OPTIONS[0]).stack
}

/**
 * 설정 로드: Electron IPC 우선, 없으면 localStorage 폴백 (SSR 안전, async)
 * - window.localcdocs?.getSettings() 존재 시 IPC(electron-store)에서 로드
 * - 순수 브라우저/CLI 환경에서는 localStorage 폴백으로 동작
 */
export async function loadSettings(): Promise<void> {
  try {
    // Electron IPC 경로
    const ipc = (window as any).localcdocs
    if (typeof window !== 'undefined' && ipc?.getSettings) {
      const stored = await ipc.getSettings()
      if (stored && typeof stored === 'object') {
        Object.assign(settings, { ...DEFAULT_SETTINGS, ...stored })
        return
      }
    }
  } catch {
    /* IPC 실패 시 localStorage 폴백으로 진행 */
  }
  // localStorage 폴백 (브라우저 직접 실행 / IPC 미응답)
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    Object.assign(settings, { ...DEFAULT_SETTINGS, ...parsed })
  } catch {
    /* 파싱 실패 시 기본값 유지 */
  }
}

/**
 * 현재 설정 저장: Electron IPC + localStorage 병기 저장 (SSR 안전)
 * - IPC 사용 가능 시 electron-store에 저장(재시작 후에도 유지)
 * - localStorage에도 항상 동기 저장(브라우저 폴백 일관성 유지)
 */
export function saveSettings(): void {
  // Electron IPC 저장 (비동기, 실패 무시)
  try {
    const ipc = (window as any).localcdocs
    if (typeof window !== 'undefined' && ipc?.saveSettings) {
      ipc.saveSettings({ ...settings }).catch?.(() => { /* 저장 실패 무시 */ })
    }
  } catch {
    /* IPC 호출 실패 무시 */
  }
  // localStorage 동기 저장 (항상 수행)
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* 저장 실패 무시 */
  }
}

/** 현재 설정을 CSS 변수로 주입 (SSR 안전) */
export function applyCssVars(): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement.style
  el.setProperty('--cdocs-line-height', String(settings.lineHeight))
  el.setProperty('--cdocs-content-font-size', settings.fontSize + 'px')
  el.setProperty('--cdocs-font-body', fontStack(settings.fontBody))
  el.setProperty('--cdocs-font-heading', fontStack(settings.fontHeading))
  el.setProperty('--cdocs-font-sidebar', fontStack(settings.fontSidebar))
  el.setProperty('--cdocs-font-toc', fontStack(settings.fontToc))
}

/** 테마 모드를 실제 다크 여부로 해석 (SSR 안전) */
export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return mode === 'dark'
}

/** 설정을 기본값으로 초기화 */
export function resetSettings(): void {
  Object.assign(settings, DEFAULT_SETTINGS)
}

/**
 * 설정 모달 열림 상태(전역 공유).
 * 상단 nav 기어(홈/page)와 사이드바 footer 기어(문서)가 동일 모달을 공유하기 위한 계약.
 */
export const settingsOpen = ref(false)

/** 설정 모달 열기 */
export function openSettings(): void {
  settingsOpen.value = true
}

/** 설정 모달 닫기 */
export function closeSettings(): void {
  settingsOpen.value = false
}
