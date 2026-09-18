"""손으로 돌릴 수 있는 숫자들. 왜 그 값인지는 각 줄의 주석에 있다.

한곳에 모아둔 이유는 튜닝할 때 파일을 뒤지지 않기 위해서다. 여기 없는
숫자가 코드 안에 박혀 있다면, 그것은 튜닝값이 아니라 게임의 사실이다.
"""

from __future__ import annotations


# Call signs are ASCII so they survive Lua, JSON and chat without surprises.
# "1번" addressing exists for anyone who would rather not type them.
CALL_SIGNS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"]


DRILL = "burner-mining-drill"


CHEST = "iron-chest"


DRILL_FUEL = 10


FURNACE_FUEL = 5


SMELT_BATCH = 20


PLATES_FOR_TOOLS = 12   # enough to hand-craft a drill and a chest


STOCKPILE = 30


BACKOFF_SECONDS = 120


# 길이 없어 실패한 일감은 그 사람에게 오래 막아둔다. 호수는 다음 배차 때도
# 그 자리에 있다.
UNREACHABLE_QUIET = 900.0


# 같은 자리에서 길찾기가 이만큼 연달아 실패하면 갇힌 것으로 본다. 한 번은
# 운이 나쁜 것이고, 세 번은 지형이다.
STUCK_STRIKES = 3


# 창고에 이만큼 쌓였으면 그만 캐도 된다. 485분째에 돌이 48,099개 있는데
# 채굴기 22대가 돌로 꽉 찬 상자 앞에서 여전히 서 있었다. 캐는 것도 일이고
# 막힌 채로 서 있는 것도 자리다.
SURPLUS = 6000


# 채굴기 밑 2x2 에 이만큼도 안 남았으면 걷어내서 두꺼운 자리에 다시 세운다.
# 400이면 0.25/s 로 27분이고, 옮기는 데 드는 것은 한 번의 걸음이다. 같은
# 광맥의 두꺼운 칸은 보통 2,000이 넘는다 - 다섯 배 넘게 남는 장사다.
#
# 완전히 마를 때까지 기다리는 것은, 그 자리에서 몇 분 더 캐려고 이십 분을
# 버리는 일이다.
THIN_DRILL = 400


# 벨트 한 줄로 이을 수 있는 최대 거리. 이보다 멀면 벨트값이 손으로 나르는
# 값을 넘는다 - 노란 벨트 하나가 철판 1 + 기어 1(= 철판 3)에 두 칸이다.
BELT_REACH = 40


# 한 줄을 놓기 전에 손에 쥐고 있어야 할 여유분. 중간에 모자라 끊긴 벨트는
# 안 놓은 것과 같고, 이미 쓴 자재만 사라진다.
BELT_SPARE = 4   # how long a failed kind of work stays off the ladder


# Each agent takes one resource so a crew does not all stand on the same patch.
FOCUS_ORDER = ["iron-ore", "coal", "copper-ore", "stone"]


# 2.0 opens its first technologies with an action rather than science packs:
# ten copper plates smelted opens electronics (circuits, lab, inserters), fifty
# iron plates opens steam power (pipes, boiler, engine, pump). Nothing else can
# start until those two are in, because the lab itself is behind electronics.
SMELT_FOR_TECH = [
    ("electronics", "copper-ore", "copper-plate"),
    ("steam-power", "iron-ore", "iron-plate"),
]


ORE_BATCH = 25


# 상자가 이 거리 안에 있으면 그 채굴기는 돌보는 사람이 있다고 본다.
# 2x2 채굴기의 산출 타일은 중심에서 1.5타일 안쪽이라 넉넉하게 잡았다.
CHEST_REACH = 2.5


# 한 번 걸어가서 몇 대까지 손볼 것인가. 너무 크게 묶으면 한 사람이 오래
# 붙들려 있고, 너무 작게 묶으면 같은 구역을 여러 번 왕복한다.
CLUSTER_REACH = 14


CLUSTER_MAX = 6


# 싣는 곳과 붓는 곳이 이보다 멀면 한 사람의 일이 아니다. 실제로 200타일
# 떨어진 상자에서 실어 오라는 계획이 나왔고, 길을 못 찾아 다섯 번 헤매다
# 빈손으로 「no coal to insert」로 끝났다.
HAUL_REACH = 120.0


# 제련 블록의 모양.
#
# 고수들이 쓰는 꼴은 «화로 두 줄이 마주보고, 가운데로 판금을 뽑는» 것이다
# (factorio wiki: Tutorial:Main bus / alt-f4.blog #56). 흩뿌리지 않는 이유는
# 보기 좋아서가 아니라, 나중에 벨트 한 줄로 전부 먹이고 전부 거둘 수 있어서다.
#
#   pitch 3   돌화로는 2x2 다. 3으로 두면 나중에 3x3 전기로로 «그 자리에서»
#             바꿀 수 있다. 붙여 놓으면 교체할 때 줄을 통째로 걷어야 한다.
#   row 12    한 줄에 열두 대. 두 줄이 한 블록(24대)이다.
#   aisle 5   마주보는 두 줄 사이. 가운데로 판금 벨트가 지나갈 길.
#   gap 9     블록과 블록 사이 통로. 사람이 지나다니고 벨트가 가로지른다.
#
# 예순 대를 놓으면 가로 36타일, 세로 42타일 안에 전부 들어간다.
FURNACE_PITCH = 3
FURNACE_ROW = 12
FURNACE_AISLE = 5
FURNACE_GAP = 9


