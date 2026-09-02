/**
 * Telegram Mini App SDK 얇은 래퍼 (@telegram-apps/sdk-react 기반)
 *
 * 목적: 앱의 나머지 코드가 SDK를 직접 참조하지 않게 감싼다.
 * 텔레그램 밖(일반 브라우저)에서 열려도 절대 throw하지 않도록
 * 모든 SDK 호출을 개별 try/catch로 감싼다.
 */
import {
  init as initSdkCore,
  backButton,
  miniApp,
  themeParams,
  viewport,
  hapticFeedback,
  retrieveRawInitData,
} from '@telegram-apps/sdk-react'

export type HapticKind = 'light' | 'medium' | 'success'

/**
 * SDK 초기화 + 주요 컴포넌트 mount.
 * 텔레그램 밖에서 호출되면 각 단계가 개별적으로 실패하며 조용히 무시된다.
 */
export function initTma(): void {
  try {
    initSdkCore()
  } catch {
    /* 텔레그램 브릿지 없음 — 이후 단계도 자연스럽게 실패하고 무시됨 */
  }

  try {
    if (backButton.isSupported()) backButton.mount()
  } catch {
    /* noop */
  }

  try {
    miniApp.mount()
  } catch {
    /* noop */
  }

  try {
    themeParams.mount()
  } catch {
    /* noop */
  }

  try {
    // mount()가 Promise를 반환하는 버전/미반환 버전 모두 안전하게 처리
    void Promise.resolve(viewport.mount())
      .then(() => {
        try {
          viewport.expand()
        } catch {
          /* noop */
        }
        try {
          viewport.bindCssVars()
        } catch {
          /* noop */
        }
      })
      .catch(() => {
        /* noop */
      })
  } catch {
    /* noop */
  }

  try {
    miniApp.bindCssVars()
  } catch {
    /* noop */
  }

  try {
    themeParams.bindCssVars()
  } catch {
    /* noop */
  }

  try {
    miniApp.ready()
  } catch {
    /* noop */
  }
}

/**
 * 현재 세션의 raw initData 문자열을 반환한다.
 * 텔레그램 밖에서 열렸거나 launch params를 읽을 수 없으면 null.
 */
export function getInitDataRaw(): string | null {
  try {
    return retrieveRawInitData() ?? null
  } catch {
    return null
  }
}

/** 텔레그램 안에서 열렸는지 여부 (initData 존재 여부로 판단) */
export function isInsideTelegram(): boolean {
  return getInitDataRaw() !== null
}

/** 직전에 showBackButton()이 등록한 리스너 해제 함수. 중복 등록을 막는 데 쓴다. */
let backButtonCleanup: (() => void) | null = null

/**
 * 텔레그램 BackButton을 보이고 클릭 리스너를 건다.
 * 텔레그램 밖/미지원이면 조용히 무시된다 (게임 화면은 별도로 인페이지 뒤로가기를 둔다).
 */
export function showBackButton(onClick: () => void): void {
  try {
    backButtonCleanup?.()
    backButtonCleanup = null

    if (!backButton.isSupported()) return
    if (!backButton.isMounted()) backButton.mount()

    backButtonCleanup = backButton.onClick(onClick)
    backButton.show()
  } catch {
    /* noop */
  }
}

/** showBackButton()으로 건 리스너를 해제하고 버튼을 숨긴다. */
export function hideBackButton(): void {
  try {
    backButtonCleanup?.()
    backButtonCleanup = null
    backButton.hide()
  } catch {
    /* noop */
  }
}

const THEME_CSS_VAR_MAP = {
  bgColor: '--tg-theme-bg-color',
  textColor: '--tg-theme-text-color',
  hintColor: '--tg-theme-hint-color',
  linkColor: '--tg-theme-link-color',
  buttonColor: '--tg-theme-button-color',
  buttonTextColor: '--tg-theme-button-text-color',
  secondaryBgColor: '--tg-theme-secondary-bg-color',
} as const

export type ThemeColorKey = keyof typeof THEME_CSS_VAR_MAP
export type ThemeColors = Partial<Record<ThemeColorKey, string>>

/**
 * initTma()가 문서에 bind한 --tg-theme-* CSS 변수를 읽어 반환한다.
 * SDK의 개별 getter 메서드 시그니처에 의존하지 않는 안전한 경로.
 */
export function getThemeColors(): ThemeColors {
  try {
    if (typeof document === 'undefined') return {}
    const styles = getComputedStyle(document.documentElement)
    const colors: ThemeColors = {}
    for (const key of Object.keys(THEME_CSS_VAR_MAP) as ThemeColorKey[]) {
      const value = styles.getPropertyValue(THEME_CSS_VAR_MAP[key]).trim()
      if (value) colors[key] = value
    }
    return colors
  } catch {
    return {}
  }
}

/** TMA 햅틱 피드백. 텔레그램 밖이거나 미지원이면 조용히 무시된다. */
export function haptic(kind: HapticKind): void {
  try {
    if (kind === 'success') {
      hapticFeedback.notificationOccurred('success')
    } else {
      hapticFeedback.impactOccurred(kind)
    }
  } catch {
    /* noop */
  }
}
