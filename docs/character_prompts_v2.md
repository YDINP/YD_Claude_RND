# Arcane Collectors - 캐릭터 이미지 생성 프롬프트 v3.0

> **버전**: 3.0
> **스타일**: 트릭컬 리바이브 (Trickle Revive) SD 치비
> **시스템**: 성격(Personality) + 교단(Cult) 기반
> **최종 수정**: 2026-01-29

---

## 시스템 변경 사항 (v2.0 → v3.0)

| 구분 | v2.0 (구) | v3.0 (신) |
|------|----------|----------|
| 주 속성 | 5원소 (불/물/바람/빛/암흑) | 5성격 (용감/교활/침착/야성/신비) |
| 부 속성 | 없음 | 5교단 (올림푸스/타카마가하라/요미/아스가르드/발할라) |
| 시너지 | 원소 상성 | 성격 상성 + 교단 보너스 |

### 성격 시스템 (Personality)
| 성격 | 영문 | 강함 | 약함 | 컬러 |
|------|------|------|------|------|
| 용감 | brave | 교활 | 침착 | #E74C3C |
| 교활 | cunning | 침착 | 야성 | #9B59B6 |
| 침착 | calm | 야성 | 용감 | #3498DB |
| 야성 | wild | 용감 | 교활 | #27AE60 |
| 신비 | mystic | 전체 +10% | - | #F39C12 |

### 교단 시스템 (Cult)

> **확장 가능**: 현재 5개 교단 운영 중. 추후 신규 신화권(이집트, 중국, 인도, 켈트 등) 교단 추가 예정

| 교단 | 신화 | 테마 | 시너지 보너스 | 컬러 |
|------|------|------|--------------|------|
| 올림푸스 | 그리스 | 위엄/영광/정복 | ATK +15% | #FF6B35 |
| 타카마가하라 | 일본 천상 | 질서/신성/축복 | SPD +10%, CRIT +5% | #FFD700 |
| 요미 | 일본 저승 | 죽음/저주/망령 | CRIT DMG +20% | #8E44AD |
| 아스가르드 | 북유럽 | 전투/수호/지혜 | HP +10%, DEF +10% | #5DADE2 |
| 발할라 | 북유럽 전사 | 영웅/명예/전사 | ATK +10%, DEF +5% | #4A90D9 |

#### 추가 예정 교단 (TBD)
| 교단 | 신화 | 테마 (예상) | 시너지 보너스 (예상) |
|------|------|------------|---------------------|
| 헬리오폴리스 | 이집트 | 태양/부활/왕권 | TBD |
| 곤륜 | 중국 | 선계/조화/불멸 | TBD |
| 스와르가 | 인도 | 윤회/해탈/업보 | TBD |
| 티르 나 노그 | 켈트 | 요정/자연/영원 | TBD |

---

## 공통 설정

### 권장 모델 (우선순위 순)
1. **Pony Diffusion V6 XL** - 치비 스타일 최적화
2. **AnimagineXL 3.1** + Chibi LoRA
3. **WAI-ANI-NSFW-PONYXL** (SFW 설정)
4. **Kohaku XL Delta** - 귀여운 스타일

### 공통 Positive 프롬프트
```
(masterpiece:1.2), (best quality:1.2),
chibi, cute, adorable, round face, chubby cheeks, squishable cheeks,
big sparkling eyes, expressive face, playful expression,
full body, dynamic pose, simple background, white background,
game character design, fantasy RPG, korean gacha game style,
pastel colors, cel shading, soft lighting,
detailed clothing, cute accessories
```

### 공통 Negative 프롬프트
```
realistic, photorealistic, 3d render,
lowres, bad anatomy, bad hands, text, error,
extra digit, fewer digits, cropped, worst quality, low quality,
jpeg artifacts, signature, watermark, username,
blurry, mutation, deformed, ugly, extra limbs,
malformed limbs, long neck, bad proportions,
mature, serious, grim, dark atmosphere,
thin face, sharp features, realistic proportions
```

### 이미지 설정
| 설정 | 값 |
|------|-----|
| 해상도 | 1024x1024 (정방형) |
| 샘플러 | DPM++ 2M Karras |
| Steps | 28-35 |
| CFG Scale | 6-8 |
| Seed | 랜덤 (-1) |

---

## SSR 캐릭터 (5성) - 3명

---

