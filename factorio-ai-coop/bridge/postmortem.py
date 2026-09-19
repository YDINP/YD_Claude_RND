"""전멸하면 그 판이 왜 죽었는지 적어둔다.

사용자 지시: "캐릭터가 다 죽으면 그때마다 기록해서 개선점을 찾아서
업데이트하고 서버 재시작할 것."

기록이 사람 손에 달려 있으면 기록은 안 남는다. 514분짜리 판이 전멸했을
때, 원인은 전부 게임 안에 있었는데 서버를 재시작하는 순간 사라졌을
것들이었다:

    잡은 것   character 4, transport-belt 24, burner-drill 2 ... (우리 것)
    잡힌 것   없음                                      <- 한 마리도 못 잡았다
    터렛 0, 연구 gun-turret, 완료 기술 3개 / 514분

그래서 죽는 «그 자리»에서 적는다. 사후에 물으면 이미 늦다.

이 모듈은 아무것도 판단하지 않는다. 판단은 사람과 다음 커밋의 몫이고,
여기는 그 판단이 딛고 설 숫자만 남긴다.
"""

from __future__ import annotations

import datetime as _dt
import json
import os

# 저장소 안에 남긴다. 다음 판에서 읽어야 하고, 커밋으로 남아야 한다.
WIPE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "docs", "wipes")

# 죽기 직전의 말이 가장 많은 것을 알려준다. 로그 전체는 너무 길고,
# 열 줄은 너무 짧다 - 514분 판에서는 마지막 서른 줄에 원인이 다 있었다.
LAST_WORDS = 40

# 게임에 한 번만 묻는다. 전멸한 판이라 급할 것은 없지만, 물어보는 동안
# 게임이 멈추므로 한 번에 다 묻는다.
_PROBE = """(function()
  local s = game.surfaces[1]
  local f = game.forces.player
  local ks = f.get_kill_count_statistics(s)
  local lost, got = {}, {}
  for name, n in pairs(ks.output_counts or {}) do lost[name] = n end
  for name, n in pairs(ks.input_counts or {}) do got[name] = n end
  local techs = {}
  for name, t in pairs(f.technologies) do if t.researched then techs[#techs+1] = name end end
  local ok, evo = pcall(function() return game.forces.enemy.get_evolution_factor(s) end)
  local function c(t) return s.count_entities_filtered(t) end
  local stuck = {}
  for _, e in pairs(s.find_entities_filtered{
        name = {"burner-mining-drill", "electric-mining-drill", "stone-furnace",
                "assembling-machine-1", "lab"}, force = f}) do
    local why = "?"
    for k, v in pairs(defines.entity_status) do if v == e.status then why = k end end
    local row = e.name .. " " .. why
    stuck[row] = (stuck[row] or 0) + 1
  end
  return {
    minutes = math.floor(game.tick / 3600),
    ours_lost = lost,
    theirs_killed = got,
    evolution = ok and evo or -1,
    nests = c{type = "unit-spawner", force = "enemy"},
    biters = c{type = "unit", force = "enemy"},
    worms = c{type = "turret", force = "enemy"},
    research = f.current_research and f.current_research.name or nil,
    techs = techs,
    machines = stuck,
    ours = {
      drills = c{name = "burner-mining-drill", force = f}
             + c{name = "electric-mining-drill", force = f},
      furnaces = c{name = "stone-furnace", force = f},
      belts = c{name = "transport-belt", force = f},
      chests = c{name = "wooden-chest", force = f} + c{name = "iron-chest", force = f},
      inserters = c{name = "burner-inserter", force = f} + c{name = "inserter", force = f},
      turrets = c{name = "gun-turret", force = f},
      labs = c{name = "lab", force = f},
    },
  }
end)()"""


def _rows(table: dict | list | None) -> list[str]:
    """루아는 빈 배열과 빈 표를 구별하지 못한다. 둘 다 {} 로 온다."""
    if isinstance(table, dict):
        return [f"{k} {v}" for k, v in sorted(table.items(), key=lambda kv: -kv[1])]
    return [str(v) for v in (table or [])]


