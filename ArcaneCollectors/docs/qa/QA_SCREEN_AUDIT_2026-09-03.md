# ArcaneCollectors 화면·기능 전수 QA 감사 (2026-09-03)

Playwright로 3개 계정 시나리오 × 34개 화면을 실조작하며 콘솔 에러, 옛 캐릭터 이미지, 레이아웃 겹침,
터치 타깃 미달, 기능 실패를 수집했다. 총 102 스텝, 캡처 102장.

- 스윕 스크립트: `tests/e2e/qa-sweep.mjs` (재실행 가능)
- 원자료: `docs/qa/qa-sweep-result.json`
- 캡처: `docs/qa/screens/<번호>-<시나리오>-<화면>.png`
- 대상: `http://localhost:3000` (공유 개발 서버), 뷰포트 720×1280, 게임 좌표 1080×1920 (base 720 · SCALE 1.5)

## 실행 조건 경고

감사 중 다른 에이전트 6종이 동시에 `src/`를 저장해 Vite HMR 리로드가 스텝당 평균 0.1회 발생했다.
스윕은 리로드를 감지해 1회 재시도하지만, **아래 "환경 잡음" 절의 항목은 제품 결함이 아니라 개발 서버 부하의 산물**이다.
확정 결함과 잡음을 분리하기 위해 의심 항목은 전부 단독 부팅 프로브로 재확인했다.

## 스코어보드 (최종 런)

| 지표 | 값 |
|---|---|
| 스텝 | 102 |
| 스텝 실패 | 1 (시나리오 C `tutorial-T01`, HMR 리로드로 컨텍스트 소실) |
| 콘솔 에러 | 0 |
| 페이지 예외 | 0 |
| 옛 이미지 지점 | 85 (전부 환경 잡음으로 판정, 아래 참조) |
| 텍스트 겹침 | 31 (고유 16종) |
| 화면 밖 이탈 | 0 |
| 터치 타깃 48px 미달 | 62 (고유 23종) → **0** (P2-1 수정 후 재스윕) |

> **재스윕 (2026-09-03, P2-1·P2-5·P2-6 수정 후)** — 102스텝 / 실패 0 / 콘솔 에러 0 / 페이지 예외 0 /
> 터치 타깃 미달 **0** / 화면 밖 0. 겹침 17·옛 이미지 191은 각각 P1-4(진행 중)와 4절 환경 잡음이다.
> `docs/qa/qa-sweep-result.json`과 `docs/qa/screens/`는 이 재스윕 결과로 갱신됐다.

## 계정 시나리오

| ID | 계정 | 주입 방식 |
|---|---|---|
| A | 레거시 기존 유저 — `version: 1` 세이브, `char_1~4` 파티, 챕터 2 진행 | `localStorage.arcane_collectors_save` 사전 주입 |
| B | 풍부한 유저 — 기본영웅 10 + 전직영웅 24 보유, 튜토리얼 완주, 챕터 3 | 동일 |
| C | 신규 게스트 — 세이브 없음, 로그인 → 프롤로그 → 튜토리얼 | 게스트 세션만 주입 |

---

# 1. P0 — 서비스 핵심 경로

없음. 부팅, 로그인, 소환, 전투 진입, 전투 종료, 세이브 마이그레이션 모두 완주했다.
콘솔 에러 0건, 처리되지 않은 예외 0건.

---

# 2. P1 — 주요 기능 오작동 / UX 심각 저하

## P1-1. 스테이지 파티 선택 모달이 저장된 파티를 버린다

**증상** — 스테이지 [진입]을 누르면 파티 선택 모달이 뜨는데, 4슬롯이 전부 비어 있고
`총 전투력: 0`, 벽 경고는 `내 파티 0 / 권장 12,700 · 매우 어려움 (0.00×)`로 표시된다.
파티 편성 화면에서 저장한 파티가 반영되지 않아, 전투 때마다 [자동 편성]을 누르거나 4명을 수동 배치해야 한다.
벽 경고의 배율이 항상 `0.00×`라 난이도 안내가 무의미해진다.

**재현** — 시나리오 B(파티 4인 저장 상태) → 모험 → 챕터 5 → `5-5` 진입 → 파티 선택 모달.
자동 검사 기록: `slots: [null,null,null,null]`, `savedParty: ["asc_iris_olympus","asc_sera_avalon","asc_luca_asgard","asc_kai_yomi"]`, `ownedHeroes: 34`.

**캡처** — `docs/qa/screens/35-B-stageselect-wall-warning.png`

**의심 위치** — `src/scenes/StageSelectScene.js:1204` `showPartySelect()`
모달을 열 때마다 무조건 슬롯을 비운다. 세이브의 `parties[0]`을 읽는 코드가 이 경로에 없다.

```js
// Clear party slots
this.partySlots.forEach(slot => {
  slot.hero = null;
  slot.slotText.setText('+');
  slot.slotBg.setStrokeStyle(2, COLORS.primary, 0.5);
});
```

시나리오 A(1인 파티)에서도 동일하게 재현됐다.

## P1-2. PvP·길드 팝업이 탭 스트립을 두 번 그리고, 탭을 바꿀 때마다 한 벌씩 더 쌓는다

