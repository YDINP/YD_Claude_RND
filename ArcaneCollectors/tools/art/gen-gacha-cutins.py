# -*- coding: utf-8 -*-
"""gacha-cutins.json 생성기.

ascended-heroes.json / cults.json / story.json 을 읽어 컷인 프리셋 24종을 굽는다.
기본값 규칙(교단→배경·문장·액센트, 분위기→파티클·등장방식)은 여기서 한 번 적용해
데이터에 펼쳐 쓴다. 개별 항목을 손으로 고치면 그 값이 그대로 이긴다.
"""
import json
import io
import os

ROOT = 'D:\\park\\YD_Claude_RND\\ArcaneCollectors\\'

asc = json.load(io.open(ROOT + 'src/data/ascended-heroes.json', encoding='utf-8'))['ascendedHeroes']
story = json.load(io.open(ROOT + 'src/data/story.json', encoding='utf-8'))['scenes']
cults = json.load(io.open(ROOT + 'src/data/cults.json', encoding='utf-8'))['cults']

evolve = {(s['heroId'], s['cultId']): s for s in story if s['trigger'] == 'hero_evolve'}
first = {s['heroId']: s for s in story if s['trigger'] == 'first_hero'}

# 교단 → 배경. bg_<cult> 아트는 아직 없어서 챕터 배경으로 매핑한다(§테마 근접).
#   chapter_1 균열의 시작 / chapter_2 신들의 전장 / chapter_3 요미의 심연
#   chapter_4 올림푸스의 시련 / chapter_5 라그나로크 / bg_gacha 소환 제단
CULT_BG = {
    'valhalla': 'bg_chapter_5',
    'chaos': 'bg_chapter_5',
    'takamagahara': 'bg_chapter_2',
    'asgard': 'bg_chapter_2',
    'olympus': 'bg_chapter_4',
    'yomi': 'bg_chapter_3',
    'helheim': 'bg_chapter_3',
    'tartarus': 'bg_chapter_3',
    'avalon': 'bg_chapter_1',
    'kunlun': 'bg_chapter_1',
    'nature': 'bg_chapter_1',
    'balance': 'bg_gacha',
    # 아직 비활성(enabled=false)이지만 켜지는 날 컷인이 바로 성립하도록 미리 채운다
    'heliopolis': 'bg_chapter_2',
    'svarga': 'bg_chapter_2',
    'tir_na_nog': 'bg_chapter_1',
}

# 분위기 → 등장 방식. 공격 계열은 터지고, 방어 계열은 솟고, 전략 계열은 미끄러진다.
MOOD_ENTER = {
    'brave': 'burst', 'fierce': 'burst', 'wild': 'burst',
    'calm': 'rise', 'stoic': 'rise', 'devoted': 'rise',
    'cunning': 'slide', 'noble': 'slide', 'mystic': 'slide',
}


def quote_for(hero):
    """전용 대사 — 각인 컷씬의 첫 캐릭터 대사. 없으면 첫 만남 컷씬으로 내려간다."""
    scene = evolve.get((hero['baseHeroId'], hero['cultId']))
    source = 'hero_evolve'
    if scene is None:
        scene = first.get(hero['baseHeroId'])
        source = 'first_hero'
    if scene is None:
        return None
    index = next((i for i, line in enumerate(scene['lines']) if line.get('speakerType') == 'hero'), 0)
    return {'sceneId': scene['id'], 'line': index, 'source': source}


cutins = []
for i, hero in enumerate(asc):
    cult = hero['cultId']
    cutins.append({
        'heroId': hero['id'],
        'cultId': cult,
        'rarity': hero['rarity'],
        'bg': CULT_BG[cult],
        'accent': cults[cult]['color'],
        'emblem': 'icon_cult_' + cult,
        'particles': hero['mood'],
        'fullbodyPose': 'right' if i % 2 == 0 else 'left',
        'enter': MOOD_ENTER[hero['mood']],
        'quote': quote_for(hero),
    })

doc = {
    '_meta': {
        'purpose': 'SSR/SR 소환 컷인 프리셋 (GachaResultOverlay 4단계)',
        'generatedBy': 'tools/art/gen-gacha-cutins.py',
        'sources': ['src/data/ascended-heroes.json', 'src/data/cults.json', 'src/data/story.json'],
        'rules': [
            '교단 → bg / emblem / accent',
            '분위기 → particles (MOOD_PARTICLE_COLORS 키) / enter',
            '항목에 값이 있으면 그 값이 기본 규칙을 이긴다',
            'bg_<cult> 전용 아트가 생기면 cultDefaults.bg 만 바꾸면 된다',
        ],
        'fallback': [
            'bg 텍스처가 없으면 교단색 방사 그라디언트로 내려간다',
            'emblem 텍스처가 없으면 벡터 룬 문장으로 내려간다 (balance/chaos/nature 는 아직 아트 없음)',
            '목록에 없는 영웅은 cultDefaults + moodDefaults 로 즉석 조립된다',
        ],
    },
    'cultDefaults': {
        # cults.json 의 15교단 전부(비활성 3종 포함)를 덮는다
        cult: {
            'bg': CULT_BG[cult],
            'accent': cults[cult]['color'],
            'emblem': 'icon_cult_' + cult,
        }
        for cult in sorted(CULT_BG)
    },
    'moodDefaults': {
        mood: {'particles': mood, 'enter': MOOD_ENTER[mood]}
        for mood in sorted(MOOD_ENTER)
    },
    'cutins': cutins,
}

out = ROOT + 'src/data/gacha-cutins.json'
io.open(out, 'w', encoding='utf-8', newline='\n').write(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
print('wrote', out, len(cutins), 'entries')
