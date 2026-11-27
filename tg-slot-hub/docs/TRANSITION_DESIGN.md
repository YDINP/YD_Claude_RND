# 전환 연출 설계 — 프리스핀 진입/복귀

작성일: 2026-09-07
적용 범위: `games/*/theme/transitions/**`, `theme.json`의 `transitions.freeSpinsEnter` / `freeSpinsExit`

각 슬롯의 **컨셉에 묶인** 전환 연출을 팩마다 두 방향(진입 / 복귀)으로 설계한다.
출발점은 `sheriff-sixgun`의 모래폭풍(`fs-enter.webm`) 하나였고, 그것은 **서부라는 배경만 맞고
기계는 없었다.**

> **현재 상태 (2026-09-07): 완료.** 4팩 8편이 애니메이션 WebP로 `games/*/theme/transitions/`에
> 들어가 `theme.json`에 배선됐고, 실기 재생까지 확인됐다. 남은 것은 조건부 두 건뿐이다(6항).
> 규칙 R1~R13은 앞으로 나올 팩에도 그대로 적용된다.

---

## 0. 사전 확인 사항

### 0-1. 스키마는 이미 두 방향을 받는다

`packages/game-sdk/src/theme.ts:166-172`에 `freeSpinsExit`가 **이미 선언되어 있다.**
검증기(`theme.ts:255-256`)도 두 필드를 모두 비디오 자산으로 검사한다. 스키마 확장은 필요 없다.

```ts
export const ThemeTransitionsSchema = z.object({
  freeSpinsEnter: z.string().min(1).optional(),
  freeSpinsExit: z.string().min(1).optional(),
})
```

실제로 파일을 물려 놓은 팩은 `sheriff-sixgun`의 `freeSpinsEnter` 하나뿐이다.

### 0-2. classic-777에는 걸 곳이 없다

| 팩 | 스캐터 | `scatter.freeSpins` | 전환 연출 대상 |
|---|---|---|---|
| classic-777 | **없음** | **없음** | 해당 없음 |
| fruit-fiesta | 있음 | 10회 x2, 리트리거 | 대상 |
| royal-diamond-777 | 있음 | 8회 x2, 리트리거 | 대상 |
| sheriff-sixgun | 있음 | 8회 x2, 리트리거 | 대상 |
| shiba-shrine | 있음 | 8회 x2, 리트리거 | 대상 |
| astral-clocktower | 있음 | 10회 x2, 리트리거 | 대상 (2026-11-26 한 편으로 양방향 생성 완료, 2-5) |

`classic-777`은 `math.json`에 `scatter` 키 자체가 없고 `features`도 `wild / any-bar / single-cherry`뿐이다.
**프리스핀이 없으므로 진입·복귀 전환이 재생될 순간이 존재하지 않는다.**
아래 2-6에 설계는 적어 두되 **생성 보류**로 표시한다 — 지금 뽑으면 $1.86가 그대로 사장된다.

따라서 실제 발주 대상은 **4팩 x 2방향 = 8클립** (astral-clocktower까지 포함하면 10클립)이고,
"6팩 x 2방향 = 12클립"이 아니다.

---

## 1. 프롬프트 작성 규칙 (전 팩 공통, 이 프로젝트에서 실측으로 얻은 것)

이 규칙들은 취향이 아니라 **실패에서 나온 제약**이다.

| # | 규칙 | 이유 |
|---|---|---|
| R1 | **최대 불투명 도달을 명시한다** — "completely opaque edge to edge, corner to corner, holding fully covered for a beat" | 커튼으로 쓰려면 화면 전체를 가리는 순간이 반드시 있어야 한다. 안 적으면 모델은 예쁜 파티클만 뿌리고 배경을 계속 비춘다 |
| R2 | **1회성 사건이 아니라 반복 동작으로 지시한다** | 과금이 영상 길이와 무관($0.93/편)이라 항상 13초 최대로 뽑고 그중 3초를 잘라 쓴다. 단발 사건은 쓸 구간이 1초뿐이다 |
| R3 | **`camera_fixed`를 넘기지 않는다.** 대신 프롬프트 본문에 "Camera locked, no camera movement, no zoom, no pan" + "Only the objects move; the camera never moves"를 쓴다 | `doubao-seedance-2-0` t2v가 `camera_fixed` 파라미터를 거부한다 |
| R4 | **금지 목록을 매번 붙인다** — text, letters, numbers, logos, watermark, people, faces, **hands, arms, fingers**, animals | 손은 특히 "리볼버를 장전한다" 류에서 실제로 튀어나온다. 사람이 조작하는 게 아니라 **기물과 기구가 스스로 움직인다**고 서술해 회피한다 |
| R5 | **세로 9:16 / 1080p 고정** | 세로 격자 팩(astral-clocktower)도 전환은 전체화면 커튼이라 동일 |
| R6 | **진입과 복귀는 같은 클립의 역재생이 아니다** | 진입은 조여서 덮고 끝난다, 복귀는 덮인 채 시작해 풀어 헤치고 걷힌다. 방향성이 곧 연출의 의미다 |
| R7 | 팩의 `art/prompts.json`에 있는 **팔레트와 재질 어휘를 그대로 재사용**한다 | 전환만 톤이 달라지면 별개 게임처럼 보인다 |
| R8 | **컨셉 동작 그 자체가 화면을 덮게 만든다.** 동작과 덮임을 별개 단계로 쓰지 않는다 | 아래 참조. 이 규칙이 가장 비싸게 배운 것이다 |
| R9 | **주어를 첫 문장에 세운다.** R8의 «한 동작» 절은 그 뒤에 붙인다 | 주어를 뒤로 미룬 프롬프트는 주제 자체를 놓친다. 3-2 참조 — 리볼버가 아예 없는 영상이 나왔고 금지 목록까지 같이 무너졌다 |
| R11 | **덮인 상태에서도 표면이 계속 움직이라고 요구한다.** «덮는다»까지만 시키면 단색으로 덮고 멈춘다 | 아래 참조. shiba가 3초 중 1.3초를 평면 주홍 정지 화면으로 채웠다 |
| R12 | **그 팩의 `art/prompts.json`에서 `stylePrefix`의 스타일 어휘·색 이야기(hex)와 `negative`의 «photorealistic photography»를 가져온다.** 전환에 안 맞는 항목은 판단해서 뺀다 | 아래 참조. 이걸 빼먹어서 8편 전부가 팩 아트 지침을 위반한 실사 영상이 됐다 |
| R13 | **금지어는 실제로 겪은 실패에만 대응시킨다.** «혹시 모를» 부정문을 늘리지 않는다 | 길이가 곧 희석이다. 부정문 더미가 생성기의 주의를 나눠 가지면 정작 주어를 놓친다 — 이 프로젝트의 가장 큰 위험은 그레인이 아니라 주제를 놓치는 것이다 |
| R10 | **한 편에서 양방향을 잘라내는 것을 기본으로 한다.** 진입·복귀를 따로 발주하지 않는다 | R2대로 반복 사이클을 지시하면 «맑음→덮임»과 «덮임→맑음»이 한 클립에 모두 들어온다. 실제로 royal·shiba가 그랬다. 팩당 $1.86 → $0.93 |

### R8이 왜 결정적인가 — 1차 진입 클립이 실패한 진짜 이유

1차 6연발 진입 프롬프트는 R1(완전 불투명)과 R2(반복)를 **둘 다 지켰는데도** 쓰기 어려웠다.
장전이 1~5초, 덮임이 7.7초 이후에 일어나서 **3초 창에 둘이 같이 들어오지 않았기** 때문이다.
모델은 시킨 걸 순서대로 다 했다 — 문제는 프롬프트가 그것을 **순차적 사건 목록**으로 썼다는 데 있다.

"약 4회 반복"으로 주기를 줄이는 것만으로는 이 구조가 안 고쳐진다. 고치는 방법은 하나다:

> **무엇이 화면을 덮는가**와 **그것이 이 슬롯의 어떤 동작인가**가 **한 문장**이어야 한다.

6연발이면 "실린더가 세게 닫히고 그 관성이 그대로 총구를 렌즈 쪽으로 돌려 화면을 삼킨다" —
장전과 덮임이 한 동작의 두 국면이다. 프롬프트에 다음 문장을 **명시적으로** 박는다:

```
The cylinder closing and the muzzle turning toward the lens are one single motion,
never separate steps.
```

미발주 팩도 같은 눈으로 검사한다. "과일이 올라온다 → 나중에 과즙이 덮는다"처럼 갈라져 있으면
같은 실패를 반복한다. 아래 2항의 모든 프롬프트는 이 규칙에 맞춰 v2로 재작성된 것이다.

### R11이 왜 필요한가 — «덮으면 멈춘다»

R1은 «완전히 덮어라»만 요구한다. 생성기는 그 요구를 **가장 싸게** 만족시킨다 —
**화면을 단색으로 칠하고 그대로 멈추는 것**이다. shiba가 정확히 그렇게 됐다.

애니메이션 WebP의 `ANMF` 청크 지속시간을 재면 바로 드러난다. 인코더가 동일 프레임을 병합하므로
**긴 프레임 = 정지 구간**이다.

| 팩 | 프레임 수 | 최대 프레임 지속 | 판정 |
|---|---:|---:|---|
| sheriff / fruit | 48 | 63ms | 균일, 정지 없음 |
| royal | 46~47 | 125~187ms | 짧은 정지, 재질이 살아 있어 무해 |
| **shiba (재컷 전)** | **33** | **875ms** | **3초 중 1.3초가 평면 주홍 정지** |

royal의 플래티넘 판이나 fruit의 과즙은 같은 «완전 불투명» 구간에서도 표면 재질과 하이라이트가
계속 흐른다. 그건 **프롬프트가 요구해서가 아니라 소재가 그래서** 그렇게 된 것이다 —
셀셰이딩 평면 채색인 shiba에는 그 운이 따르지 않았다. 그래서 규칙으로 못 박는다.

프롬프트에 이런 문장을 넣는다:

```
While the frame is fully covered the surface keeps moving: petals keep streaming across the
vermilion lacquer and the lacquer itself ripples. The covered frame is never a flat still color.
```

**검사 방법**(WebP를 만든 뒤 반드시 돌린다):

```sh
pnpm --filter @tgslot/theme-gen check:clips
```

`tools/theme-gen/src/transitionClipCheck.ts`가 RIFF 청크만 훑어 해상도·길이·루프와
**정지 총량**을 본다. 200ms 넘는 프레임을 «정지 한 칸»으로 세고, 그 **합계가 클립의 20%를
넘으면 실패**다. 프레임 하나의 길이로 자르지 않는 이유는 전환에 **기능상 정지해야 하는 자리**가
있기 때문이다 — 복귀 클립의 머리는 스왑을 가려야 하고 진입 클립의 꼬리는 교체 후 커튼이 버틴다.

기준값 근거(실측): sheriff·fruit 0%, royal 0%(최대 프레임 187ms로 200ms 미만),
재컷 후 shiba 10.4% / 12.5%, **재컷 전 shiba 35.0% / 36.7%**.
20%는 통과시켜야 할 최댓값과 잡아내야 할 최솟값 사이에 넉넉히 들어간다.

### R12가 왜 필요한가 — 심볼은 장난감인데 전환만 실사였다

v1~v2 프롬프트는 «서부극 페인터리», «캔디글라스», «아르데코»처럼 **분위기 단어만** 썼고
팩의 `art/prompts.json`에 이미 못박혀 있는 `stylePrefix`와 `negative`를 **하나도 가져가지 않았다.**

```
fruit-fiesta stylePrefix: "Glossy 3D toy-like icon render, ... deep navy (#0b1220) and
                           brass gold (#d8a94a) color story with cyan gem (#4fc3d9) accents ..."
fruit-fiesta negative:    "photorealistic photography, real human face or body, ..."
```

**금지 목록의 첫 항목이 «photorealistic photography»다.** 그게 빠지자 SeeDance는 기본값인
시네마틱 실사로 갔고, 결과적으로 **심볼은 스타일라이즈드 3D 장난감인데 전환만 실사 사진**이 됐다.
fruit가 밝고 광택 있는 화면이라 가장 먼저 들켰을 뿐, sheriff의 실사 리볼버와 royal의 실사
브러시드 메탈도 **같은 위반**이다.

전환은 심볼과 같은 세계의 물건이지 별도의 시네마틱이 아니다.

**가져올 것 / 뺄 것.** 기계적으로 복사하지 않는다 — «전환에도 유효한가»로 가른다.

| `stylePrefix` / `negative` 항목 | 전환 | 이유 |
|---|---|---|
| 스타일 어휘 (`glossy 3D toy-like render`, `kawaii chibi cel-shaded`) | **가져온다** | 이게 세계관 그 자체다 |
| 색 이야기 + hex | **가져온다** | 전환만 색이 다르면 다른 게임처럼 보인다 |
| 재질 (`worn leather`, `polished glass`, `matte ceramic-glaze`) | **가져온다** | 덮는 물체의 표면이 곧 이 재질이다 |
| 조명 (`low sunset rim light`, `cool platinum rim light`) | **가져온다** | 팩의 빛이다 |
| `premium mobile casino game asset quality` | **가져온다** | 품질 기준선 |
| `negative: photorealistic photography` | **반드시 가져온다** | 이번 사고의 직접 원인 |
| `negative`의 blur / grain / washed-out / banding / clip-art / neon | **가져온다** | 전환에도 그대로 유효한 결함들 |
| `3/4 top-down camera angle` | **뺀다** | 전환은 카메라 고정 전면이다 (R3와 충돌) |
| `crisp clean silhouette readable at small size` | **뺀다** | 전면 커튼에는 실루엣 개념이 없다 |
| `no baked-in drop shadow` / `harsh outer shadow` | **뺀다** | 크로마키 위 격리 심볼용 지침이다. 전환은 장면이라 그림자가 있어야 한다 |
| `cropped edges` | **뺀다** | 전환은 **일부러** 가장자리까지 채운다 (R1과 정면 충돌) |
| `multiple duplicate objects` | **뺀다** | 과일 기둥·꽃잎·타일 격자가 전부 의도된 다수다 |
| `busy cluttered background` | **뺀다** | 덮는 재료가 화면을 가득 채우는 게 목적이다 |
| `distorted asymmetric proportions` | **뺀다** | 아이콘 하나의 비례에 대한 지침이다 |

> ⚠ SeeDance t2v에는 **별도의 negative 필드가 없다.** `vidgen-portrait.mjs`가 보내는 것은
> 프롬프트 문자열 하나뿐이다. 그래서 금지 항목은 전부 프롬프트 본문에 `no ...`로 적어야 한다.

### R13이 왜 필요한가 — 안 겪은 문제를 막다가 겪은 문제를 놓친다

v4 초안은 네 편 모두 이렇게 끝났다:

```
No blur, no out-of-focus haze, no noisy grain texture, no dull washed-out colors,
no gradient banding, no neon cyberpunk styling, no cheap clip-art look.
```

**이 일곱 개는 이 프로젝트에서 한 번도 나온 적이 없다.** 지금까지의 실패는 넷뿐이다 —
실사로 나옴(R12) / 주제를 놓침(R9) / 사람이 나옴(R4) / 단색으로 덮고 멈춤(R11).

그런데 성공한 v1은 약 700자였고, 주제를 놓친 v2는 구조가 틀린 데다 길었다.
**길이는 공짜가 아니다.** 부정문이 늘어난 만큼 생성기가 주어와 동작에 쏟을 주의가 희석된다.
안 겪은 일곱 가지를 막으려다 **또 주제를 놓치는 것**이 훨씬 비싼 실패다.

지워서 편당 약 150자가 줄었다. 남긴 금지어는 전부 실제 실패에 대응한다:

| 남긴 금지어 | 대응하는 실제 실패 |
|---|---|
| `no photorealistic photography` 계열 | 8편 전부가 실사로 나옴 |
| 사람·얼굴·손·팔·손가락·동물 | sheriff v2에서 사람이 나옴 |
| 텍스트·문자·숫자·로고·워터마크·서명 | 겪지는 않았지만 **커튼에 글자가 뜨면 치명적**이라 유지 |
| 카메라 고정 문구 | `camera_fixed` 파라미터를 못 쓰니 본문이 유일한 수단(R3) |
| 팩별 방어(`no real fruit` / `no 3D realism` / `no dogs`) | fruit 실사 주스, shiba 셀셰이딩 이탈, 마스코트 불일치 |

### 발주 방법

```sh
# D:\park\YD_Claude_RND 에서
node --env-file=ben_suno/.env <scratchpad>/vidgen-portrait.mjs \
  --out <scratchpad>/trans/<pack>-<dir>.mp4 \
  --seconds 13 --ratio 9:16 --resolution 1080p \
  --prompt "..."
```

- 편당 약 **$0.93** (길이 무관), 폴링 **5~10분** → 반드시 백그라운드로 돌린다.
- 결과 URL은 **24시간 뒤 만료**. 스크립트가 즉시 저장하고 `<out>.json`에 task/prompt를 남긴다.

> ⚠ **`task_id`를 받았다고 발주가 된 게 아니다.** 계정 추론 한도(`SetLimitExceeded`)는
> **접수 시점이 아니라 생성 시점에** 걸린다. `POST /v1/videos`는 정상적으로 `task_id`를
> 돌려주고, 몇 초 뒤 폴링에서 `status: failed`와 함께 한도 오류가 나온다.
>
> 그래서 «잘못된 파라미터를 보내 어떤 오류가 먼저 나오는지» 보는 방식으로는 한도 해제를
> **확인할 수 없다.** `InvalidParameter`는 접수 단계에서 튕기므로 한도 검사에 도달조차 하지
> 않는다. 한도가 풀렸는지 보려면 **정상 요청 하나를 끝까지 폴링**하는 수밖에 없다
> (실패하면 과금되지 않으므로 비용은 0이다).

---

## 2. 팩별 설계

### 2-1. sheriff-sixgun — 보안관의 6연발 (생성 완료)

팩 컨셉: 사막 황토(`#c9884a`) + 밤하늘 네이비(`#1b2437`), 세이지(`#7e9a72`)와 석양 주황(`#e2683a`).
낡은 가죽·황동 리벳·풍화된 나무. 대표 기믹은 릴 하나를 통째로 덮는 확장 배지 와일드.

#### 진입 — 장전(裝塡)

> 실린더가 **세게 닫히고 그 관성이 그대로 총구를 렌즈 쪽으로 돌려** 총열 구멍이 화면을 삼킨다.
> 장전과 덮임이 한 동작이다.

**왜 이 팩인가.** 이 게임의 이름이 6연발이다. 프리스핀은 "장전이 끝났고 이제 쏜다"는 예고다.
모래폭풍은 서부의 *날씨*지 서부의 *기계*가 아니다. 6연발의 기계는 실린더다.
그리고 총구 구멍(bore)은 그 자체로 **완벽한 검은 커튼**이라 별도의 페이드가 필요 없다.

> ⚠ **아래 v2 프롬프트는 실제로 발주했다가 실패한 것이다.** R8은 고쳤지만 R9(주어 우선)를 어겨
> 리볼버가 아예 없는 영상이 나왔다. 실패 분석과 **수정된 v3 프롬프트는 3-2**에 있다.
> 현재 채택된 클립은 **v1**이고, 그 컷은 3-3에 있다. 이 블록은 «무엇이 왜 안 되는지»의 기록으로 남긴다.

**v1 → v2에서 바뀐 것.** v1은 장전과 덮임을 순차로 썼고, 그 결과 장전(1~5초)과 덮임(7.7초~)이
3초 창에 같이 안 들어왔다(R8). v2는 실린더 닫힘이 곧 총구 회전이 되도록 한 동작으로 묶었다 —
그러나 그 과정에서 주어를 문장 뒤로 밀어 버린 것이 치명적이었다.