**증상** — `대전`/`결과`/`랭킹`(PvP), `길드 정보`/`길드원`/`기부`(길드) 라벨이
같은 좌표에 정확히 2벌 겹쳐 그려진다. 픽셀이 동일해 눈에는 잘 안 띄지만
텍스트가 이중 렌더되어 굵어 보이고, 히트 영역이 중복되며, 탭 전환마다 오브젝트가 누적된다.

**근거** — 자동 검사에서 겹침 비율 1.00으로 6쌍 검출.
`대전` `{x:215,y:390,w:43,h:30}` × 2, `결과` `{x:519,y:391}` × 2, `랭킹` `{x:823,y:391}` × 2 (길드도 동형).

**재현** — 메인 → PvP(또는 길드) 팝업 열기. 탭을 바꿀수록 사본이 늘어난다.

**캡처** — `docs/qa/screens/12-B-popup-pvp.png`, `13-B-popup-guild.png`

**원인** — `src/components/popups/PvPPopup.js:115` `_renderTabs()` 와
`src/components/popups/GuildPopup.js:83` `_renderTabs()` 가 생성한 오브젝트를 `_tabObjects`에 넣지 않는다.
`_clearTabContent()`는 `_tabObjects`만 파괴하므로 탭 스트립이 살아남는다.
`buildContent()`가 `_renderTabs()` 직후 `_loadAndRenderTab()`을 호출해 열자마자 2벌이 된다.

**대조군** — `RaidPopup.js:100`과 `FriendsPopup.js:92`는 같은 구조지만
`this._tabObjects.push(bg)` / `push(txt)`를 하고 있어 겹침이 검출되지 않았다. 두 파일의 패턴을 그대로 옮기면 된다.

## P1-3. 소환 결과 오버레이가 팝업을 떠나도 화면에 남는다

**증상** — 10연 소환 연출 도중 소환 팝업이 닫히면 `GachaResultOverlay`(씬 루트, depth 3010)가 고아로 남는다.
이후 영웅 목록 팝업, 영웅 정보 팝업을 열어도 결과 카드와 `다시 소환`/`확인` 버튼이 위에 계속 떠 있다.
오버레이가 전면 입력을 삼키므로 그 아래 화면은 조작 불가다.

**캡처** — `docs/qa/screens/23-B-heroinfo-popup.png`
(영웅 정보 팝업 캡처인데 화면 대부분을 이전 소환 결과가 덮고 있다)

**재현(현재 확인된 경로)** — 10연 소환 → 공개 연출 중 팝업을 프로그램적으로 닫음 → 다른 팝업 열기.

**주의** — 연출 중에는 `GachaPopup._lockClose()`가 닫기를 막고 오버레이가 전면을 덮어
사용자가 직접 이 경로를 타기는 어렵다. 스윕 하네스가 잠금을 우회해 만든 상태다.
다만 씬 전환·앱 복귀처럼 잠금을 거치지 않는 경로가 있으면 그대로 재현되므로
`MainMenuScene.destroyOrphanPopups()`가 오버레이까지 회수하도록 보강할 가치가 있다.

**의심 위치** — `src/components/popups/GachaPopup.js` `showSummonAnimation()` / `_clearSummonOverlay()` / `destroy()`,
`src/scenes/MainMenuScene.js` `destroyOrphanPopups()`

## P1-4. 중첩 팝업(HeroInfoPopup)이 하위 팝업 헤더와 같은 자리에 겹쳐 그려진다

**증상** — 영웅 목록에서 카드를 눌러 영웅 정보 팝업을 열면,
새 팝업의 타이틀(`아이리스`)과 닫기 `✕`가 하위 팝업의 타이틀(`영웅 목록`)·`✕`와 픽셀 단위로 같은 좌표에 놓인다.
두 텍스트가 겹쳐 읽히고, 겹친 `✕` 두 개 중 어느 것이 눌리는지 예측할 수 없다.

**근거** — 겹침 비율 1.00. `영웅 목록 {x:84,y:115,w:141,h:46}` × `아이리스 {x:84,y:115,w:133,h:46}`,
`✕ {x:963,y:122,w:30,h:33}` × 2. 시나리오 A·B 모두 재현.

**의심 위치** — `src/components/HeroInfoPopup.js`(중첩 팝업은 `Z_INDEX.POPUP_NESTED = 2100`,
`src/config/layoutConfig.js:169`)와 `PopupBase`의 헤더 레이아웃.
중첩 팝업이 하위 팝업 헤더를 가리는 불투명 배경을 깔지 않는다.

## P1-5. 레거시 유저는 마이그레이션으로 보유 영웅 4명이 1명으로 줄어든다

**증상** — `version: 1` 세이브(`char_1~4` 4인 파티, 계정 레벨 18, 전투 143회)를 로드하면
마이그레이션 후 보유 영웅이 `base_iris` 1명, 파티가 `[base_iris, null, null, null]`이 된다.

**기록** — `docs/qa/screens/48-A-migration-result.png`
```
{"version":2,"characters":["base_iris"],"party":["base_iris",null,null,null],
 "tutorialCompleted":true,"grantVersion":2,"spiritStones":6,
 "unlockedMenus":[13종 전부]}
```

