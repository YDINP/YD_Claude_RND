"""반장 - 무엇을 할 것인가를 정하고 사람을 몰아준다.

사용자 지시: "심시티 자체는 반장이 설계해서 각 에이전트들한테 건설을
위임하는게 좋을듯."

설계와 건설을 나누는 일에는 두 짝이 있다.

  어디에 짓는가   자리표(plots.lua)가 정하고 claim_work 이 나눠준다.
  무엇을 하는가   여기다.

지금까지는 둘째가 없었다. 맡은 일(focus)을 사람을 뽑을 때 돌아가며 한 번
나눠주고 그걸로 끝이었다. 여덟이 각자 사다리를 보고 각자 다음 칸을 골랐다.
그래서 광석은 시간당 만팔천 개를 캐면서 구리판은 영이었다 - 아무도 사슬
전체를 안 봤기 때문이다.

반장은 사슬 전체를 본다. 그것도 상태 문자열이 아니라 누적 생산량으로
본다(audit.lua). 위 칸은 흐르는데 아래 칸이 안 흐르면 거기가 끊긴 데고,
끊긴 데에 사람을 몰아준다.

캐는 것을 더 해봐야 소용없다. 이미 캔 것이 쌓여 있는데 안 녹고 있다면,
필요한 것은 채굴기가 아니라 그 광석을 화로에 넣는 손이다.
"""

from __future__ import annotations

import time

from client import RconError

# 끊긴 칸 -> 그 칸을 뚫으려면 무엇을 맡겨야 하는가.
#
# 한 칸 «위»를 맡긴다. 구리판이 안 나오면 구리광석을 화로로 나르는 일이
# 필요한 것이지, 구리판을 더 캐라고 할 수는 없다.
UNBLOCK = {
    "iron-ore": "iron-ore",
    "iron-plate": "iron-ore",
    "copper-ore": "copper-ore",
    "copper-plate": "copper-ore",
    "iron-gear-wheel": "iron-plate",
    "automation-science-pack": "iron-plate",
}

# 끊긴 데에 몇 명을 몰아줄 것인가. 전부 보내면 위 칸이 말라서 다음 순찰에
# 끊긴 데가 위로 옮겨간다 - 그러면 사람이 왔다갔다만 한다.
CHIEF_SHARE = 0.5

# 반장이 사슬을 다시 보는 주기(초). 사슬은 분 단위로 움직인다.
CHIEF_EVERY = 90.0

# 점호 주기(초). 사슬보다 자주 본다 - 죽은 채로 도는 요원은 그동안
# 아무것도 안 하는 것이 아니라 «실패를 쌓는다».
MUSTER_EVERY = 25.0


