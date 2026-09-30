"""run25 도전과제 조건 추적기 (읽기 전용).

게임 상태를 바꾸는 호출은 하나도 없다: 통계(LuaFlowStatistics)·기술·열차·전력망을
읽기만 한다. 한 번 틀어지면 되돌릴 수 없는 조건(레이저 포탑을 지었다 등)과
시각 기록(첫 로켓 tick 등)은 로컬 파일 state/achievetrack.json 에 래치로 남긴다.

    python scripts/achievetrack.py            # 목표(주·부) 진행표
    python scripts/achievetrack.py --all      # 57 개 전부
    python scripts/achievetrack.py --json     # 기계용
    python scripts/achievetrack.py --no-save  # 래치 파일을 건드리지 않고 시험

상태 표기: OK 달성 · .. 진행 중 · XX 실패(되돌릴 수 없음) · ?? 미계측/추정
자세한 조건·목표 선정은 docs/achievements-run25.md.
"""
import sys, os, json, argparse
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'bridge'))
from client import AIBridge

STATE = os.path.join(os.path.dirname(__file__), '..', 'state', 'achievetrack.json')
TICKS_PER_HOUR = 216000

# 목표 세트 - docs/achievements-run25.md «추천 목표» 와 같아야 한다.
PRIMARY = [
    'steam-all-the-way', 'logistic-network-embargo', 'smoke-me-a-kipper-i-will-be-back-for-breakfast',
    'automate-this', 'getting-on-track', 'eco-unfriendly', 'steam-power',
    'research-with-automation', 'research-with-logistics', 'research-with-military',
    'research-with-chemicals', 'research-with-production', 'research-with-utility', 'research-with-space',
    'crafting-with-speed', 'crafting-with-efficiency', 'crafting-with-productivity',
    'mass-production-1', 'iron-throne-1', 'circuit-veteran-1', 'computer-age-1',
    'pest-control', 'it-stinks-and-they-dont-like-it',
]
SECONDARY = [
    'raining-bullets', 'keeping-your-hands-clean', 'art-of-siege',
    'no-time-for-chitchat', 'so-long-and-thanks-for-all-the-fish', 'terraformer',
    'trans-factorio-express', 'automated-construction', 'automated-cleanup',
    'you-have-got-a-package', 'delivery-service', 'nuclear-power', 'solaris',
    'computer-age-2', 'circuit-veteran-2', 'iron-throne-2', 'tech-maniac',
]

BUILD = ['assembling-machine-1', 'locomotive', 'spidertron', 'laser-turret', 'solar-panel',
         'active-provider-chest', 'requester-chest', 'buffer-chest', 'artillery-turret',
         'artillery-wagon', 'steam-engine', 'steam-turbine', 'nuclear-reactor', 'roboport']
MADE_TOTAL = ['electronic-circuit', 'speed-module-3', 'efficiency-module-3', 'productivity-module-3']
MADE_HOUR = ['advanced-circuit', 'processing-unit', 'iron-plate']
PACKS = {'automation': 'automation-science-pack', 'logistics': 'logistic-science-pack',
         'military': 'military-science-pack', 'chemicals': 'chemical-science-pack',
         'production': 'production-science-pack', 'utility': 'utility-science-pack',
         'space': 'space-science-pack'}