**판정** — 이것은 `SaveManager._migrateLegacyStarters()`의 **설계된 동작**이다
(레거시 스타터 제거 → 최고 레벨 승계 → 장비 인벤토리 반환 → 파티 재구성).
따라서 "옛 카툰 이미지가 남는가"에 대한 답은 **남지 않는다**이다. 마이그레이션 후 `char_1~4`는 어디에도 렌더되지 않는다.

**남는 리스크** — 실사용자 관점에서는 보유 영웅 4명이 예고 없이 1명이 되는 변화다.
마이그레이션 시점에 무엇이 통합됐는지 알리는 1회성 안내가 없다. 이탈 위험이 크므로 P1로 분류한다.

**의심 위치** — `src/systems/SaveManager.js` `_migrateLegacyStarters()` (레거시 정리 로그는 남기지만 UI 통지가 없음)

---

# 3. P2 — 부수 기능·미관·접근성

## P2-1. 터치 타깃 48px(base) 미달 23종

`DESIGN.touch.minTarget = 48` (`src/config/designSystem.js:193`) 기준.
**측정은 시각 bounds가 아니라 `input.hitArea`로 했다.** `PopupBase`의 `✕`는 히트 영역을 48px로 넓혀두어
(`src/components/PopupBase.js:368-378`) 목록에서 제외됐다. 아래는 실제로 미달한 것만이다.

| 대상 | 크기(base) | 위치 |
|---|---|---|
| 영웅 목록 정렬 칩 (등급/레벨/전투력/분위기/교단) | 60×28 | `src/components/popups/HeroListPopup.js:118,128` |
| 영웅 목록 등급 필터 (N/R/SR/SSR) | 38×24 | `src/components/popups/HeroListPopup.js:169` |
| 영웅 목록 교단 필터 원형 9개 | 20×20, 간격 22px | `src/components/popups/HeroListPopup.js:201` |
| 팝업 탭 스트립 (가방·PvP·길드·친구) | 199×36 | `TAB_STRIP_HEIGHT = 44` → 실제 36 |
| 팝업 탭 스트립 (무한탑·레이드) | 300×36 | 동일 |
| 파티 선택 모달 닫기 `✕` | 20×22 | `src/scenes/StageSelectScene.js:1125` |
| 소탕 모달 닫기 `✕` | 20×22 | `src/scenes/StageSelectScene.js:1554` |
| 벽 경고 CTA `▸ 동료 늘리러 가기` / `▸ 각인하러 가기` | 106×17 / 91×17 | `StageSelectScene` 벽 경고 영역 |
| 복귀 카드 `나중에` | 43×19 | `src/components/ReturningPlayerCard.js` |
| 복귀 카드 `[각인하러 가기]` / `[도감에서 보기]` | 99×19 | 동일 |
| 영웅 목록 씬 `초기화` | 34×13 | `src/scenes/HeroListScene.js` |
| 파티 편성 씬 뒤로 `◁` | 32×29 | `src/scenes/PartyEditScene.js` |
| 파티 편성 팝업 닫기 `✕` | 13×15 | `PartyEditPopup` |
| 이벤트 던전 버튼 | 80×35 | `src/components/popups/EventDungeonPopup.js` |

가장 시급한 것은 **교단 필터 원형 20×20 / 간격 22px**이다. 인접 타깃 간 여백이 2px라 오탭이 확실하다.

### 해소 (2026-09-03, 재스윕 102스텝: 미달 62 → **0**)

시각 크기는 전부 그대로 두고 `input.hitArea`만 넓혔다. 계산은 `src/utils/touchLayout.js`(순수),
적용은 `src/utils/touchTarget.js`의 `ensureMinTouchTarget()`이 맡는다 —
`PopupBase`의 ✕가 감사에서 통과한 것과 같은 방식이다.

히트를 넓히면 인접 타깃끼리 겹치므로, 겹침이 생기는 곳은 간격부터 벌렸다.

| 대상 | 조치 |
|---|---|
| 교단 필터 원형 9개 | 원형 20px 유지, 간격 22 → **52** (히트 48 + 여백 4). 팝업·씬 양쪽 |
| 영웅 목록 팝업 필터 바 | 3행 피치 38/36 → **54** (히트 48 + 여백 6), `FILTER_BAR_HEIGHT` 108 → 166 |
| 영웅 목록 씬 필터 바 | 2행 피치 45 → **54**. 등급 필터·`초기화`를 정렬 줄 오른쪽으로 옮겨 교단 원형이 아래 줄을 독점 |
| 팝업 탭 스트립 8종 | `TAB_STRIP_HEIGHT = 44`(밴드) / 시각 36 은 유지, 히트만 48. 콘텐츠 top(+56)과 안 겹친다 |
| 복귀 카드 `나중에` | 히트 48. 위 최우선 버튼(h 64)과 4px 겹쳐서 y를 +52 → **+62** 로 내림 |
| 파티 편성 슬롯 제거 `✕` | 히트 48 이 옆 슬롯을 침범해 슬롯 안쪽으로 10px 당김 |
| 그 외 (모달 ✕ 2종, 벽 경고 CTA, 자동 편성/전투 시작, 복귀 카드 CTA, `초기화`, `◁`, 이벤트 던전 버튼, 퀘스트 `수령`) | 히트만 48 로 확장 |

