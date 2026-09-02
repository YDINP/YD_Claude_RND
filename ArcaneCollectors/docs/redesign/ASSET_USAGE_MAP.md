# ASSET_USAGE_MAP

> 생성 에셋과 코드의 매핑표. **자동 생성 문서다.**
> 원본은 `tools/art/asset-spec.json`이고, 이 문서는 `node tools/art/_build-usage-map.mjs`가 굽는다.
> 스펙을 고쳤다면 재실행할 것. 손으로 고치면 다음 생성에서 지워진다.

생성 시각: 2026-09-02 · 총 **57건** (P1 43 / P2 14)

---

## 0. 읽는 법

| 열 | 의미 |
|----|------|
| **에셋 id** | `asset-spec.json`의 `id`. ComfyUI 배치 파일명과 일치시킨다 |
| **텍스처 키** | `scene.add.image(x, y, '<키>')`에 넣는 Phaser 텍스처 키 |
| **로드 경로** | `scene.load.image()`의 두 번째 인자. `public/`을 뺀 경로다 |
| **사용처** | 이 에셋을 참조하는 씬 또는 컴포넌트 |

**로드 규칙 4가지 (2026-09-02 전송량 예산 대응으로 갱신 — §11-6 참조)**

1. **배경은 `bg_main`/`bg_login`만** `PreloadScene.loadPhase0_Assets()`에서 일괄(eager) 등록한다. 나머지 12종(gacha/stageselect/tower/result_*/chapter_1~5/pvp/raid, 각 본+블러)은 `tools/art/asset-manifest.json`의 `lazyTextures`에 있고, `BackgroundFactory.createSceneBg(scene, key)`가 씬 진입 시점에 동적으로 로드한다(로드 중엔 프로시저럴 폴백 표시, 실패 시 폴백 유지).
2. 프레임·버튼·아이콘·로고는 계속 `PreloadScene.loadPhase0_Assets()`에서 **일괄 등록**한다(eager, `manifest.textures`). 전 씬이 공유하므로 한 번만 로드한다.
3. 배너와 전신·적 스프라이트는 **지연 로드**한다(`manifest.lazyTextures`/`manifest.fullbody`). 배너는 교체 주기가 짧고, 전신은 조회 대상 1명만 필요하며, 적은 스테이지마다 다르다.
4. 모든 로드에는 **프로시저럴 폴백이 남아 있어야 한다.** 이미지가 없으면(또는 로드 실패 시) 기존 `TextureGenerator` / `BackgroundFactory` / `IconFactory` 결과를 그대로 쓴다. 에셋 도입이 회귀를 만들지 않게 하는 조건이다.

> **캔버스 vs 실이미지 키 충돌 주의**: `TextureGenerator`가 `bg_main`/`bg_gacha`/`bg_tower`/`bg_battle`/`bg_stage`에 무조건 캔버스 플레이스홀더를 만들어 둔다. `bg_gacha`/`bg_tower`는 lazyTextures이기도 해서, `scene.textures.exists(key)` 만으로는 "실제 아트 로드됨"과 "이름만 같은 캔버스"를 구분할 수 없다. `PreloadScene._promoteRealTexture()`와 `BackgroundFactory._isCanvasTexture()` + `_loadLazyBg()`가 둘 다 임시 키 로드 → 캔버스 제거 → `renameTexture` 승격 패턴으로 이 문제를 푼다.

---

