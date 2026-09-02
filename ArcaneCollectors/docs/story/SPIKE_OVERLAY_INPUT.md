# T-S1 스파이크 — 팝업 위 Scene 오버레이 입력 처리 (UXI-05)

> 대상 질문: `docs/story/UX_ONBOARDING_FLOW.md` §7 UXI-05
> 검증 환경: Phaser 3.90.0 / Vite 5.4.21 / Chromium(Playwright, headless) / 뷰포트 540×960
> 실증 여부: **실증 완료**. 실제 앱(`MainMenuScene` + 실제 `PopupBase`)에서 계측했다.
> 작성 시점: 2026-09-02

---

## 1. 결론

**가능(조건부 없음).** 팝업(depth 2000) 위에 별도 Phaser Scene을 오버레이로 얹으면
하위 Scene의 팝업 버튼과 팝업 자체 dim이 **모두 차단되고**, 오버레이에 뚫은 구멍 영역에서는
클릭이 **하위 팝업 버튼으로 정확히 통과**한다. 좌표계도 별도 보정 없이 일치한다.

다만 **권장 구현은 별도 Scene이 아니라 같은 Scene 내 depth 3000 컨테이너**다.
두 방식 모두 입력 동작은 동일하게 검증되었으나, 같은 Scene 방식이 씬 순서 의존성과
수명주기 관리 부담을 없앤다. 근거는 §5.

UXI-05의 대안(컷씬을 `AscensionPopup` 진입 **전**으로 이동)은 **불필요하다.**
T-09를 원래 설계대로 팝업 위 오버레이로 구현해도 된다.

---

## 2. Phaser 입력 규칙 — 소스 근거

### 2-1. Scene 간 입력 순서

`InputManager.updateInputPlugins()`가 DOM 이벤트마다 **씬 목록을 역순(최상위 먼저)** 으로 순회한다.

- `node_modules/phaser/src/input/InputManager.js:526` — `var scenes = this.game.scene.getScenes(false, true);`
  두 번째 인자 `inReverse=true`. `SceneManager.getScenes()` (`SceneManager.js:857-876`)는
  `this.scenes` 배열을 그대로 뒤집어 반환한다. 즉 **배열 뒤쪽 = 입력 우선**이다.
- `InputManager.js:534-542` — 각 씬의 `input.update()` 반환값이 `true`이고
  `globalTopOnly`가 켜져 있으면 즉시 `return`. 아래 씬들은 이벤트를 아예 받지 못한다.
- `InputManager.js:225` — `this.globalTopOnly = true;` 가 기본값이다.

### 2-2. "차단"의 판정 기준 — 구멍 통과의 원리

여기가 이 스파이크의 핵심이다. 차단 여부는 **씬이 실제로 인터랙티브 오브젝트를 맞췄는지**로 정해진다.

- `InputPlugin.js:709-793` — `update()`는 `total > 0`일 때만 `captured = true`를 만든다.
  `total`은 `processDownEvents()` 등이 실제로 이벤트를 디스패치한 오브젝트 개수다.
- `InputPlugin.js:727` — `this._temp = this.hitTestPointer(pointer);`
  히트 테스트 결과가 빈 배열이면 `total`은 0이고, 따라서 `captured`는 `false`다.

**결과**: 오버레이 Scene의 차단막이 포인터 위치에서 히트되지 않으면(=구멍) 그 씬은 캡처하지 않고,
`updateInputPlugins`의 루프가 계속 돌아 아래 씬(팝업이 있는 씬)이 이벤트를 받는다.
구멍은 "이벤트를 재전달"하는 것이 아니라 **애초에 캡처하지 않는 것**이다. 이 차이 때문에
별도의 forwarding 코드가 전혀 필요 없다.

### 2-3. `topOnly` 는 씬 내부 얘기다 — 혼동 주의

`InputPlugin#topOnly`(`InputPlugin.js:185`, 기본 `true`)는 **한 씬 안에서 겹친 오브젝트 중
최상위 하나만** 이벤트를 받게 하는 옵션이다. 씬 간 차단과는 무관하다.
씬 간 차단을 끄는 스위치는 `InputManager#globalTopOnly` 하나뿐이다.

