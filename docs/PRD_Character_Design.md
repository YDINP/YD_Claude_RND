# PRD: Arcane Collectors 캐릭터 디자인 가이드

> **버전**: 2.0
> **최종 수정**: 2026-01-28
> **작성**: ULTRAWORK Mode

---

## 1. 개요

### 1.1 목적
Arcane Collectors 게임의 모든 캐릭터에 대한 통합 디자인 가이드라인을 정의합니다.
AI 이미지 생성을 위한 표준화된 프롬프트와 일관된 아트 스타일을 확립합니다.

### 1.2 아트 스타일 레퍼런스
**트릭컬 리바이브 (Trickle Revive)** 스타일을 기반으로 합니다.

| 특징 | 설명 |
|------|------|
| **등신 비율** | 2.5~3등신 SD (Super Deformed) |
| **볼따구** | 통통하고 꼬집고 싶은 귀여운 볼 |
| **눈** | 크고 반짝이는 하이라이트, 표정 풍부 |
| **표정** | 발칙하고 장난기 있는 표현 |
| **색감** | 파스텔 + 비비드, 밝고 화사한 색상 |
| **라인** | 동글동글한 부드러운 외형선 |
| **분위기** | 귀엽고 장난스러운 판타지 |

---

## 2. 캐릭터 분류 체계

### 2.1 등급 시스템
| 등급 | 성급 | 확률 | 디자인 복잡도 | 이펙트 |
|------|------|------|--------------|--------|
| **SSR** | 5성 | 1.5% | 최고 (상세 악세서리, 복잡한 의상) | 후광, 파티클, 오라 |
| **SR** | 4성 | 8.5% | 중간 (1-2가지 특징적 요소) | 속성 이펙트 |
| **R** | 3성 | 30% | 단순 (깔끔한 기본 디자인) | 최소 이펙트 |

### 2.2 속성 시스템
| 속성 | 주요 색상 | 보조 색상 | 이펙트 키워드 |
|------|----------|----------|--------------|
| **불 (Fire)** | #FF4500, #DC143C | #FFD700, #FF6347 | 불꽃, 화염, 스파크 |
| **물 (Water)** | #1E90FF, #4682B4 | #87CEEB, #00CED1 | 물방울, 파도, 버블 |
| **바람 (Wind)** | #32CD32, #00E676 | #98FB98, #7FFF00 | 바람, 잎사귀, 깃털 |
| **빛 (Light)** | #FFD700, #FFFFFF | #FFF8DC, #FFE4B5 | 후광, 빛줄기, 반짝임 |
| **암흑 (Dark)** | #4B0082, #2F4F4F | #8B00FF, #9370DB | 그림자, 연기, 혼령 |

### 2.3 클래스 시스템
| 클래스 | 무기/도구 | 포즈 특징 | 의상 특징 |
|--------|----------|----------|----------|
| **전사 (Warrior)** | 검, 방패, 창 | 역동적, 전투 준비 | 갑옷, 망토 |
| **마법사 (Mage)** | 지팡이, 마법서 | 마법 시전, 신비로운 | 로브, 모자 |
| **궁수 (Archer)** | 활, 화살 | 조준, 민첩함 | 경량 갑옷, 후드 |
| **힐러 (Healer)** | 지팡이, 성서 | 기도, 온화함 | 신관복, 리본 |

---

## 3. SSR 캐릭터 디자인 (5성)

### 3.1 아르카나 (Arcana)
**불 속성 / 마법사**

#### 기본 정보
- **이름**: 아르카나 (Arcana)
- **등급**: SSR (5성)
- **속성**: 불 (Fire)
- **역할**: 마법사 (DPS)
- **컨셉**: 자신감 넘치는 장난꾸러기 마녀

#### 외형 설명 (2.5등신)
- **체형**: 작고 귀여운 2.5등신, 통통한 볼
- **헤어스타일**: 보라빛 트윈테일, 끝부분이 불꽃처럼 솟아오름
- **눈**: 크고 반짝이는 황금빛 눈, 별 모양 동공
- **의상**:
  - 보라색 마녀 드레스 (푸피한 스타일)
  - 금색 리본 장식
  - 프릴 페티코트
  - 오버사이즈 마녀 모자 (불꽃 장식)
- **악세서리**:
  - 마법봉 (불꽃 크리스탈)
  - 화염 문양 초커
  - 달 모양 귀걸이

