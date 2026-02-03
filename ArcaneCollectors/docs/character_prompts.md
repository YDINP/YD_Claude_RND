# ArcaneCollectors 캐릭터 이미지 생성 가이드

## 아트 스타일 레퍼런스: 트릭컬 리바이브

> **"볼따구 게임"** - 통통한 볼, 치비 등신, 귀엽고 발칙한 표정이 특징

### 트릭컬 스타일 핵심 요소
| 요소 | 설명 |
|------|------|
| **볼따구 (Squeezy Cheeks)** | 통통하고 꼬집고 싶은 귀여운 볼 |
| **치비 등신** | 3-4등신의 귀여운 체형 |
| **큰 눈** | 반짝이는 하이라이트, 표정 풍부 |
| **발칙한 표정** | 장난기, 익살, 삐침, 뿌듯함 등 |
| **파스텔+비비드** | 밝고 화사한 색감 |
| **판타지 의상** | 마녀, 기사, 요정 등 귀여운 판타지 복장 |

---

## 공통 설정

### 권장 모델
- **1순위**: Pony Diffusion V6 XL (치비 스타일에 강함)
- **2순위**: AnimagineXL 3.1 + Chibi LoRA
- **3순위**: Kohaku XL Delta (귀여운 스타일)
- **대안**: WAI-ANI-NSFW-PONYXL (SFW 설정으로 사용)

### 공통 프롬프트 (Positive)
```
masterpiece, best quality, highly detailed,
chibi, cute, adorable, round face, chubby cheeks, squishable cheeks,
big sparkling eyes, expressive face, playful expression,
full body, dynamic pose, simple background, white background,
game character design, fantasy RPG, korean gacha game style,
pastel colors, cel shading, soft lighting,
detailed clothing, cute accessories
```

### 공통 네거티브 프롬프트
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
- **해상도**: 1024x1024 또는 1024x1536 (세로)
- **샘플러**: DPM++ 2M Karras 또는 Euler a
- **Steps**: 28-35
- **CFG Scale**: 6-8

---

## 캐릭터별 프롬프트

### SSR 등급 (5성)

#### 1. 아르카나 (Arcana) - 불/마법사
```
Positive:
1girl, arcana, chibi, cute fire witch,
long fluffy purple twintails, big golden eyes with star pupils,
chubby cheeks, smug confident smile, one eye closed wink,
oversized cute witch hat with flame ornament,
puffy purple dress with gold ribbons, frilly petticoat,
holding sparkly magic wand with flame crystal,
floating fire spirits around her, magical sparkles,
playful pose, tilted head, peace sign

Expression keywords:
smug, confident, mischievous, "I'm the best~" attitude

Color palette:
purple (#8B5CF6), gold (#F59E0B), flame orange (#F97316)
```

#### 2. 레온하트 (Leonhart) - 빛/전사
```
Positive:
1boy, leonhart, chibi, cute holy knight,
fluffy short blonde hair with ahoge, big sparkling blue eyes,
chubby cheeks with slight blush, determined cute expression,
oversized shiny white armor with gold trim, tiny red cape,
holding glowing holy sword (too big for him), struggling a bit,
sparkly light effects, holy aura with angel wings silhouette,
heroic pose but adorably clumsy, puffed cheeks with effort

Expression keywords:
determined, trying hard, earnest, "I'll protect everyone!" energy

Color palette:
white (#F8FAFC), gold (#EAB308), sky blue (#38BDF8)
```

#### 3. 셀레네 (Selene) - 암흑/궁수
```
Positive:
1girl, selene, chibi, cute shadow archer,
long flowing silver hair, big purple eyes with moon reflection,
pale skin, chubby cheeks, cool mysterious smile, slight smirk,
black hoodie with bunny ears (shadow bunny theme),
purple shorts with star patterns, thigh-high boots,
holding cute dark bow with crescent moon design,
floating shadow spirits like cute ghosts, moonlight sparkles,
cool pose with finger guns, playful mysterious vibe

Expression keywords:
cool, mysterious but playful, "I'm watching you~" vibe, gap moe

Color palette:
silver (#C0C0C0), purple (#7C3AED), midnight blue (#1E3A5A)
```

