# Factorio 초반 오프닝 최적 순서 조사 (빨간 과학팩까지)

조사일: 2026-09-18
버전 참고: 아래 레시피/설비 수치는 Factorio 1.1과 2.0(Nauvis 기준)에서 공통으로 알려진 값이다.
버전 간 차이가 명시적으로 확인된 항목은 따로 표기했고, 확인 못 한 항목은 "미확인"이라고 적었다.

---

## 0. 요약 — 우리 상황과의 격차

| 항목 | 우리 에이전트 무리 | 숙련자 기준 |
|---|---|---|
| 버너 채굴기 | 161대 | 이론상 이 정도 규모는 **전기 시대 이후**에나 정당화됨. 버너 시대엔 자원별로 4~20대 수준이 흔한 권장치 |
| 돌화로 | 73대 | 버너 시대 권장치는 철 대상 10~20대 수준 |
| 연구 진척 | 3개 (automation-science-pack 포함) | automation 기술 자체는 **빨간 과학팩 10개**만 있으면 완료됨 (HIGH) |
| 빨간 과학 생산량 | 0 | 숙련자는 조립기 1~2대 + 랩 2~4대로 자동 생산 개시 |
| 재고 | 돌 18,000 / 철광석 1,700 / 석탄 100 | 돌은 소모처(화로·레일)가 적어 쌓이는 게 정상이지만, 18,000은 "돌 채굴기를 과도하게 지었다"는 신호. 석탄 100은 화로+버너채굴기 연료 기준 매우 부족 |

핵심 진단: **너비(채굴기·화로 대수)만 늘리고, 사슬(철기어→과학팩→랩으로 이어지는 조립 체인)을 안 지었다.** 아래 자료들이 공통으로 경고하는 바로 그 실수다.

---

## 1. 빨간 과학팩까지의 최소 설비

