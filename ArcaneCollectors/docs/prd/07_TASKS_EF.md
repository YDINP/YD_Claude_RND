# 5-3. TASK 상세: Team E (캐릭터 데이터) + Team F (씬/패널 검증)
> 원본: PRD_Unified_v5.md §5 (lines 1038-1312)

### TEAM E TASK (캐릭터 데이터 설계) - 상세

#### E-1: 기존 캐릭터 데이터 감사 (Audit)
**서브 태스크**:
- E-1.1: 39명 캐릭터 필수 필드 완전성 검증 (id, name, nameKo, rarity, mood, cult, role, baseStats, growthStats, skills, description)
- E-1.2: 등급 분포 확인: 현재 N:0, R:7, SR:16, SSR:16 → N등급 부재 확인
- E-1.3: asgard 교단 캐릭터 3명 → 6명 추가 필요
- E-1.4: 스킬 ID가 skills.json과 정확히 매칭되는지 검증
- E-1.5: baseStats 범위가 등급별 기준에 부합하는지 확인
**추론 체크리스트**:
- [ ] characters.json 스키마와 코드 내 참조 필드가 일치하는가?
- [ ] 중복 ID가 없는가?
- [ ] 각 교단 내 역할(warrior/mage/archer/healer) 분포가 균등한가?

#### E-2: 누락 캐릭터 데이터 설계 (52명)
**서브 태스크**:
- E-2.1: asgard 교단 6명 추가 (현재 3명 → 총 9명)
- E-2.2: N등급(2성) 캐릭터 15명 추가 (각 교단 3명)
- E-2.3: 나머지 교단 확장: 각 교단 ~16명까지 추가
- E-2.4: 역할(warrior/mage/archer/healer) 균등 분포
- E-2.5: 분위기(brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic) 균등 분포 (9종)
- E-2.6: 캐릭터 이름(영문+한글), 설명, 배경 스토리 작성
- E-2.7: 추가 캐릭터 characters.json에 통합
**설계 원칙**: 각 교단 내에서 역할/성격의 조합이 최대한 다양하도록

#### E-3: 캐릭터 스탯 밸런스 설계
**서브 태스크**:
- E-3.1: 등급별 baseStats 범위 표준화 (N/R/SR/SSR)
- E-3.2: 역할별 스탯 경향 적용 (warrior: HP/DEF↑, mage: ATK↑↑, archer: SPD/ATK↑, healer: HP/SPD↑)
- E-3.3: growthStats 등급/역할별 표준화
- E-3.4: 전투력(power) 계산식 검증: ATK×1 + HP×0.5 + DEF×0.8 + SPD×0.3
- E-3.5: 기존 39명 스탯 재조정 (불균형 수정)

#### E-4: 스킬 데이터 확장 및 밸런스
**서브 태스크**:
- E-4.1: 캐릭터별 스킬 3개(기본/액티브/궁극기) 체계 확인
- E-4.2: 스킬 타입별 효과: damage, heal, buff, debuff, aoe
- E-4.3: 스킬 레벨업 수치 증가율 (레벨당 +5~10%)
- E-4.4: 분위기(mood)별 특화 스킬 효과 (brave→공격력UP, calm→방어력UP 등)
- E-4.5: 52명 추가 캐릭터용 스킬 156개(52×3) 작성

#### E-5: 장비 데이터 확장 (4→81개)
**서브 태스크**:
- E-5.1: 4슬롯(weapon/armor/accessory/relic) × 등급(N/R/SR/SSR) 구조 설계
- E-5.2: 역할별 특화 장비 (전사용 대검, 마법사용 지팡이 등)
- E-5.3: 장비 기본 스탯 및 강화 수치 (+1~+15)
- E-5.4: 장비 세트 효과 (동일 세트 2/4개 장착 시 보너스)
- E-5.5: 장비 가챠 풀 데이터 구성 (등급별 확률)
- E-5.6: 최소 40개 이상 장비 데이터 1차 구성

#### E-6: 적(Enemy) 데이터 확장
**서브 태스크**:
- E-6.1: 5챕터 × 5스테이지 × 3~4적 = 최소 60종 적 데이터
- E-6.2: 보스 몬스터 5종 (각 챕터 마지막 스테이지)
- E-6.3: 엘리트 몬스터 10종 (챕터당 2종)
- E-6.4: 일반 몬스터 테마별 (올림포스: 하피, 미노타우로스 등)
- E-6.5: 무한의 탑 전용 보스 10종 (10/20/30/...층)
- E-6.6: 적 mood 분위기 부여 (enemies.json element→mood 마이그레이션, 상성 시스템 활용)

#### E-7: 시너지 데이터 검증 및 확장
**서브 태스크**:
- E-7.1: 교단 시너지 5개로 확장 (현재 3개)
- E-7.2: 분위기 시너지로 확장 (9종 분위기 기반)
- E-7.3: 역할 시너지 추가 (전사+힐러, 마법사+궁수 등)
- E-7.4: 특수 시너지: 특정 캐릭터 조합 보너스 (스토리 기반)
- E-7.5: 시너지 효과 밸런스 (너무 강력하지 않게 ±15% 이내)

