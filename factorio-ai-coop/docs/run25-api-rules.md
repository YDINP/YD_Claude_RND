# run25 규칙: 게임을 바꾸는 Lua API 금지

사용자 결정 (2026-10-01). run25부터 스크립트는 **게임 세계를 직접 바꾸는 Lua를 쓸 수 없다**.
세계를 바꾸는 일은 **사람 플레이어가 할 수 있는 행동**이어야 하고, **캐릭터 주문**
(`orders.submit` / `agent.submit` / `ai.act`)으로만 내린다. 주문은 모드(`mods/ai-bridge_0.3.0`)가
사람처럼 검증한다. 손이 닿는지, 지도에 보이는지, 놓을 수 있는 자리인지를 본다.

- 검사기: `python scripts/apilint.py` (아래 §6)
- 모드 쪽 구현: `mods/ai-bridge_0.3.0/acts.lua` (새 일감), `tasks.lua` (옛 일감)
- 가짜 게임 시험: `python tests/acts_mock.py` (`pip install lupa` 필요, 없으면 건너뛴다)

---

## 1. 허용과 금지

### 허용

| 무엇 | 어떻게 |
|---|---|
| 읽기만 하는 질의 | `ai.lua("...")`로 `find_entities_filtered`, `get_item_count`, `get_contents`, `status`, `logistic_network` 등을 읽는다. 읽기용 원격(`observe`, `inspect`, `stores`, `broken`, `research_status` 등)도 된다. |
| 걷기, 캐기, 짓기, 손제작, 상자에 넣고 꺼내기, 동료에게 건네기, 줍기, 싸우기 | 옛 일감 `walk_to`, `mine`, `chop`, `build`, `demolish`, `craft`, `insert`, `take`, `give`, `sweep`, `attack` |
| 레시피, 돌리기, 필터, 칸 제한, 물류 요청, 켬/끔 조건, 발사 버튼 | 새 **손 조작** 일감 (§2). 손이 닿아야 한다 (`can_reach_entity`). |
| 유령, 해체 표시, 교체 표시, 블루프린트식 아이템 요청, 연구 선택 | 새 **지도 조작** 일감 (§2). 거리 제한은 없고 지도에 보이는 곳(charted chunk)이어야 한다. 유령은 `can_place_entity{build_check_type = manual_ghost}`를 통과해야 한다. |
| 요원 몸 만들기와 리스폰 | `spawn`, `revive`, `remove`는 관리 기능이다. 사람의 리스폰과 같다. |

### 금지 (스크립트의 Lua 문자열 안에서)

`surface.create_entity`(`entity-ghost`, `item-request-proxy` 포함), `teleport`와 `unstick` 원격,
엔티티/인벤토리의 `insert`·`remove_item`·`remove{}`·`set_stack`·`clear`, 유체 넣기와 빼기,
`entity.set_recipe`, `get_logistic_sections`·`add_section`·`set_slot`, `set_filter`,
`get_or_create_control_behavior`·`circuit_condition`·`logistic_condition`, 전선 잇기,
`.direction =`·`.rotate()`, `force.research_queue =`·`add_research`·`researched =`,
`silo.launch_rocket()`, `destroy()`·`die()`·`damage()`, `order_upgrade`·`order_deconstruction`(Lua로 직접),
`revive`, `force.chart`(와 `chart_all`), `.active =`·`.operable =`·`.health =`·`.energy =`·`.amount =` 같은
사람이 못 바꾸는 값, 캐릭터 `walking_state`·`mining_state`·`begin_crafting`·`mine_entity` 직접 조작,
`set_tiles`·`clone_*`, `spill_item_stack`, 게임 속도나 보너스 같은 규칙값.
세계를 바꾸던 옛 원격 `give`, `unstick`, `set_recipe`, `aim_drill`, `feed_belts`, `research`를
감싸개 없이 `ai.call("...")`로 직접 부르는 것도 금지다.

---

## 2. 캐릭터 일감 (주문) 목록

`submit`(큐에 넣기)은 **걸어가서** 한다. `ai.act(요원, 종류, **인자)`는 **서 있는 자리에서 지금** 한다.
act는 걷지 않으므로 손 조작은 이미 닿는 거리여야 하고, 안 닿으면 `out of reach` 오류가 난다.
지도 조작과 연구는 act로 어디서나 된다. 요원을 `None`으로 주면 산 사람 아무나 한다.