```
[실패작 — 발주 금지. 수정본은 3-2 참조]
Vertical full-screen game transition effect, stylized painterly western game art with a glossy
toy-like 3D render finish, dim dusk desert sky behind. One continuous motion repeats: the cylinder of
an ornate revolver swings out sideways, six glossy brass cartridges drop into the chambers, and the
cylinder slams shut so hard that the same swing carries the whole gun around to face the lens, the
muzzle rushing straight at the viewer in one unbroken move until the black bore mouth swallows the
entire frame and it is completely opaque edge to edge, corner to corner, filled with gunmetal darkness
ringed by a thin band of brass and steel light, holding fully covered for a beat, then the gun falls
back and the cylinder swings open again to begin the next load. The cylinder closing and the muzzle
turning toward the lens are one single motion, never separate steps. Each full cycle lasts about three
seconds from start to finish and repeats about four times across the clip. Dusty ochre, burnt sienna,
gunmetal blue-grey and warm brass tones, low sunset rim light, drifting dust motes, no glitter.
Mechanism only, the weapon and cartridges move on their own. No text, no letters, no numbers, no
logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects
move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 탄피 배출과 초연

> 화면을 가득 채운 총연이 걷히면서 실린더가 열려 빈 탄피를 뱉어 내고,
> 연기가 흩어져 석양의 사막이 드러난다.

**왜 이 팩인가.** 진입의 정확한 뒷면이다. 장전 → (프리스핀 = 격발) → 배출.
연기는 다 쏘고 난 뒤의 재료라 방향이 자연히 "풀어짐"이고,
동시에 화면을 완전히 덮을 수 있는 몇 안 되는 서부 재료다.

```
Vertical full-screen game transition effect, stylized painterly western game art with a glossy
toy-like 3D render finish. The frame is completely filled edge to edge with thick opaque grey-white
gunsmoke, and this cycle repeats over and over: the smoke thins and lifts away to reveal an ornate
revolver floating centered against an open burnt-orange desert sunset, its cylinder swings out
sideways and the ejector rod pushes six spent brass shell casings free, the empty casings tumble and
spin outward past the lens trailing thin wisps and fall away out of frame, the barrel breathes a last
curl of smoke, then a fresh billow of thick gunsmoke rolls up from below and again fills the entire
frame corner to corner in complete opacity, holding fully covered for a beat before thinning once
more and repeating. Only the objects move; the camera never moves. Warm brass, gunmetal blue-grey,
ochre dust and faded sunset orange tones, soft glowing smoke, a few drifting embers. Mechanism only,
no hands, no arms, no fingers, no people, no faces, no animals, the weapon and casings move on their
own. No text, no letters, no numbers, no logos, no watermark. Camera locked, no camera movement,
no zoom, no pan.
```

생성 결과와 컷 구간은 3항 참고.

---

### 2-2. fruit-fiesta — 프루트 피에스타 (생성 완료)

팩 컨셉: 네이비+브라스 라운지 가족이되 "황혼의 테라스 파티". 캔디글라스 과일 + 황동 꼭지,
종이 등불 보케. 프리스핀 배경은 **같은 테라스의 한밤 + 황금 불꽃놀이 + 더 진한 등불**.

#### 진입 — 과즙 분출

> 캔디글라스 과일 기둥이 솟아오르며 점점 빽빽해지고, **선두의 과일이 렌즈에 눌러붙는 그 동작으로
> 터져** 황금빛 과즙이 화면을 유약처럼 덮는다.

**왜 이 팩인가.** 이 팩의 유일한 고유 물성은 유리처럼 반투명한 과일이다.
과일이 터져 만드는 **불투명한 주황–황금 액체 벽**은 프리스핀 배경의 불꽃놀이 색과 그대로 이어지고,
피에스타(잔치)라는 이름의 과잉을 연출로 번역한다. 등불만 띄우면 fruit이 사라진다.

**R8 적용.** "과일이 올라온다 → 나중에 과즙이 덮는다"로 쓰면 6연발과 같은 실패가 난다.
과일이 렌즈에 닿는 것과 터져서 덮는 것이 **같은 순간**이어야 한다.

```
Vertical full-screen game transition effect, glossy candy-glass 3D toy render, premium mobile casino
art, warm dusk terrace with soft paper-lantern bokeh behind. One continuous motion repeats: a dense
column of translucent candy-glass fruits with small brass stems, cherries, lemons, oranges, plums,
grapes and watermelon wedges, surges up from the bottom of the frame and packs tighter and tighter as
it rises, the leading fruits pressing flat against the lens and bursting in the very same motion so
their glossy amber and orange juice glazes across the glass until the whole frame is completely opaque
edge to edge, corner to corner, a fully opaque warm golden-orange sheet, holding fully covered for a
beat, then the glaze runs down and off and the terrace bokeh shows through before the next surge. The
fruits rising and the frame being covered are one single motion, never separate steps. Each full cycle
lasts about three seconds from start to finish and repeats about four times across the clip. Deep navy,
brass gold, warm orange and candy-glass translucency, soft warm rim light, glossy wet highlights, small
drifting golden sparks. No text, no letters, no numbers, no logos, no watermark, no people, no faces,
no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera
locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 등불이 올라간다

> 남은 과즙이 아래로 빠지고, 종이 등불 무리가 위로 흩어져 떠오르며 화면이 걷힌다.

**왜 이 팩인가.** 프리스핀 배경에서 등불은 떠오르는 것이다. 그 등불이 프레임 밖으로 빠져나가는 것이
축제가 끝나고 밤이 잦아드는 그림이 된다. 진입이 차오름이므로 복귀는 빠짐이어야 한다.

```
Vertical full-screen game transition effect, glossy candy-glass 3D toy render, premium mobile casino
art. The frame begins completely filled edge to edge with an opaque warm golden-orange glaze of glossy
fruit juice, and one continuous motion repeats: the glaze breaks at the top and runs down and off the
bottom of the frame in thick glossy sheets, and the very same downward flow carries the spent
candy-glass fruit husks with it out of view while small warm paper lanterns rise up through the
clearing gap and drift out of the top, until a calm dusk terrace with soft lantern bokeh and a deep
navy sky is fully revealed, clear and still, then a fresh flood of golden juice pours back in and
covers the whole frame corner to corner in complete opacity for a beat before running off again. The
juice draining and the frame clearing are one single motion, never separate steps. Each full cycle
lasts about three seconds from start to finish and repeats about four times across the clip. Deep navy,
brass gold, warm orange, soft glowing paper lanterns, glossy wet highlights. No text, no letters, no
numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only
the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

---

### 2-3. royal-diamond-777 — 로열 다이아몬드 777 (생성 완료)

> **채택 결과.** 아래 «진입» 프롬프트로 뽑은 클립(`royal-enter.mp4`)은 플래티넘 판이
> 화면 중앙 사각형에서 멈춰 폐기했다. **진입·복귀 둘 다 «복귀» 프롬프트로 뽑은
> `royal-exit.mp4` 한 편에서 잘라냈다** (R10). 구간은 3-3 참조.

팩 컨셉: 아르데코, 검은 벨벳(`#0d0c14`) + 폴리시드 플래티넘(`#d7dbe0`),
다이아몬드 시안(`#8fe3f2`) 패싯과 벨벳 레드(`#8f1f2e`). 대표 기믹은 **물음표 타일이 한꺼번에 뒤집혀
같은 심볼로 공개되는 것**.

#### 진입 — 일제히 뒤집힌다

> 검은 벨벳 타일 격자가 파도처럼 차례로 뒤집히고, 뒤집힌 면은 전부 플래티넘 선버스트다.
> 마지막 타일이 넘어가는 순간 화면 전체가 하나의 거대한 아르데코 부채꼴로 덮인다.

**왜 이 팩인가.** 이 게임의 헤드라인은 미스터리 타일의 일제 공개다. 전환을 그 기믹의 **확대판**으로
만들면 연출이 곧 규칙 설명이 된다. 타일 뒤집기는 R1(완전 불투명)을 구조적으로 보장한다 —
타일 뒷면이 곧 불투명한 판이다. R2(반복)도 자연스럽다.

**R8 적용.** 이 팩은 원래부터 «동작 = 덮임»이 성립한다 — 타일이 넘어가는 것이 곧 화면이 막히는 것이다.
v2에서는 파도가 **지나가면서 화면을 닫도록**(the wave closes the frame as it travels) 못 박고
사이클을 3초로 제한했다.

```
Vertical full-screen game transition effect, art-deco luxury 3D render, polished materials, premium
mobile casino art, deep black velvet salon behind. One continuous motion repeats: a full-screen grid of
black velvet tiles flips over in a single fast diagonal wave with crisp mechanical snaps, each tile
turning to a polished platinum art-deco face of stepped chevron and sunburst fluting, and the wave
closes the frame as it travels so that the instant the last tile lands the whole frame is completely
opaque edge to edge, corner to corner, one seamless platinum sunburst plate, holding fully covered for
a beat while a cool diamond-cyan facet glint sweeps across it, then the tiles flip back to black velvet
and the wave begins again. The tiles turning and the frame being covered are one single motion, never
separate steps. Each full cycle lasts about three seconds from start to finish and repeats about four
times across the clip. Deep black velvet, polished platinum, diamond-cyan facet sparkles and deep
velvet-red accents, cool crisp specular highlights. No text, no letters, no numbers, no logos, no
watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the
camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 부채가 접힌다

> 플래티넘 선버스트가 중심에서부터 갈라져 부채처럼 접히고, 다이아몬드 광채가 흩어지며
> 검은 벨벳 살롱이 드러난다.

**왜 이 팩인가.** 진입이 닫히는 판이니 복귀는 열리는 판이다. 다만 역재생이 아니라
**여는 방식이 다르다** — 뒤집기(flip)가 아니라 부채꼴 분할(iris)로 열려서, 같은 어휘 안에서
다른 동작을 쓴다. 흩어지는 패싯 광채가 해제의 신호를 준다.

```
Vertical full-screen game transition effect, art-deco luxury 3D render, polished materials, premium
mobile casino art. The frame begins completely filled edge to edge with an opaque polished platinum
art-deco sunburst plate, and one continuous motion repeats: the plate splits along its radial fluting
and its wedges fold back outward toward the edges like an opening fan, and that same outward fold
scatters cool diamond-cyan facet sparkles that drift and fade, revealing a calm deep black velvet salon
interior with faint platinum wall fluting, the frame becoming fully clear and quiet, then the wedges
sweep back in from the edges and close into a solid plate covering the frame corner to corner in
complete opacity for a beat before opening again. The wedges folding away and the frame clearing are
one single motion, never separate steps. Each full cycle lasts about three seconds from start to finish
and repeats about four times across the clip. Deep black velvet, polished platinum, diamond-cyan
sparkle, deep velvet-red accents. No text, no letters, no numbers, no logos, no watermark, no people,
no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves.
Camera locked, no camera movement, no zoom, no pan.
```

---

### 2-4. shiba-shrine — 시바 신사 (생성 완료)

> **채택 결과.** 아래 «진입» 프롬프트로 뽑은 클립(`shiba-enter.mp4`)은 커버 구간이 0.2초뿐이고
> 작화가 거칠어 폐기했다. **진입·복귀 둘 다 «복귀» 프롬프트로 뽑은 `shiba-exit.mp4` 한 편에서
> 잘라냈다** (R10). 구간은 3-3 참조.

팩 컨셉: 셀셰이딩 치비, 사쿠라 핑크(`#f6c0cf`) + 밤 인디고(`#243252`), 토리이 주홍(`#e05a3c`)과
민트(`#8fd6c0`). 굵은 검은 외곽선, 그라데이션 없는 플랫 채색. 프리스핀 배경은 **황혼의 경내 + 등불**.

> 주의: 마스코트 시바는 **영상에 넣지 않는다.** R4의 동물 금지는 이 팩에서도 유효하다 —
> 캐릭터 일관성을 t2v에 맡기면 심볼 아트와 다른 개가 나온다. 경내의 **사물**로만 연출한다.

#### 진입 — 문을 통과한다

> 거대한 주홍 토리이가 꽃보라를 몰고 **앞으로 밀려와** 그 상인방이 렌즈를 지나며 화면을 삼킨다.

**왜 이 팩인가.** 토리이는 경계를 넘는 문이다. 프리스핀이라는 다른 상태로 넘어가는 것을
문을 지나는 것으로 읽히게 한다. 그리고 문이 다가오는 것과 화면이 막히는 것은 **같은 동작**이다 —
6연발의 총구와 정확히 같은 구조이고, 이 팩에서 R8을 만족하는 가장 깔끔한 해법이다.

**v1에서 바뀐 것.** v1은 «꽃잎이 쌓여 두꺼워진 뒤 상하에서 들보가 닫힌다»는 2단 구조였다(R8 위반).
v2는 문이 전진하는 단일 동작으로 바꾸고, 꽃보라는 그 동작에 실려 오는 장식으로 내렸다.

```
Vertical full-screen game transition effect, kawaii cel-shaded Japanese game art, thick clean black
outlines, flat cel-shaded color fills with no gradient shading, calm shrine courtyard behind. One
continuous motion repeats: a huge vermilion lacquered torii gate rushes forward toward the viewer while
a swirling storm of flat sakura-pink cherry blossom petals sweeps up around it, and the gate keeps
coming until its broad lacquered crossbeam passes the lens and fills the entire frame, completely
opaque edge to edge, corner to corner, flat vermilion lacquer with thick black lead outlines, holding
fully covered for a beat, then the gate falls back into the courtyard and the petals thin out before
the next approach. The gate rushing forward and the frame being covered are one single motion, never
separate steps. Each full cycle lasts about three seconds from start to finish and repeats about four
times across the clip. Sakura pink, torii vermilion, night indigo and mint accents, matte ceramic-glaze
texture, flat poster-like shading. No text, no letters, no numbers, no logos, no watermark, no people,
no faces, no hands, no arms, no fingers, no animals. No dogs. Only the objects move; the camera never
moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 문을 되돌아 나온다

> 화면을 덮고 있던 주홍 면이 **뒤로 물러나며** 토리이의 형태로 멀어지고, 그 물러남이 꽃잎을
> 아래로 흘려보내며 등불이 켜진 경내가 드러난다.

**왜 이 팩인가.** 진입이 «다가와 덮음»이니 복귀는 «물러나 걷힘»이다. 역재생이 아니라
**멀어지는 문이 곧 드러나는 경내**라는 같은 구조의 반대 방향이고, 경계 밖으로 되돌아 나온다는
의미가 그대로 읽힌다.

```
Vertical full-screen game transition effect, kawaii cel-shaded Japanese game art, thick clean black
outlines, flat cel-shaded color fills with no gradient shading. The frame begins completely filled edge
to edge with flat opaque vermilion lacquer, and one continuous motion repeats: the vermilion surface
pulls back away from the viewer and resolves into a torii gate receding into the distance, and that
same receding motion releases a thick drift of flat sakura-pink petals that sink downward and settle
out of frame, revealing a calm shrine courtyard at dusk with small warm paper lanterns glowing under a
soft indigo sky, fully clear and still, then the gate rushes forward again and its crossbeam seals the
frame corner to corner in complete opacity for a beat before receding once more. The gate receding and
the frame clearing are one single motion, never separate steps. Each full cycle lasts about three
seconds from start to finish and repeats about four times across the clip. Sakura pink, torii vermilion,
night indigo, mint accents, matte ceramic-glaze texture, flat poster-like shading. No text, no letters,
no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. No
dogs. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 재발주 결과 (shiba-shrine, 2026-11-26 검수) — 낮 경내 + 소용돌이 칠 한 편에서 양방향

**왜 다시 뽑았나.** 위 채택본(`shiba-exit` 컷)은 보라 벚꽃·남색 밤하늘의 3D 게임 배경풍 장면이라 평면 셀셰이딩 심볼·낮 파스텔 기본 배경·석양+등롱 프리스핀 배경과 어긋났다
(검수 F3). R7·R12·R11을 다시 지키는 재발주다. 시바 마스코트·동물은 영상에 넣지 않았다(R4).

**발주.** 검수 지시 프롬프트 두 편을 문장 그대로 한 번씩(`vidgen-t2v.mjs`, 9:16·1080p·13초·t2v, 편당 $0.93, 합 **$1.86**, 재시도 1편 한도는 쓰지 않았다).
원본은 `D:/park/tgslot-wt/_qa/review-shiba-shrine-art/clips/enter-v1.mp4`·`exit-v1.mp4`(1080x1920 24fps 13.04초), 프롬프트는 같은 폴더 `prompt-enter-v1.txt`·`prompt-exit-v1.txt`.
공통 뼈대: `flat 2D hand-drawn cel-shaded poster illustration, thick clean black outlines, no 3D render look, not a game-engine environment screenshot, no depth of field, no volumetric light` +
팩 팔레트 hex(`#f6c0cf`·`#e05a3c`·`#243252`·`#8fd6c0`) + R11 문장(덮인 채 꽃잎이 돌고 칠 면이 계속 일렁임) + R4 금지 목록 + 카메라 고정 문구.
진입형은 «석양 경내 + 등롱 위로 토리이가 밀려와 상인방이 프레임을 덮는다», 복귀형은 «주홍 칠이 덮인 채 시작해 물러나며 낮 경내가 드러난다»를 한 동작으로 썼다(R8).

**생성기가 한 일.** 두 편 모두 **평면 2D 셀 그림**으로 나왔다(굵은 검은 외곽선·그라데이션 없음, 3D 렌더·피사계 심도 없음, 글자·사람·동물·손 0). 3D 게임 배경풍이 사라졌다.
다만 «2.5초 x 5회»는 안 지켰다(astral과 같은 경향). 측정(24fps로 훑은 주홍 픽셀 비율·공간 표준편차·프레임 간 평균 차이):

| 소스 | 덮임 구간(주홍 ≥ 70~75%) | 덮인 면의 모양 |
|---|---|---|
| `enter-v1` | 2.54–2.71s(0.21초), 7.08–7.33s(0.29초) | 광택 하이라이트가 있는 **둥근 주홍 간판**이 렌즈를 지나감. 평면 칠이 아니고, 덮임이 0.2초에 그침. 장면은 석양+등롱(프리스핀 배경과 같은 안뜰) |
| `exit-v1` | 0.00–1.42s(1.46초), 9.13–10.63s(1.54초), 12.38–13.0s | **소용돌이 치는 주홍 칠**(공간 표준편차 11, 평면 단색 아님). 앞 1.4초 덮임 → 문 터널이 물러나며 낮 경내(분홍 벚꽃·청록 석등) 노출(1.3–5.0s) → 두 번째 접근 → 9.1s 와이프로 다시 덮임 |

**채택: `exit-v1` 한 편에서 진입·복귀를 모두 잘랐다(R10). `enter-v1`은 쓰지 않았다**(원본만 보관, 지출은 $1.86 그대로).
- `enter-v1` 폐기 이유: (1) 덮임이 0.2~0.3초라 «덮고 끝난다»가 안 읽힌다. 간판이 둥글게 줄어들며 하이라이트가 떠 R11의 «면이 계속 움직임»이 아니라 광택 판이 서 있는 느낌.
  (2) 첫 장면이 석양 경내라 낮 배경 위에서 한 프레임에 하드컷으로 뜬다(아래 «재생 사실»).
- `exit-v1`이 낫다: 칠 면이 소용돌이로 일렁여 R11이 실제로 먹었고(복귀형 «덮인 채 시작 + keeps slowly shifting» 문장이 효과), 낮 경내는 기본 배경(`bg.webp`: 분홍 벚꽃·석등·토리이)과 같은 장면이다.

**재생 사실(코드 확인, 컷 설계에 반영).** `packages/renderer/src/transition.ts`의 `clipAlphaAt`: 클립 알파는 **t=0부터 1**(페이드인 없음)이고 **맨 끝 420ms만 페이드아웃**한다.
클립은 알파가 없어 어느 프레임이든 스테이지를 가리므로 화면 교체(`opaqueMs`)는 어떤 프레임에서도 가려진다. 그래서 컷은 이렇게 잡는다.
(1) **첫 프레임 = 직전 화면과 닮아야 한다**(하드컷이 덜 튄다): 진입은 기본 화면 → 낮 경내, 복귀는 프리스핀 → 주홍 칠.
(2) **마지막 프레임 = 다음 화면으로 페이드할 그림**: 진입은 주홍 칠(프리스핀 판으로 페이드), 복귀는 낮 경내(기본 판으로 페이드).
(3) 전환 길이 = `opaqueMs + 700(배너) + max(420, 클립길이 − opaqueMs − 700)`이라 **`opaqueMs ≤ 1880`이면 전환이 클립 3.0초를 넘지 않는다**(1812 → 정확히 3.0초).