#### E-8: 캐릭터 비주얼 에셋 가이드
**서브 태스크**:
- E-8.1: 42명 추가 캐릭터 외형 설명서 (AI 이미지 생성용 프롬프트)
- E-8.2: 교단별 비주얼 테마 가이드 (olympus: 그리스 신전/금색, takamagahara: 벚꽃/전통 의상 등)
- E-8.3: 등급별 이미지 퀄리티: SSR(전신+배경), SR(전신), R(반신), N(아이콘)
- E-8.4: n8n 워크플로우 연동 프롬프트 가이드

#### E-9: N등급 캐릭터 설계 (16명)
**서브 태스크**:
- E-9.1: 각 교단 3-4명의 N등급 캐릭터 설계
- E-9.2: N등급 스탯 범위: HP 300-400, ATK 30-40, DEF 25-35, SPD 80-90
- E-9.3: N등급 스킬: 기본 공격 1개만 (no active/ultimate)
- E-9.4: N등급 캐릭터 설명 (간단)
**설계 원칙**: N등급은 초반 파티 구성용, 중후반에는 진화 재료로 사용

#### E-10: 캐릭터 밸런스 시뮬레이션
**서브 태스크**:
- E-10.1: scientist-high가 전 캐릭터 1:1 시뮬레이션 (1000회)
- E-10.2: 등급 간 승률 분석 (SSR vs SR, SR vs R 등)
- E-10.3: 상성 시스템 효과 분석
- E-10.4: 시너지 보너스의 실제 영향도 측정
- E-10.5: 불균형 캐릭터 발견 시 스탯 조정 제안

---

### TEAM F TASK (씬/패널 로직 검증) - 상세

#### F-1: BootScene 로직 검증
**검증 항목**:
- SaveManager 초기화 및 데이터 로드 정상 동작
- 오프라인 보상 계산 정확도 (lastOnline → 현재 시간 차이)
- registry 값 설정 (gems, gold, pityCounter, ownedHeroes, clearedStages, battleSpeed)
- Scene 전환 타이밍 (Splash → PreloadScene)
- 첫 실행 시 초기 데이터 설정

#### F-2: PreloadScene 에셋 로딩 검증
**검증 항목**:
- 모든 필요 에셋 프리로드 완료 여부
- 로딩 진행바 정확도
- 에셋 로딩 실패 시 에러 핸들링
- 추가 Scene(Tower, Login, Quest)용 에셋 로드 추가 필요 여부

#### F-3: MainMenuScene 데이터 바인딩 검증
**검증 항목**:
- TopBar: 골드/보석 표시가 실시간 갱신되는지
- BottomNav: 각 탭 터치 → 올바른 Scene 전환
- 대표 캐릭터 표시: ownedHeroes[0] 기반 동적 렌더링
- 오프라인 보상 팝업: 보상 수령 → 재화 반영
- "메뉴" 탭: "준비 중" 토스트 → 실제 기능 연결 (설정/쿠폰/디버그)
- 에너지 표시 여부 (현재 MainMenu에 에너지 바 없음)

#### F-4: GachaScene 데이터 흐름 검증
**검증 항목**:
- 보석 소비: 단일(300), 10연차(2,700) 정확한 차감
- 소환 결과: GachaSystem의 확률 테이블과 일치하는지
- 천장(pity) 카운터: 90회 진행 시 SSR 확정
- 픽업 배너: banners.json 데이터 반영
- 소환 연출: N/R/SR/SSR 등급별 차별화
- 결과 캐릭터 → ownedHeroes에 저장
- 중복 캐릭터 → 캐릭터 조각(fragment) 변환
- 장비 탭: 비활성화 상태 → 활성화 필요

#### F-5: HeroListScene 표시 로직 검증
**검증 항목**:
- 보유 캐릭터 목록 정확히 표시
- 정렬 기능: 등급순, 레벨순, 전투력순
- 필터 기능: 교단별, 성격별, 역할별
- HeroCard 컴포넌트: 올바른 데이터 바인딩 (이름, 등급색상, 레벨, 전투력)
- 카드 터치 → HeroDetailScene 전환 (올바른 캐릭터 ID 전달)
- 빈 목록 시 안내 메시지

#### F-6: HeroDetailScene 육성 시스템 검증
**검증 항목**:
- 레벨업: 경험치 물약 소비 → 레벨 증가 → 스탯 갱신
- 스킬 강화: 스킬북 소비 → 스킬 레벨업 → 효과 증가
- 진화(Evolution): 캐릭터 조각 소비 → 성급 증가
  - `HeroService.js:336` TODO: "조각 소모 로직 (InventoryService 연동)" 미구현
- 장비 장착: 4슬롯(weapon/armor/accessory/relic) 동작
- 장비 교체/해제 동작
- 스탯 그래프(레이더 차트) 정확도
- 성격/교단 정보 표시
- 전투력 실시간 계산
**⚠️ 신규 발견 치명적 문제**:
- **[C7] 레벨업/진화/스킬강화 시 registry만 업데이트, SaveManager 미호출**
  → 새로고침 시 골드 복원, 변경사항 손실
  → 수정: 모든 재화 변경 후 `SaveManager.spendGold()` 등 호출 필수
