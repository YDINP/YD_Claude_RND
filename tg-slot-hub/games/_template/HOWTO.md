# 새 게임 만들기

이 폴더는 **스캐폴드**다. 코드는 한 줄도 없고 데이터만 있다.
`games/_template`은 `_`로 시작하므로 로비와 RTP 게이트 테스트에서 자동으로 제외된다.

## 게임 팩 계약 (파일 5개)

새 게임은 코드가 아니라 **데이터 팩**이다. 팩 하나는 정확히 이 다섯 파일로 이루어진다.
계약의 단일 출처는 `packages/game-sdk/src/pack.ts`의 `PACK_FILES`이고, 스키마도 전부 거기서 나온다.

| 파일 | 필수 | 성격 | 스키마 | 누가 쓰는가 |
|---|---|---|---|---|
| `manifest.json` | 필수 | 원본 | `GameManifestSchema` (`@tgslot/game-sdk`) | 로비 카드·게임 목록 API |
| `math.json` | 필수 | 원본 | `GameMathSchema` (`@tgslot/slot-engine`) | 스핀 엔진의 유일한 입력 |
| `art/prompts.json` | 선택 | 원본 | `PromptsFileSchema` (`@tgslot/game-sdk`) | `theme-gen`이 이미지를 만든다 |
| `art/fx.json` | 선택 | 원본 | `ArtFxFileSchema` (`@tgslot/game-sdk`) | 심볼 승리 연출 |
| `theme/theme.json` | 선택 | **생성물** | `ThemeFileSchema` (`@tgslot/game-sdk`) | 렌더러가 아트를 찾는다 |

- **원본은 손으로 쓰고, 생성물은 절대 손으로 고치지 않는다.** `theme.json`의 `symbols`/`frame`/
  `frameLayout`/`background`/`sheets`/`fx`는 `theme-gen`이 매번 다시 채운다. 특히 `fx`는
  `art/fx.json`이 유일한 출처다 — `theme.json`에서 직접 고치면 다음 생성 때 덮어써진다.
- 그 밖의 키(`palette`, `version`, `sfx`, `transitions` 등)는 `theme.json`에 손으로 쓴다.
  `theme-gen`의 병합은 **모르는 키를 중첩 단계까지 보존**하므로 재생성해도 살아남는다.
- `theme.json` 안의 경로는 전부 **`theme.json` 파일 기준 상대 경로**다
  (`symbols/wild.webp` → `games/<id>/theme/symbols/wild.webp`).
  `manifest.json`의 `thumbnail`만 `/games/<id>/thumb.webp` 형태의 URL이다.
- 모드 전환 영상은 `transitions.freeSpinsEnter` / `transitions.freeSpinsExit`에 쓴다. 둘 다 선택이고
  값은 다른 자산과 같은 theme 기준 상대 경로다(예: `transitions/fs-enter.webm`). 없는 방향은 키를
  빼면 단색 커튼으로 남는다. `theme-gen`이 만들지 않는 손으로 쓰는 필드이므로 **파일을 `git add`
  하는 것을 잊지 말 것** — `pack:check`가 오류로 막는다.

## 1. 스캐폴드 생성

```bash
pnpm new:game <새-게임-id>
```

`games/_template`에서 `games/<새-게임-id>`를 만든다. 게임 id는 kebab-case로 짓는다.
폴더 이름 = `manifest.json`의 `id` = `math.json`의 `id` = `art/prompts.json`의 `game`.
만들어지는 파일은 `manifest.json`, `math.json`, `art/prompts.json`, `art/fx.json`,
`README.md`, `CHECKLIST.md`다. 단계별 할 일은 `CHECKLIST.md`에 있다.

## 2. 메타데이터 확인

`pnpm new:game`이 id와 표시 이름은 이미 채웠다. 나머지를 게임에 맞게 고친다.

`manifest.json`:

