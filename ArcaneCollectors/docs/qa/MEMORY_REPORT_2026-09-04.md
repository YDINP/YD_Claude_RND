# 메모리 실측 · 수명 감사 보고서 (2026-09-04)

대상: `ArcaneCollectors` / 측정 환경: Chromium(Playwright), 뷰포트 720×1280, dev 서버 `http://localhost:3000`
스모크: `tests/e2e/memory-smoke.mjs` (`npm run test:e2e:memory`)
원시 데이터: `docs/qa/memory-smoke-result.json`

---

## 0. 한 줄 요약

씬이 정의한 `shutdown()` 15개가 **한 번도 호출되지 않고 있었다**. Phaser 는 ES6 클래스 씬의
`shutdown()` 을 자동 호출하지 않는다. 그 결과 씬 순환 1회마다 EventBus 구독이 13건씩 단조
증가했고, 씬 전용 대형 텍스처가 전혀 해제되지 않았다. `main.js` 에서 한 번 배선해 해소했다.

| 지표 (기준선 2회차 → 8회차) | 수정 전 | 수정 후 | 예산 |
|---|---:|---:|---:|
| JS 힙 증가율 | **+11.2%** (23.93→26.60MB) | **+0.7%** (24.35→24.51MB) | ≤15% |
| EventBus 구독 증가 | **+78** (33→124, 13/사이클) | **+0** | 0 |
| 씬 리스너 증가 | +0 | +0 | 0 |
| 텍스처 키 증가 | +0 *(측정 사각지대)* | +6 *(UUID 텍스트 텍스처 churn)* | ≤10 |
| 상주 텍스처 총량 | 160.5MB | **155.9MB** | ≤210MB |
| 활성 트윈 / 타이머 (메인 복귀 시) | 11~12 / 5 | 14 / 5 | ≤24 / ≤12 |
| 표시객체 / Graphics / 이미터 증가 | +0 | +0 | ≤12 |

---

## 1. 근본 원인 — `shutdown()` 미호출

### 확인

Phaser 3 소스(`node_modules/phaser/src/scene/`):

- `SceneManager.bootScene()` 이 직접 부르는 것은 `init` / `preload` / `create` 뿐이다.
- `Systems.shutdown()` 은 `events.emit(Events.SHUTDOWN, ...)` 만 한다 — 씬 인스턴스의
  `shutdown()` 메서드를 부르지 않는다.

브라우저 실측으로도 확인했다. 15개 씬의 `shutdown` 을 래핑한 뒤 메인메뉴→영웅목록→메인메뉴
왕복을 시켰더니 **호출 0건**이었다.

```
defines: [BootScene, LoginScene, PreloadScene, MainMenuScene, GachaScene, HeroListScene,
          HeroDetailScene, StageSelectScene, BattleScene, BattleResultScene, PartyEditScene,
          InventoryScene, TowerScene, QuestScene, SettingsScene]   ← 15개
calls:   []                                                        ← 0건
```

### 파급

`shutdown()` 안에 있던 아래가 전부 죽은 코드였다.

- `time.removeAllEvents()` / `tweens.killAll()` / `input.removeAllListeners()` (15개 씬 공통)
- `MainMenuScene`: `_menusUnlockedOff()`, `_badgeEventsOff()`, `tutorialFlow.destroy()`,
  `particles.destroy()`, `energyBar.destroy()`, `idleBattleView.destroy()`, `idleSystem.saveProgress()`
- `HeroDetailScene`: `_hiresKey`(@2x) · `_fullbodyKey`(전신) · `_chibiKey` 해제
- `GachaScene`: `bannerPanel.destroy()`, `_clearResultOverlay()`
- `HeroListScene`: `cardPool.destroy()`, `heroPopup.destroy()`

### EventBus 누수 추적 (수정 전)

`EventBus.on` 을 래핑해 1사이클 동안 추가된 구독의 스택을 찍었다. **13건 전부 `MainMenuScene.create()`** 에서 나왔고, 셋 다 `shutdown()` 에 해제 코드가 이미 있었다.

