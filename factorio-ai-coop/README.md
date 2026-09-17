# factorio-ai-coop

Claude 또는 Codex가 **사람과 같은 Factorio 멀티플레이 세션에 캐릭터로 참여**하게 만드는 브릿지.
AI 단독 벤치마크가 아니라 협동 플레이가 목표다.

Factorio 2.0.77 / Space Age 클라이언트로 실측 검증했다.

## 왜 모드가 필요한가

RCON만으로도 Lua를 실행할 수 있으니 모드가 필요 없어 보인다. 하지만 **콘솔 명령은 한 틱만 산다.**
걷기·채굴·제작은 틱에 걸쳐 일어나는 일이고, `on_tick` 핸들러를 세이브/로드 너머로 유지할 수 있는 건
모드뿐이다. 그래서 의도와 실행을 나눈다.

```
Claude / Codex
     │  MCP (stdio)
     ▼
bridge/mcp_server.py ──► bridge/client.py ──RCON(TCP)──► Factorio 헤드리스 서버
                                                          │  mods/ai-bridge
     의도: 태스크 1회 제출                                  │  실행: 매 틱 상태머신
     결과: 폴링                                            │
                                                          ▼
                               사람 플레이어 ──멀티플레이(UDP)──► 같은 맵, 같은 force
```

LLM의 턴은 수 초, 시뮬레이션은 초당 60틱이다. 이 비동기 큐가 그 속도 차이를 흡수한다.
RCON으로 매 틱 명령을 쏘는 방식은 초당 60왕복이 필요해 성립하지 않는다.

## 구성

| 경로 | 내용 |
|---|---|
| `mods/ai-bridge_0.2.0/control.lua` | 태스크 큐, 틱 드라이버, `remote` 인터페이스, 채팅 캡처 |
| `mods/ai-bridge_0.2.0/tasks.lua` | 태스크 상태머신 (`walk_to`, `mine`, `build`, `craft`, `wait`) |
| `bridge/rcon.py` | Source RCON 클라이언트 (표준 라이브러리만) |
| `bridge/client.py` | 고수준 API. 첫 명령 함정과 Lua 인자 마셜링을 흡수 |
| `bridge/mcp_server.py` | MCP stdio 서버 (의존성 없음) |
| `scripts/start-test-server.sh` | RCON 켠 헤드리스 서버 실행 |
| `tests/smoke.py` | 실제 게임 대상 종단 테스트 15종 |
| `tests/mcp_test.py` | MCP 프로토콜 테스트 13종 |

## 시작하기

```bash
# 1. 서버 실행 (모드 로드 + RCON 27015 + 게임 34198, 루프백 전용)
bash factorio-ai-coop/scripts/start-test-server.sh

# 2. 검증
python factorio-ai-coop/tests/smoke.py
python factorio-ai-coop/tests/mcp_test.py
```

사람은 게임 클라이언트에서 **멀티플레이 → 주소로 접속 → `127.0.0.1:34198`** 로 들어간다.

Claude Code는 저장소 루트 `.mcp.json`의 `factorio` 항목으로 이미 등록돼 있다.
Codex는 `~/.codex/config.toml`에 다음을 추가한다.

```toml
[mcp_servers.factorio]
command = "python"
args = ["D:/park/YD_Claude_RND/factorio-ai-coop/bridge/mcp_server.py"]
env = { FACTORIO_RCON_PORT = "27015", FACTORIO_RCON_PASSWORD = "rcontest123" }
```

## 도구 (MCP)

| 도구 | 용도 |
|---|---|
| `factorio_status` | 캐릭터 위치, 현재 태스크, 대기열, 접속 인원 |
| `factorio_observe` | 주변 집계 — 광맥별 타일 수와 최근접 좌표, 자기 건물, 적 수, 사람 위치 |
| `factorio_inventory` | 소지품, 체력, 위치 |
| `factorio_spawn` | 사람 옆에 캐릭터 생성 (같은 force) |
| `factorio_walk_to` | 경로탐색 보행 |
| `factorio_mine` | 광맥까지 이동 후 손채굴 |
| `factorio_place` | 건설 범위까지 이동 후 설치 (인벤토리 차감) |
| `factorio_craft` | 손 제작 |
| `factorio_plan` / `factorio_poll` | 여러 단계를 한 번에 큐잉하고 나중에 확인 |
| `factorio_cancel` | 현재 태스크 중단 + 대기열 비움 |
| `factorio_chat_read` / `factorio_say` | 사람과 게임 내 채팅으로 대화 |

관측은 **열거가 아니라 집계**다. LLM에 광석 타일 4천 개 대신
`iron-ore: 843타일, 최근접 (73.5,-69.5)`를 준다.