---

### SR 등급 (4성)

#### 4. 로즈 (Rose) - 물/힐러
```
Positive:
1girl, rose, chibi, cute water healer,
long wavy pink hair with flower accessories, big soft blue eyes,
rosy chubby cheeks, gentle warm smile, caring expression,
frilly white and blue dress like a fairy tale princess,
water lily hairpin, pearl necklace,
holding cute healing staff with water droplet crystal,
floating water bubbles with sparkles, gentle glow,
gentle pose, hands clasped, head tilted sweetly

Expression keywords:
gentle, caring, sweet, "Let me heal you~" nurturing vibe

Color palette:
pink (#EC4899), sky blue (#7DD3FC), white (#FFFFFF)
```

#### 5. 카이 (Kai) - 바람/전사
```
Positive:
1boy, kai, chibi, cute wind swordsman,
messy black hair in small ponytail with leaves stuck in it,
big sharp green eyes, chubby cheeks, relaxed lazy smile,
cute simplified eastern outfit, loose haori jacket,
oversized hakama pants (tripping hazard), wooden sandals,
holding katana casually over shoulder, yawning,
wind swirls with cute leaf spirits, floating leaves,
relaxed slouching pose, peace sign

Expression keywords:
lazy, carefree, "whatever~" attitude, secretly skilled

Color palette:
green (#22C55E), brown (#92400E), cream (#FEF3C7)
```

#### 6. 루나 (Luna) - 불/궁수
```
Positive:
1girl, luna, chibi, cute fire archer,
short spiky red hair with flame-shaped ahoge, big amber eyes,
chubby cheeks with bandaid, confident wide grin, fangs showing,
tomboy outfit - shorts and crop top with flame patterns,
fingerless gloves, sporty boots,
holding cute bow with flame design, fire arrows in heart quiver,
ember particles, excited sparkles,
energetic jumping pose, fist pump, "Let's go!" energy

Expression keywords:
energetic, confident, competitive, "I'll hit the bullseye!" spirit

Color palette:
red (#EF4444), orange (#F97316), yellow (#FACC15)
```

#### 7. 느와르 (Noir) - 암흑/마법사
```
Positive:
1boy, noir, chibi, cute dark mage nerd,
messy dark blue hair, big red eyes behind round glasses,
chubby cheeks, tired dark circles, unamused deadpan face,
oversized black academic robe dragging on floor,
holding thick ancient book bigger than himself,
floating dark magic runes, purple magic circles,
tired standing pose, holding coffee cup, sighing

Expression keywords:
tired, deadpan, "I didn't sign up for this", secretly powerful

Color palette:
dark blue (#1E3A8A), purple (#7C3AED), silver (#A1A1AA)
```

#### 8. 아리아 (Aria) - 빛/힐러
```
Positive:
1girl, aria, chibi, cute holy priestess,
long blonde hair with twin braids and ribbon, big golden eyes,
chubby cheeks with sparkles, pure innocent smile, halo effect,
fluffy white and gold priest dress with angel wing accessories,
tiny angel wings on back, holy symbol hairpin,
holding cute staff with star crystal, praying pose,
holy light sparkles, floating feathers,
pure angelic pose, hands together, eyes closed smiling

Expression keywords:
pure, innocent, angelic, "May blessings be upon you~"

Color palette:
white (#FAFAFA), gold (#FCD34D), soft pink (#FBCFE8)
```

---

### R 등급 (3성)

#### 9. 톰 (Tom) - 불/전사
```
Positive:
1boy, tom, chibi, cute blacksmith boy,
short messy brown hair with soot, big brown eyes,
chubby dirty cheeks with smudges, proud wide grin,
simple work clothes with leather apron, rolled up sleeves,
holding oversized hammer (wobbling), forge flames behind,
sweat drops, sparkly proud aura,
strong pose but struggling with weight, flexing tiny arm

Expression keywords:
hardworking, proud, "I made this myself!" energy

Color palette:
brown (#92400E), orange (#EA580C), gray (#6B7280)
```