| 건수 | 이벤트 | 등록 지점 | 해제 코드 (있었지만 실행 안 됨) |
|---:|---|---|---|
| 11 | `quest_complete`, `quest_reward_claimed`, `quest_progress`, `daily_reset`, `character_added`, `evolve`, `collection:updated`, `collection:completed`, `gacha_complete`, `resource_changed`, `stage_cleared` | `MainMenuScene._subscribeMenuBadgeEvents()` (`MainMenuScene.js:329`) | `this._badgeEventsOff()` |
| 1 | `tutorial:menus_unlocked` | `MainMenuScene.create()` (`MainMenuScene.js:169`) | `this._menusUnlockedOff()` |
| 1 | `tutorial:step_committed` | `TutorialFlow.start()` (`TutorialFlow.js:69`) | `this.tutorialFlow.destroy()` |

### 수정

`src/main.js:22-59` — 기존 DebugManager 배선과 같은 `game.events.once('ready')` 패턴으로
15개 씬을 한 번에 배선했다. 씬 파일 15개를 건드리지 않아 동시 편집과 충돌하지 않는다.

```js
game.events.once('ready', () => {
  game.scene.scenes.forEach(scene => {
    if (typeof scene.shutdown !== 'function') return;
    scene.events.on('shutdown', () => {
      try { scene.shutdown(); }
      catch (e) { console.warn(`[main] ${scene.sys.config.key}.shutdown() 실패:`, e); }
    });
  });
});
```

호출 순서: 이 핸들러는 씬 플러그인(InputPlugin/Clock/TweenManager)과 GameObject 의
SHUTDOWN 구독보다 **먼저** 등록되므로 먼저 실행된다. 앱 레벨 정리 → 프레임워크 표시객체
파기 순으로 진행되며, 이 시점 씬은 이미 `visible=false` 라 중간 렌더가 없다.

**배선 전 15개 `shutdown()` 본문을 모두 감사했다. 공용 텍스처를 해제하는 코드는 한 곳도
없었다** — 회귀 이력(HeroDetail/HeroList/BattleScene)에서 이미 제거돼 있었다.

---

## 2. 텍스처 수명 규칙 (명문화)

### 규칙

| 분류 | 키 규칙 | 정책 |
|---|---|---|
| **상주(공용)** | `hero_<id>` (512 포트레이트), `menu_*`·`icon_*`·`vicon_*`, `frame_*`, `bg_*`, `char_*` | **절대 해제하지 않는다.** PreloadScene/BootScene 소유. 여러 화면이 동시에 참조한다 |
| **전용(대형)** | `hero_<id>@2x`, `fb_hero_XXX`(전신 683×1024), `chibi_<heroId>`, `enemy_art_*` | **로드한 주체가 이탈할 때 해제한다** |
| **임시** | `__portraitfix__*`, `__lazybg__*`, `__meditate__*` | 승격(rename) 또는 즉시 제거로 소멸 |

### 소유권 원칙 (위반이 곧 회귀)

> **"내가 실제로 올린 것만 해제한다."**
> 로드 직전 `textures.exists(key)` 가 이미 `true` 면 그 키는 남의 것이다. 소유권 목록에
> 넣지 않는다. 남의 텍스처를 지우면 그 화면이 플레이스홀더로 떨어지거나 `glTexture` null
> 렌더 예외가 난다 (T-29 회귀 3건의 원인).

### 감사표

| 자산 | 로드 주체 (file:line) | 해제 주체 | 소유권 가드 | 상태 |
|---|---|---|---|---|
| `hero_<id>` 512 | `PreloadScene` ← `HeroAssetLoader.loadImages()` | 없음(의도) | — | 정상(상주) |
| `hero_<id>@2x` | `HeroDetailScene.js:166` | `HeroDetailScene.shutdown()` | 씬 단독 사용 | **정상화됨** (배선 전 미실행) |
| `fb_hero_XXX` 전신 | `HeroDetailScene.js:372,469` | `HeroDetailScene.shutdown()` | `exists()` 선검사 후 claim | **정상화됨** |
| `fb_hero_XXX` 전신 | `HeroInfoPopup.js:_queueFullbody` | `HeroInfoPopup` → 씬 `shutdown` | `_ownedFullbodyKeys` (신규) | **수정함** (§3-2) |
| `fb_hero_XXX` 전신 | `MeditationView.queueSeatArt()` (폴백 경로) | 없음(의도, 공용 취급) | — | 정상 |
| `chibi_<heroId>` | `HeroDetailScene.js:514` | `HeroDetailScene.shutdown()` | `exists()` 선검사 후 claim | 정상 |
| `chibi_<heroId>` | `MeditationView.js:queueSeatArt` | `MeditationView.destroy()` | `_ownedChibiKeys` | **수정함** (§3-3) |
| `enemy_art_*` | `BattleScene.js:1587` | `BattleScene.shutdown()` | `_enemyArtQueued` | **수정함** (§3-1) |
| `bg_*` (실아트) | `BackgroundFactory._loadLazyBg()` | 없음 | — | 상주 (§4 참고) |
| `bg_*` (프로시저럴) | `TextureGenerator.generateBackgrounds()` ← PreloadScene | 승격 시 교체만 | — | 상주 (§4 참고) |
| `banner_pickup_*` | `GachaBannerPanel.js:581` | 없음 | — | 상주(소형 1.45MB) |
| 가챠 결과 전신 | `GachaResultOverlay.js:818,830` | `:848` | `added` 플래그 | 정상 |
| `__portraitfix__*` | `BattleScene.js:237` | `promotePartyPortraits()` rename | — | 정상 |

