"""머리를 무리에 붙인다.

사용자: "각 캐릭터들을 1개씩 sonnet5모델의 CLI를 달아서 직접 생각하고
행동하도록 다시 바꿔주는데, 심시티건설은 메인반장에게 물어보고 진행할 것."

권한을 둘로 나눈다.

    무엇을 할 것인가   머리(mind.py)가 정한다.
    어디에 지을 것인가 반장이 정한다 - `grant` 가 그 창구다.

머리는 좌표를 말할 수 없다. 「화로를 세우겠다」까지가 머리의 몫이고, 그
화로가 제련 블록 몇 번 자리에 서는지는 반장이 답한다. 모델에게 「좌표를
지어내지 마라」고 적어두는 것으로는 여러 번 샜다 - 적어두는 대신
«말할 수 없게» 만든다.

그리고 머리는 느리다. `claude -p` 한 번에 몇 초인데 순찰은 1초마다 돈다.
그래서 생각은 다른 실에서 돌고, 여기서는 «끝난 것만» 집어간다. 생각하는
동안 그 사람은 규칙이 고른 일을 한다 - 기다리며 서 있지 않는다.
"""

from __future__ import annotations

import time

import lessons
import mind as mind_mod
from client import RconError
from jobs import Job
from settings import MIND_EVERY, MIND_MODEL, MIND_TIMEOUT, ORE_BATCH, SMELT_BATCH
from world import Snapshot

# 머리가 세워도 되는 것. 도시 설계가 자리를 아는 것들이다.
GRANTED = {"stone-furnace", "burner-mining-drill", "wooden-chest",
           "burner-inserter", "lab", "gun-turret"}


