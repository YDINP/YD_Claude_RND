# 17. UI/UX 고도화 및 무결성 검증 계획 PRD

## 문서 정보
- **버전**: 1.0
- **작성일**: 2026-02-07
- **프로젝트**: ArcaneCollectors
- **관련 문서**: `14_CHARACTER_DESIGN.md`, `00_INDEX.md`

---

## 1. 현재 UI/UX 상태 진단

### 1.1 기술 스택 현황
- **렌더링 방식**: Phaser Graphics API 직접 호출
  - `drawRoundedRect()`, `fillStyle()`, `strokeRect()` 등
  - 모든 UI 요소가 코드로 그려짐
- **컴포넌트**: 14개 존재 (`src/components/`)
  - 공통: BottomNav, Button, EnergyBar, HeroCard, Modal, Panel, ProgressBar, StarRating, StatBar, Toast, TopBar, LoadingSpinner
  - 전투: SkillCard, SynergyDisplay, TurnOrderBar
- **에셋**: `public/assets/` 폴더 비어있음 (순수 코드 기반)
- **해상도**: 720x1280 (세로 모드, 모바일 우선)

### 1.2 식별된 문제점
| 카테고리 | 문제 | 영향도 |
|---------|------|--------|
| **터치 최적화** | 버튼 터치 영역 44px 미만인 경우 존재 | 높음 |
| **접근성** | 색각이상자 대응 없음 (색상만으로 정보 전달) | 중간 |
| **일관성** | 씬마다 다른 색상 팔레트/폰트 사이즈 사용 | 높음 |
| **피드백** | 로딩/에러 상태 표시 미흡 | 높음 |
| **반응성** | 다양한 해상도 대응 부족 (720x1280 고정) | 중간 |
| **정보 구조** | 복잡한 화면(GachaScene 1275줄)의 정보 계층 모호 | 높음 |

---

## 2. 씬별 UI/UX 개선 계획

### 2.1 MainMenuScene (588줄)
**현재 상태**:
- 단순 버튼 배치 (영웅, 가챠, 스테이지, 인벤토리, 파티, 설정)
- 상단바에 플레이어 정보 표시 (레벨, 이름, 골드, 젬)
- 오프라인 보상 팝업 (alert 형태)

**개선 계획**:
```
UIX-2.1.1 [복잡도: 중] 상단바 정보 표시 고도화
- 플레이어 레벨 프로그레스 바 추가
- 재화 아이콘 + 숫자 (탭하면 상세 정보)
- 에너지 바 실시간 회복 애니메이션

UIX-2.1.2 [복잡도: 낮] 메뉴 버튼 개선
- 아이콘 + 텍스트 조합
- 뱃지 표시 (새 캐릭터, 완료 가능한 퀘스트 등)
- 44px 최소 터치 영역 보장

UIX-2.1.3 [복잡도: 중] 오프라인 보상 UI
- Modal 컴포넌트 활용
- 획득 아이템 목록 시각화
- "수령" 버튼 터치 피드백 강화

UIX-2.1.4 [복잡도: 낮] 배경 레이어링
- 메인 배경 + 중간 장식 레이어
- Parallax 효과 (선택사항)
```

### 2.2 HeroListScene (456줄)
**현재 상태**:
- 그리드 레이아웃 (3열)
- 필터 버튼 (전체/전사/마법사/힐러/궁수)
- 정렬 버튼 (등급/레벨/이름)

**개선 계획**:
```
UIX-2.2.1 [복잡도: 중] 그리드 레이아웃 최적화
- 카드 크기 조정 (현재 100x140 → 110x150)
- 카드 간격 표준화 (10px)
- 스크롤 성능 최적화 (가상 스크롤 고려)

UIX-2.2.2 [복잡도: 높음] 필터/정렬 UI 개선
- 드롭다운 메뉴 또는 탭 형태로 변경
- 다중 필터 지원 (교단 + 클래스 + 분위기)
- 필터 상태 시각적 표시

UIX-2.2.3 [복잡도: 중] 검색 기능 추가
- 상단 검색바 (캐릭터 이름 실시간 필터링)
- 검색 결과 하이라이트

UIX-2.2.4 [복잡도: 낮] 잠긴 캐릭터 표시
- 실루엣 표시 (아직 획득하지 않은 캐릭터)
- "획득 방법" 힌트 표시

UIX-2.2.5 [복잡도: 낮] 빈 상태 UI
- 영웅이 없을 때 안내 메시지
- "가챠 바로가기" 버튼
```

### 2.3 HeroDetailScene (968줄)
**현재 상태**:
- 캐릭터 정보 표시 (이름, 등급, 레벨, 스탯, 스킬)
- 레벨업 버튼
- 뒤로가기 버튼

