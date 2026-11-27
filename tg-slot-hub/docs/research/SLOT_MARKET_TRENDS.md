# 슬롯 시장 트렌드와 수치 (2025~2026)

조사일: 2026-11-27. 대상: 텔레그램 미니앱 소셜 슬롯 허브(가상 코인만, 세로 화면).
피처 정의는 `docs/FEATURE_RESEARCH.md`에 있으니 여기서는 짧게만 다루고, 트렌드와 수치에 집중한다.

표기 규칙
- 출처는 `[n]` 번호로 달고, 문서 끝 출처 목록에 URL을 둔다.
- "확인 못함"은 찾아봤지만 믿을 만한 출처가 없었다는 뜻이다.
- "추정"은 출처 수치를 바탕으로 한 우리 해석이다.
- 게임 정보 사이트(OLBG, Sigma 등)는 제휴 매체라 RTP와 최대 배수가 운영사 설정에 따라 다를 수 있다. 출시 전 공급사 공식 자료로 재확인이 필요하다.

---

## 0. 요약 (핵심 시사점 10개)

1. **1000 시리즈의 공식은 "텀블 + 랜덤 배수 오브 + 초고변동성"이다.** Gates of Olympus 1000은 오브 배수가 최대 1000x이고 최대 당첨은 15,000x다. Sweet Bonanza 1000과 Sugar Rush 1000은 25,000x다 [1][2].
2. **최대 배수 경쟁은 계속 올라간다.** Gates of Olympus Super Scatter는 50,000x [3], Nolimit City의 San Quentin xWays는 150,000x, San Quentin 2는 200,000x로 표기된다 [4][5]. 반면 Hacksaw의 Wanted Dead or a Wild는 12,500x다 [6].
3. **소셜 카지노는 "피처 경쟁"보다 "메타 루프 경쟁"이다.** 레벨, 로열티 등급, 리그, 클럽, 주간 이벤트가 핵심이다 [7]. 우리 허브는 이 중 레벨·미션·리더보드는 있고 클럽·컬렉션·리그는 없다.
4. **소셜 카지노 시장은 정체 또는 하락이다.** Huuuge 핵심 2종의 일 활성 이용자(DAU)는 2025년 282.1k로 전년 대비 약 12% 줄었고 [8], Playstudios는 3분기 매출이 $71.2M에서 $57.6M으로 떨어졌다 [9]. 신규 유입보다 기존 이용자 수익화(결제자당 매출 상승)로 버티는 구조다.
5. **Playtika 3분기 ARPDAU는 $0.89, Playstudios는 $0.28, Huuuge 핵심 2종은 1인당 $2.3(연간)이다.** 지표 정의가 회사마다 달라 직접 비교는 어렵다 [8][9][10].
6. **상위 소셜 카지노 게임의 리텐션 기준은 D1 40%+, D7 20%, D28 15% 안팎이다.** 다만 이 수치는 2018년 벤치마크를 인용한 글이라 오래됐다 [7].
7. **텔레그램 게임은 리텐션이 낮다.** Helika는 2024년 4분기 텔레그램 게임 리텐션을 5~20%로 봤다(전통 게임 기준 20~30%) [11]. 에어드롭을 노린 "탭 투 언" 이용자는 보상이 끝나면 빠진다.
8. **살아남은 텔레그램 게임은 "게임 자체가 재미있는 쪽"이다.** Catizen이 대표 사례로 꼽힌다 [12][13]. 슬롯 허브는 출금 보상이 없으니 에어드롭 이탈 문제는 없지만, 같은 이유로 초대 보상의 동력도 약하다.
9. **영국 규제는 속도·오토플레이·손실 위장 연출을 금지했다.** 최소 한 판 2.5초, 오토플레이 금지, 손해를 당첨처럼 보이는 연출 금지다 [14]. 현금이 없어도 우리 허브는 이 기준을 "책임 있는 설계 기본값"으로 삼을 만하다.
10. **미국은 "현금 환전형 소셜 카지노(스윕스테이크)"를 주 단위로 막고 있다.** 2026년 5월 기준 9개 주가 입법을 마쳤다 [15]. 우리는 현금·상품 환전이 없는 단일 가상 코인이라 직접 대상은 아니지만, 법 문구가 "카지노식 시뮬레이션"까지 넓을 수 있어 확인이 필요하다 [15].

---