LUA = r"""(function()
local s=game.surfaces[1]; local f=game.forces.player
local o={tick=game.ticks_played, rockets=f.rockets_launched, built={}, made={}, hour={}, kills={}, packs={}}
local bs=f.get_entity_build_count_statistics(s)
for _,n in pairs(%BUILD%) do o.built[n]=bs.get_input_count(n) end
local ps=f.get_item_production_statistics(s)
for _,n in pairs(%MADE_TOTAL%) do o.made[n]=ps.get_input_count(n) end
for _,n in pairs(%MADE_HOUR%) do
  o.hour[n]=ps.get_flow_count{name=n,category='input',precision_index=defines.flow_precision_index.one_hour,count=true}
end
-- 적 구조물 · 나무 · 절벽 처치 (이 세력이 죽인 것 = input)
local ks=f.get_kill_count_statistics(s)
local spawner,worm,trees,cliffs,units=0,0,0,0,0
for n,c in pairs(ks.input_counts) do
  local p=prototypes.entity[n]
  if p then
    if p.type=='unit-spawner' then spawner=spawner+c
    elseif p.type=='turret' and p.subgroup and p.subgroup.name=='enemies' then worm=worm+c
    elseif p.type=='tree' then trees=trees+c
    elseif p.type=='cliff' then cliffs=cliffs+c
    elseif p.type=='unit' then units=units+c end
  end
end
o.kills={spawner=spawner, worm=worm, trees=trees, cliffs=cliffs, units=units}
-- 기술
local tot,done=0,0
for n,t in pairs(f.technologies) do
  local p=t.prototype
  local finite = p.max_level ~= 4294967295 and not p.research_unit_count_formula
  if finite then tot=tot+1 if t.researched then done=done+1 end end
  if t.researched or (t.level and t.level>p.level and not finite) then  -- 무한 기술은 시작 레벨 (예: 물리 피해 7) 보다 올라가야 한 번 연구한 것
    for _,i in pairs(p.research_unit_ingredients) do o.packs[i.name]=true end
  end
end
o.tech={total=tot, done=done, oil=f.technologies['oil-processing'].researched}
-- 전력망: 발전기 종류별 최근 1 시간 평균 (J/tick 추정)
local nets, seen = {}, {}
for _,p in pairs(s.find_entities_filtered{force=f,type='electric-pole'}) do
  local id=p.electric_network_id
  if id and not seen[id] then
    seen[id]=true
    local st=p.electric_network_statistics; local r={}
    for name,_ in pairs(st.output_counts) do
      r[name]=st.get_flow_count{name=name,category='output',precision_index=defines.flow_precision_index.one_hour}
    end
    if next(r) then nets[tostring(id)]=r end
  end
end
o.nets=nets
-- 열차 경로 · 따라오는 전투 로봇 · 로켓 칸의 생선
local path=0
for _,t in pairs(game.train_manager.get_trains{surface=s, force=f}) do
  local pth=t.path
  if pth and pth.total_distance and pth.total_distance>path then path=pth.total_distance end
end
o.train_path=path
local follow=0
for _,c in pairs(s.find_entities_filtered{force=f,type='character'}) do
  local ok,fr=pcall(function() return c.following_robots end)
  if ok and fr and #fr>follow then follow=#fr end
end
o.follow=follow
local fish=0
for _,silo in pairs(s.find_entities_filtered{force=f,type='rocket-silo'}) do
  local inv=silo.get_inventory(defines.inventory.rocket_silo_rocket)
  if inv then fish=fish+inv.get_item_count('raw-fish') end
end
o.fish_in_rocket=fish
-- 모드 카운터 (있으면): 손 제작 총수 · 로봇/손 건설 수 등
if remote.interfaces['ai'] and remote.interfaces['ai']['ach_counts'] then
  o.mod=remote.call('ai','ach_counts')
end
return o end)()"""


def lua_list(xs):
    return '{' + ','.join("'%s'" % x for x in xs) + '}'


def load_state():
    try:
        with open(STATE, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(st):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, 'w', encoding='utf-8') as fh:
        json.dump(st, fh, ensure_ascii=False, indent=1)


def latch(st, key, cond, tick, value=None):
    """cond 가 처음 참이 된 tick 을 기록한다 (이후 유지)."""
    if cond and key not in st:
        st[key] = tick if value is None else value
    return st.get(key)


