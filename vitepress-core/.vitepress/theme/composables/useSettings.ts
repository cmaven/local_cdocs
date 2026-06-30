/**
 * useSettings.ts: 사용자 문서 보기 설정(테마/줄간격/폰트크기/영역별 폰트) 상태 + localStorage 영속화 + CSS 변수 적용
 * 생성일: 2026-06-30 | 수정일: 2026-06-30
 */
import { reactive } from 'vue'

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

/** localStorage에서 설정 로드 (SSR 안전) */
export function loadSettings(): void {
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

/** 현재 설정을 localStorage에 저장 (SSR 안전) */
export function saveSettings(): void {
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