### 옛 일감 (그대로)

| 일감 | 인자 | 검증 |
|---|---|---|
| `walk_to` | x, y, tolerance | 길찾기, 막힘 감지 |
| `mine` | x, y, count, name | `resource_reach_distance` |
| `chop`, `sweep` | x, y, count/radius | `resource_reach_distance` |
| `build` | name, x, y, direction, type, snap | 가방에 있어야 한다, `build_distance`, `can_place_entity{manual}` |
| `demolish` | x, y, name | `resource_reach_distance`, `mine_entity` (가방이 차면 실패) |
| `craft` | recipe, count | 레시피가 열렸는지, 재료 |
| `insert` | name, x, y, count, **inventory** (새) | `reach_distance`, 가방에 있어야 한다. `inventory="assembling_machine_modules"`처럼 칸을 골라 넣을 수 있다 (모듈, 연료, 탄약). |
| `take` | name, x, y, count | `reach_distance` |
| `give` | to, name, count | 동료에게 걸어가서 건넨다 |
| `attack`, `wait` | | |

### 새 일감: 손 조작 (닿아야 한다)

| 일감 | 인자 | 하는 일 / 검증 |
|---|---|---|
| `set_recipe` | x, y, recipe, quality?, clear? | assembling-machine 형(조립기, 화학, 정유). 레시피가 열려 있어야 하고 고정 레시피는 안 된다. 빠져나온 재료는 가방으로 가고, 넘치면 발밑에 떨어진다 (사람과 같다). |
| `rotate` | x, y, name?, direction?, reverse? | R 키. direction을 주면 그쪽을 볼 때까지 돌린다. `rotatable`이어야 한다. 결과에 `drop_x`/`drop_y`가 있다. |
| `set_filter` | x, y, item?, quality?, slot?, mode? · 분배기는 input_priority?, output_priority? | 필터 팔(`filter_count > 0`), 분배기, **저장 상자**. item이 없으면 비운다. |
| `set_limit` | x, y, slots? | 상자 칸 제한(빨간 X). slots가 없으면 푼다. |
| `set_requests` | x, y (또는 `target="self"`), requests, section?, mode?, trash_unrequested?, request_from_buffers? | 요청 상자, 버퍼 상자, 자기 몸. requests는 `{"iron-plate": 200}` 또는 `[{"name":..,"min":..,"max":..}]`. mode는 `replace`(기본)와 `merge`(`min=0`이면 지운다). 그룹 구역은 못 고친다. |
| `set_condition` | x, y, kind=`logistic`\|`circuit`, signal, comparator, constant, off? | 팔, 벨트, 펌프, 해안 펌프, 램프, 채굴기의 켬/끔 조건 (`get_or_create_control_behavior`는 모드가 한다). |
| `launch_rocket` | x, y | 사일로 GUI의 발사 버튼. 로켓이 `rocket_ready` 상태여야 한다. |

### 새 일감: 지도 조작 (거리 없음, 지도에 보여야 한다)

| 일감 | 인자 | 하는 일 / 검증 |
|---|---|---|
| `place_ghost` | name, x, y, direction?, quality?, type?, recipe?, items? | 유령을 놓는다. 그 건물을 **가질 수 있어야** 하고 (만드는 레시피가 열렸거나 손에 있다), `can_place_entity{manual_ghost}`를 통과해야 한다. 같은 자리에 같은 것이 있으면 `already`로 끝난다. 밑의 나무와 바위에는 해체 표시가 붙는다 (사람이 유령을 놓을 때와 같다). `items`에는 모듈, 포탑 탄, 연료만 넣을 수 있다 (블루프린트에 담기는 것). |
| `deconstruct_mark` | x, y, name?, radius? \| area, cancel?, ghosts? | 해체 계획서. 우리 건물, 나무, 바위가 대상이고 적의 것은 안 된다. `ghosts=true`면 우리 유령을 지운다. 한 번에 최대 400개. |
| `upgrade_mark` | x, y, target, name?, quality?, radius? \| area, cancel? | 교체 계획서. `next_upgrade`이거나 같은 `fast_replaceable_group`인 것으로만 바꾸고, target이 열려 있어야 한다. |
| `request_items` | x, y, items, name?, replace? | 선 건물 위에 블루프린트를 덧붙여 **모듈, 포탑 탄, 연료**를 로봇에게 부탁한다. 모듈은 빈 칸만큼만 요청한다. 조립기 입력칸과 출력칸(재료 운반)은 안 된다. |
| `research` | name, mode=`add`\|`front`\|`remove` 또는 queue=[...] | 연구 GUI. 이미 끝났거나 못 여는 기술은 거절한다. |

