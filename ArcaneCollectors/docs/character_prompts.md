# ArcaneCollectors 캐릭터 이미지 생성 프롬프트 가이드

> 91명 캐릭터 × 9종 분위기(Mood) × 9교단(Cult) 기반
> AI 이미지 생성 (Stable Diffusion / DALL-E / Midjourney) 용 프롬프트 표준

**최종 업데이트**: 2026-02-07
**캐릭터 총원**: 91명 (교단별 9~12명)

---

## 목차
1. [공통 스타일 가이드](#1-공통-스타일-가이드)
2. [분위기(Mood)별 비주얼 키워드](#2-분위기mood별-비주얼-키워드)
3. [교단별 배경/복장 키워드](#3-교단별-배경복장-키워드)
4. [등급별 프롬프트 품질](#4-등급별-프롬프트-품질)
5. [캐릭터별 프롬프트](#5-캐릭터별-프롬프트)

---

## 1. 공통 스타일 가이드

### 아트 스타일
- **융합 스타일**: 일본 애니메이션(Japanese anime) + 한국 웹툰(Korean webtoon) 하이브리드
- **참조**: Genshin Impact, Blue Archive, Arknights, 던전앤파이터
- **품질 키워드**: `masterpiece, best quality, high resolution, detailed, vibrant colors`

### 등신 비율
- **치비(Chibi)**: 2~3등신, SD 캐릭터용, 귀여운 과장된 표정
- **일러스트(Illustration)**: 7~8등신, 카드 일러스트용, 세밀한 디테일

### 배경 처리
- **교단 테마 배경**: 각 교단별 고유 환경 (신전, 신사, 전장 등)
- **투명 배경 옵션**: `transparent background, white background`
- **전투 배경**: `battlefield, magic circle, elemental effects`

### 공통 부가 키워드
```
anime style, game character, gacha style, mobile game art,
dynamic pose, character design, full body, detailed outfit,
sharp focus, professional illustration
```

---

## 2. 분위기(Mood)별 비주얼 키워드

9가지 분위기는 캐릭터의 성격과 전투 스타일을 시각적으로 표현합니다.

| 분위기 | 영문명 | 표정/포즈 키워드 | 이펙트 | 색조 | 추가 키워드 |
|--------|--------|-----------------|--------|------|------------|
| **열혈 (Brave)** | brave, heroic | 자신감 넘치는 미소, 주먹 쥐기, 당당한 자세, 엄지척 | 불꽃 파티클 (flame particles, fire sparks) | 따뜻한 레드-오렌지 (#FF4500, #FFD700) | energetic, passionate, determined |
| **격렬 (Fierce)** | fierce, furious | 이빨 드러내며 포효, 전투 자세, 날카로운 눈빛 | 폭발 이펙트 (explosion effect, shockwave) | 다크 오렌지-레드 (#D32F2F, #FF5722) | aggressive, intense, wild rage |
| **광폭 (Wild)** | wild, feral | 야성적 눈빛, 네발짐승 자세, 거친 움직임 | 번개 스파크 (lightning sparks, electric discharge) | 짙은 그린-옐로우 (#00E676, #FFD600) | untamed, primal, chaotic |
| **고요 (Calm)** | calm, serene | 눈 반감은 명상, 양손 모음, 평온한 미소 | 물결 아우라 (water ripple aura, gentle waves) | 차가운 블루 (#1E88E5, #B2EBF2) | peaceful, tranquil, meditative |
| **의연 (Stoic)** | stoic, stern | 무표정, 팔짱, 견고한 자세, 냉정한 시선 | 바위 파편 (rock fragments, stone armor) | 스틸 그레이 (#607D8B, #37474F) | unwavering, dignified, resolute |
| **헌신 (Devoted)** | devoted, caring | 양손 가슴에, 헌신적 미소, 부드러운 눈빛 | 하트 파티클 (heart particles, healing light) | 소프트 핑크-골드 (#FFE082, #FF6B9D) | compassionate, gentle, protective |
| **냉철 (Cunning)** | cunning, sly | 반쯤 웃는 입꼬리, 손가락 세움, 교활한 미소 | 빙결 크리스탈 (ice crystals, frozen shards) | 딥 퍼플-블루 (#7B1FA2, #311B92) | clever, calculating, mysterious |
| **고결 (Noble)** | noble, regal | 당당한 자세, 한손 들어올림, 위엄있는 표정 | 금빛 왕관 아우라 (golden crown aura, divine light) | 로열 골드-화이트 (#FFD700, #FFFFFF) | majestic, dignified, elegant |
| **신비 (Mystic)** | mystic, mystical | 신비로운 눈빛, 부유하는 자세, 마법적인 제스처 | 별빛 파티클 (starlight particles, cosmic dust) | 앰버-퍼플 (#FFB74D, #7C4DFF) | enigmatic, magical, ethereal |

---

## 3. 교단별 배경/복장 키워드

### 3.1 Olympus (올림푸스) - 12명
**테마**: 그리스 신화, 올림포스 12신
**배경**: `marble temple, white columns, greek architecture, golden sky, cloudy olympus`
**복장**: `greek toga, golden armor, laurel crown, white tunic, sandals, flowing robes`
**색상**: 화이트, 골드, 마블, 올리브 그린
**상징**: 번개(제우스), 삼지창(포세이돈), 올빼미(아테나)

### 3.2 Takamagahara (다카마가하라) - 11명
**테마**: 일본 신화, 천상계
**배경**: `shinto shrine, torii gate, cherry blossoms, japanese clouds, heavenly palace`
**복장**: `kimono, hakama, shrine maiden outfit (miko), obi sash, japanese armor (yoroi)`
**색상**: 화이트, 레드, 골드, 핑크(벚꽃)
**상징**: 태양(아마테라스), 달(츠쿠요미), 폭풍(스사노오)

### 3.3 Yomi (요미) - 12명
**테마**: 일본 지하세계, 황천국
**배경**: `underworld, dark forest, foggy atmosphere, haunted shrine, spirit flames`
**복장**: `dark kimono, tattered robes, oni mask, spiritual flames, yokai features`
**색상**: 다크 퍼플, 블랙, 암록색, 영혼의 파란 불꽃
**상징**: 오니 뿔, 히토다마(영혼의 불꽃), 텐구 가면

### 3.4 Asgard (아스가르드) - 9명
**테마**: 북유럽 신화, 신들의 궁전
**배경**: `golden palace, rainbow bridge (bifrost), shining halls, divine architecture`
**복장**: `shining armor, golden crown, rune-engraved clothing, divine robes`
**색상**: 골드, 실버, 로열 블루, 셀레스티얼 화이트
**상징**: 룬 문자, 무지개 다리, 왕관

### 3.5 Valhalla (발할라) - 11명
**테마**: 바이킹 전사, 전쟁의 전당
**배경**: `warrior hall, viking ship, snowy mountains, battlefield, northern lights`
**복장**: `viking armor, horned helmet, fur cloak, leather armor, chainmail`
**색상**: 아이언 그레이, 레드, 브라운, 아이스 블루
**상징**: 뿔 투구, 전투 도끼, 까마귀(오딘의 후긴&무닌)

### 3.6 Tartarus (타르타로스) - 9명
**테마**: 그리스 지옥, 티탄
**배경**: `dark abyss, chained prison, lava rivers, underworld maze, ancient ruins`
**복장**: `tattered armor, chains, cursed outfit, monstrous features, titan armor`
**색상**: 다크 레드, 블랙, 화산 오렌지, 스톤 그레이
**상징**: 쇠사슬, 낫(크로노스), 세 머리(케르베로스)

### 3.7 Avalon (아발론) - 9명
**테마**: 켈트 신화, 아서왕
**배경**: `misty lake, enchanted forest, ancient castle, fairy rings, magical fog`
**복장**: `knight armor, royal cape, celtic patterns, druid robes, excalibur sword`
**색상**: 에메랄드 그린, 실버, 로열 블루, 페어리 화이트
**상징**: 성검 엑스칼리버, 원탁, 까마귀(모리건)

### 3.8 Helheim (헬하임) - 9명
**테마**: 북유럽 지하세계
**배경**: `foggy sea, icy shore, dead trees, ghostly mist, frozen wasteland`
**복장**: `tattered viking armor, frost-covered clothes, broken chains, undead appearance`
**색상**: 스틸 그레이, 아이스 블루, 데드 화이트, 다크 블랙
**상징**: 끊어진 쇠사슬(펜리르), 세계수 뱀(요르문간드)

### 3.9 Kunlun (곤륜) - 9명
**테마**: 중국 신화, 곤륜산
**배경**: `mountain peaks, sea of clouds, chinese temple, bamboo forest, floating islands`
**복장**: `chinese robe (hanfu), martial arts gi, buddhist monk robes, golden armor`
**색상**: 골드, 주홍, 제이드 그린, 단풍 오렌지
**상징**: 여의봉(손오공), 연꽃(나타), 청룡언월도(관우)

---

## 4. 등급별 프롬프트 품질

| 등급 | 디테일 | 특수 효과 | 배경 | 프롬프트 길이 |
|------|--------|----------|------|-------------|
| **★5 (SSR)** | ultra detailed, intricate | 금빛 아우라, 화려한 파티클, 빛줄기 | 풀 배경 | 150+ 토큰 |
| **★4 (SR)** | detailed, high quality | 은빛 아우라, 약한 파티클 | 간단한 배경 | 100+ 토큰 |
| **★3 (R)** | standard quality | 컬러 아우라, 기본 이펙트 | 심플 배경 | 80+ 토큰 |
| **★2 (N+)** | simple, clean | 없음 또는 최소 | 그라데이션 | 50+ 토큰 |
| **★1 (N)** | minimal design | 없음 | 단색 또는 투명 | 30+ 토큰 |

---

## 5. 캐릭터별 프롬프트

### 5.1 Olympus (올림푸스) - 12명

**hero_001 - 아르카나 (Arcana) ★5 Mage / Mystic**
```
anime style, female witch, chibi 2.5 head, mystic mood, red twintails with flame tips,
golden eyes, witch robe with flame patterns, short cape, magic wand, creating flame,
mischievous smile, starlight particles, amber-purple aura, marble temple, greek columns,
#FF4500 #FFD700, ultra detailed, golden aura, masterpiece
```

**hero_006 - 루나 (Luna) ★4 Archer / Calm**
```
anime style, female archer, calm mood, black-crimson hunting outfit, flame pattern cape,
bow aimed, one eye winking, water ripple aura, marble temple, #DC143C #000000,
detailed, silver aura
```

**hero_011 - 테오 (Theo) ★3 Mage / Fierce**
```
anime style, male mage, fierce expression, red mage robe, flame patterns, magic wand,
playful grin, explosion effects, greek temple, #FF4500 #FFD700, standard quality
```

**hero_028 - 제우스 (Zeus) ★5 Mage / Brave**
```
anime style, male god, brave heroic, white-golden greek toga, lightning shoulder guards,
thunder belt, laurel crown, hand raised summoning lightning, flame particles,
marble temple, golden sky, #FFD700 #1E88E5, ultra detailed, golden aura, masterpiece
```

**hero_029 - 포세이돈 (Poseidon) ★5 Warrior / Fierce**
```
anime style, male god, fierce mood, cyan toga, seashell ornaments, coral belt,
trident striking ground creating waves, explosion effects, ocean waves, marble temple,
#1E88E5 #00E5FF, ultra detailed, water effects, masterpiece
```

**hero_030 - 하데스 (Hades) ★5 Mage / Mystic**
```
anime style, male god, mystic mood, black-purple robes, skull ornaments, jeweled cape,
hand releasing dark aura, cold pose, starlight particles, dark temple, purple mist,
#4A148C #212121, ultra detailed, dark magic effects, masterpiece
```

**hero_031 - 아테나 (Athena) ★5 Warrior / Noble**
```
anime style, female warrior goddess, noble regal, white-golden armor, owl pattern,
shield with olive branch, spear raised elegantly, golden crown aura, marble temple,
owl flying nearby, #FFD700 #C0C0C0, ultra detailed, golden aura, masterpiece
```

**hero_032 - 아레스 (Ares) ★4 Warrior / Fierce**
```
anime style, male warrior god, fierce aggressive, red-black heavy armor, horn guards,
battle scars cape, spear swinging with battle cry, explosion effects, battlefield,
#B71C1C #212121, silver aura, dynamic lighting
```

**hero_033 - 아폴론 (Apollo) ★4 Archer / Noble**
```
anime style, male god, noble mood, white-golden tunic, sun pattern, holding lyre,
elegant smile, golden crown aura, sunlight rays, marble temple, musical notes,
#FFD700 #FF8F00, silver aura, glowing effects
```

**hero_080 - 헤르메스 (Hermes) ★3 Archer / Cunning**
```
anime style, male messenger god, cunning sly, light toga, golden winged sandals,
short cape, one leg raised flying pose, sly smirk, ice crystals, clouds,
#FF6B35 #FFF3E0, colored aura, wind effects
```

**hero_081 - 님프 (Nymph) ★2 Healer / Devoted**
```
anime style, female fairy, devoted caring, dress of flower petals and leaves, barefoot,
hands releasing healing light, graceful pose, heart particles, forest, greek garden,
#A5D6A7 #81C784, simple design
```

**hero_082 - 호플리테스 (Hoplite) ★1 Warrior / Brave**
```
anime style, male soldier, brave mood, bronze helmet and armor, red cape, sandals,
shield forward spear aimed, minimal design, #FF6B35 #795548, white background
```

---

### 5.2 Takamagahara (다카마가하라) - 11명

**hero_002 - 레온하르트 (Leonhardt) ★5 Warrior / Brave**
```
anime style, male knight, brave heroic, white-golden armor, cross cape, sword on shoulder,
thumbs up pose, flame particles, energetic smile, shinto shrine, torii gate, cherry blossoms,
#FFD700 #FFFFFF, ultra detailed, golden aura, masterpiece
```

**hero_008 - 아리아 (Aria) ★4 Healer / Devoted**
```
anime style, female nun, devoted caring, white nun outfit, golden cross, hands in prayer,
bright smile, heart particles, healing light, shrine background, stone lanterns,
#FFFFFF #FFD700, silver aura, soft lighting
```

**hero_012 - 에바 (Eva) ★3 Healer / Devoted**
```
anime style, female priest, devoted mood, white priest robes, simple cross,
hands in prayer, serene expression, soft light, shrine, #FFFFFF #FFD700, standard quality
```

**hero_022 - 아마테라스 (Amaterasu) ★5 Mage / Noble**
```
anime style, female sun goddess, noble regal, white-golden elegant kimono, sun patterns on obi,
glowing cape, sacred mirror in hand, sunlight spreading, divine pose, golden crown aura,
shinto shrine, torii gate, clouds, #FFD700 #FFFFFF, ultra detailed, golden aura, masterpiece
```

**hero_023 - 스사노오 (Susanoo) ★5 Warrior / Wild**
```
anime style, male storm god, wild feral, black battle outfit, purple armor, storm patterns,
tattered cape, Kusanagi sword swinging creating storm, lightning sparks, fierce eyes,
stormy background, dark clouds, rain, #7C4DFF #212121, ultra detailed, storm effects, masterpiece
```

**hero_024 - 츠쿠요미 (Tsukuyomi) ★5 Archer / Mystic**
```
anime style, male moon god, mystic mystical, silver-purple elegant kimono, moon-star patterns,
quiet night cape, bow weapon, standing under moonlight, mysterious pose, starlight particles,
night sky, full moon, shrine silhouette, #C0C0C0 #311B92, ultra detailed, moonlight effects, masterpiece
```

**hero_025 - 이나리 (Inari) ★4 Healer / Devoted**
```
anime style, female fox deity, devoted caring, white-red shrine maiden outfit, torii pattern,
fox tail spread, fox ears, bell in hand, playful smile, foxfire surrounding, heart particles,
shrine background, red torii gates, #FF6B9D #FFFFFF, silver aura, fox fire effects
```

**hero_026 - 라이진 (Raijin) ★4 Mage / Fierce**
```
anime style, male thunder god, fierce aggressive, traditional outfit with lightning patterns,
drums circling behind, electric sash, drumsticks, beating drums summoning lightning,
explosion effects, electricity sparking, storm clouds, #FFD600 #FF5722, silver aura, thunder effects
```

**hero_027 - 후진 (Fujin) ★4 Archer / Wild**
```
anime style, male wind god, wild feral, traditional outfit with wind patterns, wind bag on back,
green fluttering sash, bow weapon, opening wind bag creating typhoon, lightning sparks, whirlwind,
sky background, swirling clouds, #00E676 #B2FF59, silver aura, wind effects
```

**hero_078 - 무녀 (Miko) ★2 Healer / Devoted**
```
anime style, female shrine maiden, devoted mood, white hakama red chihaya, tabi geta,
shaking bell, purification ritual pose, soft healing light, shrine, #FFFFFF #F44336, simple design
```

**hero_079 - 하니와 (Haniwa) ★1 Warrior / Stoic**
```
anime style, clay figurine warrior, stoic mood, simple ancient armor pattern, sword forward,
rigid pose, minimal design, #D7CCC8 #8D6E63, white background
```

---

### 5.3 Yomi (요미) - 12명

**hero_003 - 셀레네 (Selene) ★5 Archer / Cunning**
```
anime style, female assassin, cunning sly, dark purple assassin outfit, shadow cape,
emerging from shadows, finger to lips shh gesture, sly smirk, ice crystals, frozen shards,
dark forest, eerie glow, foggy atmosphere, #2E0854 #8B00FF, ultra detailed, golden aura, masterpiece
```

**hero_007 - 누아르 (Noir) ★4 Mage / Noble**
```
anime style, male dark mage, noble regal, black mage robe, forbidden symbols cape,
creating darkness with hand, eerie smile, golden crown aura, haunted shrine, spirit flames,
#000000 #8B00FF, silver aura, dark magic effects
```

**hero_013 - 렉스 (Rex) ★3 Warrior / Stoic**
```
anime style, male warrior, stoic stern, dark gray armor, purple patterns, sword on shoulder,
cool standing pose, rock fragments, stone aura, dark forest, foggy, #2F4F4F #8B00FF, standard quality
```

**hero_034 - 이자나미 (Izanami) ★5 Mage / Mystic**
```
anime style, female goddess, mystic mystical, black-pale purple kimono, yomi patterns on obi,
torn appearance effect, hand calling death, mysterious sad pose, starlight particles, cosmic dust,
dark underworld, ghostly mist, spirit flames, #4A148C #E8EAF6, ultra detailed, golden aura, masterpiece
```

**hero_035 - 엠마 (Emma) ★5 Warrior / Calm**
```
anime style, male judge god, calm serene, red-golden official robe, judgment pattern, black belt,
holding mirror of karma, judging coldly, dignified pose, water ripple aura, gentle waves,
judgment hall, dark throne room, #B71C1C #FFD700, ultra detailed, golden aura, masterpiece
```

**hero_036 - 오니 (Oni) ★4 Warrior / Fierce**
```
anime style, male demon warrior, fierce aggressive, beast skin armor, horn guards, torn pants,
iron club, swinging club with laugh, wild savage pose, explosion effects, shockwave, roaring,
dark cave, lava glow, #D32F2F #7B1FA2, silver aura, fire effects
```

**hero_037 - 텐구 (Tengu) ★4 Archer / Cunning**
```
anime style, male bird yokai, cunning sly, red-black haori, wing ornaments, long nose mask,
fan weapon, opening fan spreading wings, cunning smile, ice crystals, twisted trees, dark forest,
#D32F2F #000000, silver aura, wind effects
```

**hero_038 - 유키온나 (Yuki-onna) ★4 Mage / Stoic**
```
anime style, female ice spirit, stoic stern, white kimono, frost-snowflake patterns,
translucent sleeves, cold aura, hand making snow fall, quiet sad pose, rock fragments, ice crystals,
snowy forest, blizzard, #E3F2FD #90CAF9, silver aura, ice effects
```

**hero_039 - 주온 (Joon) ★4 Healer / Cunning**
```
anime style, male onmyoji sage, cunning sly, purple-green onmyoji outfit, ofuda ornaments,
yin-yang pattern robe, holding talisman chanting spell, cunning smile, ice crystals, mystical glow,
shrine at night, spirit flames, #4A148C #00E676, silver aura, spell effects
```

**hero_089 - 갓파 (Kappa) ★3 Warrior / Calm**
```
anime style, male water yokai, calm serene, short wave pattern kimono, barefoot, turtle shell,
protecting water dish on head, holding cucumber, water ripple aura, peaceful expression,
river, lily pads, #4FC3F7 #66BB6A, colored aura
```

**hero_090 - 히토다마 (Hitodama) ★2 Mage / Mystic**
```
anime style, ghost spirit, mystic mood, translucent form, pale white kimono shape,
floating controlling flames, starlight particles, ethereal glow, dark forest,
#E1F5FE #40C4FF, simple design
```

**hero_091 - 코다마 (Kodama) ★1 Healer / Devoted**
```
anime style, tree spirit, devoted mood, small tree texture body, leaf skirt,
tottering walk, head tilted cutely, minimal design, #E8F5E9 #4CAF50, white background
```

---

### 5.4~5.9 교단별 캐릭터 (91명 전체)

나머지 교단별 캐릭터는 동일한 형식으로 작성됩니다:
- **Asgard (9명)**: hero_004, 009, 014, 083-088
- **Valhalla (11명)**: hero_005, 010, 015-021, 076-077
- **Tartarus (9명)**: hero_040-048
- **Avalon (9명)**: hero_049-057
- **Helheim (9명)**: hero_058-066
- **Kunlun (9명)**: hero_067-075

각 캐릭터는 characters.json의 `design` 필드를 기반으로 프롬프트가 생성되며,
**분위기(mood) 이펙트** + **교단(cult) 배경** + **등급(rarity) 품질**을 조합합니다.

---

## 부록 A: Negative Prompt 권장

모든 프롬프트에 추가할 네거티브 프롬프트:

```
low quality, worst quality, blurry, out of focus, bad anatomy, bad hands,
missing fingers, extra fingers, bad proportions, distorted face, ugly, deformed,
watermark, signature, text, logo, username, jpeg artifacts, pixelated,
duplicate, cropped, cut off, realistic, photorealistic, 3d render
```

---

## 부록 B: 프롬프트 생성 워크플로우

### Step 1: 기본 정보 수집
- 캐릭터 ID, 이름, 등급, 교단, 분위기, 직업
- Design 필드: style, hairColor, eyeColor, primaryColor, outfit, signaturePose

### Step 2: 프롬프트 구성
```
[아트 스타일] + [캐릭터 타입] + [디자인 스타일] + [분위기 키워드] +
[헤어/눈] + [복장] + [포즈] + [분위기 이펙트] + [교단 배경] + [색상] + [등급 효과]
```

### Step 3: 품질 최적화
- ★5: 150+ 토큰, ultra detailed, 풀 배경
- ★4: 100+ 토큰, detailed, 간단한 배경
- ★3: 80+ 토큰, standard quality
- ★2: 50+ 토큰, simple
- ★1: 30+ 토큰, minimal

---

## 부록 C: 추천 AI 도구

### AI 이미지 생성 도구
- **Stable Diffusion**: 완전한 커스터마이징
- **DALL-E 3**: 자연어 프롬프트 우수
- **Midjourney**: 아트 스타일 품질 높음
- **NovelAI**: 애니메이션 스타일 특화

### Stable Diffusion 모델 추천
- **Anything V5**: 애니메이션 범용
- **AbyssOrangeMix**: 고품질 애니메이션
- **Counterfeit V3**: 웹툰 스타일
- **Genshin Impact Models**: 게임 스타일 특화

### LoRA 추천
- Korean Webtoon Style LoRA
- Chibi Character LoRA
- Game Character Card LoRA
- Elemental Effects LoRA

---

**라이센스**: ArcaneCollectors 프로젝트 내부용
**작성**: Claude Code
**버전**: 2.0.0 (2026-02-07)

---

**End of Document**
