# 초반 진행: 맨손에서 조립기까지

이 문서의 수치는 **실행 중인 게임에 직접 물어본 것**이다(`remote.call("ai","technology",...)`,
`recipe(...)`). 위키에서 옮겨 적은 것이 아니다 — 옮겨 적은 단계는 전부 틀릴 수 있는 단계이고,
실제로 한 번 틀려서 에이전트가 "자동화 준비 → 제작 실패"를 무한 반복했다.

## 왜 에이전트가 기계를 못 지었나

Factorio 2.0 프리플레이는 **217개 레시피 중 23개만 열린 채** 시작한다.

```
burner-inserter, burner-mining-drill, copper-plate, firearm-magazine, iron-chest,
iron-gear-wheel, iron-plate, light-armor, stone-brick, stone-furnace,
transport-belt, wooden-chest
```

`electronic-circuit`, `lab`, `pipe`, `boiler`, `steam-engine`, `inserter`, `small-electric-pole`,
`assembling-machine-1` — 전부 연구 뒤에 있다. 연구를 한 번도 하지 않는 에이전트는 영원히
화로와 버너 채굴기만 짓는다.

## 2.0의 함정: 첫 세 기술은 과학팩이 아니라 행동으로 열린다

1.1 이하의 지식이 여기서 통하지 않는다. 랩부터 지으려는 계획은 **시작조차 할 수 없다** —
랩 자체가 연구 뒤에 있기 때문이다.

| 기술 | 여는 조건 | 해금하는 것 |
|---|---|---|
| `electronics` | **구리판 10개 제작** | copper-cable, electronic-circuit, **lab**, inserter, small-electric-pole |
| `steam-power` | **철판 50개 제작** | pipe, pipe-to-ground, offshore-pump, boiler, steam-engine |
| `automation-science-pack` | **랩 1개 제작** (위 둘이 선행) | automation-science-pack 레시피 |
| `automation` | 빨간 과학팩 **10개** (전력 들어온 랩 필요) | **assembling-machine-1**, long-handed-inserter |

즉 실제 순서는 이렇다.

```
철광석·구리광석 채굴 → 화로에서 제련
  ├─ 구리판 10개 ──────────────► electronics    (랩·전자회로·인서터·전봇대 해금)
  └─ 철판 50개 ───────────────► steam-power     (파이프·보일러·증기기관·펌프 해금)
                                      │
                          랩 1개 제작 ┴─────────► automation-science-pack (빨간팩 해금)
                                      │
       오프쇼어펌프→보일러→증기기관→전봇대→랩에 전력
                                      │
                    빨간팩 10개를 랩에 넣고 연구 ──► automation (조립기 해금)
```

여기까지 오면 그 위는 같은 구조의 반복이다. 최종 목표인 `rocket-silo`는
steel-plate ×1000 + processing-unit ×200 + electric-engine-unit ×200 + pipe ×100 +
concrete ×1000 이고, 선행 기술이 8개 더 붙는다.

## 확인된 레시피 (게임에서 읽음)

| 아이템 | 재료 | 해금 |
|---|---|---|
| `lab` | iron-gear-wheel ×10, electronic-circuit ×10, transport-belt ×4 | electronics |
| `automation-science-pack` | copper-plate ×1, iron-gear-wheel ×1 | automation-science-pack |
| `assembling-machine-1` | iron-plate ×9, iron-gear-wheel ×5, electronic-circuit ×3 | automation |
| `electronic-circuit` | iron-plate ×1, copper-cable ×3 | electronics |
| `boiler` | pipe ×4, stone-furnace ×1 | steam-power |
| `steam-engine` | iron-plate ×10, iron-gear-wheel ×8, pipe ×5 | steam-power |
| `offshore-pump` | iron-gear-wheel ×2, pipe ×3 | steam-power |
| `burner-mining-drill` | iron-plate ×3, iron-gear-wheel ×3, **stone-furnace ×1** | 시작부터 |

마지막 줄이 에이전트를 무한 루프에 빠뜨린 것이다. 채굴기에는 **화로가 들어간다**. 철판만
세고 "만들 수 있다"고 판단하면 제작이 실패하고, 실패해도 상태가 안 바뀌니 같은 결론을
영원히 반복한다. 그래서 지금은 `get_craftable_count`로 게임에게 물어본다.

## 플래너가 쓰는 질의

손으로 옮겨 적은 사다리 대신 그래프를 걷는다.

| 질의 | 돌려주는 것 |
|---|---|
| `recipe(name)` | 재료·산출·해금 여부·손제작 가능 여부 |
| `technology(name)` | 선행·과학팩·**트리거**·해금 레시피 |
| `unlocked_by(recipe)` | 이 레시피를 여는 기술 |
| `available_research()` | 지금 시작 가능한 연구 전부 |
| `research(name)` / `research_status()` | 연구 걸기 / 진행 확인 |
| `inventory(agent).craftable` | 지금 손으로 만들 수 있는 개수 (중간재 포함) |

## 아직 확인 못 한 것

- 화로에서 제련한 판이 `craft-item` 트리거에 계산되는지 (손제작만 세는지). 에이전트가
  실제로 제련을 돌려 `electronics`가 열리는지로 확인해야 한다.
- 오프쇼어 펌프를 놓을 수 있는 물가 위치를 찾는 공식 헬퍼는 없다. 물 타일을 찾고
  인접 육지에서 4방향으로 `can_place_entity`를 시도하는 수밖에 없다.
- 전봇대 배치 간격에 공식이 없다. 공급 범위 5×5가 겹치게 놓는 실전 관행뿐.
- 랩이 전력 없이 연구를 진행하는지에 대한 공식 문서 문장을 찾지 못했다.