벽 경고 CTA는 라벨이 바뀔 때마다(`updateWallWarning`) 히트를 다시 건다 —
빈 문자열 상태의 폭 0으로 굳으면 다시 미달이 된다.

**예외 없음.** 3개 시나리오 102스텝 재스윕에서 `smallTargetHits: 0`이다.

## P2-2. `hero_base_iris@2x` 텍스처 중복 등록 경고

**증상** — 영웅 상세에서 탭을 옮기면(씬 재시작) 콘솔에
`Texture key already in use: hero_base_iris@2x`가 뜬다. 화면은 정상이나 로더가 요청을 버린다.

**재현** — 영웅 상세 진입 → `장비` 탭 → 다른 탭 → 다시 진입. 시나리오 A 스텝 75에서 2회 관측.

**의심 위치** — `src/systems/HeroAssetLoader.js:97` `queueHiresTexture()`
`scene.textures.exists(key)`만 확인한다. 로더 큐에 이미 같은 키가 올라가 있거나
이전 씬 인스턴스의 캐시가 남은 경우를 걸러내지 못한다.

## P2-3. 포트레이트 로드 실패가 조용히 80px 캔버스로 떨어진다

**증상** — 포트레이트 이미지 로드가 실패하면 `_createEnhancedPlaceholder()`가 80×80 캔버스를 만들어
**같은 텍스처 키로 캐시**한다. 이후 세션 내내 실제 512px 아트가 다시 들어올 수 없다.
소환 결과 카드처럼 365px로 확대되는 자리에서는 4.5배 업스케일된 흐린 사각형이 된다.

**핵심 문제는 로그가 없다는 점이다.** 스윕 런에서 전 포트레이트가 플레이스홀더였는데도 콘솔 에러 0건이었다.
배포 환경에서 CDN 실패가 나도 아무도 모른다.

**의심 위치** — `src/systems/HeroAssetLoader.js:275` `loaderror` 핸들러 (경고 없이 폴백)

## P2-4. 레거시 256px 아트 4종을 계정과 무관하게 항상 로드한다

`portrait-mapping.json`은 `char_1~4 → hero_001~004`를 유지하고,
`PreloadScene`이 로스터 38명 전원을 큐에 올린다(`src/scenes/PreloadScene.js:342`).
`hero_001~004`는 256×256 구 카툰 아트다(신규 아트 `hero_005~038`은 512×512).

`char_1~4`는 가챠 풀(`GachaSystem.initializePool()`은 base + ascended만 사용)에 없고
마이그레이션으로 계정에서도 제거되므로 **획득 불가**다. 부팅 시 죽은 에셋 4개를 계속 받아온다.

참고로 `public/assets/characters/portraits/`의 `hero_039~091` 53개도 전부 256px 구 아트인데
매핑에 없어 로드되지 않는다. 저장소에는 남아 있다.

## P2-5. 스크롤 목록의 초기 스크롤 위치가 어긋나 첫 항목이 잘린다

영웅 목록 팝업과 퀘스트 팝업 모두 목록 상단이 필터 바/헤더 아래로 파고들어
첫 행이 절반만 보이고, 목록 하단에는 200px 가까운 빈 공간이 남는다.

**캡처** — `docs/qa/screens/04-B-popup-herolist.png`, `06-B-popup-quest.png`

**원인 (확정)** — 두 화면이 서로 다른 이유로 같은 증상을 냈다.

- **퀘스트 팝업** — `ScrollContainer`의 콘텐츠 자식은 **절대 화면 좌표**를 쓴다(모듈 §좌표 규약).
  그런데 카드를 `y = index × 피치`, 즉 화면 y=0부터 쌓았다. 뷰포트 top이 렌더 396px이라
  앞의 3~4장이 통째로 마스크 위로 밀려났고, 그 396px이 그대로 바닥 빈 공간이 됐다.
  `y = startY + index × 피치`로 고쳤다.
- **영웅 목록(팝업·씬)** — 카드가 원점 **중앙**인데 첫 행 중심을 뷰포트 top에 뒀다.
  위쪽 절반(75px)이 잘렸다. 게다가 `maxScroll`을 행 피치 합으로 잡아
  마지막 행 뒤 gap과 카드 절반만큼 더 스크롤됐다 — 그게 바닥 빈 칸이다.
  `computeRowCenterY()` / `computeGridScroll()`(`src/utils/touchLayout.js`)로 두 식을 묶었다.

`ScrollContainer` 자체는 옳았다(`AscensionPopup`은 같은 규약을 지켜 증상이 없다). 수정하지 않았다.

**해소** — 재스윕 캡처에서 첫 항목이 온전히 보이고 목록이 액션 바까지 채워진다.

## P2-6. 메인 메뉴 파티 아바타 이름이 음절 중간에서 잘린다

`번개의 아`, `성역의 세`, `문학자 루`, `사신의 카` — 4명 모두 말줄임 없이 잘린다.

**캡처** — `docs/qa/screens/01-B-mainmenu-idle-1.png`

**원인** — `MainMenuScene`이 `name.substring(0, 5)`로 무조건 5글자를 잘랐다.
폭이 모자라서가 아니다. 슬롯 폭은 162(기획 px)이고 caption 12px 기준 12글자가 들어간다.