**개선 계획**:
```
UIX-2.3.1 [복잡도: 높음] 스탯 비교 그래프
- 레이더 차트 (HP, ATK, DEF, SPD, 스킬위력 등)
- 장비 착용 시 스탯 변화 미리보기
- 동일 등급 평균치 비교선

UIX-2.3.2 [복잡도: 중] 스킬 설명 팝업
- 스킬 아이콘 탭 시 상세 설명 모달
- 쿨다운, 데미지 계수, 분위기 보너스 표시
- 스킬 레벨업 정보

UIX-2.3.3 [복잡도: 중] 육성 경로 시각화
- 탭 구조 (레벨업/진화/장비/스킬)
- 필요 자원 명확하게 표시
- "육성 불가" 상태 시 이유 표시

UIX-2.3.4 [복잡도: 중] 캐릭터 전환 제스처
- 좌우 슬라이드로 다음/이전 캐릭터
- 하단에 미니 썸네일 네비게이션
- 전환 애니메이션 (fade/slide)

UIX-2.3.5 [복잡도: 낮] 장비 슬롯 UI
- 3개 슬롯 (무기/방어구/악세서리)
- 빈 슬롯 시각적 표시
- 탭하면 인벤토리 필터링 상태로 이동
```

### 2.4 GachaScene (1275줄)
**현재 상태**:
- 단일 소환(젬 300) / 10연속 소환(젬 3000) 버튼
- 소환 애니메이션 (카드 뒤집기)
- 결과 표시 (획득 캐릭터 목록)

**개선 계획**:
```
UIX-2.4.1 [복잡도: 높음] 배너 시스템 UI
- 슬라이더 형태 (여러 배너 전환)
- 각 배너 픽업 캐릭터 표시
- 배너별 확률 정보 버튼

UIX-2.4.2 [복잡도: 중] 확률표 팝업
- Modal로 전체 확률 표시
- ★5 0.5%, ★4 4.5%, ★3 20%, ★2 35%, ★1 40%
- 법적 요구사항 준수 (확률 명시)

UIX-2.4.3 [복잡도: 중] 소환 히스토리
- 최근 50회 소환 기록
- 획득 캐릭터 목록 (등급별 색상)
- "내역 지우기" 기능

UIX-2.4.4 [복잡도: 중] 천장 시스템 UI
- 프로그레스 바 (99/100)
- "다음 ★5 확정까지 X회" 표시
- 천장 도달 시 확정 선택 UI

UIX-2.4.5 [복잡도: 낮] 재화 부족 상태
- 젬 부족 시 "충전" 버튼
- 필요 젬 vs 현재 젬 명확하게 표시
```

### 2.5 StageSelectScene (867줄)
**현재 상태**:
- 스테이지 버튼 리스트 (1-1 ~ 5-10)
- 스테이지별 별점 표시
- 에너지 소모 안내

**개선 계획**:
```
UIX-2.5.1 [복잡도: 높음] 챕터 맵 UI
- 노드 연결 형태 (맵 경로)
- 현재 진행 위치 하이라이트
- 잠긴 스테이지 시각적 표시

UIX-2.5.2 [복잡도: 중] 별점 진행도 표시
- 챕터별 총 별점 (30개 중 15개 획득)
- 별 3개 조건 명확하게 표시
- 보상 정보 (별점 달성 보상)

UIX-2.5.3 [복잡도: 낮] 보스 스테이지 강조
- 5, 10, 15, 20, 25, 30, ... 스테이지 특수 아이콘
- 보스 정보 미리보기

UIX-2.5.4 [복잡도: 낮] 에너지 관리 UI
- 상단에 에너지 바 고정
- 회복 시간 카운트다운
- 에너지 부족 시 알림
```

### 2.6 BattleScene (2006줄)
**현재 상태**:
- 아군/적군 캐릭터 표시 (원 + 이니셜)
- HP 바, 스킬 카드, 턴 순서 바
- 자동전투/배속 토글

**개선 계획**:
```
UIX-2.6.1 [복잡도: 중] HP 바 고도화
- 그라데이션 효과 (녹색 → 노랑 → 빨강)
- 데미지 예측 (반투명 레이어)
- 실드/버프 표시 (HP 바 위 아이콘)

UIX-2.6.2 [복잡도: 중] 스킬 카드 UI 개선
- 사용 가능/불가 상태 명확하게 구분
- 쿨다운 오버레이 (어두운 레이어 + 숫자)
- 스킬 위력 표시 (데미지 범위)

UIX-2.6.3 [복잡도: 중] 턴 순서 바 개선
- 현재 행동 캐릭터 확대/하이라이트
- 다음 3턴 미리보기
- 속도 버프/디버프 표시

UIX-2.6.4 [복잡도: 낮] 타겟 선택 UI
- 적 터치 시 테두리 하이라이트
- 범위 스킬 시 대상 표시
- 타겟 정보 툴팁 (HP, 약점)

UIX-2.6.5 [복잡도: 낮] 자동전투/배속 UI
- 토글 버튼 위치 표준화 (우상단)
- 배속 3단계 (1x/2x/4x)
- 일시정지 버튼 추가

UIX-2.6.6 [복잡도: 낮] 전투 결과 UI
- 승리/패배 모달 개선
- 획득 경험치/골드/아이템 명확하게
- "다음 스테이지" / "재도전" 버튼
```