#### 성격 (트릭컬 스타일)
- **기본 성격**: 당당하고 자신감 넘치며, 장난치기를 좋아함
- **발칙한 면**: "내가 최고지~?" 하며 자랑하다 마법 실수
- **버릇/말투**: "으헤헤~", "태워버릴까?" 장난스러운 어투
- **귀여운 갭**: 실제로는 겁이 많아서 천둥 치면 숨음

#### 시그니처 포즈
한 손으로 작은 불꽃을 만들며 윙크, 다른 손은 허리에 올리고 자신만만하게 웃는 포즈

#### 컬러 팔레트
```
주색상:
- 퍼플: #8B5CF6
- 골드: #F59E0B
- 플레임 오렌지: #F97316

보조색:
- 화이트: #FFFFFF (프릴)
- 핑크: #EC4899 (블러시)
```

#### AI 이미지 생성 프롬프트

**Stable Diffusion (Pony/Animagine)**
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, arcana, cute fire witch,
long fluffy purple twintails with flame tips, big golden eyes with star pupils,
chubby cheeks, squishable cheeks, smug confident smile, one eye closed wink,
oversized cute witch hat with flame ornament,
puffy purple dress with gold ribbons, frilly petticoat,
holding sparkly magic wand with flame crystal,
floating fire spirits around her, magical sparkles, ember particles,
playful pose, tilted head, peace sign,
bright pastel colors, cel shading, soft lighting,
game character design, fantasy RPG, korean gacha game style,
white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy, bad hands,
text, error, extra digit, fewer digits, cropped, worst quality, low quality,
jpeg artifacts, signature, watermark, blurry, mutation, deformed,
ugly, extra limbs, mature, serious, grim, dark atmosphere,
thin face, sharp features, realistic proportions
```

**Midjourney**
```
A chibi fire witch Arcana with 2.5 head ratio, playful confident expression,
long fluffy purple twintails with flame tips, big sparkling golden eyes with star pupils,
chubby squishy cheeks, smug winking smile,
wearing oversized cute witch hat with flame ornament,
puffy purple dress with gold ribbons and frilly petticoat,
holding sparkly magic wand with flame crystal,
floating fire spirits and ember particles around her,
tilted head peace sign pose, bright pastel colors,
super deformed anime style, rounded lineart, cute and adorable,
game character design, white background --v 6 --ar 1:1 --style raw
```

**DALL-E 3**
```
Create an adorable chibi-style character named Arcana, a playful fire witch,
in a super deformed 2.5 head proportion style inspired by Trickle Revive and Korean gacha games.

She has long, fluffy purple twintails that curl upward at the tips like flames,
with big sparkling golden eyes that have tiny star-shaped pupils. Her chubby cheeks
are rosy and squeezable, with a smug, confident expression as she winks playfully.

She wears an oversized adorable witch hat decorated with a flame ornament,
a puffy purple dress with shimmering gold ribbons, and a frilly white petticoat underneath.
In her hand, she holds a cute magic wand topped with a flame-shaped crystal.

Small fire spirits and glowing ember particles float around her magically.
She's striking a playful pose with her head tilted, making a peace sign with one hand
while the other holds her wand.

The art style should be bright, colorful with high saturation pastels,
smooth rounded lineart, and an adorable yet confident aesthetic. Clean white background.
```

---

### 3.2 레온하르트 (Leonhardt)
**빛 속성 / 전사**

#### 기본 정보
- **이름**: 레온하르트 (Leonhardt)
- **등급**: SSR (5성)
- **속성**: 빛 (Light)
- **역할**: 전사 (탱커/서브 DPS)
- **컨셉**: 정의로우나 허당끼 있는 기사단장

#### 외형 설명 (2.5등신)
- **체형**: 탄탄하지만 귀여운 2.5등신
- **헤어스타일**: 단정한 금발 쇼트컷, 앞머리에 아호게
- **눈**: 크고 맑은 하늘색 눈, 반짝이는 정의감
- **의상**:
  - 화이트&골드 기사 갑옷 (치비 버전)
  - 빨간 미니 케이프
  - 십자가 문양 벨트
  - 금색 부츠
- **악세서리**:
  - 왕관형 헤어밴드
  - 성스러운 펜던트
  - 금색 건틀릿

#### 성격 (트릭컬 스타일)
- **기본 성격**: 정의롭고 진지하지만 어딘가 빠져있음
- **발칙한 면**: "정의는 이긴다!" 외치다가 발에 걸려 넘어짐
- **버릇/말투**: "...라고 말하긴 좀 쪽팔리지만!", 셀프 츳코미
- **귀여운 갭**: 엄청난 길치, 칭찬받으면 귀가 빨개짐

#### 시그니처 포즈
한 손에 검을 어깨에 메고, 다른 손으로 엄지척하며 씩씩하게 웃는 포즈

#### 컬러 팔레트
```
주색상:
- 화이트: #F8FAFC
- 골드: #EAB308
- 스카이 블루: #38BDF8