- **[H7] EquipmentSystem, ProgressionSystem Dead Import** (import 후 미호출)
  → 수정: ProgressionSystem.levelUp() 활용, EquipmentSystem.equip() 활용
- **[H8] 빈 장비 슬롯 클릭 → "준비 중"** (장비 선택 UI 미구현)
  → 수정: 보유 장비 목록 팝업 UI 구현
- **스탯 증가율 하드코딩** (HP 5%, ATK 3%, DEF 3%, SPD 1%)
  → 수정: ProgressionSystem 또는 gameConfig에서 참조
- **레벨업 비용 하드코딩** (`level * 100 + 200`)
  → 수정: ProgressionSystem.getLevelUpCost() 사용

#### F-7: StageSelectScene 전체 로직 검증
**검증 항목**:
- 챕터 데이터: stages.json 기반 동적 로드 (하드코딩 제거 후)
- 스테이지 잠금/해금: 이전 스테이지 클리어 기반
- 클리어 별점 표시: SaveManager의 clearedStages 데이터
- 파티 선택 모달: PartyManager 연동
- autoFillParty: 자동 최강 파티 편성 동작
- 전투 시작: 올바른 스테이지 데이터 → BattleScene 전달
- 에너지 표시/차감: EnergySystem 연동 (연결 후)
- 소탕 버튼: SweepSystem 연동 (추가 후)
- 총 전투력 계산: 파티 4인 전투력 합산 정확도

#### F-8: BattleScene 전체 로직 검증
**검증 항목**:
- 전투 초기화: 아군/적 유닛 생성 (스탯 정확도)
- 턴 순서: SPD 기반 정렬 정확도
- 스킬 카드: 덱에서 3장 드로우, 선택 시 효과 적용
- 데미지 계산: ATK - DEF + 랜덤 요소 + 성격 상성 (연결 후)
- HP 바: 실시간 갱신
- 자동전투 토글: 수동↔자동 전환
- 배속: 1x/2x/3x 실제 속도 변경
- 전투 종료 조건: 전멸 판정 정확도
- 승리 시: 보상 지급, 별점 계산, 스테이지 클리어 기록
- 패배 시: 결과 화면, 재도전 옵션
- 시너지 표시: SynergyDisplay 데이터 정확도

#### F-9: 공통 컴포넌트 일관성 검증
**검증 항목**:
- Button: 터치/클릭 반응, 비활성 상태, 그라데이션 스타일
- Panel: 배경 처리, 둥근 모서리(12px), 그림자
- TopBar: 재화 표시 갱신, 레이아웃 일관성
- BottomNav: 선택 상태 표시, 아이콘 정확도, 새 탭 추가 대응
- Modal: 오버레이 터치 닫기, 애니메이션
- Toast: 자동 소멸 타이머, 위치 일관성
- ProgressBar: 퍼센트 정확도, 색상 변화
- StarRating: 1~6성 표시 (진화 포함)
- EnergyBar: 실시간 업데이트, 회복 타이머

#### F-10: EventBus 이벤트 흐름 매핑
**검증 항목**:
- 발행(emit)되는 모든 이벤트 목록 작성
- 구독(on)하는 모든 이벤트 리스너 매핑
- 이벤트 발행 → 구독 짝(pair) 매칭 확인
- 구독만 있고 발행 없는 이벤트 (dead listener)
- 발행만 있고 구독 없는 이벤트 (dead event)
- Scene 전환 시 리스너 해제(cleanup) 확인 → 메모리 누수 방지
- constants.js의 EVENTS 상수와 실제 사용 일치

#### F-11: GachaScene ↔ GachaSystem 상호작용 완전 검증
**검증 체인**:
```
1. 보석 300개 보유 확인 → 단일소환 버튼 활성
2. 터치 → GachaSystem.canPull() 체크
3. → GachaSystem.pull() 호출 → rarity 결정
4. → characters.json에서 해당 rarity 캐릭터 랜덤 선택
5. → SaveManager.addCharacter() 호출
6. → registry.ownedHeroes 갱신
7. → pityCounter 갱신 + 저장
8. → 보석 차감 (SaveManager.spendGems())
9. → 소환 연출 재생
10. → 결과 캐릭터 카드 표시
11. → 중복 시 "조각 변환" 표시
```
**서브 태스크**:
- F-11.1: 위 체인 각 단계 정상 동작 확인
- F-11.2: 보석 부족 시 에러 메시지 표시 확인
- F-11.3: 10연차 시 10회 반복 + SR보장 확인
- F-11.4: 천장(90회) 정확 동작 확인
- F-11.5: 배너 전환 시 확률 변경 확인

#### F-12: 전체 데이터 흐름 무결성 검증
**서브 태스크**:
- F-12.1: registry ↔ SaveManager 데이터 동기화 검증
- F-12.2: Scene 전환 시 데이터 손실 여부 확인
- F-12.3: 새로고침(F5) 후 데이터 복원 확인
- F-12.4: 브라우저 탭 비활성→활성 시 데이터 정합성

---