**컷.** 구간별 재타이밍(가변속)은 3-3·3-5와 같은 방식이다.

| 전환 | 소스 구간 | 속도 | 출력 | 스왑 오프셋 |
|---|---|---:|---:|---:|
| 진입 | 06.55–06.85 | 1.0x | 0.30s | |
| | 06.85–09.15 (문이 밀려와 터널을 지나 와이프) | 1.533x | 1.50s | **1812ms** (출력 29번째 프레임에서 주홍 93%·표준편차 11) |
| | 09.15–10.35 (소용돌이 칠, 끝까지 덮인 채) | 1.0x | 1.20s | |
| 복귀 | 00.90–01.40 (덮인 채 소용돌이) | 1.0x | 0.50s | **0** |
| | 01.40–04.70 (문 터널이 물러나고 꽃잎이 가라앉음) | 1.5x | 2.20s | |
| | 04.70–05.00 (낮 경내 정착) | 1.0x | 0.30s | |

인코딩은 4-3 규격(360x640 lanczos·16fps·q60·compression 6·loop 1, 블러 없음): 진입 **401 KiB**, 복귀 **479 KiB**, 팩 합계 **880 KiB**(이전 877 KiB와 같은 수준, 1.2 MiB 선 안).
`check:clips` 12개 전부 통과: 두 편 모두 48프레임·최대 프레임 63ms·**정지 0.0%**(이전 10.4% / 12.5%)·2999ms. `theme.json`: `freeSpinsEnter {opaqueMs 1812, durationMs 2999}` /
`freeSpinsExit {opaqueMs 0, durationMs 2999}`. 두 파일은 이미 추적 중이라 `git add`만 하면 된다.

**눈 확인(헤드리스 크롬, 390x844·430x932, DPR 2).** 진입: 프리스핀 팝업이 닫히면 스테이지 영역이 낮 경내로 바뀌고(하드컷이지만 기본 배경과 같은 장면) 토리이가 밀려와 소용돌이 주홍 칠로 덮인 뒤,
그대로 페이드아웃해 석양+등롱 프리스핀 판으로 이어진다. 복귀: 종료 팝업 → 소용돌이 주홍 → 문 터널이 물러나며 꽃잎이 가라앉고 낮 경내 → 기본 판으로 페이드.
390·430 모두 잘림 없음, 콘솔에 `[transition-clip] 클립 재생 시작 {decoded: true, naturalWidth: 360}`.
⚠ Chromium 기준이다. 텔레그램 iOS WebView에서의 애니메이션 WebP 자동 재생·`src` 재설정 되감기는 5-2의 경고대로 별도 확인이 필요하다.

**한계.**
- 덮인 구간의 소용돌이는 **느리게** 흐른다(프레임 간 평균 차이 0.1~0.2, 0.6초 사이 평균 약 1.5). 평면 단색은 아니고 형태가 계속 변하지만 «활발하게 움직인다»는 아니다. 진입은 1.2초, 그중 배너 0.7초 동안 이 칠 위에 글자가 얹힌다.
- 복귀의 완전 덮임은 첫 0.4초뿐이다(이전 0.5초). 진입 앞 0.3초의 정지 장면은 기본 배경과 같은 낮 경내라 직전 화면과 이어진다.
- 진입이 석양이 아니라 **낮 경내에서 시작**한다. 프리스핀 배경(석양+등롱)과의 연결은 마지막 주홍 칠이 맡는다. 석양 경내로 시작하는 `enter-v1`은 시작 하드컷이 더 커서 택하지 않았다.
- 소스(`exit-v1`)는 일부 구간에서 4프레임마다 한 번 프레임이 중복돼 있다(생성기 쪽 24fps→낮은 fps 변환 흔적). 16fps로 다시 뽑으면서 가려졌다.

---

### 2-5. astral-clocktower — 별의 시계탑 (생성 완료, 2026-11-26)

팩 컨셉: 스테인드글라스 + 황동 시계장치. 굵은 검은 납선(lead came), 그라데이션 없는 발광 유리면,
밤의 성당 창처럼 **뒤에서 빛을 받는다.** 자정 인디고(`#141c3a`) + 스테인드 코발트(`#2a5fbf`),
황동(`#c9963f`)·호박(`#f2a03d`)·루비(`#c8354e`)·달빛(`#e8eef7`).
대표 기믹은 **빛 기둥이 5칸 릴 하나를 통째로 삼키는 것**, 그리고 층 승급 사다리.

> 심볼·프레임 아트가 `live`로 나온 뒤인 2026-11-26 검수(AC-02)에서 **진입 프롬프트 v2에 R11 문장을 더해 한 편**($0.93)만 발주하고
> R10대로 양방향을 잘라 썼다(아래 «채택 결과»). 복귀 프롬프트는 쓰지 않았다.
> 격자는 4x5 세로지만 **전환은 전체화면 커튼이라 다른 팩과 같은 9:16**이다.

#### 진입 — 정시를 친다

> 황동 톱니가 앞으로 맞물려 들어오고 장미창이 정면에 닫히면, 창 뒤에서 빛 기둥이 솟아올라
> 유리 전체를 호박색으로 태워 화면을 덮는다.

**왜 이 팩인가.** "빛 기둥이 다섯 칸을 통째로 삼킨다"가 이 게임의 한 줄 요약이다.
전환을 빛 기둥이 화면 전체를 삼키는 것으로 만들면 확장 와일드의 **최대치**가 된다.
정시를 치는 시계는 지금부터 다른 시간이 시작된다는 신호라 프리스핀 진입과 정확히 겹친다.

**R8 적용.** 톱니 → 창 닫힘 → 빛 기둥의 3단 순차는 6연발 v1과 같은 실패 구조다.
빛 기둥이 **솟아오르는 그 동작이 창을 닫으면서 화면을 태우도록** 하나로 묶었다.

```
Vertical full-screen game transition effect, stained glass and brass clockwork art, thick black lead
came outlines around every shape, flat luminous glass fills with no gradient shading, backlit like a
cathedral window at night, dim indigo clocktower interior behind. One continuous motion repeats: a
column of blazing amber light surges up from the bottom of the frame and as it rises it drags a large
circular stained-glass rose window closed across the frame and floods every pane it passes, the rising
light and the closing glass being the same surge, until the frame is completely opaque edge to edge,
corner to corner, in blazing flat amber light crossed by black lead lines, holding fully covered for a
beat, then the light sinks back down and takes the window open with it, tiers of brass gears turning
slowly behind. The light rising and the frame being covered are one single motion, never separate
steps. Each full cycle lasts about three seconds from start to finish and repeats about four times
across the clip. Midnight indigo, stained cobalt, brass, stained amber and ruby glass with moonlight
highlights, drifting motes of gold dust. No text, no letters, no numbers, no numerals, no clock digits,
no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no clock hands, no animals.
Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

> 주의: 이 팩만 금지어에 **숫자·시계 바늘**을 추가로 넣는다. 시계탑 프롬프트는 문자반 숫자와
> 로마 숫자를 거의 확실히 그린다 (R4 위반). "no numerals, no clock digits, no clock hands"를 유지할 것.

#### 복귀 — 빛이 잦아든다

> 호박빛이 유리에서 빠지며 납선만 남고, 장미창이 갈라져 열리고 톱니가 뒤로 물러나며
> 금빛 먼지가 가라앉는다.

**왜 이 팩인가.** 진입이 빛이 차오름이므로 복귀는 빛이 빠짐이다.
스테인드글라스는 뒤의 빛이 꺼지면 **검은 납선 그림만 남는** 재료라서, 광원을 죽이는 것만으로
자연스럽게 해제의 그림이 나온다. 다른 팩처럼 무언가를 치울 필요가 없다.

```
Vertical full-screen game transition effect, stained glass and brass clockwork art, thick black lead
came outlines around every shape, flat luminous glass fills with no gradient shading, backlit like a
cathedral window at night. The frame is completely filled edge to edge with blazing opaque amber
stained glass, and this cycle repeats over and over: the light behind the glass fades downward and the
panes cool from amber through cobalt to dim indigo until only the black lead lines remain, the
circular rose window splits along its lead lines and the segments swing open outward, tiers of brass
gears withdraw backward into the dark, and drifting motes of gold dust sink and fade, leaving a calm
dim clocktower interior fully revealed and still, then the gears slide forward again and the glass
floods with amber light, covering the whole frame corner to corner in complete opacity for a beat
before fading again. The whole cycle completes about four times in the clip. Only the objects move;
the camera never moves. Midnight indigo, stained cobalt, brass, stained amber and ruby glass with
moonlight highlights. No text, no letters, no numbers, no numerals, no clock digits, no logos, no
watermark, no people, no faces, no hands, no clock hands, no animals. Camera locked, no camera
movement, no zoom, no pan.
```

#### 채택 결과 (astral-clocktower, 2026-11-26)

**발주.** 진입 v2 프롬프트에 R11 문장 한 줄을 끼운 것(«덮인 동안 호박색 유리판이 계속 반짝이고 금빛 먼지가 납선 위로 흐른다, 단색으로 얼어붙지 않는다»)을
**그대로 한 편**만 냈다(`vidgen-t2v.mjs`, 9:16·1080p·13초·t2v, $0.93). 재발주 1편 한도는 쓰지 않았다. 원본은
`D:/park/tgslot-wt/_qa/review-astral-clocktower-art/clips/ac-v1.mp4`(1080x1920 24fps 13.04초, 프롬프트 `prompt-v1.txt`).

**생성기가 한 일.** 시킨 «3초 사이클 x4»를 안 지키고 **약 9.5초짜리 사이클 하나 반**을 만들었다(R2 의도와 어긋남). 장면은 장미창 아래로 아치 창 한 폭이
이어지고, 빛 기둥이 아래에서 올라오며 창 전체가 청남색 → 호박색으로 차오른다(R8 «솟는 빛 = 덮임»은 지켜졌다). 숫자·글자·손·시계 바늘은 한 번도 안 나왔다.
측정(24fps로 훑은 밝기·청색 비율·프레임 간 차이):

| 구간(소스) | 내용 | 청색 픽셀 | 프레임 간 차이 |
|---|---|---:|---:|
| 0.0–2.6s | 어두운 시계탑 + 기둥이 자라는 중 | 33% → 24% | 1~2 |
| 2.6–3.3s | 호박빛이 아래 유리까지 번짐 | 24% → 0% | 1.5~2 |
| 3.3–6.7s | **덮임**(아치 창 전체가 호박빛 유리) | 0% | 0.2~1.3 |
| 6.7–8.3s | 빛이 아래로 가라앉으며 청남색 복귀 | 0% → 33% | 1.2~3 |
| 8.3–9.5s | 차분한 시계탑 | 33% | 0.5~1 |

**R11 판정.** 덮인 구간에서 프레임 간 차이가 가장 작은 곳은 3.6~4.3초의 0.2~0.5이고 그마저 납선·유리 결·톱니가 남아 있어
shiba 같은 평면 단색이 아니다(공간 표준편차 59). 스테인드글라스는 납선이 구조를 붙들어 «덮으면 멈춘다»가 구조적으로 안 생긴다.
**R1은 문자 그대로는 아니다** — 모서리 위쪽 약 5%와 좌우 가장자리는 아치 창틀의 검은 테두리이고 아래쪽 절반은 톱니가 비치는 갈색 유리다.
다만 클립은 알파가 없어 어느 프레임이든 게임 화면을 가리고, 진입은 페이드아웃으로 프리스핀 판에 이어지므로 커튼 구실에는 지장이 없다.
**R12 한계.** 심볼은 평면 유리인데 이 클립은 빛과 결이 있는 사진 같은 유리다(다른 팩 클립도 같은 처지, 사용자 «심볼같은건 실사여도 갠찮음»).

**컷과 출고.**

| 전환 | 소스 컷 | 길이 | 스왑 오프셋(`opaqueMs`) | 커버 유지 | 용량 |
|---|---|---:|---:|---:|---:|
| 진입 | 00.60 → 03.90 @1.1x (3.30초를 3.00초로) | 3.00s | **2400** (소스 3.25초에 청색 0%) | 0.6s | 599 KiB |
| 복귀 | 06.00 → 09.00 @1.0x | 3.00s | **0** (머리 0.7초 덮임 → 가라앉음 → 차분한 시계탑 0.7초) | 0.7s | 513 KiB |

인코딩은 4-3 규격(16fps·q60·compression 6·loop 1) + **스케일 뒤 `gblur=sigma=0.9`**. 팩 합계가 블러 없이 1.72 MiB라 1.2 MiB 선을 넘어서
4-4의 규칙(고주파는 quality 말고 소스를 흐린다)을 적용했고, **1,112 KiB(1.09 MiB)**가 됐다. 실측 메모: 블러를 스케일 *앞*(1080p 기준)에 걸면 sigma 1.2도 -15%뿐이고,
**스케일 뒤**에 걸어야 효과가 난다(sigma 0.6 -22%, 0.9 -35%, 1.2 -44%). 48프레임·최대 프레임 63ms·정지 0.0%·2999ms
(`check:clips` 전체 12개 통과). `theme.json`: `transitions.freeSpinsEnter {opaqueMs 2400, durationMs 2999}` / `freeSpinsExit {opaqueMs 0, durationMs 2999}`,
두 파일 `git add -f`(`pack:check` 오류 0).

**눈 확인(헤드리스 크롬, 390x844·430x932, DPR 2, CDP 스크린캐스트 170~340장).** 진입: 스캐터가 서고 프리스핀 팝업이 닫힌 뒤 클립이 스테이지 영역(`0,52,390,583` / `0,52,430,659`,
`object-fit: cover`)을 덮고 3.1~3.2초 재생 → 호박빛으로 덮인 채 페이드아웃해 프리스핀 판으로 이어짐. 복귀: 종료 팝업 → 호박빛에서 빛이 가라앉으며 어두운 시계탑이 드러나고
일반 판으로 이어짐(3.0초). 콘솔의 `[transition-clip] noClip` 경고는 사라졌고 `클립 재생 시작 {decoded: true, naturalWidth: 360}`이 찍힌다.
⚠ 위 확인은 Chromium 기준이다. 텔레그램 iOS WebView는 5-2의 경고대로 별도 확인이 필요하다.

---

### 2-6. classic-777 — 클래식 777 (생성 보류: 프리스핀 없음)

팩 컨셉: 네이비 라운지 + 브라스. 7 / BAR / 벨 / 체리. 스캐터도 프리스핀도 없다.

**지금은 재생될 순간이 없다.** 아래 설계는 `math.json`에 스캐터·프리스핀이 추가되는 경우에만 쓴다.

#### 진입 — 황동 셔터가 내려온다

> 캐비닛 상단에서 황동 루버(가로살) 셔터가 한 장씩 겹쳐 내려와 화면을 덮고,
> 마지막 살이 닫히는 순간 금빛 파문이 표면을 훑는다.

**왜 이 팩인가.** 이 팩에는 서사가 없다 — 실물 캐비닛 그 자체가 컨셉이다.
그래서 기계의 문이 닫힌다가 유일하게 정직한 어휘이고, 황동 루버는 R1을 구조적으로 만족한다.

```
Vertical full-screen game transition effect, glossy 3D toy render, polished brass and brushed metal,
premium mobile casino art. Against a deep navy lounge interior with soft brass pendant bokeh, this
cycle repeats over and over: horizontal brushed-brass louver slats drop down one after another from
the top of the frame and overlap into a solid shutter, until the frame is completely opaque edge to
edge, corner to corner, in polished brass with a warm specular sheen, holding fully covered for a beat
while a golden ripple of light sweeps down across the closed surface, then the slats retract upward
and the navy lounge bokeh shows through again before the next closing. The whole cycle completes about
four times in the clip. Only the objects move; the camera never moves. Deep navy, brass gold, cyan gem
accents, polished glass and brushed metal, soft studio lighting with a warm brass rim light. No text,
no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no animals. Camera
locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 셔터가 열리고 빛이 든다

> 황동 살이 위로 걷히며 그 틈으로 따뜻한 라운지 조명이 새어 들어오고,
> 시안 젬 반짝임이 흩어지며 화면이 맑아진다.

```
Vertical full-screen game transition effect, glossy 3D toy render, polished brass and brushed metal,
premium mobile casino art. The frame is completely filled edge to edge with an opaque polished brass
shutter, and this cycle repeats over and over: the horizontal brass louver slats tilt open and lift
away one after another, warm lounge light spilling through the widening gaps, a few cyan gem sparkles
drifting and fading, until a calm deep navy lounge interior with soft brass pendant bokeh is fully
revealed and clear, then the slats drop back down and seal the frame corner to corner in complete
opacity, holding for a beat before opening again. The whole cycle completes about four times in the
clip. Only the objects move; the camera never moves. Deep navy, brass gold, cyan gem accents, polished
glass and brushed metal, soft studio lighting. No text, no letters, no numbers, no logos, no watermark,
no people, no faces, no hands, no animals. Camera locked, no camera movement, no zoom, no pan.
```

---

### 2-7. candy-cluster-pop — 슈가 프로스트 주문 카운터 (프리스핀 = 주문 카드 라운드)

팩 컨셉: 매트·새틴 설탕 코팅 젤리(**유리처럼 번들거리지 않는다**), 하늘(`#8fd8f2`)·딸기(`#ff7aa8`)·라임(`#a8e05f`)·
크림(`#fff1d6`)·포도(`#9d7ae0`). 보너스는 일반 프리스핀이 아니라 **사탕 가게 주문대에서 벌어지는 주문 카드 라운드**다.
프리스핀 배경(`bg-freespins.webp`)은 하늘색 판벽 위에 크림색 주문 전표 21장이 핀으로 꽂힌 카운터다.

> `art/prompts.json`의 `stylePrefix`가 «NOT glossy and NOT glass-like»를 못박고 있다. 그래서 R12의 «유리»·«광택»
> 어휘를 이 팩에서는 **반대로** 쓴다 — 프롬프트에 `not glossy, not glass`를 명시한다(fruit-fiesta의 캔디글라스와 정반대).

#### 진입 — 주문 전표가 쏟아진다

> 크림색 주문 전표가 아래에서 소용돌이쳐 올라와 점점 빽빽해지고, **펄럭이며 겹쳐 쌓이는 그 동작으로**
> 화면 전체를 덮는다. 전표 더미는 덮인 뒤에도 계속 펄럭인다.

**왜 이 팩인가.** 라운드의 정체가 «주문 카드»다. 라운드가 열린다는 것은 전표가 카운터에 도착한다는 뜻이라
전환이 곧 규칙 예고가 된다. 전표는 종이라 겹치면 구조적으로 불투명해지고(R1), 가장자리가 계속 펄럭여
단색 정지로 굳지 않는다(R11) — shiba가 겪은 «덮으면 멈춘다»를 소재 단계에서 피한다.

**규칙 적용.** R1(완전 불투명) / R2(3초 사이클 x4) / R3(`camera_fixed` 없이 본문 고정 문구) / R4(손·사람·글자 금지,
전표는 «completely blank») / R8(올라옴 = 덮임 한 동작) / R9(주어 «order slips»를 첫 문단에) / R11(덮인 채 펄럭임) /
R12(`stylePrefix`의 매트·설탕·팔레트 hex, `negative`의 photorealistic·glossy glass 가져옴, `cropped edges`·
`busy background`·`3/4 top-down`은 뺌) / R13(안 겪은 금지어 없음).

