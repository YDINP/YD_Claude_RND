/**
 * 정원 HUD — 목표 띠(물뿌리개 몇 개 → 정원 프리스핀)와 성장 막대(크기 배지·줄기 막대·«다음 크기까지 n칸»).
 *
 * 값의 주인은 서버다. 막대는 스토어(`store/garden.ts`)가 렌더러 이벤트·서버 이월 상태에서 접은 값만 보여 준다 —
 * 문턱 2칸 안에서 봉오리가 부푸는 것도 실제 진행도일 때만 켠다(결과를 미리 아는 척하지 않는다).
 * 규칙 설명은 여기 쓰지 않는다(도움말 페이지 몫).
 */
import type { ReactNode } from 'react'
import type { GameMath } from '@tgslot/slot-engine'
import { useT } from '../../i18n'
import { gardenMeterOf, type GardenView } from '../../store/garden'
import './GardenMeter.css'

interface GardenHudProps {
  math: GameMath
  view: GardenView
  /** `theme.symbols`. 목표 띠의 물뿌리개 그림. 없으면 글자만. */
  symbols?: Record<string, string> | undefined
  /** 프리스핀 중에는 목표 띠를 «라운드 진행»으로 바꾸지 않고 숨긴다(이미 들어왔다). */
  hideGoal?: boolean
}

export function GardenHud({ math, view, symbols, hideGoal = false }: GardenHudProps): ReactNode {
  const t = useT()
  const config = math.growBoard
  if (config === undefined) return null
  const meter = gardenMeterOf(view)
  const scatterId = math.scatter?.symbol
  const icon = scatterId === undefined ? undefined : symbols?.[scatterId]
  const count = config.bonus.trigger

  const label = meter.full
    ? meter.sun
      ? t(meter.toNext === 1 ? 'gardenMeterSunOne' : 'gardenMeterSun', { n: meter.toNext })
      : t('gardenMeterFull')
    : t(meter.toNext === 1 ? 'gardenMeterNextOne' : 'gardenMeterNext', { n: meter.toNext })

  return (
    <div className="hub-garden-hud" data-round={view.round ? 'true' : undefined}>
      {hideGoal ? (
        // 프리스핀 중에도 띠 높이를 비워 둔다. 띠가 빠졌다 돌아오면 판이 들썩이고,
        // 라운드 도중 새로고침한 화면에서는 캔버스가 늘어난 높이로 굳어 끝난 뒤 화면이 밀려 올라간다.
        <div className="hub-garden-ribbon hub-garden-ribbon--placeholder" aria-hidden="true" />
      ) : (
        <div className="hub-garden-ribbon" role="note" aria-label={t('gardenRibbonGoalAria', { count })}>
          {icon !== undefined && (
            <img
              className="hub-garden-ribbon__icon"
              src={icon}
              alt=""
              width={22}
              height={22}
              onError={(event) => {
                // 그림을 못 받아도 글자만으로 읽힌다. 깨진 그림 자리를 비운다.
                event.currentTarget.style.display = 'none'
              }}
            />
          )}
          <span className="hub-garden-ribbon__text">{t('gardenRibbonGoal', { count })}</span>
        </div>
      )}
      <div
        className="hub-garden-meter"
        role="progressbar"
        aria-label={t('gardenMeterLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(meter.fill * 100)}
        aria-valuetext={`${t('gardenMeterSize', { size: meter.size })} · ${label}`}
        data-near={meter.near ? 'true' : undefined}
        data-full={meter.full ? 'true' : undefined}
      >
        {/* key가 바뀌면 배지가 한 번 튄다(성장 신호). */}
        <span key={view.grewTick} className="hub-garden-meter__size" data-grew={view.grewTick > 0 ? 'true' : undefined}>
          {meter.size}×{meter.size}
        </span>
        <span className="hub-garden-meter__stem" aria-hidden="true">
          <span className="hub-garden-meter__fill" style={{ width: `${Math.round(meter.fill * 100)}%` }} />
          <span className="hub-garden-meter__bud" style={{ left: `${Math.round(meter.fill * 100)}%` }} />
        </span>
        <span className="hub-garden-meter__label">{label}</span>
      </div>
    </div>
  )
}