중요한 순서: `topOnly` splice는 **히트 테스트 이후**에 일어난다(`InputPlugin.js:727-744`).
따라서 히트되지 않은 오브젝트는 애초에 `_temp`에 없다. 구멍 안에서 차단막이 잘리는 게 아니라
아예 후보에 오르지 않는다.

### 2-4. 커스텀 hitArea 콜백의 좌표

`obj.setInteractive(fn)` 형태로 함수만 넘기면 `hitArea = {}`, `hitAreaCallback = fn`이 된다
(`InputPlugin.js:2414-2418`).
콜백에 들어오는 `x, y`는 `InputManager.pointWithinHitArea()` (`InputManager.js:963-967`)에서
**로컬 좌표 + displayOrigin** 으로 정규화된 값이다.
`Zone(0, 0, W, H).setOrigin(0, 0)`을 쓰면 `x, y`가 **게임 월드 좌표와 정확히 일치**하므로
구멍 판정식을 그대로 쓸 수 있다. 실측에서도 그대로 맞았다.

### 2-5. 마스크는 입력에 관여하지 않는다

`InputManager.inputCandidate()` (`InputManager.js:842-865`)는 `input.enabled`와
`gameObject.willRender(camera)`, 그리고 부모 컨테이너의 `willRender`만 본다.
**마스크(Geometry/Bitmap)는 조회하지 않는다.** 마스크는 순수 렌더 단계 기능이다.

동시에 `willRender(camera)` 검사 때문에 **`setVisible(false)`를 걸면 입력도 죽는다.**
차단막을 시각적으로 숨기면서 입력만 살리는 것은 불가능하다(알파 0.001 같은 편법이 필요하다.
실제로 `PopupBase.js:44`의 패널 blocker가 `setAlpha(0.001)`을 쓰는 이유가 이것이다).

---

## 3. 현행 코드 확인 — 팝업의 dim

`src/components/PopupBase.js:24-27`

```js
const overlay = this.scene.add.rectangle(GAME_WIDTH/2, GAME_HEIGHT/2, GAME_WIDTH * 2, GAME_HEIGHT * 2, 0x000000, 0.85);
overlay.setInteractive();
overlay.on('pointerdown', () => this.hide());
```

- 전체화면의 **4배 크기**(2160×3840) dim이 interactive다. 화면 어디를 눌러도 걸린다.
- `pointerdown` 핸들러가 `hide()`다. 즉 **팝업 바깥을 누르면 팝업이 닫힌다.**
- 이 dim이 `topOnly`에 의해 하위 씬 오브젝트를 전부 삼키므로, 팝업이 떠 있는 동안
  `MainMenuScene`의 버튼은 원래도 눌리지 않는다(§4 [B4] 참조).

**튜토리얼 강제 스텝에서의 함의**: 구멍을 팝업 **패널 밖(dim 영역)** 에 뚫으면 팝업이 닫힌다.
구멍은 반드시 패널 내부의 실제 타깃 위에만 뚫어야 한다. 부득이하게 dim 위에 구멍이 필요하면
강제 스텝 동안 dim의 `pointerdown` 리스너를 떼어두어야 한다(§7 주의점 3).

---

## 4. 실측 로그

### 4-1. 실앱 계측 (실제 `PopupBase` + 실제 `MainMenuScene`)

게스트 로그인 → `MainMenuScene` 도달 → `page.evaluate`로 `/src/components/PopupBase.js`를
동적 import 하여 계측용 팝업 생성(버튼 A/B 2개). 소스는 수정하지 않았다.
오버레이는 `game.scene.add('TutorialOverlayScene', {create(){...}}, true)`로 런타임 주입했다.