### 모드 원격 (새로 생긴 것)

- `act(name, kind, params)`: 즉시 실행한다. 요원 이름이 nil이면 산 사람 아무나 한다.
- `rules(strict)`: **엄격 모드**. true면 옛 세계 조작 원격을 막는다: `give`, `research`, `unstick`, `set_recipe`,
  그리고 dry가 아닌 `aim_drill`과 `feed_belts`. 막힌 원격은 `{error = "run25 rules: ..."}`을 돌려준다.
  기본값은 꺼짐이라 run24 서버와 같게 돈다. 값은 게임 저장에 남는다.
- `aim_drill(name, x, y, true)`, `feed_belts(name, limit, true)`: **dry**. 돌리지 않고 어느 쪽으로 돌릴지만 답한다.

### 파이썬 (bridge/client.py)

- `ai.has_acts()`: 서버 모드에 `act`가 있는지 한 번 묻는다. **있으면 run25 모드**로 돈다.
  - `ai.set_recipe(요원, x, y, r)`는 `act set_recipe`로 간다 (손이 닿아야 한다).
  - `ai.aim_drill`은 dry로 방향을 받은 뒤 `act rotate`로 돌린다.
  - `ai.feed_belts`는 dry 목록을 받아 그 요원 큐에 rotate 일감으로 넣는다.
  - `ai.research(name)`은 `act research`로 간다.
  - `ai.unstick`과 `Agent.give`는 `{"error": ...}`를 돌려준다 (순간이동과 아이템 생성 금지).
  - 옛 서버(run24)에서는 예전 원격을 그대로 부른다. 그래서 run24에서 도는 고리는 깨지지 않는다.
- `Agent.set_recipe / rotate / set_filter / set_limit / set_requests / set_condition / launch_rocket /
  place_ghost / deconstruct_mark / upgrade_mark / request_items / research`는 submit한 뒤 기다린다 (걸어가서 한다).
- `orders.py`: `REACHES`에 손 조작 일감을 더했다. 계획 안에서 없는 것을 가리키면 보내기 전에 막는다.
  `orders.ACTS`는 새 일감 이름 목록이다.

---

## 3. 옛 Lua에서 새 주문으로

| run24 Lua 패턴 | run25 | 분류 |
|---|---|---|
| `s.create_entity{name='entity-ghost', inner_name=n, ...}` (+ `can_place{manual}`) | `place_ghost` (manual_ghost 검사, 지도에 보여야 한다) | (b) 새 일감 |
| ghost `insert_plan = {탄/모듈}` | `place_ghost(items={...})` | (b) |
| `g.destroy()` (유령 지우기) | `deconstruct_mark(ghosts=True)` | (b) |
| `e.order_deconstruction(f)` (나무, 바위, 건물) | `deconstruct_mark` | (b) |
| `e.order_upgrade{target=...}` | `upgrade_mark` | (b) |
| `e.set_recipe(r)` | `set_recipe` (손) | (b) |
| `e.direction = d` / `drill.direction` | `rotate(direction=d)` (손) | (b) |
| `c.set_filter(1, {name='coal'})` (저장 상자, 팔) | `set_filter` (손) | (b) |
| 상자 `set_bar` (칸 제한) | `set_limit` (손) | (b) |
| `get_logistic_sections().sections[1].set_slot(...)` | `set_requests` (손 / 자기 몸) | (b) |
| `get_or_create_control_behavior(); cb.logistic_condition = ...` | `set_condition` (손) | (b) |
| `force.research_queue = q` / `add_research` | `research(queue=[...])` / `research(name)` | (b) |
| `silo.launch_rocket()` | `launch_rocket` (손, 사일로 곁에 서서) | (b) |
| `create_entity{name='item-request-proxy', modules = 모듈}` | `request_items(items={모듈})` (블루프린트 덧붙이기와 같다) | (b) |
| `create_entity{'item-request-proxy'}` **재료를 조립기 입력칸에, 결과를 출력칸에서 빼기(removal_plan)** | **금지.** 요청 상자와 팔(`build` + `set_requests`), 결과 팔과 공급 상자, 또는 사람 손 운반(`take` + `insert`) | (c) |
| `inv.remove{...}` 뒤 `other.insert{...}` (relay, 순간이동) | **금지.** 사람 손 운반(`take`, `walk_to`, `insert`)이나 벨트, 팔, 로봇 | (c) |
| `e.insert{연료/탄}` (스크립트가 채우기) | `insert` 일감 (손). 망 안 포탑과 연료는 `request_items`로도 된다 | (a) |
| `b.teleport(...)` / `unstick` | **금지.** 걸어 나오거나(`walk_to` 경유점) 사람에게 알린다 | (c) |
| `agent.give(...)` (아이템 생성) | **금지.** `take`로 상자에서 꺼내고 `give`로 동료에게 건넨다 | (c) |
| `e.active = false/true` (기계 멈추고 켜기) | **금지** (사람이 못 한다). 입력 팔에 `set_condition`(망 조건), 또는 `set_recipe(clear=True)` | (c) |
| `force.chart(...)` | **금지.** 캐릭터가 걸어 다니면 모드의 `chart_underfoot`가 발밑을 밝힌다 | (c) |
| `connect_neighbour` (전선) | 금지. 전봇대를 `build`로 지으면 저절로 이어진다. 회로 전선은 아직 일감이 없다 | (c) |