### 1. 아르카나 (Arcana)
**신비(mystic) / 올림푸스(Olympus) / 마법사 / SSR**

#### 캐릭터 요약
```
- 컨셉: 올림푸스의 신비로운 불꽃 마녀, 장난꾸러기
- 외형: 보라색 트윈테일, 황금 눈, 마녀 모자, 그리스풍 로브
- 성격: 신비로움 + 당당함, 장난기, "으헤헤~"
- 교단: 올림푸스 (제우스의 불꽃을 다루는 마녀)
- 이펙트: 올림푸스 천둥불꽃, 금빛 파티클, 그리스 문양
```

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, arcana, cute olympus fire witch, mystic personality,
long fluffy purple twintails with flame-like tips, big golden eyes with star pupils,
chubby cheeks, squishable cheeks, smug confident smile, one eye closed wink,
oversized cute witch hat with greek laurel wreath and gold ribbon,
puffy purple dress with greek meander pattern and gold trim,
white toga-style sash, frilly white petticoat,
golden sandals with wing decorations,
holding sparkly magic wand with olympus flame crystal top,
floating small fire spirits with greek halo, magical sparkles, golden lightning,
olympus temple silhouette in magic effects,
playful pose, tilted head, peace sign with one hand,
bright pastel purple orange and gold colors, cel shading, divine warm lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy, bad hands,
text, error, extra digit, fewer digits, cropped, worst quality, low quality,
jpeg artifacts, signature, watermark, blurry, mutation, deformed,
ugly, extra limbs, mature, serious, grim, dark atmosphere,
thin face, sharp features, realistic proportions, scary, horror
```

#### Midjourney 프롬프트
```
A chibi olympus fire witch Arcana with 2.5 head ratio, super deformed style,
mystic personality vibes, long fluffy purple twintails with flame tips,
big sparkling golden eyes with star pupils, chubby squishy cheeks,
smug confident winking smile, greek mythology inspired outfit,
oversized witch hat with laurel wreath, purple dress with meander pattern,
holding magic wand with olympus flame, floating fire spirits with greek halos,
golden lightning sparkles, olympus temple motifs in effects,
tilted head peace sign pose, bright pastel purple orange gold colors,
super deformed anime style, rounded smooth lineart, cute and divine,
game character design, clean white background
--v 6 --ar 1:1 --style raw --s 250
```

#### DALL-E 3 프롬프트
```
Create an adorable chibi-style character named Arcana, a playful olympus fire witch
with a mystic personality, in super deformed 2.5 head proportion style
inspired by Trickle Revive and Korean gacha games.

APPEARANCE:
- Long, fluffy purple twintails that curl upward at the tips like divine flames
- Big sparkling golden eyes with tiny star-shaped pupils
- Chubby, rosy, squeezable cheeks
- Smug, confident expression with one eye winking

OUTFIT (Greek Mythology Theme - Olympus Cult):
- Oversized adorable witch hat decorated with golden laurel wreath
- Puffy purple dress with Greek meander (key) pattern and gold trim
- White toga-style sash draped elegantly
- Golden winged sandals

ACCESSORIES & EFFECTS:
- Cute magic wand topped with Olympus divine flame crystal
- Small fire spirits with Greek-style golden halos floating around
- Golden lightning sparkles and olympian divine particles
- Subtle Greek temple silhouettes in magical effects

POSE:
- Playful stance with head tilted
- Making a peace sign with one hand
- Other hand holding the magic wand

STYLE:
- Bright, colorful with high saturation pastels (purple, orange, gold)
- Greek mythology aesthetic merged with cute chibi style
- Divine warm lighting
- Clean white background
```

---

### 2. 레온하르트 (Leonhardt)
**용감(brave) / 타카마가하라(Takamagahara) / 전사 / SSR**

#### 캐릭터 요약
```
- 컨셉: 타카마가하라의 빛의 성기사, 정의로운 허당
- 외형: 금발 쇼트컷, 하늘색 눈, 일본 신화풍 갑옷
- 성격: 용감함 + 정의감, 셀프 츳코미, 길치
- 교단: 타카마가하라 (아마테라스의 축복을 받은 전사)
- 이펙트: 신성한 빛, 태양 광휘, 일본 신화 문양
```

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1boy, leonhardt, cute takamagahara holy knight prince, brave personality,
fluffy short blonde hair with cute ahoge cowlick, big sparkling sky blue eyes,
chubby cheeks with slight blush, determined but adorable expression, confident smile,
white and gold samurai-style holy armor with sun emblem, tiny red cape flowing,
gold crown-like headband with rising sun motif, golden gauntlets with cloud patterns,
holy pendant with magatama design glowing softly,
holding glowing golden katana-style holy sword resting on shoulder,
giving thumbs up with other hand,
sparkly divine sunlight effects, floating sakura petals, golden sun aura,
torii gate silhouette in light effects, japanese holy symbols,
heroic pose but adorably earnest, slight head tilt,
bright white gold and red colors, cel shading, divine warm lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy, bad hands,
text, error, cropped, worst quality, low quality, blurry, mutation,
mature, serious face, muscular, normal proportions, grim, dark
```

