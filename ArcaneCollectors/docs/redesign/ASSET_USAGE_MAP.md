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

**로드 규칙 3가지**

1. 배경·프레임·버튼·아이콘·로고는 `PreloadScene.loadPhase0_Assets()`에서 **일괄 등록**한다. 전 씬이 공유하므로 한 번만 로드한다.
2. 배너와 전신·적 스프라이트는 **지연 로드**한다. 배너는 교체 주기가 짧고, 전신은 조회 대상 1명만 필요하며, 적은 스테이지마다 다르다.
3. 모든 로드에는 **프로시저럴 폴백이 남아 있어야 한다.** 이미지가 없으면 기존 `TextureGenerator` / `BackgroundFactory` / `IconFactory` 결과를 그대로 쓴다. 에셋 도입이 회귀를 만들지 않게 하는 조건이다.

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