### 2.7 PartyEditScene (619줄)
**현재 상태**:
- 4칸 파티 슬롯
- 영웅 목록 (클릭으로 추가/제거)
- 시너지 표시

**개선 계획**:
```
UIX-2.7.1 [복잡도: 높음] 드래그&드롭 편성
- 영웅 카드를 슬롯으로 드래그
- 슬롯 간 위치 교환
- 드롭 가능 영역 하이라이트

UIX-2.7.2 [복잡도: 중] 시너지 미리보기 패널
- 하단 고정 패널
- 활성 시너지 목록 (아이콘 + 이름)
- 시너지 조건 미달 시 반투명 표시

UIX-2.7.3 [복잡도: 중] 추천 파티 시스템
- "추천 파티" 버튼 (AI 자동 편성)
- 저장된 파티 프리셋 (최대 3개)
- 프리셋 이름 커스터마이징

UIX-2.7.4 [복잡도: 낮] 빈 슬롯 시각화
- 점선 테두리 + "+" 아이콘
- 탭하면 영웅 목록으로 스크롤
```

### 2.8 InventoryScene (512줄)
**현재 상태**:
- 아이템 그리드 (3열)
- 장비/판매 버튼

**개선 계획**:
```
UIX-2.8.1 [복잡도: 중] 장비 비교 팝업
- 현재 장착 아이템 vs 새 아이템
- 스탯 차이 (+5 ATK, -2 DEF 등)
- "장착" / "취소" 버튼

UIX-2.8.2 [복잡도: 중] 필터 탭 UI
- 상단 탭 (무기/방어구/악세서리/소비/기타)
- 탭별 아이콘 표시
- 현재 탭 하이라이트

UIX-2.8.3 [복잡도: 중] 일괄 판매 기능
- 체크박스 선택 모드
- "전체 선택" / "선택 해제" 버튼
- 예상 획득 골드 표시

UIX-2.8.4 [복잡도: 낮] 정렬 옵션
- 드롭다운 (등급/종류/획득일)
- 오름차순/내림차순 토글
```

---

## 3. 공통 UI 개선

### 3.1 디자인 시스템 통일
```
UIX-3.1.1 [복잡도: 중] 색상 팔레트 정의
- 기본: 배경(#1a1a2e), 강조(#16213e), 텍스트(#ffffff)
- 등급: ★1(#808080), ★2(#c0c0c0), ★3(#4169e1), ★4(#9370db), ★5(#ffd700)
- 분위기: brave(#e74c3c), fierce(#c0392b), wild(#8b4513), calm(#3498db), stoic(#2c3e50), devoted(#f39c12), cunning(#9b59b6), noble(#e8e8e8), mystic(#2ecc71)
- 교단: olympus(#ffffff), takamagahara(#ff6b6b), yomi(#4a4a4a), asgard(#00a8ff), valhalla(#ffd93d), tartarus(#1e1e1e), avalon(#6bcf7f), helheim(#7f8c8d), kunlun(#ff6348)
- 상태: 성공(#27ae60), 경고(#f39c12), 에러(#e74c3c), 정보(#3498db)

UIX-3.1.2 [복잡도: 낮] 폰트 시스템 통일
- textStyles.js 활용 강화
- 계층 정의: title(32px), header(24px), body(16px), caption(12px)
- 굵기: regular(400), medium(500), bold(700)

UIX-3.1.3 [복잡도: 낮] 간격/여백 표준
- 4px 단위 (4, 8, 12, 16, 24, 32, 48)
- 패널 내부 패딩: 16px
- 카드 간격: 12px
- 섹션 간격: 24px
```

### 3.2 반응형 레이아웃
```
UIX-3.2.1 [복잡도: 중] 다양한 해상도 대응
- 기준: 720x1280 (16:9 세로)
- 대응 비율: 9:16, 10:16, 9:18, 9:19, 9:20
- layoutConfig.js에 비율별 좌표 계산 함수 추가

UIX-3.2.2 [복잡도: 낮] Safe Area 대응
- 노치/홈 인디케이터 영역 회피
- 상단바/하단바 위치 조정
```

### 3.3 로딩 및 에러 상태
```
UIX-3.3.1 [복잡도: 낮] 로딩 인디케이터
- LoadingSpinner 컴포넌트 전역 사용
- 시스템 호출 시 자동 표시
- 최소 표시 시간: 300ms (깜빡임 방지)

UIX-3.3.2 [복잡도: 중] 에러 상태 UI
- 네트워크 에러 모달
- 빈 목록 상태 (영웅 없음, 아이템 없음)
- "재시도" 버튼

UIX-3.3.3 [복잡도: 낮] Toast 메시지 활용
- 짧은 피드백 (골드 획득, 저장 완료 등)
- 3초 자동 사라짐
- 큐잉 시스템 (여러 메시지 순차 표시)
```

