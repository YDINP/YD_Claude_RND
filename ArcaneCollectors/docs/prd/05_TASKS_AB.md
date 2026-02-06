# 5-1. TASK 상세: Team A (전투 통합) + Team B (신규 씬 & UI)
> 원본: PRD_Unified_v5.md §5 (lines 527-882)

## 5. 세분화된 TASK (상호작용 로직 중심)

> 모든 TASK는 "발견→연결"이 아닌 **"유저가 터치→시스템 반응→UI 갱신→저장"** 완전 체인으로 구현

### 팀별 추론 프로토콜

모든 TASK 실행 전, 담당 팀은 다음 추론 단계를 수행:

```
1. [탐색] explore 에이전트가 관련 코드 전체 스캔
2. [분석] analyst가 잠재적 이슈 5가지 이상 도출
3. [설계] architect가 구현 방안 + 에지 케이스 대응 설계
4. [리뷰] code-reviewer가 설계 리뷰 (LGTM 필요)
5. [구현] executor가 코드 작성
6. [검증] qa-tester가 유저 시나리오 테스트
7. [빌드] build-fixer가 빌드 성공 확인
```

---

### TEAM A TASK (전투 통합) - 상세

#### A-1: systems/index.js 완전 barrel export
**유저 상호작용**: 없음 (인프라)
**서브 태스크**:
- A-1.1: 17개 시스템 파일 모두 import 문 추가
- A-1.2: 각 시스템의 싱글톤 인스턴스 또는 클래스 export 패턴 통일
- A-1.3: 순환 의존성(circular dependency) 검사 및 해결
- A-1.4: 각 Scene에서 import 테스트 (tree-shaking 확인)
**추론 체크리스트**:
- [ ] BattleSystem ↔ SaveManager 순환 참조?
- [ ] EventBus를 import하는 시스템이 EventBus보다 먼저 초기화되는가?
- [ ] 지연 로딩(lazy import) vs 즉시 로딩(eager import) 전략 결정
**확장 아이디어**: 시스템 초기화 순서 매니저 구현 (SystemBootstrap)

#### A-2: MoodSystem → BattleScene 완전 연결
**유저 상호작용 체인**:
```
유저가 전투 시작 → 적 공격 시 분위기 상성 계산 →
데미지 숫자 색상 변화(유리=노랑↑, 불리=파랑↓) →
전투 로그에 "상성 유리!" 표시
```
**서브 태스크**:
- A-2.1: BattleScene에 MoodSystem import
- A-2.2: `calculateElementBonus()` → `calculateMoodBonus()` 교체 (v5.2)
  - 기존 element 기반 로직 완전 제거, mood 상성 적용
  - MoodSystem.getMatchupMultiplier(attacker, defender) 호출
- A-2.3: 데미지 표시 UI에 상성 인디케이터 추가
  - 유리: 데미지 텍스트 노란색 + "▲" + 스케일 1.3x
  - 불리: 데미지 텍스트 파란색 + "▼" + 스케일 0.8x
  - Mystic: 중립 흰색 표시
- A-2.4: 전투 로그에 상성 정보 추가
- A-2.5: 턴 오더 바에 분위기(mood) 아이콘 표시
**추론 체크리스트**:
- [x] 적(enemy)에게도 mood 속성 필요 → enemies.json의 element→mood 마이그레이션 (v5.2 결정)
- [x] 적에 mood 없으면 기본값 'neutral' 처리
- [ ] Mystic 성격의 중립 처리가 모든 조합에서 정확한가?
- [ ] 상성 보너스가 시너지 보너스와 중첩될 때 밸런스 문제?
- [x] 기존 세이브 데이터의 element→mood 마이그레이션: SaveManager.load() 시 자동 변환 (v5.2 결정)

#### A-3: SynergySystem 실시간 전투 반영
**유저 상호작용 체인**:
```
파티 편성 시 시너지 미리보기 → 전투 시작 시 시너지 버프 적용 →
SynergyDisplay에 활성 시너지 표시 → 스탯 패널에 버프 수치 반영
```
**서브 태스크**:
- A-3.1: 파티 편성 시 실시간 시너지 미리보기 UI
- A-3.2: 전투 시작 시 SynergySystem.calculate(party) → 버프 목록 생성
- A-3.3: 버프를 BattleUnit 스탯에 실제 적용
- A-3.4: SynergyDisplay 컴포넌트에 활성 시너지 이름+아이콘+수치 표시
- A-3.5: 시너지 변경 시 (캐릭터 사망) 실시간 재계산
**확장 아이디어**: 시너지 조합 도감 (어떤 캐릭터 조합이 어떤 시너지 발동하는지)