## 1. 슬롯 형식 트렌드

### 1.1 대표작 비교표

| 대표작 (공급사) | 격자 · 지불 | 핵심 피처 | 최대 배수 | 변동성 / RTP | 출처 |
|---|---|---|---|---|---|
| Gates of Olympus 1000 (Pragmatic) | 6×5 · 어디서나 지불(pay anywhere) | 텀블, 오브 배수 최대 1000x를 합산해 적용 | 15,000x | 매우 높음(OLBG) / 96.5% | [1][2] |
| Sweet Bonanza 1000 (Pragmatic) | 6×5 · 어디서나 지불 | 텀블, 프리스핀 중 레인보우 봄 배수 최대 1000x | 25,000x | 매우 높음 / 96.53% | [1][2] |
| Sugar Rush 1000 (Pragmatic) | 클러스터 지불(격자 크기 확인 못함) | 클러스터 지불, 배수 칸 최대 1024x, 프리스핀 중 고정 배수 | 25,000x | 매우 높음(OLBG) 또는 높음(GamesHub) / 96.53%, 히트율 26.40% | [1][2][16] |
| Gates of Olympus Super Scatter (Pragmatic) | 6×5 · 어디서나 지불 | 슈퍼 스캐터 | 50,000x | 높음 / 96.5% | [3] |
| Big Bass Bonanza 1000 (Pragmatic) | 확인 못함 | 물고기 머니 심볼 최대 1,000x bet, 4번째 어부 와일드마다 추가 스핀 | 20,000x | 매우 높음 / 96.51% | [2] |
| Wanted Dead or a Wild (Hacksaw) | 확인 못함 | 피처 확인 못함 | 12,500x | 확인 못함 | [6] |
| San Quentin xWays (Nolimit City) | 확인 못함 | xWays, xNudge 계열 | 150,000x | 확인 못함 | [4] |
| San Quentin 2: Death Row (Nolimit City) | 확인 못함 | 확인 못함 | 200,000x | 확인 못함 | [5] |
| Huff N' More Puff (Light & Wonder) | 확인 못함 | 홀드 앤 스핀 계열, 시리즈 12개 버전이 한 운영사에 등록 | 확인 못함 | 높음(출처 표현) | [17][18] |
| Dragon Train (Light & Wonder) | 확인 못함 | 북미 카지노 도입 단계 | 확인 못함 | 확인 못함 | [19] |

확인 못함 항목: Push Gaming과 Big Time Gaming 대표작의 2025~2026 수치는 이번 조사에서 출처를 찾지 못했다. Megaways의 최대 당첨은 한 매체가 10,000x~50,000x 범위로 소개한다 [20](제휴 매체).

### 1.2 격자와 지불 방식 분포

- **출시작 비중 통계는 확인 못함.** 어느 방식이 몇 %인지 말해주는 데이터셋은 찾지 못했다. 아래는 정성적 흐름이다.
- 클러스터, 캐스케이드, 홀드 앤 윈이 주류이고, 핵심 흐름은 "한 게임에 여러 방식을 섞는 것"이다 [20][21].
- Megaways는 최대 117,649 ways가 대표 규모로 소개된다 [21]. 한편 스웨덴 매체는 2025년 5월에 "Megaways 열기가 식고 있다"고 보도했다(본문 미확인, 제목만 확인) [22].
- 추정: 우리 10종 구성(5×3 라인, ways, 6×5 클러스터)은 시장 주류 격자를 대부분 덮는다. 빠진 것은 Megaways류 가변 릴이다. 다만 세로 화면에서는 가변 릴이 화면을 많이 쓰므로 우선순위는 낮다.

### 1.3 핵심 피처 트렌드

| 피처 | 요즘 상황 | 우리 보유 | 출처 |
|---|---|---|---|
| 텀블 / 캐스케이드 | 1000 시리즈의 기본 골격 | 있음(클러스터) | [2] |
| 랜덤 배수(오브/봄) | 최대 1000x 표기가 마케팅 문구가 됨 | 있음(배수 사다리). 오브형 "누적 합산 배수"는 없음 | [2] |
| 홀드 앤 윈 / 코인 컬렉트 | 소셜 카지노·육상 카지노 모두 주류. L&W Huff N' Puff 시리즈가 2025 인기 목록 1위 | 있음 | [17][18] |
| 슈퍼 스캐터 | Pragmatic 신작 계열, 최대 50,000x | 없음 | [3] |
| 보너스 바이 | 영국은 보너스 바이를 규제 대상으로 보도한 매체가 있으나 공식 문구 확인 못함 | 없음(가상 코인이라 도입 여부는 정책 결정) | [23] |
| xWays / xNudge | Nolimit City 시그니처, 최대 배수 150,000x대 | 없음 | [4] |
| 미스터리 심볼, 확장 와일드, 갬블 | 구형이지만 클래식 라인 게임 필수 | 있음 | 내부 카탈로그 |