#### Midjourney 프롬프트
```
A chibi takamagahara holy knight Leonhardt with 2.5 head ratio, super deformed style,
brave personality, fluffy short blonde hair with cute ahoge,
big sparkling sky blue eyes, chubby blushing cheeks, confident earnest smile,
white gold samurai-style armor with sun emblem, tiny red cape,
crown headband with rising sun, golden gauntlets with cloud patterns,
magatama pendant, holding golden katana holy sword on shoulder,
thumbs up pose, divine sunlight effects, floating sakura petals,
torii gate silhouettes, japanese holy aesthetic, golden sun aura,
bright white gold red colors, super deformed anime style,
rounded lineart, cute noble divine, game character design,
clean white background
--v 6 --ar 1:1 --style raw --s 250
```

#### DALL-E 3 프롬프트
```
Create an adorable chibi-style character named Leonhardt, a holy knight prince
from Takamagahara with a brave personality, in super deformed 2.5 head proportion style
inspired by Trickle Revive and Korean gacha games.

APPEARANCE:
- Fluffy short blonde hair with a cute ahoge (cowlick) sticking up
- Big sparkling sky blue eyes full of determination
- Chubby cheeks with a slight blush
- Confident, earnest smile

OUTFIT (Japanese Mythology Theme - Takamagahara Cult):
- White and gold samurai-inspired holy armor with rising sun emblem on chest
- Small flowing red cape attached at shoulders
- Golden crown-like headband with sun motif
- Golden gauntlets with cloud patterns
- Magatama-shaped holy pendant with soft glow

ACCESSORIES & EFFECTS:
- Golden katana-style holy sword resting on his shoulder
- Divine sunlight particles and rays
- Floating sakura petals
- Soft golden sun aura
- Torii gate silhouettes appearing in light effects

POSE:
- Standing heroically but with adorable earnestness
- Sword on shoulder with one hand
- Giving thumbs up with other hand
- Slight confident head tilt

STYLE:
- Bright colors: white, gold, sky blue with red accent
- Japanese Shinto mythology aesthetic
- Noble yet cute divine warrior aesthetic
- Clean white background
```

---

### 3. 셀레네 (Selene)
**교활(cunning) / 요미(Yomi) / 궁수 / SSR**

#### 캐릭터 요약
```
- 컨셉: 요미의 그림자 암살자, 쿨해보이지만 덜렁이
- 외형: 은색 긴 생머리, 보라색 눈, 일본 저승풍 복장
- 성격: 교활함 + 쿨한 척, "쉿~", 실수투성이
- 교단: 요미 (이자나미의 저승 세계 출신)
- 이펙트: 그림자, 초생달, 원혼(귀여운), 일본 저승 문양
```

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, selene, cute yomi shadow archer assassin, cunning personality,
long flowing silver hair partially covering one eye, big purple eyes with crescent moon,
pale skin, chubby cheeks, cool mysterious smile, slight playful smirk,
black kimono-style hoodie with cute ghost patterns (yomi theme), hood down,
purple hakama shorts with silver hitodama (soul fire) patterns, black tabi boots,
silver choker with magatama, crescent moon kanzashi hairpin,
holding cute dark bow with yomi underworld design and soul flames,
floating cute hitodama ghost spirits around her, moonlight sparkles, purple mist,
yomi gate silhouette in shadows, japanese underworld motifs,
finger to lips shushing pose, playful mysterious wink,
dark purple silver and black colors but still cute aesthetic, cel shading, moonlight,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy, bad hands,
text, error, cropped, worst quality, low quality, blurry, mutation,
scary, horror, grim, dark atmosphere, mature, thin face
```

#### Midjourney 프롬프트
```
A chibi yomi shadow archer Selene with 2.5 head ratio, super deformed style,
cunning personality, long flowing silver hair covering one eye,
big purple eyes with crescent moon reflection, pale skin chubby cheeks,
cool mysterious playful smirk, black kimono-style hoodie with ghost patterns,
purple hakama shorts with hitodama soul patterns, tabi boots,
magatama choker, crescent moon kanzashi, holding dark bow with yomi design,
floating cute hitodama ghosts, moonlight sparkles, purple mist,
yomi underworld gate silhouettes, finger to lips shushing wink,
purple silver black colors cute aesthetic, super deformed anime style,
rounded lineart, cute mysterious, game character design, clean white background
--v 6 --ar 1:1 --style raw --s 250
```

#### DALL-E 3 프롬프트
```
Create an adorable chibi-style character named Selene, a shadow archer from Yomi
with a cunning personality, in super deformed 2.5 head proportion style
inspired by Trickle Revive and Korean gacha games.