### 3.4 접근성 개선
```
UIX-3.4.1 [복잡도: 중] 색각이상 대응
- 색상만으로 정보 전달 금지
- 아이콘/텍스트/패턴 병행 사용
- 분위기/등급/교단 구분에 텍스트 레이블 추가

UIX-3.4.2 [복잡도: 낮] 터치 영역 최적화
- 최소 44x44px 보장
- 버튼 간 간격 최소 8px
- 터치 피드백 (눌림 효과)

UIX-3.4.3 [복잡도: 낮] 폰트 크기 조정 옵션
- 설정에서 폰트 크기 선택 (작게/보통/크게)
- textStyles.js에 스케일 적용
```

---

## 4. 구현된 로직 무결성 검증 계획

### 4.1 씬 초기화 검증
```
UIX-4.1.1 [복잡도: 중] create() 메서드 검증
검증 항목:
- 필수 데이터 존재 확인 (registry.get('player'), characters, items 등)
- null/undefined 방어 코드 추가
- 데이터 없을 시 PreloadScene으로 리디렉션

검증 대상 씬:
- MainMenuScene: player 데이터 필수
- HeroListScene: ownedHeroes 배열 필수
- HeroDetailScene: selectedHero 객체 필수
- BattleScene: party 배열, enemies 배열 필수
- GachaScene: player.gems 필수
- InventoryScene: ownedItems 배열 필수

예시 코드:
```javascript
create(data) {
  const player = this.registry.get('player');
  if (!player) {
    console.error('[HeroListScene] player 데이터 없음');
    this.scene.start('PreloadScene');
    return;
  }
  // ... 정상 초기화
}
```

UIX-4.1.2 [복잡도: 낮] 씬 전환 데이터 전달 검증
검증 항목:
- scene.start(name, data) vs registry 사용 일관성
- data 객체 구조 명확하게 정의
- 수신 씬에서 data 검증

예시 패턴:
```javascript
// 발신 씬
this.scene.start('HeroDetailScene', {
  heroId: hero.id,
  source: 'HeroListScene'
});

// 수신 씬
create(data) {
  if (!data?.heroId) {
    console.error('heroId 없음');
    this.scene.start('HeroListScene');
    return;
  }
  const hero = this.heroManager.getHeroById(data.heroId);
  if (!hero) {
    console.error('존재하지 않는 영웅');
    this.scene.start('HeroListScene');
    return;
  }
  // ... 정상 처리
}
```
```

### 4.2 시스템 호출 무결성 검증
```
UIX-4.2.1 [복잡도: 중] 반환값 null/undefined 방어
검증 대상 시스템:
- HeroManager: getHeroById(), getAllHeroes()
- GachaSystem: performSummon()
- ProgressionSystem: earnExperience()
- ItemManager: getItemById(), equipItem()
- PartyManager: getParty(), setParty()
- EnergySystem: hasEnergy(), consumeEnergy()

예시 패턴:
```javascript
// AS-IS (위험)
const hero = this.heroManager.getHeroById(id);
this.showHeroDetail(hero); // hero가 null이면 에러

// TO-BE (안전)
const hero = this.heroManager.getHeroById(id);
if (!hero) {
  console.error(`존재하지 않는 영웅: ${id}`);
  this.showToast('영웅을 찾을 수 없습니다');
  return;
}
this.showHeroDetail(hero);
```

UIX-4.2.2 [복잡도: 낮] 시스템 초기화 순서 검증
검증 항목:
- SaveManager 초기화 → 다른 시스템 초기화
- 시스템 간 의존성 명확하게 정의
- 초기화 실패 시 에러 핸들링

MainMenuScene create() 검증:
```javascript
create() {
  // 1. SaveManager 로드 완료 확인
  const player = this.registry.get('player');
  if (!player) {
    console.error('SaveManager 초기화 실패');
    this.scene.start('PreloadScene');
    return;
  }

  // 2. 시스템 초기화
  this.heroManager = HeroManager.getInstance();
  this.gachaSystem = GachaSystem.getInstance();
  // ...

  // 3. 시스템 사용
  this.createUI();
}
```
```

### 4.3 이벤트 리스너 메모리 누수 방지
```
UIX-4.3.1 [복잡도: 중] 이벤트 해제 검증
검증 항목:
- shutdown() 메서드에 모든 이벤트 해제 코드 추가
- 타이머/트윈 정리
- 시스템 이벤트 구독 해제

예시 패턴:
```javascript
// create()에서 이벤트 등록
create() {
  this.updateEnergy = () => {
    // ...
  };
  this.time.addEvent({
    delay: 1000,
    callback: this.updateEnergy,
    loop: true
  });

  this.heroAddedHandler = (hero) => {
    // ...
  };
  this.heroManager.on('heroAdded', this.heroAddedHandler);
}