#### A-4: 별점(Star Rating) 성과 기반 계산
**유저 상호작용 체인**:
```
전투 클리어 → 성과 분석 (턴수, 생존자, HP잔량) →
1~3성 결과 애니메이션 → 별점별 보상 차등 지급
```
**서브 태스크**:
- A-4.1: `newStars = 3` 하드코딩 제거
- A-4.2: 별점 계산 함수 구현
  ```javascript
  calculateStarRating(turns, survivors, totalParty, avgHpPercent) {
    if (survivors === totalParty && turns <= 10) return 3;
    if (survivors >= totalParty * 0.5 || turns <= 20) return 2;
    return 1;
  }
  ```
- A-4.3: 별점별 보상 배율: 1성(60%), 2성(80%), 3성(100%)
- A-4.4: 결과 화면에 별 애니메이션 (하나씩 점등)
- A-4.5: 최초 3성 클리어 시 소탕 해금 알림 표시
**추론 체크리스트**:
- [ ] 기존 clearedStages 데이터와 호환성 (기존 3 하드코딩 데이터)
- [ ] 별점이 기존보다 낮아질 때 갱신 여부 (최고 기록만 유지)

#### A-5: 카드 덱 스킬 시스템 완전 검증
**유저 상호작용 체인**:
```
매 턴 스킬 카드 3장 표시 → 유저가 카드 터치 →
타겟 선택 (수동 모드) → 스킬 발동 + 이펙트 →
스킬 게이지 충전 → 궁극기 충전 완료 시 빛남 표시
```
**서브 태스크**:
- A-5.1: 카드 드로우 로직 검증 (중복 방지, 덱 소진 시 리셔플)
- A-5.2: 수동 모드: 카드 선택 → 타겟 선택 → 실행 체인 검증
- A-5.3: 자동 모드: AI 카드 선택 로직 (가장 효율적 카드)
- A-5.4: 궁극기 게이지: 충전 조건, 충전 속도, 발동 조건
- A-5.5: 스킬 카드 비활성 조건 (MP 부족, 쿨다운)

#### A-6: 자동전투 AI 스마트 로직
**서브 태스크**:
- A-6.1: 적 HP 기반 스킬 선택 (광역 vs 단일 판단)
- A-6.2: 아군 HP 기반 힐 우선순위 (HP<30% 시 힐러 우선 행동)
- A-6.3: 상성 유리 타겟 우선 공격
- A-6.4: 궁극기 자동 사용 타이밍 (보스전 시 보존)
- A-6.5: 배속 1x/2x/3x 실제 애니메이션 속도 조절
**확장 아이디어**: AI 전략 프리셋 (공격적/수비적/밸런스)

#### A-7: 전투 결과 → 보상 → 저장 완전 체인
**유저 상호작용 체인**:
```
전투 승리 → 골드 획득 + 캐릭터 EXP 획득 + 아이템 드롭 →
레벨업 시 알림 → SaveManager 저장 →
registry 갱신 → StageSelectScene 복귀 시 UI 반영
```
**서브 태스크**:
- A-7.1: 골드 보상 → SaveManager.addGold() + registry 갱신
- A-7.2: 캐릭터 EXP → ProgressionSystem.addExp() → 레벨업 체크
- A-7.3: 레벨업 시 스탯 갱신 + 알림 UI
- A-7.4: 아이템 드롭 → SaveManager.addToInventory()
- A-7.5: 캐릭터 조각(fragment) 드롭 (스테이지별 특정 캐릭터)
- A-7.6: 첫 클리어 보너스 (보석 추가 지급)
**확장 아이디어**: MVP(Most Valuable Player) 선정 및 보너스 EXP

#### A-8: 전투 이펙트 & 연출 고도화
**서브 태스크**:
- A-8.1: 스킬별 파티클 이펙트 (Phaser.GameObjects.Particles)
- A-8.2: 데미지 숫자 폰트/크기/색상 세분화
- A-8.3: 크리티컬 히트 화면 흔들림 + 특수 사운드
- A-8.4: 궁극기 컷인 연출 (캐릭터 초상 줌인)
- A-8.5: 전투 시작/종료 트랜지션 연출

---

### TEAM B TASK (신규 씬 & UI) - 상세

#### B-1: TowerScene 신규 생성
**유저 상호작용 체인**:
```
메인 메뉴 "탑" 탭 터치 → TowerScene 전환 →
현재 층 표시 + 보상 미리보기 → "도전" 터치 →
파티 선택 → BattleScene(탑 모드) →
클리어 → 다음 층 해금 + 보상 수령
```
**서브 태스크**:
- B-1.1: TowerScene 기본 레이아웃 (세로 스크롤 타워 맵)
- B-1.2: 층별 카드 UI (층 번호, 난이도, 보상, 클리어 여부)
- B-1.3: 보스 층(10의 배수) 특별 표시 (빨간 테두리, 보스 아이콘)
- B-1.4: "도전" 버튼 → 파티 선택 → BattleScene 전달 (mode: 'tower')
- B-1.5: TowerSystem.clearFloor() 연결 → 보상 수령 팝업
- B-1.6: 최고 기록 표시 + 서버 랭킹 (선택)
- B-1.7: gameConfig.js에 Scene 등록
- B-1.8: BottomNav에 "탑" 탭 추가
**추론 체크리스트**:
- [ ] TowerSystem의 `// TODO: 장비 생성 및 지급` (line 194) 해결
- [ ] 에너지 소모 여부? (탑은 무료? 또는 별도 입장권?)
- [ ] 시즌 리셋 시 UI 처리