보너스 바이 주의: 한 요약 검색 결과에서 "UKGC가 2019년에 보너스 바이를 제거시켰다"는 주장과 "2026년 패키지에 포함된다"는 주장이 충돌했다. 어느 쪽도 공식 문서로 확인하지 못했으므로 단정하지 않는다 [23].

---

## 2. 변동성과 회차 길이

### 2.1 변동성 경향

- Pragmatic의 1000 시리즈는 대부분 "매우 높음" 변동성이다. 16개 게임 중 중간(Medium) 변동성은 Lucky Tiger 1000, The Dog House Megaways 1000, Big Bass Vegas 1000, Big Bass Halloween Splash 1000 4개뿐이다 [2].
- 같은 시리즈 안에서도 최대 배수는 10,000x(Wisdom of Athena 1000, Freya 1000)부터 25,000x까지 퍼져 있다 [2].
- 최대 배수 달성 확률은 극단적이다. Sweet Bonanza 1000은 7,142만 8,571분의 1(1 in 71,428,571) [1], Gates of Olympus Super Scatter는 6억 6,666만 6,667분의 1로 소개된다 [3].
- 히트율(당첨이 한 번이라도 나오는 비율)은 Sugar Rush 1000이 26.40%로 표기된다 [16]. 다른 게임 히트율은 확인 못함.
- 추정: 최대 배수가 5,000x에서 25,000x 이상으로 올라간 흐름은 "방송·쇼츠에 올라올 큰 장면"을 만들려는 마케팅 목적이 크다. 가상 코인만 쓰는 우리 허브는 큰 배수보다 "작은 승리의 빈도와 연출"이 체감 재미를 더 좌우한다(추정).

### 2.2 세션 길이와 스핀 속도

| 지표 | 값 | 비고 | 출처 |
|---|---|---|---|
| 미국 모바일 소셜 카지노 평균 세션 | 약 57분 | SuperData 2017, 오래됨 | [24] |
| 미국 PC 세션 | 약 69분 | 같은 자료 | [24] |
| 유럽 슬롯 플랫폼 평균 세션 | 약 47분 | SpinArena 2024, 한 플랫폼 | [24] |
| 상위 소셜 카지노 평균 세션 | 최대 약 40분 | GameAnalytics 2025 갱신, 연도 불명 벤치마크 | [7] |
| 일반 모바일 게임 평균 세션 | 7분 6초 | Flurry 2017 | [24] |
| 일 세션 수 | 확인 못함 | 최신 출처 없음 | - |
| 스핀당 시간 | 영국 최소 2.5초(규제값). 실제 평균은 확인 못함 | | [14] |

세션 길이 수치는 서로 모집단과 연도가 달라 한 줄로 합치지 말아야 한다. 대략 "소셜 카지노 한 회 40~60분, 일반 모바일 게임보다 훨씬 길다" 정도만 말할 수 있다.

---

## 3. 소셜 카지노 메타 루프

### 3.1 시장 규모와 실적

| 항목 | 값 | 출처 |
|---|---|---|
| 2025 시장 규모 추정 | $7.82B(Emergen), $7.8B(MarketIntelo), $8.36B(Mordor). 조사사마다 다름 | [25] |
| Huuuge 2025 매출 | $235.6M (-6.1%), 조정 EBITDA $96.0M, 직접결제(D2C) $61.8M로 약 2배 | [8] |
| Huuuge 핵심 2종 DAU | 2025 평균 282.1k (2024: 320.5k, 약 -12%) | [8] |
| Huuuge 핵심 2종 1인당 매출(일) | $2.3 (+약 8%) | [8] |
| Playtika 2025 3분기 | 매출 $674.6M (+8.7% YoY), D2C 매출 $209.3M, 일 결제자 354K, ARPDAU $0.89 | [10] |
| Playtika DAU | 약 8.2M(PocketGamer.biz, 2차 출처) | [26] |
| Playstudios 2025 3분기 | 매출 $57.6M(전년 $71.2M), DAU 2.2M, MAU 9.5M, ARPDAU $0.28, 순손실 $9.1M | [9] |
| 업계 전망 | 2025 소셜 카지노 약 -5.5% 감소 예상(Huuuge 자료 인용) | [27] |
| Monopoly GO | Sensor Tower 기준 누적 인앱결제 $60억 돌파(소셜 카지노는 아니고 비교용) | [28] |
| Scopely | 누적 매출 $150억. 매출의 약 80%가 12개월 이상 플레이한 이용자에서 나옴 | [29] |