```
Vertical full-screen game transition effect, soft toy-like 3D render, soft matte satin finish with a dusting of fine sugar, not glossy, not glass, not photorealistic, premium mobile game art. A flurry of cream paper order slips with scalloped bottom edges and small strawberry-pink pins flutters in front of a pastel sky-blue candy shop counter with warm hanging lamps behind. One continuous motion repeats: the slips swirl up from the bottom of the frame and pour in thicker and thicker, overlapping and stacking in that same flutter until the whole frame is completely opaque edge to edge, corner to corner, a seamless layered mass of cream slips, holding fully covered for a beat while the slips keep fluttering and rippling so the covered frame is never a flat still color, then the slips blow away and the shop shows through before the next flurry. The slips fluttering in and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. Sky blue #8fd8f2, strawberry #ff7aa8, lime #a8e05f, cream #fff1d6 and grape #9d7ae0 pastel accents, soft top-left light. The slips are completely blank. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 도장이 찍히고 전표가 걷힌다

> 전표 더미 위로 딸기색 도장이 내려와 **쿵 찍히고, 그 충격이 그대로 전표 전체를 위로 날려 보내며**
> 하늘색 주문대가 드러난다.

**왜 이 팩인가.** 라운드 규칙에서 카드를 채우면 «도장이 찍힌다». 라운드의 끝을 도장 한 번으로 읽히게 하고,
진입이 «쏟아져 쌓임»이니 복귀는 «찍고 걷힘»으로 방향을 바꾼다(R6, 역재생 아님). 도장이 사람 손 없이 스스로
움직이므로 R4를 지킨다. 도장 자국은 **무늬 없는 별**로 못박는다(글자가 찍히면 치명적).

**규칙 적용.** R1·R2·R4·R6·R8(도장 착지 = 전표 날림 한 동작)·R9(도장을 첫 문장에)·R11·R12·R13. 복귀는 덮인 채 시작하므로
`opaqueMs: 0` 후보다.

```
Vertical full-screen game transition effect, soft toy-like 3D render, soft matte satin finish with a dusting of fine sugar, not glossy, not glass, not photorealistic, premium mobile game art. A single large round strawberry-pink rubber stamp with a cream handle floats centered above a thick drift of cream paper order slips that fills the frame completely, edge to edge, corner to corner. One continuous motion repeats: the stamp drops straight down and lands with a soft thump, pressing one big plain pink star-shaped mark into the slips, and that same thump lifts the whole drift of slips up and away, fluttering off the top and sides of the frame in pastel waves, revealing a calm pastel sky-blue candy shop counter with warm hanging lamps, fully clear and still, then a fresh flurry of slips pours back in and covers the whole frame corner to corner in complete opacity for a beat while the slips keep fluttering, before the stamp drops again. The stamp landing and the slips lifting away are one single motion, never separate steps. While the frame is covered the slips keep moving, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. Sky blue #8fd8f2, strawberry #ff7aa8, lime #a8e05f, cream #fff1d6 and grape #9d7ae0 pastel accents, soft top-left light. The slips and the stamp are completely blank except the star mark. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

> 발주 방식: 위 두 프롬프트를 **각각 한 편씩** 발주했다(승인된 2편, $1.86). R10대로 한 편에서 양방향을 자르는 길도
> 있었으나 승인 범위가 2편이라 방향별로 뽑았다. `vidgen-portrait.mjs`는 스크래치패드에서 유실돼
> `vidgen.mjs`(`ben_suno/vocalo-ch/bugnomama/scripts/`)에서 이미지 첨부와 `ratio:'16:9'` 고정만 걷어 낸 t2v 변형을 썼다
> (`ratio:'9:16'`, `camera_fixed` 미전달, `generate_audio:false`).

> **채택 결과 (candy-cluster-pop).** 1차 `exit`(도장이 전표 더미 위에 얹힘)는 더미가 화면 아래 65%만 덮고 위에 하늘색
> 벽과 도장이 그대로 보여 R1 위반이라 폐기했다. 프롬프트를 «초근접, 더미가 프레임을 가득 채움»으로 바꿔 **한 번 재발주**
> (`exit2`, 총 3편 $2.79). 컷: 진입 `candy-enter.mp4` 02.60 → 05.60 (스왑 +2.30s, 덮임 약 0.7s 동안에도 전표가 계속 펄럭임),
> 복귀 `candy-exit2.mp4` 00.90 → 03.90 (스왑 +0.00s, 도장 착지 후 전표가 날려 올라가며 주문대 노출). 16fps/q60, 48프레임,
> 최대 프레임 63ms, 정지 0.0%. 진입 328 KiB / 복귀 463 KiB. 한계: 진입 마지막 0.5초는 초근접 전표라 초점이 흐리고,
> 복귀에서 드러나는 주문대는 약간 사진 같은 질감이다(전표·도장은 장난감 톤).

> **2차 재발주 (2026-11-26 아트·전환 검수, F13).** 목표는 복귀 클립의 끝 이음매(끝 장면이 사진 같은 주문대 → 기본 배경 컷 튐)와 진입 클립 끝의 흐린 크림 벽이었다.
> 1차 소스 mp4 3편은 스크래치패드와 함께 사라져 **재편집이 불가능**했고, 그래서 둘 다 재발주했다(진입 1편 + 복귀 2편, 총 $2.79).
> 소스·프롬프트·로그는 `D:/park/tgslot-wt/_qa/review-candy-cluster-pop-art/clips/` 에 남겼다(`candy-enter3.mp4`, `candy-exit3.mp4`, `candy-exit4.mp4`와 각 `.json`·`*-prompt.txt`). 다시 자를 일이 있으면 발주 없이 거기서 뽑는다.
>
> | 편 | 프롬프트 변경 | 결과 | 채택 |
> |---|---|---|---|
> | 진입 `enter3` | §2-7 진입 프롬프트에서 덮임 묘사만 «sharp, evenly lit layered mass of cream slips, every slip crisp and in focus with visible scalloped edges and tiny pink pins, not an extreme close-up, no blur, no depth-of-field falloff» 로 교체. R11 문장 유지 | 사이클 약 8초(요청한 3초 아님). 가게 → 전표가 쏟아져 덮임(소스 2.8~6.4초 완전 덮임) → 걷힘. 전표가 처음부터 끝까지 또렷하고 초점이 흐려지지 않았다 | **채택**, 컷 01.40 → 04.40 |
> | 복귀 `exit3` | §2-7 복귀 프롬프트 + «Extreme close-up … only slips and the stamp are visible» + 드러나는 장면만 «pastel candy land of gently rolling pink and lime-green hills …, not photographic» 로 교체 | 도장이 쿵 찍히고 전표가 날아가 캔디 랜드 노출까지는 의도대로. 그러나 **더미가 프레임 아래 45%만 덮고 하늘·언덕이 첫 프레임부터 보인다**(1차 `exit`와 같은 R1 실패) | 예비 |
> | 복귀 `exit4` (재시도 1편) | 첫 문장을 «더미가 프레임을 꽉 채운다, 사이클 시작에는 하늘·언덕·지평선이 없다»로 못박고 «전표가 하나도 남지 않을 때까지»·«전경에 아무것도 없이 비고 고요»를 추가 | **같은 실패 반복**: 더미가 아래 35%만 덮는다. 대신 도장 착지 → 전표 소용돌이 → 빈 하늘·언덕이 가장 선명하다. 소스 사이클은 약 8초 | **채택**, 컷 00.40 → 03.40 |
>
> **왜 R1 위반인 복귀를 채택했나.** 1차 `exit`를 폐기한 이유는 «더미가 일부만 덮어 R1 위반»이었다. 이번에도 같은 구도지만 채택한 근거는 다르다.
> (1) 클립은 알파 없는 불투명 DOM 오버레이라 첫 프레임부터 화면을 완전히 가린다. R1이 지키려던 «교체가 비친다»는 일이 이 구도에서도 일어나지 않는다(`opaqueMs: 0`).
> (2) 이번 목적은 끝 이음매다. 끝 프레임이 하늘·언덕이라 기본 배경과 훨씬 닮았다 — `bg.webp`와의 평균색 거리(상단 0~20% / 20~40% / 40~60% 띠)가 옛 복귀 끝 136.6 / 78.6 / 114.6에서 **새 복귀 끝 68.9 / 54.8 / 62.3**으로 반 가까이 줄었다.
> (3) 시작도 «도장이 더미 위에 떠 있다가 쿵 찍힌다»여서 «주문 카드를 찍어 완료한다»는 라운드 규칙이 첫 장면부터 읽힌다.
> **알게 된 것(R14 후보).** 드러나는 장면을 풍경으로 길게 묘사하면 생성기는 그 풍경을 **처음부터 더미 뒤에 깔아 버린다.** 더미를 화면 가득으로 못박는 문장을 앞세워도(exit4) 안 먹혔다. 더미가 첫 프레임부터 화면을 다 덮어야 하는 팩이라면 드러나는 장면을 «a calm clear pastel scene» 정도로 짧게 쓰고, 풍경 묘사는 포기하는 쪽이 낫다 — 이번에는 시도하지 않았다.
>
> **컷·규격.** 둘 다 16fps / q60 / 360×640 / `loop 1`, `gblur` 없음(전표가 또렷해야 한다).
>
> | 전환 | 소스 | 컷 | 스왑 오프셋 | 프레임 | 용량 | `check:clips` |
> |---|---|---|---:|---:|---:|---|
> | 진입 | `candy-enter3.mp4` | 01.40 → 04.40 등속 | **+1.90s** (`opaqueMs 1900`; 소스 3.3초에 배경 노출 ≈4%, 이후 3.0~3.1% 바닥값은 전표 사이 그늘) | 48 (최대 63ms, 합 2999ms) | 460 KiB | 통과, 정지 0.0% |
> | 복귀 | `candy-exit4.mp4` | 00.40 → 03.40 등속 | **+0.00s** (`opaqueMs 0`) | 48 (최대 63ms, 합 2999ms) | 302 KiB | 통과, 정지 0.0% |
>
> 팩 합계 791 KiB → **762 KiB**(1.2 MiB 안). 진입은 컷 머리에서 가게 카운터 위로 전표가 날리다가 +1.9초에 화면을 가득 채우고 끝까지 펄럭인다(덮인 구간 소스 움직임 0.4~1.2, 마지막 420ms는 렌더러가 기본 화면으로 페이드).
> 복귀는 도장 착지(컷 +0.6s) → 전표 소용돌이(+1.0~2.0s) → 빈 하늘·언덕이 약 1초 머문 뒤 마지막 420ms 페이드로 기본 화면에 이어진다.
>
> ```sh
> # 진입
> ffmpeg -ss 1.4 -t 3.0 -i candy-enter3.mp4 -an -vf "fps=16,scale=360:640:flags=lanczos" -c:v libwebp_anim -quality 60 -compression_level 6 -loop 1 fs-enter.webp
> # 복귀
> ffmpeg -ss 0.4 -t 3.0 -i candy-exit4.mp4 -an -vf "fps=16,scale=360:640:flags=lanczos" -c:v libwebp_anim -quality 60 -compression_level 6 -loop 1 fs-exit.webp
> ```
>
> **눈 확인.** 개발 스택(API 8837 / 허브 5237)에서 주문 라운드 진입·종료를 390×844·430×932 두 폭으로 돌려 0.1~0.2초 간격으로 찍었다. 진입: 가게 → 전표 소용돌이 → 가득 덮임 → 420ms 페이드로 라운드 화면. 복귀: 도장 → 전표 소용돌이 → 캔디 랜드 → 기본 화면(배경 언덕과 같은 톤으로 이어져 컷이 튀지 않음). 두 폭 모두 콘솔 에러 0(favicon 404 제외).
### 2-8. kraken-cove — 크라켄 보물 동굴 (프리스핀 = 코인 리스핀 라운드)

팩 컨셉: 햇살이 드는 라군 동굴의 말랑한 비닐 장난감(젖은 광택은 재질에만, **화면을 가로지르는 광택 줄은 금지**), 라군 청록(`#2ec4d6`)·
금(`#ffc83d`)·산호 분홍(`#ff6f91`)·크라켄 보라(`#7b5cff`). 보너스는 일반 프리스핀이 아니라 **빈 칸만 돌려 금화를 모으는 코인 리스핀 라운드**이고,
촉수가 세로줄 하나를 감아 숫자를 두 배로 만든다. 프리스핀 배경(`bg-freespins.webp`)은 같은 라군 동굴이라 전환 클립이 닿는 곳과 톤이 이어진다.

> 이 팩의 R13은 «동물 금지»를 **뺀다.** 겪지 않은 실패이고, 복귀 클립의 주어가 촉수(머리·눈 없이 한 가닥)다.
> 대신 «금화는 completely plain with no markings»를 두 클립 모두에 못박았다(R4 — 숫자는 코드가 그린다).

#### 진입 — 금화가 파도처럼 쏟아진다

> 동굴 위쪽에서 금화가 거품 파도처럼 쏟아져 내려 **쌓이는 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 금화가 구르고 반짝이며 거품이 오른다.

**왜 이 팩인가.** 라운드의 정체가 «코인을 모으는 것»이라 전환이 곧 규칙 예고가 된다. 금화 더미는 구조적으로 불투명하고(R1),
계속 구르니 단색 정지로 굳지 않는다(R11).

**규칙 적용.** R1·R2·R3(`camera_fixed` 없이 본문 고정 문구)·R4(손·사람·글자 금지)·R5·R7·R8(쏟아짐 = 덮임 한 동작)·R9(주어 «gold coins»를 첫 문장에)·R11·
R12(`stylePrefix`의 어휘와 hex, `negative`의 photorealistic).

```
Vertical full-screen game transition effect, bright stylized 3D render, chunky soft vinyl-toy look with a subtle wet sheen, not photorealistic, premium casual mobile game art. A torrent of shiny plain gold coins pours down from the top of a sunlit lagoon-teal underwater cave in a bubbly wave. One continuous motion repeats: the coins cascade down and pile up thicker and thicker, tumbling over each other in that same pour until the whole frame is completely opaque edge to edge, corner to corner, a seamless heap of gold coins, holding fully covered for a beat while the coins keep tumbling, glinting and bubbles keep rising so the covered frame is never a flat still color, then the heap slides away downward and the teal cave shows through before the next pour. ...
```

#### 복귀 — 촉수가 금화 더미를 쓸어 걷는다

> 화면을 가득 채운 금화 더미를 보라 촉수 한 가닥이 **휘감아 쓸어 올리는 그 동작으로** 걷어 내며 밝은 라군 동굴이 드러난다.

**왜 이 팩인가.** 재미 장치가 «촉수가 감는다»다. 진입이 «쏟아져 쌓임»이니 복귀는 «감아 걷음»으로 방향이 다르다(R6, 역재생 아님).
복귀는 덮인 채 시작하므로 `opaqueMs: 0`이다.

```
Vertical full-screen game transition effect, (같은 stylePrefix). Extreme close-up: a single thick glossy kraken-violet tentacle with soft pale pink suckers sweeps through a dense heap of shiny plain gold coins that completely fills the frame, edge to edge, corner to corner, the camera so close that only coins and the tentacle are visible and no background shows at all. One continuous motion repeats: the tentacle curls in from the bottom edge, wraps around the heap and swirls it up and away off the top of the frame in a bubbly spiral, and that same sweep reveals a calm sunlit lagoon-teal underwater cave with coral and rippling caustic light, fully clear, then a fresh wave of coins pours back in ... .
```

> **채택 결과 (kraken-cove).** 발주 3편, **$2.79**(승인 범위의 상한). 진입 1편(`fs-enter`)과 복귀 2편 중 뒤의 것(`fs-exit`).
> 1차 복귀본은 금화 더미가 프레임 위쪽을 비워 둬 R1 위반이라 폐기하고, 위 문장처럼 «Extreme close-up … no background shows at all»을 넣어
> **한 번 재발주**했다(candy 2-7과 같은 처방). 출고본은 16fps/q60 애니메이션 WebP, 360x640, 48프레임, 3.00초, 최대 프레임 63ms,
> 정지 프레임 0.0%, `check:clips` 통과. `theme.json`에는 진입 `opaqueMs: 2500` / `durationMs: 2999`, 복귀 `opaqueMs: 0` / `durationMs: 2999`로 적었다.
>
> **브라우저 확인 (2026-11-26, 430x932·390x844, 개발 스택).** 코인 리스핀 프리셋으로 스핀하면 진입 클립이 재생되고(금화 기둥 → 더미가 차오름),
> 그 뒤 프리스핀 동굴(핀 링 친 코인 5개)로 넘어가는 것을 확인했다. 큰 당첨 오버레이를 닫은 뒤 복귀 클립이 금화로 가득 찬 채 시작해
> 촉수가 쓸어 올리며 라군이 드러나는 것도 확인했다. 콘솔 오류는 «Failed to load resource 404» 한 줄뿐인데 페이지가 받은 응답 중 400 이상은 없어 브라우저가 직접 요청한 favicon으로 보이고, 클립 로그는 정상(`opaqueMs: 2500`·`0`, `decoded: true`)이다.
>
> **한계 (눈으로 본 것).**
> - 진입 클립 끝 프레임에서 금화 더미는 화면 아래 약 70%까지만 차고 위쪽에 동굴 벽과 금화 기둥이 남는다. 클립 상한 3편을 모두 써서 그대로 채택했다.
>   오버레이가 풀리는 순간 같은 라군 동굴 배경(`bg-freespins`)으로 이어지므로 튀는 정도는 작았지만, R1을 엄밀히 만족하지는 않는다.
>   더 다듬으려면 진입을 «초근접, 더미가 프레임을 가득 채움» 문장으로 1편 더 발주해야 한다(+$0.93, 승인 필요).
> - 두 클립 모두 금화에 «$» 비슷한 작은 양각이 보인다(프롬프트의 plain에도 불구하고). 복귀에서 드러나는 동굴은 장난감 톤보다 사진에 가깝다.

---

### 2-8. hanbok-night-market — 한복 야시장 (프리스핀 = 말판 보너스)

팩 컨셉: 민화 + 부드러운 3D 하이브리드, 야시장 등불 밤. 오방색(적 `#d8433c`·청 `#2f6fb0`·황 `#e8c34a`·백 `#f2ece0`)과
등불 빛 `#ffb765`. 보너스는 프리스핀이 아니라 **윷판 말판 보너스**이고, 말판 화면은 같은 키(`freeSpinsEnter`/`freeSpinsExit`)를 쓴다.
말판 배경(`bg-freespins.webp`)은 위에서 본 빈 멍석이다.

> fruit-fiesta의 복귀가 «등불이 올라간다»라서 등불을 주 소재로 쓰면 겹친다. 그래서 진입은 **비단 천**,
> 복귀는 **윷가락 착지**로 잡았다. «hanbok»이라는 단어는 사람(한복 입은 인물)을 불러내므로 프롬프트에 쓰지 않고
> «empty silk cloth»로만 부른다(K8).

#### 진입 — 오방색 비단이 휘감겨 덮는다

> 긴 비단 폭이 아래에서 소용돌이쳐 올라와 점점 풍성해지고, **겹겹이 접히며 휘감기는 그 동작으로** 화면 전체를 덮는다.
> 덮인 뒤에도 비단이 계속 물결쳐서 단색으로 굳지 않는다.

**왜 이 팩인가.** 천은 겹치면 구조적으로 불투명해지고(R1), 계속 물결쳐 «덮으면 멈춘다»(R11)를 소재 단계에서 피한다.
말판은 «멍석 위에서 벌이는 윷놀이»라 비단 폭이 걷히는 것이 판이 펼쳐지는 느낌과 맞는다. 사람 없이 천이 스스로 움직인다(R4).

**규칙 적용.** R1·R2(3초 사이클 ×4)·R3(`camera_fixed` 없이 본문 고정 문구)·R4·R5·R7·R8(휘감김 = 덮임 한 동작)·R9(주어 «silk panels»를
첫 문단에)·R11·R12(`stylePrefix`의 민화·한지·오방색 hex, `negative`의 photorealistic)·R13(겪은 실패만).