def _tell(fact: dict) -> list[str]:
    """숫자가 스스로 말하는 것만 적는다. 해석은 사람 몫이다."""
    said = []
    ours = fact.get("ours") or {}
    if not ours.get("turrets"):
        said.append("터렛이 한 대도 없었다. 방어가 아예 서지 못했다.")
    if not fact.get("theirs_killed"):
        said.append("한 마리도 못 잡았다. 싸운 것이 아니라 물린 것이다.")
    if fact.get("research") and len(fact.get("techs") or []) <= 5:
        said.append(f"{fact['minutes']}분 동안 기술이 "
                    f"{len(fact.get('techs') or [])}개뿐이다. 공장이 안 컸다.")
    if (fact.get("biters") or 0) > 50:
        said.append(f"바이터 {fact['biters']}마리, 둥지 {fact.get('nests')}곳이 "
                    f"지도에 남아 있다.")
    return said


def record(bridge, log: list, fallen: int) -> str | None:
    """전멸한 판의 증거를 파일 하나로 남기고, 그 경로를 돌려준다.

    실패해도 조용히 넘어간다. 기록을 못 남기는 것보다 기록을 남기려다
    무리가 멈추는 쪽이 나쁘다.
    """
    try:
        fact = bridge.lua(_PROBE)
    except Exception:
        return None
    if not isinstance(fact, dict):
        return None

    stamp = _dt.datetime.now()
    os.makedirs(WIPE_DIR, exist_ok=True)
    path = os.path.join(WIPE_DIR, stamp.strftime("%Y-%m-%d-%H%M") + ".md")

    ours = fact.get("ours") or {}
    out = [
        f"# 전멸 기록 — {stamp:%Y-%m-%d %H:%M}",
        "",
        f"게임 시간 **{fact.get('minutes')}분**, 잃은 사람 **{fallen}명**, "
        f"진화도 **{round(fact.get('evolution') or 0, 4)}**",
        "",
        "## 숫자가 말하는 것",
        "",
    ]
    told = _tell(fact)
    out += [f"- {line}" for line in told] if told else ["- (눈에 띄는 것 없음)"]
    out += [
        "",
        "## 우리가 세운 것",
        "",
        "| 것 | 수 |",
        "|---|---:|",
    ]
    out += [f"| {k} | {v} |" for k, v in sorted(ours.items())]
    out += [
        "",
        "## 전투",
        "",
        "잃은 것: " + (", ".join(_rows(fact.get("ours_lost"))) or "없음"),
        "",
        "잡은 것: " + (", ".join(_rows(fact.get("theirs_killed"))) or "**없음**"),
        "",
        f"지도에 남은 적: 둥지 {fact.get('nests')}, 바이터 {fact.get('biters')}, "
        f"웜 {fact.get('worms')}",
        "",
        "## 공장",
        "",
        f"연구 중: {fact.get('research') or '없음'} — "
        f"완료 {len(fact.get('techs') or [])}개 ({', '.join(fact.get('techs') or [])})",
        "",
        "멈춰 선 기계:",
        "",
    ]
    out += [f"- {row}" for row in _rows(fact.get("machines"))] or ["- 없음"]
    out += ["", "## 마지막 말", "", "```"]
    for line in (log or [])[-LAST_WORDS:]:
        if isinstance(line, dict):
            out.append(f"{line.get('who', '?'):8} {line.get('text', '')}")
        else:
            out.append(str(line))
    out += ["```", "",
            "## 개선점", "",
            "<!-- 다음 판을 열기 전에 채운다. 비어 있으면 같은 판을 또 한다. -->",
            ""]

    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n".join(out))
    except OSError:
        return None

    # 기계가 읽을 몫도 옆에 둔다. 판을 여럿 비교할 때 표가 필요하다.
    try:
        with open(path[:-3] + ".json", "w", encoding="utf-8") as fh:
            json.dump({"fallen": fallen, **fact}, fh, ensure_ascii=False, indent=1)
    except OSError:
        pass
    return path
