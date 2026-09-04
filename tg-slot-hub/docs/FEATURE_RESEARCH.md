# 슬롯 보너스 피처 리서치 (프리스핀 이외)

> 목적: 텔레그램 미니앱 소셜 카지노 슬롯 허브(가상 코인 전용, 환전 불가, 모바일 세로 화면, 서버 권위 수학, provably-fair 시드 RNG)에 신규 게임을 기획하기 위해 업계 전반의 보너스 피처를 조사·정리한다.
> 신뢰도 표기: ✓ = 공식 프로바이더/평판 있는 리뷰 사이트 다수 교차 확인, ~ = 리뷰/블로그 단일 소스, 추정치는 본문에 "(추정)"으로 명시.
> **카탈로그 매핑 근거**: 4절의 매핑과 5절의 신규 컨셉은 팀리드가 전달한 `docs/GAME_CATALOG.md` §2 #6~#12 요약(및 기구현 게임 classic-777/fruit-fiesta/royal-diamond-777/sheriff-sixgun/shiba-shrine 목록)을 기준으로 작성했다.

---

## 1. 조사 요약

- **탐색 범위**: 웹(프로바이더 공식 페이지 + 슬롯 리뷰 매체) 중심, 논문 탐색 대상 아님
- **주요 소스**: Pragmatic Play, NetEnt, Big Time Gaming, Nolimit City, Relax Gaming, Push Gaming, Play'n GO, Hacksaw Gaming, Aristocrat/IGT(랜드베이스), Slotomania/DoubleDown(소셜카지노), SlotCatalog/AboutSlots/BigWinBoard 등 리뷰 매체
- **탐색 쿼리 수**: 20개 이상 (기능별 개별 쿼리)
- **핵심 인사이트**:
  1. 대다수 인기 피처는 "당첨 확률을 인위적으로 늘리는 장치"가 아니라 "당첨을 시각적으로 지연·누적시켜 서스펜스를 만드는 장치"다. RTP는 결국 심볼 확률표로 결정되고, 피처는 그 확률표가 지급되는 **경로**를 다양화할 뿐이다.
  2. Hold & Spin류(코인 컬렉트)와 캐스케이드류(텀블/클러스터)가 현재 시장에서 가장 광범위하게 재사용되는 두 축이며, 둘 다 "리스핀 카운터 리셋"이라는 동일한 서스펜스 구조를 공유한다.
  3. 가상 코인/환전 불가 맥락에서는 실제 화폐형 프로그레시브 잭팟(Must-hit-by 등)을 그대로 가져올 수 없다. "가상 잭팟 미터"로 각색해야 하며, 이는 소셜 카지노(Slotomania 등)가 이미 VIP 티어·이벤트로 대체한 패턴과 일치한다.
  4. Nolimit City류(xWays/xNudge)와 Megaways는 수학적으로는 인상적이지만 구현 복잡도가 매우 높다(가변 릴 높이/가변 심볼 스택을 RNG·페이테이블 계산에 실시간 반영). 자체 엔진에 새 RoundState 타입을 요구할 가능성이 크다.
  5. 실제 카탈로그(4절)를 대조해보면, 계획된 7개 게임과 기구현 5개 게임이 이미 업계 핵심 피처의 상당수(클러스터, 텀블, 페이-애니웨어, 멀티플라이어 오브, ways, 스티키/워킹/익스팬딩 와일드, 미스터리 심볼, 홀드&스핀, 보너스 휠, 라운드 내 진행 미터, 픽미, 리트리거, 바이 피처, 갬블)를 이미 포괄하고 있다. 신규 게임은 **아직 안 쓰인 피처**(메가웨이즈형 가변 릴, 트윈 릴, 트레일/보드, xWays 스택, 세션 이월 진행)로 차별화하는 편이 중복을 피한다.

---

## 2. 피처 상세 카탈로그

### 2.1 홀드 앤 스핀 / 코인 컬렉트 리스핀 (Lightning Link 계열)
- **메커니즘**: 그리드(보통 5×3=15칸)에 코인 심볼이 6개 이상 랜딩하면 코인이 잠기고 남은 칸에 3회 리스핀이 주어진다. 새 코인이 하나라도 추가로 랜딩하면 리스핀 카운터가 다시 3으로 리셋된다. 코인마다 배당값(1x~1000x) 또는 잭팟 등급(미니/마이너/메이저/그랜드) 라벨이 붙는다. 화면을 코인으로 전부 채우면 그랜드가 자동 지급된다.
- **대표 게임**: Lightning Link(Aristocrat), Dragon Link(Aristocrat), 88 Fortunes(SG), Money Link: Egyptian Riches(Lightning Box)
- **매력 포인트**: "몇 번 더 버틸까"라는 리스핀 리셋의 서스펜스 + 화면을 다 채우면 확정 대박이라는 명확한 목표
- **수학/RTP**: 코인 등장 확률과 코인 값 분포로 전체 기여 RTP를 세밀하게 배분 가능. 통상 고변동성, 히트빈도는 낮지만(진입 자체가 드묾) 진입 후 세션 길이가 김
- **구현 복잡도**: **L** — 별도 RoundState(잠금 그리드+리스핀 카운터+누적 합산), RNG는 스핀마다 "코인 추가 랜딩 여부"를 별도 소비, 렌더러는 코인 잠금/카운터 애니메이션 필요, 허브 UI에는 별도 잭팟 미터 표시 필요
- **권장**: **각색 채택** — 카탈로그 #9 kraken-cove가 이미 이 피처를 채택함(라인 66 + 홀드&스핀 28.5, 잭팟 포함)

### 2.2 캐스케이드 / 텀블 (Avalanche 계열)
- **메커니즘**: 당첨 심볼이 폭발/소멸하고 빈 자리에 위쪽에서 새 심볼이 떨어진다. 연쇄 당첨이 없을 때까지 반복. Gonzo's Quest는 연속 텀블마다 배수를 1x→2x→3x→5x로 올린다.
- **대표 게임**: Gonzo's Quest(NetEnt), Sweet Bonanza(Pragmatic Play), Reactoonz(Play'n GO)
- **매력 포인트**: 한 번의 스핀이 "끝났다 싶으면 또 터지는" 연쇄감을 줌. 시각적으로 화려해 짧은 세션에도 만족감이 큼
- **수학/RTP**: 페이라인 대신 심볼 확률표만 조정하면 되므로 RTP 통제가 상대적으로 쉬움. 중~고변동성으로 튜닝하기 좋음
- **구현 복잡도**: **M** — 이미 그리드/당첨 판정 로직이 있다면 "당첨 후 재판정 루프"만 추가하면 됨. RNG는 매 캐스케이드 단계마다 신규 심볼을 소비. 렌더러는 폭발+낙하 애니메이션 필요
- **권장**: **채택** — 카탈로그 #6 candy-cluster-pop, #7 olympus-nectar가 이미 채택함

### 2.3 클러스터 페이 (Cluster Pays)
- **메커니즘**: 페이라인 대신 인접(상하좌우)한 동일 심볼 5개 이상이 뭉치면 당첨. 보통 7×7 또는 8×8의 큰 그리드에서 사용
- **대표 게임**: Reactoonz(7×7), Jammin' Jars(8×8, Push Gaming)
- **매력 포인트**: 페이라인 개념이 없어 규칙이 직관적("모이면 이긴다"), 큰 그리드가 주는 시각적 풍성함
- **수학/RTP**: 클러스터 크기별 배당 테이블 설계가 필요(작은 클러스터는 자주, 큰 클러스터는 드물게). 캐스케이드와 결합되는 경우가 많아 사실상 세트로 다뤄짐
- **구현 복잡도**: **M** — 페이라인 판정 대신 플러드필(flood-fill) 알고리즘으로 인접 그룹 탐색하는 새 당첨 판정 모듈 필요. 렌더러/RNG 자체는 캐스케이드와 공유 가능
- **권장**: **채택** — 카탈로그 #6 candy-cluster-pop이 이미 채택함(6×5 그리드로 축소 적용)