#### 10. 에밀리 (Emily) - 물/마법사
```
Positive:
1girl, emily, chibi, cute water mage student,
light blue twintails with water drop hair ties, big bright blue eyes,
chubby cheeks, excited sparkling expression, open mouth smile,
blue and white school uniform style with wizard elements,
tiny witch hat tilted, school bag with star charms,
holding beginner wand with bubbles, water splashing everywhere,
excited bouncing pose, raising hand like answering question

Expression keywords:
eager, excited, "Pick me pick me!" student energy

Color palette:
light blue (#7DD3FC), white (#FFFFFF), navy (#1E40AF)
```

#### 11. 잭 (Jack) - 바람/궁수
```
Positive:
1boy, jack, chibi, cute forest hunter boy,
messy green hair with leaves and twigs, forest green eyes,
chubby freckled cheeks, focused squinting expression,
green hooded cloak (hood has cat ears), simple leather outfit,
holding small wooden bow, arrow in mouth while aiming,
wind swirl, floating forest sprites like tiny fairies,
crouching hunting pose, sneaky tiptoeing

Expression keywords:
focused, sneaky, "Target acquired..." hunter mode

Color palette:
forest green (#166534), brown (#78350F), cream (#FEF9C3)
```

#### 12. 미아 (Mia) - 빛/힐러
```
Positive:
1girl, mia, chibi, cute apprentice priestess,
short fluffy pink hair with big white ribbon, innocent blue eyes,
very chubby blushing cheeks, shy nervous smile, fidgeting,
simple white trainee robe too big for her, long sleeves covering hands,
holding small healing orb carefully, afraid to drop it,
gentle sparkles, tiny light particles,
shy standing pose, knees together, looking down shyly

Expression keywords:
shy, nervous, "D-did I do it right...?" uncertain but trying

Color palette:
pink (#F9A8D4), white (#FFFFFF), soft yellow (#FEF08A)
```

#### 13. 리코 (Rico) - 암흑/전사
```
Positive:
1boy, rico, chibi, cute dark warrior punk,
spiky dark hair with red streak, sharp red eyes,
chubby cheeks with bandages and tiny scar, confident smirk,
punk style dark leather jacket with studs, ripped jeans,
holding jagged dark sword with skull keychain,
shadow wisps like cute bats, purple aura,
cool leaning pose, thumbs up, "I'm bad but cute" vibe

Expression keywords:
edgy but cute, "I'm totally dangerous... (but actually nice)"

Color palette:
black (#1F2937), red (#DC2626), purple (#9333EA)
```

#### 14. 하나 (Hana) - 불/마법사
```
Positive:
1girl, hana, chibi, cute shrine maiden,
long straight black hair with red ribbon, gentle red eyes,
chubby pale cheeks with natural blush, serene small smile,
red and white miko outfit simplified cute version,
fox ear headband, tiny fox tail accessory,
holding paper talismans, floating fire spirit foxes,
cherry blossom petals, magical atmosphere,
graceful standing pose, hands in sleeves, peaceful expression

Expression keywords:
serene, graceful, "May the spirits guide you~" peaceful energy

Color palette:
red (#DC2626), white (#FAFAFA), pink (#FBB6CE)
```

#### 15. 오스카 (Oscar) - 물/전사
```
Positive:
1boy, oscar, chibi, cute pirate captain,
messy brown hair with tiny pirate hat, bright blue eyes,
tanned chubby cheeks, big confident laugh expression,
oversized navy captain coat with gold buttons, striped shirt,
tiny anchor tattoo sticker on cheek, pirate boots,
holding trident (like a flag), standing on treasure chest,
water splashes, seagull companion, ship wheel background,
confident captain pose, hand on hip, pointing forward

Expression keywords:
adventurous, confident, "Set sail for adventure!" captain energy

Color palette:
navy blue (#1E3A8A), gold (#EAB308), teal (#14B8A6)
```

---

## Spine/Live2D 확장 준비 가이드

### 치비 스타일 파츠 분리 고려사항