**해소** — `mainMenuLayout.fitPartySlotName()`(순수)이 어절 단위로 자르고 `…`를 붙인다.
현재 로스터 최장 이름은 `혼돈연금사 파올로`(9자)라 **전부 온전히 표시된다**.
서체 폴백으로 실제 폭이 넘칠 때를 대비해 `_shrinkTextToWidth()`가 폰트를 한 단계씩 줄인다.
재스윕 캡처에서 `번개의 아이리스 / 성약의 세라 / 룬학자 루카 / 사신의 카이` 전부 온전하다.

## P2-7. 전투 화면에서 적 유닛이 검은 실루엣으로 렌더된다

`드라우그` 2기가 형체 없는 검은 도형이다. 아군은 실제 포트레이트 카드인데 적만 실루엣이라 대비가 심하다.
또한 전멸한 아군(레온·카이)이 살아있는 아군과 동일한 채도로 남아 사망 상태를 구분할 수 없다.

**캡처** — `docs/qa/screens/36-B-battle-auto.png`

## P2-8. 세이브에 `rarity`가 없으면 DB를 조회하지 않고 R로 떨어진다

영웅 상세에서 SSR 전직영웅이 `R` 뱃지에 `Lv.50 / 30`(기본영웅 상한)으로 표시됐다.
`src/scenes/HeroDetailScene.js:126`이 `getRarityKey(this.hero.rarity)`로 **세이브 레코드**의 등급을 쓰고,
바로 아래에서 만드는 `this.heroData`(영웅 DB 항목)를 폴백으로 쓰지 않는다.

**주의** — 감사에 쓴 세이브가 합성이라 `rarity` 필드가 없었다. 정상 경로로 획득한 영웅에는 필드가 있으므로
실사용자에게 바로 보이는 문제는 아니다. 다만 세이브 손상·구버전 호환 시 조용히 잘못된 등급을 보여준다.

**캡처** — `docs/qa/screens/25-B-herodetail-stats.png`

## P2-9. 로그인 화면에 개발용 문자열이 노출된다

화면 하단에 `dev · Supabase OFF`가 그대로 보인다. 프로덕션 빌드에서 감춰야 한다.

**캡처** — `docs/qa/screens/102-C-mainmenu-new-guest.png`

---

# 4. 환경 잡음으로 판정한 항목 (제품 결함 아님)

정직하게 분리해 둔다. 아래는 스윕이 잡았지만 단독 부팅으로 재현되지 않았다.

## 옛 이미지 85건 — 전부 HMR 리로드 중 프리로드 미완료 상태

스윕은 파티 아바타·영웅 카드가 80×80 캔버스 플레이스홀더라고 85건을 보고했다.
동일 조건 단독 부팅 프로브 2회로 반증했다.

| 확인 | 결과 |
|---|---|
| `PreloadScene._portraitLoadStats` | `{roster: 38, queued: 38, skipped: 0}` |
| 텍스처 매니저 hero_* | 이미지 38 / 캔버스 0 |
| 메인 메뉴에 실제 렌더된 파티 아바타 | `hero_base_iris`, canvas=false, 512×512 |
| 포트레이트 요청 실패 | 0건 |

스윕 최종 런의 시나리오 A도 종료 시점에 38/38이 이미지(256×256 + 512×512)였다.
같은 런의 시나리오 B는 종료 시점에 hero 텍스처가 4개뿐이고 전부 캔버스였는데,
이는 직전 HMR 리로드로 `PreloadScene` 2단계가 실행되기 전에 `MainMenuScene`이 `ensureTexture()`로
플레이스홀더를 만들어 캐시한 상태다. 개발 서버가 조용할 때는 재현되지 않는다.

**다만 P2-3(무경고 폴백)은 이 잡음이 드러낸 실제 리스크다.** 폴백이 로그 없이 일어난다는 사실 자체는 참이다.

## 화면 밖 이탈 353건 → 0건

초기 검사기가 스크롤 마스크 안의 목록 항목을 "화면 밖"으로 셌다.
마스크 조상을 가진 오브젝트를 제외하도록 고치자 0건이 됐다. 실제 이탈은 없다.

## 터치 타깃 129종 → 23종

초기 검사기가 `getBounds()`(시각 크기)로 쟀다. `input.hitArea`로 바꾸자
`PopupBase`의 `✕`(글리프 20×22, 히트 48×48)를 비롯한 대부분이 정상으로 판명됐다.

## 겹침 중 3종은 검사기 오탐

`젬 50 ~ 일일 퀘스트`, `★★★ ~ 2,063`, `★★★★★ ~ 역전·불굴·베르세르크`는
마스크로 클리핑된 스크롤 항목과 마스크 밖 텍스트를 비교한 결과다. 캡처상 겹침이 없다.

## 시나리오 C 튜토리얼 정체

한 런에서 `T-02`에 멈춘 것처럼 보였으나, 컷씬을 1개만 건너뛴 하네스 문제였다.
연쇄 컷씬을 모두 처리하자 `T-03`(첫 전투, `overlay: true`)까지 정상 진행했다.
`T-02`는 `highlightType: cutscene_only`라 코치마크가 없는 것이 정상이다(`src/data/tutorial.json`).

