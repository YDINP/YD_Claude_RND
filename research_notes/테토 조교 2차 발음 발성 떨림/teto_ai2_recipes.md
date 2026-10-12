# Kasane Teto AI 2 (SV2) 조교 레시피 카탈로그 (2025-11 ~ 2026)

범위 메모: 웹 검색 도구가 영어/일본어 롱테일에 약해, 실제로 내용을 확인한 1차 자료는 note/블로그 7건뿐이다. X/Twitter, niconico, 5ch, Reddit, Dreamtonics 포럼은 접근 불가(Reddit 차단, 포럼 403) 또는 검색 미적중이었다. 십룡(十竜)/セブヶ崎詠人/40mP의 SV2 테토 튜토리얼은 찾지 못했다. 신뢰도 태그: [A]=작성자가 수치를 직접 공개한 1차 자료, [B]=수치 없는 정성 리뷰, [C]=간접/미확인.

## 1. 장르별 보컬 모드 블렌드와 음성 패널 값

### Takeaway
수치까지 공개된 SV2 테토 레시피는 陰影電設의 note 2건(다우너 팝, 록 메인보컬)이 사실상 전부다. 다우너는 Low+Mellow+Power, 록은 Rock+Power 중심이며, 음성 패널 값은 두 곡 간 차이가 크다. kenchan은 UTAU풍으로 Mini 150% + Power 50%를 썼다.