// shutdown()에서 정리
shutdown() {
  // 타이머 정리
  this.time.removeAllEvents();

  // 시스템 이벤트 해제
  if (this.heroManager && this.heroAddedHandler) {
    this.heroManager.off('heroAdded', this.heroAddedHandler);
  }

  // 트윈 정리
  this.tweens.killAll();
}
```

UIX-4.3.2 [복잡도: 낮] 컴포넌트 정리 검증
검증 항목:
- Panel, Modal 등 컴포넌트 destroy() 호출
- 씬 전환 시 활성 컴포넌트 모두 정리

예시:
```javascript
shutdown() {
  // 모달 정리
  if (this.activeModal) {
    this.activeModal.destroy();
    this.activeModal = null;
  }

  // 패널 정리
  this.panels.forEach(panel => panel.destroy());
  this.panels = [];
}
```
```

### 4.4 데이터 흐름 무결성 검증
```
UIX-4.4.1 [복잡도: 높음] SaveManager 저장/로드 일관성
검증 항목:
- 저장 데이터 구조 버전 관리
- 로드 실패 시 기본값 제공
- 저장 전후 데이터 일치성 확인

저장 데이터 스키마:
```javascript
{
  version: '1.0.0', // 버전 추가
  player: {
    name: string,
    level: number,
    exp: number,
    gold: number,
    gems: number
  },
  ownedHeroes: [
    {
      id: string,
      level: number,
      exp: number,
      equipment: { weapon?, armor?, accessory? }
    }
  ],
  ownedItems: [
    { id: string, quantity: number }
  ],
  party: [string], // hero IDs
  stageProgress: {
    currentStage: string,
    completedStages: [string],
    starRatings: { [stageId]: number }
  },
  gachaState: {
    pityCounter: number
  },
  energy: {
    current: number,
    lastUpdate: number // timestamp
  },
  settings: {
    bgmVolume: number,
    sfxVolume: number,
    autoSpeed: number
  }
}
```

검증 로직:
```javascript
// SaveManager.js
loadGame() {
  const savedData = localStorage.getItem('arcaneCollectors_save');
  if (!savedData) {
    return this.getDefaultSaveData();
  }

  try {
    const data = JSON.parse(savedData);

    // 버전 검증
    if (!data.version || data.version !== this.CURRENT_VERSION) {
      console.warn('저장 데이터 버전 불일치, 마이그레이션 시도');
      return this.migrateSaveData(data);
    }

    // 필수 필드 검증
    if (!data.player || !data.ownedHeroes || !data.party) {
      console.error('저장 데이터 필수 필드 누락');
      return this.getDefaultSaveData();
    }

    return data;
  } catch (e) {
    console.error('저장 데이터 파싱 실패', e);
    return this.getDefaultSaveData();
  }
}
```

UIX-4.4.2 [복잡도: 중] GachaSystem → HeroManager 데이터 흐름
검증 항목:
- performSummon() 반환 영웅이 ownedHeroes에 정확하게 추가되는지
- 중복 영웅 처리 (파편 변환)
- 젬 소모 원자성 (소환 실패 시 롤백)

검증 코드:
```javascript
// GachaScene.js
async performSummon(count) {
  const cost = count === 1 ? 300 : 3000;
  const player = this.registry.get('player');

  // 1. 젬 검증
  if (player.gems < cost) {
    this.showToast('젬이 부족합니다');
    return;
  }

  // 2. 소환 실행
  let results;
  try {
    results = this.gachaSystem.performSummon(count);
  } catch (e) {
    console.error('소환 실패', e);
    this.showToast('소환 중 오류가 발생했습니다');
    return;
  }

  // 3. 젬 소모 (소환 성공 후)
  player.gems -= cost;

  // 4. 영웅 추가
  const ownedHeroes = this.registry.get('ownedHeroes') || [];
  results.forEach(hero => {
    const existing = ownedHeroes.find(h => h.id === hero.id);
    if (existing) {
      // 중복: 파편 변환
      const fragments = this.getFragmentsByRarity(hero.rarity);
      player.heroFragments = (player.heroFragments || 0) + fragments;
      console.log(`중복 영웅 ${hero.name} → 파편 ${fragments}개`);
    } else {
      // 신규 획득
      ownedHeroes.push({
        id: hero.id,
        level: 1,
        exp: 0,
        equipment: {}
      });
      console.log(`신규 영웅 획득: ${hero.name}`);
    }
  });

  // 5. 저장
  this.saveManager.saveGame();

  // 6. UI 업데이트
  this.showResults(results);
}
```

UIX-4.4.3 [복잡도: 중] BattleSystem → ProgressionSystem → SaveManager 보상 체인
검증 항목:
- 전투 승리 → 경험치/골드 지급
- 보상 누락 방지
- 저장 실패 시 보상 손실 방지

검증 코드:
```javascript
// BattleScene.js
async handleVictory() {
  const player = this.registry.get('player');
  const stage = this.currentStage;

  // 1. 보상 계산
  const rewards = {
    gold: stage.rewards.gold,
    exp: stage.rewards.exp,
    items: stage.rewards.items || []
  };

  console.log('[BattleScene] 보상 지급 시작', rewards);

  // 2. 골드 지급
  player.gold += rewards.gold;

  // 3. 경험치 지급 (파티 전원)
  const party = this.registry.get('party') || [];
  const ownedHeroes = this.registry.get('ownedHeroes') || [];

  party.forEach(heroId => {
    const hero = ownedHeroes.find(h => h.id === heroId);
    if (hero) {
      const levelUpResult = this.progressionSystem.earnExperience(hero, rewards.exp);
      if (levelUpResult.leveledUp) {
        console.log(`${hero.name} 레벨업! ${levelUpResult.newLevel}`);
      }
    } else {
      console.error(`파티 영웅 ${heroId} 없음`);
    }
  });

  // 4. 아이템 지급
  const ownedItems = this.registry.get('ownedItems') || [];
  rewards.items.forEach(itemDrop => {
    const existing = ownedItems.find(i => i.id === itemDrop.id);
    if (existing) {
      existing.quantity += itemDrop.quantity;
    } else {
      ownedItems.push({ id: itemDrop.id, quantity: itemDrop.quantity });
    }
  });

  // 5. 스테이지 진행 상태 업데이트
  const stageProgress = this.registry.get('stageProgress') || {
    currentStage: '1-1',
    completedStages: [],
    starRatings: {}
  };

  if (!stageProgress.completedStages.includes(stage.id)) {
    stageProgress.completedStages.push(stage.id);
  }

  const stars = this.calculateStars();
  stageProgress.starRatings[stage.id] = Math.max(
    stageProgress.starRatings[stage.id] || 0,
    stars
  );

  // 6. 저장
  try {
    this.saveManager.saveGame();
    console.log('[BattleScene] 보상 저장 완료');
  } catch (e) {
    console.error('[BattleScene] 저장 실패', e);
    this.showToast('보상 저장 실패, 재시도 중...');
    // 재시도 로직
    await this.retrySave();
  }

  // 7. 결과 UI 표시
  this.showVictoryScreen(rewards);
}
```
```

