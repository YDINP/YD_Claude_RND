# ArcaneCollectors 시스템 통합 진행 상황

## 완료 일자: 2026-02-07

## 통합 점수: ~15% → ~85%

## 완료된 작업

### Phase 1: 인프라 기초
- ✅ `src/systems/index.js` — 17개 전체 시스템 barrel export 완성
- ✅ `src/data/index.js` — 레거시(personality/element) 없음 확인

### Phase 2: 핵심 3대 시스템 와이어링
- ✅ MoodSystem → BattleScene: 데미지 계산에 mood 상성 배율(1.2/0.8/1.0) 적용, 상성 표시 UI(▲유리/▼불리), 적에게 랜덤 mood 부여
- ✅ GachaSystem → GachaScene: 인라인 rollGacha() → GachaSystem.pull() 교체, 천장 카운터 동적화, characters.json 연동
- ✅ EnergySystem → StageSelectScene: "⚡ 50/50" 하드코딩 → energySystem.getStatus() 동적 표시, 전투 시 에너지 차감

### Phase 3: 시스템 간 체인 완성
- ✅ SynergySystem → BattleScene: 하드코딩 class 시너지 → SynergySystem.calculatePartySynergies() 교체 (cult/mood/role/special 4종)
- ✅ PartyManager → StageSelectScene: 파티 슬롯 5→4, autoFormParty() 위임, 시너지 미리보기 표시
- ✅ ProgressionSystem → BattleScene: 전투 승리 시 캐릭터 EXP 지급 + 레벨업, 별점 성과 기반 계산(1~3★)

### Phase 4: 데이터 동적 로드 + 정리
- ✅ stages.json 동적 로드: generateStages() → getChapterStages() 우선, 폴백 유지
- ✅ HeroDetailScene 육성 저장 연결: 5곳 registry.set 후 SaveManager.updateCharacter() 추가
- ✅ DebugManager ESM 수정: require() → import 변환, barrel export 추가

## 수정된 파일 (7개)
1. `src/systems/index.js` — 17개 시스템 barrel export
2. `src/scenes/BattleScene.js` — MoodSystem + SynergySystem + ProgressionSystem 통합
3. `src/scenes/GachaScene.js` — GachaSystem 교체
4. `src/scenes/StageSelectScene.js` — EnergySystem + PartyManager + stages.json 연결
5. `src/scenes/HeroDetailScene.js` — SaveManager 영속화 추가
6. `src/systems/DebugManager.js` — ESM 호환 수정
7. `src/systems/index.js` — DebugManager export 추가