---

## 3. 수정한 누수 지점

### 3-1. 적 아트 무한 누적 — `src/scenes/BattleScene.js:2814`

`queueEnemyArt()` 가 `enemy_art_<key>` 를 로드하고 어디서도 해제하지 않았다. 매니페스트에
적 아트가 **84종**, 키당 약 1MB. 스테이지를 진행할수록 단조 증가한다(최악 84MB).
`_enemyArtQueued` 라는 "이 씬이 올린 키" Set 이 이미 있어 소유권 가드는 그대로 쓰고,
`shutdown()` 에서 해제만 추가했다. 다른 화면은 이 키를 참조하지 않는다.

### 3-2. 팝업 전신 시트 누적 — `src/components/HeroInfoPopup.js`

`_queueFullbody()` 가 `fb_hero_XXX`(683×1024, **키당 2.67MB**)를 올리고, 닫힐 때
`_fullbodyKey = null` 만 하고 텍스처는 남겼다. 34명을 훑어보면 90MB 가까이 눌러앉는다.

이는 실수가 아니라 **미완의 계획**이었다. `_releaseResources()` 주석이 이미 이유를 적어
뒀다 — 팝업이 닫히는 시점에 지우면 뒤에 살아 있는 `MeditationView` 가 같은 키를 파티원
폴백 스프라이트로 쓰고 있어 `glTexture` null 렌더 예외가 난다. 주석의 결론은
"공유 캐시로 두고 **씬 종료 때 정리한다**" 였는데, 그 정리가 구현돼 있지 않았다.

주석이 지시한 그대로 구현했다.

- `_ownedFullbodyKeys` — `load.image()` 직전 `exists()` 가 false 일 때만 claim
- `_bindSceneCleanup()` — `scene.events.once('shutdown')` 에서 claim 한 것만 해제
  (`GachaResultOverlay.js:232` 과 같은 패턴)

⚠ 구현 중 `once` 가 아니라 `on` 으로 걸었다가 **씬 리스너 +12/6사이클** 누수를 스스로
만들었고, 예산 `sceneListenerGrowthMax: 0` 이 즉시 잡아냈다. 씬은 `create()` 마다 팝업을
새로 만들기 때문에 `on` 이면 순환마다 구독이 쌓인다. 예산이 실제로 작동한다는 방증이라
기록해 둔다.

씬 종료 시점에는 씬이 이미 `visible=false` 이고 같은 씬의 표시객체가 함께 파기되므로
팝업 닫기 시점의 렌더 예외 문제가 재현되지 않는다. `MainMenuScene` 은 건드리지 않았다.

### 3-3. 치비 시트 소유권 오판 — `src/components/MeditationView.js:704`

```js
// 수정 전 — 이미 존재하는 키까지 무조건 소유권 주장
this.loadTexture(chibi.key, ...);
if (!this._ownedChibiKeys.includes(chibi.key)) this._ownedChibiKeys.push(chibi.key);
```

`loadTexture()` 는 텍스처가 이미 있으면 즉시 반환한다(로드하지 않는다). 그런데 소유권
목록에는 무조건 넣어서, `HeroDetailScene` 이 올려 둔 `chibi_<heroId>` 를 이 뷰가 파기될 때
지워 버릴 수 있었다 — 공용 텍스처 해제 금지 규칙 위반. `exists()` 선검사를 추가했다.

---

## 4. 초기 전송량 vs 런타임 상주 메모리

두 값은 **완전히 다른 예산**이다. 혼동하면 안 된다.