### 4.5 EnergySystem 시간 기반 로직 검증
```
UIX-4.5.1 [복잡도: 높음] 엣지 케이스 검증
검증 항목:
- 시간 역행 (시스템 시간 변경)
- 대량 시간 경과 (앱 종료 후 며칠 뒤 재실행)
- 최대 에너지 초과 방지
- 에너지 회복 중 최대치 변경 (레벨업 등)

검증 코드:
```javascript
// EnergySystem.js
updateEnergy() {
  const player = this.registry.get('player');
  const energy = this.registry.get('energy') || {
    current: this.MAX_ENERGY,
    lastUpdate: Date.now()
  };

  const now = Date.now();
  const elapsed = now - energy.lastUpdate;

  // 1. 시간 역행 검증
  if (elapsed < 0) {
    console.warn('[EnergySystem] 시간 역행 감지, 에너지 초기화');
    energy.current = Math.min(energy.current, this.MAX_ENERGY);
    energy.lastUpdate = now;
    this.saveManager.saveGame();
    return energy.current;
  }

  // 2. 이미 최대치면 회복 안 함
  if (energy.current >= this.MAX_ENERGY) {
    energy.lastUpdate = now;
    return energy.current;
  }

  // 3. 회복량 계산
  const recoveredEnergy = Math.floor(elapsed / this.RECOVERY_TIME);
  if (recoveredEnergy > 0) {
    energy.current = Math.min(energy.current + recoveredEnergy, this.MAX_ENERGY);
    energy.lastUpdate = now - (elapsed % this.RECOVERY_TIME); // 소수점 시간 보존

    console.log(`[EnergySystem] 에너지 회복: +${recoveredEnergy} → ${energy.current}/${this.MAX_ENERGY}`);
    this.saveManager.saveGame();
  }

  return energy.current;
}

consumeEnergy(amount) {
  const energy = this.registry.get('energy');

  // 1. 에너지 부족
  if (energy.current < amount) {
    console.warn('[EnergySystem] 에너지 부족');
    return false;
  }

  // 2. 소모
  energy.current -= amount;
  energy.lastUpdate = Date.now();

  console.log(`[EnergySystem] 에너지 소모: -${amount} → ${energy.current}/${this.MAX_ENERGY}`);
  this.saveManager.saveGame();
  return true;
}