def hhmm(ticks):
    if ticks is None:
        return '-'
    m = int(ticks / 3600)
    return '%dh%02dm' % (m // 60, m % 60)


def evaluate(m, st):
    t = m['tick']
    b, made, hour, k = m['built'], m['made'], m['hour'], m['kills']
    mod = m.get('mod') or {}
    packs = m.get('packs') or {}
    R = {}

    def put(name, status, detail):
        R[name] = (status, detail)

    def reach(name, have, need, fmt='%s / %s'):
        put(name, 'OK' if have >= need else '..', fmt % (round(have), need))

    # ---- 래치 (되돌릴 수 없는 사건의 첫 목격 tick)
    rocket_tick = latch(st, 'first_rocket_tick', m['rockets'] > 0, t)
    loco_tick = latch(st, 'first_locomotive_tick', b['locomotive'] > 0, t)
    space_tick = latch(st, 'space_research_tick', bool(packs.get('space-science-pack')), t)
    solar_tick = latch(st, 'first_solar_tick', b['solar-panel'] > 0, t)
    laser_tick = latch(st, 'first_laser_tick', b['laser-turret'] > 0, t)
    chest_n = b['active-provider-chest'] + b['requester-chest'] + b['buffer-chest']
    chest_tick = latch(st, 'first_embargo_chest_tick', chest_n > 0, t)
    arty_n = b['artillery-turret'] + b['artillery-wagon']
    struct_n = k['spawner'] + k['worm']
    # 첫 적 구조물 처치를 목격한 순간 포병이 하나도 없었다면 손/포탑으로 죽인 것.
    first_struct = latch(st, 'first_structure_kill', struct_n > 0, t,
                         {'tick': t, 'artillery_built': arty_n})

    def before_rocket(fail_tick):
        return fail_tick is not None and (rocket_tick is None or fail_tick <= rocket_tick)

    # ---- 진행
    put('automate-this', 'OK' if b['assembling-machine-1'] > 0 else '..', '조립기 1 설치 %d' % b['assembling-machine-1'])
    put('getting-on-track', 'OK' if b['locomotive'] > 0 else '..', '기관차 설치 %d' % b['locomotive'])
    put('getting-on-track-like-a-pro',
        'OK' if loco_tick is not None and loco_tick <= 324000 else ('XX' if t > 324000 and loco_tick is None or (loco_tick or 0) > 324000 else '..'),
        '첫 기관차 %s (제한 1h30m)' % hhmm(loco_tick))
    put('arachnophilia', 'OK' if b['spidertron'] > 0 else '..', '스파이더트론 %d' % b['spidertron'])
    put('eco-unfriendly', 'OK' if m['tech']['oil'] else '..', 'oil-processing')
    steam_on = any((n.get('steam-engine') or 0) > 0 for n in m['nets'].values())
    solar_on = any((n.get('solar-panel') or 0) > 0 for n in m['nets'].values())
    nuke_on = any((n.get('steam-turbine') or 0) > 0 for n in m['nets'].values()) and b['nuclear-reactor'] > 0
    put('steam-power', 'OK' if steam_on or b['steam-engine'] > 0 else '..', '증기 엔진 발전')
    put('solar-power', 'OK' if solar_on else '..', '태양광 발전 (steam-all-the-way 와 충돌 - 로켓 뒤에만)')
    put('nuclear-power', 'OK' if nuke_on else '..', '원자로 %d · 터빈 발전' % b['nuclear-reactor'])
    for key, item in (('speed', 'speed-module-3'), ('efficiency', 'efficiency-module-3'), ('productivity', 'productivity-module-3')):
        reach('crafting-with-' + key, made[item], 1)
    put('smoke-me-a-kipper-i-will-be-back-for-breakfast', 'OK' if m['rockets'] > 0 else '..',
        '로켓 %d · 첫 발사 목격 %s · 지금 %s' % (m['rockets'], hhmm(rocket_tick), hhmm(t)))

    # ---- 탐험
    put('it-stinks-and-they-dont-like-it', 'OK?' if k['units'] > 0 else '..',
        '추정: 적 유닛 처치 %d (공해 공격 직접 신호 없음)' % k['units'])
    for name, key, need in (('automated-construction', 'robot_built', 100), ('automated-cleanup', 'robot_mined', 100),
                            ('you-have-got-a-package', 'robot_delivered', 1), ('delivery-service', 'robot_delivered', 10000)):
        if key in mod:
            reach(name, mod[key], need)
        else:
            put(name, '??', '모드 카운터 %s 없음 (로봇포트 %d)' % (key, b['roboport']))
    if 'robot_built' in mod and 'hand_built' in mod:
        put('you-are-doing-it-right', 'OK' if mod['robot_built'] > mod['hand_built'] else '..',
            '로봇 %d vs 손 %d' % (mod['robot_built'], mod['hand_built']))
    else:
        put('you-are-doing-it-right', '??', '모드 카운터 robot_built/hand_built 없음')
    best = max(m['train_path'], st.get('best_train_path', 0))
    st['best_train_path'] = best
    reach('trans-factorio-express', best, 1000, '최장 경로 %s / %s 칸 (표본)')
    put('watch-your-step', '??', '기관차에 치여 죽기 - 목표 아님')
    put('golem', '??', '한 방 500+ 피해 생존 - 목표 아님')
    put('mining-with-determination', '??', '광맥 하나 완전 고갈 (반경 12 칸 광석 0) - 수동 확인')

    # ---- 생산 (총량 · 최근 1 시간)
    for i, need in ((1, 10000), (2, 1000000), (3, 20000000)):
        reach('mass-production-%d' % i, made['electronic-circuit'], need)
    for base, item, needs in (('circuit-veteran', 'advanced-circuit', (1000, 10000, 25000)),
                              ('computer-age', 'processing-unit', (500, 1000, 5000)),
                              ('iron-throne', 'iron-plate', (20000, 200000, 400000))):
        for i, need in enumerate(needs, 1):
            key = '%s-%d' % (base, i)
            peak = max(hour[item], st.get('peak_' + item, 0))
            st['peak_' + item] = peak
            reach(key, peak, need, '최고 시간당 %s / %s (지금 ' + str(round(hour[item])) + ')')

    # solaris: 한 망에서 최근 1 시간 태양광 > 10 GJ, 증기 엔진·터빈 0
    best_gj, clean = 0.0, False
    for n in m['nets'].values():
        sol = (n.get('solar-panel') or 0) * TICKS_PER_HOUR / 1e9
        steamy = (n.get('steam-engine') or 0) + (n.get('steam-turbine') or 0)
        if steamy == 0 and sol > best_gj:
            best_gj, clean = sol, True
    put('solaris', 'OK?' if clean and best_gj > 10 else '..',
        '증기 없는 망 태양광 %.1f GJ/h (단위 J/tick 추정)' % best_gj)

    # ---- 연구
    for key, pack in PACKS.items():
        put('research-with-' + key, 'OK' if packs.get(pack) else '..', pack)
    reach('tech-maniac', m['tech']['done'], m['tech']['total'], '유한 기술 %s / %s')

    # ---- 처치
    put('pest-control', 'OK' if k['spawner'] > 0 else '..', '둥지 처치 %d' % k['spawner'])
    put('steamrolled', '??', '차량 충돌로 둥지 10 - 브리지에 운전 없음')
    put('pyromaniac', '??', '불로 나무 1 만 (나무 처치 총 %d, 원인 구분 불가)' % k['trees'])
    put('run-forrest-run', '??', '차량 충돌로 나무 100 - 브리지에 운전 없음')
    put('terraformer', 'OK' if k['cliffs'] > 0 else '..', '절벽 파괴 %d (통계에 잡힐 때)' % k['cliffs'])
    put('destroyer-of-worlds', '??', '원자탄 발사 - 수동 확인')
    reach('minions', max(m['follow'], st.get('peak_follow', 0)), 100, '따라오는 전투 로봇 최다 %s / %s')
    st['peak_follow'] = max(m['follow'], st.get('peak_follow', 0))
    put('art-of-siege', 'OK?' if arty_n > 0 and struct_n > 0 else '..',
        '포병 %d · 구조물 처치 %d (포병 처치 여부는 추정)' % (arty_n, struct_n))
    if first_struct is None:
        put('keeping-your-hands-clean', '..', '적 구조물 처치 0 - 포병 전까지 유지')
    elif first_struct.get('artillery_built', 0) > 0:
        put('keeping-your-hands-clean', 'OK?', '첫 구조물 처치 %s, 그때 포병 %d' % (hhmm(first_struct['tick']), first_struct['artillery_built']))
    else:
        put('keeping-your-hands-clean', 'XX', '첫 구조물 처치 %s 에 포병 없음' % hhmm(first_struct['tick']))

    # ---- 제한 (로켓/우주 연구까지)
    if 'hand_crafted' in mod:
        n = mod['hand_crafted']
        put('lazy-bastard', 'XX' if n > 111 else ('OK' if m['rockets'] > 0 else '..'), '손 제작 %d / 111 (전 캐릭터 합)' % n)
    else:
        put('lazy-bastard', '??', '모드 카운터 hand_crafted 없음 - 목표 아님')

    def limit(name, fail_tick, what):
        if before_rocket(fail_tick):
            put(name, 'XX', '%s 첫 설치 %s' % (what, hhmm(fail_tick)))
        elif rocket_tick is not None:
            put(name, 'OK', '로켓 %s 까지 %s 0' % (hhmm(rocket_tick), what))
        else:
            put(name, '..', '%s 0 유지 중' % what)
    limit('steam-all-the-way', solar_tick, '태양광 패널')
    limit('raining-bullets', laser_tick, '레이저 포탑')
    if chest_tick is not None and (space_tick is None or chest_tick <= space_tick):
        put('logistic-network-embargo', 'XX', '요청/버퍼/능동 상자 첫 설치 %s' % hhmm(chest_tick))
    elif space_tick is not None:
        put('logistic-network-embargo', 'OK', '우주 과학 연구 %s 까지 금지 상자 0' % hhmm(space_tick))
    else:
        put('logistic-network-embargo', '..', '금지 상자 0 유지 중 (우주 과학 연구까지)')
    for name, lim in (('no-time-for-chitchat', 15), ('there-is-no-spoon', 8)):
        cap = lim * TICKS_PER_HOUR
        if rocket_tick is not None:
            put(name, 'OK' if rocket_tick <= cap else 'XX', '첫 로켓 %s / %dh' % (hhmm(rocket_tick), lim))
        else:
            put(name, 'XX' if t > cap else '..', '지금 %s / %dh' % (hhmm(t), lim))
    put('so-long-and-thanks-for-all-the-fish', 'OK?' if st.get('fish_seen') and m['rockets'] > st.get('fish_seen_rockets', 0) else '..',
        '로켓 칸 생선 %d' % m['fish_in_rocket'])
    if m['fish_in_rocket'] > 0 and not st.get('fish_seen'):
        st['fish_seen'] = t
        st['fish_seen_rockets'] = m['rockets']
    return R


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--no-save', action='store_true', help='래치 파일을 쓰지 않는다 (다른 런에서 시험할 때)')
    ap.add_argument('--every', type=float, default=0, help='상주: 이 초마다 다시 잰다 (래치 정확도 - 5 분 권장)')
    a = ap.parse_args()
    if a.every:
        import time
        while True:
            try:
                once(a)
            except Exception as exc:  # noqa: BLE001 - 상주 고리는 한 번 실패로 죽지 않는다
                print('  게임이 대답하지 않는다:', exc, flush=True)
            sys.stdout.flush()
            time.sleep(a.every)
    once(a)


def once(a):
    lua = (LUA.replace('%BUILD%', lua_list(BUILD)).replace('%MADE_TOTAL%', lua_list(MADE_TOTAL))
           .replace('%MADE_HOUR%', lua_list(MADE_HOUR)))
    m = AIBridge().lua(lua)
    st = load_state()
    R = evaluate(m, st)
    if not a.no_save:
        save_state(st)
    if a.json:
        print(json.dumps({'tick': m['tick'], 'results': R, 'latches': st}, ensure_ascii=False, indent=1))
        return
    print('run25 도전과제 - 게임 시간 %s · 로켓 %d' % (hhmm(m['tick']), m['rockets']))
    groups = [('주 목표', PRIMARY), ('부 목표', SECONDARY)]
    if a.all:
        rest = sorted(n for n in R if n not in PRIMARY and n not in SECONDARY)
        groups.append(('나머지', rest))
    for title, names in groups:
        done = sum(1 for n in names if R[n][0] == 'OK')
        print('\n[%s] %d / %d' % (title, done, len(names)))
        for n in names:
            s, d = R[n]
            print('  %-3s %-48s %s' % (s, n, d))


if __name__ == '__main__':
    main()