### 4-1. 초기 전송량 (네트워크)

`npm run build` 기준.

| 항목 | 원본 | gzip |
|---|---:|---:|
| `phaser.js` | 1,187.81 kB | 315.21 kB |
| `game-core.js` | 1,047.09 kB | 294.36 kB |
| `game-data.js` | 215.63 kB | 59.79 kB |
| `supabase.js` | 163.64 kB | 41.63 kB |
| `vendor.js` | 118.29 kB | 35.49 kB |
| `index.js` + `index.html` | 4.62 kB | 2.15 kB |
| **합계 (초기 JS)** | **2.74 MB** | **748.6 kB** |

`dist/` 전체는 56.73MB(파일 481개)지만 그중 이미지 46.90MB는 **초기 전송에 포함되지 않는다** —
씬 진입 시점에 지연 로드된다. 예산 6MB 대비 초기 전송 2.74MB(gzip 749kB)로 여유가 크다.

### 4-2. 런타임 상주 메모리 (GPU/RAM)

여기가 실제 병목이다. 8회 순환 후 최종 스냅샷:

| 버킷 | 키 수 | 추정 바이트 |
|---|---:|---:|
| **background** | 13 | **84.02 MB** |
| heroPortrait (`hero_*`, `char_*`) | 69 | 38.07 MB |
| other (UUID 텍스트 텍스처, 배너, 잡 아이콘) | 100 | 12.18 MB |
| frame | 12 | 6.62 MB |
| fullbody | 2 | 5.34 MB |
| menuIcon | 46 | 4.81 MB |
| chibi | 1 | 1.00 MB |
| enemyArt | 1 | 1.00 MB |
| **합계** | **244** | **153.03 MB** |

JS 힙은 24MB 대로 안정적이다. 즉 **메모리의 84%가 텍스처**이고, 그중 절반 이상이 배경이다.

### 4-3. 배경 84MB 상세 (미해결 — 권고)

키별 실측:

| 키 | 크기 | 바이트 | 종류 |
|---|---|---:|---|
| `bg_battle` | 1080×1920 | 7.91 MB | **캔버스(프로시저럴)** |
| `bg_stage` | 1080×1920 | 7.91 MB | **캔버스(프로시저럴)** |
| `bg_tower` | 1080×1920 | 7.91 MB | **캔버스(프로시저럴)** |
| `bg_main` / `bg_main_blur` | 1082×1581 | 6.53 MB ×2 | 이미지 |
| `bg_login` / `bg_login_blur` | 1082×1581 | 6.53 MB ×2 | 이미지 |
| `bg_gacha` / `bg_gacha_blur` | 1082×1581 | 6.53 MB ×2 | 이미지 |
| `bg_chapter_1` | 1082×1581 | 6.53 MB | 이미지 |
| `bg_sanctum` | 1082×1581 | 6.53 MB | 이미지 |
| `battle_bg` | 480×854 | 1.56 MB | 캔버스(레거시) |

이번 라운드에서는 **손대지 않았다**. 배경은 여러 화면이 공유하는 상주 자산이고, 동시에
UI 리디자인이 진행 중이라 해상도·수명을 바꾸면 충돌 위험이 크다. 대신 근거와 함께 남긴다.

**권고 1 — 프로시저럴 배경 캔버스 3종, 23.7MB (효과 최대, 위험 중간).**
`TextureGenerator.generateBackgrounds()` 가 `bg_main`·`bg_battle`·`bg_gacha`·`bg_stage`·`bg_tower`
5종을 `GAME_WIDTH×GAME_HEIGHT`(=1080×1920) 캔버스로 **부팅 시 전부** 굽는다. 이 중
`bg_main`·`bg_gacha` 는 실아트 승격 때 교체되지만, `bg_battle`·`bg_stage`·`bg_tower` 는
캔버스인 채로 세션 내내 남는다. 내용은 그라디언트 + 점/선이라 절반 해상도(540×960)면
육안 차이가 없고 7.91MB → 1.98MB 로 떨어진다(3종 합계 23.7MB → 5.9MB).
⚠ 단, `TowerScene.js:50` 은 `setDisplaySize()` 없이 `add.image()` 만 하므로 함께 고쳐야 한다.
더 나은 안은 이 3종을 **첫 사용 시점에 지연 생성**하는 것이다(해당 씬에 안 들어가면 0MB).