## 복귀 카드 미표시

`maybeShowReturningPlayerCard()`가 `time.delayedCall(900)`으로 띄우는데
하네스가 동기적으로 확인해 false negative가 났다. 대기 후 재확인하니 `판정=queued 표시=true`로 정상이다.

## 이벤트 던전 팝업 예외

첫 런에서 `Cannot read properties of undefined (reading 'evt_dragon_raid')`가 1회 났으나
이후 4개 런과 단독 프로브에서 재현되지 않았다. `EventDungeonSystem.getEventProgress()`가
`save(data)` 직후 `_checkDailyReset()`에서 `SaveManager.load()`를 다시 하는 구조라
저장 실패 시 `data.eventDungeons`가 undefined가 될 수 있다(`src/systems/EventDungeonSystem.js:461-463`).
방어 코드 한 줄(`if (!data.eventDungeons) return;`)을 넣어둘 가치는 있다.

---

# 5. 화면별 표

`E` = 콘솔 에러 + 페이지 예외, `옛` = 옛 이미지 지점, `겹` = 텍스트 겹침, `탭` = 터치 타깃 미달.
옛 이미지 열은 전부 환경 잡음(4절)이다.

## 시나리오 B — 풍부한 유저

| # | 화면 | 캡처 | E | 옛 | 겹 | 탭 | 기능 |
|---|---|---|---|---|---|---|---|
| 01 | 메인 메뉴 (유휴 전투 1) | `01-B-mainmenu-idle-1.png` | 0 | 0 | 0 | 0 | OK |
| 02 | 메인 메뉴 (유휴 전투 2, +6초) | `02-B-mainmenu-idle-2.png` | 0 | 0 | 0 | 0 | OK |
| 03 | 소환 팝업 | `03-B-popup-gacha.png` | 0 | 0 | 0 | 0 | OK |
| 04 | 영웅 목록 팝업 | `04-B-popup-herolist.png` | 0 | 0 | 0 | 3 | 첫 행 클리핑 |
| 05 | 파티 편성 팝업 | `05-B-popup-partyedit.png` | 0 | 0 | 0 | 2 | OK |
| 06 | 퀘스트 팝업 | `06-B-popup-quest.png` | 0 | 0 | 1* | 0 | 스크롤 시작 위치 |
| 07 | 무한탑 팝업 | `07-B-popup-tower.png` | 0 | 0 | 0 | 1 | OK |
| 08 | 각인 팝업 | `08-B-popup-ascension.png` | 0 | 0 | 0 | 0 | OK |
| 09 | 이벤트 던전 팝업 | `09-B-popup-eventdungeon.png` | 0 | 0 | 0 | 1 | OK |
| 10 | 가방 팝업 | `10-B-popup-inventory.png` | 0 | 0 | 0 | 1 | OK |
| 11 | 설정 팝업 | `11-B-popup-settings.png` | 0 | 0 | 0 | 0 | OK |
| 12 | PvP 팝업 | `12-B-popup-pvp.png` | 0 | 0 | **3** | 1 | **탭 이중 렌더 (P1-2)** |
| 13 | 길드 팝업 | `13-B-popup-guild.png` | 0 | 0 | **3** | 1 | **탭 이중 렌더 (P1-2)** |
| 14 | 레이드 팝업 | `14-B-popup-raid.png` | 0 | 0 | 0 | 1 | OK |
| 15 | 친구 팝업 | `15-B-popup-friends.png` | 0 | 0 | 0 | 1 | OK |
| 16 | 도감 팝업 | `16-B-popup-collection.png` | 0 | 0 | 0 | 0 | OK |
| 17 | 스토리 로그 팝업 | `17-B-popup-storylog.png` | 0 | 0 | 0 | 0 | OK |
| 18 | 소환 배너 탭 전환 | `18-B-gacha-tab-switch.png` | 0 | 0 | 0 | 0 | `hero → pickup` OK |
| 19 | 확률 고지 | `19-B-gacha-rate-disclosure.png` | 0 | 0 | 0 | 0 | OK |
| 20 | 단발 소환 결과 | `20-B-gacha-single-result.png` | 0 | 0 | 0 | 0 | OK |
| 21 | 10연 소환 결과 | `21-B-gacha-ten-result.png` | 0 | 0 | 0 | 0 | 3.2초 후에도 1장씩 공개 중 |
| 22 | 영웅 목록 필터·정렬 | `22-B-herolist-filter-sort.png` | 0 | 0 | 0 | 3 | 34명 정렬 OK |
| 23 | 영웅 정보 팝업 | `23-B-heroinfo-popup.png` | 0 | 0 | **4** | 3 | **오버레이 잔존 (P1-3) + 헤더 겹침 (P1-4)** |
| 24 | 영웅 목록 씬 | `24-B-scene-herolist.png` | 0 | 0 | 0 | 5 | OK |
| 25 | 영웅 상세 · 능력치 | `25-B-herodetail-stats.png` | 0 | 0 | 0 | 0 | 등급 폴백 (P2-8) |
| 26 | 영웅 상세 · 스킬 | `26-B-herodetail-skills.png` | 0 | 0 | 0 | 0 | OK |
| 27 | 영웅 상세 · 장비 | `27-B-herodetail-equip.png` | 0 | 0 | 0 | 0 | OK |
| 28 | 영웅 상세 · 이야기 | `28-B-herodetail-story.png` | 0 | 0 | 0 | 0 | OK |
| 29 | 파티 편성 씬 | `29-B-scene-partyedit.png` | 0 | 0 | 0 | 3 | `autoFormParty()` OK |
| 30-34 | 스테이지 선택 챕터 1~5 | `30~34-B-stageselect-chN.png` | 0 | 0 | 0 | 0 | 챕터 이동 OK |
| 35 | 파티 선택 모달 · 벽 경고 | `35-B-stageselect-wall-warning.png` | 0 | 0 | 0 | 3 | **저장 파티 미복원 (P1-1)** |
| 36 | 전투 (자동) | `36-B-battle-auto.png` | 0 | 0 | 0 | 0 | 아군 4 · 적 3 · 스킬카드 4 OK |
| 37 | 전투 (수동 · 스킬) | `37-B-battle-manual-skills.png` | 0 | 0 | 0 | 0 | AUTO `false→true` OK |
| 38 | 전투 결과 (승리) | `38-B-battleresult-win.png` | 0 | 0 | 0 | 0 | OK |
| 39 | 전투 결과 (패배) | `39-B-battleresult-lose.png` | 0 | 0 | 0 | 3 | 재진입 중 HMR |
| 40-42 | 각인 1~3단계 | `40~42-B-ascension-*.png` | 0 | 4 | 0 | 0 | 컷씬 진입 확인 |
| 43 | 도감 · 수집 탭 | `43-B-collection-tab-collect.png` | 0 | 4 | 0 | 0 | OK |
| 44 | 도감 · 이야기 탭 | `44-B-collection-tab-story.png` | 0 | 4 | 0 | 0 | `StoryLogPopup` 전환 OK |
| 45 | 설정 상세 | `45-B-settings-detail.png` | 0 | 4 | 0 | 0 | OK |
| 46 | 복귀 카드 (30일) | `46-B-returning-card.png` | 0 | 4 | 0 | 0 | 판정·표시 OK |
| 47 | 디버그 FAB | `47-B-debug-fab.png` | 0 | 4 | 0 | 2 | OK |