### 2.4 페이-애니웨어 (스캐터 페이)
- **메커니즘**: 릴 위치·페이라인 무관하게 그리드 전체에서 동일 심볼이 규정 개수(보통 8개) 이상이면 당첨. Sweet Bonanza가 대표
- **대표 게임**: Sweet Bonanza(6×5, Pragmatic Play)
- **매력 포인트**: "어디에 떨어지든 상관없다"는 단순함이 캐주얼 유저에게 직관적
- **수학/RTP**: 클러스터 페이와 유사하되 인접성 조건이 없어 판정이 더 단순(개수만 세면 됨). 심볼 개수 임계값으로 RTP 조절
- **구현 복잡도**: **S** — 그리드 내 심볼 개수 카운트만 하면 되므로 클러스터 판정보다 훨씬 단순. 캐스케이드와 결합 시 M로 상승
- **권장**: **채택** — 카탈로그 #7 olympus-nectar가 이미 채택함(8개 이상, 적중률 22% 추정)

### 2.5 멀티플라이어 오브/봄 심볼 (Multiplier Bomb)
- **메커니즘**: 프리스핀 중에만 등장하는 특수 심볼(하트/폭탄 모양)이 배수값(2x~100x)을 달고 랜딩. 텀블 시퀀스가 끝날 때 화면에 남아있는 모든 배수 심볼 값을 **합산**하여 전체 당첨에 곱함
- **대표 게임**: Sweet Bonanza(Pragmatic Play)
- **매력 포인트**: "몇 개나 남았나" 세는 재미 + 합산 방식이라 여러 개가 겹치면 기하급수적으로 커 보이는 임팩트
- **수학/RTP**: 배수 심볼 등장 확률과 값 분포가 프리스핀 RTP 대부분을 차지. 프리스핀 자체는 고변동성 담당 구간으로 설계됨
- **구현 복잡도**: **M** — 배수 심볼을 일반 심볼과 별도 풀에서 뽑고, 캐스케이드 종료 시점에 합산 로직 필요. 캐스케이드 피처가 선행 구현되어 있어야 함
- **권장**: **채택** — 카탈로그 #7 olympus-nectar가 이미 채택함(셀당 5% 등장, 값 2/3/5/10/100 가중 합산)

### 2.6 스티키 와일드 (Sticky Wilds)
- **메커니즘**: 와일드가 랜딩하면 지정된 라운드 수(또는 프리스핀 종료까지) 고정되어 사라지지 않음
- **대표 게임**: 다수의 프리스핀 기반 슬롯 전반
- **매력 포인트**: 회차가 진행될수록 와일드가 쌓여 마지막 스핀이 가장 화려해지는 "빌드업" 구조
- **수학/RTP**: 후반 스핀일수록 당첨 기댓값이 커지므로, 초반 낮은 배당·후반 몰아주기로 변동성을 인위적으로 조절 가능
- **구현 복잡도**: **S** — 그리드에 "고정" 플래그만 추가하면 되는 수준. 기존 스핀 로직 재사용 가능
- **권장**: **채택** — 카탈로그 #8 magi-stella가 이미 채택함(프리스핀 12회 중 와일드 고정 + 리트리거)

### 2.7 워킹/시프팅 와일드 (Walking Wilds)
- **메커니즘**: 와일드가 스핀마다 한 칸씩 좌 또는 우로 이동하다가 릴을 벗어나면 소멸
- **대표 게임**: 다수의 Play'n GO/Pragmatic 프리스핀 슬롯
- **매력 포인트**: 와일드가 "다음엔 어디로 갈까" 예측하는 재미. 스티키 와일드보다 희귀하고 큰 한 방을 만듦
- **수학/RTP**: 이동 경로 전체에서 몇 번의 당첨 기여를 하는지가 기댓값을 결정. 스티키보다 변동성이 큼
- **구현 복잡도**: **M** — 매 스핀 종료 후 와일드 위치를 갱신하는 상태 저장이 필요, 렌더러는 이동 애니메이션 필요
- **권장**: **채택** — 카탈로그 #12 mecha-nova가 이미 채택함(릴 4 등장 → 좌측 이동 + 무료 리스핀)

