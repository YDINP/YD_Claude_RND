/**
 * 설정 시트 — 언어, 사운드/진동/모션 줄이기 토글, 공정성 검증 설명, 앱 버전, 지원용 텔레그램 ID.
 * 언어를 구체적인 값(en/ko)으로 바꾸면 로컬(useSettingsStore)에 즉시 반영돼 화면 전체가 바로
 * 다시 그려지고, 이어서 PATCH /me로 서버에도 저장을 시도한다. 실패해도 로컬 선택은 그대로 유지하고
 * 콘솔에만 남긴다 — 사용자가 고른 언어가 네트워크 문제로 되돌아가면 안 된다.
 */
import type { ReactNode } from 'react'
import type { PublicUser } from '@tgslot/shared'
import { useSettingsStore, type SettingsLocale } from '../store/settings'
import { useSessionStore } from '../store/session'
import { patchMe } from '../sdk/api'
import { useT } from '../i18n'
import './SettingsSheet.css'

interface SettingsSheetProps {
  user: PublicUser
  onClose: () => void
}

/** vite.config.ts가 package.json의 version을 define으로 심어준다. 없으면(테스트 등) 'dev'. */
const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev'

interface ToggleRowProps {
  label: string
  hint?: string
  on: boolean
  onToggle: () => void
}

function ToggleRow({ label, hint, on, onToggle }: ToggleRowProps): ReactNode {
  return (
    <div className="hub-settings__toggle-row">
      <div className="hub-settings__toggle-text">
        <span className="hub-settings__label">{label}</span>
        {hint && <span className="hub-settings__hint">{hint}</span>}
      </div>
      <button
        type="button"
        className="hub-settings__switch"
        role="switch"
        aria-checked={on}
        aria-label={label}
        data-on={on}
        onClick={onToggle}
      >
        <span className="hub-settings__switch-knob" />
      </button>
    </div>
  )
}

export function SettingsSheet({ user, onClose }: SettingsSheetProps): ReactNode {
  const t = useT()
  const locale = useSettingsStore((s) => s.locale)
  const sound = useSettingsStore((s) => s.sound)
  const haptics = useSettingsStore((s) => s.haptics)
  const reducedMotion = useSettingsStore((s) => s.reducedMotion)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const setSound = useSettingsStore((s) => s.setSound)
  const setHaptics = useSettingsStore((s) => s.setHaptics)
  const setReducedMotion = useSettingsStore((s) => s.setReducedMotion)

  const handleLocaleChange = (next: SettingsLocale): void => {
    setLocale(next)
    if (next === 'auto') return

    const token = useSessionStore.getState().token
    if (!token) return
    void patchMe(token, next)
      .then((me) => {
        useSessionStore.setState({ user: me.user, wallet: me.wallet })
      })
      .catch((err) => {
        console.error('[settings] failed to save language to the server; keeping the local choice', err)
      })
  }

  return (
    <div className="hub-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="hub-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="hub-sheet__title">{t('settings')}</h2>

        <div className="hub-settings__section">
          <span className="hub-settings__label">{t('language')}</span>
          <div className="hub-settings__segmented" role="radiogroup" aria-label={t('language')}>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'auto'}
              data-active={locale === 'auto'}
              onClick={() => handleLocaleChange('auto')}
            >
              {t('localeAuto')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'en'}
              data-active={locale === 'en'}
              onClick={() => handleLocaleChange('en')}
            >
              English
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={locale === 'ko'}
              data-active={locale === 'ko'}
              onClick={() => handleLocaleChange('ko')}
            >
              한국어
            </button>
          </div>
        </div>

        <ToggleRow label={t('sound')} on={sound} onToggle={() => setSound(!sound)} />
        <ToggleRow label={t('haptics')} on={haptics} onToggle={() => setHaptics(!haptics)} />
        <ToggleRow
          label={t('reduceMotion')}
          hint={t('reduceMotionHint')}
          on={reducedMotion}
          onToggle={() => setReducedMotion(!reducedMotion)}
        />

        <div className="hub-settings__section">
          <span className="hub-settings__label">{t('fairnessSectionTitle')}</span>
          <p className="hub-settings__explainer">{t('fairnessExplainer')}</p>
        </div>

        <div className="hub-settings__footer">
          <span>
            {t('version')} {APP_VERSION}
          </span>
          <span className="hub-settings__support-id">
            {t('supportId')}: {user.telegramId}
          </span>
        </div>

        <button type="button" className="hub-sheet__close" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  )
}