## 1. 배경 (background)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `bg_main` | `bg_main` | `assets/backgrounds/scenes/bg_main.png` | P1 | MainMenuScene |
| `bg_login` | `bg_login` | `assets/backgrounds/scenes/bg_login.png` | P1 | LoginScene, BootScene |
| `bg_gacha` | `bg_gacha` | `assets/backgrounds/scenes/bg_gacha.png` | P1 | GachaScene, GachaPopup |
| `bg_stageselect` | `bg_stageselect` | `assets/backgrounds/scenes/bg_stageselect.png` | P1 | StageSelectScene |
| `bg_tower` | `bg_tower` | `assets/backgrounds/scenes/bg_tower.png` | P1 | TowerPopup, TowerScene |
| `bg_result_victory` | `bg_result_victory` | `assets/backgrounds/scenes/bg_result_victory.png` | P1 | BattleResultScene |
| `bg_result_defeat` | `bg_result_defeat` | `assets/backgrounds/scenes/bg_result_defeat.png` | P1 | BattleResultScene |
| `bg_chapter_1` | `bg_chapter_1` | `assets/backgrounds/battle/bg_chapter_1.png` | P1 | BattleScene(ch1), StageSelectScene(ch1), CutsceneScene |
| `bg_chapter_2` | `bg_chapter_2` | `assets/backgrounds/battle/bg_chapter_2.png` | P1 | BattleScene(ch2), StageSelectScene(ch2), CutsceneScene |
| `bg_chapter_3` | `bg_chapter_3` | `assets/backgrounds/battle/bg_chapter_3.png` | P2 | BattleScene(ch3), StageSelectScene(ch3), CutsceneScene |
| `bg_chapter_4` | `bg_chapter_4` | `assets/backgrounds/battle/bg_chapter_4.png` | P2 | BattleScene(ch4), StageSelectScene(ch4), CutsceneScene |
| `bg_chapter_5` | `bg_chapter_5` | `assets/backgrounds/battle/bg_chapter_5.png` | P2 | BattleScene(ch5), StageSelectScene(ch5), CutsceneScene |
| `bg_pvp` | `bg_pvp` | `assets/backgrounds/scenes/bg_pvp.png` | P2 | PvPPopup |
| `bg_raid` | `bg_raid` | `assets/backgrounds/scenes/bg_raid.png` | P2 | RaidPopup |

#### 블러 페어

`glass` 패널의 백드롭에 쓰이는 사전 블러본이다. ComfyUI 출력이 아니라 `tools/art/build-blur.mjs`가 원본에서 굽는다 (가우시안 24px + 밝기 −15%).

| 원본 키 | 블러 키 | 블러 로드 경로 |
|---------|--------|--------------|
| `bg_main` | `bg_main_blur` | `assets/backgrounds/scenes/bg_main_blur.png` |
| `bg_login` | `bg_login_blur` | `assets/backgrounds/scenes/bg_login_blur.png` |
| `bg_gacha` | `bg_gacha_blur` | `assets/backgrounds/scenes/bg_gacha_blur.png` |
| `bg_stageselect` | `bg_stageselect_blur` | `assets/backgrounds/scenes/bg_stageselect_blur.png` |
| `bg_tower` | `bg_tower_blur` | `assets/backgrounds/scenes/bg_tower_blur.png` |
| `bg_result_victory` | `bg_result_victory_blur` | `assets/backgrounds/scenes/bg_result_victory_blur.png` |
| `bg_result_defeat` | `bg_result_defeat_blur` | `assets/backgrounds/scenes/bg_result_defeat_blur.png` |
| `bg_chapter_1` | `bg_chapter_1_blur` | `assets/backgrounds/battle/bg_chapter_1_blur.png` |
| `bg_chapter_2` | `bg_chapter_2_blur` | `assets/backgrounds/battle/bg_chapter_2_blur.png` |
| `bg_chapter_3` | `bg_chapter_3_blur` | `assets/backgrounds/battle/bg_chapter_3_blur.png` |
| `bg_chapter_4` | `bg_chapter_4_blur` | `assets/backgrounds/battle/bg_chapter_4_blur.png` |
| `bg_chapter_5` | `bg_chapter_5_blur` | `assets/backgrounds/battle/bg_chapter_5_blur.png` |
| `bg_pvp` | `bg_pvp_blur` | `assets/backgrounds/scenes/bg_pvp_blur.png` |
| `bg_raid` | `bg_raid_blur` | `assets/backgrounds/scenes/bg_raid_blur.png` |

---