| 필드 | 바꿀 내용 |
|---|---|
| `id` | 폴더 이름과 동일하게 (스캐폴드가 채움) |
| `name` | `en` 필수, `ko` 선택 — 스캐폴드는 id에서 만든 임시 제목을 넣는다 |
| `version` | `1.0.0`부터 |
| `thumbnail` | `/games/<id>/thumb.webp` — 실제 파일은 팩 폴더의 `thumb.webp`다 (`theme-gen`이 만든다) |
| `status` | 개발 중에는 `hidden`, 출시할 때 `live` |
| `reels`, `rows`, `lines` | `math.json`과 반드시 일치 (`lines`는 ways 게임이면 `ways.base`) |
| `betLevels` | `math.json`과 동일한 배열 |
| `rtpTarget`, `volatility` | `math.json`과 동일 |
| `sort` | 로비 정렬 순서 |

`manifest.json`과 `math.json`이 어긋나면 `pnpm pack:check`가 오류로 막는다.

## 3. 심볼·스트립·페이테이블 교체

- `symbols`: 심볼 목록. `wild: true`는 대체 심볼, `scatter: true`는 라인과 무관한 심볼.
- **빈칸(blank)은 선택이고 기본값은 없음이다.** 이 템플릿과 `classic-777`은 빈칸을 쓰지 않는다.
  릴의 모든 칸이 실제 심볼이라 화면이 비어 보이지 않는다.
  페이테이블에 없는 심볼을 넣으면 그 심볼은 지급하지 않는 채움용이 된다. 넣고 싶으면 넣어도 되지만
  기본 설계는 **저배당 심볼이 채움 역할을 대신 맡는 것**이다.
- `strips`: 릴별 심볼 배열. **배당이 높은 심볼일수록 개수를 적게** 넣는다.
  RTP는 심볼 개수만으로 정해지고, 적중률과 최대 배수는 배열 순서에도 영향을 받는다.
  같은 심볼이 인접하지 않게 고르게 흩뿌리면 화면이 자연스럽다.
  다만 한 심볼이 스트립의 절반을 넘으면 인접은 물리적으로 피할 수 없고, 그래도 괜찮다.

  빈칸 없이 만들 때는 **비대칭 배치**가 핵심이다. 3개 연속에만 배당이 있는 심볼은
  세 릴의 확률을 곱하므로, 한 릴에 몰아넣고 나머지 두 릴에서 줄이면 값싸게 채울 수 있다.
  `classic-777`이 릴 1을 벨로, 릴 2·3을 체리로 채운 것이 그 예다.

  릴이 5개면 지렛대가 하나 더 생긴다. **3개 이상 연속은 릴 1~3에서만 판정되므로
  적중률은 앞 세 릴이 정하고, 릴 4·5는 적중률을 건드리지 않고 배당 크기만 키운다.**
  적중률이 넘칠 때는 앞쪽을, RTP가 모자랄 때는 뒤쪽을 손보면 된다.
  `fruit-fiesta`가 릴 4·5를 세븐·벨로 채운 것이 그 예다.
- `groups`: "아무 BAR"처럼 종류가 섞여도 주는 배당. 멤버는 선언된 심볼이어야 하고
  그룹 id는 심볼 id와 겹칠 수 없다. 페이테이블에 그룹 id를 심볼과 같은 자리에 쓴다.
  같은 심볼로 이어지면 그 심볼 배당이 더 크게 잡아 두는 것이 보통이다.
- `paylines`: 라인 1개 = 릴별 행 인덱스. `[1,1,1]`은 가운데 가로줄.
- `paytable`: `심볼 -> { 매치 개수: 배수 }`. 배수의 기준은 **총 베팅액이 아니라 라인당 베팅액**이다.
  왼쪽에서 오른쪽으로 연속 매치만 인정하고, 긴 연속이 이긴다.
- `betLevels`: 모든 값이 `paylines.length`로 나누어떨어져야 한다.
- `scatter`: 선택. 스캐터 배당과 프리스핀을 붙일 때만 쓴다. 아래 절 참고.