해석(추정): 시장은 "덜 사람, 더 많이 쓰는 사람" 구조다. 앱스토어 수수료를 피하는 직접결제(D2C) 비중이 커지고 있다 [8][10]. 텔레그램 미니앱은 Stars 결제를 쓰므로 이 흐름과는 다른 길이다(4장).

### 3.2 리텐션 기준

- 상위 카지노 게임: D1 40%+, D7 약 20%, D28 약 15%. 결제자당 매출(ARPPU) $35+. 출처는 2018년 벤치마크를 인용한 GameAnalytics 글이다 [7].
- 2025~2026 소셜 카지노 D1/D7/D30 최신 수치는 확인 못함(Sensor Tower, Eilers & Krejcik 유료 보고서 영역).

### 3.3 앱별 메타 루프 비교표

| 앱 | 확인된 메타 요소 | 비고 | 출처 |
|---|---|---|---|
| Slotomania (Playtika) | 로열티 7단계(브론즈~블랙 다이아), 난이도별 진행 시스템, SlotoClans(클랜), 코인·카드 선물 | 카드 앨범·시즌패스 세부는 확인 못함 | [7][30] |
| Huuuge Casino | Billionaire League(순위 기반 리그, 클럽 이벤트, 리그 점수), 클럽 만들기·가입, 주간 플레이오프 | 클럽원 도우면 보상 | [7] |
| DoubleDown | 특정 단계에서 미니게임 발동 | 세부 확인 못함 | [7] |
| Zynga 계열 | 초대 가입 시 $1 상당 코인(추천 보상) | 2025년 현재 유효 여부 확인 못함 | [7] |
| Coin Master (Moon Active) | 슬롯 1종을 돌려 코인을 얻고, 그 코인으로 마을을 짓고 다음 마을로 넘어간다. 슬롯 결과로 다른 이용자 마을을 공격·약탈한다. 하루 스핀 수 제한(시간 충전) + 소셜 링크·이벤트로 무료 스핀. 상자에서 카드가 나오고 세트를 채우면 스핀·펫 알을 준다. 기간 한정 카드 이벤트(Set Blast) | 슬롯이 «목적»이 아니라 «메타 진행의 연료». 펫 배수 등 세부 수치는 출처끼리 엇갈려 확인 못함 | [37] |
| House of Fun, Jackpot Party, Cashman | 확인 못함 | | - |

사회적 유대와 리텐션: 한 글은 "친구가 있는 코호트는 60일 리텐션이 25~40% 높고 ARPU가 12~18% 높다"고 하지만 근거 출처가 불분명해 참고만 한다 [30].

### 3.4 라이브옵스 주기

- 주간 플레이오프를 "습관을 만드는 장치"로 소개한 자료가 있다 [7].
- 이벤트 주기(일/주/시즌) 표준 수치는 확인 못함.
- 추정: 우리 허브의 일 보너스(24시간)와 4시간 보너스는 "일 단위 복귀 이유 + 하루 안 재방문 이유"를 이미 둘 다 만든 구조다.

---

## 4. 텔레그램 미니앱 리텐션 장치

### 4.1 확인된 수치

| 항목 | 값 | 출처 |
|---|---|---|
| 텔레그램 게임 리텐션(2024 Q4) | 약 5~20% (전통 게임 기준 20~30%) | [11] |
| Hamster Kombat 이용자 | Helika: 8월 3억 → 11월 4,100만. 개발팀은 3억이 누적 플레이어 수라고 반박하며 최대 월 활성 1.55억 이상이라고 주장 | [11] |
| Notcoin | 3,500만 플레이어(2024), 5월 에어드롭 | [31] |
| Catizen | 인앱결제 약 $2,700만(2024 기준 보도) | [31] |
| 가짜 계정 비중(추정) | Hamster 최고점에서 30~50%(저자 추정, 블로그) | [13] |
| 소형 클론 | 90% 이상 폐쇄 또는 휴면(저자 추정, 블로그) | [13] |
| ARPU | Helika: "변동 크고 낮음". 수치 없음 | [11] |
| Hamster 장기 잔존 | 1~5% 리텐션이어도 큰 모수라 수백만 명(저자 추정) | [13] |