\* 마스크 클리핑 오탐 (4절).

## 시나리오 A — 레거시 기존 유저 (48~95)

시나리오 B와 동일한 화면 집합을 같은 순서로 돌았고, 결과도 동형이다. 차이만 적는다.

| # | 화면 | 캡처 | 차이 |
|---|---|---|---|
| 48 | 마이그레이션 결과 | `48-A-migration-result.png` | `v1 → v2`, 영웅 4→1명, 메뉴 13종 전부 해금, 정령석 6 소급 지급 (P1-5) |
| 55-71 | 각 팝업 | `55~71-A-*.png` | 파티 아바타 캔버스 플레이스홀더 1건씩 (환경 잡음) |
| 70 | 영웅 목록 필터·정렬 | `70-A-herolist-filter-sort.png` | 보유 12명(소환으로 늘어난 상태) |
| 83 | 파티 선택 모달 | `83-A-stageselect-wall-warning.png` | 1인 파티도 복원 안 됨 (P1-1) |
| 85-86 | 전투 수동·승리 | `85~86-A-*.png` | HMR 리로드로 BootScene 복귀 |

## 시나리오 C — 신규 게스트 (96~102)

| # | 화면 | 캡처 | 결과 |
|---|---|---|---|
| 96 | 부팅 · 로그인 | `96-C-boot-login.png` | `LoginScene` 정상. `dev · Supabase OFF` 노출 (P2-9) |
| 97 | 게스트 로그인 탭 | `97-C-guest-login-tap.png` | 실좌표 탭 → `CutsceneScene` 진입 OK |
| 98 | 프롤로그 컷씬 | `98-C-prologue-cutscene.png` | OK |
| 99 | 튜토리얼 T-01 | `99-C-tutorial-T01.png` | 컷씬 2개 통과 → `T-03`, `overlay: true` (별도 런에서 확인) |
| 100-101 | 튜토리얼 T-02/T-03 | `100~101-C-*.png` | `T-03`은 `stage_clear 1-1` 완료 조건이라 탭만으로 진행 안 됨 (정상) |
| 102 | 신규 게스트 메인 | `102-C-mainmenu-new-guest.png` | 최종 런은 HMR로 로그인 화면 복귀 |

---

# 6. 화면별 UI 개선 제안

각 3줄 이내.

**메인 메뉴** — 파티 아바타 이름을 말줄임 처리하거나 카드 폭을 넓혀 `번개의 아` 같은 절단을 없앤다.
메뉴 그리드 마지막 행 라벨이 화면 하단에 물리므로 그리드를 24px 위로 올린다.
유휴 전투 뷰의 아군 4명이 한 덩어리로 겹치니 x 간격을 벌리고 `Lv.` 라벨을 스프라이트 아래로 내린다.