스키마가 막는 것들(어기면 `parseGameMath`가 바로 실패한다):

| 규칙 | 이유 |
|---|---|
| 짧은 연속이 긴 연속보다 많이 주면 안 된다 | "긴 연속이 이긴다" 규칙이 성립하지 않는다 |
| 그룹 id가 심볼 id와 겹치면 안 된다 | 페이테이블에서 어느 쪽인지 구분할 수 없다 |
| 그룹 멤버는 선언된 심볼이고 스트립에 있어야 한다 | 나올 수 없는 배당은 오타다 |
| 모든 `betLevels`에서 `라인당 베팅액 x 배수`가 정수여야 한다 | 반올림이 RTP를 위로 밀어 올린다 |
| 스캐터는 페이테이블을 가질 수 없다 | 스캐터는 라인이 아니라 화면 전체로 센다 |
| 페이테이블 심볼은 최소 한 릴의 스트립에 있어야 한다 | 나올 수 없는 배당은 오타다 |
| 같은 페이라인을 두 번 넣을 수 없다 | 같은 줄에 두 번 지급된다 |

## 3-b. 스캐터와 프리스핀 붙이기 (선택)

이 템플릿은 `classic-777`을 복사한 것이라 스캐터가 없다. 붙이려면 두 가지를 한다.

1. 심볼 목록에 `scatter: true`인 심볼을 넣고 스트립에도 배치한다.
   스캐터는 페이테이블(`paytable`)에 넣을 수 없다. 라인이 아니라 화면 전체로 세기 때문이다.
2. `scatter` 블록을 추가한다.

```json
"scatter": {
  "symbol": "star",
  "pays": { "3": 2, "4": 10, "5": 50 },
  "freeSpins": { "trigger": 3, "count": 10, "multiplier": 2, "retrigger": true }
}
```

| 필드 | 뜻 |
|---|---|
| `pays` | `{ 개수: 배수 }`. 기준이 라인당 베팅액이 아니라 **총 베팅액**이다 |
| `trigger` | 프리스핀이 열리는 최소 개수 |
| `count` | 한 번 열릴 때 주는 스핀 수 |
| `multiplier` | 프리스핀 동안 승리에 곱하는 배수 |
| `retrigger` | 프리스핀 중 다시 트리거되면 `count`회를 더 줄지 |

주의할 점:

- 스캐터는 화면에 보이는 칸을 **전부** 센다. 한 릴에 2개가 보이면 2개다.
  스트립에서 스캐터를 서로 붙여 두면 진입 확률이 확 올라간다.
- 와일드는 스캐터를 절대 대체하지 않는다.
- `retrigger`가 켜져 있으면 `count x P(트리거) < 1`이어야 기대 횟수가 수렴한다.
  넘으면 엔진이 예외를 던지고 게이트 테스트도 막는다.
- 프리스핀은 RTP를 통째로 밀어 올린다. 기여분은 아래 식으로 나온다.

```
RTP = base + p * (count / (1 - count * p)) * multiplier * base     (base = 라인 + 스캐터)
```

`count 10`, `multiplier 2`, `p 0.017`이면 기본 RTP의 약 1.42배가 된다.
스캐터를 한 개 더 넣기 전에 이 식으로 어림해 보는 편이 시뮬레이션을 돌리는 것보다 빠르다.

## 3-c. 뮤테이션과 ways (선택)

**뮤테이션**은 정지 그리드를 평가 직전에 바꾸는 파이프라인이다. 선언 순서대로 적용된다.

```json
"mutations": [
  { "type": "mystery", "symbol": "mystery", "weights": { "seven": 4, "cherry": 26 } },
  { "type": "expandWild", "symbol": "wild", "reels": [1, 2, 3], "minCount": 1 },
  { "type": "upgrade", "from": "plum", "to": "bell", "minCount": 6, "chance": 0.08 },
  { "type": "randomWild", "symbol": "wild", "chance": 0.2, "countWeights": { "1": 60, "2": 30 } }
]
```