D30 리텐션 정확값은 확인 못함. 위 5~20%는 4분기 전체 평균이며 D30 값이 아니다 [11].

### 4.2 장치별 정리

| 장치 | 근거 수준 | 비고 |
|---|---|---|
| 데일리 체크인 스트릭 | 일반 지식. 이번 조사에서 개별 게임 수치 확인 못함 | 우리 일 보너스와 같은 계열 |
| 레퍼럴(친구 초대) | 레퍼럴 링크가 텔레그램 채널에 넘쳐난다는 정성 서술만 확인 [13] | 에어드롭이 동력일 때 가짜 계정 문제가 큼 |
| 채널 구독 과제 | 확인 못함 | |
| 에너지(탭 충전 타이머) | 확인 못함. 우리 4시간 보너스가 유사 역할 | |
| Stars 결제 | 2024년 6월 도입. 디지털 상품은 Stars 필수로 설명됨. 앱스토어 30%는 Stars 구매 시점에 빠지고, Stars 광고 재투자 시 실질 수수료가 0에 가까워진다고 Durov가 설명 | [32] |
| 봇 푸시 알림 | 확인 못함 | |
| 리더보드, 클랜 | 정성 서술만. 수치 확인 못함 | |
| Catizen의 성공 요인 | 첫날부터 리텐션 장치가 설계에 들어 있었고, 클리커가 아닌 다기능 캐주얼 게임이라 에어드롭 뒤에도 남았다(블로그 분석) | [12][13] |

해석(추정): 텔레그램 게임의 붕괴는 "보상 기대(에어드롭)가 유일한 이유였던 이용자"가 빠진 것이다. 현금화가 없는 우리 허브는 처음부터 그 이용자층을 모으지 못하므로 수치는 작아도 거품은 없다. 대신 재방문 이유를 게임 안에서 만들어야 한다.

Stars 주의: Stars 약관은 미니앱이 디지털 상품을 Stars로 팔 수 있고, 약관 위반 시 텔레그램이 Stars 사용을 제한할 수 있다고만 적는다. 봇 개발자 약관은 적용 법령과 Apple·Google 가이드라인을 따르라고 요구한다 [38]. 카지노형 게임을 명시적으로 허용하거나 금지하는 조항은 이번 조사에서 확인 못함. Apple은 소셜 카지노 앱에 17+ 등급을 요구하므로 [36], 코인 판매를 붙이기 전에 약관 원문을 다시 확인해야 한다.

---

## 5. 규제와 책임 설계

### 5.1 영국 UKGC 온라인 슬롯 설계 규칙 (2021)

공식 발표(2021-02-02), 2021-10-31까지 전면 적용 [14].

| 규칙 | 내용 |
|---|---|
| 최소 한 판 시간 | 2.5초보다 빠른 스핀 금지 |
| 오토플레이 | 금지 (플레이 감각을 잃기 때문) |
| 속도 높이는 기능 | 금지 (터보 모드, 슬램 스톱 등. 공식 페이지는 "속도를 높이거나 통제감 착각을 주는 기능"이라고만 표현) |
| 손실 위장 당첨(LDW) | 판돈 이하 반환인데 당첨처럼 보이게 하는 소리·영상 금지 |
| 세션 표시 | 세션 중 누적 손익과 경과 시간 표시 |

2.5초 기준은 육상 B3 기기 표준에서 가져온 것이며 "2.5초가 안전한 속도"라는 주장은 아니라고 위원회가 밝혔다 [33].

2025~2026 영국 후속: 프로모션 규칙(복수 상품 혼합 보너스 금지, 롤오버 10배 상한)이 2026-01-19 시행 [23]. 일부 매체는 12월 19일로 적어 날짜가 엇갈린다 [23].

### 5.2 미국 스윕스테이크 금지 흐름