```
canvas rect  = {"x":30,"y":0,"w":480,"h":960}
실 PopupBase container.depth=2000  dim=2160x3840
버튼A=[540,780]  버튼B=[540,1140]  홀={"x":315,"y":713,"w":450,"h":135}
scene 배열 전체: BootScene > LoginScene > PreloadScene > MainMenuScene > GachaScene > ...
                 ... > TowerScene > QuestScene > SettingsScene
active scene: MainMenuScene

[B1] 팝업만 — 버튼A                 -> ["btnA"]
[B2] 팝업만 — 버튼B                 -> ["btnB"]
[B3] 팝업만 — 팝업 밖 딤            -> ["popupDim"]

  (오버레이 Scene 주입)
active scene(주입 후): MainMenuScene > TutorialOverlayScene
globalTopOnly=true  ov.topOnly=true  mm.topOnly=true
overlay  cam [sx,sy,zoom,w,h]=[0,0,1,1080,1920]
MainMenu cam [sx,sy,zoom,w,h]=[0,0,1,1080,1920]
scale mode=3(FIT)  gameSize=1080x1920  display=480x853

[R1] 구멍 밖 버튼B (차단 기대)       -> ["overlayBlocker"]     ✅ 차단
[R2] 팝업 밖 딤 (차단 기대)          -> ["overlayBlocker"]     ✅ 차단 (팝업 안 닫힘)
[R3] 구멍 안 버튼A (통과 기대)       -> ["btnA"]               ✅ 통과
[R4] 구멍 안 연속 2회                -> ["btnA","btnA"]        ✅ 반복 안정
[R5] 딤→구멍 이동 직후 즉시 클릭     -> ["btnA"]               ✅ over/out 간섭 없음
[R6] MainMenu 하단 메뉴 영역 클릭    -> ["overlayBlocker"]     ✅ 차단
[R7] 오버레이 제거 후 버튼B          -> ["btnB"]               ✅ 원복
```

### 4-2. 좌표계 정합성 실측 (720×1280 base → 1080×1920 FIT)

포인터를 페이지 좌표에 두고 Phaser가 인식한 게임 좌표를 역측정했다.

```
canvas attr  = {"w":1080,"h":1920}      canvas style = {"w":"480px","h":"853.333px"}
canvasBounds = [30,0,480,960]

의도 (540,780)   -> Phaser 인식 (540,780)    오차 (0,0)
의도 (540,1140)  -> Phaser 인식 (540,1140)   오차 (0,0)
의도 (100,100)   -> Phaser 인식 (99,100)     오차 (-1,0)
의도 (1000,1800) -> Phaser 인식 (999,1800)   오차 (-1,0)
의도 (315,713)   -> Phaser 인식 (315,712)    오차 (0,-1)
의도 (765,848)   -> Phaser 인식 (765,848)    오차 (0,0)
```

오버레이 Scene과 `MainMenuScene`의 메인 카메라가 `scrollX/Y=0, zoom=1, 1080×1920`으로
**완전히 동일**하다. FIT 스케일은 `ScaleManager` 레벨에서 처리되므로 씬마다 다시 적용되지 않는다.
오버레이 Scene에서 `s(360)` 같은 기존 좌표 헬퍼를 **그대로** 쓰면 된다.

> 주의: 게임 해상도는 720×1280이 아니라 **1080×1920**이다(`src/config/scaleConfig.js:10-13`,
> `SCALE_FACTOR = 1.5`). 기획 문서의 720×1280은 base 좌표이며 `s()`를 통과해야 한다.

### 4-3. 씬 순서 의존성 실측 (별도 하네스)

`sendToBack`/`bringToTop`으로 순서를 뒤집어 §2-1의 규칙을 직접 확인했다.

```
[T6]  sendToBack  순서=TutorialOverlayScene > HostScene | 구멍 밖 버튼B -> ["btnB"]           ❌ 차단 실패
[T6b] bringToTop  순서=HostScene > TutorialOverlayScene | 구멍 밖 버튼B -> ["overlayBlocker"] ✅ 차단
[T7]  globalTopOnly=false        | 구멍 밖 버튼B -> ["overlayBlocker","btnB"]  ⚠️ 둘 다 발화
[T7b] 오버레이 카메라 invisible   | 구멍 밖 버튼B -> ["btnB"]                   ❌ 차단 실패
[T7c] 오버레이 scene.pause()      | 구멍 밖 버튼B -> ["btnB"]                   ❌ 차단 실패
```

### 4-4. 대안 방식 실측 — 같은 Scene 내 depth 3000 컨테이너

```
[T8a] 같은Scene depth3000 | 구멍 밖 버튼B  -> ["sameSceneBlocker"]  ✅ 차단
[T8b] 같은Scene depth3000 | 구멍 안 버튼A  -> ["btnA"]              ✅ 통과
[T8c] 같은Scene depth3000 | 팝업 밖 딤     -> ["sameSceneBlocker"]  ✅ 차단
[T9]  같은Scene, 홀 없음  | 버튼A          -> ["sameSceneBlocker"]  ✅ 전면 차단
```