getRecoveryTimeRemaining() {
  const energy = this.registry.get('energy');
  if (energy.current >= this.MAX_ENERGY) {
    return 0;
  }

  const elapsed = Date.now() - energy.lastUpdate;
  const remaining = this.RECOVERY_TIME - (elapsed % this.RECOVERY_TIME);
  return Math.max(remaining, 0);
}
```

UIX-4.5.2 [복잡도: 중] 에너지 UI 실시간 업데이트
검증 항목:
- MainMenuScene, StageSelectScene에서 1초마다 에너지 바 업데이트
- 회복 완료 시 UI 반영
- 에너지 소모 시 즉시 UI 반영

예시:
```javascript
// MainMenuScene.js
create() {
  // ... UI 생성

  // 에너지 업데이트 타이머
  this.time.addEvent({
    delay: 1000,
    callback: () => {
      const current = this.energySystem.updateEnergy();
      const remaining = this.energySystem.getRecoveryTimeRemaining();

      this.energyBar.setValue(current, this.energySystem.MAX_ENERGY);
      this.energyText.setText(`${current}/${this.energySystem.MAX_ENERGY}`);

      if (remaining > 0 && current < this.energySystem.MAX_ENERGY) {
        const seconds = Math.ceil(remaining / 1000);
        this.energyTimerText.setText(`${seconds}초 후 회복`);
      } else {
        this.energyTimerText.setText('');
      }
    },
    loop: true
  });
}
```
```

---

## 5. 태스크 분류 및 우선순위

### Phase 1: 기초 무결성 (2주)
**목표**: 치명적 버그 제거, 기본 UX 개선

| Task ID | 설명 | 복잡도 | 담당 영역 |
|---------|------|--------|-----------|
| UIX-4.1.1 | 씬 초기화 검증 | 중 | 로직 무결성 |
| UIX-4.2.1 | 시스템 호출 null 방어 | 중 | 로직 무결성 |
| UIX-4.4.1 | SaveManager 일관성 검증 | 높음 | 로직 무결성 |
| UIX-3.1.1 | 색상 팔레트 정의 | 중 | 디자인 시스템 |
| UIX-3.1.2 | 폰트 시스템 통일 | 낮음 | 디자인 시스템 |
| UIX-3.3.1 | 로딩 인디케이터 | 낮음 | 공통 UI |
| UIX-3.4.2 | 터치 영역 최적화 | 낮음 | 접근성 |

**검증 기준**:
- [ ] 모든 씬에서 데이터 없음 시 크래시 안 남
- [ ] 시스템 호출 null 에러 0건
- [ ] 저장/로드 10회 연속 성공
- [ ] 모든 버튼 44px 이상
- [ ] 색상/폰트 일관성 90% 이상

### Phase 2: 핵심 씬 개선 (3주)
**목표**: 사용 빈도 높은 씬 UX 고도화

| Task ID | 설명 | 복잡도 | 담당 영역 |
|---------|------|--------|-----------|
| UIX-2.1.1 | MainMenu 상단바 개선 | 중 | MainMenuScene |
| UIX-2.1.3 | 오프라인 보상 UI | 중 | MainMenuScene |
| UIX-2.2.1 | HeroList 그리드 최적화 | 중 | HeroListScene |
| UIX-2.2.2 | HeroList 필터/정렬 UI | 높음 | HeroListScene |
| UIX-2.6.1 | Battle HP 바 개선 | 중 | BattleScene |
| UIX-2.6.2 | Battle 스킬 카드 UI | 중 | BattleScene |
| UIX-4.3.1 | 이벤트 리스너 정리 검증 | 중 | 로직 무결성 |
| UIX-4.4.2 | Gacha 데이터 흐름 검증 | 중 | 로직 무결성 |

**검증 기준**:
- [ ] HeroListScene 300명 로드 시 60fps 유지
- [ ] BattleScene HP 바 데미지 예측 정확도 100%
- [ ] 필터/정렬 3초 내 완료
- [ ] 메모리 누수 0건 (10회 씬 전환)

### Phase 3: 고급 기능 (3주)
**목표**: 사용성 극대화, 고급 기능 구현

| Task ID | 설명 | 복잡도 | 담당 영역 |
|---------|------|--------|-----------|
| UIX-2.3.1 | HeroDetail 스탯 그래프 | 높음 | HeroDetailScene |
| UIX-2.4.1 | Gacha 배너 시스템 | 높음 | GachaScene |
| UIX-2.5.1 | StageSelect 챕터 맵 UI | 높음 | StageSelectScene |
| UIX-2.7.1 | PartyEdit 드래그&드롭 | 높음 | PartyEditScene |
| UIX-3.2.1 | 반응형 레이아웃 | 중 | 공통 UI |
| UIX-4.4.3 | Battle 보상 체인 검증 | 중 | 로직 무결성 |
| UIX-4.5.1 | Energy 엣지 케이스 검증 | 높음 | 로직 무결성 |