| type | 하는 일 | RTP 산출 |
|---|---|---|
| `mystery` | 화면의 미스터리 칸 전부를 뽑은 심볼 하나로 교체 | 해석적 (공개로 조건부화) |
| `expandWild` | 릴에 와일드가 있으면 그 릴 전체를 와일드로 | 몬테카를로 |
| `upgrade` | 심볼 A가 N개 이상이면 B로 승급 | chance 없으면 해석적 |
| `randomWild` | 확률로 와일드 k개 낙하 | 몬테카를로 |

주의할 점:

- 미스터리 심볼에는 페이테이블을 두지 않는다. 공개 풀에 와일드·스캐터를 넣을 수 없다.
  미스터리 심볼 자체도 와일드나 스캐터일 수 없다.
- **두 뮤테이션이 같은 심볼을 읽을 수 없다.** 읽기 대상은 `mystery.symbol`·`expandWild.symbol`·
  `upgrade.from`이다. 앞 단계가 그 심볼을 지워 버려 뒤 단계가 죽은 규칙이 되기 때문이다.
  `randomWild.symbol`은 놓는 심볼이라 여기 해당하지 않는다(뿌린 뒤 확장하는 조합은 정상).
- 확장·드롭은 기본적으로 스캐터 칸을 비켜 간다. `coverScatter: true`로 바꿀 수 있지만
  프리스핀 트리거 확률이 흔들리므로 권하지 않는다.
- `expandWild.onlyIfWin: true`면 **지급을 늘리지 못한 확장은 되돌린다.** 확장이 항상 일어나는
  전제로 튜닝했다면 이 값을 켜는 순간 RTP가 내려가므로, 값을 정하고 나서 스트립을 맞춘다.
- 가중치(`weights`·`countWeights`)는 **정수로 쓴다.** 정수면 추첨 확률이 해석식과 정확히 같고,
  소수를 쓰면 100만 눈금 반올림 때문에 항목당 1e-6까지 어긋난다.
- RNG 소비 순서는 `릴 정지 -> 뮤테이션(선언 순서)`으로 고정이다. 순서를 바꾸면 재현이 깨진다.

**ways**는 페이라인 없는 페이 모델이다.

```json
"payModel": "ways",
"ways": { "base": 243, "bothWays": false, "betDivisor": 25 }
```

- `base`는 `rows^reels`와 같아야 한다 (5x3 = 243, 5x4 = 1024).
- `paylines`는 비운다. 대신 `betLevels`가 `betDivisor`로 나누어떨어져야 한다.
- 배수 기준은 **웨이당 베팅액 = 총 베팅액 / betDivisor**다. 총 베팅액이 아니다.
- `bothWays`를 켜면 오른쪽에서도 읽는다. **지급 칸이 전 릴을 덮을 때만** 한 번으로 친다.
  5연속이어도 배당이 3개까지뿐이면 좌우의 지급 칸이 달라 각각 지급된다.
- 지급 칸이 전부 와일드인 줄은 **후보 하나로만** 지급한다(길이별 최고 배수 = 챔피언).
  그러지 않으면 와일드 3개짜리 줄이 심볼 종류 수만큼 중복 지급된다.
  배당표를 짤 때 와일드 자체의 배수를 최고가 심볼보다 낮게 두면 와일드 줄은 최고가 심볼로 쳐 준다.

## 3-d. 적중률을 누르는 법 (빈칸 없는 모델)

빈칸을 안 쓰면 모든 칸이 배당 후보가 되어 적중률이 폭발한다. 지금까지 쓴 장치는 두 가지다.

1. **채움 심볼 교차 배치.** 릴 1·2를 채우는 심볼 A와 릴 3을 채우는 심볼 B를 따로 둔다.
   A는 릴 3에 거의 없고 B는 릴 1·2에 거의 없어 서로의 3연속을 막는다.