보조색:
- 레드: #DC2626 (케이프)
- 크림: #FEF3C7
```

#### AI 이미지 생성 프롬프트

**Stable Diffusion**
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1boy, leonhardt, cute holy knight,
fluffy short blonde hair with ahoge, big sparkling blue eyes,
chubby cheeks with slight blush, determined cute expression,
oversized shiny white armor with gold trim, tiny red cape,
holding glowing holy sword on shoulder, thumbs up pose,
sparkly light effects, holy aura, floating feathers,
heroic pose but adorably clumsy, puffed cheeks with effort,
bright pastel colors, cel shading, soft lighting,
game character design, fantasy RPG, korean gacha game style,
white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy, bad hands,
text, error, cropped, worst quality, low quality, blurry, mutation,
mature, serious, muscular, normal proportions
```

---

### 3.3 셀레네 (Selene)
**암흑 속성 / 궁수**

#### 기본 정보
- **이름**: 셀레네 (Selene)
- **등급**: SSR (5성)
- **속성**: 암흑 (Dark)
- **역할**: 궁수 (DPS)
- **컨셉**: 쿨해보이지만 실수투성이 그림자 암살자

#### 외형 설명 (2.5등신)
- **체형**: 날씬하고 가녀린 2.5등신
- **헤어스타일**: 긴 은색 생머리, 한쪽 눈을 살짝 가림
- **눈**: 쿨한 보라빛 눈, 달이 비치는 듯한 동공
- **의상**:
  - 검정 후디 (토끼 귀 달림 - 섀도우 버니)
  - 보라색 별 무늬 쇼츠
  - 사이하이 부츠
  - 그림자처럼 흩어지는 망토
- **악세서리**:
  - 달 문양 헤어핀
  - 은색 초커
  - 그림자 장갑

#### 성격 (트릭컬 스타일)
- **기본 성격**: 쿨하고 신비로워 보이지만 실은 덜렁이
- **발칙한 면**: "그림자에 숨었다가..." 하다가 발 걸려서 "어이쿠!"
- **버릇/말투**: "쉿~", "후후~", 쿨한 척하다 자기가 먼저 웃음
- **귀여운 갭**: 무서운 거 잘 못 봄, 귀여운 것에 약함

#### 시그니처 포즈
손가락을 입술에 대고 "쉿" 하는 포즈, 다른 손은 핑거건으로 조준

#### 컬러 팔레트
```
주색상:
- 실버: #C0C0C0
- 퍼플: #7C3AED
- 미드나잇 블루: #1E3A5A

보조색:
- 화이트: #FFFFFF (별)
- 골드: #FFD700 (달)
```

#### AI 이미지 생성 프롬프트

**Stable Diffusion**
```
Positive:
(masterpiece:1.2), (best quality:1.2), chibi, super deformed, 2.5 head ratio,
1girl, selene, cute shadow archer,
long flowing silver hair covering one eye, big purple eyes with moon reflection,
pale skin, chubby cheeks, cool mysterious smile, slight smirk,
black hoodie with bunny ears (shadow bunny theme),
purple shorts with star patterns, thigh-high boots,
holding cute dark bow with crescent moon design,
floating shadow spirits like cute ghosts, moonlight sparkles,
finger to lips pose, playful mysterious vibe,
bright colors despite dark theme, cel shading, soft lighting,
game character design, fantasy RPG, korean gacha game style,
white background

Negative:
realistic, photorealistic, 3d render, lowres, bad anatomy,
scary, horror, grim, dark atmosphere, thin face, mature
```

---

## 4. SR 캐릭터 디자인 (4성)

### 4.1 로제 (Rose)
**물 속성 / 힐러**

#### 기본 정보
- **이름**: 로제 (Rose)
- **등급**: SR (4성)
- **속성**: 물 (Water)
- **역할**: 힐러 (서포터)
- **컨셉**: 어리바리하지만 따뜻한 신관

#### 외형 설명
- **헤어스타일**: 부드러운 핑크 웨이브, 하프업
- **눈**: 크고 맑은 파란 눈
- **의상**: 화이트&블루 신관복, 물방울 리본
- **악세서리**: 물결무늬 헤어핀, 십자가 목걸이