```
Vertical full-screen game transition effect, Korean minhwa folk-painting style blended with soft toy-like 3D volume, hanji paper grain and fine ink outlines, flat obangsaek colors with a warm lantern glow, not photorealistic, premium mobile game art. Long panels of empty silk cloth in red #d8433c, blue #2f6fb0, yellow #e8c34a and ivory #f2ece0, edged with thin gold trim, billow in front of a lantern-lit night market alley glowing warm #ffb765. One continuous motion repeats: the silk panels whirl up from the bottom of the frame and sweep in fuller and fuller, overlapping fold over fold in that same billowing swirl until the whole frame is completely opaque edge to edge, corner to corner, a seamless layered mass of rippling silk, holding fully covered for a beat while the silk keeps rippling and folding so the covered frame is never a flat still color, then the panels slide away and the alley glows through before the next swirl. The silk sweeping in and the frame being covered are one single motion, never separate steps. Each full cycle lasts about three seconds and repeats about four times across the clip. The cloth is plain with no writing. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

#### 복귀 — 윷가락이 떨어져 비단이 갈라진다

> 윷가락 넷이 비단 더미 위로 **착지하는 그 충격으로 비단이 한가운데부터 갈라져** 양옆으로 밀리고 골목이 드러난다.

**왜 이 팩인가.** 말판의 끝을 윷 한 번으로 읽히게 한다. 진입이 «휘감겨 덮임»이니 복귀는 «찍고 갈라짐»으로 방향을 바꾼다(R6, 역재생 아님).
윷가락은 **무늬 없는** 납작한 면/둥근 면 두 가지로만 못박는다(글자·무늬가 생기면 치명적).

**규칙 적용.** R1·R2·R4·R6·R8(착지 = 갈라짐 한 동작)·R9(윷가락을 첫 문장에)·R11·R12·R13. 덮인 채 시작하므로 `opaqueMs: 0`.

```
Vertical full-screen game transition effect, Korean minhwa folk-painting style blended with soft toy-like 3D volume, hanji paper grain and fine ink outlines, flat obangsaek colors with a warm lantern glow, not photorealistic, premium mobile game art. Four plain wooden yut sticks, each a long half-round stick with one flat pale face and one rounded brown face, float centered above a thick drift of rippling silk cloth in red #d8433c, blue #2f6fb0, yellow #e8c34a and ivory #f2ece0 that fills the frame completely, edge to edge, corner to corner. One continuous motion repeats: the four sticks drop and land on the silk with a crisp clack, and that same impact splits the silk down the middle and throws the panels apart to both sides of the frame in rippling waves, revealing a calm lantern-lit night market alley glowing warm #ffb765, fully clear and still, then the silk sweeps back in and covers the whole frame corner to corner in complete opacity for a beat while it keeps rippling, before the sticks drop again. The sticks landing and the silk splitting apart are one single motion, never separate steps. While the frame is covered the silk keeps moving, never a flat still color. Each full cycle lasts about three seconds and repeats about four times across the clip. The sticks and the cloth have no markings. No text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan.
```

> 발주 방식: 위 두 프롬프트를 **각각 한 편씩** 발주했다(편당 $0.93, 합계 **$1.86**, 재시도 없음 — 총 3편 상한 중 1편 여유).
> `D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`(`ratio:'9:16'`, `camera_fixed` 미전달, `generate_audio:false`)로 13초 t2v를 뽑았다.

> **채택 결과 (hanbok-night-market).** 컷: 진입 `hanbok-enter.mp4` 2.25 → 5.25s(`opaqueMs: 2200`, 덮임이 2.0s 무렵 거의 차고 2.2s에 완전해진 뒤에도
> 천이 계속 흐른다), 복귀 `hanbok-exit.mp4` 0.40 → 3.40s(`opaqueMs: 0`, 덮인 채 시작 → 윷가락 착지 → 비단이 가운데부터 갈라져 골목 노출).
> 16fps/q60, 48프레임, 최대 프레임 63ms, 정지 0.0%(`check:clips` 통과). 진입 414 KiB / 복귀 557 KiB.
> 브라우저(개발 스택, 430×932)에서 말판 진입·종료 전 구간을 돌려 두 클립이 단색 커튼 폴백 대신 실제로 재생되고
> 복귀 클립이 끝난 뒤 기본 게임 화면으로 이어짐을 확인했다(2026-11-26).
> 한계: 진입의 덮임 구간은 비친 등롱 보케가 어렴풋이 보이는 얇은 크림색 천이고, 복귀의 천 색은 지정 hex보다 바랜 청록·적갈이다.
> 복귀 클립의 마지막 프레임은 가운데만 열리고 양옆에 비단이 남아 있어(약 3분의 1), 렌더러의 페이드가 그 잔상을 지워 준다.
> 덮임은 두 편 모두 완전했고 사람·손·글자는 나오지 않았다.

---

### 2-8. idol-stage-live — 아이돌 스테이지 라이브 (프리스핀 = 무대 룰렛)

팩 컨셉: 애니 셀셰이딩 콘서트. 네온 핑크(`#ff5fa2`)·일렉 블루(`#4aa8ff`)·스포트 골드(`#ffd166`)·은(`#d9dde8`)이
무대 암전(`#14101f`) 위에 놓인다. 보너스는 프리스핀이 아니라 **무대 룰렛**(트리거 스핀 응답 하나에서 끝나는 3겹 룰렛)이고,
룰렛 배경(`bg-freespins.webp`)은 가운데를 비운 원형 LED 무대다(판이 그 위에 놓인다). 전환 키는 기존대로
`freeSpinsEnter`·`freeSpinsExit` 이다.

> **손 회피(R4)가 소재를 정했다.** 이 팩의 주인공 소품 «응원봉»은 원래 손에 쥐는 물건이라 클립 주어로 쓰면 손·팔이
> 튀어나올 위험이 크다. 그래서 주어를 **스스로 움직여도 어색하지 않은 콘서트 기물 — 테이프 캐논 리본과 하트 풍선 —** 로 정했다.
> 기본 심볼에 하트 풍선이 있어 «룰렛이 끝나 기본 무대로 돌아간다»가 같은 소품으로 이어진다.

#### 진입 — 리본 테이프가 쏟아진다

> 무대 바닥의 작은 캐논들에서 분홍·파랑·은빛 리본 테이프가 터져 올라와 점점 빽빽해지고, **흩날리며 겹쳐 쌓이는
> 그 동작으로** 화면 전체를 덮는다. 덮인 뒤에도 리본은 계속 나부낀다.

**왜 이 팩인가.** 테이프 캐논은 공연의 클라이맥스 신호다. «지금부터 특별 무대»가 소리 없이 읽히고, 룰렛 규칙을 못 알아도
전환 자체가 예고가 된다. 리본은 겹치면 구조적으로 불투명해지고(R1) 가장자리가 계속 나부껴 단색 정지로 굳지 않는다(R11).

**규칙 적용.** R1 · R2(3초 사이클 ×4) · R3(본문 고정 문구) · R4(손·사람·글자 금지, 리본은 무늬 없음) · R8(터져 오름 = 덮임
한 동작) · R9(주어 «ribbon streamers»를 첫 문장에) · R11 · R12(`stylePrefix`의 셀셰이딩·hex, `negative`의 photorealistic) ·
R13(겪은 실패만 금지 — 사용자 취향인 «사선 광선 금지»만 예외로 넣음). 프롬프트 전문은 `docs/PLAN_idol-stage-live.md` §10-1.

#### 복귀 — 하트 풍선이 터지며 걷힌다

> 화면을 가득 채운 분홍 하트 풍선 표면이 출렁이다가 **펑 터지고, 그 터짐이 그대로 반짝이 조각을 바깥으로 날려 보내며**
> 무대가 드러난다.

**왜 이 팩인가.** 진입이 «아래에서 쌓임»이니 복귀는 «가운데서 터져 바깥으로 흩어짐»으로 방향을 바꾼다(R6, 역재생 아님).
풍선은 덮인 상태에서 출렁임이 자연스럽다(R11). 복귀는 덮인 채 시작하므로 `opaqueMs: 0`이다. 프롬프트 전문은 PLAN §10-2.

> 발주·컷 결과(아트 레인, `games/idol-stage-live/README.md` 아트 절): 3편 $2.79 = 진입 2편 + 복귀 1편.
> 진입 1차는 3D 질감에 용량 1.5 MB 라 폐기했고 2차(«굵은 납작 리본» 문구)를 컷했다(원본 1.6~4.6초, 스왑 `opaqueMs 2000`,
> `durationMs 2999`, 소스 블러 σ1.0 + q40 → **711 KiB**). 복귀는 원본 0~2.9초를 3.0초로 늘려 컷했다(`opaqueMs 0`,
> σ1.0 + q50 → **478 KiB**, 마지막 프레임은 맑은 무대). 두 편 모두 360×640 · 16 fps · 3.00초 · `loop=1` · 48프레임 ·
> 최대 프레임 63 ms · 정지 0.0 %(`check:clips` 통과). 팩 합계 1.16 MiB.

> **브라우저 확인(사운드·연출 확인 레인, 헤드리스 Chrome 430×932).** 룰렛 진입에서 초대권 강조 → 응원봉 불빛 토큰 →
> 리본 클립(캔버스 전체를 덮고 헤더·컨트롤은 그대로) → 룰렛 무대로 이어지는 것을 직접 열어 봤다(스테이지 `pre` → `curtain`
> 약 3초 → `show`). 복귀는 분홍 하트 풍선이 프레임을 채웠다가 터지며 색종이와 함께 기본 무대가 드러나고, 곧이어 빅윈
> 축하(`celebration`, 별·음표·색종이 파티클)가 겹쳤다. 사선 빛줄기는 클립·축하 어디에도 없다.

> **한계(아트 레인 기록 + 확인).** ① 진입 클립은 완전 불투명에 이르지 않는다 — 리본 사이로 클립 안의 어두운 무대가 보인다
> (클립 자체가 불투명한 영상이라 아래 게임 화면은 비치지 않는다). ② 복귀 클립의 덮인 구간(약 1.3초)은 단색에 가까운 분홍
> 풍선이다. 표면이 미세하게 출렁여 정지 구간 검사는 통과하지만 셀셰이딩 평면색이라 «움직이는 표면» 느낌은 약하다. ③ 진입
> 711 KiB 는 기획서 목표 500 KiB 를 넘는다(리본 뭉치가 화면 전체의 고주파라 블러로도 700 KiB 아래로 내려가지 않았다).
> ④ 이 판에서 얻은 교훈: **리본·색종이처럼 가는 선이 화면을 가득 채우는 소재는 용량이 큰 쪽으로 간다** — 용량 목표가
> 빠듯하면 면이 넓은 소재(풍선·전표)를 고른다.

### 2-9. greenhouse-garden — 자라는 온실 정원 (프리스핀 = 정원 프리스핀, 8×8 햇살)

팩 컨셉: 매트·도자기 질감 잎과 꽃잎(유리·광택 아님), 잎 초록 `#6cc08b`·민트 `#cdeee0`·크림 `#fbf7ee`·꽃분홍 `#f6a6c1`·라벤더 `#b9a3e3`·버터 `#ffd66b`.
게임의 동사가 «자란다»라 두 클립이 모두 식물이 자라고 피는 동작이다. 프롬프트 원문은 `PLAN_greenhouse-garden.md` §10(진입·복귀 각 한 편, 재시도 없이 2편 $1.86).

- 진입 — 덩굴이 아래·양옆에서 뻗어 올라 잎을 펼치며 화면을 덮는다(R1·R8·R11). 복귀 — 잎 벽에 박힌 봉오리가 한꺼번에 피어 그 힘으로 꽃잎과 잎이 날려 흩어지고 온실이 드러난다(R6, 역재생 아님).
- 복귀는 candy 2차 재발주의 교훈(R14 후보)대로 드러나는 장면을 «a calm clear pastel greenhouse scene» 한 마디만 썼고, **이번에는 통했다.** 첫 프레임부터 봉오리·꽃 벽이 프레임을 가득 채우고(`opaqueMs 0`), 피어난 뒤 꽃잎이 날리며 유리 온실이 드러난다.

> **결과.** 두 편 모두 1회 발주로 채택했다. 소스는 한 편이 13.04초에 «한 사이클»만 담겼다(요청한 3초×4 반복이 아니라 약 13초 한 번 — candy 2차와 같은 현상).
> 진입 소스: 0~2s 온실 + 아래 덩굴 → 2~4s 성장 → 4~10s 덮임 유지(잎이 계속 흔들림) → 10~13s 걷힘. 복귀 소스: 0~3.5s 봉오리 벽 → 3.5~4.5s 개화·꽃잎 → 4.5~6.5s 온실 노출 → 6.5s~ 덩굴 재성장.
> 소스·프롬프트·로그는 `D:/park/tgslot-wt/_qa/new-b-sound/garden/clips/`(`gh-enter.mp4`·`gh-exit.mp4`와 각 `.json`, `gh-*-prompt.txt`)에 남겼다. 다시 자를 일이 있으면 발주 없이 거기서 뽑는다.

| 전환 | 소스 | 컷 | 스왑 오프셋 | 프레임 | 용량 | `check:clips` |
|---|---|---|---:|---:|---:|---|
| 진입 | `gh-enter.mp4` | 02.00 → 05.00 등속 | **+2.10s** (`opaqueMs 2100`; 화면 윗부분 35%의 유리창이 사라지는 시각을 프레임 실측으로 잡음) | 48 (최대 63ms, 합 2999ms) | 1086 KiB | 통과, 정지 0.0% |
| 복귀 | `gh-exit.mp4` | 02.50 → 05.50 등속 | **+0.00s** (`opaqueMs 0`) | 48 (최대 63ms, 합 2999ms) | 847 KiB | 통과, 정지 0.0% |

```sh
ffmpeg -ss 2.0 -t 3.0 -i gh-enter.mp4 -an -vf "fps=16,scale=360:640:flags=lanczos" -c:v libwebp_anim -quality 60 -compression_level 6 -loop 1 fs-enter.webp
ffmpeg -ss 2.5 -t 3.0 -i gh-exit.mp4  -an -vf "fps=16,scale=360:640:flags=lanczos" -c:v libwebp_anim -quality 60 -compression_level 6 -loop 1 fs-exit.webp
```

`theme.json`: `freeSpinsEnter {src, opaqueMs 2100, durationMs 2999}`, `freeSpinsExit {src, opaqueMs 0, durationMs 2999}`.

**한계: 용량.** 잎·꽃잎이 화면을 가득 메우는 소재라 팩 합계가 **1.9 MiB**(candy 762 KiB, 다른 팩 0.6~1.2 MiB 대비 큼). 품질 45로 낮추면 진입 888 KiB, 소스 블러(σ0.7)는 거의 효과가 없었다(1043 KiB). 규격(16fps/q60)을 지키려고 줄이지 않았다 — 용량이 문제가 되면 클립 길이를 줄이거나 12fps로 가는 쪽이 낫다. 「리본·색종이처럼 가는 선·잎이 화면을 채우는 소재는 용량이 큰 쪽」이라는 §2-5의 교훈이 또 맞았다.

**눈 확인.** 개발 스택(허브 5322, API 8922 + 정원 팩 복사본)에서 390×844로 프리스핀 진입·종료를 0.15초 간격으로 찍었다.
진입: «프리스핀! 10회» 팝업 → 덩굴이 아래에서 차올라 화면을 덮음 → 약 1초 덮인 채 잎이 흔들림 → 프리스핀 판(꽃 아치 배경)으로 교체. 복귀: 종료 팝업 닫힘 → 꽃 벽 → 개화·꽃잎 날림 → 온실 노출 → 기본 판으로 페이드. 콘솔 에러 0. 터보 속도에서는 종료 클립 대신 어두운 화면 두 컷 뒤 곧바로 기본 판이 나왔다(원인 미확인 — 클립을 접는 기존 규칙으로 추정, 빠름 속도에서는 정상 재생).
단, 클립은 Chromium 기준으로만 확인했다(텔레그램 iOS 미확인은 §5-2의 경고 그대로).

---

## 3. 생성 결과 실측

`doubao-seedance-2-0` t2v, 9:16, 1080p, 13초, `generate_audio: false`.
전부 1080x1920 24fps 313프레임. 원본 mp4는 스크래치패드에 보관한다
(`trans/` = 1차, `trans/v2/` = 2차). **결과 URL은 24시간 뒤 만료되므로 원본이 유일한 재편집 수단이다.**

### 3-1. 발주 9편 중 6편이 쓰였다

| 발주 | 결과 | 판정 |
|---|---|---|
| 1차 `sixgun-enter` | 장전 동작 + 총구 커버. 단 두 국면이 시간축에서 분리 | **채택** (진입) |
| 1차 `sixgun-exit` | 연기 커버 → 걷힘. 방향 정확 | **채택** (복귀) |
| 2차 `sixgun-enter` (재발주) | **완전 실패.** 리볼버가 아예 없는 픽셀아트풍 사막 장면 + 사람 등장 | 폐기 |
| 2차 `fruit-enter` | 과일 기둥 → 과즙 유약이 화면 전체를 덮음 | **채택** (진입) |
| 2차 `fruit-exit` | 금빛 유약 → 흘러내리며 등불 테라스 드러남 | **채택** (복귀) |
| 2차 `royal-enter` | 플래티넘 판이 **화면 중앙 사각형에서 멈춤.** 가장자리까지 안 감 | 폐기 |
| 2차 `royal-exit` | 완전 커버 → 부채꼴 개방 → 살롱. **그리고 후반부에 반대 방향 사이클까지 들어 있음** | **채택 (진입·복귀 양쪽)** |
| 2차 `shiba-enter` | 문이 다가와 덮긴 하지만 커버 구간이 **0.2초**뿐이고 작화가 거칠다 | 폐기 |
| 2차 `shiba-exit` | 완전 커버 → 문이 물러나며 참배로 드러남. 작화도 이쪽이 낫다. **양방향 사이클 포함** | **채택 (진입·복귀 양쪽)** |

즉 royal과 shiba는 **«이탈»로 발주한 클립 하나가 진입·복귀를 모두 만족**했다.
R2(반복 사이클 지시)가 의도한 대로 먹은 결과다 — 한 클립 안에 «맑음→덮임»과 «덮임→맑음»이
모두 들어 있으면 구간만 달리 잘라 두 방향을 뽑을 수 있다.

> **다음 발주부터의 교훈.** 방향별로 따로 발주하지 말고 **한 편에서 양방향을 잘라내는 것을
> 기본 전략으로 삼는다.** 팩당 $1.86 → $0.93으로 줄어든다.

### 3-2. 2차 sixgun 진입 재발주가 실패한 이유

프롬프트를 `One continuous motion repeats: the cylinder of an ornate revolver ...`로 시작했다.
**주어(리볼버)가 문장 한참 뒤로 밀렸고**, 모델은 앞의 추상적인 지시만 붙들고 전혀 다른 장면을
만들었다. 사람 금지 문구가 있는데도 사람이 나왔다 — 주제 파악에 실패하면 금지 목록도 같이 무너진다.

1차는 `A single ornate revolver floats centered against a dim dusk desert sky, and ...`로
**주어를 먼저 세웠고** 그래서 대상은 정확했다(구조가 순차였을 뿐).

**규칙 R9로 승격한다: 주어를 첫 문장에 세우고, R8의 «한 동작» 절은 그 뒤에 붙인다.**

수정안 (승인 시 재발주, $0.93):

```
Vertical full-screen game transition effect, stylized painterly western game art with a glossy
toy-like 3D render finish. A single ornate revolver floats centered against a dim dusk desert sky,
its cylinder swung open with six glossy brass cartridges seated in the chambers. One continuous
motion repeats: the cylinder slams shut and the same swing carries the gun around to face the lens,
the muzzle rushing straight at the viewer until the black bore mouth swallows the entire frame,
completely opaque edge to edge, corner to corner, gunmetal darkness ringed by a thin band of brass
and steel light, holding fully covered for a beat, then the gun falls back and the cylinder swings
open again. The cylinder closing and the muzzle turning toward the lens are one single motion, never
separate steps. Each full cycle lasts about three seconds and repeats about four times across the
clip. Dusty ochre, burnt sienna, gunmetal blue-grey and warm brass tones, low sunset rim light,
drifting dust motes, no glitter. Mechanism only, the weapon and cartridges move on their own. No
text, no letters, no numbers, no logos, no watermark, no people, no faces, no hands, no arms, no
fingers, no animals. Only the objects move; the camera never moves. Camera locked, no camera
movement, no zoom, no pan.
```