**영웅 목록 (팝업/씬)** — 교단 필터 원형을 20px → 44px, 간격 22px → 52px로 키운다.
목록 초기 스크롤 오프셋을 마스크 상단에 맞춰 첫 행 잘림을 없앤다.
`Lv.30` 텍스트가 카드 하단에 물리고 대비가 낮으니 카드 안쪽으로 넣고 밝기를 올린다.

**영웅 정보 팝업** — 중첩 팝업에 불투명 헤더 배경을 깔아 하위 팝업 타이틀·`✕`와의 겹침을 끊는다.
`✕`가 두 개 겹쳐 보이므로 중첩 팝업 헤더를 32px 아래로 내려 시각적 계층을 만든다.
배경 딤을 0.6 이상으로 올려 하위 목록이 비쳐 읽히지 않게 한다.

**영웅 상세** — 등급 뱃지를 세이브가 아닌 영웅 DB에서 해석해 잘못된 `R` 표기를 막는다.
`Lv.50 / 30`처럼 현재 레벨이 상한을 넘는 조합은 상한 쪽을 영웅 타입별로 다시 계산한다.
탭 재진입 시 `@2x` 중복 등록 경고가 나므로 로더 큐 중복 검사를 추가한다.

**스테이지 선택 · 파티 선택 모달** — 저장된 파티를 슬롯에 미리 채워 `총 전투력: 0`을 없앤다.
모달 하단 200px 빈 공간을 줄이고 `자동 편성`/`전투 시작` 버튼을 확대한다.
닫기 `✕`(20×22)를 48px 히트 영역으로 넓히고 배경 딤을 강화해 뒤 목록이 읽히지 않게 한다.

**전투** — 적 유닛이 검은 실루엣이라 아군 포트레이트와 이질적이다. 최소한 실루엣에 교단 색 림라이트를 준다.
전멸한 아군 카드를 회색조 + 알파 0.5로 낮춰 생존 여부를 즉시 구분하게 한다.
적 HP 수치가 이름 라벨과 붙으니 8px 간격을 준다.

**소환** — 10연 결과가 1장씩 공개돼 3초 뒤에도 전체를 못 본다. 전체 그리드로 건너뛰는 버튼을 상시 노출한다.
결과 카드 하단 절반이 빈 검은 영역이니 이름·등급·신규 여부를 그 자리로 옮긴다.
연출 중 씬이 바뀌어도 오버레이가 회수되도록 `MainMenuScene` 정리 경로에 등록한다.

**PvP · 길드** — 탭 스트립 오브젝트를 `_tabObjects`에 등록해 이중 렌더를 없앤다(레이드·친구 팝업과 동일 패턴).
탭 높이 36px를 48px로 올린다.
빈 상태에서 800px가 비므로 안내 문구를 중앙으로 내리고 CTA를 함께 둔다.

**퀘스트** — 목록 초기 스크롤을 첫 항목 상단에 맞춘다.
보상 텍스트가 11px 저대비라 13px + 밝은 색으로 올린다.
하단 여백을 줄여 `전체 수령` 버튼을 목록에 가깝게 붙인다.

**복귀 카드** — `나중에`(43×19), `[각인하러 가기]`(99×19)를 48px 히트 영역으로 넓힌다.
링크형 텍스트 대신 보조 버튼 스타일을 써서 탭 가능함을 드러낸다.
선물 목록 아이콘과 수량 사이 간격을 늘려 `600 25,000 10 6`이 붙어 보이지 않게 한다.

**로그인** — `dev · Supabase OFF`를 프로덕션 빌드에서 감춘다.
`게스트로 시작` 외에 이메일 로그인 진입점이 화면에 보이지 않으니 보조 링크를 노출한다.
로고와 버튼 사이 400px 여백을 줄여 첫 화면 밀도를 올린다.

---

# 7. 재실행

```bash
# 개발 서버가 http://localhost:3000 에서 떠 있어야 한다
node tests/e2e/qa-sweep.mjs                 # 3개 시나리오 전체 (약 14분)
node tests/e2e/qa-sweep.mjs --only=B        # 특정 시나리오만
node tests/e2e/qa-sweep.mjs --headed        # 브라우저 표시
SMOKE_BASE_URL=http://localhost:5173 node tests/e2e/qa-sweep.mjs
```

스크립트가 하는 일:

- 시나리오별 세이브를 `page.addInitScript`로 문서 로드 전에 주입한다 (`SaveManager` v2 스키마).
- 스텝마다 활성 씬 트리를 재귀 순회해 텍스트·이미지 bounds, 텍스처 소스, 히트 영역, 마스크 조상을 수집한다.
- 옛 이미지: 파일명 `hero_001~004` / `hero_039~091`, 캔버스 텍스처, `placeholder` 키, `?` 폴백 텍스트를 잡는다.
- 겹침: 같은 씬·같은 최상위 depth 층의 텍스트 쌍 중 교차 면적이 작은 쪽의 30%를 넘는 것만 보고한다.
- 화면 밖: 스크롤 마스크 하위는 제외한다.
- 터치 타깃: `input.hitArea`를 월드 스케일로 환산해 base 48px 미만을 보고한다.
- `[vite] connected`가 찍히면 해당 스텝을 1회 재시도한다.

**개발 서버가 조용할 때 돌려야 한다.** 다른 프로세스가 `src/`를 저장하면 4절의 잡음이 다시 섞인다.