별도 Scene과 **완전히 같은 결과**다. 같은 씬 안에서는 `topOnly`가 depth 순으로
최상위 하나만 남기므로(`InputPlugin.js:732-744`), depth 3000 > 2000이면 팝업을 덮는다.
구멍은 `hitAreaCallback`이 `false`를 반환해 후보에서 빠지고, 그 다음 순위인
depth 2000 팝업 버튼이 선택된다.

---

## 5. 권장 구현 방식

### 결론: **같은 Scene 내 depth 3000 컨테이너**를 쓴다

`Z_INDEX.TUTORIAL_MASK = 3000` / `TUTORIAL_CONTENT = 3010`
(`UX_ONBOARDING_FLOW.md` §4-1에 이미 정의된 값)을 `src/config/layoutConfig.js`에 추가하고,
튜토리얼 오버레이를 **팝업이 뜬 그 씬에** 컨테이너로 붙인다.

| 비교 항목 | 별도 오버레이 Scene | 같은 Scene depth 3000 |
|---|---|---|
| 입력 차단 | ✅ 검증됨 | ✅ 검증됨 |
| 구멍 통과 | ✅ 검증됨 | ✅ 검증됨 |
| 좌표계 | ✅ 동일 | ✅ 자명하게 동일 |
| 씬 순서 관리 | ⚠️ `bringToTop` 필수. 다른 씬이 `start`되면 재확인 필요 | 불필요 |
| 타깃 오브젝트 참조 | ⚠️ 크로스 씬 조회. `getBounds()` 월드 좌표 변환 필요 | 같은 씬이라 `children.getByName()` 직행 |
| 수명주기 | ⚠️ `launch`/`stop`/`remove` + `create` 1프레임 지연 | 컨테이너 생성/파괴로 즉시 |
| 씬 전환 시 정리 | ⚠️ 오버레이만 남아 떠 있을 위험 | 부모 씬 `shutdown`에 자동 동반 |
| 팝업 위에 겹치기 | ✅ | ✅ |

**결정 근거**: 별도 Scene이 주는 유일한 실익은 "씬 전환 중에도 오버레이가 살아남는 것"인데,
튜토리얼 오버레이는 §4-1의 3단 타깃 해석 규약상 **항상 특정 씬의 특정 오브젝트에 붙는다.**
씬이 바뀌면 어차피 타깃이 사라지므로 오버레이도 같이 죽는 편이 옳다.
반대로 별도 Scene은 `bringToTop` 누락, 씬 전환 시 고아 오버레이, 크로스 씬 좌표 변환이라는
세 가지 실패 모드를 새로 만든다. 얻는 것 없이 리스크만 늘어난다.

**단, 컷씬(`CutsceneScene`)은 별도 Scene이 맞다.** 컷씬은 씬 경계를 넘어 재생되고
전체 화면을 점유하며 자체 입력만 받으면 되므로 §2의 차단 규칙이 그대로 유리하게 작동한다.
T-09의 경우 `CutsceneScene`(별도 Scene, 구멍 없음)과
`TutorialOverlay`(같은 씬 depth 3000, 구멍 있음)를 분리해 쓰면 된다.
UXI-05가 걱정한 "컷씬을 팝업 진입 전으로 옮기는 대안"은 채택할 필요가 없다.

### 구멍 처리: **hitArea 콜백 + 시각용 마스크 분리**

§2-5에서 확인했듯 마스크는 입력에 전혀 관여하지 않는다. 따라서 둘 중 택일이 아니라 **역할 분담**이다.

| 층 | 수단 | 이유 |
|---|---|---|
| 입력 구멍 | 전체화면 `Zone` + 커스텀 `hitAreaCallback` | 임의 형상 지원, 오브젝트 1개로 끝남. 실측 검증 완료 |
| 시각 구멍 | `Graphics` 딤 + `BlendModes.ERASE` 또는 Geometry Mask(`invertAlpha`) | 라운드 사각형·원형 스포트라이트 자유롭게 표현 |