**v3 발주 결과 — 계정 한도로 거부됐다.** 위 수정본으로 실제 발주했으나 API가 즉시 실패시켰다:

```
"code": "SetLimitExceeded"
"Your account [...] has reached the set inference limit for the [doubao-seedance-2-0] model,
 and the model service has been paused. To continue using this model, please visit the
 Model Activation page to adjust or close the \"Safe Experience Mode\"."
```

**프롬프트 문제가 아니고, 과금도 발생하지 않았다**(작업이 생성 전에 실패). 모델 활성화 페이지에서
Safe Experience Mode / 지출 한도를 조정해야 재시도할 수 있다. 그때까지 v3는 미검증 상태다.

**따라서 진입은 1차 클립으로 간다.** 커튼으로서는 문제가 없고(총구가 화면을 완전히 덮는다),
잘려 나가는 것은 장전 동작의 «가시성»뿐이다. 한도가 풀리면 위 v3를 돌리고,
«장전이 보이면서 화면도 덮는다»를 실제로 달성했을 때만 교체한다 — 못 하면 1차를 유지한다.

#### 3-2-1. 2026-11-26 검수 재발주 — v3 한도 해제 후 2편, 채택 0 ($1.86)

계정 한도가 풀려 있어 두 편 모두 정상 접수·완료됐다(`D:/park/tgslot-wt/_tools/vidgen-t2v.mjs`, 9:16·1080p·13초·t2v,
원본 mp4는 `D:/park/tgslot-wt/_qa/review-sheriff-sixgun-art/clips/`). 합격선은 위에서 정한 «장전이 보이면서 화면도 완전히 덮일 때»다.

| 발주 | 프롬프트 | 장전 | 덮임 | 판정 |
|---|---|---|---|---|
| A | 위 v3 그대로 | **보인다.** 실린더가 열려 황동 탄 6발이 박힌 채 닫힌다 | **끝내 안 덮인다.** 총열 입구가 폭의 약 88%까지만 커지고 위·아래·모서리에 사막이 그대로 보인다(R1 위반). 총이 «떠 있는 물체»라 렌즈에 가까워져도 프레임보다 커지지 않았다 | 폐기 |
| B | v3에 «총구가 프레임 전체보다 커져 테두리가 사방을 넘어간다», R11(덮인 채 림이 반짝이고 먼지 흐름), R12(hex 팔레트·`not photorealistic`)를 더함 | **안 보인다.** 총이 작게 돌 뿐 탄이 거의 안 보인다 | 약 0.5초만 덮이고 곧바로 작은 총으로 **끊겨 튄다**(연속 동작이 아님). 그립이 하단에 남는다 | 폐기 |

두 발주 모두 «장난감 같은(toy-like)» 지시를 무시하고 **사실적인 리볼버**를 그렸다. R12가 어휘를 넣어도 이 소재는 실사로 끌린다.

**배운 것.** (1) «장전 가시성»과 «프레임 전체 덮임»은 한 클립에서 서로 끌어당긴다 — 덮임을 세게 요구하면 장전이 사라진다(B), 장전을 살리면 덮임이 모자란다(A).
(2) 떠 있는 물체가 프레임을 덮게 하려면 «가까워진다»가 아니라 **«물체가 프레임보다 커진다»**를 써야 겨우 덮이지만 길게 버티지 못한다.
(3) 현재 채택본(1차 `fs-enter.webp`)은 덮임 1.4초·연속 동작·정지 0%라 커튼으로는 더 낫다. **교체하지 않는다.** 장전 가시성은 다음에 시도한다면
클립이 아니라 **컷 앞에 이어 붙일 별도 합성 한 토막(실린더 클로즈업)**으로 푸는 쪽이 낫다(생성기 한 편에 두 목표를 맡기지 않는다).

### 3-3. 컷 구간과 스왑 오프셋

**스왑 오프셋 = 컷 시작으로부터 화면이 완전 불투명이 되는 시각.** 커튼은 그 시각에 화면을 바꾼다.
모든 구간은 프레임을 직접 열어 배경 노출이 없음을 확인하고 정했다.

| 전환 | 소스 mp4 | 컷 | 길이 | 스왑 오프셋 | 커버 유지 |
|---|---|---|---:|---:|---:|
| `sheriff-sixgun` 진입 | `trans/sixgun-enter.mp4` | 07.70 → 10.70 | 3.00s | **+1.60s** | 1.40s |
| `sheriff-sixgun` 복귀 | `trans/sixgun-exit.mp4` | 09.55 → 12.55 | 3.00s | **+0.00s** | 0.50s |
| `fruit-fiesta` 진입 | `trans/v2/fruit-enter.mp4` | 02.60 → 05.60 | 3.00s | **+2.25s** | 0.75s |
| `fruit-fiesta` 복귀 | `trans/v2/fruit-exit.mp4` | 가변속 (아래) | 3.00s | **+0.00s** | 0.70s |
| `royal-diamond-777` 진입 | `trans/v2/royal-exit.mp4` | **08.30 → 11.00** + 끝 정지 0.30s + 끝 0.5s 디졸브 (3-6, 2026-11-26 재편집) | 3.00s | **+2.50s** | 0.50s |
| `royal-diamond-777` 복귀 | `trans/v2/royal-exit.mp4` | 가변속 (아래) | 3.00s | **+0.00s** | 0.60s |
| `shiba-shrine` 진입 | `trans/v2/shiba-exit.mp4` | 05.20 → 08.20 | 3.00s | **+2.51s** | 0.49s |
| `shiba-shrine` 복귀 | `trans/v2/shiba-exit.mp4` | 가변속 (아래) | 3.00s | **+0.00s** | 0.50s |

**가변속 컷.** fruit / royal 복귀는 «걷히는 데» 5초 넘게 걸려 3초 등속으로는 절반만 걷힌 채 끝난다.
프레임 애니메이션이라 재타이밍이 공짜이므로, **덮인 머리는 등속으로 두고 걷히는 꼬리만 압축**했다.

| 전환 | 앞 구간(등속) | 뒤 구간(압축) | 합 |
|---|---|---|---:|
| `fruit-fiesta` 복귀 | 0.00–0.70 @1.0x | 0.70–5.50 @2.087x | 3.00s |
| `royal-diamond-777` 복귀 | 0.00–0.60 @1.0x | 0.60–5.10 @1.875x | 3.00s |
| `shiba-shrine` 복귀 | 7.60–8.20 @1.0x | 8.96–11.00 @0.82x | 3.00s (`-t 3.00`으로 정확히 절단) |

ffmpeg로는 이렇게 만든다:

```sh
ffmpeg -i src.mp4 -an -filter_complex \
"[0:v]trim=0:0.7,setpts=PTS-STARTPTS[a];\
 [0:v]trim=0.7:5.5,setpts=(PTS-STARTPTS)/2.087[b];\
 [a][b]concat=n=2:v=1:a=0,fps=20,scale=360:640:flags=lanczos[v]" -map "[v]" \
  -c:v libwebp_anim -quality 75 -compression_level 6 -loop 1 out.webp
```

### 3-4. 남은 흠

- `royal-diamond-777` 복귀는 끝에서도 화면 가장자리 약 25%에 은빛 쐐기가 남는다.
  살롱이 중앙에 프로시니엄처럼 열리는 그림이라 «가려진» 느낌은 아니지만 완전히 비지는 않는다.
- `fruit-fiesta` 복귀도 마지막 프레임 좌하단에 금빛 드레이프가 약 20% 남는다.
- `sheriff-sixgun` 진입은 3-2의 이유로 장전 동작이 컷 밖이다(2026-11-26 재발주 2편도 못 풀었다, 3-2-1).
- 1차·2차 모든 클립에서 **손·문자는 한 번도 나오지 않았다.** 사람은 2차 sixgun 실패작에서만 나왔다.

### 3-5. shiba 재컷 — 단색 정지 구간 제거

첫 컷(진입 05.95→08.95 / 복귀 07.60→10.60)은 커버 구간이 각각 1.30s·1.35s였는데,
**그 구간이 통째로 평면 주홍 단색 정지 화면**이라 신사 전환이 아니라 로딩 화면으로 읽혔다(R11).

소스 `v2/shiba-exit.mp4` 전체를 24fps로 훑어 «덮여 있으면서 동시에 움직이는» 구간을 찾았다.
`move`는 직전 프레임 대비 평균 절대차다.

| 구간 | 내용 | flat(공간 표준편차) | move |
|---|---|---:|---:|
| 5.00–6.50 | 참배로 | 28.6 | 0.1~0.2 |
| 6.58–7.71 | **문이 다가옴** | 28.5 → 10.2 | 0.6 → **10.7** |
| 7.71–8.96 | 평면 주홍 | **0.8** | **<0.1** |
| 8.96–10.10 | **문이 물러나며 드러남** | 4.9 → 28.5 | 1.7 → **8.0** |
| 10.17–10.67 | 참배로 정착 | 28.5 | 0.2~0.4 |
| 10.75–11.46 | 두 번째 접근 | 28.9 → 8.1 | 0.5 → 12.4 |
| 11.46–13.0 | 평면 주홍 | 1.0 | <0.6 |

**«덮이면서 움직이는» 구간은 존재하지 않는다.** 두 클립 전 구간에서 덮인 프레임은 예외 없이
`flat<2, move<0.1`이다 — 굵은 외곽선·평면 채색이라 장막이 화면을 채우면 구조적으로 단색이 된다.
다른 구간을 고르는 해법(비용 0)은 **수치로 배제됐다.**

그래서 가변속으로 정지 구간만 도려냈다. 이음매(8.20 / 8.96)가 **둘 다 같은 평면 주홍**이라
잘라 붙인 자리가 보이지 않는다 — 이 소재의 단점이 여기서는 이점이 된다.

| | 재컷 전 | 재컷 후 |
|---|---|---|
| 진입 | 05.95→08.95, 단색 1.30s | **05.20→08.20, 단색 0.49s** |
| 복귀 | 07.60→10.60, 단색 1.35s | **7.60–8.20 @1x + 8.96–11.00 @0.82x, 단색 0.50s** |
| 최대 프레임 지속 (16fps/q60) | 875ms | 진입 312ms / 복귀 375ms |
| 최대 프레임 지속 (20fps/q75) | 600ms | 진입 300ms / 복귀 150ms |
| 팩 합계 (16fps/q60) | 584 KiB | 877 KiB |

용량이 293 KiB 늘었다. **움직임이 실제로 늘어서 늘어난 것이므로 되돌리지 않는다.**
877 KiB는 목표선(1.2 MiB) 안이다.

남은 정지는 진입 312ms(스왑 이후의 꼬리)와 복귀 375ms(스왑을 덮어야 하는 머리)뿐이고,
**둘 다 기능상 필요한 자리**다 — 복귀 머리가 교체 시점을 덮지 못하면 교체가 노출된다.
(복귀는 `opaqueMs: 0`이라 교체가 첫 프레임에 일어나므로 지금은 여유가 충분하다.)

### 3-6. royal 진입 재편집 — 이음매 제거 (2026-11-26, 비용 0)

**증상.** 진입 클립(08.60→11.60)은 `check:clips`를 통과하는데 눈으로 보면 덮인 구간에서 한 번 깜빡였다.
소스 `royal-exit.mp4`(13.04초, 24fps)를 장면 전환 탐지(`select='gt(scene,0.08)'`)로 훑으면 이음매가
**11.04초 한 곳뿐**이고(프레임 간 평균 절대차 41.3, 그 밖의 프레임은 대부분 12 이하), 옛 컷이 그 이음매를 가로질렀다.
선명한 선버스트(10.83~11.00) → 흐릿한 회색 판(11.04~11.17) → 다시 선명한 선버스트(11.25~12.3)로 넘어가는 컷이다.

**소스를 24fps로 재 본 값**(`dark%` = 어두운 픽셀 비율, 중앙 40x40의 어두운 픽셀 수 = 가운데 구멍).

| 구간(초) | 내용 | 중앙 구멍 | 비고 |
|---|---|---:|---|
| 7.50–8.25 | 정지한 라운지 | 1,403 | 움직임 0.1~0.3 |
| 8.25–10.20 | 쐐기가 닫힌다 | 1,402 | `dark%` 63 → 7 |
| 10.25–10.75 | 구멍이 줄어든다 | 1,400 → 22 | |
| **10.83–11.00** | **선명한 선버스트로 완전히 덮임, 거의 정지** | **0** | 움직임 0.1~0.3 |
| **11.04** | **이음매** | 0 | **프레임 간 차 41.3** |
| 11.04–11.17 | 흐릿한 회색 판 | 0 | |

이음매 앞에서 구멍 없이 덮인 깨끗한 구간은 10.83~11.00의 **0.2초뿐**이다. 이음매를 넘기는 컷은 쓸 수 없고,
10.83 이전은 구멍이 아직 열려 있다.

**새 컷.** 비용 0 재편집이다(SeeDance 재생성 안 함).

| 단계 | 원본 | 길이 |
|---|---|---:|
| 쐐기가 닫힌다 | 08.30 → 11.00, **등속** | 2.70s |
| 끝 프레임 붙들기 | 11.00 프레임 복제 | 0.30s |
| 끝 디졸브 | 마지막 8프레임(0.50s)이 복귀 클립의 첫 프레임(흐린 판)으로 섞인다 | (위에 겹침) |

- 시작을 8.30으로 당긴 이유: 08.00까지는 라운지가 정지해 있어 첫 0.5초가 «멈춘 방»이다(`move` 0.1~0.3).
  쐐기가 막 보이기 시작하는 8.30부터 잡았다(소스 `dark%`가 8.25에서 내려가기 시작한다). 게임 화면에서 이 클립 머리로의 컷은 재생 쪽 몫이다(아래).
- 이음매(11.0417) 앞 11.00에서 끊었으므로 **이음매 프레임이 한 장도 들어가지 않는다.**
- 디졸브 목표가 «복귀 클립의 첫 프레임»(소스 0.00 프레임, 같은 블러)이라 진입의 끝 프레임이 복귀의 첫 프레임과 같은 판이 된다.
  끝 프레임이 선버스트 판 대신 부드러운 회색 판이라 배너 구간과 마지막 420ms 페이드에서 화면이 덜 시끄럽다(배너 글씨 대비는 따로 확인하지 못했다).
  디졸브는 끝 프레임 하나가 정확히 목표가 되도록 `offset 2.4375 / duration 0.5`로 걸었다(`offset`+`duration` = 마지막 프레임 시각 2.9375).
- `opaqueMs`: 가운데 구멍이 닫히는 10.80 → 컷 시작 기준 **2.50s**로 올렸다(옛 값 2400). `durationMs`는 실측 ANMF 합 **3000**.
  클립 자체가 알파 없는 불투명 그림이라 교체 순간이 비치는 일은 없고, 이 값은 «교체·배너 시작 시각»이다.
  클립은 `loop=1`이라 3.0초 뒤에도 마지막 프레임(흐린 판)이 배너 동안 그대로 남는다.

```sh
# 복귀 첫 프레임과 같은 처리의 정지 화면
ffmpeg -ss 0 -i royal-exit.mp4 -frames:v 1 -vf "gblur=sigma=2.0,scale=360:640:flags=lanczos" still-plate.png
# 진입
ffmpeg -ss 8.30 -t 2.70 -i royal-exit.mp4 -loop 1 -framerate 16 -t 0.5625 -i still-plate.png -an -filter_complex \
 "[0:v]gblur=sigma=2.0,fps=16,scale=360:640:flags=lanczos,format=yuv420p,setsar=1,tpad=stop_mode=clone:stop_duration=0.3[a];\
  [1:v]fps=16,format=yuv420p,setsar=1[b];\
  [a][b]xfade=transition=fade:duration=0.5:offset=2.4375,trim=duration=3.0[v]" -map "[v]" \
 -c:v libwebp_anim -quality 60 -compression_level 6 -loop 1 fs-enter.webp
```

**블러 시그마 2.0.** 4-4의 규칙(`gblur`로 고주파를 먼저 없앤다)을 그대로 쓰되 1.2 → 2.0으로 올렸다.
새 컷은 선명한 선버스트가 옛 컷보다 많아 시그마 1.2에서 **726 KiB**가 됐고(팩 합계 1,270 KiB로 1.2 MiB 선 초과),
1.6은 664 KiB, 2.0은 **608 KiB**다. 블러는 1080 폭 원본에 걸리므로 2.0은 360 폭 출력에서 약 0.67px이다 —
1.2와 2.0을 같은 프레임 4장(쐐기 열림 → 닫힘 → 구멍 → 흐린 판)으로 나란히 놓고 봤을 때 눈으로 구분되지 않았다.
출고 규격(16fps / q60)은 그대로다.

**결과.**

| | 옛 진입 | 새 진입 |
|---|---|---|
| 컷 | 08.60 → 11.60 (이음매 11.04 포함) | 08.30 → 11.00 + 정지 0.30s + 디졸브 |
| 프레임 | 47(최대 125ms) | 48(최대 63ms) |
| 인접 프레임 평균 절대차 최댓값 | **37.3**(이음매 프레임) | **16.6**(쐐기 움직임, 이음매 없음) |
| 마지막 프레임 ↔ 복귀 첫 프레임 평균 절대차 | 19.4 | **3.5** |
| `opaqueMs` / `durationMs` | 2400 / 2999 | **2500 / 3000** |
| 용량 | 463 KiB | **609 KiB** |
| 팩 합계(진입+복귀 544) | 1,007 KiB | **1,153 KiB**(1.2 MiB 안) |
| `check:clips` | 통과 | 통과(정지 0.0%) |

용량이 146 KiB 늘었다. 라운지·쐐기·구멍이 실제로 움직이는 구간이 늘어서이고(옛 컷에 든 이음매 뒤 흐린 판 구간이 잘 압축됐던 것으로 보인다 — 추정),
복귀를 건드리지 않았고 합계가 1.2 MiB 안이라 되돌리지 않는다.

**눈 확인.** 개발 스택에서 프리스핀 진입을 390폭 1회·430폭 2회 돌려 0.15~6초를 0.3초 간격으로 찍었다.
라운지 → 쐐기 닫힘 → 선버스트로 덮임 → 흐린 판 → 420ms 페이드로 프리스핀 화면, 한 방향으로만 흐르고 깜빡임은 없다.
복귀 클립(손대지 않음)도 같은 스택에서 한 번 더 돌려 흐린 판 → 쐐기가 열리며 시안 파편 → 라운지 → 기본 화면으로 이어짐을 확인했다.

**남은 것(이 컷의 몫이 아님).**
- 진입 클립 머리는 게임 화면 → 라운지로 바로 컷이다. 5-2는 «머리에 120~200ms 페이드인»을 요구하지만 `clipAlphaAt`은 시작부터 1을 준다(공용·렌더러 몫).
- 복귀 클립은 흐린 회색 판에서 시작해 게임 화면 위로 갑자기 나타난다(소스 0.00 프레임이 원래 그렇다). 진입의 끝과 같은 판이 되도록 맞췄지만 둘이 이어서 재생되는 일은 없다.
- 복귀 끝 쐐기 25~30%(3-4)는 그대로다.

---

## 4. 산출물 — 애니메이션 WebP 실측

규격: **360x640, 20fps, quality 75, compression_level 6, `loop 1`(1회 재생), 3.00초.**
`loop 0`은 무한 반복이라 커튼에 쓰면 안 된다.

경로: 스크래치패드 `trans/webp/*.webp`

