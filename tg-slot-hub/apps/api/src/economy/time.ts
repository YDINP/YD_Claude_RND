/**
 * 허브의 시간 버킷. 데일리(UTC 일자)와 주간(ISO 주차)을 문자열 키로 만든다.
 * 서버 로컬 타임존에 의존하면 배포 리전을 옮기는 순간 보너스/리더보드 경계가 흔들리므로
 * 전부 UTC로 고정한다.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** 현재 시각 공급자. 테스트가 시간을 앞당길 수 있도록 주입 지점을 하나로 모은다. */
export type Clock = () => Date

export const systemClock: Clock = () => new Date()

/** UTC 일자 키 (`YYYY-MM-DD`). 미션과 데일리 보너스의 버킷. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** 1970-01-01부터의 UTC 일수. 연속 로그인 판정에 쓴다. */
export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY)
}

/** 다음 UTC 자정. 데일리 보너스가 다시 열리는 시각. */
export function startOfNextUtcDay(date: Date): Date {
  return new Date((utcDayNumber(date) + 1) * MS_PER_DAY)
}

/**
 * ISO 8601 주차 키 (`YYYY-Www`). 주는 월요일에 시작하고, 한 해의 1주차는
 * 그 해 첫 목요일이 포함된 주다. 12월 말/1월 초가 옆 해의 주차에 속할 수 있어
 * 연도도 주차 기준으로 다시 계산한다.
 */
export function isoWeekKey(date: Date): string {
  const thursday = isoWeekThursday(date)
  const year = thursday.getUTCFullYear()
  const firstThursday = isoWeekThursday(new Date(Date.UTC(year, 0, 4)))
  const week = Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** 이 주가 시작한 월요일 00:00 UTC */
export function isoWeekStart(date: Date): Date {
  const day = utcDayNumber(date)
  // getUTCDay(): 0=일요일. 월요일 기준으로 옮긴다.
  const weekday = (date.getUTCDay() + 6) % 7
  return new Date((day - weekday) * MS_PER_DAY)
}

/** 이 주가 끝나는 시각 = 다음 주 월요일 00:00 UTC (배타적 상한) */
export function isoWeekEnd(date: Date): Date {
  return new Date(isoWeekStart(date).getTime() + 7 * MS_PER_DAY)
}

/** 그 주의 목요일 00:00 UTC. ISO 주차 계산의 기준점이다. */
function isoWeekThursday(date: Date): Date {
  return new Date(isoWeekStart(date).getTime() + 3 * MS_PER_DAY)
}