**권고 2 — 블러 변형을 축소 굽기, 약 18MB (효과 큼, 위험 낮음, 아트 파이프라인 작업).**
`*_blur` 3종이 원본과 **같은 1082×1581** 로 구워져 있다. 블러 배경은 정의상 고주파가 없어
1/4 선형(≈270×395)으로 줄여도 시각적으로 동일하다. 키당 6.53MB → 0.41MB.
`tools/art/postprocess-assets.py` 의 블러 생성 단계만 바꾸면 된다.

**권고 3 — `bg_login`/`bg_login_blur` 13.06MB.** 로그인은 세션당 1회 화면인데 영구 상주한다.
다만 두 키는 매니페스트의 `textures`(eager) 버킷이라 "공용 상주" 분류이고, 로그아웃 복귀
경로가 있어 이번 규칙상 해제 대상이 아니다. 재분류하려면 `lazyTextures` 로 옮겨야 한다.

---

## 5. 예산 고정

SSOT 는 `tools/art/asset-manifest.json` 의 `memoryBudget` 이며, 재생성으로 지워지지 않도록
생성기 `tools/art/postprocess-assets.py` 에도 같은 값을 넣었다(매니페스트만 고치면 다음
재생성 때 덮인다).

```json
{
  "cycles": 8,
  "baselineCycle": 2,
  "heapGrowthMaxPercent": 15,
  "textureCountGrowthMax": 10,
  "textureResidentMaxMB": 210,
  "sceneListenerGrowthMax": 0,
  "eventBusListenerGrowthMax": 0,
  "activeTweenMax": 24,
  "activeTimerMax": 12,
  "displayObjectGrowthMax": 12
}
```

- **`baselineCycle: 2`** — 1회차는 온보딩 컷씬과 지연 싱글턴 초기화가 섞여 기준선으로 못 쓴다.
  2회차 대비 8회차 증가분으로 판정하므로 예전(1→5회차)보다 오히려 엄격하다.
- **`eventBusListenerGrowthMax: 0`** — 이번 회귀를 직접 잡는 가드다.
- **`coreTextureGrowthMax: 6` + `vectorIconMaxKeys: 60`** — 초기 `textureCountGrowthMax: 10`
  을 대체했다. 근거는 §5-1.

실행: `npm run test:e2e:memory` (이미 `package.json` 에 등록돼 있다)
순환 횟수는 `MEMORY_SMOKE_CYCLES=20` 으로 덮을 수 있다("수렴하는가"를 볼 때 쓴다).

## 5-1. `vicon_*` 증식 판정 — 캐시이지 누수가 아니다 (예산 재설계)

`textureCountGrowthMax: 10` 이 한때 **+12** 로 실패했고, 신규 키가 전부 `vicon_*` 스탯
아이콘과 UUID 키였다. "유한 집합에서 포화하는 캐시(무해)"인지 "연속값에서 무한 증식(유해)"
인지를 20회 순환으로 판정했다.

### 실측 — 수렴한다

| 사이클 | 1 | 2 | …7 | 8 | 9 | 10 | 11 … 20 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `vicon_*` 키 수 | 18 | 23 | 23 | 23 | 24 | **25** | **25 (11회 연속 고정)** |
| 전체 텍스처 키 | 239 | 242 | 242 | 242 | 243 | **244** | **244 (고정)** |

새 키는 **처음 보는 교단색을 만날 때만** 생긴다(사이클 8·9·10 에서 `base_kai`·`base_luca`·
`base_sera` 첫 등장 시 +1씩). 이후 같은 영웅을 다시 돌아도 0이다. `heroPortrait`(69),
`fullbody`(1), `other`(75)는 1회차부터 20회차까지 전부 불변이다.

### 키 공간이 유한한 이유

`iconPaths.js:638` — `vicon_${name}_${px}_${hex}${bg}`. 최종 25키의 색상 해시는
`06bbfa`, `95a5a6`, `ffd60a`, `9ca3af`, `10b981`, `0d0f1a`, `ef4444`, `ffffff` **8종뿐**이다.
tint 인자 출처를 전수 확인한 결과 전부 이산 팔레트다 — `getCultColor()`(교단 9종 + 폴백 1),
`DESIGN.colors.status.*`, `0x000000`. 알파 혼합·보간 같은 연속값이 키에 들어가는 경로는 없다.
크기도 `resolveIconSize()` 가 `Math.round` 로 정수화한다. 따라서 상한은
**(아이콘 종류 × 크기 × 팔레트색)** 으로 유한하다.

