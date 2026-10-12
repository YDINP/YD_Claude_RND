# SV2 (2.1-2.2.x) 발성·다이내믹스 조형: 테토 AI 2 용 (loudness / tension / breathiness / voicing / gender / toneShift / mouthOpening / vocalModes)

수집 한계 먼저: 공식 문서(sv2.docs.dreamtonics.com), forum.dreamtonics.com 은 WebFetch 가 403/302 로 막혀 본문 못 읽음. 아래 "공식 문서" 인용은 검색 결과 스니펫에 의존(2차 전달). 테토 AI 2 전용 다이내믹스 레시피(note/X/YouTube)는 검색에서 **찾지 못함**. 수치형 근거는 거의 없고, 구현용 수치는 대부분 "추론(신뢰도 E)"으로 분리해 표기.

## 1. Loudness: AI 자체 다이내믹스와의 상호작용, 자연스러운 범위, 프레이즈 아치, 작은/불균일 음절 대책

### Takeaway
공식 정의는 "음량(다이내믹스)의 세밀 조정"뿐이고, AI 가 프레이즈별 음량을 이미 바꾸는지·그리는 것과 싸우는지에 대한 1차 근거는 찾지 못했다. 사용자 보고로는 loudness 는 "그냥 전체를 키울 뿐 힘주는 느낌은 안 늘린다"이고, 줄이면 "노래가 부드러워지는 게 아니라 마이크에서 물러서는 느낌"이 난다. 작은 음절은 loudness 보다 음소 강도·모드·tension 쪽 원인을 먼저 의심.