#### 시그니처 포즈
두 손을 모아 치유의 물결을 만드는 포즈, 온화한 미소

#### 컬러 팔레트
```
핑크: #EC4899, 스카이 블루: #7DD3FC, 화이트: #FFFFFF
```

---

### 4.2 카이 (Kai)
**바람 속성 / 전사**

#### 기본 정보
- **이름**: 카이 (Kai)
- **등급**: SR (4성)
- **속성**: 바람 (Wind)
- **역할**: 전사 (DPS)
- **컨셉**: 자유분방한 바람의 검객

#### 외형 설명
- **헤어스타일**: 헝클어진 연두색 중단발, 잎사귀 붙어있음
- **눈**: 밝은 초록 눈, 자유로운 눈빛
- **의상**: 그린 하오리, 헐렁한 하카마
- **악세서리**: 잎사귀 귀걸이, 가죽 팔찌

#### 시그니처 포즈
검을 어깨에 걸치고 하품하며 브이하는 포즈

#### 컬러 팔레트
```
그린: #22C55E, 브라운: #92400E, 크림: #FEF3C7
```

---

### 4.3 루나 (Luna)
**불 속성 / 궁수**

#### 기본 정보
- **이름**: 루나 (Luna)
- **등급**: SR (4성)
- **속성**: 불 (Fire)
- **역할**: 궁수 (DPS)
- **컨셉**: 자신감 넘치는 불꽃 궁수

#### 외형 설명
- **헤어스타일**: 주황빛 포니테일, 불꽃처럼 퍼짐
- **눈**: 날카로운 금빛 눈
- **의상**: 블랙&레드 사냥복, 불꽃 망토
- **악세서리**: 달 모양 브로치, 가죽 암가드

#### 시그니처 포즈
활을 겨누며 한쪽 눈을 찡긋

#### 컬러 팔레트
```
레드: #EF4444, 오렌지: #F97316, 옐로우: #FACC15
```

---

### 4.4 누아르 (Noir)
**암흑 속성 / 마법사**

#### 기본 정보
- **이름**: 누아르 (Noir)
- **등급**: SR (4성)
- **속성**: 암흑 (Dark)
- **역할**: 마법사 (디버퍼)
- **컨셉**: 피곤한 다크 마법사 너드

#### 외형 설명
- **헤어스타일**: 헝클어진 짙은 남색 단발
- **눈**: 빨간 눈, 둥근 안경, 다크서클
- **의상**: 오버사이즈 검정 로브 (바닥에 끌림)
- **악세서리**: 두꺼운 마법서, 커피잔

#### 시그니처 포즈
피곤하게 서서 한숨 쉬며 커피 들고 있는 포즈

#### 컬러 팔레트
```
다크 블루: #1E3A8A, 퍼플: #7C3AED, 실버: #A1A1AA
```

---

### 4.5 아리아 (Aria)
**빛 속성 / 힐러**

#### 기본 정보
- **이름**: 아리아 (Aria)
- **등급**: SR (4성)
- **속성**: 빛 (Light)
- **역할**: 힐러 (서포터)
- **컨셉**: 순수한 천사 같은 수녀

#### 외형 설명
- **헤어스타일**: 긴 금발 트윈 브레이드, 흰 리본
- **눈**: 크고 빛나는 금빛 눈
- **의상**: 화이트&골드 수녀복, 작은 천사 날개
- **악세서리**: 빛나는 십자가 목걸이, 천사 날개 헤어핀

#### 시그니처 포즈
두 손을 모아 기도하는 포즈, 눈을 감고 미소

#### 컬러 팔레트
```
화이트: #FAFAFA, 골드: #FCD34D, 소프트 핑크: #FBCFE8
```

---

## 5. R 캐릭터 디자인 (3성)

### 5.1 핀 (Finn) - 물/전사
- **외형**: 파란 스파이키 헤어, 밝은 파란 눈, 블루 경량 갑옷
- **성격**: 열정적인 신참 전사
- **컬러**: #1E90FF, #87CEEB

### 5.2 미라 (Mira) - 바람/궁수
- **외형**: 연두색 숏컷, 밝은 초록 눈, 그린 궁수복
- **성격**: 밝고 활기찬 소녀
- **컬러**: #32CD32, #98FB98

### 5.3 테오 (Theo) - 불/마법사
- **외형**: 주황색 스파이키 헤어, 불타는 눈, 레드 로브
- **성격**: 불장난 좋아하는 장난꾸러기
- **컬러**: #FF4500, #FFD700