→ **가설 1(무해) 확정.** 코드 수정 불필요.

### 다만 예산은 잘못 설계돼 있었다 (내 책임)

`vicon_*` 포화는 **10회차에 끝나는데 예산은 2회차↔8회차를 비교**했다. 즉 포화가 끝나기 전
구간을 재고 있었고, 영웅 등장 순서에 따라 실패/통과가 갈리는 **불안정한 예산**이었다.
팀 리드 지시대로 값을 올려 통과시키지 않고, 감시 대상을 나눠 **더 엄격하게** 바꿨다.

| | 이전 | 이후 |
|---|---|---|
| 텍스처 순증 | `textureCountGrowthMax: 10` (전부 포함) | **`coreTextureGrowthMax: 6`** — 포화 캐시 2종 제외한 실제 누적 |
| 아이콘 캐시 | (없음) | **`vectorIconMaxKeys: 60`** — 증가분이 아닌 **절대 상한** |

캐시는 원래 "얼마나 늘었나"가 아니라 "얼마나 크나"로 감시하는 게 맞다. 이 재설계로
**감시가 강해진다**:

- 실제 누적(`hero_*`·`fb_*`·`chibi_*`·`bg_*` 등) 허용치가 10 → **6** 으로 좁아졌다.
  실측값은 20회 순환에서 **0** 이라 여유가 충분하다.
- 만약 누군가 아이콘 키에 연속값(알파 혼합 tint 등)을 넣어 **진짜 무한 증식**이 생기면
  `vectorIconMaxKeys` 절대 상한이 잡는다 — 이전 `textureCountGrowthMax` 로는 포화 캐시와
  구분되지 않아 오히려 못 잡았을 상황이다.
- UUID 텍스트 캔버스도 `textCanvas` 버킷으로 분리해 매 실행 로그에 회전량이 드러난다.

---

## 5-2. 측정 커버리지 결함 — 스모크가 **패배 경로만** 돌고 있었다 (기준선 재설정)

2026-09-05, `test:e2e:memory` 가 사이클 1에서 60초 타임아웃으로 죽었다. 원인 추적 중
**그때까지의 모든 측정이 승리 경로를 한 번도 지나지 않았다**는 사실이 드러났다.

### 증거

저장된 8회 순환 아티팩트(`memory-smoke-result.json`, 2026-09-04T14:24)의 최종 텍스처 키:

```
bg_result_*  →  bg_result_defeat, bg_result_defeat_blur
                (bg_result_victory 는 단 하나도 없음)
```

`BattleResultScene.js:122` 이 `this.resultBgKey = this.victory ? 'bg_result_victory' : 'bg_result_defeat'`
로 결과별 배경을 로드한다. 즉 **8사이클 전부 패배**였다. 20회 순환도 같다.

이후 파티 스탯 P0 수정으로 1-1 승리가 실제로 발생하기 시작했고, 그러자
`cs_1_1_clear`(stage_clear, `oncePerAccount`)가 결과 화면을 덮으며 타임아웃이 났다.
프로브로 확인한 실제 순서는 이렇다.

```
BattleScene → BattleResultScene(뜸) → CutsceneScene(덮음, 영원히 대기)
아이리스 780/990 생존, 적 0/200·0/200, clearedStages {"1-1": 3}
```

즉 결과 화면은 **뜨긴 뜬다**. 컷씬이 그 위를 덮어 `isActive('BattleResultScene')` 가
false 로 떨어지는 것이라, "결과 화면"만 기다리면 놓친다.

### 두 번째 결함 — 온보딩 컷씬도 방치돼 있었다

스모크가 컷씬을 **전혀** 처리하지 않아, 온보딩 프롤로그의 `CutsceneScene` 이 세션 내내
활성으로 남아 있었다. 예전 스냅샷의 `activeSceneKeys` 에 `CutsceneScene` 이 항상 끼어
있던 것이 그 흔적이다(1회차 `["CutsceneScene"]`, 이후 `["MainMenuScene","CutsceneScene"]`).
그 씬의 표시객체·트윈·타이머가 모든 집계에 섞여 있었다.

### 수정