분류: (a) 옛 일감으로 된다, (b) 새 일감이 필요하다 (이번에 추가함), (c) 본질적으로 금지라 다른 방법을 써야 한다.

---

## 4. 모드 안에 남은 것 (스크립트 규칙 밖, 알고 쓸 것)

| 무엇 | 왜 괜찮은가 / 남은 일 |
|---|---|
| `build` 일감의 `create_entity` | 캐릭터 대신 짓는다. 가방에서 빼고, `build_distance`와 `can_place{manual}`을 거친다. 사람의 짓기와 같다. |
| `acts.lua`의 `create_entity`(유령, 요청), `destroy`(유령) | 같다. 검증 뒤 캐릭터를 대신해서 한다. |
| `chart_underfoot` (요원 발밑 64칸) | 사람 캐릭터가 보는 만큼이다. 지도 전체 chart는 여전히 금지다. |
| `count_craft` → `tech.researched = true` | 트리거 기술. 엔진이 사람 손제작에 세어주는 것과 같은 조건이다 (캐릭터에 플레이어가 없어서 엔진이 못 센다). |
| `power_plan`, `assembler_site`, `water_sites`의 **탐침** (create 뒤 같은 틱에 destroy), `feed_belts`/`drop_seats`의 방향 잠깐 바꾸기 | 같은 틱에 되돌리므로 세계에 남지 않는 조회다. 나중에 `can_place_entity`와 프로토타입 계산으로 바꾸는 편이 깔끔하다 (할 일). |
| `spawn`, `revive`, `remove`, `spectate` | 관리 기능이다. 사람의 리스폰과 관전과 같다. |
| 옛 원격 `give`, `unstick`, `set_recipe`, `aim_drill`, `feed_belts`, `research` | 옛 판과 맞추려고 남겼다. **run25에서는 `rules(true)`로 막는다.** |

---

## 5. 감사 결과 (2026-10-01, `apilint`)

- 전체: `scripts/` + `bridge/` 297개 파일 중 **136개 파일에 811건**. 대부분 run23 이전의 일회성 스크립트다.
- `bridge/` (데몬과 crew): **0건**. crew의 `set_recipe`, `aim_drill`, `feed_belts`, `research`, `unstick`, `give`는
  client 감싸개를 거치므로 run25 모드에서 캐릭터 조작이 되거나 오류가 된다.
  `watch.py`는 unstick 오류를 받으면 채팅으로 알리고 넘어간다.
- **run24 스크립트 (`*24*.py`와 `research_guard`) 61개 중 42개가 직접 위반한다.** 1개는 가져온 모듈을 통해 위반한다 (research_guard가 p4.queue_fill을 쓴다).

### 5.1 run24 상주 고리 (state/run24_loops.json, 17개)