APPEARANCE:
- Long, flowing silver hair that partially covers one eye mysteriously
- Big purple eyes with a subtle crescent moon reflection in the pupils
- Pale skin with chubby, cute cheeks
- Cool mysterious expression with a playful smirk

OUTFIT (Japanese Underworld Theme - Yomi Cult):
- Black kimono-style hoodie with adorable ghost (yurei) patterns, hood down
- Purple hakama-style shorts decorated with hitodama (soul fire) patterns
- Black tabi boots
- Silver choker with magatama charm
- Crescent moon kanzashi (hairpin) in her hair

ACCESSORIES & EFFECTS:
- Cute dark bow with Yomi underworld crescent moon design
- Small floating hitodama (cute soul flames) that look adorable
- Moonlight sparkles and soft purple mist
- Subtle Yomi gate silhouettes in shadow effects

POSE:
- Finger pressed to lips in a "shush" gesture
- Playful wink with one eye
- Mysterious but cute stance

STYLE:
- Purple, silver, and black colors but maintaining bright cute aesthetic
- Japanese underworld mythology aesthetic (cute not scary)
- Mysterious yet adorable vibe
- Clean white background
```

---

## SR 캐릭터 (4성) - 5명

---

### 4. 로제 (Rose)
**침착(calm) / 아스가르드(Asgard) / 힐러 / SR**

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, rose, cute asgard water healer priestess, calm personality,
long wavy pink hair in half-up style with ice crystal accessories, big soft blue eyes,
rosy chubby cheeks, gentle warm smile, caring serene expression,
frilly white and ice blue dress with norse rune patterns, fur trim cape,
yggdrasil branch hairpin, rune pendant necklace, white gloves with snowflake embroidery,
holding cute healing staff with ice crystal and water droplet top,
floating ice crystals with sparkles, gentle blue aurora glow, snowflake particles,
asgard rainbow bridge subtle effect, norse protection runes,
hands clasped prayer pose, head tilted sweetly, kind peaceful expression,
soft pink ice blue and white colors, cel shading, gentle aurora lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
worst quality, low quality, mature, serious
```

**시스템 정보**: 침착(calm) → 야성에 강함, 용감에 약함 | 아스가르드 → HP+10%, DEF+10%
**컬러 팔레트**: 핑크 #EC4899, 아이스 블루 #5DADE2, 화이트 #FFFFFF

---

