# run25 도전과제 조사 · 목표 (2026-10-01)

run25 는 **공식 도전과제의 달성 조건**을 목표로 삼는다. 실제 Steam 도전과제는 Lua 명령(`/silent-command`)을 쓰는
순간 세이브에서 꺼지고, 우리 AI 캐릭터는 플레이어가 붙지 않은 캐릭터라 엔진이 세어 주지도 않는다
(예: `on_player_crafted_item` 이 안 뜬다 - `mods/ai-bridge_0.3.0/runner.lua` 주석). 그래서 조건을 **우리가 읽기 전용으로 추적**한다.

- 규칙 (run25): 게임을 바꾸는 Lua API 금지. 캐릭터 행동(걷기·캐기·짓기·손 제작·상자 넣고 빼기·레시피/연구 선택 같은 GUI 급 행동)과 읽기 전용 질의만.
- 맵: starting_area 2 · enemy-base 1.0 · 광석 1.0 · peaceful 아님 · 캐릭터 7~8.
- 추적기: `scripts/achievetrack.py` (읽기 전용, 아래 «추적기 설계»).

## 출처

1. 게임 안 프로토타입 (base 2.0.77, 모드 base + ai-bridge 만) - `prototypes.achievement` 를 브리지로 읽음. **57 개**. 수치(`amount`, `within`, `excluded`, `dont_build`, `objective_condition`)는 여기서 그대로 옮겼다.
2. 공식 위키 [Achievements](https://wiki.factorio.com/Achievements) - 설명 문구와 주의 사항.
3. 맵 설정과 도전과제: [포럼 - What map settings disable achievements?](https://forums.factorio.com/viewtopic.php?t=96339) - «적 관련 값은 기본 이상, **시작 지역 크기만 예외**». 즉 starting_area 2 는 괜찮고, enemy-base 1.0 · 확장/진화 기본값이면 `allowed_without_fight=false` 도전과제(시간 제한 · «짓지 않기» 류)도 유효. 적 확장·진화를 줄이면 이 조건들이 무효가 되니 **map-settings 는 기본값 유지**.

## 57 개 전체표

가능성: **상** 자연스럽게 됨 · **중** 계획하면 됨 · **하** 스타일을 크게 바꿔야 함 · **불가** 규칙/브리지/시간상 불가.
추적: `B`=엔티티 설치 통계(`get_entity_build_count_statistics`), `P`=아이템 생산 통계, `P1h`=최근 1 시간 흐름(`flow_precision_index.one_hour, count=true`), `K`=처치 통계(`get_kill_count_statistics`), `T`=기술, `E`=전력망 통계, `R`=`rockets_launched`, `L`=래치(첫 목격 tick 을 state 파일에), `M`=모드 카운터 필요(아직 없음).

### 진행 (progress)

| 이름 | 조건 (프로토타입 값) | 가능성 | 추적 | 충돌·메모 |
|---|---|---|---|---|
| automate-this | 조립기 1 설치 1 | 상 | B `assembling-machine-1` | 조립기 2 로 건너뛰면 안 됨 |
| getting-on-track | 기관차 설치 1 (레일 위) | 중 | B `locomotive` | 우리는 run24 까지 열차 0. 레일 건설 행동 필요 |
| getting-on-track-like-a-pro | 기관차를 **90 분 (324,000 tick) 안에** | 불가 | B + L | 철도 기술(빨+초) + 손으로 기관차 - 봇 속도로 90 분 불가 |
| arachnophilia | 스파이더트론 설치 | 하 | B | 거의 끝 기술, 핵·효율 모듈 3 등 필요 |
| eco-unfriendly | oil-processing 연구 | 상 | T | |
| steam-power | 증기 엔진 발전 시작 | 상 | E / B | |
| solar-power | 태양광 발전 시작 | 중 | E | **steam-all-the-way 와 충돌** - 로켓 뒤에만 |
| nuclear-power | 원자력 발전 시작 | 하 | E(터빈) + B(원자로) | 우라늄 · 켈로그는 불필요. 증기 계열이라 steam-all-the-way 와 무충돌 |
| crafting-with-speed / efficiency / productivity | 모듈 3 종 각 1 개 제작 | 중 | P | 조립기로 만든 것만 P 에 잡힘. 손 제작은 M |
| smoke-me-a-kipper... | 로켓 발사 | 중 | R + L | run24 는 ~26 h (Lua 도움 받음) |

### 탐험 (exploration)

| 이름 | 조건 | 가능성 | 추적 | 충돌·메모 |
|---|---|---|---|---|
| it-stinks-and-they-dont-like-it | 공해로 적 공격 유발 (`group-attack`, amount 1) | 상 | K(유닛 처치) 추정 | 적 있으면 자동. 직접 신호 없음 |
| automated-construction | 로봇으로 100 개 건설 (벨트 포함, 타일 제외) | 중 | M `robot_built` | 청사진/유령 배치가 «캐릭터 행동»인지 규칙 해석 필요 |
| you-are-doing-it-right | 로봇 건설 > 손 건설 (한 게임) | 하 | M `robot_built`/`hand_built` | 우리는 손 건설 중심 - 사실상 포기 |
| automated-cleanup | 로봇으로 100 개 해체 (타일 포함) | 중 | M `robot_mined` | 해체 표시 = 캐릭터 행동(해체 플래너)으로 인정 필요 |
| you-have-got-a-package | 물류 로봇이 캐릭터에게 배달 1 | 중 | M `robot_delivered` | 개인 물류 요청 + 수동/저장 상자 - **embargo 와 양립** |
| delivery-service | 캐릭터에게 로봇 배달 10,000 개 | 중 | M | 캐릭터 8 명이면 빠름 |
| trans-factorio-express | 열차 경로 1,000 칸 이상 계획 | 중 | 열차 `path.total_distance` 표본 | 먼 전초 철도 1 개면 됨 |
| watch-your-step | 달리는 기관차에 치여 죽기 | 중 | ?? | 의도적 사망 - 목표 아님 |
| golem | 한 방 500+ 피해를 받고 생존 | 하 | ?? | 에너지 방패 + 기관차 충돌. 위험, 목표 아님 |
| mining-with-determination | 광맥 하나 완전 고갈 (반경 12 칸 광석 0) | 중 | 수동 확인 | 작은 돌 광맥을 캐 없애면 됨 |

### 생산 (production)

| 이름 | 조건 | 가능성 | 추적 | 메모 (run24 실측) |
|---|---|---|---|---|
| mass-production-1 / 2 / 3 | 전자 회로 누적 1 만 / 100 만 / 2,000 만 | 상 / 하 / 불가 | P 누적 | run24 29 h 에 26.8 만 |
| circuit-veteran-1 / 2 / 3 | 고급 회로 시간당 1 천 / 1 만 / 2.5 만 | 중 / 하 / 불가 | P1h 최고치 | run24 914/h |
| computer-age-1 / 2 / 3 | 처리 장치 시간당 500 / 1 천 / 5 천 | 중 / 하 / 불가 | P1h | run24 330/h |
| iron-throne-1 / 2 / 3 | 철판 시간당 2 만 / 20 만 / 40 만 | 상 / 하 / 불가 | P1h | run24 60,400/h |
| solaris | 최근 1 시간, 증기 엔진·터빈 없는 망에서 태양광만으로 10 GJ 초과 (`minimum_energy_produced` 1e10, `last_hour_only`) | 중 (로켓 뒤) | E 망별 | 평균 2.8 MW ≈ 패널 ~70 + 축전기. steam-all-the-way 끝낸 뒤 증기를 1 시간 끊어야 함 |

### 연구 (research)

| 이름 | 조건 | 가능성 | 추적 | 메모 |
|---|---|---|---|---|
| research-with-automation ~ utility (6 개) | 해당 팩으로 기술 1 개 연구 | 상 | T 연구된 기술의 재료 | 로켓 가는 길에 전부 |
| research-with-space | 우주 과학팩으로 연구 | 중 | T | base 2.0 은 위성 발사 → 우주팩 1,000. 무한 기술(채굴 생산성 등)에 씀 |
| tech-maniac | 유한 기술 전부 (무한 레벨 불필요) | 하 | T 187 개 중 완료 수 | run24 29 h 에 98/187. 우주팩이 필요한 유한 기술은 0 |

### 처치 (kill)

| 이름 | 조건 | 가능성 | 추적 | 충돌·메모 |
|---|---|---|---|---|
| pest-control | 둥지 파괴 1 | 상 | K spawner | **keeping-your-hands-clean 과 순서 충돌** - 포병으로 첫 둥지를 부수면 둘 다 |
| steamrolled | 차량 충돌로 둥지 10 (본인 운전) | 불가 | ?? | 브리지에 차량 운전 없음 |
| pyromaniac | 불로 나무 1 만 | 하 | ?? (K 는 원인 구분 불가) | 화염방사 포탑이 우연히 태우는 정도 |
| run-forrest-run | 차량 충돌로 나무 100 | 불가 | ?? | 운전 없음 |
| terraformer | 절벽 파괴 1 | 중 | K cliff (잡히면) | 절벽 폭약 던지기 = 캐릭터 행동(`shooting`/사용) 지원 필요 |
| destroyer-of-worlds | 원자탄 사용 | 하 | ?? | 로켓 발사기 + 원자탄 - 늦고 위험 |
| minions | 전투 로봇 100 이 따라옴 | 하 | 캐릭터 `following_robots` | follower-robot-count 7 레벨 필요 |
| art-of-siege | 포병으로 적 구조물 파괴 | 중 | B 포병 + K 추정 | 포병 기술(군사·화학·유틸) |
| keeping-your-hands-clean | **첫** 적 구조물 파괴가 포병이어야 함 | 하 | L 첫 구조물 처치 순간의 포병 수 | 포탑이 사거리 안 둥지/웜을 쏘면 실패. starting_area 2 + 확장 → 방어선 앞 둥지가 생기면 거의 확실히 깨짐 |

### 제한 (limitation) - 한 번 어기면 끝

| 이름 | 조건 | 가능성 | 추적 | 충돌 (우리 스타일) |
|---|---|---|---|---|
| lazy-bastard | 손 제작 **111 개 이하**로 로켓 (중간재 포함, 멀티는 **전원 합산**) | 불가 | M `hand_crafted` (현재 `storage.crafted` 는 최종품만 셈) | 봇 부트스트랩이 손 제작(채굴기·화로·팔·벨트)에 기댐. 8 명 합산 111 은 사람 스피드러너 수준 |
| steam-all-the-way | 로켓까지 **태양광 패널 설치 0** (제작은 허용) | 상 | B `solar-panel` + L | run24 태양광 401. 석탄·고체 연료·원자력으로 대체. 석탄 고갈(run24) 대비 필요 |
| raining-bullets | 로켓까지 **레이저 포탑 설치 0** | 하~중 | B `laser-turret` + L | run24 레이저 72 (주 방어). 기관총 + 화염 포탑 + 탄약 보급으로 대체 - 탄약 보급이 병목 |
| logistic-network-embargo | **우주 과학팩 연구를 끝낼 때까지** 능동/요청/버퍼 상자 설치 0 (수동·저장 상자, 개인 물류는 허용) | 중 | B 3 종 + L (+ T 우주팩) | run24 요청 상자 22 (로켓 재료·LDS 등). 벨트로 대체 |
| no-time-for-chitchat | 로켓 **15 h (3,240,000 tick) 안** | 하 | R + L + `ticks_played` | run24 26 h (Lua 허용). 캐릭터만으로는 더 느려질 것 |
| there-is-no-spoon | 로켓 **8 h (1,728,000 tick) 안** | 불가 | 같음 | |
| so-long-and-thanks-for-all-the-fish | 생선을 로켓에 실어 발사 | 상 (로켓 뒤) | 사일로 `rocket_silo_rocket` 칸 생선 수 | 물가에서 생선 캐기 → 로켓 칸에 넣기 (캐릭터 행동) |

## 서로 충돌하는 것

1. **steam-all-the-way ↔ solar-power · solaris**: 로켓 전 태양광 설치 금지. 순서를 지키면 셋 다 가능 - 로켓(증기로) → 태양광 → 증기 1 시간 끊기(solaris).
2. **pest-control ↔ keeping-your-hands-clean**: 첫 구조물 처치가 포병이면 pest-control · art-of-siege · keeping 셋이 한꺼번에. 그 전에 포탑/캐릭터가 둥지·웜을 하나라도 죽이면 keeping 은 끝.
3. **raining-bullets + logistic-network-embargo**: 레이저가 없으면 포탑에 탄약을 날라야 하는데, 요청 상자가 없으면 로봇 탄약 보급도 없다 → 벨트 탄약 줄 또는 캐릭터 순회 보급뿐. 둘 다 잡으면 방어 비용이 가장 크다.
4. **logistic-network-embargo ↔ 로켓 재료 줄**: run24 는 사일로·LDS 를 요청 상자로 먹였다. 벨트 직결로 설계해야 한다. 우주 연구(위성 → 우주팩 → 연구)가 끝나면 풀린다.
5. **lazy-bastard ↔ 우리 부트스트랩 전체**: 양립 불가. 목표에서 뺀다.
6. **시간 제한 ↔ 규칙 강화**: run25 는 Lua 행동 금지라 run24(26 h)보다 느릴 가능성이 크다. 15 h 는 도전 지표로만.
7. **규칙 쪽 경고**: 모드가 트리거 기술을 `tech.researched = true` 로 여는 부분(`runner.lua` `count_craft`)은 «게임을 바꾸는 Lua» 에 해당할 수 있다. 엔진이 사람에게 해 주는 것을 대신하는 것이라 예외로 둘지 사용자 결정 필요. 청사진/유령·해체 표시·절벽 폭약·원자탄 발사도 브리지 행동으로 있어야 로봇 계열·처치 계열이 가능.

## 추천 목표 (run25)

### 주 목표 - «제한 도전 2 개 + 로켓 + 가는 길»

- **steam-all-the-way** - 충돌이 가장 작다. 태양광만 안 지으면 됨. 석탄 → 고체 연료 보일러 → (여유 있으면) 원자력. run24 석탄 위기 교훈대로 석탄 광맥 2 곳 확보.
- **logistic-network-embargo** - 요청 상자 없이 벨트로 먹이기. 건설 로봇 · 개인 물류(수동/저장 상자에서 캐릭터로)는 허용이라 봇 운용은 유지된다. 첫 로켓 + 위성 → 우주팩 연구로 마감.
- **smoke-me-a-kipper** (로켓 1 발) + 뒤따르는 **research-with-space** (위성).
- 가는 길에 자연히 되는 것: automate-this · getting-on-track(기관차 1 대 - 철도 전초로) · eco-unfriendly · steam-power · research-with 6 종 · crafting-with 3 종(모듈 3 은 로켓 재료 PU 줄 옆에서 소량) · mass-production-1 · iron-throne-1 · circuit-veteran-1 · computer-age-1 · pest-control · it-stinks.

이유: 두 제한은 **건물 종류 하나를 안 짓는 것**이라 규칙(캐릭터 행동만)과 무관하게 지키기 쉽고, 추적이 설치 통계 한 줄로 확실하다. 둘 다 run24 스타일을 바꾸지만 대체 수단(증기, 벨트)이 이미 우리가 해 본 것이다.

### 부 목표 - 여유와 상황 따라

- **raining-bullets** - 조건부. 초반~중반은 기관총 + 화염 포탑으로 간다. 공습으로 기지가 깎이기 시작하면(방어 붕괴 신호) 포기하고 레이저를 짓는다 - 로켓 자체가 우선.
- **keeping-your-hands-clean → art-of-siege** - 조건부. 포탑 사거리 안에 둥지가 들어오면 사실상 실패. 시작 지역 밖으로 방어선을 넓히지 않는 동안만 유지. 캐릭터에게 «둥지·웜 공격 금지».
- **no-time-for-chitchat** (15 h) - 지표로만 기록.
- 로켓 뒤: **so-long-and-thanks-for-all-the-fish** (2 호에 생선) · **solar-power → solaris** · **trans-factorio-express** · **terraformer** · **automated-construction / cleanup / you-have-got-a-package / delivery-service** (모드 카운터가 생기면) · **nuclear-power** · computer-age-2 · circuit-veteran-2 · iron-throne-2 · tech-maniac.

### 목표 아님

lazy-bastard · there-is-no-spoon · getting-on-track-like-a-pro · steamrolled · run-forrest-run · pyromaniac · destroyer-of-worlds · minions · arachnophilia · golem · watch-your-step · you-are-doing-it-right · mass-production-2/3 · circuit-veteran-3 · computer-age-3 · iron-throne-3 · mining-with-determination(원하면 작은 돌 광맥으로 가능).

## 추적기 설계 - `scripts/achievetrack.py`

- **읽기 전용**: 한 번의 `/silent-command` 로 통계만 읽는다. 게임 상태를 바꾸는 호출 없음 (`set_*`, `insert`, `create_entity`, `researched=` 등 사용 안 함).
- 읽는 것
  - `force.get_entity_build_count_statistics(surface).get_input_count(name)` - 설치 누적 (지운 뒤에도 남는다 → «짓지 않기» 판정에 정확).
  - `force.get_item_production_statistics(surface)` - 누적(`get_input_count`) 과 최근 1 시간(`get_flow_count{..., one_hour, count=true}`).
  - `force.get_kill_count_statistics(surface).input_counts` - 프로토타입 type 으로 둥지·웜·나무·절벽·유닛 합산.
  - `force.technologies` - 연구된 기술의 재료 팩 집합 (research-with-*), 유한 기술 완료 수, oil-processing.
  - 전력망별 `pole.electric_network_statistics` 의 발전기 종류별 1 시간 흐름 (J/tick 로 추정, ×216,000 = J/h).
  - `game.train_manager.get_trains` 의 `path.total_distance` 최대, 캐릭터 `following_robots`, 사일로 `rocket_silo_rocket` 칸 생선.
  - 모드에 `remote.call('ai','ach_counts')` 가 있으면 `hand_crafted` · `robot_built` · `hand_built` · `robot_mined` · `robot_delivered` 를 읽는다 (없으면 `??`).
- **래치** (`state/achievetrack.json`): 첫 로켓 · 첫 기관차 · 우주 연구 · 첫 태양광 · 첫 레이저 · 첫 금지 상자 · 첫 적 구조물 처치(그 순간 포병 수) 의 **첫 목격 tick**, 시간당 최고치, 최장 열차 경로. 통계만으로는 «언제» 가 안 나오므로 순서가 걸린 조건(로켓 전에? 우주 연구 전에?)은 래치로 판정한다. 추적기를 **자주** 돌려야 정확 (상주 루프에서 5 분마다 권장). 같은 표본에서 동시에 처음 보이면 보수적으로 실패로 본다.
- 출력: 주/부 목표별 `OK / .. / XX / ??` 와 세부 수치. `--all` 전체 57, `--json` 기계용, `--no-save` 래치 안 씀(다른 런에서 시험).
- run25 시작 전에 `state/achievetrack.json` 을 지워야 한다 (run24 값이 래치로 남지 않게).

### 모드 카운터 제안 (별도 작업, 이 커밋에는 없음)

읽기만 하는 이벤트 구독이라 «게임을 바꾸는 Lua» 가 아니다. `ai-bridge` 에 `storage.ach` 와 `ach_counts` remote 를 더하면 `??` 가 채워진다.

| 카운터 | 이벤트 |
|---|---|
| `robot_built` | `on_robot_built_entity` (타일 제외) |
| `hand_built` | 브리지 build 작업 성공 수 |
| `robot_mined` | `on_robot_mined_entity` + `on_robot_mined_tile` |
| `robot_delivered` | 캐릭터 인벤토리 증가 중 로봇 배달분 - 직접 이벤트가 없어 `on_player_main_inventory_changed` 로는 안 잡힘. 캐릭터 물류 요청 충족량 표본으로 근사 |
| `hand_crafted` | craft 작업이 시작한 **모든 큐 항목**(중간재 포함) - 지금 `storage.crafted` 는 최종품만 센다 |

### run24 세이브로 시험한 결과 (2026-10-01, 29h34m, 로켓 2)

주 목표 14/23 - steam-all-the-way(태양광 401) · embargo(요청 상자 22) 는 run24 에서는 이미 실패, 기관차 0, 모듈 3 은 0, circuit-veteran-1 914/1000 · computer-age-1 330/500 로 근접. 부 목표 raining-bullets(레이저 72) · keeping(둥지 3 을 포병 없이) 실패.