2. **앞뒤 릴 역할 분리.** 3연속 이상은 릴 1~3에서만 판정되므로 적중률은 앞 세 릴이 정하고,
   릴 4·5는 적중률을 건드리지 않고 4·5연속 배당만 키운다.
   적중률이 넘치면 앞쪽을, RTP가 모자라면 뒤쪽을 손본다.

2연속 배당이 있는 심볼(체리·부츠 등)은 릴 1의 개수가 적중률을 그대로 결정한다. 1~3개로 둔다.

## 3-e. 튜닝 순서 (몬테카를로 모델)

몬테카를로 RTP는 20만 스핀에서 표준오차가 0.7%p나 되어 목표 오차(0.3%p)보다 크다.
그 잡음을 좇아 스트립을 탐색하면 잡음에 과적합된다. 순서를 나눈다.

1. **적중률만 보고 스트립을 맞춘다.** 적중률은 같은 스핀 수에서 표준오차가 0.07%p로 충분히 정확하다.
2. **페이테이블 배율로 RTP를 맞춘다.** RTP는 배율에 대해 선형이다.
   단, 100 미만 값은 정수 단위로 반올림할 것. 5의 배수로 맞추면 저배당에서 상대 오차가 10%씩 튄다.
3. **500만~2500만 스핀으로 확정한다.** ci95 반폭 0.2%p를 맞추려면 보통 2000만 스핀이 필요하다.
4. **다른 시드로 교차 확인한다.** 튜닝 시드에 과적합되지 않았는지 본다.

## 4. 시뮬레이터로 튜닝

```bash
pnpm --filter @tgslot/rtp-sim sim <새-게임-id> --exact
```

릴 3개짜리 모델은 조합이 적어 **전수 조사**로 정답이 나온다.
릴 5개는 조합이 수억 개라 전수 조사를 못 하지만, 엔진이 **해석적으로 정확한 값**을 대신 낸다.
어느 쪽인지는 리포트의 `RTP 계산` 줄에 찍힌다. 목표는 다음과 같다.

| 지표 | 기준 |
|---|---|
| RTP | `rtpTarget` ± 0.5%p |
| 적중률 | 3릴 35~45%, 5릴 25~35% (빈칸 없는 모델 기준) |
| 최대 배수 | 총 베팅액의 100배 이상 |

`rtpTarget`은 **기본 게임만의** 목표다. 허브 잭팟이 얹어 주는 몫은 엔진이 재지 않으므로
manifest의 `jackpotContribution`에 따로 적고, 둘을 더한 값을 `rtpTotalTarget`에 쓴다.
페이테이블로 체감 RTP를 맞추면 허브 기여분만큼 하우스 엣지가 사라진다.
현재 허브 잭팟 기여는 1.5%이므로 체감 96%를 원하면 `rtpTarget`은 0.945다.

매치 개수 1(체리 1개 같은 배당)은 적중률을 크게 밀어 올린다.
릴 1에서만 판정되므로 **릴 1의 그 심볼 개수가 적중률을 그대로 결정한다.**
빈칸 없이 35~45%를 맞추려면 릴 1에 1~2개만 두는 것이 보통이다.

RTP를 올리려면 배당을 올리거나 고배당 심볼 개수를 늘린다.
적중률만 올리고 싶으면 2연속 배당이 있는 저배당 심볼(체리 등) 개수를 늘린다.
큰 모델은 `--exact` 없이 몬테카를로로 측정한다.

## 5. 아트와 연출

```bash
pnpm --filter @tgslot/theme-gen gen games/<새-게임-id> --dry-run   # 계획만 확인
pnpm --filter @tgslot/theme-gen gen games/<새-게임-id>             # 실제 생성
```

- `art/prompts.json`의 `kind: "symbol"` asset `id`는 `math.json`의 심볼 id와 정확히 일치해야 하고,
  `kind: "sheet"` asset의 `symbol`도 마찬가지다.