`skip-path-parity.mjs` / `onboarding-full.mjs` 와 같은 방식(`player.skipAll()` → 탭 폴백)의
`skipCutscenesIfAny()` 를 넣고 세 지점에서 호출한다 — 부팅 직후(온보딩), 소환 직후
(`first_hero` 방어), 전투 후. 전투 후 대기는 "결과 화면 **또는** 컷씬"을 기다린 뒤
컷씬을 넘기고 결과 화면을 다시 확인하도록 바꿨다.

재발 방지로 **커버리지 게이트**를 예산에 추가했다 — 매 사이클 `BattleResultScene.victory`
를 읽어 기록하고, 패배 사이클이 하나라도 있으면 실패시킨다. 측정 도구가 실제 플레이
경로를 안 지나면 통과해도 의미가 없다는 것이 이번 교훈이다.

### 기준선 변화 (예산 통과용으로 옮긴 것이 아니라, 경로가 실제로 달라졌다)

| 지표 (2회차→8회차) | 패배 경로(구) | **승리 경로(신)** |
|---|---:|---:|
| 텍스처 키 / 상주 | 233키 / 155.87MB | **230키 / 149.41MB** |
| 씬 리스너 (절대값) | 462~463 | **438** |
| 표시객체 / Graphics | 182 / 53 | **148 / 46** |
| 활성 타이머 | 5 | **3** |
| 활성 트윈 | 11~14 | 10~14 |
| 힙 증가율 | +2.3% | **+0.9%** |
| 결과 배경 | `bg_result_defeat(+blur)` | **`bg_result_victory(+blur)`** |
| 최종 `activeSceneKeys` | `MainMenuScene, CutsceneScene` | **`MainMenuScene`** |

절대값이 전반적으로 **줄었다**. 방치된 `CutsceneScene` 이 이제 정리되기 때문이다
(표시객체 −34, Graphics −7, 씬 리스너 −24, 타이머 −2). 승리 경로가 새로 포함됐음에도
상주 텍스처가 6.5MB 줄어든 것도 같은 이유다.

**예산값은 하나도 바꾸지 않았다.** 새 기준선에서 그대로 전부 통과한다(순증·리스너 증가는
여전히 0). 즉 이번 변경은 예산 완화가 아니라 측정 대상 교정이다.

### 다른 스모크의 같은 함정 (점검 결과)

`oncePerAccount` 컷씬은 69개 중 `stage_clear` 4 · `first_hero` 10 · `hero_ascend` 10 ·
`hero_evolve` 24 등이다. 전투에 들어가는 스모크는 `memory-smoke` 와 `battle-cult-live`
둘뿐이고 **후자는 이미 컷씬을 처리한다**(12개소). 나머지(`boot`/`asset`/`audio`/
`gacha-banner-pull`/`party-default`/`returning-storylog`/`legacy-migration`)는 전투에
진입하지 않아 `stage_clear` 경로가 끼어들 수 없다. 다만 소환을 도는 경로는 `first_hero`
가 언제든 끼어들 수 있어 memory-smoke 쪽에 선제 방어를 넣어 뒀다.

## 6. 측정 도구 개선

### 6-1. `performance.memory` → CDP

기존 스모크는 `performance.memory.usedJSHeapSize` 를 썼는데, 브라우저가 정밀도를 크게 깎아
**5회 내내 `109000000` 으로 동일**했다(=측정 불가). 힙 증가율 0% 는 실제로 "측정이 안 됨"
이었다. CDP `Performance.getMetrics` 의 `JSHeapUsedSize` 로 바꿔 바이트 단위 실값을 얻고,
`HeapProfiler.collectGarbage` 로 스냅샷 직전 실제 GC 를 돌린다
(`--js-flags=--expose-gc` 는 이 앱의 부팅을 멈추게 해 쓸 수 없다).

### 6-2. 새로 측정하는 항목

텍스처 추정 바이트(폭×높이×4)와 버킷별 분해, 표시객체 **깊이 우선 전수**(컨테이너 내부까지),
Graphics·파티클 이미터 수, 리스너 4종(씬 EventEmitter / `game.events`+registry / 전역
EventBus / DOM `JSEventListeners`), 기준선 대비 **신규·해제 텍스처 키 목록**.

전역 EventBus 가시성을 위해 기존 `window.__TEST_API__` 에 읽기 전용 `eventBusStats()` 를
추가했다(`src/systems/DebugManager.js`).

### 6-3. 사이클마다 다른 영웅 열기