## 2. 프레임 · 패널 (frame)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `frame_panel` | `frame_panel` | `assets/ui/frames/frame_panel.png` | P1 | GlassPanel, all scenes |
| `frame_popup` | `frame_popup` | `assets/ui/frames/frame_popup.png` | P1 | PopupBase |
| `frame_card_N` | `frame_card_N` | `assets/ui/frames/frame_card_N.png` | P1 | HeroCard, GachaResultOverlay, BattleResultScene, InventoryPopup |
| `frame_card_R` | `frame_card_R` | `assets/ui/frames/frame_card_R.png` | P1 | HeroCard, GachaResultOverlay, BattleResultScene, InventoryPopup |
| `frame_card_SR` | `frame_card_SR` | `assets/ui/frames/frame_card_SR.png` | P1 | HeroCard, GachaResultOverlay, BattleResultScene, InventoryPopup |
| `frame_card_SSR` | `frame_card_SSR` | `assets/ui/frames/frame_card_SSR.png` | P1 | HeroCard, GachaResultOverlay, BattleResultScene, InventoryPopup |
| `frame_hex` | `frame_hex` | `assets/ui/frames/frame_hex.png` | P1 | MainMenuScene party slots, StageSelectScene stage badge |
| `panel_header_ornament` | `panel_header_ornament` | `assets/ui/panels/panel_header_ornament.png` | P2 | PopupBase header, section titles |

9-slice 코너값은 `asset-spec.json`의 각 항목 `postProcess`에 있고, 코드에서는 `src/components/NineSliceFrame.js`의 내장 테이블이 SSOT다.

---

## 3. 버튼 (button)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `btn_primary` | `btn_primary` | `assets/ui/buttons/btn_primary.png` | P1 | all CTA buttons |
| `btn_secondary` | `btn_secondary` | `assets/ui/buttons/btn_secondary.png` | P1 | secondary actions |
| `btn_ghost` | `btn_ghost` | `assets/ui/buttons/btn_ghost.png` | P1 | tertiary actions, cancel |

---