### 5. 카이 (Kai)
**야성(wild) / 발할라(Valhalla) / 전사 / SR**

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1boy, kai, cute valhalla wind swordsman, wild personality,
messy green hair in small ponytail with raven feathers stuck in it, big bright green eyes,
chubby cheeks, relaxed wild grin, carefree yawning expression,
viking-style loose tunic with valhalla emblem, fur-lined vest,
oversized baggy pants with celtic knot patterns, leather boots with wing decorations,
thor hammer pendant, rune bracelet, valkyrie feather earring,
holding viking sword casually over shoulder,
wind swirls with cute raven spirits, floating feathers, valhalla mead hall glow,
einherjar warrior spirit silhouettes, norse wind runes,
relaxed slouching pose, peace sign, yawning freely,
bright green brown and gold colors, cel shading, natural windy lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
worst quality, low quality, mature, serious, heavy armor
```

**시스템 정보**: 야성(wild) → 용감에 강함, 교활에 약함 | 발할라 → ATK+10%, DEF+5%
**컬러 팔레트**: 그린 #4A90D9, 브라운 #92400E, 골드 #FCD34D

---

### 6. 루나 (Luna)
**교활(cunning) / 올림푸스(Olympus) / 궁수 / SR**

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, luna, cute olympus fire archer huntress, cunning personality,
short spiky orange-red hair with flame-shaped ahoge, big sharp amber golden eyes,
chubby cheeks with small bandaid, confident wide grin showing small fang,
greek huntress outfit with toga style, one shoulder bare, flame pattern trim,
golden arm bands with laurel design, sporty sandals with wing decorations,
artemis moon brooch on chest, olive branch crown,
holding cute bow with greek fire design, fire arrows in quiver shaped like amphora,
ember particles floating, excited fire sparkles, olympus flame aura,
greek temple pillars in flame effects, artemis moon symbols,
energetic jumping pose, fist pump, confident wink,
bright red orange and gold colors, cel shading, warm divine lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
worst quality, low quality, mature, calm expression
```

**시스템 정보**: 교활(cunning) → 침착에 강함, 야성에 약함 | 올림푸스 → ATK+15%
**컬러 팔레트**: 레드 #EF4444, 오렌지 #FF6B35, 골드 #FFD700

---

### 7. 누아르 (Noir)
**신비(mystic) / 요미(Yomi) / 마법사 / SR**

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1boy, noir, cute yomi dark mage scholar, mystic personality,
messy dark blue hair with white streaks like spirit wisps, big tired purple eyes,
dark circles under eyes, chubby cheeks, unamused deadpan exhausted expression,
black onmyoji-style academic robe with yomi ghost patterns, too long sleeves,
paper talismans hanging from belt, geta sandals,
holding thick ancient japanese grimoire bigger than himself,
holding matcha in other hand (tired scholar vibes),
floating onmyodo magic circles, hitodama soul flames, purple yomi mist,
izanami gate silhouettes, japanese underworld kanji runes,
tired standing pose, slouching, sighing expression,
dark blue purple and ghostly white colors, cel shading, eerie purple lighting,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
worst quality, low quality, energetic, happy, scary evil horror
```

**시스템 정보**: 신비(mystic) → 전체 +10% 데미지 | 요미 → CRIT DMG+20%
**컬러 팔레트**: 다크 블루 #1E3A8A, 퍼플 #8E44AD, 고스트 화이트 #F8F8FF

---

### 8. 아리아 (Aria)
**용감(brave) / 타카마가하라(Takamagahara) / 힐러 / SR**

#### Stable Diffusion 프롬프트
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, aria, cute takamagahara holy priestess miko, brave personality,
long blonde hair with twin braids and white ribbon, big sparkling golden eyes,
chubby cheeks with sparkle marks, pure innocent angelic smile, halo effect above head,
fluffy white and gold miko outfit with modern cute twist, hakama pants,
tiny decorative angel wings mixed with japanese elements, sakura hairpin,
holding cute kagura bell staff with sun crystal, hands together praying pose,
holy sunlight sparkles everywhere, floating sakura petals, golden divine glow,
torii gate silhouettes, amaterasu sun symbols, shimenawa decorations,
pure angelic pose, eyes closed peaceful smile, serene expression,
bright white gold and soft pink colors, cel shading, holy warm sunlight,
game character design, fantasy RPG, korean gacha game style,
clean white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
worst quality, low quality, mature, dark, sad expression
```

**시스템 정보**: 용감(brave) → 교활에 강함, 침착에 약함 | 타카마가하라 → SPD+10%, CRIT+5%
**컬러 팔레트**: 화이트 #FAFAFA, 골드 #FFD700, 사쿠라 핑크 #FFB7C5

---

## R 캐릭터 (3성) - 7명

---

### 9. 핀 (Finn)
**용감(brave) / 아스가르드(Asgard) / 전사 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1boy, finn, cute asgard water warrior rookie, brave personality,
short spiky blue hair, big bright blue eyes, chubby cheeks,
proud determined grin, viking-style light blue armor with ice patterns,
fur collar, water drop rune earring, small round shield with asgard emblem,
holding sword raised up, ice crystal and water splash effects,
aurora borealis particles, yggdrasil branch motifs,
fighting spirit pose, blue ice colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 용감(brave) | 아스가르드 → HP+10%, DEF+10%