기존 스모크는 매 사이클 `base_iris` 만 열어서, 전신·@2x·치비가 "이미 존재"로 재사용돼
**대형 전용 텍스처 누적이 측정에 잡히지 않았다**(수정 전 텍스처 증가 +0 은 이 사각지대 때문).
소환으로 보유 영웅이 매 사이클 늘어나므로 사이클 번호로 순회하도록 바꿨다.

### 6-4. HMR 격리

공용 dev 서버에서 수 분간 도는 테스트라, 다른 작업자가 소스를 저장하면 Vite HMR 이 페이지를
리로드해 `window.game` 이 갈아치워지고 씬 대기가 45초 타임아웃으로 죽었다(실측). `@vite/client`
를 빈 모듈로 갈아끼워 측정 구간을 격리하고, 그래도 리로드가 나면 조용히 매달리지 않고 즉시
실패하도록 리로드 카운터를 뒀다.

---

## 7. 검증

| 항목 | 결과 |
|---|---|
| `npx vitest run` | 75 파일 **2,129 통과 / 0 실패** |
| `npx tsc --noEmit` | **0 errors** |
| `npm run build` | **성공** (exit 0) |
| `node tests/e2e/boot-smoke.mjs` | **6 통과 / 0 실패** (exit 0) |
| `npm run test:e2e:memory` | **9 통과 / 0 실패** (예산 9항목 전부, exit 0) |
| `npm run test:e2e:story` | **141 통과 / 0 실패** (6+29+21+17+68, exit 0) |

전부 최종 코드 기준으로 재실행한 결과다.

---

## 7-1. "재그리기마다 자식 객체 누적" 패턴 전수 점검 (추가 지시)

`RadarChart.drawAxes()` 회귀(재그릴 때마다 축 라벨 Text 4개 신규 생성)와 **같은 패턴이
다른 곳에 있는지** `src/` 전체를 훑었다. 반복 갱신 계열 메서드(`update*`/`refresh*`/`draw*`/
`render*`/`apply*`/`sync*`/`tick*`)가 표시객체를 만들거나(`.add.*`) 컴포넌트를 새로
생성하는(`new X()`, `UIRenderer.create*`, `IconFactory.*`) 지점을 전부 뽑아 소유권을 확인했다.

**추가 사례 없음.** 후보로 걸린 지점은 전부 정리 경로가 이미 있었다.

| 후보 | 판정 | 근거 |
|---|---|---|
| `HeroDetailScene.renderStatsTab/SkillsTab/EquipTab/StoryTab` | 안전 | `switchTab()` 이 `clearTabObjects()` 를 먼저 부른다(`:831`). `RadarChart` 인스턴스도 `this.track(this.radarChart)` 로 등록돼 함께 파기된다(`:947`) |
| `TowerPopup.renderSeasonTab` 등 탭 렌더 | 안전 | `renderTab()` 이 `clearTabContent()` 로 `_tabObjects` 전부 destroy |
| `MeditationView.drawRuneCircle/drawAltar/drawLightPillar/drawPartyEntry/drawSeatDisc` | 안전 | Graphics 하나를 재사용하고 매번 `gfx.clear()` — 올바른 패턴 |
| `EnergyBar.update()` | 안전 | 아이콘·텍스트는 생성자에서 1회 생성, `update()` 는 `setText` 만 |
| `StageSelectScene.drawBolt()` | 오탐 | 이름만 `draw*` 인 팩토리. 레이아웃 구성 시 1회 호출이고 반환 객체는 카드 컨테이너에 귀속 |
| `*.show()` 계열 (ReturningPlayerCard, CoachMark, TutorialOverlay, LoadingSpinner) | 오탐 | 1회 빌더이며 대응하는 close/destroy 경로 보유 |

즉 이 코드베이스는 "추적 목록을 먼저 비우고 다시 그린다" 또는 "Graphics 하나를 `clear()` 로
재사용한다" 두 가지 규칙을 일관되게 지키고 있고, `RadarChart` 가 유일한 이탈이었다.

## 8. 남은 작업

1. 배경 상주 84MB — §4-3 권고 1·2 (최대 약 42MB 절감 여지). UI 리디자인 종료 후 착수 권장.
2. `bg_login` 계열 재분류 여부 판단 (13MB).
3. 이번에 배선된 `shutdown()` 이 실제로 도는 씬 중 순환 경로 밖(`TowerScene`, `QuestScene`,
   `InventoryScene`, `PartyEditScene`, `SettingsScene`)은 스모크가 밟지 않는다. 경로 확장 검토.