- 2025년 5개 주(코네티컷, 몬태나, 뉴저지, 캘리포니아, 뉴욕), 2026년 4개 주(인디애나, 메인, 오클라호마, 아이오와)가 입법을 마쳤다. 테네시, 메릴랜드, 미네소타, 버지니아, 루이지애나가 계류 중이다(2026년 5월 기준) [15].
- 캘리포니아 AB 831은 2026-01-01 시행이며 공급 업체까지 책임을 확대했다 [34]. 뉴욕 SB 5935는 2025년 12월 서명, 위반당 최대 $100,000 [35].
- 금지 대상은 가상 화폐를 현금이나 상품으로 바꿀 수 있는 이중 화폐 모델이다. 현금 환전 없는 순수 소셜 카지노가 포함되는지는 Venable 글이 다루지 않았다. 메인주의 "카지노식 시뮬레이션" 표현이 넓을 수 있다 [15].
- 목록은 출처마다 다르므로 주별 법 원문 확인이 필요하다 [34][35].

### 5.3 앱스토어와 미성년자

- Apple: 소셜 카지노 앱은 전 지역 17+ 등급(2019년부터). 호주는 별도 R18+, 한국은 최소 19세, 브라질은 A18 등급 [36].
- Google Play: 한 정책 문서는 "시뮬레이션 도박 콘텐츠(소셜 카지노, 가상 슬롯머신)를 제공하면 안 된다"고 적는다. 다만 이 문구가 광고주 정책 페이지 것인지 앱 게시 정책 것인지 명확하지 않다(추정: 앱 게시 정책 쪽 문구와 다름). 앱이 아닌 텔레그램 안에서 돌아가는 우리에게 직접 적용되는지는 확인 못함 [36].
- 2025년 9월 말, 캘리포니아 연방법원이 Apple, Google, Meta가 카지노풍 앱으로 불법 도박을 홍보했다는 소송을 기각하지 않았다는 보도가 있다 [36].
- 자기 제한(self-exclusion) 도구 사례는 이번 조사에서 확인 못함.

---

## 6. 우리 허브에 주는 시사점

### 6.1 이미 있는 것

- 레벨바, 미션, 리더보드, 잭팟바, 일/4시간/구제 보너스: 소셜 카지노 메타의 기본 골격은 갖췄다 [7].
- 피처: 텀블+배수 사다리, 홀드 앤 윈형 코인 리스핀, 확장 와일드+갬블, 말판·룰렛 보너스.
- 현금 환전 없음: 스윕스테이크 금지의 직접 대상이 아닌 구조 [15].

### 6.2 없는 것 (우선순위는 추정)

| 항목 | 근거 | 우선순위(추정) |
|---|---|---|
| 클럽 / 클랜 (선물, 협동 목표) | Slotomania·Huuuge 모두 핵심 사회 장치 [7][30] | 높음. 텔레그램은 그룹이 기본 기능이라 궁합이 좋다 |
| 리그 (등급별 주간 순위) | Huuuge Billionaire League [7] | 중간. 기존 리더보드를 등급제로 확장 |
| 컬렉션 / 카드 앨범 | Slotomania 카드 선물이 확인됨, 앨범 세부는 확인 못함 [30] | 중간 |
| 주간 이벤트 주기(플레이오프) | [7] | 중간 |
| 친구 초대 | Zynga 사례 [7]. 텔레그램은 공유가 쉽다 | 중간. 가짜 계정 방지 필요 [13] |
| 오브형 "누적 합산 배수" | 1000 시리즈의 핵심 [2] | 낮음~중간. 클러스터 게임 1종에 시험 가능 |
| 세션 요약 표시(시간·손익) | UKGC 규칙 [14] | 높음. 구현 비용 작고 책임 설계 근거가 됨 |
| 스핀 최소 간격, 오토플레이 제한 | UKGC [14] | 정책 결정. 현금 없는 게임이라 필수는 아님 |
| 슈퍼 스캐터, xWays | [3][4] | 낮음 |
| 보너스 바이 | 규제 근거 불명확 [23] | 정책 결정 필요 |

### 6.3 조심할 점

- 텔레그램은 푸시 알림으로 재방문을 이끌 수 있지만 수치 근거는 확인 못했다. 알림 빈도는 보수적으로 시작할 것.
- Stars로 코인을 팔기 전 텔레그램 도박성 콘텐츠 정책을 공식 문서로 확인할 것 [32].
- 만 19세(한국), 17+(Apple) 등 연령 기준이 지역마다 다르니 최소 연령 안내 문구를 둘 것 [36].

