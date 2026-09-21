"""Refuse to run a destructive test against a world someone is living in.

21회차 - 시험 묶음을 통째로 돌렸더니 «돌아가는 게임»에 대고 돌았다.

    mcp_test  : 명부에서 bravo 를 지웠다 (시험이 끝나며 지우는 것이 맞다)
    persistence: alpha 를 시험장 (18,11) 까지 걷게 했다 - 기지에서 75칸
    smoke     : 「적대적 입력을 견디는가」가 RCON 을 끊어 보급 순찰을 죽였다

셋 다 시험으로서는 옳게 동작했다. 시험장이 아닌 곳에서 돌았을 뿐이다.

포트로는 못 가린다. `start-test-server.sh` 가 27015 를 «뺏어» 쓰므로
시험장과 본판이 같은 번호를 쓴다. 그래서 번호가 아니라 «세상»에 묻는다.
갓 만든 판은 비어 있고 어리다. 기지가 선 판은 그렇지 않다.

    시험장인지는 어디에 붙었나가 아니라 «거기에 무엇이 사는가»로 안다.

정말 본판에 돌려야 하면 AI_BRIDGE_ALLOW_LIVE=1 을 준다. 손으로 켜야만
켜지는 것은 실수로는 안 켜진다.
"""
import os

# 이보다 많이 서 있으면 누가 살고 있는 판이다. 갓 만든 판에는 나무와
# 바위뿐이고 «플레이어 것»은 하나도 없다.
BUILT = 40

# 이만큼 돌았으면 어린 판이 아니다 (60틱 = 1초, 즉 한 시간).
OLD = 60 * 60 * 60

ESCAPE = "AI_BRIDGE_ALLOW_LIVE"


class NotASandbox(RuntimeError):
    pass


def census(ai) -> dict:
    return ai.lua("""(function()
      local s, f = game.surfaces[1], game.forces.player
      return { built = s.count_entities_filtered{force = f,
                 type = {"mining-drill", "furnace", "ammo-turret",
                         "transport-belt", "container", "lab"}},
               tick = game.tick }
    end)()""")


def require_sandbox(ai) -> dict:
    """시험장이 아니면 예외. 돌려주는 것은 무엇을 보고 정했나이다."""
    if os.environ.get(ESCAPE) == "1":
        return {"allowed": "by hand", "built": None, "tick": None}
    seen = census(ai)
    built, tick = int(seen["built"]), int(seen["tick"])
    if built > BUILT or tick > OLD:
        raise NotASandbox(
            f"이 판에는 이미 {built}개가 서 있고 {tick // 3600}분이 돌았다"
            f" - 시험장이 아니다.\n"
            f"    시험장을 띄운 다음 다시 돌린다:  scripts/start-test-server.sh\n"
            f"    정말 이 판에 돌리려면:           {ESCAPE}=1")
    return {"allowed": "empty world", "built": built, "tick": tick}