### 1-1. 공식/커뮤니티 가이드가 말하는 "최소" 숫자
- Automation(자동화) 기술 자체의 비용: **자동화 과학팩 10개** — 이것만 있으면 연구 완료. 즉 손수 크래프팅만으로도 기술 해금 가능. (출처: 게임 내 잘 알려진 사실 + 스피드런 가이드 언급 "hand craft 10 science packs for Automation" — [Speedrunning burner/furnace/belt/inserter factory 스레드](https://forums.factorio.com/viewtopic.php?f=202&p=592957)) — **신뢰도 HIGH** (게임 기본값, 여러 출처 일치)
- 초보자 가이드(jeu.video)의 권장 초기 랩/조립기 수: **빨간 과학 조립기 2대 + 초록 과학 조립기 2대 + 랩 4~6대**로 시작하면 기지가 충분히 굴러간다. ([JEU.VIDEO 베기너 비율 가이드](https://jeu.video/en/guide/factorio-beginner-ratios)) — **신뢰도 MED** (커뮤니티 가이드, 공식 수치 아님)
- 공식 위키 Quick Start Guide: "랩 1~2대 정도 만들고, 자동화 과학팩 10개를 손으로 크래프트해서 Automation 연구부터 먼저 하라"고 명시. 조립기·인서터가 나온 뒤에야 본격 자동화 착수. ([Factorio Wiki: Tutorial:Quick start guide](https://wiki.factorio.com/Tutorial:Quick_start_guide)) — **신뢰도 HIGH** (공식 위키)
- 버너 시대(전기 이전) 권장 채굴기 총량에 대한 커뮤니티 경험칙: **철에 채굴기+화로 약 20쌍, 구리에 5~10쌍, 석탄에 채굴기 10대 이상, 돌에 4대** 정도면 충분히 자동화 전환까지 버틴다는 언급. ([Speedrunning burner/furnace/belt/inserter factory - Factorio Forums](https://forums.factorio.com/viewtopic.php?f=202&p=592957)) — **신뢰도 MED** (포럼 경험담, 공식 수치 아님. 특정 스피드런 카테고리 명시 없음)

### 1-2. 스피드런 정확 수치 (any%, 카테고리별)
- speedrun.com의 상세 가이드 2건(Steelaxe%, Nefrums' any% 가이드)은 **접근이 403으로 차단되어 본문을 직접 확인하지 못했다.** 검색 스니펫에서 얻은 단편 정보만 인용한다:
  - "Automation(자동화) 연구 완료 목표는 5분 이내(sub 5)" — 이는 **완전 자동화된 생산라인이 아니라, 손크래프팅 포함 연구 자체를 5분 안에 끝내는 것**을 의미. ([Nefrums' Factorio any% speedrun guide](https://www.speedrun.com/factorio/guides/jg8lg)) — **신뢰도 MED** (스니펫만 확인, 원문 미열람)
  - "손으로 만들어야 하는 고정 목록: 모든 채굴기, 화로, 랩 2대, 과학팩 10개, 전력 관련 필수품" — 즉 스피드런에서도 **랩은 2대**로 시작한다. ([Nefrums' 가이드 스니펫](https://www.speedrun.com/factorio/guides/jg8lg)) — **신뢰도 MED**
  - 자동화 연구가 끝난 뒤 "가능한 한 빨리 빨간 과학 자동 생산라인을 구축"하되, 정확한 조립기/화로/채굴기 최종 대수는 **확인하지 못함(미확인)**.
- **결론: "숙련자가 정확히 몇 대로 빨간 과학을 돌리는가"에 대한 단일 확정 숫자는 확보하지 못했다.** 다만 모든 출처가 일관되게 말하는 건 "두 자릿수 초반(1~2대 조립기, 2~6대 랩) 규모로 충분하다"는 점이며, 161/73이라는 우리 숫자와는 규모가 다른 이야기다.

---

## 2. 빨간 과학팩(Automation science pack) 1개의 재료 원가

**직접 레시피** (공식 위키, HIGH 신뢰도):
- 1 빨간 과학팩 = **철기어 1개 + 구리판 1개**, 제작 시간 **5초** ([Automation science pack - Factorio Wiki](https://wiki.factorio.com/Automation_science_pack))

**원광까지 환산** (철기어 1개 = 철판 2개 = 철광석 2개, 구리판 1개 = 구리광석 1개 — 공식 위키 레시피 기반 계산):
| 재료 | 수량 |
|---|---|
| 철광석 | **2개** |
| 구리광석 | **1개** |
| 석탄 (연료, 화로용) | 직접 재료 아님. 화로가 광석을 판으로 제련하는 데 쓰는 연료 |

**석탄 소모량 계산** (공식 위키 수치 기반 직접 계산, HIGH 신뢰도 원 수치 + 계산은 본 보고서 자체 산출):
- 돌화로 제련 속도: 1판/3.2초, 석탄 소비율 0.0225/초 ([Stone furnace - Factorio Wiki](https://wiki.factorio.com/Stone_furnace))
- → 판 1개당 석탄 소비 = 0.0225 × 3.2 ≈ **0.072개** → 석탄 1개로 약 **13.9판** 제련 가능
- 빨간 과학팩 1개 = 철판 2개 + 구리판 1개 = 판 3개 제련 필요 → 석탄 약 **0.216개** 소모 (계산값, MED — 공식 수치를 조합한 파생값이라 직접 인용 아님)
- 참고로 버너 채굴기 자체의 연료 효율은 별도: "석탄 1개로 광석 약 7개 채굴" ([Burner mining drill - Factorio Wiki](https://wiki.factorio.com/Burner_mining_drill)) — **HIGH**

**정리하면 빨간 과학팩 1개 = 철광석 2 + 구리광석 1, 제작 5초, 화로 연료로 석탄 약 0.2개** — 매우 저렴하다. 우리 무리가 재료 부족으로 못 돌리는 게 아니라(철광석 1,700개면 850개 과학팩 분량), **조립 체인(기어 조립기 + 과학팩 조립기 + 랩 연결)이 아예 없어서** 0개인 것으로 보인다.

---

## 3. 오프닝 순서 (처음 10~20분)

공식 위키 Quick Start Guide + jeu.video 가이드를 종합한 단계별 순서 ([Factorio Wiki: Tutorial:Quick start guide](https://wiki.factorio.com/Tutorial:Quick_start_guide), [JEU.VIDEO 메인버스 가이드](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **신뢰도 HIGH(위키) / MED(가이드 세부수치)**:

1. **버너 채굴기 1대 + 돌화로 1~2대** — 철광석 옆에 배치, 화로를 향하게. 손으로 몇 개 캐고 만들며 시작
2. **채굴기 추가 (석탄·돌 자급 포함)** — 석탄은 채굴기 2대가 서로 마주보게 배치해 자급자족(self-fueling) 가능. 돌은 상자로 직행
3. **랩 1~2대 제작 + 손크래프팅으로 빨간 과학팩 10개** — Automation 기술부터 연구 (인서터, 조립기 해금)
4. **조립기 등장 후**: 철기어 조립기 1대 + 빨간 과학팩 조립기 1~2대 구성, 인서터로 랩에 연결 — **이 시점부터 "자동 생산"이 시작**
5. **전기(보일러+증기기관) 구축**: 오프쇼어 펌프 1 + 보일러 1 + 증기기관 2대가 기본 단위. 표준 비율은 **보일러 1 : 증기기관 2** (보일러 1.8MW 출력 = 증기기관 2대의 소비량 0.9MW×2, [Boiler - Factorio Wiki](https://wiki.factorio.com/Boiler) 수치 기반 계산) — **HIGH**
6. **전기 채굴기로 전환** (버너 → 전기): 전력망이 갖춰진 직후. 전기 채굴기는 버너보다 2배 빠르고 연료가 필요 없음 ([Burner mining drill - Factorio Wiki](https://wiki.factorio.com/Burner_mining_drill)) — **HIGH**
7. **초록 과학(로지스틱 연구)까지 확장**: 스플리터·지하 벨트 해금 후 빨간 과학 라인을 벨트 기반으로 정식 자동화

**손크래프팅 vs 자동화의 경계**: 정확히 "Automation 기술까지는 손으로, 그 이후는 기계로"가 명확한 경계선이다. Automation 해금 전에는 조립기 자체가 없으므로 과학팩·기어를 전부 손으로 만들 수밖에 없다.

---

## 4. 초보가 흔히 하는 실수 (권위 있는 출처 경고)

- **"체인 앞쪽이 광석 부족인데 뒤쪽만 늘리기"**: "expanding the end of the chain while the beginning is short on ore" — 하류(조립기·랩)를 늘리기 전에 상류(채굴·제련)부터 고쳐야 한다. ([JEU.VIDEO 메인버스 가이드](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **MED**
- **"양쪽을 동시에 벌리지 마라"**: "Building on both sides too early. Use one side first and keep the other side open." 너비를 먼저 늘리는 게 흔한 실수라고 명시. ([위 동일 출처](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **MED**
- **"과학팩이 밀려 쌓일 때만 랩을 늘려라"**: "Add labs only when science packs are backing up on belts or in chests. If packs are missing, fix production first." — 우리 상황과 정반대(랩 3대가 있는데 과학팩이 0개)를 정확히 지적하는 원칙 ([동일 출처](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **MED**
- **"전력부터 안정시키고 과학을 늘려라"**: "Stabilize power before scaling science." ([동일 출처](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **MED**
- **"손으로 계속 과학팩 만들고 있다면 공장이 아무것도 안 배우고 있는 것"**: "Do not hand-feed labs for long." ([동일 출처](https://jeu.video/en/guide/factorio-beginner-main-bus)) — **MED**
- **"랩을 과도하게 지어놓고 다음 과학팩이 안 나와서 놀리는 것도 흔한 실수"** (Steam 커뮤니티 논의, 공식 출처는 아님) — **LOW**

이 가이드(jeu.video)는 위키·공식 문서는 아니지만, 알려주신 5가지 조사 항목 중 4번(초보 실수)과 우리 상황(161채굴기+73화로, 랩 0가동)을 가장 정확히 설명하는 원칙을 담고 있다. 다만 **위키·alt-f4.blog·speedrun.com 원문에서 "너비 먼저 늘리기"를 직접 경고하는 문장은 이번 조사에서 확인하지 못했다** (alt-f4.blog 검색은 관련 글을 특정하지 못함, HIGH 신뢰도 출처로 뒷받침 못 함 — 미확인).

---

## 5. 버너 시대 vs 전기 시대 전환 시점

- **판단 기준**: "전기망이 구축된 시점"에 전기 채굴기로 전환하는 것이 정석. 버너 채굴기는 "전기망을 갖추기 전까지" 쓰고, 그 이후엔 더 크고 빠른 전기 채굴기가 우월해진다. ([Burner mining drill - Factorio Wiki](https://wiki.factorio.com/Burner_mining_drill)) — **HIGH**
- **속도 차이**: 버너 채굴기 0.25개/초 vs 전기 채굴기(버너의 2배 언급, 정확한 위키 수치는 이번 조사에서 재확인 못 함 — 흔히 알려진 값은 0.5개/초) — 채굴 속도 **HIGH**(버너), 전기 채굴기 정확 수치는 **MED**(검색 스니펫 기반, "twice as fast" 문구만 직접 확인)
- **왜 빨리 넘어가야 하는가**: 버너 채굴기는 "아이템당 오염을 많이 발생시킨다"는 명확한 단점이 위키에 적혀 있음 ([Burner mining drill - Factorio Wiki](https://wiki.factorio.com/Burner_mining_drill)) — **HIGH**
- **버너 시대에 지어도 되는 대략적 규모** (앞서 인용한 포럼 경험담): 철 20쌍, 구리 5~10쌍, 석탄 10대+, 돌 4대 — 이 기준으로 보면 **버너 채굴기 161대는 버너 시대 권장치의 4~8배 규모**. 이 정도 규모라면 애초에 전기 시대로 넘어갔어야 정상. ([Speedrunning burner/furnace/belt/inserter factory - Factorio Forums](https://forums.factorio.com/viewtopic.php?f=202&p=592957)) — **MED**

---

## 6. 확인하지 못한 것 (미확인 — 추측 금지)

- speedrun.com의 Steelaxe%/any% 가이드 원문 (403 차단으로 본문 미열람) — 랩/조립기/화로의 **정확한 최종 대수와 분 단위 타임스탬프**는 확보하지 못함
- Factorio 2.0에서 버너/전기 채굴기, 화로 기본 속도가 1.1과 달라졌는지 여부 — 이번 조사에서 버전 간 차이를 명시하는 출처를 찾지 못함
- alt-f4.blog에서 "오버빌딩"을 직접 다룬 글 — 검색으로 특정 호(issue)를 찾지 못함
- 전기 채굴기의 정확한 채굴 속도(0.5/초로 흔히 알려져 있으나 이번 조사에서 공식 위키 원문으로 재확인은 안 함)
- factoriocheatsheet.com의 표 — 페이지가 로딩 실패로 열람 불가

---

## 출처 전체 목록

1. [Automation science pack - Factorio Wiki](https://wiki.factorio.com/Automation_science_pack) — HIGH (공식)
2. [Burner mining drill - Factorio Wiki](https://wiki.factorio.com/Burner_mining_drill) — HIGH (공식)
3. [Stone furnace - Factorio Wiki](https://wiki.factorio.com/Stone_furnace) — HIGH (공식)
4. [Boiler - Factorio Wiki](https://wiki.factorio.com/Boiler) — HIGH (공식)
5. [Tutorial:Quick start guide - Factorio Wiki](https://wiki.factorio.com/Tutorial:Quick_start_guide) — HIGH (공식)
6. [Speedrunning burner/furnace/belt/inserter factory - Factorio Forums](https://forums.factorio.com/viewtopic.php?f=202&p=592957) — MED (커뮤니티 포럼)
7. [Nefrums' Factorio any% speedrun guide - speedrun.com](https://www.speedrun.com/factorio/guides/jg8lg) — MED (검색 스니펫만 확인, 원문 403)
8. [Steelaxe% - A video guide - speedrun.com](https://www.speedrun.com/factorio/guides/jpg8l) — 접근 불가 (403), 인용 안 함
9. [JEU.VIDEO - Factorio beginner ratios](https://jeu.video/en/guide/factorio-beginner-ratios) — MED (커뮤니티 가이드)
10. [JEU.VIDEO - Factorio beginner main bus](https://jeu.video/en/guide/factorio-beginner-main-bus) — MED (커뮤니티 가이드)
11. [factoriocheatsheet.com](https://factoriocheatsheet.com/) — 열람 실패, 인용 안 함

---

## 추가 탐색 권장 방향

- speedrun.com 가이드 원문은 브라우저로 직접 열람하거나(403은 봇 차단으로 추정), Wayback Machine 캐시를 시도하면 정확한 "N분에 M대" 수치를 얻을 수 있을 것
- Factorio 2.0 전용 변경사항(예: Nauvis 자원 배치, 퀄리티 시스템이 초반 건물 수에 영향 주는지)은 별도 조사 필요
- 우리 무리의 구체적 수치(161채굴기/73화로/0생산)를 "무엇을 뜯어고쳐야 하는가"로 연결하는 것은 이 조사의 범위를 넘어서므로, 위 숫자를 가지고 `architect`나 `analyst` 에이전트가 진단하는 것을 권장