### 2.8 익스팬딩/스택 와일드 (Expanding & Stacked Wilds)
- **메커니즘**: 와일드가 랜딩한 릴 전체(3~5칸)를 즉시 와일드로 채움. Book of Dead류는 프리스핀 시작 시 무작위 심볼 하나를 "확장 심볼"로 지정해 그 심볼이 나올 때마다 릴 전체를 채운다(미스터리 심볼과 결합된 형태)
- **대표 게임**: Book of Dead(Play'n GO)
- **매력 포인트**: 스티키/워킹보다 즉각적이고 빈도가 잦아 "액션이 계속 일어난다"는 체감을 줌
- **수학/RTP**: 확장 빈도가 높은 대신 개별 임팩트는 스티키보다 작게 설계되는 경우가 많음. 변동성은 중간
- **구현 복잡도**: **S~M** — 단일 릴을 와일드로 채우는 로직은 단순하나, "프리스핀 시작 시 무작위 심볼 지정" 방식은 세션 상태 관리가 하나 더 필요
- **권장**: **채택** — 카탈로그 기구현 sheriff-sixgun이 이미 채택함(확장 와일드 + 더블업 코인)

### 2.9 미스터리/트랜스폼 심볼
- **메커니즘**: 특수 심볼(물음표 등)이 스핀 종료 시 무작위로 다른 심볼 하나로 일괄 변환됨. 그리드 내 모든 미스터리 심볼이 동시에 같은 심볼로 바뀌어 당첨 가능성을 급상승시킴
- **대표 게임**: 다수의 Pragmatic Play 슬롯(예: Wild West Gold), NetEnt 슬롯
- **매력 포인트**: "다 같은 심볼로 바뀌면?" 하는 순간적 기대감. 시각적으로 임팩트가 큼
- **수학/RTP**: 변환 확률표를 별도로 관리(고배당 심볼로 변환될 확률을 낮게)하여 RTP 조절
- **구현 복잡도**: **S** — 그리드 스캔 후 동일 심볼로 치환하는 후처리 단계만 추가하면 됨
- **권장**: **채택** — 카탈로그 기구현 royal-diamond-777이 이미 채택. #10 hanbok-night-market은 "최저 티어 심볼 전체 1단계 승급"이라는 변형(스핀당 8% 확률)으로 재해석해 채택

### 2.10 심볼 업그레이드/컬렉트 미터
- **메커니즘**: 당첨에 참여한 심볼 개수만큼 화면 옆 미터(포탈 미터 등)가 채워지고, 미터가 가득 차면 다음 "레벨"로 진입해 심볼 확장/파괴/업그레이드 같은 효과가 영구 또는 라운드 동안 적용됨
- **대표 게임**: Rich Wilde and the Tome of Madness/Insanity(Play'n GO)
- **매력 포인트**: 단발성 스핀이 아니라 "성장"하는 느낌을 줘 세션 리텐션에 유리. 소셜 카지노의 진행 미터와 궁합이 좋음
- **수학/RTP**: 레벨별 배당 상승폭을 설계해야 하므로 설계 난도는 있지만 RTP 자체는 통제하기 쉬움(단계별 확률표 분리)
- **구현 복잡도**: **M** — 세션 내 누적 카운터 상태 + 레벨별 규칙 테이블 필요. 프리스핀뿐 아니라 세션 간 이월(소셜카지노형)까지 확장하면 서버 영속 저장 필요
- **권장**: **각색 채택** — 카탈로그 #11 idol-stage-live가 라운드 내 버전(응원 미터, 10/25/50 도달 시 배수 2/3/5)으로 이미 채택. **세션을 넘어 이월되는 버전은 아직 없음** → 5.5 신규 컨셉 참고

### 2.11 메가웨이즈 (Megaways)
- **메커니즘**: Big Time Gaming 라이선스 기술로 각 릴이 스핀마다 2~7칸(게임에 따라 그 이상)까지 무작위 높이를 가져, 최대 117,649 way까지 생성. 고정 페이라인이 없다
- **대표 게임**: Bonanza Megaways(BTG), 다수 라이선스 게임(Pragmatic, Blueprint 등)
- **매력 포인트**: 매 스핀 그리드 모양 자체가 달라져 "이번엔 몇 way?"라는 기대감. 초고배당(수천~수만 x) 잠재력이 브랜드 파워를 만듦
- **수학/RTP**: 매우 높은 변동성. RTP는 보통 96%대로 표준이나(추정), 릴 높이 확률 분포 자체가 별도의 확률표로 관리되어야 함
- **구현 복잡도**: **L** — 릴 높이를 매 스핀 RNG로 결정하는 로직, way 수 계산, 배당 산정 로직 모두 신규 설계 필요. 기존 고정 페이라인/고정 ways 엔진과 호환되지 않아 사실상 새 RoundState 타입
- **권장**: **각색 채택(라이트 버전)** — 카탈로그에는 **아직 없음**(#8 magi-stella와 #11, #12는 모두 고정 1024/243 ways). 라이선스 없이 "가변 릴 높이 + ways" 컨셉만 차용한 자체 구현으로 신규 게임화 권장 → 5.1 참고

### 2.12 릴 모디파이어 (랜덤 와일드/추가 로우/릴 넛지)
- **메커니즘**: 스핀 시작 전 또는 종료 후 무작위로 "이번 스핀은 와일드 2개 추가", "이번 스핀은 특정 릴에 로우 1개 추가", "이번 스핀은 릴이 1칸 넛지" 같은 수정자가 적용됨
- **대표 게임**: Nolimit City 다수 게임의 베이스 게임 확률 테이블 일부
- **매력 포인트**: 베이스 게임 자체에 변주를 줘서 "매 스핀이 다르다"는 인상을 강화
- **수학/RTP**: 모디파이어 등장 빈도를 낮게 잡아 베이스 RTP를 소폭 상향하는 용도로 흔히 사용
- **구현 복잡도**: **S~M** — 모디파이어 종류별로 스핀 전/후 훅을 추가. 종류가 늘어날수록 조합 테스트 비용 증가
- **권장**: **각색 채택** — 카탈로그 기구현 shiba-shrine의 "랜덤 와일드"가 이 계열의 단순형(위치 랜덤 삽입)으로 이미 채택됨

### 2.13 보너스 휠 (Wheel Bonus)
- **메커니즘**: 특수 심볼 랜딩 시 화면에 분할된 휠이 등장, 각 구획에 배당값·배수·프리스핀·다음 단계 진입 등이 배정됨. 이중 휠(값 휠 + 배수 휠)을 순차로 돌리는 변형도 있음
- **대표 게임**: Wheel of Fortune(IGT)
- **매력 포인트**: 슬롯 문법을 몰라도 누구나 이해하는 "돌려서 맞으면 좋은 것" 구조 — 캐주얼/비숙련 유저 친화적
- **수학/RTP**: 구획별 확률과 값의 기댓값 합으로 RTP 기여분을 정확히 설계 가능(이산 확률표라 검증이 쉬움)
- **구현 복잡도**: **S~M** — 휠은 독립적인 미니 RNG 이벤트로 취급 가능(그리드 판정과 분리됨). 렌더러 애니메이션(회전+감속)이 별도 필요하나 로직 자체는 단순
- **권장**: **채택** — 카탈로그 #10 hanbok-night-market이 이미 채택함(bonus 심볼 3개, 릴 0·2·4 위치 조건)

### 2.14 픽미 보너스 (Pick'em)
- **메커니즘**: 화면에 여러 오브젝트(상자, 카드 등)를 배치하고 유저가 원하는 만큼 선택. 각 오브젝트 뒤에 배당·배수·추가 픽 기회 등이 숨겨져 있으며, "종료" 오브젝트를 고르면 라운드가 끝남
- **대표 게임**: 다수 프로바이더의 보편적 미니게임 패턴
- **매력 포인트**: 결과가 사전 결정되어 있어도 "내가 골랐다"는 주체감을 줌 — 참여감이 매우 높은 저비용 피처
- **수학/RTP**: 오브젝트별 값 분포와 개수로 기댓값 산정. "종료" 확률을 조절해 평균 픽 횟수(=변동성)를 통제
- **구현 복잡도**: **S** — 서버는 오브젝트 배열을 미리 셔플해 시드로 커밋하고, 유저가 픽할 때마다 순서대로 공개하면 됨(provably-fair 구조와 궁합이 매우 좋음)
- **권장**: **채택** — 카탈로그 #11 idol-stage-live가 이미 채택함(카드 3장 선택형)

### 2.15 트레일/보드 보너스
- **메커니즘**: 주사위(또는 룰렛)를 굴려 나온 수만큼 보드 위 말을 이동시키며, 지나가는 칸마다 코인/배수/추가 이동 등의 이벤트가 발생. 특정 칸(함정)에 걸리면 라운드 종료
- **대표 게임**: Armadillo Goes West류 트레일 보너스, Dead Riders Trail(다수 프로바이더의 보드형 보너스)
- **매력 포인트**: 슬롯 문법을 완전히 벗어나 보드게임적 재미를 주며, "몇 칸까지 갈 수 있을까"라는 진행형 서스펜스가 픽미보다 김
- **수학/RTP**: 함정 칸 밀도와 이동 거리 분포로 평균 라운드 길이(=기댓값)를 정밀 통제. 칸별 값 테이블은 독립적으로 검증 가능
- **구현 복잡도**: **M** — 보드 상태(현재 위치, 방문한 칸, 남은 목숨 등)를 별도 RoundState로 관리해야 하며, 렌더러도 전용 보드 화면이 필요(그리드 화면과 다른 레이아웃)
- **권장**: **채택** — 카탈로그에는 **아직 없음**(#11 idol-stage-live의 픽미와는 구조가 다름) → 5.2 신규 컨셉 참고

### 2.16 잭팟 티어 (미니/마이너/메이저/그랜드, Must-hit-by)
- **메커니즘**: 여러 등급의 잭팟이 동시에 누적되며(보통 미니→마이너→메이저→그랜드 순으로 값이 커지고 히트 빈도는 낮아짐), Must-hit-by 방식은 각 티어가 반드시 터져야 하는 상한값을 비공개로 미리 정해두어(암호화 저장) "곧 터질 것 같다"는 긴장감을 만듦
- **대표 게임**: Lightning Link/Dragon Link(Aristocrat), Dream Drop 네트워크
- **매력 포인트**: 화면 상단에 실시간으로 커지는 숫자가 소셜 카지노 유저에게도 강력한 "지금 안 하면 손해" 신호가 됨
- **수학/RTP**: 실제 화폐 환경에서는 베팅액의 일부를 잭팟 풀에 적립해 RTP를 분리 관리(예: 기여분 1~2%). 가상 코인 환경에서는 실질적 "적립"이 무의미하므로 순수 연출로 대체해야 함
- **구현 복잡도**: **M** — 서버가 세션/글로벌 단위로 4개 카운터를 유지하고 must-hit-by 상한을 시드로 미리 커밋(공정성 증명용)하는 구조 필요. 크로스 세션 잭팟(전체 유저 공유)까지 가면 동시성 처리가 추가됨
- **권장**: **각색 채택** — 허브 전체가 총 RTP 96(기본 94.5 + 잭팟 풀 1.5)로 공통 잭팟 풀을 이미 운영 중이나, 미니/마이너/메이저/그랜드 다단계 티어인지는 카탈로그 요약상 불명확(#9 kraken-cove는 "잭팟"으로만 표기). 다단계 must-hit-by 구조 도입 여부는 economy 담당과 별도 확인 권장

### 2.17 바이 피처 / 앤티 베트
- **메커니즘**: 바이 피처는 보너스(주로 프리스핀)를 베팅액의 20~500배(추정, 게임마다 상이) 고정 비용으로 즉시 구매. 앤티 베트는 매 스핀 베팅액을 25%(예: Sweet Bonanza) 추가 지불하는 대신 보너스 트리거 확률이 상시 상승(단, 보장은 아님)
- **대표 게임**: Sweet Bonanza/Gates of Olympus(Pragmatic Play, 앤티 베트), 다수 게임의 바이 피처 버튼
- **매력 포인트**: "기다리기 싫은" 유저에게 즉시 만족을 제공. RTP 자체는 동일하게 유지되고 변동성만 압축됨
- **수학/RTP**: 바이 피처는 RTP를 올리지 않고 변동성만 재분배(비용=평균 기대값과 동일하게 설계)하는 것이 원칙. 앤티 베트는 베이스/보너스 확률표를 별도로 재계산 필요
- **구현 복잡도**: **S** — 이미 프리스핀 트리거 로직이 있다면 "확률 없이 강제 트리거" 버튼만 추가하면 됨(바이 피처). 앤티 베트는 베팅액에 따른 확률표 분기 필요
- **권장**: **평가 후 제한적 채택** — 카탈로그 #12 mecha-nova가 이미 바이 피처(총베팅 80배)를 채택. 앤티 베트는 아직 없으며, 가상 코인 환경에서 가치 제안이 약해 추가 도입은 보류 권장

### 2.18 갬블 / 더블업 (카드, 래더)
- **메커니즘**: 당첨 후 선택적으로 진입. 카드형은 뒷면 카드의 색(2배) 또는 무늬(4배)를 맞히면 당첨금이 배가, 틀리면 전액 소실. 래더형은 단계마다 성공 시 다음 단계(배수 상승)로, 실패 시 하단 단계로 낙하하거나 즉시 종료
- **대표 게임**: 다수의 클래식/캐주얼 슬롯에 보편적으로 탑재
- **매력 포인트**: 당첨 직후 "더 딸 수 있을까"하는 즉각적 추가 의사결정 — 짧고 반복 가능한 도파민 루프
- **수학/RTP**: 기댓값이 정확히 50:50(카드 색) 또는 25:75(무늬) 등으로 설계되면 이론상 RTP 중립. 다만 반복 진입 시 소실 확률이 누적되므로 실질적으로는 "리스크 온" 옵션
- **구현 복잡도**: **S** — provably-fair 시드로 카드 순서를 미리 커밋하는 구조와 궁합이 매우 좋음. 기존 당첨 처리 파이프라인 뒤에 옵션 단계로만 추가하면 됨
- **권장**: **채택(허브 공통 기능)** — 카탈로그 기구현 sheriff-sixgun이 코인 더블업으로 이미 채택. 허브 공통 컴포넌트화해 다른 게임에도 재사용 권장

### 2.19 윈 보스 웨이즈 / 트윈 릴 (Twin Spin류)
- **메커니즘**: 스핀마다 최소 2개 이상의 인접 릴이 동일한 심볼로 "링크"되어 동시에 같은 결과를 보여줌(3~5릴까지 확장 가능). 결과적으로 특정 심볼의 등장 빈도가 순간적으로 급증해 라인 당첨 가능성이 커짐
- **대표 게임**: Twin Spin(NetEnt), Twin Spin Megaways(NetEnt)
- **매력 포인트**: 클래식 심볼(과일, 럭키세븐 등) 테마와 궁합이 좋아 레트로 감성 게임에 신선함을 더함
- **수학/RTP**: 링크되는 릴 개수 확률표로 RTP 조절. 클래식 룩앤필을 유지하면서 변동성만 살짝 올리는 용도로 적합
- **구현 복잡도**: **S~M** — 릴 심볼 생성 단계에서 "이번 스핀에 몇 개 릴이 링크되는지"를 먼저 결정하고 해당 릴들에 동일 심볼을 복사하는 전처리 단계 추가
- **권장**: **채택** — 카탈로그 #11 idol-stage-live가 "1024 ways 양방향"으로 방향성 확장은 채택했으나, **릴이 물리적으로 동기화되는 진짜 트윈/링크 릴 구조는 아직 없음** → 5.3 신규 컨셉 참고

### 2.20 인피니티 릴 (Infinity Reels)
- **메커니즘**: 3릴로 시작해, 가장 오른쪽 릴이 당첨에 기여하면 오른쪽에 새 릴이 하나씩 추가됨(이론상 무제한). 새로 추가되는 릴에는 배수가 붙기도 함. Megaways와 달리 "릴 높이"가 아니라 "릴 개수" 자체가 늘어남
- **대표 게임**: Odin Infinity Reels Megaways(ReelPlay), Zodiac Infinity Reels(ReelPlay)
- **매력 포인트**: "몇 릴까지 늘어날까"라는 무한 확장감. Megaways와 유사한 흥분을 주면서 그리드 자체는 좁아 모바일 세로 화면에 상대적으로 적합
- **수학/RTP**: 릴 확장 확률을 낮게 설계해 평균 릴 수를 통제. 확장이 계속될수록 배수가 누적되므로 꼬리가 두꺼운(고변동) 분포
- **구현 복잡도**: **L** — 릴 개수 자체가 가변적인 그리드 구조는 기존 고정 폭 엔진과 근본적으로 다름. 모바일 세로 화면에서 릴이 계속 늘어나는 UI 처리도 별도 설계 필요(스크롤 또는 축소 렌더링)
- **권장**: **스킵(당분간)** — Megaways보다 구현 난도가 높은데 모바일 세로 화면과의 궁합은 오히려 더 나쁨(가로로 계속 넓어지는 구조). 카탈로그에도 없으며, 세로 최적화가 우선인 현재 로드맵에서는 후순위

### 2.21 익스팬딩 릴 (Reactoonz/Gates 6×5류)
- **메커니즘**: 특정 조건(연쇄 콤보 등) 충족 시 그리드 자체의 크기가 스핀 도중 5×5→6×5처럼 확장됨. 확장된 열에서 추가 클러스터/캐스케이드가 발생
- **대표 게임**: Gates of Olympus 계열 변형, Gigantoonz(Play'n GO, 7×7→8×8)
- **매력 포인트**: 그리드가 시각적으로 커지는 순간 자체가 하이라이트 이벤트
- **수학/RTP**: 확장 트리거 확률과 확장 후 추가 히트 기댓값을 함께 설계해야 하므로 캐스케이드/클러스터보다 계산이 한 단계 복잡
- **구현 복잡도**: **L** — 그리드 크기 자체가 런타임에 변하는 구조는 렌더러/당첨판정 모두에 큰 영향. 클러스터 피처(2.3, #6 candy-cluster-pop)가 먼저 안정화된 이후에나 시도할 가치가 있음
- **권장**: **스킵(당분간)** — 클러스터+캐스케이드 조합(#6, #7)만으로도 유사한 체감 효과를 낼 수 있어 ROI가 낮음

### 2.22 어밸런치 멀티플라이어
- 2.2(캐스케이드)에서 다룬 배수 누적 방식(연속 텀블마다 1x→2x→3x→5x 등)을 별도 항목으로 강조. **권장**: 카탈로그 #6 candy-cluster-pop이 이미 "텀블 연쇄마다 배수 사다리 상승"으로 채택함

### 2.23 리트리거 (Retrigger)
- **메커니즘**: 프리스핀 도중 트리거 심볼이 다시 규정 개수 랜딩하면 추가 프리스핀 획득. 최초 트리거보다 낮은 임계값(예: 최초 4개 → 리트리거는 2~3개)을 쓰는 게임이 "골드 스탠다드"로 평가받음
- **대표 게임**: Book of Dead(Play'n GO), Buffalo Blitz 등 업계 전반
- **매력 포인트**: 프리스핀이 끝나지 않고 이어지는 것 자체가 큰 만족감을 줌
- **수학/RTP**: 리트리거 확률을 프리스핀 RTP 예산의 일부로 명시적으로 배분(무한 루프 방지를 위한 상한 설계 권장 — 엔진 규칙상 하드 캡 필수)
- **구현 복잡도**: **S** — 프리스핀 RoundState에 카운터 가산 로직만 추가하면 됨(신규 스캐터 심볼 세트 필요 없이 기존 트리거 심볼 재사용 가능)
- **권장**: **채택** — 카탈로그 #8 magi-stella가 이미 채택함(+5회 리트리거)

### 2.24 xNudge / xWays (Nolimit City류)
- **메커니즘**: xWays는 심볼 하나가 랜딩 시 세로로 2~6개까지 쌓인 스택으로 나타나 해당 릴의 way 수를 곱으로 늘림(여러 xWays가 겹치면 way 수가 서로 곱해짐). xNudge는 와일드가 릴 중앙을 벗어나 있으면 위/아래로 넛지되며 넛지 1회당 배수가 1씩 증가(여러 xNudge 와일드가 동시에 있으면 배수끼리 곱셈)
- **대표 게임**: San Quentin xWays, xWays Hoarder 2, Outsourced(Nolimit City)
- **매력 포인트**: 브랜드 자체가 "극단적 변동성" 마니아층을 형성할 정도로 독특한 정체성을 지님
- **수학/RTP**: 곱셈 구조라 꼬리가 매우 두꺼운 극고변동성. RTP 상당 부분이 최상위 0.01% 이벤트에 집중되어 일반 유저 체감 RTP는 낮게 느껴짐
- **구현 복잡도**: **L** — way 수 자체가 스핀마다 동적으로 곱해지는 구조는 배당 계산 로직을 근본적으로 재설계해야 함. 여러 xWays/xNudge가 동시에 상호작용하는 조합 폭발 테스트 부담도 큼
- **권장**: **스킵(원형)/니치 라이트 버전만 검토** — 카탈로그에는 없음. 소셜 카지노 맥락에서는 극고변동성이 부정적 경험(코인 급감)으로 이어지기 쉬우므로, 배수 상한을 둔 라이트 버전으로 니치 게임 1종만 검토 → 5.4 신규 컨셉 참고

### 2.25 코인/러시 모드
- **메커니즘**: 명확한 단일 표준은 없으나, 일반적으로 "제한된 스핀 수 안에 코인/심볼을 최대한 수집" 형태의 타임어택형 서브 모드를 지칭(예: Nolimit City Dead Men Walking의 Dead Man's Gold — 코인 3개 이상 인접 시 수집)
- **대표 게임**: Dead Men Walking(Nolimit City) 등 개별 게임마다 변형이 다름 (~신뢰도: 표준화된 업계 용어 아님)
- **매력 포인트**: 짧은 시간 압박 속 수집이라는 게임화 요소가 소셜 카지노의 "이벤트 모드"와 결합하기 좋음
- **수학/RTP**: 표준 패턴이 없어 게임별로 개별 설계 필요
- **구현 복잡도**: **M** — 홀드&스핀(2.1, #9 kraken-cove)의 변형으로 볼 수 있어 유사한 RoundState 구조 재사용 가능
- **권장**: **각색 채택** — 독립 피처보다는 #9 kraken-cove의 시즌 이벤트 변형(한정 기간 러시 모드)으로 흡수 권장

### 2.26 미니게임 (스킬-라이트)
- **메커니즘**: 슬롯 결과와 별개로, 가벼운 반응속도/타이밍 기반 미니게임(과녁 맞히기, 타이밍 스톱 등)을 보너스 진입 시 삽입. 결과에 미세한 유저 입력 여지를 주되 최종 보상은 서버가 사전 결정
- **대표 게임**: 소셜 카지노 다수(정형화된 단일 예시는 없음, ~신뢰도)
- **매력 포인트**: 100% 수동적인 스핀-대기 루프에서 벗어나 참여감을 높임
- **수학/RTP**: 서버가 결과를 사전 커밋하고 유저 입력은 연출 타이밍에만 영향을 주는 구조로 설계해야 공정성 검증(provably-fair)이 유지됨
- **구현 복잡도**: **M** — 클라이언트 입력 타이밍을 받되 실제 보상 판정과는 분리하는 구조 설계가 까다로움(입력이 실제 RNG에 영향을 주면 공정성 증명이 깨짐)
- **권장**: **각색 채택(신중)** — 카탈로그에는 아직 없음. 픽미(2.14)처럼 "선택은 유저가, 결과는 사전 커밋"인 구조로 한정할 경우에만 도입 권장

### 2.27 진행 미터 / 세션 간 이월 (소셜 카지노 스타일)
- **메커니즘**: Slotomania의 VIP 티어(브론즈~다이아몬드), 컬렉션 앨범, 데일리 리워드처럼 개별 스핀 결과와 무관하게 "플레이 자체"가 누적되어 장기 진행 보상을 얻는 메타 레이어
- **대표 게임**: Slotomania(Playtika), DoubleDown Casino
- **매력 포인트**: 단일 스핀의 승패를 넘어서는 장기 목표가 생겨 리텐션에 직접 기여. "오늘 접속하면 뭐가 쌓인다"는 습관화 유도
- **수학/RTP**: 스핀 자체의 RTP와는 무관한 별도 보상 예산(코인/이벤트 보상)으로 관리
- **구현 복잡도**: **M** — 게임 엔진이 아니라 허브 레벨의 유저 프로필/서버 영속 저장 문제. 개별 슬롯 엔진보다 허브 백엔드 작업 비중이 큼
- **권장**: **채택(허브 레벨)** — 카탈로그 #11 idol-stage-live의 응원 미터는 **라운드 내로 한정**되어 있어, 세션을 넘어 이월되는 버전은 아직 카탈로그에 없음 → 5.5 신규 컨셉 참고

### 2.28 토너먼트 / 레이스
- **메커니즘**: 정해진 시간 동안 특정 지표(누적 승리, 최대 배수 등)로 순위를 매겨 리더보드 상위권에 보상 지급
- **대표 게임**: Slotomania, DoubleDown Casino 다수
- **매력 포인트**: 동시 접속 유저 간 경쟁 심리를 자극해 세션 길이와 재방문 빈도를 동시에 늘림
- **수학/RTP**: 개별 스핀 RTP와 무관, 토너먼트 상금 풀은 별도 마케팅/리텐션 예산으로 책정
- **구현 복잡도**: **M** — 실시간 리더보드 집계·동시성 처리가 필요해 개별 슬롯 엔진보다 허브 백엔드(랭킹 서비스) 신규 구축 비중이 큼
- **권장**: **각색 채택(장기 로드맵)** — 카탈로그에는 없음. 개별 게임 출시 우선순위보다는, 허브에 게임이 12종(현재 계획 기준) 이상 쌓인 후 크로스 게임 토너먼트로 도입 권장

---

## 3. 종합 매트릭스

| 피처 | 구현 복잡도 | 참여감(체감) | 변동성 영향 | 카탈로그 사용 여부 | 권장 |
|---|---|---|---|---|---|
| 홀드&스핀 코인 컬렉트 | L | 매우 높음 | 고 | #9 kraken-cove | 각색 채택(완료) |
| 캐스케이드/텀블 | M | 높음 | 중~고 | #6, #7 | 채택(완료) |
| 클러스터 페이 | M | 중~높음 | 중 | #6 | 채택(완료) |
| 페이-애니웨어 | S | 중 | 중 | #7 | 채택(완료) |
| 멀티플라이어 봄 심볼 | M | 높음 | 고 | #7 | 채택(완료) |
| 스티키 와일드 | S | 중 | 중 | #8 | 채택(완료) |
| 워킹 와일드 | M | 중 | 고 | #12 | 채택(완료) |
| 익스팬딩/스택 와일드 | S~M | 높음 | 중 | sheriff-sixgun | 채택(완료) |
| 미스터리/트랜스폼 심볼 | S | 높음 | 중 | royal-diamond-777, #10 | 채택(완료) |
| 심볼 업그레이드 미터(라운드 내) | M | 높음 | 중 | #11 | 채택(완료) |
| **메가웨이즈(가변 릴)** | L | 매우 높음 | 매우 고 | **없음** | **신규 5.1** |
| 릴 모디파이어(랜덤 와일드) | S~M | 중 | 저~중 | shiba-shrine | 채택(완료) |
| 보너스 휠 | S~M | 매우 높음 | 저~중 | #10 | 채택(완료) |
| 픽미 보너스 | S | 매우 높음 | 저~중 | #11 | 채택(완료) |
| **트레일/보드 보너스** | M | 높음 | 중 | **없음** | **신규 5.2** |
| 잭팟(단순형) | M | 매우 높음 | 저(연출성) | #9 | 각색 채택(완료, 다단계는 미확인) |
| 바이 피처 | S | 중(편의성) | 무영향(재분배) | #12 | 채택(완료) |
| 갬블/더블업 | S | 높음 | 유저 선택적 | sheriff-sixgun | 채택(허브 공통화 권장) |
| **트윈/링크 릴** | S~M | 중 | 중 | **없음(양방향 ways만 있음)** | **신규 5.3** |
| 인피니티 릴 | L | 높음 | 매우 고 | 없음 | 스킵 |
| 익스팬딩 릴(그리드) | L | 높음 | 고 | 없음 | 스킵(당분간) |
| 리트리거 | S | 높음 | 중 | #8 | 채택(완료) |
| **xNudge/xWays** | L | 매우 높음(마니아) | 극고 | **없음** | **신규 5.4(라이트)** |
| 코인/러시 모드 | M | 중~높음 | 중 | #9(이벤트 변형 흡수 권장) | 각색 채택 |
| 미니게임(스킬-라이트) | M | 높음 | 저 | 없음 | 각색 채택(신중) |
| **진행 미터(세션 이월)** | M | 높음(리텐션) | 무영향 | **없음(라운드 내만 존재)** | **신규 5.5** |
| 토너먼트/레이스 | M | 높음(리텐션) | 무영향 | 없음 | 각색 채택(장기) |

---

## 4. 카탈로그 매핑

팀리드가 전달한 `GAME_CATALOG.md` §2 #6~#12 요약과 기구현 게임(classic-777, fruit-fiesta, royal-diamond-777, sheriff-sixgun, shiba-shrine) 목록을 기준으로, 각 게임이 이미 사용 중인 피처를 정리했다.

### 4.1 게임별 사용 피처 매핑

| 게임 | 그리드/베이스 | 이미 쓰는 피처(본 문서 절 번호) |
|---|---|---|
| classic-777 (기구현) | 3×3 5라인 | 클래식 라인 페이만(별도 피처 없음) |
| fruit-fiesta (기구현) | 5×3 20라인 | 스캐터 프리스핀 |
| royal-diamond-777 (기구현) | 5×3 10라인 | 2.9 미스터리/트랜스폼 심볼 |
| sheriff-sixgun (기구현) | 5×3 20라인 | 2.8 익스팬딩 와일드 + 2.18 갬블/더블업(코인) |
| shiba-shrine (기구현) | 5×3 243 ways | 2.12 릴 모디파이어(랜덤 와일드) + 스캐터 프리스핀 |
| #6 candy-cluster-pop | 6×5 | 2.3 클러스터 페이(직교 인접 5+) + 2.2 캐스케이드/텀블 + 2.22 배수 사다리 |
| #7 olympus-nectar | 6×5 | 2.4 페이-애니웨어(8+) + 2.2 텀블 + 2.5 멀티플라이어 오브(합산형) + 스캐터 프리스핀 |
| #8 magi-stella | 5×4 1024 ways | ways 구조 + 스캐터(3+) 프리스핀 12회 + 2.6 스티키 와일드 + 2.23 리트리거(+5) |
| #9 kraken-cove | 5×3 20라인 | 2.1 홀드&스핀 코인 컬렉트(리스핀 3회, 15칸 그랜드) + 2.16 잭팟(단순형) |
| #10 hanbok-night-market | 5×3 25라인 | 2.9 미스터리 심볼(전체 승급형 변형, 스핀당 8%) + 2.13 보너스 휠 |
| #11 idol-stage-live | 5×4 1024 ways 양방향 | 2.19 윈-보스-웨이즈(양방향, 링크는 아님) + 2.10 심볼 업그레이드 미터(라운드 내) + 2.14 픽미(카드 3장) |
| #12 mecha-nova | 5×4 243 ways | 2.7 워킹 와일드(좌측 이동+리스핀) + 2.17 바이 피처(80배) |

### 4.2 카탈로그에 아직 없는 피처

12개 게임(기구현 5 + 계획 7) 전체를 대조해도 다음 피처는 **한 번도 쓰이지 않았다**:

- **2.11 메가웨이즈(가변 릴 높이)** — ways 게임 3종(magi-stella, idol-stage-live, mecha-nova)이 모두 고정 1024/243이며, 스핀마다 릴 높이가 바뀌는 진짜 가변형은 없음
- **2.15 트레일/보드 보너스** — 이동형 보드 보너스 없음(픽미형 idol-stage-live와 구조가 다름)
- **2.19 트윈/링크 릴** — 인접 릴이 물리적으로 동기화되는 피처 없음(idol-stage-live의 "양방향"은 페이 판정 방향이지 릴 동기화가 아님)
- **2.21 익스팬딩 릴(그리드 자체 확장)** — 없음
- **2.24 xNudge/xWays(스택형 심볼 확장)** — 없음(shiba-shrine의 랜덤 와일드는 위치만 무작위이지 스택 확장이 아님)
- **2.27 진행 미터의 세션 간 이월(컬렉션 앨범/VIP형)** — idol-stage-live의 응원 미터는 라운드 내로 한정, 세션을 넘어 이월되는 미터는 없음
- **2.28 토너먼트/레이스** — 없음
- **2.16 잭팟의 다단계 티어(미니/마이너/메이저/그랜드 must-hit-by)** — #9 kraken-cove가 "잭팟"을 언급하지만 다단계 구조인지는 요약상 불명확, 단일/단순 잭팟으로 추정
- **2.26 미니게임(스킬-라이트)** — 없음

5절의 신규 컨셉은 이 목록에서 구현 난이도와 테마 다양성을 함께 고려해 우선순위가 높은 4가지(메가웨이즈 라이트, 트레일/보드, 트윈 릴, xWays 라이트)를 중심 피처로, 5번째로 세션 이월 진행 미터를 다룬다.

---

## 5. 신규 게임 컨셉 제안 (5종)

카탈로그에 아직 없는 피처를 하나씩 중심으로 삼아 설계했다. 테마도 기존 12개 게임(클래식×3, 과일 클래식, 서부극, 애니메×3, K-컬처×1, 캔디, 대리석/신화, 3D 해양, 하드서피스 메카)과 겹치지 않도록 귀여운 동물, 동아시아 신화, 사이버펑크, 클래식 탐험으로 분산했다. RTP는 카탈로그 공통 규칙(총 RTP 96 = 기본 94.5 + 허브 공통 잭팟 풀 1.5)을 따른다는 가정으로 배분안을 제시했다.

### 5.1 「정글의 하모니」 — 메가웨이즈 라이트 + 텀블 (귀여운 동물)
- **테마**: 파스텔톤 정글 동물(코알라, 앵무새, 개구리) 캐주얼 카툰. 기존 애니메 3종과 톤이 겹치지 않는 유아적/캐주얼 룩
- **그리드**: 6릴, 릴당 2~6칸 가변(자체 라이트 버전, 최대 46,656 ways)
- **피처 스택**: **2.11 가변 릴 높이(메가웨이즈 라이트, 카탈로그 최초)** + 2.2 텀블/캐스케이드(연쇄마다 ways 재계산) + 스캐터 3+ 프리스핀(프리스핀 중 최소 릴 높이 상향으로 평균 ways 증가)
- **RTP 배분(안)**: 가변 ways 베이스 78 + 프리스핀 16.5 = 94.5 (+ 잭팟 풀 1.5, 총 96)
- **변동성**: 고
- **비고**: 기존 ways 게임 3종과 달리 릴 높이 자체가 스핀마다 바뀌는 유일한 게임으로 차별화. 구현 복잡도 L(2.11)이므로 우선순위는 로드맵 중반 이후 권장

### 5.2 「고양이 카페 골목」 — 트레일 보드 보너스 (귀여운 동물/도시)
- **테마**: 아기자기한 고양이 카페 거리, 파스텔 도시 일러스트
- **그리드**: 5×3 20라인(베이스는 단순하게 — 메인 재미는 보드 보너스에 집중)
- **피처 스택**: 스캐터 3+ → **2.15 트레일/보드 보너스(카탈로그 최초)**: 주사위 1~6칸 이동, 칸별 코인/추가 이동/미니 픽미/함정 이벤트, 함정 3회 도달 시 정산
- **RTP 배분(안)**: 라인 베이스 80 + 보드 보너스 14.5 = 94.5 (+ 잭팟 풀 1.5, 총 96)
- **변동성**: 중 (보드 길이가 변동성을 완만하게 분산)
- **비고**: idol-stage-live의 카드 픽미와 달리 이동형 진행 서스펜스를 제공해 보너스 스타일이 겹치지 않음. 구현 복잡도 M으로 5종 중 착수 우선순위가 가장 높음

### 5.3 「쌍둥이 용의 밤」 — 트윈 링크 릴 + 익스팬딩 와일드 (동아시아 신화)
- **테마**: 청록·금박 톤의 쌍둥이 용 신화, 동양화풍 클래식 심볼(용, 여의주, 학). K-컬처(#10 hanbok-night-market)와는 다른 동아시아 신화·클래식 라인 게임으로 차별화
- **그리드**: 5×3 20라인
- **피처 스택**: **2.19 트윈/링크 릴(카탈로그 최초)**: 매 스핀 인접 2~4릴이 동기화되어 동일 심볼 랜딩. 링크된 릴에 와일드가 포함되면 해당 릴 전체가 익스팬딩 와일드로 전환(트윈 릴 조건과 결합된 형태라 sheriff-sixgun의 단순 익스팬딩 와일드와는 발동 조건이 다름)
- **RTP 배분(안)**: 라인 베이스 88 + 트윈 링크 보너스 6.5 = 94.5 (+ 잭팟 풀 1.5, 총 96)
- **변동성**: 중 (클래식 라인 게임 특유의 안정적 히트빈도를 유지하고 트윈 릴만 변동성을 소폭 상향)
- **비고**: 기존 클래식 라인 게임 3종(classic-777, royal-diamond-777, fruit-fiesta)과 겹치지 않도록 신화 테마와 트윈 릴 피처로 이중 차별화

### 5.4 「네뷸라 정션」 — xWays 라이트 스택 와일드 (사이버펑크/SF, 니치)
- **테마**: 네온 사이버펑크 도시, 홀로그램 심볼. 하드서피스 메카(#12 mecha-nova)와는 톤이 다른 네온/홀로그램 비주얼
- **그리드**: 5×4 243 ways(그리드 규격은 #12와 유사하나 피처는 완전히 다름)
- **피처 스택**: **2.24 xWays 라이트(카탈로그 최초, 니치)**: 와일드 심볼이 세로 2~3칸 스택으로 랜딩해 해당 릴의 ways를 배수. Nolimit City 원형과 달리 스택 배수 상한을 3으로 제한해 극변동성을 완화
- **RTP 배분(안)**: ways 베이스 82 + xWays 스택 보너스 12.5 = 94.5 (+ 잭팟 풀 1.5, 총 96)
- **변동성**: 매우 고(허브 내 "익스트림" 라벨 니치 게임으로 포지셔닝 — 전체 캐주얼 유저 대상이 아님)
- **비고**: 2.24에서는 원형을 스킵 권장했으나, 배수 상한을 둔 라이트 버전으로 한정하면 구현 복잡도 L을 유지한 채 변동성만 통제 가능. 5종 중 착수 우선순위는 가장 낮음(니치 타깃)

### 5.5 「박물관의 보물」 — 세션 이월 컬렉션 미터 + 픽미 (클래식 탐험)
- **테마**: 클래식 탐험가/고고학 테마(사막 유적, 보물 지도) — 진입 장벽 낮은 캐주얼 룩
- **그리드**: 5×3 20라인
- **피처 스택**: 2.14 픽미(유물 상자 선택) + **2.27 진행 미터의 세션 간 이월(카탈로그 최초)**: 라운드마다 유물 조각을 수집해 "전시관" 컬렉션 앨범을 채우고, 앨범 완성 시 허브 VIP 보상 지급. idol-stage-live의 라운드 내 응원 미터와 달리 세션을 넘어 계속 누적됨
- **RTP 배분(안)**: 라인 베이스 82 + 픽미 12.5 = 94.5 (+ 잭팟 풀 1.5, 총 96). 컬렉션 앨범 보상은 스핀 RTP와 분리된 허브 리텐션 예산으로 별도 관리(2.27 원칙과 동일)
- **변동성**: 저~중(세션 이월형 메타 레이어가 있어 단일 스핀 변동성을 낮게 유지해도 장기 리텐션 매력 확보 가능)
- **비고**: 허브 전체 VIP/컬렉션 시스템의 파일럿 게임으로 적합. 이 게임에서 세션 이월 미터 인프라를 검증한 뒤 다른 게임(특히 idol-stage-live)까지 확장 적용 권장

---

## 6. 추가 탐색 권장 방향

- Light & Wonder / IGT의 랜드베이스 클래식 잭팟 구조(예: Huff n' Puff류)는 이번 조사에서 시간 제약상 깊게 다루지 못했다. 클래식 테마 게임을 추가 기획할 때 별도 조사 권장
- 가상 코인 환경에서 "바이 피처"를 완전히 배제하기보다, 유료 코인 패키지 결합형(예: "코인 패키지 구매 시 보너스 즉시 진입권 1회 증정")으로 우회 도입할 여지가 있는지는 수익화 전략과 함께 별도 검토 필요
- provably-fair 시드 공개 방식이 유저에게 실제로 신뢰를 주는지(UI/UX 관점)는 UX 조사 담당 팀의 조사와 교차 확인 권장
- #9 kraken-cove의 잭팟이 다단계(미니/마이너/메이저/그랜드) 구조인지, 단일 잭팟인지 economy 담당에게 확인 후 2.16/4.2 항목 업데이트 필요

---

## 출처 전체 목록

1. [Lightning Coins Hold and Spin Slot Demo & Review](https://slotcatalog.com/en/slots/lightning-coins-hold-and-spin)
2. [What is Lightning Link: A Review of the Legendary Aristocrat Slot](https://cryptwerk.com/post/what-is-lightning-link-a-review-of-the-legendary-aristocrat-slot-series/)
3. [Fill 15 Positions for the Lightning Link Grand Jackpot](https://slotsgamblers.net/us/slots/lightning-link/)
4. [Reactoonz 2 Slot by Play'n GO](https://respinix.com/demo/reactoonz-2/)
5. [Reactoonz Slot Series Guide](https://www.casinoslotsguru.com/guide/reactoonz-slot-series-guide:-play-n-gos-intergalactic-grid-slots-explained/)
6. [Fortune Games Gigantoonz Slot Review](https://www.fortunegames.com/all-games/slots/gigantoonz)
7. [Megaways Slots: Operator Guide to Mechanic & Economics](https://track360.io/blog/megaways-slots-operator-guide-2026)
8. [Big Time Gaming Review: Megaways Mechanics Explained](https://www.gamingsoft.com/blog/2026/05/big-time-gaming-casino-games/)
9. [Megaways Explained: Why They're So Popular](https://www.vegas-aces.com/articles/megaways-slots-explained)
10. [Nolimit City resurfaces in xWays Hoarder 2](https://europeangaming.eu/portal/latest-news/2025/01/14/173944/nolimit-city-resurfaces-in-the-apocalyptic-world-of-xways-hoarder-2/)
11. [Nolimit City's xNudge and xWays Mechanics Innovation](https://drvedic.in/nolimit-citys-xnudge-and-xways-mechanics-innovation-transforming-contemporary-slot-games/)
12. [San Quentin xWays Demo and Slot Review](https://slotsjuice.com/nolimit-city/san-quentin-xways/)
13. [Gonzo's Quest Slot by NetEnt](https://netent.com/games/gonzos-quest)
14. [Gonzo's Quest Slot RTP, Demo & Review](https://slotcatalog.com/en/slots/Gonzos-Quest)
15. [Sticky Wilds, Expanding Wilds, and Walking Wilds Guide](https://www.designentrepreneurshipworkshop.org/2026/06/04/sticky-wilds-expanding-wilds-and-walking-wilds-wild-mechanics-guide/)
16. [Sticky Wilds vs Expanding Wilds: Key Differences](https://www.twilightcms.com/expanding-wilds-vs-sticky-wilds/)
17. [Book of Dead Slot Review - Symbols and features](https://www.playngo.com/post/a-complete-guide-on-how-to-play-book-of-dead)
18. [Book of Dead Slot Review 2026](https://www.askgamblers.com/casino-games/online-slots/reviews/book-of-dead-play-n-go)
19. [Sweet Bonanza Slot by Pragmatic Play](https://www.pragmaticplay.com/en/games/sweet-bonanza-slot/)
20. [Sweet Bonanza Slot Review, RTP & Tumble Guide](https://game-cave.com/en/slots/sweet-bonanza)
21. [Must-Hit-By Progressives - Wizard of Odds](https://wizardofodds.com/games/slots/mystery-jackpot/)
22. [Progressive Jackpot Slots: How They Work & Types](https://peakycasino.net/games/slots/progressive-jackpot/)
23. [Progressive jackpot - Wikipedia](https://en.wikipedia.org/wiki/Progressive_jackpot)
24. [Bonus Buy Slots: What They Cost, What They Pay](https://www.sportsline.com/casinos/bonus-buy-slots-what-they-cost-what-they-pay-whether-theyre-worth-it/)
25. [Ante Bet Slots Guide](https://slotshowcase.com/ante-bet-slots/)
26. [Buy Feature for Online Slots - Pros & Cons](https://lcb.org/games/buy-feature)
27. [Gamble Feature Slots - SlotCatalog](https://slotcatalog.com/en/slot-features/gamble)
28. [The Gamble Feature in slots: how does it work](https://www.casinowizard.com/gamble-feature-in-slots/)
29. [Top Slot Games With Gamble Ladder Features](https://mari-chaiv.com/top-slot-games-with-gamble-ladder-features/)
30. [Bonus round slots: how they're made and why casinos need them](https://www.1spin4win.com/blog/slot-bonus-rounds)
31. [Slot Bonus Game Mechanics: Why They Hook Players](https://www.pokewilds.com/2026/01/17/slot-bonus-game-mechanics-and-player-appeal/)
32. [Understanding Bonus Wheels in Online Slot Games](https://casino.betmgm.ca/en/blog/casino-guides/understanding-bonus-wheels-online-slot-games/)
33. [Wheel of Fortune Slots - IGT](https://www.igt.com/products-and-services/gaming/wheel-of-fortune)
34. [Twin Spin Slot - Play - NetEnt](https://netent.com/games/twin-spin)
35. [Twin Spin Slot Review](https://www.pokernews.com/casino/slots/twin-spin-slot-review/)
36. [Infinity Reels in Online Slots: Slot Guide](https://www.casinos.com/slot-features/infinity-reels)
37. [Best Infinity Reels Slots (And How They Work) - Wizard Slots](https://www.wizardslots.com/blog/slots-with-infinity-reels)
38. [Rich Wilde and the Tome of Insanity Slot](https://www.pokernews.com/casino/slots/rich-wilde-and-the-tome-of-insanity-slot-review.htm)
39. [Massive Book of Oz Bonuses](https://slotsgamblers.net/game/book-of-oz/)
40. [Wanted Dead Or A Wild Slot Review 2026](https://slotcatalog.com/en/slots/Wanted-Dead-or-a-Wild)
41. [Wanted Dead or a Wild Demo and Slot Review](https://www.aboutslots.com/casino-slots/wanted-dead-or-a-wild)
42. [Deconstructing Meta Features In Social Casino Games](https://www.gameanalytics.com/blog/meta-features-social-casino-games)
43. [UX Review: Slotomania, the hooks & baits of social casino gaming](https://www.linkedin.com/pulse/ux-review-slotomania-hooks-baits-social-casino-gaming-om-tandon)
44. [Slotomania Monetization: Turning Virtual Coins into $1.9B](https://www.blog.udonis.co/mobile-marketing/mobile-games/slotomania-monetization)
45. [Money Train - Slot by Relax Gaming](https://moneytrain-relax-gaming.com/)
46. [Money Train 4 Slot Review & Demo](https://casinorange.com/slot/money-train-4)
47. [Dragon Link Slot Machine How To Play](https://www.vinelandcity.org/dragon-link-slot-machine-how-to-play/)
48. [The Free Spin Bonuses of Aristocrat's Lightning Link, Dragon Link](https://www.knowyourslots.com/the-free-spin-bonuses-of-aristocrats-lightning-link-and-dragon-link/)
49. [Jammin' Jars Slot Review](https://www.pokernews.com/casino/slots/jammin-jars-slot-review/)
50. [Jammin' Jars (Push Gaming) Slot Review & Demo](https://www.bigwinboard.com/jammin-jars-push-gaming/)
51. [Slot Vocabulary: Retrigger](https://www.knowyourslots.com/slot-vocabulary-retrigger/)
52. [Making a Bonus Last: Retrigger Potential](https://www.knowyourslots.com/making-a-bonus-last-retrigger-potential/)
53. [Online Slots Volatility and RTP Explained: A Player's Guide](https://www.deucescracked.com/blog/online-slots-volatility-rtp-explained-2026)
54. [Slot Math: RTP, Volatility & Hit Frequency Guide](https://augustafreepress.com/commercial/slot-math-rtp-volatility-hit-frequency-guide/)