## 4. 아이콘 (icon)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `icon_currency_gold` | `icon_currency_gold` | `assets/ui/icons/currency/gold.png` | P1 | TopBar, reward displays, GachaScene, QuestPopup |
| `icon_currency_gem` | `icon_currency_gem` | `assets/ui/icons/currency/gem.png` | P1 | TopBar, reward displays, GachaScene, QuestPopup |
| `icon_currency_energy` | `icon_currency_energy` | `assets/ui/icons/currency/energy.png` | P1 | TopBar, reward displays, GachaScene, QuestPopup |
| `icon_currency_ticket` | `icon_currency_ticket` | `assets/ui/icons/currency/ticket.png` | P1 | TopBar, reward displays, GachaScene, QuestPopup |
| `icon_currency_spirit_stone` | `icon_currency_spirit_stone` | `assets/ui/icons/currency/spirit_stone.png` | P1 | TopBar, reward displays, GachaScene, QuestPopup |
| `icon_cult_valhalla` | `icon_cult_valhalla` | `assets/ui/icons/cults/valhalla.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_takamagahara` | `icon_cult_takamagahara` | `assets/ui/icons/cults/takamagahara.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_olympus` | `icon_cult_olympus` | `assets/ui/icons/cults/olympus.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_asgard` | `icon_cult_asgard` | `assets/ui/icons/cults/asgard.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_yomi` | `icon_cult_yomi` | `assets/ui/icons/cults/yomi.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_tartarus` | `icon_cult_tartarus` | `assets/ui/icons/cults/tartarus.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_avalon` | `icon_cult_avalon` | `assets/ui/icons/cults/avalon.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_helheim` | `icon_cult_helheim` | `assets/ui/icons/cults/helheim.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |
| `icon_cult_kunlun` | `icon_cult_kunlun` | `assets/ui/icons/cults/kunlun.png` | P1 | HeroDetailScene watermark, CollectionPopup, AscensionPopup, HeroCard badge |

> **메뉴·클래스·스탯 아이콘 21종은 이 표에 없다.** SDXL이 균질한 플랫 아이콘 세트를 만들지 못하므로 `src/utils/IconFactory.js` 벡터 확장(태스크 T-07)으로 처리한다. `REDESIGN_PLAN.md §1-2` 참조.

---

## 5. 배너 · 이펙트 (banner)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `banner_pickup_iris` | `banner_pickup_iris` | `assets/ui/panels/banner_pickup_iris.png` | P1 | GachaScene, GachaPopup |
| `banner_pickup_generic` | `banner_pickup_generic` | `assets/ui/panels/banner_pickup_generic.png` | P2 | GachaScene 상시 배너 |
| `fx_summon_circle` | `fx_summon_circle` | `assets/effects/skills/fx_summon_circle.png` | P1 | GachaResultOverlay 2단계 |

---

## 6. 로고 (logo)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `logo_arcane_collectors` | `logo_arcane_collectors` | `assets/ui/logo_arcane_collectors.png` | P1 | LoginScene, BootScene |

> `logo_arcane_collectors`는 **엠블럼만**이다. "ARCANE COLLECTORS" 워드마크는 Orbitron 700으로 코드에서 렌더한다.

---

## 7. 적 유닛 · 전신 (fullbody-extra)

| 에셋 id | 텍스처 키 | 로드 경로 | 우선도 | 사용처 |
|---------|----------|----------|--------|--------|
| `enemy_slime` | `enemy_slime` | `assets/characters/battle/enemy_slime.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_goblin` | `enemy_goblin` | `assets/characters/battle/enemy_goblin.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_wolf` | `enemy_wolf` | `assets/characters/battle/enemy_wolf.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_mushroom` | `enemy_mushroom` | `assets/characters/battle/enemy_mushroom.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_treant` | `enemy_treant` | `assets/characters/battle/enemy_treant.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_golem` | `enemy_golem` | `assets/characters/battle/enemy_golem.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_goblin_king` | `enemy_goblin_king` | `assets/characters/battle/enemy_goblin_king.png` | P1 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_cerberus` | `enemy_cerberus` | `assets/characters/battle/enemy_cerberus.png` | P2 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_yamata` | `enemy_yamata` | `assets/characters/battle/enemy_yamata.png` | P2 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `enemy_jormungandr` | `enemy_jormungandr` | `assets/characters/battle/enemy_jormungandr.png` | P2 | BattleScene, IdleBattleView, TowerPopup 층 정보 |
| `fullbody_hero_001` | `fb_hero_001` | `assets/characters/fullbody/hero_001.png` | P2 | HeroDetailScene 전신 영역 |
| `fullbody_hero_002` | `fb_hero_002` | `assets/characters/fullbody/hero_002.png` | P2 | HeroDetailScene 전신 영역 |
| `fullbody_hero_003` | `fb_hero_003` | `assets/characters/fullbody/hero_003.png` | P2 | HeroDetailScene 전신 영역 |
| `fullbody_hero_004` | `fb_hero_004` | `assets/characters/fullbody/hero_004.png` | P2 | HeroDetailScene 전신 영역 |

> hero_005~038의 전신 시트 34장은 **별도 트랙**에서 생성되며 이 스펙에 포함되지 않는다.
> 경로 규약은 `public/assets/characters/fullbody/hero_XXX.png`, 텍스처 키는 `fb_hero_XXX`로 동일하다.

---

## 8. 역방향 인덱스 (파일 · 컴포넌트 → 에셋)

| 사용처 | 필요한 에셋 |
|--------|-----------|
| all CTA buttons | `btn_primary` |
| all scenes | `frame_panel` |
| AscensionPopup | `icon_cult_valhalla`, `icon_cult_takamagahara`, `icon_cult_olympus`, `icon_cult_asgard`, `icon_cult_yomi`, `icon_cult_tartarus`, `icon_cult_avalon`, `icon_cult_helheim`, `icon_cult_kunlun` |
| BattleResultScene | `bg_result_victory`, `bg_result_defeat`, `frame_card_N`, `frame_card_R`, `frame_card_SR`, `frame_card_SSR` |
| BattleScene | `enemy_slime`, `enemy_goblin`, `enemy_wolf`, `enemy_mushroom`, `enemy_treant`, `enemy_golem`, `enemy_goblin_king`, `enemy_cerberus`, `enemy_yamata`, `enemy_jormungandr` |
| BattleScene(ch1) | `bg_chapter_1` |
| BattleScene(ch2) | `bg_chapter_2` |
| BattleScene(ch3) | `bg_chapter_3` |
| BattleScene(ch4) | `bg_chapter_4` |
| BattleScene(ch5) | `bg_chapter_5` |
| BootScene | `bg_login`, `logo_arcane_collectors` |
| CollectionPopup | `icon_cult_valhalla`, `icon_cult_takamagahara`, `icon_cult_olympus`, `icon_cult_asgard`, `icon_cult_yomi`, `icon_cult_tartarus`, `icon_cult_avalon`, `icon_cult_helheim`, `icon_cult_kunlun` |
| CutsceneScene | `bg_chapter_1`, `bg_chapter_2`, `bg_chapter_3`, `bg_chapter_4`, `bg_chapter_5` |
| GachaPopup | `bg_gacha`, `banner_pickup_iris` |
| GachaResultOverlay | `frame_card_N`, `frame_card_R`, `frame_card_SR`, `frame_card_SSR` |
| GachaResultOverlay 2단계 | `fx_summon_circle` |
| GachaScene | `bg_gacha`, `icon_currency_gold`, `icon_currency_gem`, `icon_currency_energy`, `icon_currency_ticket`, `icon_currency_spirit_stone`, `banner_pickup_iris` |
| GachaScene 상시 배너 | `banner_pickup_generic` |
| GlassPanel | `frame_panel` |
| HeroCard | `frame_card_N`, `frame_card_R`, `frame_card_SR`, `frame_card_SSR` |
| HeroCard badge | `icon_cult_valhalla`, `icon_cult_takamagahara`, `icon_cult_olympus`, `icon_cult_asgard`, `icon_cult_yomi`, `icon_cult_tartarus`, `icon_cult_avalon`, `icon_cult_helheim`, `icon_cult_kunlun` |
| HeroDetailScene 전신 영역 | `fullbody_hero_001`, `fullbody_hero_002`, `fullbody_hero_003`, `fullbody_hero_004` |
| HeroDetailScene watermark | `icon_cult_valhalla`, `icon_cult_takamagahara`, `icon_cult_olympus`, `icon_cult_asgard`, `icon_cult_yomi`, `icon_cult_tartarus`, `icon_cult_avalon`, `icon_cult_helheim`, `icon_cult_kunlun` |
| IdleBattleView | `enemy_slime`, `enemy_goblin`, `enemy_wolf`, `enemy_mushroom`, `enemy_treant`, `enemy_golem`, `enemy_goblin_king`, `enemy_cerberus`, `enemy_yamata`, `enemy_jormungandr` |
| InventoryPopup | `frame_card_N`, `frame_card_R`, `frame_card_SR`, `frame_card_SSR` |
| LoginScene | `bg_login`, `logo_arcane_collectors` |
| MainMenuScene | `bg_main` |
| MainMenuScene party slots | `frame_hex` |
| PopupBase | `frame_popup` |
| PopupBase header | `panel_header_ornament` |
| PvPPopup | `bg_pvp` |
| QuestPopup | `icon_currency_gold`, `icon_currency_gem`, `icon_currency_energy`, `icon_currency_ticket`, `icon_currency_spirit_stone` |
| RaidPopup | `bg_raid` |
| reward displays | `icon_currency_gold`, `icon_currency_gem`, `icon_currency_energy`, `icon_currency_ticket`, `icon_currency_spirit_stone` |
| secondary actions | `btn_secondary` |
| section titles | `panel_header_ornament` |
| StageSelectScene | `bg_stageselect` |
| StageSelectScene stage badge | `frame_hex` |
| StageSelectScene(ch1) | `bg_chapter_1` |
| StageSelectScene(ch2) | `bg_chapter_2` |
| StageSelectScene(ch3) | `bg_chapter_3` |
| StageSelectScene(ch4) | `bg_chapter_4` |
| StageSelectScene(ch5) | `bg_chapter_5` |
| tertiary actions, cancel | `btn_ghost` |
| TopBar | `icon_currency_gold`, `icon_currency_gem`, `icon_currency_energy`, `icon_currency_ticket`, `icon_currency_spirit_stone` |
| TowerPopup | `bg_tower` |
| TowerPopup 층 정보 | `enemy_slime`, `enemy_goblin`, `enemy_wolf`, `enemy_mushroom`, `enemy_treant`, `enemy_golem`, `enemy_goblin_king`, `enemy_cerberus`, `enemy_yamata`, `enemy_jormungandr` |
| TowerScene | `bg_tower` |

---

## 9. 디렉터리 준비 상태

현재 아래 디렉터리는 전부 비어 있다(`.gitkeep`만 존재). 에셋 배치 시 그대로 채우면 된다.

```
public/assets/backgrounds/battle/     ← bg_chapter_1..5 (+_blur)
public/assets/backgrounds/scenes/     ← bg_main, bg_login, bg_gacha, bg_stageselect,
                                         bg_tower, bg_result_*, bg_pvp, bg_raid (+_blur)