### Cited Findings
- 공식(SV2 docs 스니펫): Loudness = "보컬 음량(다이내믹스)의 세밀 조정". — [sv2.docs.dreamtonics.com/en/parameters](https://sv2.docs.dreamtonics.com/en/parameters) (검색 스니펫 경유, 본문 미확인)
- VI-Control 사용자: loudness 는 전체를 키울 뿐 "보컬 노력감"을 늘리지 않는다. — [vi-control.net](https://vi-control.net/community/threads/synthesizer-v-vocaloid-haters-might-want-to-check-this.115973/page-84) (사용자 의견, 신뢰도 D)
- Reddit 사용자: loudness 곡선을 낮추면 부드럽게 부르는 게 아니라 "마이크에서 한 발 물러나는" 소리가 난다. 답변은 확인 못함. — [r/SynthesizerV 스레드](https://redlib.ssps.io/r/SynthesizerV/comments/1lu54ai/tips_for_loudness/n1v93wl/?context=3) (D)
- 포럼 답변: 부드럽게 하려면 Loudness 또는 Tension 을 줄이거나 Breathiness 를 올린다. — [forum.synthesizerv.com/t/topic/5603](https://forum.synthesizerv.com/t/topic/5603) (D)
- 음소 단위: 노트 속성에서 음소별 길이·강도를 20%~180%, 5% 단위로 설정. 자음이 길면 먼저 길이, 안 되면 강도로 줄이며 자음을 50% 부근에서 시작해 조정. — [note: SynthesizerV AI 調声の仕方3 (セブヶ崎詠人)](https://note.com/aaaaa_hachinana/n/n710fd3ea4f22) (C-D)
- 2.2.0 beta 3: 보이스 패널에 그룹 내 모든 무성 자음의 강도를 조절하는 슬라이더 추가(검색 스니펫). 자음 위주로 약해 보일 때 후보. — [forum.dreamtonics.com 2.2.0 Beta 3](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta-3/7338) (스니펫 경유, 본문 미확인; 정식판 포함 여부 미확인)
- 자동화는 노트 이동 시 시간 연동이 안 돼서 노트/음소를 옮기면 곡선을 다시 맞춰야 한다는 사용자 보고. — [vi-control.net page-19](https://vi-control.net/community/threads/synthesizer-v-studio-2.160492/page-19) (D). 우리 쪽: 곡선은 노트 확정 후 마지막에 생성.
- 작업 순서(일본 블로그): 피치·발음이 토대, 음색은 양념, 억양(강약)은 마지막. — [note 3편](https://note.com/aaaaa_hachinana/n/n710fd3ea4f22) (C)
- 로컬 기존 지식(synthv-teto 스킬): loudness 범위 -48~+12 dB(.svp 값), 모사 루프로 음량 MAE 7.44 -> 2.95 dB, 상관 0.08 -> 0.77 달성. downer 프리셋은 Loud +8. — `D:\park\YD_Claude_RND\.claude\skills\synthv-teto\SKILL.md` (실측, 신뢰도 A/B, 로컬)

### Inferences (구현용 출발값, 전부 신뢰도 E, 렌더+측정으로 덮어쓸 것)
- 프레이즈 아치: 줄 시작 -1~-2 dB -> 줄 중간 정점 +1~+3 dB -> 줄 끝 -2~-4 dB. 아치 폭은 합계 6 dB 이내(일반 곡), 사비 줄은 기준 +2~+4 dB. 곡선은 cubic, 점 간격 1/8~1/4음(너무 촘촘하면 "마이크 물러남"/떨림 위험).
- 강박 액센트: 해당 음 앞 1/16음에서 +1.5~+3 dB 상승, 음 길이 1/4~1/2 동안 유지 후 복귀. 모든 박에 넣지 말고 가사 강세 음절 위주.
- "조용해지는 곳" 보정 순서: (1) 짧은 음·자음 많은 음절의 음소 강도 확인(자음 50~100%, 모음은 100~120%), (2) 모드(Mellow/Low 비중)가 해당 구간만 높은지, (3) tension 이 음수인지, (4) 그 다음에야 loudness +2~+4 dB 국소 보정(음 길이 +앞뒤 1/16음). 프레이즈 단위 -3 dB 이하 감소는 "물러남" 부작용 위험이라 피하고 대신 모드/breathiness 로 부드러움 표현.
- 짧은 음(1/16 이하)은 AI 가 에너지를 덜 싣는 경향이 있을 것으로 가정(가설) -> +1~+2 dB 국소 상승. 검증은 모사 루프의 구간별 음량 측정으로.

### Gaps
- AI 가 프레이즈별로 이미 음량을 변화시키는지, loudness 곡선과 충돌하는지는 공식·사용자 근거 없음. 로컬에서 "곡선 0 vs 아치 곡선" A/B 렌더로 측정해야 함.
- "자연스러운 dB 범위"의 공개 수치 없음.
- 테토 AI 2 전용 note/X/YouTube 다이내믹스 레시피 미발견.

## 2. Tension / 벨팅·절규 / 소프트·위스퍼 / 語尾息 / 팔세토

### Takeaway
SV2 AI 보이스에서 tension 은 약하다는 사용자 보고가 있다: 올려도 거의 효과 없고, 내리면 음량만 내려가 loudness 로 보정해야 한다. Dreamtonics 의 공식 방향은 "tension/breath 로 보충하지 말고 보컬 모드를 쓰라"이다. 소프트·위스퍼는 voicing 하향 + breathiness 상향, 벨트는 Power/Rock 모드가 중심이다.

### Cited Findings
- 공식(스니펫): Tension = 낮추면 부드러운 소리, 올리면 긴장·압박된 소리. Breathiness = 유성/무성(주기 성분/기식 성분) 균형, 과하면 노이즈. Voicing = 유성(주기) 성분 양, 기본값=최대, 낮추면 속삭임에 가까워짐. Mouth opening = 입 벌림 정도. — [sv2.docs.dreamtonics.com/en/parameters](https://sv2.docs.dreamtonics.com/en/parameters) (스니펫 경유)
- 공식(스니펫): V2 에서는 보컬 모드가 tension/breath 같은 파라미터보다 자연스럽고 이상적인 소리를 내는 경향. 기존에 tension/breath 로 모드 부족을 메웠다면 모드와의 균형을 다시 잡거나 표준 파라미터를 끄는 게 낫다. — [sv2.docs.dreamtonics.com/en/prev-version-changes](https://sv2.docs.dreamtonics.com/en/prev-version-changes) (스니펫 경유)
- 포럼: 구버전은 tension 올리면 공격적, 내리면 팔세토/소프트. 신버전(AI 보이스)에서는 올려도 거의 무효, 내리면 음량만 감소. "Standard 보이스의 tension 은 원본 샘플 후처리, AI 보이스에서는 엔진을 특정 거동으로 편향시키는 용도"라는 설명도 있음. 이 현상은 AI 보이스 한정. — [forum.synthesizerv.com/t/topic/5603](https://forum.synthesizerv.com/t/topic/5603), [topic/7086](https://forum.synthesizerv.com/t/topic/7086/1) (사용자 보고, D). 하나는 SV1 vs 신버전 비교라 "SV1 동작" 부분은 SV1 전용 정보.
- VI-Control: voicing 은 loudness 와 비슷하지만 하모닉 성분에만 작용, 낮추면 속삭임. — [vi-control.net](https://vi-control.net/community/threads/synthesizer-v-vocaloid-haters-might-want-to-check-this.115973/page-84) (D)
- 힘(파워) 소스 3가지: 감정적 노래는 정확한 피치에서 벗어남(Pitch Deviation 으로 제어), 톤(tension, tone shift, 모드), 믹싱. 벨트 능력은 보이스뱅크 학습 데이터의 벨트 샘플 양에 의존. — [forum.synthesizerv.com/t/topic/8691](https://forum.synthesizerv.com/t/topic/8691) (스니펫 경유, D)
- V2 보이스는 모드 차이가 뚜렷해 V1 에서 먹히던 조합이 과할 수 있음. — 위 8691 스레드 (D)
- 테토 AI 2: Power/Mellow 는 기본음색에서 변화가 비교적 큼, Low 는 변화 최대(힘 뺀 우울한 창법), Mini 는 어린이풍(UTAU 테토에 가까움), Rock 은 Power 와 비슷하되 파워에 강약이 있음. 필자는 Mini 150% + Power 50% 사용. 4개 기존 모드(Joyful/Cute/Power/Mellow)는 SV1 과 큰 차이 못 느낌. — [note: kenchan21](https://note.com/kenchan21/n/nfa459d01256e) (D, 한 사람 감상)
- 속삭임 전용 음원/모드가 없어 숨 섞인 소리는 파라미터 조정 필요. — [AHS/블로그 요약 검색 결과](https://www.ah-soft.com/synth-v/teto2/) (제품 페이지에는 모드 목록; 위스퍼 부재 언급은 검색 요약 경유, 신뢰도 D)
- 로컬 실측 지식: 테토 AI 2 는 Tension 반응이 약해 ±0.3 안에서만 쓰고 음색은 모드로. Mellow = 효과 크고 문장 끝 숨 늘어남 -> 브리지·위스퍼 대용(+breathiness). Power = 효과 크나 절규에는 부족. Rock = Power 보다 두껍고 거칠며 강약 큼. 語尾息: 마지막 100~200ms 에서 breathiness 올리고 loudness 내림(Mitchie M 원리, E), 기본 +0.25 breathiness(마지막 150ms). 브레스 소리는 메인보다 -6~-12 dB. — SKILL.md (A/D/E 혼재)

### Inferences (구현 출발값, 신뢰도 E)
- 소프트 구간: Mellow 70~110, Power 0~20, breathiness +0.2~+0.4, voicing 0.8~0.95, tension 0~-0.2, 그리고 loudness 는 -1~-3 dB 이내로(그 이상은 물러남 부작용). 위스퍼풍: voicing 0.3~0.6 + breathiness +0.5. 노이즈가 늘면 breathiness 를 내리고 voicing 을 낮춰 대체.
- 벨트/샤우트: Power 100~140 (+ Rock 40~70), tension +0.2~+0.3, loudness +2~+4 dB, breathiness -0.1~0. tension 의 효과가 약하다는 보고가 많아 tension 에 의존하지 말고 모드 비중으로 해결.
- 팔세토/헤드: toneShift 는 음정이 아니라 음색 이동. 높은 음에서 gender +0.1~+0.3(주의: 부호가 매뉴얼과 API 에서 반대라는 로컬 메모가 있음, 미확정) + breathiness +0.15~+0.3 + Mellow. 팔세토 전용 수치는 근거 없음.
- 語尾息 곡선: 줄 끝 음의 마지막 100~200ms 구간에서 breathiness 를 cubic 으로 +0.25 ~ +0.35까지 올리고, loudness 는 -2~-4 dB 로 내림. 하강 시작 점은 음 길이의 70~85% 지점.

### Gaps
- SV2.1~2.2.x 에서 tension 의 AI 별 정량 효과(dB/스펙트럼)는 없음.
- toneShift 와 mouthOpening 의 .svp 값 범위는 공식 확인 못함 (로컬 SKILL.md 도 미확인으로 표기).
- 위스퍼/팔세토 전용 테토 레시피는 미발견.

## 3. 보컬 모드 자동화 (vocalModes 곡선), 모드 혼합 부작용

### Takeaway
공식 문서의 가이드는 "모드 중심, 파라미터는 보조"이고, 2.1.1 스크립트 API 가 vocalModeParams 와 세부 보컬 모드 조작을 노출한다. 구간별 모드 자동화 사용 사례나 Power 100 + Rock 60 같은 혼합의 부작용에 대한 사용자 사례는 거의 찾지 못했다.

### Cited Findings
- 리뷰: 모드를 자동화해야 "더 인간적인" 보컬이 된다. Voice 패널은 모드별 레벨 외에 Pitch/Timbre/Pronunciation 을 각각 열어 제어할 수 있다. — [Sound On Sound](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro?amp) (B, 리뷰어 평)
- 2.1.1: JavaScript/Lua 스크립트가 리테이크, 피치 컨트롤, 세부 보컬 모드 파라미터, 자음 타이밍 등을 다룰 수 있고 NoteGroupReference 의 getVoice/setVoice 에 vocalModeParams 추가. 2.1.0: Pro Tools ARA2, 피치 컨트롤 포인트 모드 개편(비브라토 깊이·속도 핸들). 2.1.2: 보이스 선택기 개편, 스크립트 패널. — [Dreamtonics 2.1 계열 공지 요약 (검색 결과)](https://www.dreamtonics.com/?p=3411), [Sonicstate](https://sonicstate.com/news/2025/06/17/synthesizer-v-studio-2-pro-updated/) (A/B)
- 2.2.0 베타가 포럼에 존재(Beta 3에 자음 강도 슬라이더). 정식 2.2.x 릴리스 노트는 못 찾음. — [forum](https://forum.dreamtonics.com/t/synthesizer-v-studio-2-pro-2-2-0-beta-3/7338) (스니펫)
- 모드 혼합 관련: 테토 필자 Mini 150 + Power 50. 로컬 프리셋 downer = Joy120/Cute5/Power130/Mellow130/Low140/Rock115. 둘 다 합이 100%를 크게 넘는 조합도 작동은 하지만 청감 평가는 개인 감상(D). — [kenchan21](https://note.com/kenchan21/n/nfa459d01256e), SKILL.md
- 로컬: .svp 의 그룹 `vocalModes{모드: 곡선}` 구조는 앱 저장본으로 확인되지 않았고, 현재 파이프라인에서는 쓰지 않음. 값 범위 API 0~150, GUI 140 여부 미확인. — SKILL.md (A, 미확인 표기)
- 일본 블로그: 테토의 일본어 발음이 거슬리는 곳은 피치 시프트나 보컬 모드 조정으로 개선하라는 조언. 프레이즈 앞에 아래서 긁어 올리는 피치(しゃくり)를 길게 두면 눈에 띄고 짧게 두면 자연스럽다. 앞 음이 낮을수록 끌림이 커져 약간 파워/엣지가 생긴다. — 검색 요약 ([note 2편](https://note.com/aaaaa_hachinana/n/na1fd54749f7a)), 본문 직접 확인 못함 (D)

### Inferences
- 구간 자동화: 프레이즈 경계(숨 쉬는 곳)에서 1/8~1/4음에 걸쳐 모드 값을 크로스페이드. 한 프레이즈 안에서 모드 비중이 급변하면 음색 점프가 들리므로 200ms 이상 램프. 사비 진입 직전 1~2박에 Power 를 -> 목표까지 올려 "빌드업".
- 혼합 부작용 가설: 합이 매우 큰 혼합(예: Power 130 + Rock 115)은 음량과 질감이 모드별로 달라 프레이즈 내 음량 편차 확대, Low/Mellow 비중이 크면 먹먹·작게 들림(로컬 메모: Low 믹스에서 먹먹, Mini 믹스에서 얇음). 모드를 바꾸면 loudness 곡선도 다시 맞춰야 한다고 가정.
- 모드 곡선 JSON 은 사용자 GUI 저장본(`%APPDATA%\Dreamtonics\Synthesizer V Studio 2\recovery\`)을 diff 해 키·단위를 확정한 뒤에만 사용.

### Gaps
- vocalModes 자동화의 실제 JSON 스키마, 사용자 사례, Power+Rock 혼합 부작용의 1차 보고 모두 없음.

## 4. Expression Pad (expValueX/Y), AI Retakes, Mouth Opening

### Takeaway
Expression Pad 는 노트 패널의 X/Y 패드로, 엔진의 "표현력"과 긴 음 비브라토를 조절하는 것으로 알려져 있다(피치 생성 방식을 바꾸는 도구). 에너지/세기에 미치는 영향의 근거는 없다. Mouth Opening 은 모음 발음에 작용하고, 한 사용자는 피아니시모에 유효했다고 보고했다.

### Cited Findings
- Expression Pad = 엔진의 표현력과 긴 음 비브라토를 조절하는 X/Y 패널. — [Sound On Sound](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro?amp) (B)
- Expression Pad 는 피치 생성 방식을 변조하는 편리한 방법. V1 보이스 호환 업데이트에서는 효과 제한적. — [Dreamtonics 제품 정보 요약 (검색 스니펫)](https://dreamtonics.com/?p=1945) (본문 403으로 미확인; B-C)
- Retakes: 노트 패널에서 전체 또는 선택 노트의 대안 테이크를 생성, 타이밍/피치/음색/전부를 선택 변동 가능. 단일 클릭. — [Sound On Sound](https://www.soundonsound.com/reviews/dreamtonics-synthesizer-v-studio-2-pro?amp) (B). 노트 패널에 Expression Pad 와 1클릭 AI Retakes 가 새로 들어옴 — 위 dreamtonics 요약 (스니펫).
- Mouth Opening: 모음 발음에 작용, 업그레이드된 보이스에만 추가(V1 호환 업데이트 미지원). 단어 강조나 프레이즈 시작·끝을 부드럽게 하는 용도. 사용자 1명이 mouth opening 을 낮춰 피아니시모를 얻는 데 아주 효과적이었다고 보고. — [dreamtonics.com/?p=1945 요약](https://dreamtonics.com/?p=1945) (스니펫), [forum 보고](https://forum.dreamtonics.com/) (단일 사용자, 스레드 URL 미확인; D)
- 로컬: `expValueX/Y` 범위·방향 미확인(Rigid = 왼쪽 아래 추정). kenchan 은 표현 컨트롤로 피치 곡선을 직선 쪽으로 당겼고 완전히 당기면 비브라토가 안 걸려 중간까지 당김. — SKILL.md, [kenchan21](https://note.com/kenchan21/n/nfa459d01256e) (D)

### Inferences
- 피아니시모/약한 줄: mouthOpening 을 -0.2~-0.4 (범위 미확인, 상대적 감소) + loudness -1~-2 dB 로 "물러남" 없이 약화. 강조 단어: mouthOpening +0.1~+0.3.
- Retakes 는 음색·타이밍의 변이를 고르는 용도이며, .svp 에서는 retake 슬롯 선택값을 저장할 것으로 추정 (스키마 미확인). 같은 시드 렌더는 결정적이므로 A/B 후보 수집에 쓸 수 있음.

### Gaps
- expValueX/Y 의 수치 범위, 에너지에 미치는 영향, mouthOpening/toneShift 의 .svp 범위는 모두 미확인. 가장 빠른 확정 방법은 GUI 에서 저장한 .svp 의 diff.

## 5. 일본어/영어 커뮤니티 레시피 (테토 AI 2)

### Takeaway
2025~2026 의 테토 AI 2 전용 다이내믹스 조교 글/영상은 검색으로 찾지 못했다. 찾은 건 일반 조교 구조와 모드 감상 정도이며, 수치형 레시피는 사실상 없다.

### Cited Findings
- 조교 4요소(피치·발음·음색·억양)와 순서, 음소 20~180%/5% 단위 — [note 3편](https://note.com/aaaaa_hachinana/n/n710fd3ea4f22) (C)
- 테토 AI 2 모드 7종, 2025-11-27 발매, 모드 사용에는 SV Studio 2 Pro 필요. — [AHS 제품 페이지](https://www.ah-soft.com/synth-v/teto2/) (A)
- 모드 소개 영상(공식): [YouTube](https://www.youtube.com/watch?v=ruowT-DEzZk) (내용 미열람)
- 테토 AI 2 UTAU 곡 커버 감상, Mini150+Power50 — [kenchan21](https://note.com/kenchan21/n/nfa459d01256e) (D)

### Gaps
- 検索語 "重音テトAI 調声 ダイナミクス / ラウドネス 書き方 / テンション 効果" 모두 해당 주제 글 없음. X/Twitter 스레드와 YouTube 튜토리얼 본문은 접근하지 못함.
- 다음 단계 제안: (1) GUI 에서 사용자가 저장한 .svp diff 로 toneShift·mouthOpening·expValueX/Y·vocalModes 스키마 확정, (2) loudness 아치/モード 램프 A/B 렌더 + 구간별 음량 측정으로 위 E-등급 수치를 실측 대체.