### Cited Findings
- 다우너 팝 「Spice Spice Time」 사비 메인보컬 [A]: Joy 120, Cute 5, Power 130, Mellow 130, Low 140, Mini 0, Rock 115. Loudness +8.0, Tension ±0.00, Breath +0.30, Gender +0.10, Tone Shift -100 cents. 기사는 Low·Mellow를 주성분, Power를 보강, Cute를 낮게 유지했다고 설명. 값 옆의 괄호 3개 수치(예: Joy 120 (105,120,95))는 의미가 설명되지 않았다(구간별 값으로 추정되나 미확인). — [陰影電設](https://note.com/in_densetsu/n/n65ed9832c54d)
- 다우너 팝 설계 원칙 [B]: 음량으로 밀지 말 것, 저역으로 두껍게 하지 말 것, 중고역을 조정할 것. (검색 요약 기준이며 본문 전체는 미확인) — [검색 결과 경유 요약, 위 기사](https://note.com/in_densetsu/n/n65ed9832c54d)
- 록 메인보컬 (사비) [A]: Joy 40, Cute 5, Power 105, Mellow 0, Low 0, Mini 10, Rock 125. Loudness +3.5, Tension +0.5 (작성자가 가장 중요하다고 명시), Breath -0.45, Gender 0.15, Tone Shift 0. 괄호 3수치는 동일하게 의미 불명. BPM172 곡. — [陰影電設](https://note.com/in_densetsu/n/n9e434e7d41af)
- UTAU풍 시도 [A]: Mini 150%(최대) + Power 50%. 피치는 Expression control의 AI retake를 Straight 쪽으로 중간까지만 당김(완전 Straight는 비브라토가 사라짐). 일부 음은 Smart Pitch Control 점으로 수동 보정. 곡: 耳のあるロボットの唄. — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- 스타일 단독 테스트 [B]: Low 150%, Mini 150%, Rock 150%, Rock 150% + Power 150%, Power 50% + Rock 100% 예시. 장르별 수치는 없음. — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- Cute/Mini를 최대로 올려 "デフォえも～ん" 대사를 만듦(수치는 최대치만). — [HANASU](https://golbeehanasu.com/blog/review-synthesizer-v2-kasaneteto)
- 스타일 성격 요약 [B]: 기존 4종(Joyful/Cute/Power/Mellow)은 SV1과 음색이 거의 같고 Power·Mellow만 음색이 크게 변함. Low는 변화가 가장 크고 우나 Downer식 힘 뺀 창법, V4X Dark풍. Mini가 두 번째로 변화가 크고 UTAU 테토에 가까움. Rock은 Power와 비슷하지만 힘의 강약 변화가 큼(Power가 더 안정적). — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- 공식: 7종은 Joyful/Cute/Power/Mellow/Low/Mini/Rock, 스타일 사용은 유료 Studio 2 Pro 필요. 공식 페이지에는 권장 수치가 없음. — [AHS 공식](https://www.ah-soft.com/synth-v/teto2/)
- 종합 팁 [C, 검색 요약만]: 먼저 스타일로 큰 틀을 잡고, 파라미터는 효과가 강하니 약하게 가감. 스타일 "+" 로 구간별 피치/음색/발음 분리 설정 가능. — [Sleepfreaks 가이드(미열람)](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/)

### Inferences
- 두 곡의 Tension/Breath가 정반대(0/+0.30 vs +0.5/-0.45)인 점은 "다우너=숨 섞임, 록=조여서 깨끗하게"라는 일관된 방향을 시사한다.
- Cute 5 / Mini 0~10은 둘 다 거의 쓰지 않는다. 성인 보컬 지향이면 Cute/Mini는 최소화하는 것이 관례로 보인다. (표본 2곡이라 일반화는 약함)
- Tone Shift -100 cents(다우너)는 반음 내려 어둡게 하는 용도로 보인다. 저자의 의도 명시는 없음.

### Gaps
- cute/발라드/팝 일반에 대한 공개 블렌드 수치는 못 찾음.
- 괄호 3수치의 의미 불명(본문 이미지/표를 직접 확인 필요).
- 십룡, セブヶ崎詠人, 40mP의 SV2 테토 자료는 검색에서 나오지 않음.
- .svp 공개 파일/스크린샷 수치: 위 기사의 텍스트 외에는 확인 못함(이미지 내용은 열람 불가).

## 2. 보고된 약점과 대처

### Takeaway
공개 약점 보고는 적고 정성적이다: 일부 구간의 노이즈감, Low의 먹먹함, Mini/Rock의 얇음, Rock과 Power의 구분 어려움, 빈 트랙에서 스타일 변경 불가. 피치 드리프트·말끝 글리산도·저음 속삭임 같은 항목은 SV2 테토에 대한 1차 보고를 찾지 못했다.

### Cited Findings
- Low는 "먹먹함(muffled)", Mini와 Rock은 "얇음(thin)"으로 평가됨 [B]. — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- SV2 테토는 SV1보다 전체적으로 강한 목소리, 일부 구간에서 "ノイジー"(다만 강조 대사에는 어울린다고 평가) [B]. Rock은 Power보다 억제된 단단한 소리. — [HANASU](https://golbeehanasu.com/blog/review-synthesizer-v2-kasaneteto)
- Rock은 Power와 구별하기 어렵고 성우도 어려워했다는 언급 [B]; 필요하면 Power를 섞어 안정감을 확보. — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- 완전 Straight로 피치를 당기면 비브라토가 사라지므로 중간 지점 타협이 해법 [A]. — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- 체험판에서는 음표를 먼저 입력해야 스타일 변경이 가능하고, 체험판은 오디오 내보내기 불가 [B]. — [ボカログ 체험판](https://keiichi.blog/kasane-teto-sv2-trial-review/)
- 속삭임 전용 스타일이 없어 숨 섞인 소리는 파라미터(Breath)로 만들어야 한다는 지적은 SV1 시점 리뷰에서 나온 것 [C, SV1 정보]. 위 다우너 레시피의 Breath +0.30이 SV2에서의 실제 사용례. — [HANASU SV1 리뷰(검색 요약)](https://golbeehanasu.com/blog/review-synthesizer-v-ai-kasaneteto), [陰影電設](https://note.com/in_densetsu/n/n65ed9832c54d)
- 다른 보이스(Freemomen 등)에서는 Breath/Tension/Vocal Style의 효과가 SV1보다 강해졌으니 펜 툴로 곡선을 직접 그려 찾는다는 지침 [타 보이스, SV2]. — [K:A](https://note.com/ka_youtyu/n/n17cedba677e5)

### Inferences
- Low의 먹먹함은 다우너 레시피가 Low 단독이 아니라 Mellow+Power를 함께 쓰고 중고역(2.5kHz 이상)을 올려 보상한 이유를 설명해 준다.
- 파라미터 효과가 SV2에서 세졌다는 K:A의 지침은 테토에도 적용될 가능성이 높으나 테토 대상 확인은 아니다.

### Gaps
- 모호한 발음(mumbling), 약한 자음, 피치 드리프트, 말끝 글리산도, 저음 속삭임, 하모니 블렌딩: SV2 테토 한정 공개 보고 없음.

## 3. 발음 수정, 호흡, 어미 처리

### Takeaway
확인된 구체 기법은 phoneme timing 패널 조정, 어포스트로피+cl 스타카토, 시리즈 공통 しゃくり(1/32~1/64 분할, 반음 3~5), 호흡 트랙 분리다.

### Cited Findings
- 스타카토: 가사 앞에 어포스트로피를 붙이고 "cl" 브레이크 음소 삽입 [A]. 「そ」의 자음·모음 강화, 「も」와 「つ」 사이 간격 조정(수치 없음). 이는 UTAU의 선행발음/자음속도/엔벨로프에 해당한다고 설명. — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- しゃくり: 프레이즈 시작/끝 음을 1/32 또는 1/64로 분할해 3~5 반음 올림 [A]. Shift+Ctrl로 1/4 반음 단위 이동(미세 디튠, 자연스러운 비브라토). 장모음은 늘린 음 / 「ー」 분할 / 「あ」 분할의 3가지가 서로 다른 피치 움직임을 만든다(수치 없음). — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- 호흡 분리(Cubase): SynthV 트랙을 paraout로 두고, 설정(톱니바퀴) Audio and MIDI에서 무성음을 트랙별로 분리하는 옵션 선택. 저자 환경에서 5트랙 paraout일 때 Output 3이 본 보컬, Output 4가 호흡. — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- 샤우트(타 보이스 Sora Ozuno, SV2): Cool 150 + 앞에 짧은 「う」 + 손으로 그린 지그재그 피치(그로울) + 부분 호흡 + 입 벌림/텐션 상승(수치 없음). — [K:A](https://note.com/ka_youtyu/n/n17cedba677e5)
- 일반(SV1/UTAU 시대, Yahoo 지혜주머니, 검색 요약) [C, SV1 정보]: 시작은 아래에서 위로, 끝은 위에서 아래로 피치를 움직이면 자연스럽다. — [知恵袋](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1452465829)

### Inferences
- 어미 처리는 위 しゃくり/フォール 기법과 AI retake 중간 타협이 SV2 테토의 사실상 표준으로 보인다. (명시적 합의 문서는 없음)

### Gaps
- 테토 전용 phoneme override 목록, 호흡 음소(br) 삽입 수치, 어미 숨(語尾息) 수치: 미발견.

## 4. SV1 대 SV2 비교

### Takeaway
음색은 같은 테토. SV2는 피치가 매끄럽고 모음 연결이 자연스러우며, 신규 3스타일과 Mouth Opening이 추가됐다.

### Cited Findings
- 피치가 부드러워지고 모음 연결이 자연, 고음 지속이 맑음, 약발성이 현실적, 피치 곡선 반응이 정밀. SV1과 SV2는 신품 가격 동일. 정가 SV2 9,680엔(DLsite 세일 8,228엔), 업그레이드 코드 4,950엔. — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- 기존 튜닝은 그대로 유효하므로 SV1 사용자에게 SV2 권장 [B]. — [kenchan](https://note.com/kenchan21/n/nfa459d01256e)
- SV2는 전체적으로 더 강한 목소리. Mouth Opening은 Studio 2 Pro 전용 기능으로 SV1은 사용 불가. — [HANASU](https://golbeehanasu.com/blog/review-synthesizer-v2-kasaneteto)
- 공식: SV1 Teto는 Studio 2에서 사용 불가, 두 버전 병설 가능, V1 Studio Pro가 V2 프로젝트를 열면 일부 설정이 기본값으로 초기화. — [AHS](https://www.ah-soft.com/synth-v/teto2/)

### Gaps
- 동일 곡 AB 비교의 수치 기반 자료 없음.

## 5. 믹싱 (테토 SV2 한정)

### Takeaway
공개 수치는 陰影電設의 록 곡 체인 하나가 유일하게 구체적이다. 다우너 곡은 방향성만 있다.

### Cited Findings
- 록 곡 체인 (Cubase) [A]: EQ(HPF 110Hz, 250Hz 부근 컷, 3.2kHz 소폭 부스트, 10kHz 가볍게 부스트) → DeEsser(6.5kHz 부근, 약 4dB 감소, BPM172라 릴리스 빠르게) → Compressor(Threshold -23dB, 목표 GR 3~4dB, Ratio 4:1, Attack 15ms, Release 110ms) → Pultec EQP-1A, VoxD Thicken(목소리가 멀어지거나 자음이 흐려지면 MIX를 줄임). 리버브 센드: Plate, Decay 1.8s, PreDelay 32ms, High Cut 7,500Hz. — [陰影電設](https://note.com/in_densetsu/n/n9e434e7d41af)
- 다우너 곡 체인 [A, dB 없음]: 200~400Hz 감쇠(230Hz 컷, 500Hz 소폭 감쇠), 2.5kHz 이상 부스트. 컴프로 자음 어택을 살리며 앞으로 밀기. 후단 Magneto II(가벼운 새츄레이션으로 윤곽과 고역 배음, 자음 선명도), Pultec EQP-1A(저역 부스트 약하게, 공기감용 고역). 디에서 언급 없음. — [陰影電設](https://note.com/in_densetsu/n/n65ed9832c54d)
- 워크플로: SynthV에서 조정 -> iZotope Nectar로 반주와 맞춤 -> 수동 마무리(부분 딜레이, 하모니 리버브). — [ボカログ](https://keiichi.blog/teto-sv2-review/)
- 「声が一気に太くなる調整」 YouTube Shorts(테토 SV2 사용)가 존재하나 내용을 읽지 못함. — [YouTube](https://www.youtube.com/shorts/STK5hcc1jD8)

### Inferences
- 두 곡 모두 230~250Hz 컷과 2.5~3.2kHz 부스트로 수렴한다. Low/Mellow 계열 합성음의 저중역 먹먹함을 고려한 설계로 보인다.

### Gaps
- 새츄레이션 드라이브 양, 디에서 비교 수치(다우너), 테토 한정 주파수 약점 분석은 없음.

## 6. 조사 한계 요약
- 접근 불가/미적중: Reddit(WebFetch 차단), Dreamtonics 포럼(403), X/Twitter, niconico, 5ch, YouTube 설명란(자막/설명 미추출).
- 전문가 지명(十竜, セブヶ崎詠人, 40mP, kenchan 외)은 kenchan 외 SV2 테토 자료 미발견. kenchan과 陰影電設만 확인됨.
- 저품질 SEO 기사(proposable/nacsa 등)는 사용하지 않음.
- 추가 조사 후보 URL: 陰影電設 note 프로필, [kenchan の -ERROR 기사](https://note.com/kenchan21/n/nd2778fb95f93), [kenchan 偽りの時に抱かれて](https://note.com/kenchan21/n/n6914945d6804), [Sleepfreaks SV Studio 2 Pro 가이드](https://sleepfreaks-dtm.com/synthesizer-v-studio-2-pro/article/).