| 전환 | WebP 실측 | 프레임 | 같은 컷 webm 540x960@24 crf34 | crf40 | WebP/webm(crf34) |
|---|---:|---:|---:|---:|---:|
| `sheriff-sixgun` 진입 | **305 KB** | 60 | 181 KB | 126 KB | 1.72배 |
| `sheriff-sixgun` 복귀 | **323 KB** | 60 | 76 KB | 50 KB | 4.37배 |
| `fruit-fiesta` 진입 | **1,005 KB** | 60 | 409 KB | 276 KB | 2.51배 |
| `fruit-fiesta` 복귀 | **655 KB** | 60 | 568 KB | 389 KB | 1.18배 |
| `royal-diamond-777` 진입 | **1,217 KB** | 60 | 687 KB | 480 KB | 1.81배 |
| `royal-diamond-777` 복귀 | **1,316 KB** | 60 | 1,029 KB | 723 KB | 1.28배 |
| `shiba-shrine` 진입 | **459 KB** | 41 | 174 KB | 121 KB | 2.71배 |
| `shiba-shrine` 복귀 | **435 KB** | 40 | 179 KB | 121 KB | 2.49배 |
| **합계 (8편)** | **5,716 KiB (5.58 MiB)** | | 3,225 KiB | 2,232 KiB | 1.77배 |

shiba가 41/40프레임인 것은 libwebp가 **동일한 연속 프레임을 병합**했기 때문이다.
셀셰이딩이라 정지 구간이 실제로 같은 픽셀이고, 총 길이는 3.00초로 동일하다. 이득이지 결함이 아니다.

### 4-1. 예상보다 무겁다 — 그리고 포맷 탓이 아니다

파일럿 때 제시한 «360x640@20이면 약 311KB»는 **6연발 클립 기준의 값이었다.**
연기와 매끈한 금속 그라데이션은 잘 압축되지만, royal의 플래티넘 방사형 홈결이나
fruit의 과즙 기포는 화면 전체가 고주파라 **어떤 포맷으로도 비싸다.**

증거: royal 복귀는 **webm(VP9)으로도 crf34에서 1,029 KB**다. WebP 대비 1.28배 차이밖에 안 난다.
즉 이 두 편이 무거운 것은 «프레임 애니메이션이라서»가 아니라 **콘텐츠가 무거워서**다.

### 4-2. 품질/fps 스윕 (무거운 편 기준, 360x640)

| | q75 | q60 | q50 |
|---|---:|---:|---:|
| royal 진입 @20fps | 1,217 KB | 1,026 KB | 919 KB |
| royal 진입 @16fps | 986 KB | 829 KB | 744 KB |
| royal 진입 @12fps | 747 KB | 630 KB | 569 KB |
| fruit 진입 @20fps | 1,005 KB | 792 KB | 688 KB |
| fruit 진입 @16fps | 829 KB | 661 KB | 578 KB |
| fruit 진입 @12fps | 662 KB | 543 KB | 481 KB |
| shiba 복귀 @20fps | 434 KB | 358 KB | 320 KB |
| shiba 복귀 @16fps | 352 KB | 291 KB | 260 KB |
| shiba 복귀 @12fps | 268 KB | 222 KB | 200 KB |

해상도를 320x568로 내려도 royal 진입은 q75에서 1,038 KB로 **거의 줄지 않는다**(-15%).
줄이는 지렛대는 해상도가 아니라 **fps와 quality**다.

### 4-3. 출고 규격 — 16fps / q60 (확정)

추정이 아니라 실제로 같은 컷으로 한 벌 더 뽑아 쟀다. 경로는 `trans/webp-16q60/`.

| 전환 | 20fps q75 | 16fps q60 | 감소 |
|---|---:|---:|---:|
| `sheriff-sixgun` 진입 | 305 KiB | **211 KiB** | -31% |
| `sheriff-sixgun` 복귀 | 323 KiB | **210 KiB** | -35% |
| `fruit-fiesta` 진입 | 1,005 KiB | **661 KiB** | -34% |
| `fruit-fiesta` 복귀 | 655 KiB | **432 KiB** | -34% |
| `royal-diamond-777` 진입 | 1,217 KiB | **829 KiB** | -32% |
| `royal-diamond-777` 복귀 | 1,316 KiB | **895 KiB** | -32% |
| `shiba-shrine` 진입 | 459 KiB | **293 KiB** | -36% |
| `shiba-shrine` 복귀 | 435 KiB | **291 KiB** | -33% |
| **합계** | **5,716 KiB** | **3,822 KiB (3.73 MiB)** | **-33%** |

전면을 덮는 커튼이라 16fps에서도 판독성 손실은 거의 없다. 3초짜리 전면 워시에서
20fps와 16fps를 구분할 사람은 없고, 다운로드가 곧 대기 시간인 미니앱에서 -33%는 크다.
**출고 규격을 16fps / q60으로 확정했다.** 팩마다 규격을 달리하지 않는다 —
나중에 누가 재생성할 때 "이 팩만 왜 다르지"를 만들지 않기 위해서다.

### 4-4. royal 추가 경량화 — 소스 블러

16fps/q60으로도 royal이 팩 합계 1,723 KiB로 가장 무거웠다. 전환은 **프리스핀 진입 그 순간**에
필요한 자산이라 팩 합계가 곧 그 순간의 대기 시간이다. 1.2 MiB 아래로 내리는 길을 실측했다.

| 구성 | 진입 | 복귀 | 팩 합계 |
|---|---:|---:|---:|
| 16fps q60 (블러 없음) | 829 KiB | 894 KiB | 1,723 KiB |
| 16fps q50 | 743 KiB | 805 KiB | 1,549 KiB |
| 16fps q40 | 661 KiB | 721 KiB | 1,383 KiB |
| 14fps q50 | 658 KiB | 710 KiB | 1,368 KiB |
| 12fps q50 | 569 KiB | 606 KiB | 1,176 KiB |
| 16fps q60 + gblur 0.4 | 726 KiB | 801 KiB | 1,528 KiB |
| 16fps q60 + gblur 0.8 | 563 KiB | 649 KiB | 1,212 KiB |
| 16fps q50 + gblur 0.8 | 507 KiB | 587 KiB | 1,094 KiB |
| **16fps q60 + gblur 1.2** | **463 KiB** | **544 KiB** | **1,007 KiB** |
| 16fps q50 + gblur 1.2 | 417 KiB | 493 KiB | 910 KiB |

**블러가 압도적으로 효율이 좋다.** q60→q50은 -10%인데 gblur 0.8 하나가 -30%다 — **3배**다.
원인이 «플래티넘 방사형 홈결의 고주파»라는 진단과 정확히 맞는다.

> **다음 팩에서 다시 계산하지 말 것 — 고주파 소재는 quality를 깎지 말고 소스를 흐린다.**
> quality를 내리면 화면 전체에 블록 노이즈가 고르게 퍼지지만, 소스 블러는 **비싼 성분만**
> 골라 없앤다. 전면 커튼은 디테일을 읽히게 할 목적이 아니므로 잃는 것도 없다.
> 판단 기준: 팩 합계가 1.2 MiB를 넘고 화면이 고주파(미세한 홈결·기포·격자)면 `gblur=sigma=0.8~1.2`부터.

**채택: 16fps / q60 / gblur sigma 1.2 → 1,007 KiB.**
fps와 quality는 다른 팩과 **동일하게 유지**하고, royal만 **소스 단계 전처리**를 하나 더 먹인다.
재생 규격이 갈라지지 않으므로 4-3의 «한 규격» 원칙을 깨지 않는다.

블러 손상은 프레임을 열어 확인했다. 홈결이 가장 촘촘한 구간(복귀 1.60s)에서 sigma 1.2는
방사 쐐기·다이아몬드 패싯·검은 중심을 **전부 그대로 유지**하고 미세한 스파이크만 부드러워진다.
360x640으로 3초 동안 전면을 덮는 용도에서 알아볼 수 있는 차이가 아니다.
12fps로 내리는 안(1,176 KiB)은 규격이 갈라지므로 버렸다.

### 4-5. 출고본 최종 용량

`games/<pack>/theme/transitions/` 에 실제로 들어간 파일이다.

| 팩 | `fs-enter.webp` | `fs-exit.webp` | 팩 합계 |
|---|---:|---:|---:|
| `sheriff-sixgun` | 211 KiB | 210 KiB | **420 KiB** |
| `fruit-fiesta` | 661 KiB | 432 KiB | **1,092 KiB** |
| `royal-diamond-777` | 609 KiB (2026-11-26 재편집, 블러 2.0, 3-6) | 544 KiB | **1,153 KiB** |
| `shiba-shrine` | 431 KiB | 446 KiB | **877 KiB** |
| **전체** | | | **3,544 KiB (3.46 MiB)** (royal 재편집 반영) |

팩 합계는 전부 1.2 MiB 아래다. 가장 무거운 팩은 이제 royal이 아니라 **fruit(1,093 KiB)**인데,
목표선 안이라 손대지 않았다. shiba는 3-5의 재컷으로 584 → 877 KiB가 됐다(움직임이 늘어난 대가).

### 4-6. VRAM

애니메이션 WebP는 브라우저가 프레임을 순차 디코딩하므로 상주 텍스처는 **한 프레임분**이다.
360x640 RGBA8 = **0.88 MiB**. 파일럿 때 계산한 스프라이트 아틀라스 59~166 MiB와 비교하면
두 자릿수 차이이고, 이것이 아틀라스를 버린 이유다.

---

## 5. 재생 계약 (렌더러 소유자에게)

애셋 쪽에서 보장하는 것과, 재생 쪽이 지켜야 하는 것을 여기에 못 박는다.
**재생 경로 변경 자체는 이 문서의 범위가 아니다** — 아래는 «이 파일을 이렇게 재생하면 맞다»는 계약이다.

### 5-1. 파일

| 항목 | 값 |
|---|---|
| 경로 | `games/<pack>/theme/transitions/fs-enter.webp`, `.../fs-exit.webp` |
| `theme.json` | `transitions.freeSpinsEnter` / `freeSpinsExit`, 각각 `TransitionClip` 객체 |
| 포맷 | 애니메이션 WebP (RIFF `VP8X` + `ANIM` + `ANMF`) |
| 해상도 | 360 x 640 (9:16) |
| 프레임레이트 | 16fps (동일 프레임 병합으로 실제 `ANMF` 수는 그보다 적을 수 있다) |
| 길이 | 3.00초 — **실측은 2999ms(8편 중 7편) / 3000ms(sheriff 복귀)**. libwebp가 프레임 지속시간을 정수 ms로 저장해 16fps의 62.5ms가 62/63으로 갈리며 생기는 1ms 오차다. 검사 허용 오차 ±40ms 안이라 문제없다 |
| 반복 | **`loop = 1` (1회 재생 후 마지막 프레임에서 정지)** |
| 알파 | 없음. 전부 불투명 커튼이다 |

**배선 완료 상태** (4개 팩 전부, `pack:check` 오류 0):

```json
"transitions": {
  "freeSpinsEnter": { "src": "transitions/fs-enter.webp", "opaqueMs": 1600, "durationMs": 2999 },
  "freeSpinsExit":  { "src": "transitions/fs-exit.webp",  "opaqueMs": 0,    "durationMs": 3000 }
}
```

`durationMs`는 렌더러 소유자가 나중에 추가한 필드다 — 5-2의 «3.00초 뒤 오버레이 제거»를
렌더러가 상수로 갖지 않고 클립에서 읽게 하려는 것이고, `opaqueMs`와 같은 이유로 옳다.
**값은 반올림하지 말 것.** 8편 전부 선언값이 실측 ANMF 합계와 정확히 일치하는지 확인했다.

`opaqueMs`를 `src`와 한 덩어리로 둔 것은 렌더러 소유자의 설계이고 옳다 —
오프셋은 그 클립의 그림에서 나온 값이라 따로 두면 클립 교체 시 옛 값이 남는다.

**복귀는 `opaqueMs: 0`이다.** 복귀 클립은 첫 프레임부터 이미 불투명이라 실제 값이 0이다.
처음 배선할 때는 스키마가 양수만 받아 키를 생략했지만, 이후 렌더러 소유자가
`z.number().min(0)`으로 열고 «0은 첫 프레임부터 덮는다는 정상값»이라고 코드에 명시했다
(`theme.ts:189`, `transitionClip.ts`의 `transitionClipSkipReason`). 그래서 지금은 **0을 명시한다.**

`MODE_CLIP_MIN_COVERED_MS`(420ms) 미달 판정은 `opaqueMs`가 아니라 **`bannerMs`**로 하므로
`opaqueMs: 0`이 클립을 접히게 만들지 않는다 — 확인했다.

참고로 복귀 커버 유지 시간은 sheriff 0.50s / fruit 0.70s / royal 0.60s / shiba 0.50s다.
`opaqueMs`를 0이 아닌 값으로 바꾼다면 이 시간 안에 들어와야 한다 — 그 뒤로는 클립이 제 그림으로
걷히기 시작하므로, 교체가 그 다음에 일어나면 노출된다.

> **이전 판의 경고를 철회한다.** 여기 «`MODE_COVER_OUT_MS`를 500ms 이상으로 올리면 sheriff와
> shiba 복귀부터 깨진다»고 적어 두었는데, **그 전제가 사라졌다.**
>
> 당시에는 단색 커튼이 3단 곡선(`coverAlphaAt`) 하나로 전환 전체를 관장해서, 커튼이 걷히는
> 시각이 곧 화면이 드러나는 시각이었다. 지금은 렌더러가 커튼과 클립의 불투명도를 갈랐다
> (`transition.ts`의 `curtainAlphaAt`) — **클립이 떠 있으면 커튼은 교체 시점부터
> `CURTAIN_RETIRE_MS`(160ms)에 걸쳐 물러나고**, 그 뒤로 화면을 가리는 일은 클립이 한다.
> 커튼이 남아 있으면 오히려 클립이 제 그림으로 걷혀도 뒤에서 검정만 드러난다.
>
> **지금 `MODE_COVER_OUT_MS`를 올릴 때 볼 것은 클립이 걸린 팩이 아니다.** 걷기 구간은
> `clipCoverOutMs`가 `max(MODE_COVER_OUT_MS × scale, clipDurationMs − coverInMs − bannerMs)`로
> 정하는데, 우리 클립이 2999ms라 클립 쪽 항이 언제나 이긴다. 그래서 이 상수를 올려도
> 4팩은 아무 변화가 없고, **클립이 없는 팩(classic-777)의 전환만 그만큼 길어진다.**

기존 `games/sheriff-sixgun/theme/transitions/fs-enter.webm`은 삭제했고,
새 `.webp` 8개는 전부 `git add -f`로 추적에 넣었다(`pack:check`가 추적 여부를 본다).

### 5-2. 재생

| 항목 | 요구 |
|---|---|
| 재생 요소 | **DOM `<img>`.** 캔버스/Pixi 텍스처로 그리면 **첫 프레임만 나온다** |
| 배치 | 릴 위를 완전히 덮는 전면 오버레이. `object-fit: cover`, 화면 꽉 채움 |
| 시작 | 표시 즉시 재생. `<img>`는 DOM에 붙는 순간 처음부터 재생된다 |
| 재시작 | 같은 `<img>`를 재사용하면 두 번째부터 재생되지 않는다. **`src`를 다시 세팅하거나 노드를 새로 만든다** |
| 화면 교체 시점 | 아래 스왑 오프셋. 진입은 오프셋에서 프리스핀 상태로 갈아끼우고, 복귀는 오프셋(=0)에서 일반 상태로 되돌린다 |
| 페이드 | **머리에 120~200ms 페이드인을 넣는다.** 모든 클립이 0프레임부터 불투명이라 페이드가 없으면 하드컷으로 튄다 |
| 종료 | 클립 길이(`durationMs`)만큼 지난 뒤 오버레이 제거. 마지막 프레임에서 정지하므로 남겨 두면 화면을 계속 가린다. **길이만 늘리는 것으로는 부족하다** — 커튼이 알파 1로 남아 있으면 클립이 제 그림으로 걷혀도 뒤에서 검정만 드러난다(`curtainAlphaAt`가 이걸 푼다) |

#### 실기 검증 상태

| 항목 | 결과 |
|---|---|
| 클립이 실제로 애니메이션되는가 | **확인** — `<img>`로 붙여 프레임이 넘어가는 것을 캡처 비교로 확인 |
| 재생 길이 | **확인** — 진입 3.03초 · 이탈 3.03초 (`durationMs` 2999~3000ms + 오버헤드) |
| 2회차 되감기 | **확인** — 프리스핀을 두 번 연속 돌려 두 번째도 도입부에서 시작함을 확인. `src` 재설정이 동작한다 |
| 커버 구간 불투명 | **확인** — sheriff 총구 안쪽, royal 플래티넘 판, fruit 과즙 모두 뒤가 안 비침 |

> ⚠ **위 검증은 전부 Chromium 기준이다. 텔레그램 iOS(WKWebView)에서는 확인되지 않았다.**
> 배포 전 체크리스트에 올릴 것. 특히 확인해야 할 것은 두 가지다 —
> **애니메이션 WebP가 `<img>`에서 자동 재생되는가**, 그리고 **`src` 재설정으로 되감기는가**.
> 이 둘이 깨지면 커튼이 첫 프레임 정지 화면이 되어 전환 전체가 무의미해진다.

### 5-3. 스왑 오프셋 (컷 시작 기준)

| 팩 | 진입 `opaqueMs` | 복귀 |
|---|---:|---:|
| `sheriff-sixgun` | **1600** | **0** |
| `fruit-fiesta` | **2250** | **0** |
| `royal-diamond-777` | **2500** (2026-11-26 재편집, 3-6) | **0** |
| `shiba-shrine` | **1812** (2026-11-26 재컷, 2-4) | **0** |

복귀는 전부 **첫 프레임부터 완전 불투명**이라 실제 오프셋이 0이다.
진입은 커튼이 닫히는 데 걸리는 시간이 팩마다 다르다 — **하드코딩하지 말 것.**
클립을 다시 뽑으면 값이 바뀌고, 그래서 `theme.json`의 `src` 옆에 붙어 있어야 한다.

진입 `opaqueMs`가 곧 덮기 구간 길이가 되므로 1.6~2.4초로 길다. 이는 «클립이 덮기 구간의
길이를 정한다»는 설계 그대로다 — 클립이 그만큼 걸려야 화면을 가리기 때문이지 여유가 아니다.

### 5-4. 대안 경로에 대한 판단

`ImageDecoder`로 프레임을 뽑아 Pixi 텍스처로 올리는 길도 있다. 애셋 관점의 판단만 적는다:

- `ImageDecoder`는 iOS Safari 지원이 늦어 텔레그램 WebView에서 안전하지 않다.
- 그 길을 가면 60프레임을 개별 텍스처로 들고 있게 되어 **VRAM 이점(0.88 MiB)이 사라진다**
  — 360x640 RGBA 60장 = 52.7 MiB. 아틀라스를 버린 이유가 그대로 되살아난다.
- 커튼은 릴 위를 전부 덮는 연출이라 Pixi 씬 그래프 안에 있을 이유가 약하다.

따라서 **DOM 오버레이 + `<img>`**가 애셋 쪽에서 볼 때 유일하게 이점이 유지되는 경로다.

---

## 6. 발주 현황 및 잔여

| 팩 | 진입 | 복귀 | 지출 |
|---|---|---|---|
| `sheriff-sixgun` | 완료 (1차) | 완료 (1차) | $1.86 |
| `fruit-fiesta` | 완료 (2차) | 완료 (2차) | $1.86 |
| `royal-diamond-777` | 완료 (2차 `royal-exit` 후반) | 완료 (2차 `royal-exit` 전반) | $1.86 (1편 폐기) |
| `shiba-shrine` | 완료 (2026-11-26 재발주 `exit-v1` 중반, 2-4) | 완료 (`exit-v1` 앞반) | $1.86 (1편 폐기) + 재발주 $1.86 (`enter-v1`은 미채택) |
| `hanbok-night-market` | 완료 (1차, 2-8) | 완료 (1차, 2-8) | $1.86 |
| `astral-clocktower` | 완료 (2026-11-26, `ac-v1` 전반) | 완료 (`ac-v1` 후반) | $0.93 (1편, 양방향 1편 전략) |
| `classic-777` | 불필요 | 불필요 | 프리스핀 없음 |