| 고리 | 판정 | 무엇이 걸리나 | run25로 옮기는 법 |
|---|---|---|---|
| jevloop, seen, sitewatch24, raidwatch24 | **준수** | 읽기와 채팅뿐 | 그대로 |
| blhaul24, fuelhaul24 | **준수** | 읽기 + `take`/`insert` 주문 | 그대로 |
| p7haul, p9haul (`p7_24 --haul`) | **준수** (haul 경로만) | 읽기 + 주문. 같은 파일의 `--ghosts`, `--recipes`, `retire_iron`, `upgrade`, 해안 펌프 유령은 위반한다 | 그 부명령을 `place_ghost`, `set_recipe`, `rotate`, `deconstruct_mark`, `upgrade_mark` 주문으로 |
| research_guard | **위반** (p4.queue_fill의 `research_queue =`) | 연구 큐를 스크립트가 쓴다 | Lua는 후보 이름만 고른다 (조회). 쓰기는 `ai.act(None, "research", queue=[...])` |
| robofeed24 | **위반** (c) | 재료와 연료 `item-request-proxy` 생성, proxy destroy | 조립기마다 요청 상자와 팔(`build` + `set_requests`). 연료는 `request_items`로 할 수 있다. 연구소 팩은 요청 상자와 팔로 |
| ammo24 | **위반** (c/b) | 포탑 탄과 탄 조립기 재료 proxy, 노랑→피어싱 교체(removal_plan) | 망 안 포탑은 `request_items(items={탄})`. 교체는 손 고리(`--who`: `take` + `insert`). 조립기 재료는 요청 상자로 |
| coalnet24 | **위반** (b) | 저장 상자 `set_filter`를 매 순번 | 필터가 비었을 때만 `set_filter` 주문 한 번 (손) |
| solarfeed (`solar24 --feed`) | **위반** (c) | 재료 proxy와 결과 removal_plan | 입력은 요청 상자와 팔, 출력은 팔과 공급 상자. 그 뒤 고리는 끈다 |
| sffeed (`energy24 feed`) | **위반** (c/b) | 보일러 고체 연료 proxy, 재료 proxy | 연료는 `request_items`(연료) 또는 요청 상자와 팔, 재료는 요청 상자로 |
| eastsup24 | 고리 본체는 준수 | `north_def` 부명령의 유령 생성 | `place_ghost` |
| ironsplit (`ironin24 --watch`) | **위반** (b) | 팔의 `logistic_condition`을 매 순번 | 조건이 다를 때만 `set_condition` 주문 |
| eastretake24 `--advance` | **위반** (b) | 탄을 붙인 포탑 유령, 유령 지우기(destroy) | `place_ghost(items={탄: 20})`, `deconstruct_mark(ghosts=True)` |
| rocketfab24 `loop` | **위반** (b/c) | `.active` 켜고 끄기(정유, 분해, 황, 고체연료), `set_recipe`, `.direction`, 사일로 모듈 proxy, `launch_rocket` | active는 **금지**라 입력 팔 `set_condition`(망 조건)으로. 레시피와 방향은 주문으로. 모듈은 `request_items`. 발사는 사일로 곁 요원이 `launch_rocket` 주문 (또는 서 있으면 act) |

### 5.2 run24 스크립트 전체 (직접 위반 42개)

| 파일 | 건수 | 걸린 규칙 | 옮기는 법 |
|---|---|---|---|
| relay24 | 34 | entity.insert, inventory.remove, set_recipe | **폐기** (Lua 중계, 이미 사용자 금지 2026-09-30) |
| ammoplus24 | 11 | circuit, create_entity, logistic_sections, set_recipe, wire | place_ghost, set_requests, set_recipe, set_condition. 전선은 금지 |
| rocketfab24 | 10 | 위 표 | 위 표 |
| nwcreep24 | 9 | create_entity, destroy, order_deconstruction | place_ghost, deconstruct_mark(ghosts) |
| energy24 | 7 | create_entity, logistic_sections, order_deconstruction, set_recipe | place_ghost, set_requests, deconstruct_mark, set_recipe, feed은 위 표 |
| p7_24 | 7 | create_entity, direction, order_deconstruction, order_upgrade, set_recipe | place_ghost, rotate, deconstruct_mark, upgrade_mark, set_recipe |
| p12_24 | 7 | create_entity, filter, order_deconstruction, order_upgrade, set_recipe | 같은 식, filter는 set_filter |
| def24, logi24, oil24, strike24 | 5 | ghost, requests, decon, recipe, direction, filter, destroy | 같은 식 |
| ammoplus2_24, p11_24, p6_24, rocketpush24, ironbal24, solar24 | 4 | 같은 식, ironbal은 circuit | set_condition |
| coal24, ironin24, laser24, milsci24, p10retake24, p5_24, stonenet24, westfeed24 | 3 | 같은 식, stonenet은 `.active`(금지)와 filter | set_condition 또는 set_filter |
| ammo24, eastretake24, fix24, powerdef24, purple24, r24east, robofeed24, silo24, steel24 | 2 | 같은 식, silo24는 research_queue | research 주문 |
| adv24, coalnet24, d24_defense, e24_defense, eastnorth24, eastsup24, p4_24, sunnet24 | 1 | 거의 유령 생성 | place_ghost |

