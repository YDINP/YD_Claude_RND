# Template Slot

> TODO: 이 문단을 게임 한 줄 소개로 바꾼다. 컨셉·차별점·헤드라인 메커닉을 적는다.

3x3, 5라인, 와일드 + Any BAR 그룹 배당. `classic-777`을 그대로 복사한 기본형이다.

## 페이테이블

배수 기준은 **라인당 베팅액**이다 (총 베팅액이 아니다). 왼쪽에서 오른쪽으로 연속 매치만 인정한다.

| 심볼 | 3개 | 2개 | 1개 |
|---|---|---|---|
| Wild Diamond | 500 | - | - |
| Lucky Seven | 150 | 8 | - |
| Triple BAR | 50 | - | - |
| Double BAR | 30 | - | - |
| Single BAR | 20 | - | - |
| Bell | 6 | - | - |
| Cherry | 4 | 2 | 1 |
| Any BAR (그룹) | 5 | - | - |

## 실측 수치

> TODO: `pnpm --filter @tgslot/rtp-sim sim <id> --exact` 결과로 채운다.

| 지표 | 목표 | 실측 |
|---|---|---|
| RTP | `rtpTarget` ± 0.5%p | - |
| 적중률 | 3릴 35~45% / 5릴 25~35% | - |
| 최대 배수 | 총 베팅액의 100배 이상 | - |
| RTP 계산 | - | - |

## 아트

| 파일 | 상태 |
|---|---|
| `theme/symbols/*.webp` | TODO |
| `theme/frame.webp` | TODO |
| `theme/bg.webp` | TODO |
| `thumb.webp` | TODO |

생성: `pnpm --filter @tgslot/theme-gen gen games/<id>`
검사: `pnpm pack:check <id>`
