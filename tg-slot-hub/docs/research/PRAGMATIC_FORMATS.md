# 프라그마틱 플레이 슬롯 형태 조사 (2026-11-27)

목적: 다음 추가 슬롯을 5x3 페이라인이 아닌 새 형태로 만들기 위한 참고. 메카닉·격자만 참고하고 테마·이름·심볼·그림은 가져오지 않는다.
수치는 2차 매체 기준이며 공식 사이트 원문은 확인하지 못했다. 구현 전 규칙을 다시 확인할 것.

## 형태별 정리

| 형태 | 규칙 | 예시 | 출처 |
|---|---|---|---|
| 6x5 위치 무관 지불 + 낙하 | 같은 심볼 8개 이상이면 위치 상관없이 지불, 당첨 심볼이 사라지고 위에서 새로 떨어짐(연쇄). 배율 구슬 합산 | Gates of Olympus, Jelly Express | [OLBG](https://www.olbg.com/slots/games/gates-olympus), [PRN](https://tools.prnewswire.com/en-us/live/20823/release/20260330EN19255) |
| 대형 클러스터 7x7·6x6 | 5개 이상 인접하면 지불. 같은 칸이 터질 때마다 칸 배율 2배(최대 1,024x) / 격자 밑 배율 판이 연쇄마다 2배(최대 128x) / 연쇄마다 와일드 투하 | Sugar Rush 1000, Candy Rush, Cosmic Clusters | [EG](https://europeangaming.eu/portal/?p=155201), [OLBG](https://www.olbg.com/news/candy-rush-slot-now-live-pragmatic-play), [OLBG](https://www.olbg.com/news/cosmic-clusters-slot-launches-today-pragmatic-play) |
| 가변 높이(Megaways류) | 7열 클러스터, 열 높이 4~9 가변. 열이 줄면 칸 배율이 높은 순으로 정렬 / 본 격자 위아래 가로 릴에 최대 15x 배율 | Sugar Megarush, Forever Split Megaways | [OLBG](https://www.olbg.com/slots/games/sugar-megarush), [OLBG](https://www.olbg.com/news/forever-split-megaways-slot-launches-pragmatic-play) |
| 자라는 격자 | 3-4-4-4-3에서 시작, 특수 심볼마다 릴이 한 줄씩 늘어 최대 10줄 (시작 격자·ways 수는 매체마다 다름) | The Alter Ego | [Gambling.com](https://www.gambling.com/us/online-casinos/slots/the-alter-ego) |
| 5x4 / 5x5 / 6x6 | 5x5 확장 와일드 고정 + 무당첨 리스핀 / 상단 배율 줄 / 하단 바 배율 4칸을 와일드가 가져갈 때마다 2배 | Big Bass Football Bonanza, Eastern Fury, Sweet Loot, Hell Butcher | [AG Brief](https://agbrief.com/news/world/27/08/2026/pragmatic-play-turns-up-the-heat-with-new-5x5-slot-eastern-fury/), [VSO](https://www.vegasslotsonline.com/news/2026/10/30/pragmatic-play-launches-sweet-loot-slot-with-2000x-max-win/), [VSO](https://www.vegasslotsonline.com/news/2026/06/22/pragmatic-plays-hell-butcher-goes-below-the-reels-to-bring-wild-multiplier-twist/) |

### 2025~2026 흐름
- 배율 장치를 격자 **밖**(상단 줄·하단 바·언더레이·가로 릴)에 두는 구성이 늘었다.
- 슈퍼 스캐터로 프리스핀 최저 보상을 보장하는 «슈퍼» 모드가 흔하다.

### 확인하지 못한 것
- 3-4-5-4-3 같은 대칭 피라미드 고정 격자, 4x4 대표작, 3x3 클래식, 분할 심볼의 구체 규칙.

## 우리 허브에 추천하는 새 형태 3종 (기존 10종에 없는 축)

1. **6x5 위치 무관 지불 + 격자 밖 배율 레일**
   8개 이상이면 지불하고 낙하로 연쇄한다. 연쇄 동안 상단 레일에 배율을 모았다가 당첨에 곱한다. «줄·인접» 개념이 아예 없다. 구현 난이도가 가장 낮다.
2. **자라는 격자 4x4에서 8x8**
   터진 칸 수가 문턱에 닿으면 바깥에 한 겹씩 붙고, 새 칸에서 숨은 심볼이 드러난다. 판이 자라는 것 자체가 진행도라 도감·레벨과 잘 맞는다. 칸 수가 바뀌므로 텍스처 풀과 메모리 상한을 처음부터 잡아야 한다.
3. **다이아몬드 3-4-5-4-3 + 가운데에서 양쪽으로 지불**
   가운데 릴을 기점으로 좌우 3릴 이상 이어지면 지불한다. 모양과 규칙이 모두 새롭다. 다만 이 지불 규칙은 프라그마틱 작품에서 확인하지 못한 독자 설계라 환수율 검증 비용이 가장 크다.

테마·이름·심볼·배율 단위는 모두 새로 설계한다.
