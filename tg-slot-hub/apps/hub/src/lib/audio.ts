/**
 * 아주 작은 오디오 뮤트 플래그.
 * 아직 sfx 파일이 없어 실제로 아무 소리도 재생하지 않는다 — 설정 화면의 "사운드" 토글은
 * 지금은 이 플래그를 저장할 뿐이고, `@tgslot/renderer`의 향후 AudioBus가 이 값을 읽어
 * 음소거 여부를 결정할 예정이다. 그 전까지는 값을 정직하게 들고만 있는다.
 */
let muted = false

export function setAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
}

export function isAudioMuted(): boolean {
  return muted
}