# 화로는 돌 5개라 싸다. 상한이 8이었던 것이 259분 뒤의 상태를 만들었다 -
# 채굴기 194대가 화로 21대를 바라보고 있었고(정상 비율의 9.2배), 그래서
# 채굴기 101대가 «내놓을 데가 없어» 서 있는 옆에서 화로 21대가 굶었다.
# 캐는 능력이 모자란 적은 한 번도 없었다. 녹이는 능력이 모자랐다.
MAX_FURNACES = 60


# 버너 채굴기 0.25 광석/초, 돌 화로는 철광석 하나에 3.2초라 0.3125 광석/초.
# 화로가 살짝 빠르므로 «직결»이면 1 : 1 이다 - 드릴이 병목이라 화로를 더
# 붙여봐야 논다. 5:4 는 상자를 사이에 둘 때의 비율이고, 우리는 드릴을 화로에
# 바로 붙인다.
FURNACES_PER_DRILL = 1.0


# 보일러 60 증기/초 : 증기기관 30 증기/초. 기관을 하나만 붙이면 보일러가
# 만든 증기의 절반을 버리면서 석탄은 전부 태운다.
ENGINES_PER_BOILER = 2


# 보일러는 0.45/s 로 태운다. 20개면 44초다.
BOILER_FUEL = 20


# small-electric-pole 은 7.5타일까지 배선이 닿는다. 여유를 두고 7로 잡는다.
POLE_REACH = 7


# 전봇대 한 개는 나무 1 + 구리선 2. 랩 한 대는 전자회로 10 + 기어 10 +
# 벨트 4 라, 118타일을 잇는 전봇대 열일곱 개가 랩 한 대보다 싸다.
# 실제로 «랩을 못 만들었습니다»에서 막혀 전력이 서지 못했다.
# 이보다 멀면 전선을 끄는 대신 소비하는 쪽을 발전소 옆으로 옮긴다.
# 118타일에 전봇대 18개는 구리판 18장과 나무 18개다. 랩 하나가 훨씬 싸고,
# 사람도 그렇게 한다 - 전기는 길게 끌지 않고 공장을 전기 쪽으로 붙인다.
MAX_POLE_RUN = 8


# 버너 드릴 5대가 돌 화로 4대를 채운다. 뒤집으면 화로 4대에 드릴 5대.
DRILLS_PER_FURNACE = 1.0


# 버너 드릴은 석탄을 손으로 넣어줘야 한다. 돌볼 수 있는 것보다 많이 지으면
# 멈춘 기계만 늘어난다 - 한 사람이 셋까지.
DRILLS_PER_AGENT = 6


# 한 번 걸어가서 몇 대를 세우는가. 한 대씩 세우러 다니면 걷는 시간이 짓는
# 시간보다 길다 - 사용자가 «1개만 건설한다»고 지적한 것이 이것이다.
DRILLS_PER_TRIP = 4


# 화로가 다 녹이기 전에 꺼내러 가면 광석은 화로 안에 남고 손은 빈 채로
# 돌아온다. 게임이 알려준 시간에 여유를 더해서 기다린다.
SMELT_MARGIN = 8.0


# 화로 하나에 이만큼 쌓였으면 거두러 간다. 두세 개씩 집으러 왔다 갔다 하면
# 걷는 시간이 녹이는 시간보다 길어진다.
HARVEST_MIN = 10


# 화로가 받아주는 것들. 노는 화로에 무엇을 넣을지 고를 때 쓴다.
SMELTABLE = ("iron-ore", "copper-ore", "stone")


# 채굴기 출구에 화로를 바로 붙일 만한 광석. 채굴기가 앞 칸에 떨구면 그대로
# 제련이 시작되므로 사람이 퍼 나를 일이 없어진다. 돌은 화로에 넣을 일이
# 드물어 상자로 받는다.
SMELTED_BY_FURNACE = ("iron-ore", "copper-ore")


# 연구가 걸려 있는지 보는 주기. 매 틱 물어볼 일은 아니지만, 비어 있는 채로
# 오래 두면 랩이 그만큼 논다.
# 조립기 1호 한 대가 만드는 과학팩 0.1개/초 = 랩 한 대가 먹는 0.1개/초.
# 정확히 한 대가 한 대를 채운다. 초반에 이보다 깔끔한 비율은 없다.
SCIENCE_FEED = 40


