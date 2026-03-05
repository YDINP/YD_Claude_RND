# ASSET_MAPPING_GUIDE.md

> **ArcaneCollectors** — 포트레이트 에셋 등록 규칙 가이드
>
> 신규 캐릭터를 추가하거나 실제 이미지 에셋을 교체할 때 **반드시** 이 문서를 따르세요.

---

## 1. 개요

`src/data/portrait-mapping.json` 파일은 **캐릭터 ID → 실제 이미지 파일명** 매핑 테이블입니다.

`HeroAssetLoader.loadImages()` 호출 시 이 파일을 참조해 이미지를 로드합니다.
**이 파일에 등록하지 않으면 이미지가 로드되지 않고, 캔버스 기반 플레이스홀더로 폴백 처리됩니다.**

---

## 2. 등록 형식

```json
{
  "<캐릭터_ID>": "<실제_파일명(확장자_제외)>"
}
```

**예시:**

```json
{
  "char_5":            "hero_039",
  "base_nova":         "hero_040",
  "asc_nova_olympus":  "hero_041"
}
```

실제 이미지 파일은 `public/assets/images/heroes/` 디렉터리에 `.png` 형식으로 위치해야 합니다.

---

## 3. 캐릭터 ID 네이밍 규칙

| 접두사 | 의미 | 예시 |
|--------|------|------|
| `char_N` | 임시 초기 캐릭터 (레거시, Phase A) | `char_1`, `char_4` |
| `base_<name>` | 기본 스킨 (미각성 상태) | `base_iris`, `base_nova` |
| `asc_<name>_<cult>` | 각성 스킨 (교단 각성 상태) | `asc_iris_olympus`, `asc_nova_valhalla` |

**규칙 요약:**
- `base_` 접두사: 해당 캐릭터의 기본(미각성) 포트레이트
- `asc_` 접두사: 특정 교단(cult)으로 각성한 포트레이트
- 교단명은 `gameConfig.js`의 교단 키와 동일해야 합니다 (`olympus`, `takamagahara`, `yomi`, `asgard`, `valhalla`, `tartarus`, `avalon`, `helheim`, `kunlun`)

---

## 4. 신규 캐릭터 추가 절차

신규 캐릭터 추가 시 **아래 4단계를 반드시 동시에 진행**하세요.

### Step 1. 이미지 파일 배치

```
public/assets/images/heroes/hero_NNN.png
```

- 파일명은 순번 형식(`hero_039`, `hero_040`, ...)을 유지하세요.
- 기본 해상도: `200×300` (SSR), `160×200` (SR), `120×150` (R), `80×80` (N)

### Step 2. portrait-mapping.json 등록

```json
// src/data/portrait-mapping.json
{
  "base_nova":        "hero_040",
  "asc_nova_olympus": "hero_041",
  "asc_nova_yomi":    "hero_042"
}
```

### Step 3. characters.json 등록

```json
// src/data/characters.json
{
  "id": "base_nova",
  "name": "노바",
  "rarity": 5,
  "cult": "olympus",
  "class": "mage",
  ...
}
```

### Step 4. 빌드 및 확인

```bash
npm run build
npm test
```

---

## 5. 폴백 동작 (이미지 미등록 시)

`portrait-mapping.json`에 캐릭터 ID가 없는 경우:

1. `HeroAssetLoader.loadImages()` → `fileName = hero.id` (ID를 파일명으로 직접 사용)
2. 이미지 로드 실패 → `loaderror` 이벤트 → `_createEnhancedPlaceholder()` 호출
3. 캔버스 기반 플레이스홀더 자동 생성 (교단 색상 + 클래스 심볼 + 이름 이니셜 표시)

> 플레이스홀더는 **정식 출시 전 임시 대체재**입니다. 반드시 실제 에셋으로 교체하세요.

---

## 6. 텍스처 키 규칙

`HeroAssetLoader.getTextureKey(heroData)` 반환값: `hero_<id>`

**예시:**

| 캐릭터 ID | 텍스처 키 |
|-----------|----------|
| `base_iris` | `hero_base_iris` |
| `asc_kai_yomi` | `hero_asc_kai_yomi` |
| `char_1` | `hero_char_1` |

텍스처 키는 `HeroCard`, `HeroListScene` 등 모든 UI 컴포넌트에서 이 방식으로 참조됩니다.
**직접 문자열 조합(`hero_${id}`)을 금지하고, 반드시 `getTextureKey()` 메서드를 경유하세요.**

---

## 7. 현재 등록 현황

총 **38개** 커버리지 (최종 업데이트: 2026-03)

| 유형 | 수량 |
|------|------|
| `char_N` (레거시) | 4개 (`char_1` ~ `char_4`) |
| `base_` (기본 스킨) | 10개 |
| `asc_` (각성 스킨) | 24개 |

파일 전체 내용: `src/data/portrait-mapping.json` 참조

---

## 8. 자주 묻는 질문

**Q. 이미지 파일만 추가했는데 왜 게임에서 안 보이나요?**
A. `portrait-mapping.json`에 등록하지 않으면 파일명을 찾을 수 없습니다. Step 2를 확인하세요.

**Q. 플레이스홀더가 표시됩니다. 왜인가요?**
A. 이미지 파일이 없거나, `portrait-mapping.json` 등록이 누락되었거나, 파일명이 불일치하는 경우입니다.

**Q. 각성 교단(cult)명이 없어요.**
A. `asc_` ID의 교단명은 `src/config/gameConfig.js`의 `CULT_COLORS` 키와 일치해야 합니다.