class ChiefMixin:
    """반장 - 사슬에서 끊긴 칸을 찾아 그쪽으로 사람을 몰아준다."""

    def muster(self) -> None:
        """점호. 죽은 요원을 세되 «되살리지 않는다».

        사용자 지시: "캐릭터가 사망하면 살리지말것."

        되살리기를 넣었던 것은 죽은 요원에게 일을 계속 주는 것을 막기
        위해서였다. 그 문제는 진짜였다 - 로그가 "character died or was
        removed" 로 가득 찼다.

        그런데 되살리기는 그 문제를 가리기도 했다. 죽어도 곧 돌아오니
        죽음의 값이 안 보였고, 지난 판에서 일흔네 번 죽는 동안 아무도
        그것을 사건으로 취급하지 않았다. 되살아나는 무리는 도망칠 이유가
        없다.

        이제 죽으면 죽은 채로 둔다. 무리에서 빼고, 한 번 말하고, 다시는
        일을 주지 않는다. 죽음이 되돌릴 수 없어야 죽지 않는 일이 값어치를
        가진다.
        """
        now = time.monotonic()
        if now - getattr(self, "_mustered_at", 0.0) < MUSTER_EVERY:
            return
        self._mustered_at = now

        for worker in list(self.workers.values()):
            try:
                if (self.bridge.alive(worker.name) or {}).get("alive"):
                    continue
            except RconError:
                continue
            # 죽은 자리에 세워둔 일감은 아무도 못 한다. 놓아준다.
            self.release(worker)
            worker.autopilot = False
            self.workers.pop(worker.name, None)
            self.fallen = getattr(self, "fallen", 0) + 1
            self.say(f"{worker.name}이(가) 쓰러졌습니다. 남은 사람 "
                     f"{len(self.workers)}명. (여태 {self.fallen}명 잃음)")

        # 다 죽으면 그 사실을 한 번은 말해야 한다. 아무 말 없이 조용한
        # 것과 전멸한 것은 밖에서 보면 똑같이 생겼다 - 이번 세션에
        # 무리가 죽은 채 도는 것을 여섯 순찰 동안 못 알아본 적이 있다.
        if not self.workers and not getattr(self, "_wiped", False):
            self._wiped = True
            self.say(f"무리가 전멸했습니다. 여태 {getattr(self, 'fallen', 0)}명을 "
                     f"잃었습니다. 되살리지 않습니다 - 다시 시작하려면 "
                     f"서버를 재시작해 주십시오.")

        # 점호 끝에 «적이 왔는지»도 본다.        # 점호 끝에 «적이 왔는지»도 본다.
        #
        # 사슬 감사는 구십 초마다 돈다. 습격에는 너무 느리다 - 구십 초면
        # 화로 몇 대가 사라진다. 점호는 이십오 초마다 도니 여기가 맞다.
        self.watch_raid()

    def watch_raid(self) -> None:
        # 적이 «왔는가». 이것이 사슬보다 먼저다.
        #
        # 사용자 지시: "적이 온걸 인식할것."
        #
        # 지난 판에서 화로 11대와 채굴기 14대와 요원 74번을 잃는 동안,
        # 무리는 한 번도 「습격이다」라고 말하지 않았다. 「몇 마리가 몇
        # 타일 앞에 있다」만 되풀이했다. 이백 타일 밖의 열 마리와 공장
        # 한복판의 세 마리를 같은 말로 부르고 있었던 것이다.
        #
        # 앞의 것은 소식이고 뒤의 것은 사건이다.
        who = next(iter(self.workers), None)
        if not who:
            return
        try:
            wall = self.bridge.defence(who)
        except RconError:
            return
        hit = (wall or {}).get("raid") or {}
        if hit.get("now"):
            if not getattr(self, "_raid", False):
                self._raid = True
                where = hit.get("worst")
                spot = (f" ({where['name']} 체력 {int(where['ratio'] * 100)}%, "
                        f"{where['x']},{where['y']})" if where else "")
                self.say(
                    f"습격입니다. 방어선 안에 {int(hit.get('inside') or 0)}마리, "
                    f"기지 둘레에 {int(hit.get('near_home') or 0)}마리. "
                    f"우리 것 {int(hit.get('hurt') or 0)}채가 맞고 "
                    f"있습니다{spot}.")
        elif getattr(self, "_raid", False):
            self._raid = False
            self.say("습격이 지나갔습니다.")



    def steer(self) -> None:
        now = time.monotonic()
        if now - getattr(self, "_steered_at", 0.0) < CHIEF_EVERY:
            return
        self._steered_at = now
        if not self.workers:
            return

        who = next(iter(self.workers))
        try:
            chain = self.bridge.audit(who)
        except RconError:
            return
        if chain.get("error"):
            return

        # 여태 만든 누적 개수를 무리 전체에 나눠준다. 사다리가 소모품을
        # 「가지고 있는가」가 아니라 「만든 적 있는가」로 묻게 하는 자리다.
        rungs = chain.get("rungs") or []
        self.made = {r.get("item"): int(r.get("ever") or 0)
                     for r in rungs if r.get("item")}
        for worker in self.workers.values():
            worker.made = self.made

        # 공해가 둥지까지 얼마나 남았는가.
        #
        # 사용자: "이번맵은 적기지가 가까이있는데 이점 유의해"
        #
        # 실측: 가장 가까운 둥지가 130타일. 지난 판은 264타일이었다.
        # 딱 절반이다. 그리고 지난 판에서 공해는 224타일까지 뻗었다 -
        # 그 공장을 이 맵에 그대로 지으면 훨씬 일찍 닿는다.
        #
        # 재기만 하고 아무도 안 보고 있었다. 이제 이것이 상한을 깎는다.
        try:
            wall = self.bridge.defence(who)
            room = wall.get("slack")
            self.slack = float(room) if isinstance(room, (int, float)) else None
        except RconError:
            self.slack = getattr(self, "slack", None)
        for worker in self.workers.values():
            worker.slack = self.slack

        broken = chain.get("broken_at")
        if not broken:
            # 사슬이 끝까지 흐른다. 맡은 일을 흔들 이유가 없다.
            self._broken_at = None
            return

        want = UNBLOCK.get(broken)
        if not want:
            return

        # 끊긴 데가 바뀌지 않았으면 다시 말하지 않는다. 같은 말을 순찰마다
        # 되풀이하면 사람들이 그 말을 안 듣게 된다.
        changed = getattr(self, "_broken_at", None) != broken
        self._broken_at = broken

        hands = max(1, int(len(self.workers) * CHIEF_SHARE))
        moved = []
        for worker in list(self.workers.values())[:hands]:
            if worker.focus == want:
                continue
            worker.focus = want
            moved.append(worker.name)
            try:
                self.bridge.set_focus(worker.name, want)
            except RconError:
                pass

        if changed:
            label = next((r.get("label") for r in (chain.get("rungs") or [])
                          if r.get("item") == broken), broken)
            self.say(f"사슬이 「{label}」에서 끊겼습니다. "
                     f"{len(moved) or hands}명을 그쪽으로 돌립니다.")