#### B-2: StageSelectScene → stages.json 동적 로드
**유저 상호작용 체인**:
```
"모험" 탭 터치 → 5개 챕터 탭 표시 →
챕터 터치 → 5개 스테이지 카드 로드 →
잠금/해금/별점 상태 표시 → 스테이지 터치 →
파티 편성 → 전투 시작
```
**서브 태스크**:
- B-2.1: `generateStages()` 하드코딩 완전 제거
- B-2.2: `import { getAllChapters, getChapterStages } from '../data/index.js'` 연결
- B-2.3: 5개 챕터 탭 UI (교단 테마 색상 적용)
- B-2.4: 스테이지 카드: 잠금/해금/클리어 3상태 표시
- B-2.5: 클리어 별점 표시 (SaveManager.getStageStars())
- B-2.6: 스테이지 잠금 해제 조건 (이전 스테이지 클리어)
- B-2.7: 각 챕터 보스 스테이지(5번) 특별 표시
- B-2.8: 파티 슬롯 수 수정: 5개(현재 코드) → 4개(`PARTY.PARTY_SIZE` 일치)
- B-2.9: PartyManager 연동 (현재 완전 미사용 → 파티 저장/로드 기능 활성화)
**확장 아이디어**: 챕터 진행도 % 표시, 올 3성 클리어 보너스 보상

#### B-3: EnergySystem ↔ StageSelectScene 실시간 연결
**유저 상호작용 체인**:
```
StageSelectScene 진입 → 에너지 바 실시간 표시 (45/50) →
스테이지 비용 표시 (⚡6) → 에너지 부족 시 빨간 표시 →
전투 시작 시 consumeEnergy() → 에너지 바 즉시 갱신 →
회복 타이머 표시 (다음 회복: 2:30)
```
**서브 태스크**:
- B-3.1: EnergySystem import 및 initialize()
- B-3.2: EnergyBar 컴포넌트를 StageSelectScene 상단에 배치
- B-3.3: 실시간 에너지 표시 (현재/최대)
- B-3.4: 각 스테이지 카드에 비용 표시 (EnergySystem.getStageCost())
- B-3.5: 에너지 부족 시 스테이지 카드 비활성 + 빨간 텍스트
- B-3.6: startBattle() 전에 canEnterStage() → consumeEnergy() 체인
- B-3.7: 에너지 부족 시 "에너지 충전" 팝업 (보석 충전 옵션)
- B-3.8: 회복 타이머 카운트다운 표시
- B-3.9: update() 메서드에서 매 프레임 에너지/타이머 갱신

#### B-4: SweepSystem UI 완전 구현
**유저 상호작용 체인**:
```
3성 클리어 스테이지에 "소탕" 버튼 표시 →
터치 → 횟수 선택 (1/5/10/최대) →
에너지/소탕권 확인 → 실행 →
보상 요약 팝업 (아이템 목록 + 수량) → 확인
```
**서브 태스크**:
- B-4.1: 3성 클리어 스테이지 카드에 "소탕" 버튼 표시
- B-4.2: 소탕 횟수 선택 모달 (1/5/10/남은 에너지 전부)
- B-4.3: SweepSystem.canSweep() 검증 → 에러 메시지 표시
- B-4.4: SweepSystem.executeSweep() 실행 → 에너지/소탕권 차감
- B-4.5: 보상 요약 팝업 (아이템별 아이콘 + 수량)
- B-4.6: 남은 일일 소탕 횟수 표시

#### B-5: LoginScene 인증 UI
**서브 태스크**:
- B-5.1: 타이틀 화면 (게임 로고 + 배경 애니메이션)
- B-5.2: "게스트로 시작" 버튼 (즉시 게임 진입)
- B-5.3: "이메일 로그인" 버튼 → 로그인 폼 모달
- B-5.4: AuthService 연결
- B-5.5: Scene 흐름: Boot → Login → Preload → MainMenu

#### B-6: QuestScene 퀘스트 UI
**서브 태스크**:
- B-6.1: 일일/주간/업적 3탭 UI
- B-6.2: 퀘스트 카드 (이름, 진행도 바, 보상 미리보기)
- B-6.3: 완료 퀘스트 "수령" 버튼 → claimReward()
- B-6.4: 전체 수령 버튼 → claimAllRewards()
- B-6.5: 리셋 타이머 표시

#### B-7: 장비 가챠 활성화
**서브 태스크**:
- B-7.1: GachaScene 장비 탭 "준비 중" 제거
- B-7.2: EquipmentSystem.createEquipment() 연결
- B-7.3: 장비 등급별 소환 연출
- B-7.4: 결과 장비 → SaveManager 저장

---