**준수 (직접 위반 0)**: audit24, blhaul24, eastdrill24, flame24, fuelhaul24, ironfix24, p1_24, p10_24, p13_24,
p2_24, p24, p3_24, p8_24, power24, raidwatch24, rocket24, sci24, sitewatch24.
다만 flame24, rocket24는 위반 모듈(p7_24, ammoplus24, purple24, silo24)을 가져온다. apilint `[참고]` 줄을 볼 것.
p1_24와 p24의 `ai.set_recipe`는 run25 모드에서 손이 닿아야 하므로, 요원을 조립기 곁에 세운 뒤 부른다.

---

## 6. apilint: 새 스크립트 검사

```
python scripts/apilint.py                  # scripts/ + bridge/ 전부 (위반이 있으면 끝 코드 1)
python scripts/apilint.py scripts/x25.py   # 파일 몇 개
python scripts/apilint.py --summary        # 파일별 개수와 규칙
python scripts/apilint.py --since run25    # 이름에 25가 든 파일만 (run25 새 스크립트)
```

- 파이썬 파일 안의 **문자열**(ai.lua로 보내는 Lua 조각)을 규칙표(§1 금지 목록)로 본다. 주석, docstring, Lua `--` 주석은 보지 않는다.
- 감싸개 없이 부르는 옛 세계 조작 원격 `ai.call("give"|"set_recipe"|"unstick"|"aim_drill"|"feed_belts"|"research"|...)`도 잡는다.
- 위반이 있는 다른 스크립트를 import하면 `[참고]`로 적는다. 개수에는 넣지 않는다.
- 정말 필요한 예외는 그 줄에 `# apilint: ok 이유`(파이썬)나 `-- apilint: ok 이유`(Lua)를 적는다. 이유 없는 ok는 무시한다.
- 한계: 정규식 검사다. 문자열을 조각조각 이어 붙여 만들면 놓칠 수 있다. 모드의 엄격 모드(`rules(true)`)가 원격 쪽을 한 번 더 막는다.

---

## 7. run25 시작 전에 할 일

1. **모드 배포**: `mods/ai-bridge_0.3.0`(acts.lua 추가, control/sites/tasks 수정)을 서버 mods에 복사하고 서버를 재시작한다 (코디네이터 몫).
   배포 전 검사: `python scripts/luacheck.py mods/ai-bridge_0.3.0/*.lua`, `python tests/lua_order.py`, `python tests/acts_mock.py`.
2. 재시작 뒤 확인 (읽기와 설정만):
   `remote.call("ai","rules")`가 `acts` 12개를 돌려주는지 본다.
   `ai.act(None, "research", name="...")`를 한 번 불러 본다.
   `ai.has_acts()`가 True인지 본다.
3. **엄격 모드 켜기**: `ai.rules(True)`. 옛 세계 조작 원격을 막는다.
4. 상주 고리 명단(`state/run25_loops.json`)에는 **§5.1의 준수 고리만** 넣는다. 위반 고리는 옮긴 판(`*25.py`)이 `apilint --since run25` 0건을 통과한 뒤에 넣는다.
5. 새 스크립트는 커밋 전에 `python scripts/apilint.py <파일>`을 돌린다.
6. 알려진 빈틈 (다음 일):
   - 회로 전선(빨강, 초록) 잇기 일감이 없다.
   - 열차와 정거장 설정 일감이 없다.
   - `request_items`에 연료와 탄을 허용한 것은 2.0 블루프린트가 담는 범위를 따랐다. 사용자 판단에 따라 좁힐 수 있다.
   - 모드 탐침(create 뒤 destroy)을 조회로 바꾸는 일.