RESEARCH_CHECK = 20.0


# 둥지를 살피는 주기와, 이 거리 안이면 알리는 기준. 공해가 퍼지는 속도에
# 비하면 30초는 충분히 촘촘하다.
THREAT_CHECK = 30.0


NEST_ALARM = 200


# 미리 세워둘 터렛 수와 한 대에 넣을 탄약. 습격이 온 다음에 짓기 시작하면
# 이미 늦다 - 터렛은 낭비가 아니라 대비다.
TURRET_TARGET = 4


TURRET_AMMO = 10


# 기지 중심에서 터렛까지. 공해가 나가는 쪽이 습격이 들어오는 쪽이다.
TURRET_RING = 18


# 연구는 이 순서로 고른다. 방어가 과학팩보다 뒤로 밀리면, 둥지가 가까워진
# 다음에야 터렛을 만들기 시작한다.
# 실측(699분째): 「military」는 기관단총만 연다. 터렛은 «gun-turret» 이라는
# 별개의 연구고, 벽도 «stone-wall» 로 따로 있다. 방어를 military 로 알고
# 있어서, 그 연구가 끝난 뒤에도 터렛 레시피는 잠긴 채였다 - 그리고 바로
# 그때 바이터 열두 마리가 왔다.
RESEARCH_ORDER = ("gun-turret", "stone-wall", "military",
                  "automation", "logistics", "electric-mining-drill",
                  "steel-processing", "logistic-science-pack")


# 같은 사람이 같은 말을 이 시간 안에 되풀이하면 삼킨다.
ECHO_QUIET = 60.0


# 규칙이 할 일을 못 찾았을 때만 모델에게 묻는다. 이 간격 안에 두 번 묻지
# 않는다 - 막혀 있는 상태는 몇 초 만에 바뀌지 않는다.
# 배차 주기. 매 틱 무리 전체를 훑으면 RCON 왕복이 아깝고, 너무 뜸하면
# 놀고 있는 사람이 생긴다.
DISPATCH_INTERVAL = 10.0


# 한 번에 한 사람이 받아 가는 석탄.
HAUL_BATCH = 40


# 가방에 이만큼 넘게 쌓이면 공용 창고에 넣는다. 각자 안고 다니면 필요한
# 사람에게 가지 않는다 - 옆 사람이 철광석 150개를 든 채로 «철광석이
# 필요합니다»라고 말하는 일이 생긴다.
KEEP_IN_HAND = 50


DEPOT_MIN = 20


# 연료 떨어진 기계가 이만큼이면 «굶고 있다»고 본다. 그럴 때는 광석보다
# 석탄이 먼저다.
STARVING = 4


# 같은 것을 이만큼이 부탁하면 그건 부탁이 아니라 부족이다. 없는 사람끼리
# 주고받아 봐야 아무것도 안 채워진다 - 늘려야 한다.
SHORTAGE_VOICES = 3


# 한 번에 세울 석탄 자급쌍 수. 사용자가 말한 「네 개를 서로 마주보게」가
# 이 쌍 두 벌이다. 쌍끼리는 서로 먹이지 않으므로 넷이 한 덩어리가 아니라
# 둘씩 두 덩어리다 - 그래도 손이 갈 일은 똑같이 없다.
COAL_PAIRS = 2


# 한 번에 세울 급유 장치 수, 그리고 상자에 부어둘 석탄.
# 버너 인서터는 자기가 나르는 게 연료일 때만 자급한다. 석탄을 나르는
# 인서터는 영원히 돌고, 광석을 나르는 인서터는 손이 계속 간다 - 그래서
# 급유만 자동화하고 광석은 아직 손으로 옮긴다.
RIGS_PER_TRIP = 3


RIG_COAL = 50


IDLE_ASK_QUIET = 150.0


# 그럴 때 쓰는 모델. 반장이 지시를 쪼갤 때와는 판단의 무게가 다르고,
# 자주 일어나는 일이라 싼 쪽이 맞다.
IDLE_MODEL = "haiku"


# 기지에서 이만큼 밖에 홀로 선 우리 건물은 「도망간 것」으로 본다.
#
# 실측(2026-09-18): 화로 63대 중 43대가 60타일 밖이었고, 가장 먼 것이
# 242타일이었다. 그쪽에는 광석이 닿지 않아 영원히 놀면서, 대신 사람을
# 그쪽으로 끌고 간다 - 요원 하나가 (322,13)에 서서 기지를 보지도 못했다.
STRAY_FAR = 60

# 사람이 기지에서 이만큼 밖에 있으면, 할 일을 찾기 전에 돌아온다.
#
# 에이전트 중심 조회는 전부 반경 200 안만 본다. 그 밖에 서 있으면 기지가
# «안 보이고», 안 보이니 할 일이 없고, 할 일이 없으니 돌아올 이유도 못 찾는다.
HOME_REACH = 120