**검증 기준**:
- [ ] 드래그&드롭 터치 정확도 95% 이상
- [ ] 챕터 맵 50개 스테이지 렌더링 60fps
- [ ] 3가지 해상도에서 UI 깨짐 없음
- [ ] 보상 체인 100회 연속 누락 0건

### Phase 4: 접근성 및 폴리싱 (2주)
**목표**: 접근성 개선, 마이너 개선 사항

| Task ID | 설명 | 복잡도 | 담당 영역 |
|---------|------|--------|-----------|
| UIX-2.2.3 | HeroList 검색 기능 | 중 | HeroListScene |
| UIX-2.3.4 | HeroDetail 캐릭터 전환 | 중 | HeroDetailScene |
| UIX-2.6.3 | Battle 턴 순서 바 개선 | 중 | BattleScene |
| UIX-2.8.1 | Inventory 장비 비교 | 중 | InventoryScene |
| UIX-3.3.2 | 에러 상태 UI | 중 | 공통 UI |
| UIX-3.4.1 | 색각이상 대응 | 중 | 접근성 |
| UIX-3.4.3 | 폰트 크기 조정 옵션 | 낮음 | 접근성 |

**검증 기준**:
- [ ] 검색 응답 시간 300ms 이하
- [ ] 색각이상 시뮬레이션 테스트 통과
- [ ] 폰트 크기 3단계 모두 UI 깨짐 없음

---

## 6. 구현 가이드라인

### 6.1 컴포넌트 재사용
- 기존 14개 컴포넌트 최대한 활용
- 새 컴포넌트 추가 시 `src/components/` 구조 준수
- Props 인터페이스 명확하게 정의

### 6.2 성능 최적화
- 그리드/리스트는 가상 스크롤 고려 (100개 이상 아이템)
- 애니메이션은 Phaser Tween 활용 (60fps 목표)
- 텍스처 캐싱 (반복 사용 그래픽)

### 6.3 테스트 전략
- 각 Phase 완료 시 통합 테스트
- 실제 디바이스 테스트 (Android/iOS)
- 엣지 케이스 시나리오 문서화

### 6.4 롤백 계획
- 각 Task 브랜치 개발 (`task/UIX-X.X`)
- 기능 단위 커밋 (atomic commits)
- 문제 발생 시 이전 커밋으로 복원

---

## 7. 검증 체크리스트

### 씬별 검증
- [ ] MainMenuScene: 플레이어 정보 표시, 에너지 실시간 업데이트, 메뉴 버튼 44px
- [ ] HeroListScene: 91명 렌더링 60fps, 필터/정렬 3초 이내, 검색 300ms
- [ ] HeroDetailScene: 스탯 그래프 정확도, 스킬 설명 명확성, 슬라이드 제스처
- [ ] GachaScene: 배너 전환 매끄러움, 확률표 정확성, 결과 표시 명확
- [ ] StageSelectScene: 챕터 맵 렌더링, 별점 진행도, 잠긴 스테이지 표시
- [ ] BattleScene: HP 바 데미지 예측, 스킬 쿨다운 표시, 턴 순서 명확
- [ ] PartyEditScene: 드래그&드롭 정확도, 시너지 미리보기, 추천 파티
- [ ] InventoryScene: 장비 비교 명확성, 필터 탭 반응성, 일괄 판매 확인

### 로직 무결성 검증
- [ ] 모든 씬에서 필수 데이터 null 체크
- [ ] 시스템 호출 반환값 방어 코드
- [ ] 씬 전환 시 이벤트 리스너 정리
- [ ] 저장/로드 10회 연속 성공
- [ ] Gacha → HeroManager 데이터 흐름 무결성
- [ ] Battle → Progression → Save 보상 체인 무결성
- [ ] Energy 시간 역행/대량 경과 엣지 케이스

### 접근성 검증
- [ ] 색각이상 시뮬레이션 (Deuteranopia, Protanopia, Tritanopia)
- [ ] 모든 인터랙티브 요소 44px 이상
- [ ] 폰트 크기 3단계 (80%, 100%, 120%) UI 깨짐 없음
- [ ] 색상 외 정보 전달 수단 (아이콘/텍스트) 제공

### 성능 검증
- [ ] 60fps 유지 (모든 씬)
- [ ] 씬 전환 300ms 이내
- [ ] 메모리 사용량 200MB 이하
- [ ] 번들 사이즈 3MB 이하 (gzip)

---

## 8. 관련 문서
- `14_CHARACTER_DESIGN.md`: 캐릭터 디자인 가이드
- `18_RESOURCE_ASSETS.md`: 에셋 교체 계획
- `src/config/layoutConfig.js`: UI 레이아웃 설정
- `src/config/gameConfig.js`: Phaser 게임 설정
- `src/utils/textStyles.js`: 폰트 스타일 정의

---

## 변경 이력
- **1.0** (2026-02-07): 초안 작성