- 프레임은 **정사각 캔버스 + 와이드 창**이다(`docs/ART_DIRECTION.md` v3/v4). 템플릿의 `frame`
  프롬프트에 규격이 그대로 적혀 있으니 문장을 지우지 말고 컨셉만 바꾼다.
- 심볼 승리 연출은 `art/fx.json`에 쓴다. 자산이 이미 다 있어도 `gen`을 다시 돌리면
  fx만 `theme.json`에 다시 병합된다(이미지 생성은 skip된다).
- 자세한 옵션은 `tools/theme-gen/README.md` 참고.

## 6. 게이트 확인

```bash
pnpm pack:check                 # 전체 팩 계약 검사
pnpm pack:check <새-게임-id>     # 이 팩만
pnpm --filter @tgslot/rtp-sim test
```

`pack:check`는 팩마다 다음을 본다. 오류가 하나라도 있으면 exit 1이라 CI 게이트로 쓸 수 있다
(경고는 통과시킨다. `--strict`를 주면 경고도 실패로 친다).

**파일이 디스크에 있는 것만으로는 부족하다.** 로비와 렌더러가 받아가는 자산은 전부 git에
들어가 있어야 한다 — untracked 파일을 가리키는 `theme.json`을 커밋하면 배포본에는 그 파일이 없고,
렌더러는 에러 없이 폴백해서(전환 클립이면 단색 커튼) 아무도 모르게 연출만 사라진다.
그래서 추적 여부는 경고가 아니라 **오류**다. `git`을 쓸 수 없는 환경에서는 이 검사만 조용히 건너뛴다.
`.gitignore`가 일부러 빼는 `art/raw/`는 검사 대상이 아니다.

| 검사 | 등급 |
|---|---|
| 스키마 위반 (다섯 파일 전부) | 오류 |
| 폴더 이름 ≠ `manifest.id` / `math.id` / `prompts.game` | 오류 |
| `manifest`와 `math`의 `reels`/`rows`/라인 수/`betLevels`/`rtpTarget`/`volatility` 불일치 | 오류 |
| `theme.json`이 가리키는 파일 없음 (심볼·프레임·배경·시트 아틀라스·전환 클립·효과음) | 오류 |
| 참조된 자산이 **git에 추적되지 않음** (`git add` 안 함) | 오류 |
| `math.json`의 심볼인데 `theme.json`에 이미지가 없음 | 오류 |
| `prompts.json`의 심볼/시트 asset이 `math.json`에 없는 심볼을 가리킴 | 오류 |
| 썸네일 파일 없음 (`prompts.json`이 만들 예정이면 경고) | 오류 |
| `art/fx.json`과 `theme.json`의 `fx`가 어긋남 / 원본이 없음 | 경고 |
| 스키마에 없는 `fx` 필드 (조용히 버려진다) | 경고 |
| `theme.json`에만 있고 `math.json`에 없는 심볼·시트·fx 키 | 경고 |
| 아직 생성되지 않은 asset, 128px 썸네일 없음 | 경고 |
| 아무도 참조하지 않는 고아 파일 (`art/raw/`와 문서는 제외) | 경고 |

`tools/rtp-sim/src/games.test.ts`가 `games/*` 전체를 자동으로 스캔한다.
새 게임을 등록할 필요 없이 폴더만 있으면 검사 대상이 된다. 검사 항목은 다음과 같다.

- `math.json`이 스키마를 통과하는가
- 모든 `betLevels`에서 전수 조사 RTP가 `rtpTarget` ± 0.5%p 안인가
- `manifest.json`과 `math.json`의 `id`, `reels`, `rows`, 라인 수, `betLevels`가 일치하는가

마지막으로 `README.md`에 페이테이블 표와 실측 수치(RTP·적중률·최대 배수)를 적어 둔다.
남은 단계는 `CHECKLIST.md`를 따라간다.