### 5.4 에바 (Eva) - 빛/힐러
- **외형**: 하얀 단발, 금빛 눈, 화이트 신관복
- **성격**: 순수하고 수줍은 견습 신관
- **컬러**: #FFFFFF, #FFD700

### 5.5 렉스 (Rex) - 암흑/전사
- **외형**: 다크 그레이 숏컷, 보라색 눈, 다크 갑옷
- **성격**: 쿨하고 과묵한 전사
- **컬러**: #2F4F4F, #8B00FF

### 5.6 아이비 (Ivy) - 물/마법사
- **외형**: 파란 긴 생머리, 차분한 청록 눈, 블루 로브
- **성격**: 조용하고 연구열심인 마법사
- **컬러**: #4682B4, #B0E0E6

### 5.7 맥스 (Max) - 바람/전사
- **외형**: 연두색 헝클 머리, 밝은 초록 눈, 그린 경량 갑옷
- **성격**: 자유분방하고 빠른 전사
- **컬러**: #7FFF00, #98FB98

---

## 6. 공통 프롬프트 템플릿

### 6.1 Stable Diffusion 공통 Positive
```
(masterpiece:1.2), (best quality:1.2),
chibi, cute, adorable, round face, chubby cheeks, squishable cheeks,
big sparkling eyes, expressive face, playful expression,
full body, dynamic pose, simple background, white background,
game character design, fantasy RPG, korean gacha game style,
pastel colors, cel shading, soft lighting, detailed clothing, cute accessories
```

### 6.2 Stable Diffusion 공통 Negative
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

### 6.3 권장 설정
| 항목 | 값 |
|------|-----|
| **모델** | Pony Diffusion V6 XL, AnimagineXL 3.1 |
| **해상도** | 1024x1024 또는 1024x1536 (세로) |
| **샘플러** | DPM++ 2M Karras |
| **Steps** | 28-35 |
| **CFG Scale** | 6-8 |

---

## 7. 추가 표정 바리에이션

각 캐릭터는 다음 표정 바리에이션이 필요합니다:

| 표정 | 설명 | 사용처 |
|------|------|--------|
| **idle** | 기본 대기 표정 | 메인 로비, 인벤토리 |
| **happy** | 활짝 웃는 표정 | 레벨업, 승리 |
| **excited** | 반짝반짝 흥분 | 가챠 획득, 보상 |
| **angry** | 삐침/뿌듯 (볼 부풀림) | 전투, 스킬 사용 |
| **sad** | 눈물글썽 | 패배 |
| **hurt** | 아야 표정 | 피격 |
| **skill** | 집중/시전 | 스킬 사용 |
| **victory** | 뿌듯 브이 | 전투 승리 |

---

## 8. Live2D/Spine 확장 가이드

### 8.1 파츠 분리 요구사항
```
- 머리 (회전, 기울기)
- 눈 (깜빡임, 눈동자 이동)
- 눈썹 (표정)
- 입 (립싱크, 표정)
- 볼 (부풀림, 빨개짐)
- 앞머리/뒷머리 (흔들림)
- 몸통 (호흡, 기울기)
- 팔 (좌/우 분리)
- 무기/악세서리 (별도 레이어)
```

### 8.2 기본 모션
| 모션 | 설명 |
|------|------|
| **Idle** | 호흡 + 머리카락 흔들림 |
| **Touch** | 놀람/반응 |
| **Skill** | 공격 모션 |
| **Victory** | 기쁨 표현 |
| **Damage** | 피격 반응 |

---

## 9. 참고 자료

### 레퍼런스
- [트릭컬 리바이브 나무위키](https://namu.wiki/w/%ED%8A%B8%EB%A6%AD%EC%BB%AC%20%EB%A6%AC%EB%B0%94%EC%9D%B4%EB%B8%8C)
- [Civitai - Chibi LoRA](https://civitai.com/models?tag=chibi)
- [Game UI Database](https://www.gameuidatabase.com/)

### 추천 플랫폼
| 플랫폼 | 치비 적합도 | 장점 |
|--------|------------|------|
| **Civitai Generate** | ★★★★★ | Pony 모델, LoRA 풍부 |
| **Tensor.art** | ★★★★☆ | 무료, 치비 LoRA |
| **ComfyUI (로컬)** | ★★★★★ | 완전 커스텀 |

---

**문서 버전**: 2.0
**최종 수정**: 2026-01-28
**작성자**: ULTRAWORK Mode