---

### 10. 미라 (Mira)
**야성(wild) / 발할라(Valhalla) / 궁수 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1girl, mira, cute valhalla wind archer girl, wild personality,
short fluffy green hair with braids, bright green eyes, chubby freckled cheeks,
cheerful excited wild smile, viking huntress outfit with fur trim,
valkyrie feather hairpin, rune armband,
holding small bow with valhalla wind design, wind swirls, floating raven feathers,
einherjar spirit wisps, valhalla mead hall glow,
energetic pose, green colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 야성(wild) | 발할라 → ATK+10%, DEF+5%

---

### 11. 테오 (Theo)
**야성(wild) / 올림푸스(Olympus) / 마법사 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1boy, theo, cute olympus fire mage apprentice, wild personality,
messy orange spiky hair like flames, bright orange eyes, chubby cheeks,
mischievous excited wild grin, greek style red mage robe with gold trim,
laurel wreath tilted on head, zeus lightning bolt pendant,
holding magic wand with olympus flame, small fireballs floating,
greek pillar silhouettes, divine fire sparkles,
playful pose, red orange gold colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 야성(wild) | 올림푸스 → ATK+15%

---

### 12. 에바 (Eva)
**침착(calm) / 타카마가하라(Takamagahara) / 힐러 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1girl, eva, cute takamagahara light healer trainee miko, calm personality,
short fluffy white hair with big white ribbon, innocent golden eyes,
very chubby blushing cheeks, shy nervous calm smile,
white trainee miko robe with gold trim, simplified hakama,
small sakura kanzashi hairpin, magatama necklace,
holding small healing orb with sun glow carefully, gentle divine sparkles,
torii gate silhouette, floating sakura petals,
shy standing pose, white gold pink colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 침착(calm) | 타카마가하라 → SPD+10%, CRIT+5%

---

### 13. 렉스 (Rex)
**교활(cunning) / 요미(Yomi) / 전사 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1boy, rex, cute yomi dark warrior, cunning personality,
short dark gray hair, sharp purple eyes, chubby cheeks,
cool confident cunning smirk, dark gray oni-style armor with purple accents,
yomi gate symbol on chest, hitodama earring,
holding dark katana on shoulder, shadow wisps, purple soul flames,
izanami gate silhouettes, japanese underworld aesthetic,
cool leaning pose, dark purple colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature, scary
```
**시스템 정보**: 교활(cunning) | 요미 → CRIT DMG+20%

---

### 14. 아이비 (Ivy)
**침착(calm) / 아스가르드(Asgard) / 마법사 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1girl, ivy, cute asgard water mage researcher, calm personality,
long straight blue hair with ice crystals, calm teal eyes, chubby cheeks,
serene gentle calm smile, blue nordic mage robe with fur collar,
yggdrasil pendant, rune book holster,
holding blue staff with ice crystal top, water bubbles and ice floating,
aurora borealis particles, norse rune circles,
calm standing pose, blue ice colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 침착(calm) | 아스가르드 → HP+10%, DEF+10%

---

### 15. 맥스 (Max)
**야성(wild) / 발할라(Valhalla) / 전사 / R**

```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, 2.5 head ratio,
1boy, max, cute valhalla wind warrior speedster, wild personality,
messy bright green hair flowing in wind, energetic green eyes, chubby cheeks,
excited wide wild grin, light viking armor with wind runes,
valkyrie feather scarf flowing, raven companion on shoulder,
holding sword running pose, wind swirls with feathers around,
einherjar spirit trails, valhalla glory effects,
dynamic running pose, green colors, game character, white background