#### 1. 포즈 가이드라인
```
- 정면 또는 살짝 3/4 뷰 (완전 측면 X)
- 팔이 몸에서 떨어져 있을 것
- 다리가 겹치지 않을 것
- 머리카락 레이어 구분 명확
- 액세서리는 별도 레이어로 분리 가능하게
```

#### 2. 치비 특화 움직임
| 부위 | 트릭컬 스타일 모션 |
|------|-------------------|
| **볼** | 꼬집히는 모션, 부풀어오름, 빨개짐 |
| **눈** | 반짝반짝, >, <, 하트눈, 별눈 |
| **입** | 삐죽, 웃음, 놀람 O, 꺄아 |
| **머리** | 까딱까딱, 흔들흔들 |
| **몸** | 통통 튀기, 점프, 넘어짐 |

#### 3. 필요한 표정 바리에이션
```
- idle: 기본 표정 (특색있는 기본 표정)
- happy: 활짝 웃음 (눈 감고 웃기)
- excited: 반짝반짝 눈
- angry: 뿌듯/삐침 (볼 부풀림)
- sad: 눈물글썽 (귀여운 슬픔)
- hurt: 아야! (통증 표현)
- skill: 집중/시전 (눈 빛남)
- victory: 뿌듯 브이
```

---

## 생성 플랫폼 추천

### 치비/트릭컬 스타일에 최적화된 플랫폼

| 플랫폼 | 치비 적합도 | 장점 | 단점 |
|--------|------------|------|------|
| **Civitai Generate** | ★★★★★ | Pony 모델 사용 가능, LoRA 풍부 | 대기 시간 |
| **Tensor.art** | ★★★★☆ | 무료, 치비 LoRA 많음 | 품질 변동 |
| **NovelAI** | ★★★☆☆ | 안정적 품질 | 치비 특화 약함 |
| **로컬 ComfyUI** | ★★★★★ | 완전 커스텀 가능 | 설정 복잡 |

### 추천 LoRA/체크포인트 (Civitai)
```
- "Chibi Style" LoRA
- "Trickcal Style" LoRA (있다면)
- "Cute Gacha Game" LoRA
- "Squishable Cheeks" LoRA
- Pony Diffusion V6 XL (기본 모델)
```

---

## 작업 체크리스트

### Phase 1: SSR 캐릭터 (3명)
- [ ] 아르카나 - 불/마법사
- [ ] 레온하트 - 빛/전사
- [ ] 셀레네 - 암흑/궁수

### Phase 2: SR 캐릭터 (5명)
- [ ] 로즈 - 물/힐러
- [ ] 카이 - 바람/전사
- [ ] 루나 - 불/궁수
- [ ] 느와르 - 암흑/마법사
- [ ] 아리아 - 빛/힐러

### Phase 3: R 캐릭터 (7명)
- [ ] 톰 - 불/전사
- [ ] 에밀리 - 물/마법사
- [ ] 잭 - 바람/궁수
- [ ] 미아 - 빛/힐러
- [ ] 리코 - 암흑/전사
- [ ] 하나 - 불/마법사
- [ ] 오스카 - 물/전사

### Phase 4: 후처리
- [ ] 배경 제거 (remove.bg)
- [ ] 크기 조정 (게임용 512x512 또는 256x256)
- [ ] assets/characters/ 폴더에 저장
- [ ] 게임 내 테스트

---

## 참고 자료

### 트릭컬 리바이브 스타일 레퍼런스
- [트릭컬 리바이브 나무위키](https://namu.wiki/w/%ED%8A%B8%EB%A6%AD%EC%BB%AC%20%EB%A6%AC%EB%B0%94%EC%9D%B4%EB%B8%8C)
- [Trickcal: Chibi Go 공식](https://trickcal.biligames.com/)
- [PixAI Trickcal LoRA](https://pixai.art/en/model/1843639975329425060)

### AI 이미지 생성
- [Civitai Generate](https://civitai.com/generate)
- [Tensor.art](https://tensor.art)
- [PixAI](https://pixai.art)
