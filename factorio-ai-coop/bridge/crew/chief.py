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


class ChiefMixin:
    """반장 - 사슬에서 끊긴 칸을 찾아 그쪽으로 사람을 몰아준다."""

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