## 실측으로 알아낸 함정

세 개는 문서에 없고 직접 부딪혀야 나온다.

1. **세션의 첫 Lua 명령은 삼켜진다.** "이 명령은 도전 과제를 비활성화합니다. 계속하려면 다시 입력하세요"
   확인 프롬프트가 첫 명령을 먹는다. `client.py`가 접속 시 워밍업으로 처리한다.
2. **`mining_state`는 플레이어 없는 캐릭터에서 동작하지 않는다.** 설정은 되지만 엔진이 같은 틱에
   되돌려서 영원히 0개가 캐진다. `mine_entity`를 써야 하고, 이건 **반환값이 `false`여도 호출당 1개를
   캐낸다**(타일이 고갈될 때만 `true`). 호출 간격은 프로토타입의 `mining_time`으로 계산해
   손채굴 속도를 지킨다.
3. **`on_tick`의 Lua 에러는 서버를 죽인다.** 태스크 실패가 아니라 `Quitting: multiplayer error`로
   서버가 종료되고 접속한 사람이 전부 튕긴다. 잘못된 레시피 이름 하나로 재현된다. 모든 핸들러를
   `pcall`로 감싸 태스크 실패로 강등한다. `tests/smoke.py` 10번이 이걸 고정한다.

그 밖에:

- 각 모드는 **독립된 `storage`** 를 가진다. `/silent-command`는 시나리오 컨텍스트에서 돌아서
  모드의 `storage`가 보이지 않는다. 모드 상태는 `remote.call`로만 접근한다.
- **업적은 해당 세이브에서 영구 비활성화**된다. 되돌릴 수 없다.
- RCON 왕복은 약 **17ms**, 순차 약 60 cmd/s. 태스크 큐를 쓰는 이유다.
- 소켓 타임아웃이 나면 연결을 버려야 한다. 늦게 도착한 응답을 다음 명령의 답으로 읽으면
  그때부터 모든 결과가 한 칸씩 밀린다.
- desync를 피하려면 결정적 연산만 해야 한다. 이벤트 핸들러는 반드시 모드 파일 안에 둔다
  (`/c` 안에서 `script.on_event`를 등록하면 세이브/로드가 깨진다).

## 한계

- 단일 에이전트 캐릭터. 여러 AI를 동시에 굴리려면 `storage.bot`을 컬렉션으로 바꿔야 한다.
- 물류/회로/기차는 아직 태스크가 없다. `factorio_place`로 개별 설치는 가능하다.
- 전투 태스크 없음. 적이 오면 `observe`의 `hostiles`로 알 수는 있다.
- 서버는 루프백 바인딩이다. 외부 공개는 `scripts/start-test-server.sh`의 `--bind`를 바꿔야 하고,
  그 경우 RCON 비밀번호를 반드시 교체할 것.

## 관련 작업

- [Factorio Learning Environment](https://github.com/JackHopkins/factorio-learning-environment) —
  LLM-Factorio 벤치마크의 사실상 표준. 고수준 Python API 발상을 참고했다. 다만 에피소드형 단독
  실행 전제라 사람과 공유하는 영속 서버에서는
  [세이브가 깨지는 문제](https://github.com/JackHopkins/factorio-learning-environment/issues/381)가
  있다(`storage`에 Lua 함수를 넣어 직렬화 실패). 이 저장소는 `storage`에 엔티티 참조와 좌표
  테이블만 넣어 그 문제를 피한다 — `tests/smoke.py` 9번이 확인한다.

## 직접 띄우기 (권장)

Claude 세션이 띄운 서버는 그 세션에 묶여 있어서, 모드를 고쳐 재시작할 때마다 끊긴다.
서버를 직접 소유하려면 배치 파일을 더블클릭한다.

| 파일 | 하는 일 |
|---|---|
| `scripts/run-server.bat` | 모드를 클라이언트에 동기화하고 헤드리스 서버를 자기 창에서 실행 |
| `scripts/run-agent.bat` | 채팅을 듣는 에이전트 실행. `--auto`를 붙이면 유휴 시 스스로 진행 |

창을 닫으면 멈춘다. 서버 창이 살아 있는 동안에는 Claude가 서버를 재시작하지 않는다 —
모드를 고쳤으면 서버 창과 게임 클라이언트를 다시 시작해야 한다. Factorio는 모드 스크립트를
시작할 때 한 번만 읽고, 서버와 클라이언트의 체크섬이 다르면 접속이 거부된다.

배치 파일은 ASCII로만 작성돼 있다. 한글이 든 `.bat`/`.ps1`은 CP949로 읽혀 따옴표가
깨지고, 아무 로그도 없이 실패한다.