public/assets/ui/frames/              ← frame_panel, frame_popup, frame_card_*, frame_hex
public/assets/ui/panels/              ← panel_header_ornament, banner_pickup_*
public/assets/ui/buttons/             ← btn_primary, btn_secondary, btn_ghost
public/assets/ui/icons/currency/      ← gold, gem, energy, ticket, spirit_stone
public/assets/ui/icons/cults/         ← 교단 9종
public/assets/effects/skills/         ← fx_summon_circle
public/assets/characters/battle/      ← 적 유닛 10종
public/assets/characters/fullbody/    ← (신규 생성 필요) 전신 시트
```

`public/assets/ui/icons/{classes,moods,stats,tabs}`는 벡터 아이콘으로 가므로 **비워 둔다**.

---

## 10. 검증

에셋 배치 후 아래를 확인한다.

1. `node tools/art/capture-before.mjs` 계열 스크립트로 `screenshots/after/`를 뽑아 before와 대조한다.
2. 로드 스모크(태스크 T-27)로 이 표의 모든 텍스처 키가 **실제 이미지**인지 검사한다. 캔버스 폴백이 남아 있으면 실패로 본다.
3. Vite dev 서버가 없는 에셋에 `index.html`을 200으로 돌려주므로(태스크 T-04 이전) 404가 마스킹된다. 검증은 텍스처 크기로 하고 HTTP 상태로 하지 않는다.

---

## 11. 생성·적용 현황 (2026-09-02)

T-02(`PreloadScene.loadPhase0_Assets()`) + T-27(`tests/e2e/asset-smoke.mjs`) + 후처리 파이프라인(`tools/art/postprocess-assets.py`) 완료 시점의 스냅샷. `node tools/art/postprocess-assets.mjs`(멱등, Codex가 소스를 계속 추가하는 대로 재실행하면 자동으로 따라잡는다)를 다시 돌리면 이 표는 갱신되지 않는다 — 수동 갱신 문서다.

### 11-1. 배경 (전부 완료, 14/14) — **2026-09-02 WebP 전환 + eager/lazy 분리**

`art/gen/assets_bg2/`가 소스. 전부 v1 채택, **`bg_chapter_2`만 v2 채택**(v1은 도리이 문에 문자 흔적이 남아 리롤). `public/assets/backgrounds/{scenes,battle}/`에 1082×1581 **WebP q80**(무알파) + `_blur` 페어(가우시안 24px + 밝기 −15%, 역시 WebP q80)로 저장 완료. 예전 PNG 산출물은 정리했다(§11-6).

**eager(2종)**: `bg_main`, `bg_login` — `PreloadScene.loadPhase0_Assets()`가 부팅 시 로드.
**lazy(12종)**: `bg_gacha`, `bg_stageselect`, `bg_tower`, `bg_result_victory`, `bg_result_defeat`, `bg_chapter_1~5`, `bg_pvp`, `bg_raid` — `manifest.lazyTextures`에 등록, `BackgroundFactory.createSceneBg(scene, key)`가 씬 진입 시점에 동적 로드.

### 11-2. UI 요소 (frame/button/logo/icon) — 부분 완료 12/22 (Codex가 계속 생성 중이라 계속 늘어난다)

| id | 상태 | 비고 |
|----|------|------|
| `frame_panel`, `frame_popup`, `frame_card_N`, `frame_card_R`, `frame_card_SR`, `frame_card_SSR`, `frame_hex` | ✅ 완료 | `public/assets/ui/frames/*.webp` (q85, 알파 유지). 9-slice 코너값은 스케일 비율만큼 줄여 `asset-manifest.json`에 기록 |
| `btn_primary`, `btn_secondary`, `btn_ghost` | ✅ 완료 | `public/assets/ui/buttons/*.webp` (q85, 알파 유지). 소스가 1024×320(스펙과 일치)이라 왜곡 없이 512×160으로 다운스케일 |
| `icon_currency_gold/gem/energy/ticket/spirit_stone`(5) | ✅ 완료 | PNG 유지(포맷 미변경). 콘텐츠 트림 + 8px 패딩이라 종별 크기가 다름 |
| `panel_header_ornament` | ⛔ **제외됨** | 소스가 2172×724(≈3:1)인데 목표가 512×64(8:1)라 심하게 눌려서 manifest에서 완전히 뺐다. `tools/art/regen-list.json`에 재생성 필요 사유 기록(1024×128, 8:1 권장) |
| `logo_arcane_collectors`, `icon_cult_*`(9) | ⏳ 소스 대기 | `art/gen/assets/`에 아직 파일 없음. `node tools/art/postprocess-assets.mjs` 재실행 시 자동 처리(멱등) |
| `fx_summon_circle` | ⛔ **제외됨** | 소스(`art/gen/assets/fx_summon_circle.png`)가 RGB(알파 없음)라 manifest에서 뺐다. `tools/art/regen-list.json`에 기록. 스펙은 "alpha via chroma key" 전제인데 실제로는 배경 합성이 안 되어 있음 — **알파 있는 버전으로 재생성 필요** |

### 11-3. 배너 (완료 2/2, 지연 로드)

`banner_pickup_iris`, `banner_pickup_generic` 전부 완료. `art/gen/assets/`의 v1 채택, 680×560 크롭 + 하단 20% `#0D0F1A` 그라데이션 페이드 적용(PNG 유지, 포맷 미변경). `manifest.lazyTextures`에 등록되며 **PreloadScene이 로드하지 않는다**(GachaScene/GachaPopup 진입 시 지연 로드 대상, 소비 코드는 별도 트랙).

### 11-4. 적 유닛 (소스 없음 0/10)

`enemy_slime` 등 10종 전부 `art/gen/assets/`에 소스가 없어 스킵. 생성 트랙이 아직 이 배치를 시작하지 않은 것으로 보인다. 재실행 시 자동 처리됨.

### 11-5. 전신 히어로 (완료 30/34, 스펙 밖 별도 트랙)

`art/gen/fullbody/hero_XXX.png`(RGBA) → `public/assets/characters/fullbody/hero_XXX.webp`(긴 변 1024 상한, q85, 알파 유지). `hero_007~010` 4장은 재생성 대기 중이라 소스 자체가 없어 스킵(팀 리드 사전 고지). `manifest.fullbody`에 `fb_hero_XXX` 키로 노출되며 **PreloadScene이 로드하지 않는다.** HeroDetailScene의 지연 로드 도입(W2)이 소비할 차례.

> `asset-spec.json`의 `fullbody_hero_001~004` 4개 항목은 실제 소스가 없는 구버전 스텁이다(별도 트랙의 실제 산출물은 `hero_005~038`). 후처리 스크립트가 조용히 건너뛴다.

### 11-6. 초기 전송량 예산 — 해결됨 (36.8MB → 1.09MB)

| 항목 | 이전(2026-09-02 1차) | 이후(2026-09-02 2차, 현재) |
|------|----------------------|----------------------------|
| eager 텍스처 구성 | 배경 14종×2(본+블러, PNG 무알파) + 프레임/버튼 11종 | 배경 2종×2(본+블러, WebP q80) + 프레임/버튼 10종(WebP q85) + 아이콘 5종(PNG) |
| 초기 전송량 | **36.79 MB** | **1.09 MB** (−97%) |
| 예산 | 8 MB (경고만, 실패 아님) | **6 MB (asset-smoke가 실패로 카운트)** |
| 판정 | ❌ 초과 4.6배 | ✅ 예산의 18% |

조치 내역: (1) `bg_main`/`bg_login` 외 배경 12종을 `lazyTextures`로 옮기고 `BackgroundFactory.createSceneBg()`가 씬 진입 시 동적 로드하도록 확장. (2) 배경 본+블러, 프레임, 버튼을 PNG에서 WebP로 전환(배경 q80 무알파, 프레임·버튼 q85 알파 유지) — SSOT는 `tools/art/_build-asset-spec.mjs`, 재생성은 `node tools/art/_build-asset-spec.mjs`. (3) `panel_header_ornament`(종횡비 왜곡)와 `fx_summon_circle`(알파 없음)을 manifest에서 제외하고 `tools/art/regen-list.json`에 재생성 필요 항목으로 기록.

**구현 중 발견한 버그 2건(둘 다 이 작업 중 수정)**:
- `BackgroundFactory.createSceneBg()`의 기존 텍스처 존재 검사가 `TextureGenerator`의 캔버스 플레이스홀더(`bg_gacha`, `bg_tower`에 항상 존재)를 "실제 아트 로드됨"으로 오인해, 이 두 키는 동적 로드가 영원히 트리거되지 않는 상태였다. `_isCanvasTexture()` 판별을 추가해 캔버스면 여전히 폴백 경로로 보내도록 수정.
- `BackgroundFactory.createGachaBg()`(기존 프로시저럴 폴백, 이번 트랙 신규 코드 아님)가 `circle.add(hexagram)`을 호출하는데 `circle`이 `Graphics`라 `.add()`가 없어 크래시했다. 이전엔 아무도 이 경로를 실행한 적이 없어 발견되지 않았던 잠재 버그. 불필요한 호출을 제거해 수정(시각적 차이 없음 — `hexagram`은 이미 독립된 씬 오브젝트).

### 11-7. 검증 결과 (2026-09-02, 최종)

| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | 통과 (0 errors) |
| `npm run build` | 통과 (54.3s) |
| `npx vitest run` | **1183/1183 통과** (0 실패 — 이전 보고했던 `IdleProgressSystem` 실패는 다른 트랙이 해결함) |
| `node tests/e2e/boot-smoke.mjs` | 6/6 통과 |
| `node tests/e2e/asset-smoke.mjs` | **9/9 통과** (예산 6MB 이내 확인, 실패 시 종료 코드 1) |
| `BackgroundFactory.createSceneBg()` 동적 로드 수동 검증 | `gacha`/`tower`(캔버스 충돌 케이스), `pvp`/`chapter_3`(무캔버스 케이스) 4종 전부 폴백→실이미지 승격 확인(임시 playwright 스크립트로 검증 후 삭제, 커밋 없음) |