입력용 `Zone`은 반드시 **시각 요소와 분리된 별개 오브젝트**여야 한다.
`Graphics`에 직접 `setInteractive`를 걸면 `getBounds()` 신뢰성 문제
(`UX_ONBOARDING_FLOW.md` §4-1 바운드 계산 규약에 이미 명시)와 겹쳐 디버깅이 어려워진다.

4분할 사각형(상/하/좌/우 밴드)으로 구멍을 만드는 방법도 동작하지만 권장하지 않는다.
사각형 홀만 가능하고 오브젝트가 4개로 늘며, `spotlight_sequence`처럼 홀이 움직일 때
4개를 매 프레임 재배치해야 한다.

---

## 6. T-C4 / T-C6 구현용 의사코드

```js
// src/components/tutorial/TutorialOverlay.js — 팝업이 뜬 씬에 그대로 붙인다
import { Z_INDEX } from '../../config/layoutConfig.js';   // TUTORIAL_MASK 3000 / TUTORIAL_CONTENT 3010

export class TutorialOverlay {
  constructor(scene) { this.scene = scene; this.root = null; }

  show({ hole = null, dimAlpha = 0.72 } = {}) {          // hole: {x,y,w,h} 월드좌표, null이면 전면 차단
    const { width: W, height: H } = this.scene.scale.gameSize;
    this.root = this.scene.add.container(0, 0).setDepth(Z_INDEX.TUTORIAL_MASK);

    const dim = this.scene.add.graphics();               // 시각: ERASE 로 구멍을 판다
    dim.fillStyle(0x000000, dimAlpha).fillRect(0, 0, W, H);
    if (hole) {
      dim.setBlendMode(Phaser.BlendModes.ERASE);
      dim.fillStyle(0x000000, 1).fillRoundedRect(hole.x, hole.y, hole.w, hole.h, 12);
      dim.setBlendMode(Phaser.BlendModes.NORMAL);
    }
    this.root.add(dim);

    // 입력: Zone 은 origin(0,0) 이라 콜백 x,y == 월드좌표 (InputManager.js:963)
    const blocker = this.scene.add.zone(0, 0, W, H).setOrigin(0, 0);
    blocker.setInteractive((_hitArea, x, y) => !(hole
      && x >= hole.x && x <= hole.x + hole.w && y >= hole.y && y <= hole.y + hole.h));
    blocker.on('pointerdown', () => this.scene.events.emit('tutorial:blockedTap'));
    this.root.add(blocker);                              // 구멍 밖 → 캡처, 구멍 안 → 미히트 → depth 2000 팝업으로 통과
    return this;
  }

  hide() { this.root?.destroy(true); this.root = null; }  // 팝업 dim 을 건드렸다면 여기서 반드시 복구
}
```

---

## 7. 주의점

1. **게임 해상도는 1080×1920이다.** 기획서의 720×1280은 base 좌표다.
   `fallbackAnchor`의 정적 좌표를 그대로 쓰면 2/3 위치에 찍힌다. 반드시 `s()`를 통과시켜라.
   `hole` 계산도 `getBounds()` 결과(이미 월드=1080×1920 좌표)와 `s()` 값을 섞지 말 것.

2. **`setVisible(false)`는 입력까지 죽인다** (`InputManager.js:842`, 실측 [T7b]).
   오버레이를 잠깐 숨기려면 `alpha = 0.001`을 쓰거나(현행 `PopupBase.js:44` 패턴)
   `input.enabled`를 명시적으로 토글하라. 반대로 **입력만 확실히 끄고 싶으면
   `setVisible(false)` 또는 `scene.pause()`가 확실하다**(실측 [T7c]).

3. **`PopupBase`의 dim이 팝업을 닫는다** (`PopupBase.js:26`).
   강제 스텝(T-03/05/07/09) 동안 구멍을 패널 밖에 두면 유저가 팝업을 닫아버릴 수 있다.
   구멍은 패널 내부 타깃 위에만 두고, 그래도 필요하면 스텝 시작 시
   `dim.removeAllListeners('pointerdown')`으로 떼었다가 스텝 종료 시 복구하라.
   복구를 빠뜨리면 **팝업을 닫을 수 없는 갇힘 상태**가 된다.

