# VFX-2.1 스킬 애니메이션 시스템 — 실행 요약

**Task ID:** VFX-2.1 | **Sprint:** W4 | **Date:** 2026-02-08  
**Status:** ✅ ARCHITECTURE DESIGN COMPLETE

---

## 핵심 설계 요약

### 목표
**BattleScene에서 스킬 애니메이션을 Promise 기반 Phase 시퀀싱으로 구현하여, 각 애니메이션 단계(Windup → Impact → Recovery)를 정확하게 제어하고, 데미지 적용 시점을 시각적 영향과 동기화한다.**

### 현황
- BattleScene은 독립적인 전투 로직 보유 (BattleSystem과 분리)
- 기존 애니메이션은 fire-and-forget (완료 추적 불가)
- ParticleManager는 기본 메서드만 제공 (Promise 미지원)

### 솔루션
4단계 구현:
1. **C1**: 설정 파일 (skillAnimationConfig.js) 생성 — 타이밍, VFX 매핑, 성능 한계
2. **C2**: ParticleManager 확장 — Async 메서드 추가, 완료 시점 추적 가능
3. **C3**: SkillAnimationManager 신규 생성 — Phase 오케스트레이션, Promise 기반
4. **C4**: BattleScene 통합 — processTurnV2 비동기화, onImpact 콜백 메커니즘

---

## 실행 순서

| 단계 | 파일 | 줄수 | 위험도 |
|------|------|------|--------|
| C1 | `src/config/skillAnimationConfig.js` | ~250 | 🟢 LOW |
| C2 | `src/systems/ParticleManager.js` | +~120 | 🟢 LOW |
| C3 | `src/systems/SkillAnimationManager.js` | ~450 | 🟡 MEDIUM |
| C4 | `src/scenes/BattleScene.js` | ~80 변경 | 🔴 HIGH |

**총 작업량:** 800줄 신규 + 80줄 수정

---

## 핵심 아키텍처

### Phase 기반 시퀀싱

```
playNormalSkill(attacker, target, skill)
  ├─ Phase 1: Windup(100ms)     → 공격자 강조
  ├─ Phase 2: Impact(150ms)     → 파티클 + onImpact 콜백 (데미지 적용)
  └─ Phase 3: Recovery(150ms)   → 원위치

playUltimateSkill(attacker, target, skill)
  ├─ Phase 0: CutIn(600ms)      → 컷인 연출
  ├─ Phase 1: Windup(300ms)     → 공격자 강조
  ├─ Phase 2: Impact(500ms)     → 대규모 파티클 + onImpact
  └─ Phase 3: Recovery(600ms)   → 원위치

playHealAnimation(healer, target, skill)
  ├─ Phase 1: Cast(200ms)       → 시전
  ├─ Phase 2: Effect(300ms)     → 힐 파티클 + onImpact
  └─ Phase 3: Recovery(100ms)   → 원위치
```

### onImpact 콜백 메커니즘

Impact 시점에 데미지/회복 적용:
```javascript
await skillAnimator.playNormalSkill(attacker, target, skill, sprites, {
  onImpact: () => {
    // 데미지 계산 + UI 업데이트 + 로그
    this._applyDamageOrHeal(attacker, target, skill, isUltimate);
  }
});
```

**이점:**
- 파티클 영향 시점 = 데미지 표시 시점
- 시각적 일관성 보장
- 애니메이션과 게임 로직 동기화

---

## 리스크 & 완화 전략

| 리스크 | 심각도 | 완화 |
|--------|--------|------|
| processTurnV2 비동기 전환 실패 | 🔴 HIGH | Feature Flag, 기존 메서드 레거시로 보존 |
| 모바일 FPS 미달 | 🔴 HIGH | FPS 자동 감지, 품질 조절 |
| Promise 라이프사이클 충돌 | 🔴 HIGH | AbortController, signal.aborted 체크 |
| 파티클 풀 고갈 | 🟡 MEDIUM | AoE 파티클 50% 감소, 풀 모니터링 |
| 배속 적용 누락 | 🟢 LOW | speedMul = 1/battleSpeed, 모든 duration에 적용 |

---

## Feature Flag 롤백

즉시 롤백 가능 (커밋 revert 필요 없음):
```javascript
// BattleScene.create()에서
this.useNewAnimations = false;  // 기존 로직 사용

// processTurn()에서
if (this.useNewAnimations) {
  this.processTurnV2();         // 새 비동기 버전
} else {
  this.processTurnLegacy();     // 기존 delayedCall 버전
}
```

---

## 검증 체크리스트

### 단위 검증 (V1~V8)
- [ ] 일반 공격 ≤400ms
- [ ] skill1 ≤800ms
- [ ] skill2 + 컷인 ≤2000ms
- [ ] 힐 ≤600ms
- [ ] 파티클 풀 ≤50 동시
- [ ] AbortController 동작
- [ ] 배속 2x/3x 정확성
- [ ] onImpact 콜백 타이밍

### 통합 검증 (I1~I7)
- [ ] 30턴 자동 전투
- [ ] 씬 전환 안정성
- [ ] 메모리 누수 <10%
- [ ] Feature Flag 롤백
- [ ] 수동 모드 호환
- [ ] AoE 스킬 3적
- [ ] 데미지 숫자 동기화

### 성능 검증 (P1~P4)
- [ ] 모바일 FPS ≥30fps
- [ ] 극한 상황 ≥25fps
- [ ] CPU <60%
- [ ] 메모리 peak <20MB

### VFX 검증 (9개 분위기 × 4가지)
- [ ] brave/fierce/wild/calm/stoic/devoted/cunning/noble/mystic 각각
  - [ ] 기본공격 hit
  - [ ] skill1
  - [ ] skill2 + 컷인
  - [ ] 힐 (해당 분위기만)

---

## 예상 일정

| 단계 | 시간 | 담당자 |
|------|------|--------|
| C1: 설정 파일 | 1-2시간 | 아키텍트 |
| C2: ParticleManager 확장 | 2-3시간 | 실행자 |
| C3: SkillAnimationManager | 4-6시간 | 실행자 |
| C4: BattleScene 통합 | 3-5시간 | 실행자 |
| 검증 및 최적화 | 4-8시간 | QA |
| **총합** | **15-25시간** | - |

---

## 성공 기준

### 기능
- ✅ Phase 기반 시퀀싱 (Windup → Impact → Recovery)
- ✅ Promise 기반 완료 추적
- ✅ 배속 1x/2x/3x 적용
- ✅ AoE 순차 처리
- ✅ Feature Flag 롤백

### 성능
- ✅ 애니메이션 타이밍 정확 (±10ms)
- ✅ 모바일 FPS ≥30fps
- ✅ 메모리 누수 <10% per 10회

### 안정성
- ✅ Scene 전환 중 에러 없음
- ✅ 30턴 자동 전투 안정성
- ✅ 수동 모드 호환

---

## 다음 단계

1. **C1 검토 및 승인** → C1 구현 시작
2. **C1~C4 순차 구현** (각 단계 간 2-3일 간격)
3. **검증 계획 4.1~4.4 실행** (병렬 QA)
4. **릴리스 준비** (Feature Flag 전환 계획)

---

**세부 설계:** `docs/ARCHITECTURE_VFX-2.1.md` 참고