Negative:
realistic, 3d, lowres, bad anatomy, worst quality, mature
```
**시스템 정보**: 야성(wild) | 발할라 → ATK+10%, DEF+5%

---

## 캐릭터 시스템 매핑 요약

| 캐릭터 | 등급 | 성격 | 교단 | 클래스 |
|--------|------|------|------|--------|
| 아르카나 | SSR | 신비(mystic) | 올림푸스 | 마법사 |
| 레온하르트 | SSR | 용감(brave) | 타카마가하라 | 전사 |
| 셀레네 | SSR | 교활(cunning) | 요미 | 궁수 |
| 로제 | SR | 침착(calm) | 아스가르드 | 힐러 |
| 카이 | SR | 야성(wild) | 발할라 | 전사 |
| 루나 | SR | 교활(cunning) | 올림푸스 | 궁수 |
| 누아르 | SR | 신비(mystic) | 요미 | 마법사 |
| 아리아 | SR | 용감(brave) | 타카마가하라 | 힐러 |
| 핀 | R | 용감(brave) | 아스가르드 | 전사 |
| 미라 | R | 야성(wild) | 발할라 | 궁수 |
| 테오 | R | 야성(wild) | 올림푸스 | 마법사 |
| 에바 | R | 침착(calm) | 타카마가하라 | 힐러 |
| 렉스 | R | 교활(cunning) | 요미 | 전사 |
| 아이비 | R | 침착(calm) | 아스가르드 | 마법사 |
| 맥스 | R | 야성(wild) | 발할라 | 전사 |

---

## 표정 바리에이션 프롬프트 수정자

기본 프롬프트에 아래 수정자를 추가하여 표정 변경:

### Idle (기본)
```
default expression, relaxed pose
```

### Happy (기쁨)
```
eyes closed happy, wide bright smile, sparkle effects, celebrating
```

### Excited (흥분)
```
sparkling eyes, open mouth excited, star pupils, bouncing pose
```

### Angry (화남/삐침)
```
puffed cheeks pouting, furrowed brows, crossed arms, >_< expression
```

### Sad (슬픔)
```
teary eyes, watery eyes, sad frown, looking down, single tear
```

### Skill (스킬 시전)
```
concentrated expression, glowing eyes, magic aura intense, action pose,
[교단별 이펙트 강화] cult-specific effects intensified
```

### Victory (승리)
```
triumphant smile, peace sign, winking, sparkling background, confetti,
[교단 심볼] cult symbol celebration effects
```

---

## 교단별 이펙트 가이드

프롬프트에 추가할 교단 특화 이펙트:

### 올림푸스 (Olympus)
```
greek temple pillars, laurel wreaths, golden lightning, olympic flame,
meander patterns, divine thunder sparks, zeus eagle silhouette
```

### 타카마가하라 (Takamagahara)
```
torii gate silhouettes, sakura petals, divine sunlight rays, magatama,
shimenawa sacred ropes, amaterasu sun disk, kagura bells
```

### 요미 (Yomi)
```
yomi underworld gate, hitodama soul flames, crescent moon, onmyodo circles,
izanami symbols, japanese ghost patterns, purple death mist
```

### 아스가르드 (Asgard)
```
yggdrasil branches, aurora borealis, ice crystals, nordic runes,
bifrost rainbow bridge glow, mjolnir silhouette, frost patterns
```

### 발할라 (Valhalla)
```
valhalla mead hall glow, einherjar spirits, raven companions, valkyrie feathers,
wind runes, warrior spirit trails, odin's eye symbol
```

---

## 이미지 생성 플랫폼 가이드

### Civitai Generate (추천)
1. https://civitai.com/generate 접속
2. 모델: Pony Diffusion V6 XL 선택
3. 프롬프트 복사 붙여넣기
4. 설정: 1024x1024, DPM++ 2M Karras, 30 steps, CFG 7
5. Generate 클릭

### Tensor.art (무료 대안)
1. https://tensor.art 접속
2. Anime/Chibi 모델 선택
3. 프롬프트 입력
4. 생성 후 다운로드

### 로컬 ComfyUI
1. ComfyUI 설치
2. Pony Diffusion V6 XL 다운로드
3. 워크플로우 구성
4. 프롬프트 입력 후 생성

---

## 후처리 가이드

### 배경 제거
```bash
# rembg 사용 (Python)
pip install rembg
rembg i input.png output.png

# 또는 remove.bg 웹사이트 사용
```

### 크기 조정
```bash
# ImageMagick 사용
magick input.png -resize 512x512 output.png
```

### 파일명 규칙
```
{캐릭터영문명}_{표정}.png

예시:
arcana_idle.png
arcana_happy.png
arcana_skill.png
leonhardt_idle.png
```

---

**문서 버전**: 3.0
**시스템**: 성격(Personality) + 교단(Cult) 기반
**최종 수정**: 2026-01-29
**작성자**: ULTRAWORK Mode