4. **`globalTopOnly`를 절대 끄지 마라** (실측 [T7]). `false`로 두면 오버레이와 팝업 버튼이
   **둘 다** 발화한다. 차단이 아니라 이중 실행이 된다. 기본값 `true`를 유지하라.

5. **별도 Scene을 쓴다면 `bringToTop`이 필수다** (실측 [T6]). `ScenePlugin.launch()`는
   `queueOp('start')`만 하고 씬 배열 순서를 바꾸지 않는다(`ScenePlugin.js:481-489`).
   `gameConfig.scene` 배열의 등록 순서가 그대로 우선순위다. 또한 `create()`는
   다음 씬 매니저 업데이트에 실행되므로 **1프레임 뒤에야** 오버레이가 존재한다.
   `UX_ONBOARDING_FLOW.md` §4-1의 "1프레임 대기" 규약과 일치한다.

6. **`PopupBase.hide()`는 150ms 트윈 후에 파괴된다** (`PopupBase.js:112-121`).
   팝업이 닫히는 도중에도 컨테이너와 인터랙티브 오브젝트가 살아 있다.
   `completionCondition`이 팝업 닫힘을 볼 때 `isOpen` 플래그(즉시 `false`가 됨)를 기준으로 하고,
   컨테이너 존재 여부로 판단하지 마라.

7. **구멍 안쪽에도 팝업 dim이 깔려 있다.** `PopupBase`의 dim은 2160×3840으로 화면의 4배다.
   구멍을 통과한 클릭이 팝업 버튼이 아닌 곳에 떨어지면 `popupDim`이 잡아 팝업이 닫힌다.
   구멍은 타깃 hitArea에 **딱 맞게** 잡고 여유 패딩을 크게 주지 마라.

8. **호버 상태는 차단 시 하위로 새지 않는다** (실측 [R5], `InputManager.js:534`).
   `MOUSE_MOVE`도 같은 캡처 경로를 타므로 오버레이가 막고 있으면 팝업 버튼의
   `pointerover`도 발화하지 않는다. 차단 중 하이라이트 연출은 오버레이가 직접 그려야 한다.

---

## 8. 검증 과정에서 발견한 별건

스파이크 도중 작업 트리의 앱이 부팅되지 않는 순환 의존 회귀를 발견해 팀에 보고했고,
`coll-01`이 수정을 반영한 뒤 실앱 실증을 진행했다.

```
ReferenceError: Cannot access 'COLORS' before initialization
    at /src/components/popups/CollectionPopup.js:27
```

`gameConfig.js`가 최상단에서 `MainMenuScene`을 import하고 그것이 `CollectionPopup`을 import하는데,
`CollectionPopup`의 모듈 스코프 상수가 `COLORS`를 import 시점에 평가해 TDZ에 걸린 것이다.
`COLORS`는 `gameConfig.js:63`으로 씬 import보다 아래에 선언되어 있다.

**교훈**: `gameConfig.js`에서 값을 import하는 모듈은 **모듈 스코프에서 그 값을 평가하면 안 된다.**
튜토리얼 관련 신규 모듈(`TutorialOverlay`, `CoachMark`, `TutorialTargetRegistry`)도
`Z_INDEX`, `COLORS`를 모듈 최상단 상수 계산에 쓰지 말고 함수 내부에서 참조하라.
`layoutConfig.js`는 씬을 import하지 않으므로 `Z_INDEX`는 상대적으로 안전하지만,
같은 습관을 유지하는 편이 낫다.

---

## 9. UXI-05 처리 결과

| 항목 | 결과 |
|---|---|
| 팝업 위 오버레이 입력 차단 | ✅ 동작. 별도 Scene / 같은 Scene 둘 다 |
| 구멍 영역 클릭 통과 | ✅ 동작. 재전달 코드 불필요 |
| 팝업 자체 dim과의 상호작용 | ✅ 차단됨. 단 구멍 위치 규약 필요(§7-3, §7-7) |
| 720×1280 FIT 좌표계 정합 | ✅ 오차 ±1px. 카메라 파라미터 완전 동일 |
| UXI-05 대안(컷씬 앞당기기) | **불필요.** 원 설계대로 진행 가능 |
| 잔여 리스크 | 없음. §7 주의점만 구현 시 준수 |