누적 지출 **$8.37** (9편). 그중 6편이 8개 전환에 쓰였고 3편은 폐기했다.
sheriff v3와 v4 4팩은 발주를 시도했으나 계정 한도로 **거부되어 과금되지 않았다**(3-2, 8항).

**전환 연출 작업은 여기서 완료로 본다.** 8편 전부 배선·검증이 끝났고,
남은 것은 아래 두 가지 조건부 항목뿐이다.

| 항목 | 비용 | 상태 |
|---|---:|---|
| `fruit-fiesta` 재발주 | $0.93 | **조건부 대기.** 사용자가 이 편만 «너무 현실적»이라고 짚었다. 프롬프트는 8-2에 준비돼 있고, **사용자 확인 뒤에만** 발주한다 |
| ~~`astral-clocktower` 양방향~~ | $0.93 | **완료(2026-11-26).** R10대로 1편으로 양방향, 채택 결과는 2-5. 재발주는 하지 않았다 |
| ~~4팩 스타일 통일 재발주~~ | ~~$3.72~~ | **취소.** 사용자가 «심볼같은건 실사여도 갠찮음»이라고 밝혀 전제가 사라졌다(8항) |
| ~~`sheriff-sixgun` 진입 v3~~ | ~~$0.93~~ | **취소.** 위 재발주에 흡수될 예정이었다. 현재 1차 클립으로 충분하다 |
| `sheriff-sixgun` 진입 재발주 2편 (2026-11-26 검수) | $1.86 | **종료.** 한도가 풀려 v3를 실제로 돌렸으나 2편 모두 불합격(덮임 부족 / 장전 소실), 1차 클립 유지. 위 지출은 이 때문에 $8.37 → $10.23. 3-2-1 참조 |
| `shiba-shrine` 진입·복귀 재발주 2편 (2026-11-26 검수) | $1.86 | **종료·채택.** 평면 2D 셀 그림으로 나왔고 `exit-v1` 한 편에서 양방향을 잘라 배선(진입 `opaqueMs` 1812). `enter-v1`은 덮임이 0.2초라 미채택. 재시도 한도 미사용. 2-4 «재발주 결과» 참조. 위 누적에는 아직 더하지 않았다($1.86 추가) |

## 7. 현재 배선 상태

| 팩 | `fs-enter.webp` | `fs-exit.webp` | `theme.json` | `pack:check` |
|---|---|---|---|---|
| `sheriff-sixgun` | 있음 (1차 클립) | 있음 | 배선됨 | OK |
| `fruit-fiesta` | 있음 | 있음 | 배선됨 | OK |
| `royal-diamond-777` | 있음 (2026-11-26 재편집, 블러 2.0) | 있음 (블러 1.2) | 배선됨 (진입 `opaqueMs` 2500, 복귀 0) | OK |
| `shiba-shrine` | 있음 (2026-11-26 재발주 컷, 블러 없음) | 있음 (재발주 컷, 블러 없음) | 배선됨 (진입 `opaqueMs` 1812, 복귀 0) | OK |
| `hanbok-night-market` | 있음 | 있음 | 배선됨 | OK |
| `astral-clocktower` | 있음 (블러 0.9) | 있음 (블러 0.9) | 배선됨 (진입 `opaqueMs` 2400, 복귀 0) | OK |
| `classic-777` | 해당 없음 | 해당 없음 | — | OK |

`pnpm pack:check` 결과(당시): 팩 6개, 오류 0, 경고 28(전부 astral-clocktower의 아트 미착수 경고). 2026-11-26 기준 astral 아트는 완성돼 astral 경고는 0이다.

원본 13초 mp4는 스크래치패드에 남아 있다. **결과 URL은 24시간 뒤 만료되므로,
컷 구간이나 fps를 다시 잡으려면 이 원본이 유일한 수단이다** — 세션이 끝나기 전에
장기 보관이 필요하면 지금 옮겨야 한다.


---

## 8. v4 프롬프트 — 작성 완료, 미검증, **보류**

> **상태: 사용자 판단으로 보류.** 발주하지 않는다.
>
> 이 프롬프트들은 «전환이 팩의 아트 지침을 어긴 실사 영상이다»(R12)를 결함으로 보고
> 4팩 전면 재발주를 준비한 것이다. 그런데 사용자가 **「심볼같은건 실사여도 갠찮음」**이라고
> 밝혔다 — **실사라는 것 자체는 결함이 아니었다.** 스타일 통일은 우리 쪽 기준이었지
> 사용자의 요구가 아니었으므로, 지금 있는 8편을 그대로 쓴다.
>
> 지우지 않고 남기는 이유는 나중에 스타일 통일이 필요해지면 그대로 쓸 수 있기 때문이다.
> **작성은 끝났고 R1·R3·R4·R8~R13 자동 점검도 통과했지만, 생성 결과를 본 적이 없다**
> (두 차례 발주 모두 계정 한도로 실패했다 — 아래 기록 참조). 검증되지 않은 프롬프트다.

### 열어 둔 것 — fruit 한 편 ($0.93)

사용자가 앞서 짚은 것은 **「프루트 영상 봤는데 너무 현실적인 거 같은데」**였다.
지금 발언과 나란히 놓으면 **«실사 일반은 괜찮지만 fruit 그 클립은 걸렸다»**로 읽는 것이 자연스럽다 —
그 편만 실제 오렌지 주스 사진에 가깝고 나머지는 «실사풍 게임 소품»에 머문다.

그래서 **fruit 한 편만은 다시 뽑을 여지를 남긴다.** 쓸 프롬프트는 아래 8-2에 그대로 있고,
`no real fruit` · `no food photography` · `candy-glass boiled-sweet ornament`가 정확히 그 문제를
겨냥한다. **사용자 확인 전까지는 발주하지 않는다.**

### 원래 계획 (보류됨)

- **R10대로 팩당 한 편**(한 클립에서 진입·복귀를 잘라냄) → 4 x $0.93 = **$3.72**
- shiba 단색 정지 재작업과 sheriff 진입 v3 재발주가 **여기 흡수**될 예정이었다.
  shiba는 결국 **재발주 없이 가변속 재컷으로 해결**했다(3-5).
- 기존 8편은 **지우지 않는다.**
- 원본 mp4는 `D:\park\transition-sources\`에 보관돼 있다(저장소 밖).

> **발주 시도 기록 (2026-09-07).** 아래 프롬프트로 4편을 **두 차례** 발주했고,
> 두 번 모두 네 편 전부가 생성 단계에서 `SetLimitExceeded`로 실패했다
> (1차 15:35, 2차 15:50, 계정 `2125907570`). 여덟 번 다 `task_id`는 정상 발급됐고
> 5~10초 뒤 폴링에서 한도 오류가 떴다. **과금은 발생하지 않았다.**
> 프롬프트 자체는 아직 검증되지 않은 상태이고, 한도가 실제로 풀린 뒤 그대로 다시 돌리면 된다:
>
> ```sh
> sh <scratchpad>/run-order-v4.sh
> ```
>
> 두 번으로 «일시적 창»이 아니라 **지속적인 계정 게이트**임이 확인됐다. 더 두드리지 않는다.

**언젠가 받게 되면 판정 순서** — 한 편이라도 걸리면 그 편만 기존 것을 유지하고 나머지는 교체한다.
전부 아니면 전무가 아니다.

1. **주제가 맞는가** — 요구한 물건이 실제로 나왔는가 (v2가 여기서 죽었다)
2. **스타일이 그 팩의 세계인가** — 심볼 옆에 뒀을 때 계열이 같은가 (이 재발주의 이유)
3. **완전 불투명 구간이 있는가** — 배경 노출 0
4. **덮인 동안 움직이는가** — `pnpm --filter @tgslot/theme-gen check:clips`
5. 사람·손·글자가 한 프레임도 없는가

royal은 이번에도 방사형 홈결과 시안 패싯을 요구하므로 **또 무거울 것이다.**
4-4의 `gblur=sigma=0.8~1.2`를 처음부터 예상하고 간다.

프롬프트 원본: `<scratchpad>/prompts-v4.mjs`. 네 편 모두 R1·R3·R4·R8·R9·R10·R11·R12·R13
자동 점검을 통과했다(hex 3개 이상, `no photorealistic photography` 포함,
`3/4 top-down` 미포함, 안 겪은 금지어 7종 미포함). 편당 1,858~1,937자다.

### 8-1. sheriff-sixgun — 보안관의 6연발

**1. `stylePrefix`에서 무엇을 가져오고 무엇을 뺐나.** 가져온 것: `stylized 3D toy-like render`, 사막 황토 `#c9884a` · 밤하늘 네이비 `#1b2437` · 세이지 `#7e9a72` · 석양 주황 `#e2683a`, 낡은 가죽·황동 리벳·풍화된 나무, 낮은 석양 림라이트, `no photorealistic photography`. 뺀 것: `3/4 top-down`(전환은 고정 전면), `silhouette readable at small size`(전면 커튼에 실루엣 없음), `baked-in drop shadow`(격리 심볼용), `cropped edges`(전환은 일부러 가장자리를 채움).

**2. 무엇이 화면을 덮고, 그것이 이 슬롯의 어떤 동작인가.** **총열 구멍(bore)이 화면을 덮는다.** 실린더가 세게 닫히고 그 관성이 그대로 총구를 렌즈로 돌린다 — 장전과 덮임이 한 동작이다.

**3. 덮인 동안 무엇이 계속 움직이나 (R11).** 총열 안쪽 **나선 강선이 천천히 돌고**, 황동 림라이트가 링을 따라 이동하며, 황토빛 먼지가 어둠을 가로지른다.

```
Vertical full-screen game transition effect, stylized 3D toy-like game render, warm dusty studio lighting with a low sunset rim light, desert ochre (#c9884a) and night-sky navy (#1b2437) color story with sage green (#7e9a72) and sunset orange (#e2683a) accents, worn leather, brushed brass rivets and weathered wood grain materials, premium mobile casino game art. A single ornate toy-render revolver floats centered against a dim dusk desert sky, its cylinder swung open with six glossy brass cartridges seated in the chambers. One continuous motion repeats: the cylinder slams shut and the very same swing carries the revolver around to face the lens, the muzzle rushing straight at the viewer until the dark bore mouth swallows the entire frame, completely opaque edge to edge and corner to corner, gunmetal darkness ringed by a thin band of brass and sunset-orange light. While the frame is fully covered the surface never stops moving: the spiral rifling grooves inside the bore turn slowly, the brass rim light travels around the ring, and ochre dust motes drift across the darkness — the covered frame is never a flat still color. Then the revolver falls back into view and the cylinder swings open again with fresh brass. The cylinder closing and the muzzle turning toward the lens are one single motion, never separate steps. Not photorealistic: no photorealistic photography, no real-world photography, no film-camera look — this is a stylized toy-like game render. Each full cycle lasts about three seconds and repeats about four times across the clip, so the clip goes clear, covered, clear again, over and over. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan. No text, no letters, no numbers, no logos, no watermark, no signature, no people, no faces, no hands, no arms, no fingers, no animals.
```

### 8-2. fruit-fiesta — 프루트 피에스타

**1. `stylePrefix`에서 무엇을 가져오고 무엇을 뺐나.** 가져온 것: `glossy 3D toy-like render`, 딥 네이비 `#0b1220` · 브라스 골드 `#d8a94a` · 시안 젬 `#4fc3d9`, 광택 유리와 브러시드 메탈, 따뜻한 브라스 림라이트, `no photorealistic photography`. 여기에 **`no real fruit`, `no real fruit juice`, `no food photography`를 추가**했다 — 실사 오렌지 주스가 나온 게 바로 이 팩이라 «과일»이라는 단어 자체가 실사를 부른다. 뺀 것: sheriff와 동일 + `multiple duplicate objects`(과일 기둥이 의도된 다수다).

**2. 무엇이 화면을 덮고, 그것이 이 슬롯의 어떤 동작인가.** **터진 과일의 호박빛 시럽이 화면을 덮는다.** 선두 과일이 렌즈에 눌러붙는 그 동작으로 터진다 — 솟아오름과 덮임이 한 동작이다.

**3. 덮인 동안 무엇이 계속 움직이나 (R11).** 시럽이 표면 위를 **계속 흐르고 소용돌이치며**, 시안 젬 반짝임이 그 속을 떠다니고 브라스 하이라이트가 미끄러진다.

```
Vertical full-screen game transition effect, glossy 3D toy-like game render, soft studio lighting with a warm brass rim light, deep navy (#0b1220) and brass gold (#d8a94a) color story with cyan gem (#4fc3d9) accents, polished glass and brushed metal materials, premium mobile casino game art. A tall column of glossy candy-glass toy fruit — cherries, lemons, oranges, plums, grapes and watermelon wedges, each moulded like a translucent boiled-sweet ornament with a small brass stem — stands centered against a deep navy terrace with warm brass lantern bokeh. One continuous motion repeats: the column surges upward and packs tighter as it rises, and the leading fruit presses flat against the lens and bursts in that very same motion, its thick glossy amber-gold syrup glazing across the glass until the whole frame is completely opaque edge to edge and corner to corner in a solid warm golden sheet. While the frame is fully covered the syrup never stops moving: it keeps flowing and swirling across the surface, cyan gem sparkles drift through it and brass-gold highlights slide over it — the covered frame is never a flat still color. Then the glaze runs down and off and the navy terrace shows through before the next surge. The fruit rising and the frame being covered are one single motion, never separate steps. Not photorealistic: no photorealistic photography, no real fruit, no real fruit juice, no food photography, no film-camera look — everything is a glossy toy-like game render of candy-glass ornaments. Each full cycle lasts about three seconds and repeats about four times across the clip, so the clip goes clear, covered, clear again, over and over. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan. No text, no letters, no numbers, no logos, no watermark, no signature, no people, no faces, no hands, no arms, no fingers, no animals.
```

### 8-3. royal-diamond-777 — 로열 다이아몬드 777

**1. `stylePrefix`에서 무엇을 가져오고 무엇을 뺐나.** 가져온 것: `glossy 3D toy-like render`, 검은 벨벳 `#0d0c14` · 플래티넘 `#d7dbe0` · 다이아몬드 시안 `#8fe3f2` · 벨벳 레드 `#8f1f2e`, 아르데코 선버스트 플루팅과 스텝 셰브런, 차가운 플래티넘 림라이트, `no photorealistic photography`. 뺀 것: sheriff와 동일 + `multiple duplicate objects`(타일 격자).

**2. 무엇이 화면을 덮고, 그것이 이 슬롯의 어떤 동작인가.** **플래티넘 선버스트 판이 화면을 덮는다.** 타일이 대각선 파도로 넘어가고 그 파도가 지나가면서 화면을 닫는다 — 뒤집힘과 덮임이 한 동작이다.

**3. 덮인 동안 무엇이 계속 움직이나 (R11).** 판의 **방사형 홈결이 천천히 회전하고**, 다이아몬드 시안 패싯 광채가 훑고 지나가며, 벨벳 레드 보석 하이라이트가 셰브런을 따라 맥동한다.

```
Vertical full-screen game transition effect, glossy 3D toy-like game render, soft studio lighting with a cool platinum rim light, deep black velvet (#0d0c14) and polished platinum (#d7dbe0) color story with diamond-cyan (#8fe3f2) facet accents and deep velvet-red (#8f1f2e) jewel accents, art-deco geometric motifs of sunburst fluting and stepped chevrons, polished glass and brushed platinum materials, premium mobile casino game art. A full-screen grid of black velvet art-deco tiles fills the view, each tile a small toy-render panel with a platinum chevron inlay. One continuous motion repeats: the tiles flip over in a single fast diagonal wave with crisp mechanical snaps, each turning to a polished platinum sunburst face, and the wave closes the frame as it travels so that the instant the last tile lands the whole frame is completely opaque edge to edge and corner to corner as one seamless platinum sunburst plate. While the frame is fully covered the plate never stops moving: its radial fluting rotates slowly, a diamond-cyan facet glint sweeps across it and deep velvet-red jewel highlights pulse along the chevrons — the covered frame is never a flat still color. Then the tiles flip back to black velvet and the wave begins again. The tiles turning and the frame being covered are one single motion, never separate steps. Not photorealistic: no photorealistic photography, no real-world metal photography, no film-camera look — this is a glossy toy-like game render. Each full cycle lasts about three seconds and repeats about four times across the clip, so the clip goes clear, covered, clear again, over and over. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan. No text, no letters, no numbers, no logos, no watermark, no signature, no people, no faces, no hands, no arms, no fingers, no animals.
```

### 8-4. shiba-shrine — 시바 신사

**1. `stylePrefix`에서 무엇을 가져오고 무엇을 뺐나.** 가져온 것: `kawaii chibi cel-shaded`, **굵은 검은 외곽선 + 그라데이션 없는 플랫 채색 + 무광 도자 유약 질감**, 사쿠라 핑크 `#f6c0cf` · 밤 인디고 `#243252` · 토리이 주홍 `#e05a3c` · 민트 `#8fd6c0`, `no photorealistic photography`에 **`no 3D realism`을 추가**(이 팩만 2D 셀셰이딩이라 3D로 새면 안 된다). 뺀 것: `3/4 top-down`, `rounded soft silhouette readable at small size`, `baked-in drop shadow`, `cropped edges`. `no dogs`는 유지 — 마스코트 시바를 t2v에 맡기면 심볼 아트와 다른 개가 나온다.

**2. 무엇이 화면을 덮고, 그것이 이 슬롯의 어떤 동작인가.** **주홍 토리이의 상인방이 화면을 덮는다.** 문이 앞으로 밀려와 렌즈를 지나간다 — 전진과 덮임이 한 동작이다.

**3. 덮인 동안 무엇이 계속 움직이나 (R11).** **벚꽃잎이 주홍 옻칠 위를 대각선으로 계속 흘러가고**, 민트 하이라이트가 도자 유약을 따라 미끄러지며, 들보의 굵은 검은 외곽선 이음매가 지나간다. **이 팩이 R11의 이유다** — 평면 채색이라 지시가 없으면 반드시 단색으로 덮고 멈춘다.

```
Vertical full-screen game transition effect, kawaii chibi cel-shaded game art, thick clean black outlines and flat cel-shaded color fills with a matte ceramic-glaze texture, soft even pastel lighting with a gentle vermilion rim light, sakura pink (#f6c0cf) and night indigo (#243252) color story with torii vermilion (#e05a3c) and mint (#8fd6c0) accents, premium mobile casino game art. A huge vermilion lacquered torii gate with thick black outlines stands at the head of a shrine courtyard under a night-indigo sky, sakura petals drifting around its pillars. One continuous motion repeats: the torii rushes forward toward the viewer with a storm of flat sakura-pink petals sweeping up around it, and the gate keeps coming until its broad lacquered crossbeam passes the lens and fills the entire frame, completely opaque edge to edge and corner to corner in flat vermilion lacquer. While the frame is fully covered the surface never stops moving: sakura petals keep streaming diagonally across the vermilion lacquer, a mint-green highlight slides along the ceramic glaze, and thick black outline seams of the beam drift past — the covered frame is never a flat still color and never freezes. Then the gate falls back into the courtyard and the petals thin out before the next approach. The gate rushing forward and the frame being covered are one single motion, never separate steps. Not photorealistic: no photorealistic photography, no real-world photography, no 3D realism, no film-camera look — this is flat cel-shaded anime-style game art. Each full cycle lasts about three seconds and repeats about four times across the clip, so the clip goes clear, covered, clear again, over and over. Only the objects move; the camera never moves. Camera locked, no camera movement, no zoom, no pan. No text, no letters, no numbers, no logos, no watermark, no signature, no people, no faces, no hands, no arms, no fingers, no animals. No dogs.
```