class ThinkingMixin:
    """각자 생각하게 하고, 도시는 반장이 그린다."""

    # -- 머리와 수첩 ------------------------------------------------------

    def mind_of(self, name):
        self.minds = getattr(self, "minds", {})
        if name not in self.minds:
            self.minds[name] = mind_mod.Mind(name, MIND_MODEL, timeout=MIND_TIMEOUT)
        return self.minds[name]

    def journal_of(self, name):
        self.journals = getattr(self, "journals", {})
        if name not in self.journals:
            self.journals[name] = lessons.Journal(name)
        return self.journals[name]

    def note_outcome(self, name: str, key: str, ok: bool, why: str = "") -> None:
        """«실제로» 어떻게 됐는지를 수첩에 되돌린다.

        수첩에 적히던 ○ 는 「게임에서 됐다」가 아니라 「큐에 접수됐다」였다.
        `submit_plan` 이 RconError 를 안 냈다는 뜻뿐이고, 게임은 그때
        재료도 대상도 안 본다 - 「no X in inventory」 는 몇 초 뒤에 온다.

        그러면 수첩이 거짓이 되고, 그 위에서 규칙을 압축한다. 그리고 그
        규칙은 파일로 굳어 판을 넘어 산다. 「수첩의 값어치는 실패한 것에
        있다」고 적어놓고 실패를 한 줄도 안 적고 있었다.

        결과를 아는 곳은 `report_finished` 다. 거기서 이리로 돌려준다.
        """
        book = getattr(self, "journals", {}).get(name)
        if book is None:
            return
        for entry in reversed(book.entries):
            if entry.why == key and entry.ok:
                entry.ok = ok
                entry.why = why or key
                break
        else:
            return
        # 파일에도 «고친 사실»을 남긴다. 줄을 고치는 대신 덧붙인다 -
        # 지나간 것을 지우면 무엇이 언제 틀렸는지를 잃는다.
        book.note(entry.do, entry.args, ok, why or key)

    # -- 큰 그림 ----------------------------------------------------------

    def big_picture(self, worker, snap: Snapshot) -> str:
        """공장 전체의 형편. 여섯 사람이 «같은 것»을 본다.

        한 사람의 가방만 보고 고르면 「나는 없다」가 여섯 번 모여, 이미
        넘치는 것을 여섯이 더 캐러 간다. 그 값을 이미 치렀다.
        """
        import mission

        lines = ["목표: " + mission.briefing(snap)]

        broken = getattr(self, "_broken_at", None)
        lines.append("사슬이 끊긴 곳: " + (broken or "없음 (끝까지 흐른다)"))

        slack = getattr(self, "slack", None)
        room = f"{slack:.0f}타일 남음" if isinstance(slack, (int, float)) else "모름"
        lines.append(
            f"방어: 공해가 둥지까지 {room}, 모자란 터렛 {getattr(self, 'debt', 0)}대"
            + (", 터렛 연구 완료" if snap.knows("gun-turret") else ", 터렛 연구 아직"))

        if snap.smelter:
            seat = snap.next_furnace
            lines.append(
                f"도시 설계(반장): 제련 구역 ({snap.smelter['x']:.0f},"
                f"{snap.smelter['y']:.0f})"
                + (f", 다음 화로 자리 ({seat['x']:.0f},{seat['y']:.0f})" if seat else "")
                + "\n  - 자리는 내가 정하지 않는다. build 만 말하면 반장이 준다.")

        built = ", ".join(f"{k} {v.get('count', 0)}"
                          for k, v in sorted(snap.buildings.items())) or "없음"
        lines.append("세워둔 것: " + built)

        lines.append(self.pantry.brief())

        mates = [f"{w.name}={getattr(w, 'role', None) or w.focus}"
                 for w in self.workers.values() if w.name != worker.name]
        if mates:
            lines.append("동료의 담당: " + ", ".join(mates)
                         + "\n  - 내 담당이 아닌 것이 급하면, 직접 하기 전에"
                           " 그 담당에게 부탁할 것이 없는지 먼저 봐라."
                           " 남이 들고 있는 것을 내가 다시 만드는 것이"
                           " 이 무리가 가장 자주 낭비하는 방식이다.")

        rows = list(self.board.summary())
        if rows:
            lines.append("게시판(부탁): " + " / ".join(rows[:4]))
        return "\n".join(lines)

    def my_situation(self, worker, snap: Snapshot) -> str:
        bag = ", ".join(f"{k} {v}" for k, v in sorted(snap.items.items()))
        role = getattr(worker, "role", None)
        lines = [f"나는 {worker.name}. 위치 ({snap.x:.0f}, {snap.y:.0f}). "
                 f"맡은 광석은 {worker.focus}."
                 + (f"\n내 담당은 «{role}»다." if role else ""),
                 "가방: " + (bag or "비어있음")]
        if snap.resources:
            near = sorted(snap.resources.items(),
                          key=lambda kv: kv[1]["nearest_dist"])[:4]
            lines.append("가까운 광맥: " + ", ".join(
                f"{n} ({i['nearest']['x']:.0f},{i['nearest']['y']:.0f}) "
                f"{i['nearest_dist']:.0f}타일" for n, i in near))
        return "\n".join(lines)

    # -- 반장이 자리를 준다 ------------------------------------------------

    def grant(self, snap: Snapshot, what: str):
        """「이걸 세우겠습니다」에 «자리»로 답한다. 없으면 None.

        여기가 심시티의 유일한 창구다. 머리가 좌표를 말할 수 없으므로
        도시의 모양은 이 함수 하나가 정한다.
        """
        if what not in GRANTED:
            return None
        if what == "stone-furnace":
            if snap.next_furnace:
                return snap.next_furnace
            from layout import furnace_seat
            return furnace_seat(snap.smelter, 0) if snap.smelter else None
        # 채굴기와 나머지는 자리표를 쥔 루틴이 맡는다. 반장이 좌표를
        # 지어내는 것과 머리가 지어내는 것은 같은 잘못이다.
        return None

    # -- 생각을 일감으로 --------------------------------------------------

    def job_from(self, worker, snap: Snapshot, thought):
        """머리가 낸 뜻을 무리가 아는 일감으로 옮긴다.

        옮길 수 없으면 None 이고, 그때는 규칙이 고른다. 머리가 옮길 수
        없는 것을 말했다고 그 사람이 서 있을 이유는 없다.
        """
        do, args = thought.do, thought.args

        if do == "build":
            what = args.get("what")
            if what == "burner-mining-drill":
                ore = worker.focus
                if not snap.ore(ore):
                    return None
                return Job(f"채굴기를 한 대 더 놓겠습니다 ({ore}).",
                           key=f"automate:{ore}:{worker.name}",
                           routine="automate", ore=ore,
                           needs={"burner-mining-drill": 1})
            seat = self.grant(snap, what)
            if not seat:
                return None
            return Job(f"{what}을(를) 반장이 정해준 자리에 세우겠습니다.",
                       key=f"mind-build:{what}:{seat['x']:.0f},{seat['y']:.0f}",
                       needs={what: 1},
                       steps=[("build", {"name": what, "x": seat["x"],
                                         "y": seat["y"], "snap": True})])

        if do == "mine":
            ore = args.get("ore", "")
            want = args.get("count") or ORE_BATCH
            # 창고에 있으면 캐지 않는다. 공용 물류를 쓰라고 세워둔 것이다.
            # 다만 «그 물건이 든 상자»로 보낸다 - 합계로 판단하고 가장
            # 가까운 상자로 보내면 엉뚱한 상자 앞에서 실패한다.
            got = self.pantry.shelf(ore, want)
            if got:
                spot, amount = got
                return Job(f"{ore} {amount}개는 공용 창고에 있습니다. "
                           f"꺼내 오겠습니다.",
                           key=f"mind-fetch:{ore}:{worker.name}",
                           steps=[("take", {"name": ore, "count": amount,
                                            "x": spot["x"], "y": spot["y"]})])
            spot = snap.ore(ore)
            if not spot:
                return None
            return Job(f"{ore}를 {want}개 캐 오겠습니다.",
                       key=f"mind-mine:{ore}:{worker.name}",
                       steps=[("mine", {**spot, "count": want,
                                        "search_radius": 10,
                                        "timeout_ticks": 60 * 60 * 5})])

        if do == "craft":
            return Job(f"{args['recipe']}을(를) 만들겠습니다.",
                       key=f"mind-craft:{args['recipe']}:{worker.name}",
                       steps=[("craft", {"recipe": args["recipe"],
                                         "count": args.get("count") or 1})])

        if do in ("smelt", "collect"):
            spot = (snap.buildings.get("stone-furnace") or {}).get("nearest")
            if not spot:
                return None
            at = {"x": int(spot["x"]), "y": int(spot["y"])}
            if do == "smelt":
                ore = args["ore"]
                count = args.get("count") or SMELT_BATCH
                return Job(f"화로에 {ore}을(를) {count}개 넣겠습니다.",
                           key=f"mind-smelt:{at['x']},{at['y']}",
                           needs={ore: count},
                           steps=[("insert", {"name": ore, "count": count, **at}),
                                  ("insert", {"name": "coal", "count": 5, **at})])
            item = args["item"]
            return Job(f"화로에서 {item}을(를) 거둬오겠습니다.",
                       key=f"mind-take:{at['x']},{at['y']}",
                       steps=[("take", {"name": item, "count": 20, **at})])
        return None

    # -- 창고를 기억하고 알린다 -------------------------------------------

    def mind_the_pantry(self, who: str) -> None:
        """공용 창고를 다시 읽고, 바뀐 것이 있으면 한 번 말한다.

        넣는 일과 꺼내는 일은 이미 있었다. 없던 것은 «기억»이다 - 창고가
        있어도 그 안이 안 보이면 없는 것과 같다. 옆 사람이 철광석 150개를
        든 채로 「철광석이 필요합니다」라고 말한 적이 있다.
        """
        if not self.pantry.stale:
            return
        try:
            self.pantry.remember(self.bridge.stores(who))
        except RconError:
            return
        told = self.pantry.news()
        if told:
            self.say(told)

    # -- 일감을 실제로 맡긴다 ---------------------------------------------

    def give(self, worker, job) -> bool:
        """머리가 고른 일을 그 사람에게 맡긴다. 맡았으면 True.

        배차(`dispatch`)가 하는 절차와 «같아야» 한다. 여기만 따로 줄이면
        점유도 안 되고 감시도 안 되는 유령 일감이 생긴다 - 그리고 그것은
        조용히 실패한다.

        실제로 그랬다. 처음에 이 함수를 안 만들고 `self.give` 라고만
        써뒀는데, 무리에 그런 이름이 없어서 머리가 생각을 마칠 때마다
        순찰이 터졌다. 로그에는 머리가 한 «말»만 남아서 잘 도는 것처럼
        보였다 - 말은 일을 맡기기 «전»에 하기 때문이다.
        """
        if job.routine:
            if not self.start_routine(worker, job.routine, job.ore, job.at):
                return False
        else:
            try:
                worker.watching = worker.handle.submit_plan(job.steps)
            except RconError:
                return False
        self.claim(worker, job.key)
        self.say(job.narration, who=worker.name)
        worker.said_idle = False
        # 결과가 돌아올 때 «어느 생각의 결과인지» 알아야 한다. 태스크
        # 번호만으로는 수첩의 어느 줄인지 못 찾는다.
        worker.held_key = job.key
        return True

    # -- 순찰마다 한 번 ---------------------------------------------------

    def let_them_think(self, free, handed):
        """손이 빈 사람에게 생각할 기회를 준다. 일감을 받은 이름을 돌려준다.

        생각은 오래 걸리므로 «시작»과 «수확»이 다른 순찰에 일어난다.
        그 사이에 그 사람이 노는 일은 없다 - 규칙이 계속 고른다.
        """
        if not MIND_MODEL or not free:
            return set()

        self.mind_the_pantry(free[0][0].name)

        took = set()
        now = time.monotonic()
        for worker, snap in free:
            head = self.mind_of(worker.name)
            book = self.journal_of(worker.name)

            # 1) 다 익은 생각이 있으면 먼저 거둔다.
            got = head.take()
            if got is not None:
                self.harvest(worker, snap, got, book, handed, took)

            # 2) 수첩이 익었으면 줄인다. 겪은 것을 규칙으로 바꾸는 자리다.
            #    이것이 「고도화」다 - 쌓는 것은 기억이고, 줄이는 것이 배움이다.
            if book.ripe and not head.thinking:
                head.start_distil(book.distil_prompt())
                continue

            # 3) 생각할 때가 됐으면 시작한다.
            if head.thinking:
                continue
            if now < getattr(worker, "thought_at", 0.0):
                continue
            worker.thought_at = now + MIND_EVERY
            head.start(self.big_picture(worker, snap),
                       self.my_situation(worker, snap),
                       extra=book.brief())
        return took

    def harvest(self, worker, snap, got, book, handed, took) -> None:
        """익은 생각 하나를 거둔다. 결과는 반드시 수첩에 남는다.

        남기지 않으면 다음에 또 같은 것을 시도한다. 수첩의 값어치는
        «실패한 것»에 있다 - 성공한 것은 어차피 상황이 다시 가르쳐준다.
        """
        if got.rules:
            # 받아들였는지 «보고» 말한다. 반환값을 버리고 무조건 말하면
            # 로그만 성공처럼 보인다 - 게다가 여기서 세던 것은 방금 배운
            # 규칙이 아니라 «옛» 규칙이었다.
            if book.learn(got.rules):
                self.say(f"해본 것을 규칙 {len(book.rules.splitlines())}줄로 "
                         f"줄였습니다.", who=worker.name)
            return
        job = self.job_from(worker, snap, got) if got.do != "follow" else None
        # 생각한 것을 먼저 말한다. 다만 «일감 이름»은 맡은 뒤에 말한다 -
        # 맡기기 전에 말하면 실패해도 성공처럼 보인다.
        if got.say:
            self.say(got.say, who=worker.name)
        if job is None:
            book.note(got.do, got.args, False,
                      "규칙에 맡김" if got.do == "follow" else "옮길 수 없는 뜻")
        elif worker.name in handed:
            book.note(got.do, got.args, False, "반장이 이미 일을 줬음")
        elif self.give(worker, job):
            book.note(got.do, got.args, True, job.key)
            took.add(worker.name)
        else:
            book.note(got.do, got.args, False, "일감을 못 맡음")