---

## 확인 못한 주요 수치

- 소셜 카지노 2025~2026 D1/D7/D30 리텐션, 일 세션 수, 현재 평균 세션 길이
- 슬롯 격자·지불 방식별 출시작 비중
- Push Gaming, Big Time Gaming, Dragon Train의 구체 수치
- Hacksaw, Nolimit City 변동성/RTP
- 텔레그램 게임 개별 D30 리텐션(Hamster, Notcoin, Catizen), 데일리 스트릭·레퍼럴·채널 구독 과제 효과 수치
- Coin Master, House of Fun, Jackpot Party, Cashman 메타 세부와 수치
- 영국 보너스 바이 공식 규제 문구
- 텔레그램 도박성 미니앱의 Stars 결제 정책
- Playtika, Eilers & Krejcik, Sensor Tower 소셜 카지노 장르 전체 매출(유료 보고서)

---

## 출처 목록

[1] OLBG, 1000 슬롯 시리즈 개요와 게임별 수치 - https://www.olbg.com/slots/articles/1000-slots-series , https://www.olbg.com/slots/games/sweet-bonanza-1000
[2] OLBG 1000 시리즈 표(RTP, 변동성, 최대 배수) - https://www.olbg.com/slots/articles/1000-slots-series
[3] OLBG, Gates of Olympus Super Scatter 50,000x - https://www.olbg.com/news/gates-olympus-super-scatter-slot-unleashes-50000x-max-wins , https://www.olbg.com/slots/games/gates-of-olympus-super-scatter
[4] OLBG, San Quentin xWays 150,000x - https://www.olbg.com/slots/games/san-quentin-xways , https://www.racingpost.com/online-casino/slots/san-quentin/
[5] Sigma, San Quentin 2 - https://sigma.world/play/games/nolimit-city/san-quentin-2/
[6] Sigma, Wanted Dead or a Wild 12,500x - https://sigma.world/play/games/hacksaw-gaming/wanted-dead-or-a-wild/ , https://slotcatalog.com/en/slots/Wanted-Dead-or-a-Wild
[7] GameAnalytics, 소셜 카지노 메타 피처(2025-02-26 갱신) - https://www.gameanalytics.com/blog/meta-features-social-casino-games
[8] Huuuge FY2025 결과 - https://ir.huuugegames.com/en/news/huuuge-inc-announces-fy-q4-2025-financial-results , https://ir.huuugegames.com/en/download/651/huuuge-inc-q4-2025-eng-press-release-pdf
[9] Playstudios 2025 3분기 - https://ir.playstudios.com/news-events/press-releases/detail/97/playstudios-inc-announces-third-quarter-results
[10] Playtika 2025 3분기 - https://investors.playtika.com/news-releases/news-release-details/playtika-holding-corp-reports-q3-2025-financial-results/ , https://www.sec.gov/Archives/edgar/data/1828016/000182801625000048/playtika-20250930.htm
[11] The Block, Helika 2024 4분기 보고서 - https://www.theblock.co/news/web3/2025-02-07-telegram-games-had-trouble-earning-revenue-retaining-users-in-q4-report-339563
[12] DEV Community, Catizen - https://dev.to/ton-adoption/catizen-and-the-second-generation-of-ton-mini-apps-1849 (블로그)
[13] DEV Community, 탭 투 언 이후 생존 - https://dev.to/ton-adoption/tap-to-earn-after-hamster-kombat-what-survived-in-2026-531c (블로그, 저자 추정)
[14] 영국 도박위원회 발표 - https://www.gamblingcommission.gov.uk/news/article/gambling-commission-announces-package-of-changes-which-make-online-games , https://sbcnews.co.uk/europe/uk/2021/02/02/ukgc-bans-online-slots-autoplay-and-quickspin-features/
[15] Venable, 스윕스테이크 단속 확대(2026-05) - https://www.venable.com/insights/publications/2026/05/states-escalate-crackdown-on-sweepstakes-casinos
[16] GamesHub, Sugar Rush 1000 - https://www.gameshub.com/?p=2797456
[17] Bonus.com, 2025 가장 많이 플레이한 슬롯 - https://www.bonus.com/news/slot-ify-wrapped-our-most-played-slots-of-2025/
[18] Casinos.com, Huff N' Puff - https://www.casinos.com/us/news/downtown-grand-unveils-wolf-den-with-launch-of-new-huff-n-puff
[19] Indian Gaming, Dragon Train 북미 도입 - https://www.indiangaming.com/light-wonders-dragon-train-slots-make-north-american-debut-at-pechanga/
[20] Techround, 슬롯 트렌드 - https://techround.co.uk/other/how-online-slot-industry-changes-tech-with-trends/
[21] European Gaming, 2026 인기 슬롯 메커닉 - https://europeangaming.eu/portal/most-popular-slot-mechanics/ (직접 열람 실패, 검색 요약만 사용)
[22] CasinoBeats, Megaways 열기 감소(스웨덴어, 제목만 확인) - https://casinobeats.com/se/2025/05/12/megaways-hypen-pa-vag-att-avta/
[23] 영국 프로모션 규칙 - https://www.gamblingcommission.gov.uk/news/article/gambling-promotions-to-be-safer-and-simpler , https://www.olbg.com/news/new-ukgc-bonus-rules-ban-cross-product-promotions-january-19
[24] 세션 길이 - https://www.pocketgamer.biz/superdata-social-casino-report-2017/ , https://techcrunch.com/2017/06/21/mobile-gaming-sessions-down-10-percent-year-over-year-but-revenue-climbs , https://www.optimove.com/blog/social-casino-web-vs-mobile (SpinArena 수치는 검색 요약에서 인용, 원문 URL 확인 못함)
[25] 시장 규모 - https://www.emergenresearch.com/industry-report/social-casino-market , https://marketintelo.com/report/social-casino-market , https://www.mordorintelligence.com/industry-reports/social-casino-market
[26] PocketGamer.biz, Playtika DAU - https://www.pocketgamer.biz/playtikas-dtc-revenue-rises-20-as-superplay-secures-new-disney-collab
[27] Huuuge 3분기 실적 자료 - https://investgame.net/news/pdf/huuuge-games-fy2025-q3-earnings-release/
[28] Sensor Tower, Monopoly GO - https://sensortower.com/blog/monopoly-go-app-revenue-milestone
[29] Scopely 관련 - https://mobilegamer.biz/data-digest-scopely-hits-10bn-hybridcasual-deep-dive-destiny-risings-10m-pre-reg-more/ , https://respawn.outlookindia.com/amp/story/gaming/gaming-news/scopely-reaches-15-billion-lifetime-revenue-as-it-marks-15-years
[30] GamesBeat, Slotomania 장수 비결 - https://gamesbeat.com/reunions-and-new-best-friends-the-secret-to-slotomanias-longevity ; 60일 리텐션 수치는 https://techyorker.com/?p=661792 (근거 불분명)
[31] Decrypt, 탭 투 언 현황(2024-09-15, 기고문) - https://decrypt.co/249433/telegrams-tap-to-earn-gaming-craze-falling-short
[32] Telegram Stars - https://telegram.org/blog/telegram-stars , https://www.theblock.co/post/298954/telegram-launches-digital-mini-app-payment-system-telegram-stars
[33] 영국 도박위원회 상담 응답 - https://www.gamblingcommission.gov.uk/consultation-response/online-games-design-and-reverse-withdrawals/ogdrw-introduction
[34] ZwillGen, 캘리포니아 AB 831 - https://www.zwillgen.com/gaming/californias-ab-831-bans-sweepstakes-casinos-expands-liability-vendors/
[35] Covers, 뉴욕 금지법 - https://www.covers.com/industry/new-york-officially-ban-sweepstakes-casinos-hochul-sign-bill-december-2025
[36] Apple 17+ 등급과 Google Play 정책 - https://igamingbusiness.com/tech-innovation/apple-to-impose-17-age-limit-for-social-casino-apps/ , https://support.google.com/googleplay/android-developer/answer/9877032?hl=en , https://www.nashuatelegraph.com/news/2026/01/16/as-gambling-apps-grow-attention-turns-to-app-store-guidelines/
[37] Coin Master 개요와 스토어 설명 - https://en.wikipedia.org/wiki/Coin_Master , https://apps.apple.com/us/app/coin-master/id406889139
[38] 텔레그램 Stars 약관·봇 개발자 약관 - https://telegram.org/tos/stars , https://telegram.org/tos/bot-developers
