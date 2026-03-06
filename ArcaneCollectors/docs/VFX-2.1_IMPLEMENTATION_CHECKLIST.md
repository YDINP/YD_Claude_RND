# VFX-2.1 구현 체크리스트 & 기술 레퍼런스

---

## 📋 구현 체크리스트

### Phase 1: skillAnimationConfig.js 생성

**파일:** `src/config/skillAnimationConfig.js`

- [ ] SKILL_TIMINGS 정의
  - [ ] basic: 400ms (windup 100, impact 150, recovery 150)
  - [ ] skill1: 800ms (windup 200, impact 300, recovery 300)
  - [ ] skill2: 2000ms (cutIn 600, windup 300, impact 500, recovery 600)
  - [ ] heal: 600ms (cast 200, effect 300, recovery 100)

- [ ] MOOD_VFX_MAP 정의 (9개 분위기)
  - [ ] brave, fierce, wild, calm, stoic, devoted, cunning, noble, mystic
  - [ ] 각 mood: pattern, trail, impact, color

- [ ] ULTIMATE_CUTSCENE 정의
  - [ ] overlay: 200ms fade
  - [ ] portrait: 200ms zoom + 400ms hold
  - [ ] nameSlide: 150ms (delay 100ms)
  - [ ] fadeOut: 200ms
  - [ ] totalDuration: 600ms

- [ ] PERFORMANCE_LIMITS 정의
  - [ ] maxSimultaneousParticles: 50
  - [ ] maxSimultaneousTweens: 20
  - [ ] mobileTargetFPS: 30
  - [ ] particlePoolSize: 200
  - [ ] autoQualityThreshold: 25

- [ ] DEBUG_FLAGS 정의
  - [ ] logTimings: false
  - [ ] showPhaseLabels: false
  - [ ] disableParticles: false

- [ ] 테스트: `import` 가능 여부 확인

**✅ 완료 기준:** 파일 생성, 형식 오류 없음, import 테스트 통과

---

### Phase 2: ParticleManager.js 확장

**파일:** `src/systems/ParticleManager.js`

- [ ] `playMoodEffectAsync()` 메서드 추가
  - [ ] 입력: mood, x, y, type ('hit'|'skill'|'ultimate')
  - [ ] 동작: `playMoodEffect()` 호출 후 Promise 반환
  - [ ] 타이밍: hit 400ms, skill 600ms, ultimate 1200ms
  - [ ] Promise 해석 테스트

- [ ] `playMoodSkillPattern()` 메서드 추가
  - [ ] 입력: mood, x, y, moodVfxData
  - [ ] 동작: pattern (flame_burst, water_ripple 등) 기반 파티클
  - [ ] 시각적 검증: 분위기별 색상 일치

- [ ] `playMoodUltimatePattern()` 메서드 추가
  - [ ] 입력: mood, x, y, moodVfxData
  - [ ] 동작: 대규모 파티클 + 화면 흔들림
  - [ ] 성능: 파티클 ≤50개 유지

- [ ] `playHealEffectAsync()` 메서드 추가
  - [ ] 입력: x, y, mood
  - [ ] 동작: 녹색 힐 프리셋 + 반짝임
  - [ ] Promise 600ms 후 해석

- [ ] `getPoolStats()` 메서드 추가
  - [ ] 출력: { active, pooled, total, utilizationRate }
  - [ ] 용도: 성능 모니터링

- [ ] 기존 메서드 미수정 확인
  - [ ] `playMoodEffect()` 그대로 유지
  - [ ] `_playHitEffect()`, `_playSkillEffect()`, `_playUltimateEffect()` 유지
  - [ ] `showDamageNumber()` 유지

- [ ] 테스트
  - [ ] playMoodEffectAsync() Promise 해석 확인
  - [ ] playHealEffectAsync() 힐 이펙트 시각적 검증
  - [ ] 파티클 풀 상태 조회 동작 확인

**✅ 완료 기준:** 5개 메서드 추가, 기존 메서드 미변경, 단위 테스트 통과

---

### Phase 3: SkillAnimationManager.js 신규 생성

**파일:** `src/systems/SkillAnimationManager.js` (~450줄)

#### 3.1 클래스 구조

- [ ] 클래스 선언: `export class SkillAnimationManager`
- [ ] Constructor
  - [ ] `this.scene = scene`
  - [ ] `this.particles = particleManager`
  - [ ] `this.isAnimating = false`
  - [ ] `this.abortController = null`
  - [ ] `this.qualityLevel = 'high'`

#### 3.2 공개 메서드 (3개)

- [ ] `async playNormalSkill(attacker, target, skill, sprites, callbacks = {})`
  - [ ] AbortController 초기화
  - [ ] Phase 1: Windup
  - [ ] Phase 2: Impact + onImpact 콜백
  - [ ] Phase 3: Recovery
  - [ ] finally: isAnimating = false
  - [ ] 배속 적용: `speedMul = 1 / this.scene.battleSpeed`
  - [ ] Promise resolve 확인

- [ ] `async playUltimateSkill(attacker, target, skill, sprites, callbacks = {})`
  - [ ] AbortController 초기화
  - [ ] Phase 0: CutIn (600ms)
  - [ ] Phase 1: Windup
  - [ ] Phase 2: Impact (대규모 파티클)
  - [ ] Phase 3: Recovery
  - [ ] 화면 흔들림 (200ms, intensity 0.01)
  - [ ] 배속 적용
  - [ ] Promise resolve 확인

- [ ] `async playHealAnimation(healer, target, skill, sprites, callbacks = {})`
  - [ ] AbortController 초기화
  - [ ] Phase 1: Cast
  - [ ] Phase 2: Effect + onImpact
  - [ ] Phase 3: Recovery
  - [ ] 힐 파티클 호출
  - [ ] 배속 적용
  - [ ] Promise resolve 확인

#### 3.3 Phase 메서드 (내부)

- [ ] `async _playWindup(attacker, sprites, duration, signal)`
  - [ ] 타겟: attacker sprite
  - [ ] scaleX/Y 1.0 → 1.1 → 1.0
  - [ ] ease: Power2.easeInOut
  - [ ] signal.aborted 체크

- [ ] `async _playImpact(target, mood, sprites, duration, signal)`
  - [ ] ParticleManager.playMoodEffectAsync() 호출
  - [ ] 타겟 흔들림 (±8px, yoyo, repeat 1)
  - [ ] signal.aborted 체크

- [ ] `async _playImpactUltimate(target, mood, sprites, duration, signal)`
  - [ ] ParticleManager.playMoodEffectAsync(..., 'ultimate') 호출
  - [ ] 화면 흔들림 (200ms, 0.01)
  - [ ] 타겟 강한 흔들림 (±12px, repeat 2)
  - [ ] signal.aborted 체크

- [ ] `async _playRecovery(unit, sprites, duration, signal)`
  - [ ] scaleX/Y → 1.0
  - [ ] ease: Power2.easeOut
  - [ ] signal.aborted 체크

- [ ] `async _playCast(healer, sprites, duration, signal)`
  - [ ] scaleX/Y 1.0 → 0.95 → 1.0
  - [ ] ease: Sine.easeInOut
  - [ ] signal.aborted 체크

- [ ] `async _playHealEffect(target, mood, sprites, duration, signal)`
  - [ ] ParticleManager.playHealEffectAsync() 호출
  - [ ] 타겟 scaleX/Y 1.0 → 1.08 → 1.0 (yoyo)
  - [ ] signal.aborted 체크

- [ ] `async _playCutIn(attacker, duration, signal)`
  - [ ] 오버레이 생성 (투명 → alpha 0.8)
  - [ ] 텍스트 슬라이드 ("XXX - 궁극기 발동!")
  - [ ] 페이드 아웃
  - [ ] 리소스 정리 (destroy)
  - [ ] signal.aborted 체크

#### 3.4 유틸리티 메서드 (내부)

- [ ] `_tweenAsync(config)`
  - [ ] Phaser Tween을 Promise로 래핑
  - [ ] onComplete 콜백 실행 후 resolve
  - [ ] onStop 시 reject

- [ ] `_delay(ms)`
  - [ ] delayedCall을 Promise로 래핑
  - [ ] ms 후 resolve

- [ ] `_checkPerformance()`
  - [ ] 5초마다 FPS 체크
  - [ ] fps < 25 → qualityLevel = 'low'
  - [ ] fps < 45 → qualityLevel = 'medium'
  - [ ] 콘솔 경고

- [ ] `abort()`
  - [ ] abortController?.abort()
  - [ ] isAnimating = false

- [ ] `destroy()`
  - [ ] abort() 호출
  - [ ] this.scene = null
  - [ ] this.particles = null

#### 3.5 테스트

- [ ] playNormalSkill() Promise 해석
- [ ] playUltimateSkill() cutIn → impact → recovery 시퀀스
- [ ] playHealAnimation() 힐 파티클 표시
- [ ] 배속 1x/2x/3x 정확성 (±10ms)
- [ ] abort() signal 전파
- [ ] destroy() 리소스 정리

**✅ 완료 기준:** 클래스 ~450줄, 모든 메서드 구현, 단위 테스트 통과

---

### Phase 4: BattleScene.js 통합 (가장 위험)

**파일:** `src/scenes/BattleScene.js`

#### 4.1 Import 추가

- [ ] 상단에 추가:
  ```javascript
  import { SkillAnimationManager } from '../systems/SkillAnimationManager.js';
  ```

#### 4.2 Constructor 수정

- [ ] Feature Flag 추가:
  ```javascript
  constructor() {
    super({ key: 'BattleScene' });
    // ... 기존 코드 ...
    this.useNewAnimations = true;  // Feature Flag
  }
  ```

#### 4.3 create() 메서드 수정

- [ ] ParticleManager 초기화 후 SkillAnimationManager 추가:
  ```javascript
  this.particles = new ParticleManager(this);
  this.skillAnimator = new SkillAnimationManager(this, this.particles);
  ```

#### 4.4 processTurn() 메서드 수정

- [ ] Feature Flag 체크 로직 추가:
  ```javascript
  processTurn() {
    if (this.useNewAnimations) {
      return this.processTurnV2();
    } else {
      return this.processTurnLegacy();
    }
  }
  ```

#### 4.5 processTurnV2() 신규 메서드 추가

- [ ] 메서드 선언: `async processTurnV2()`
- [ ] isProcessingTurn 체크
- [ ] turn++ 및 UI 업데이트
- [ ] 턴 순서 정렬
- [ ] emitBattleEvent('turnStart')
- [ ] for...of 루프: 각 배틀러 await
  ```javascript
  for (const battler of activeBattlers) {
    if (this.battleEnded || !battler.isAlive) continue;
    await this.executeBattlerActionAsync(battler);
    if (this.checkBattleEnd()) {
      this.isProcessingTurn = false;
      return;
    }
  }
  ```
- [ ] 자동 모드: 턴간 대기 (200ms / battleSpeed)
- [ ] 수동 모드: waitingForManualInput = true

#### 4.6 processTurnLegacy() 신규 메서드 추가

- [ ] 기존 processTurn() 코드 복사 (레거시 폴백용)

#### 4.7 executeBattlerActionAsync() 신규 메서드 추가

- [ ] 메서드 선언: `async executeBattlerActionAsync(battler)`
- [ ] AI 결정 로직 (동기, 기존 로직 유지)
- [ ] 힐러 우선 로직:
  - [ ] hp < 50% 아군 찾기
  - [ ] skillAnimator.playHealAnimation() await
  - [ ] onImpact 콜백에서 회복 적용
- [ ] 스킬 선택 로직
  - [ ] skill2 우선, skill1 차선, basic 폴백
- [ ] AoE 처리:
  - [ ] skill.target === 'all' 시 모든 적에게 순차 공격
  - [ ] 각각 await skillAnimator.playUltimateSkill()
- [ ] 단일 대상 처리:
  - [ ] isUltimate 여부에 따라 playUltimateSkill() 또는 playNormalSkill()
  - [ ] onImpact 콜백에서 데미지 적용
- [ ] 게이지 처리 (스킬 사용 후 소비)

#### 4.8 _applyDamageOrHeal() 신규 메서드 추가

- [ ] 메서드 선언: `_applyDamageOrHeal(attacker, target, skill, isUltimate)`
- [ ] 회복 로직:
  - [ ] skill.isHeal 판정
  - [ ] 회복량 계산
  - [ ] updateBattlerUI(), showHealNumber() 호출
- [ ] 데미지 로직:
  - [ ] baseDamage × multiplier × critMultiplier × moodMultiplier 계산
  - [ ] updateBattlerUI(), showDamage() 호출
  - [ ] 사망 처리 (playDeathAnimation, emitBattleEvent)

#### 4.9 _getSprite() 유틸리티 메서드 추가

- [ ] 입력: battler
- [ ] 출력: battler.position에 해당하는 sprite

#### 4.10 _delay() 유틸리티 메서드 추가

- [ ] Promise 기반 delayedCall 래핑

#### 4.11 shutdown() 메서드 수정

- [ ] SkillAnimationManager 정리 추가:
  ```javascript
  if (this.skillAnimator) {
    this.skillAnimator.destroy();
    this.skillAnimator = null;
  }
  ```

#### 4.12 테스트

- [ ] Feature Flag = true/false 전환
- [ ] processTurnV2() 실행 흐름
- [ ] 배틀러 순차 액션 (각각 await)
- [ ] onImpact 콜백 타이밍
- [ ] 배속 1x/2x/3x 적용
- [ ] 자동 모드 / 수동 모드 전환
- [ ] Scene 전환 중 Promise 정리
- [ ] 30턴 전투 안정성

**✅ 완료 기준:** ~80줄 변경, 전체 전투 플로우 동작, Feature Flag 롤백 가능

---

## 🧪 단위 테스트 (V1~V8)

### V1: 일반 공격 애니메이션 완료

```javascript
test('playNormalSkill resolves within 400ms', async () => {
  const start = Date.now();
  await skillAnimator.playNormalSkill(attacker, target, skill, sprites);
  const duration = Date.now() - start;
  expect(duration).toBeLessThanOrEqual(400);
});
```

**성공 기준:** duration ≤ 400ms

---

### V2: skill1 타이밍 정확성

```javascript
test('skill1 animation respects SKILL_TIMINGS.skill1', async () => {
  const start = performance.now();
  await skillAnimator.playNormalSkill(attacker, target, skill1, sprites);
  const duration = performance.now() - start;
  expect(duration).toBeCloseTo(800, -1); // ±10ms
});
```

**성공 기준:** 800ms ± 10ms

---

### V3: skill2 궁극기 시퀀스

```javascript
test('playUltimateSkill has correct phase sequence', async () => {
  const phases = [];
  await skillAnimator.playUltimateSkill(attacker, target, skill2, sprites, {
    onImpact: () => phases.push('impact')
  });
  // 콘솔 로그로 cutIn, windup, impact, recovery 순서 확인
  expect(phases).toContain('impact');
});
```

**성공 기준:** cutIn → windup → impact → recovery 순서, ≤ 2000ms

---

### V4: 힐 애니메이션 완료

```javascript
test('playHealAnimation resolves within 600ms', async () => {
  const start = Date.now();
  await skillAnimator.playHealAnimation(healer, target, healSkill, sprites);
  const duration = Date.now() - start;
  expect(duration).toBeLessThanOrEqual(600);
});
```

**성공 기준:** duration ≤ 600ms

---

### V5: 파티클 풀 상태

```javascript
test('particle pool never exceeds maxSimultaneousParticles', () => {
  const stats = particles.getPoolStats();
  expect(parseInt(stats.active)).toBeLessThanOrEqual(50);
});
```

**성공 기준:** active ≤ 50

---

### V6: AbortController 동작

```javascript
test('abort() stops animation immediately', async () => {
  const promise = skillAnimator.playNormalSkill(attacker, target, skill, sprites);
  setTimeout(() => skillAnimator.abort(), 100);
  await promise; // 즉시 반환되어야 함
  expect(skillAnimator.isAnimating).toBe(false);
});
```

**성공 기준:** abort() 후 Promise 즉시 해석, isAnimating false

---

### V7: 배속 2x 적용

```javascript
test('2x speed reduces duration to ~50%', async () => {
  battleScene.battleSpeed = 2;
  const start = Date.now();
  await skillAnimator.playNormalSkill(attacker, target, skill, sprites);
  const duration = Date.now() - start;
  expect(duration).toBeLessThanOrEqual(220); // 400ms / 2 + margin
});
```

**성공 기준:** duration ≤ 220ms

---

### V8: 배속 3x 적용

```javascript
test('3x speed reduces duration to ~33%', async () => {
  battleScene.battleSpeed = 3;
  const start = Date.now();
  await skillAnimator.playNormalSkill(attacker, target, skill, sprites);
  const duration = Date.now() - start;
  expect(duration).toBeLessThanOrEqual(150); // 400ms / 3 + margin
});
```

**성공 기준:** duration ≤ 150ms

---

## 🔄 통합 테스트 (I1~I7)

### I1: 30턴 자동 전투

**절차:**
1. AUTO ON, 1x 속도로 전투 시작
2. 자동 30턴 진행
3. 승리/패배 도달
4. 콘솔 에러 확인

**성공 기준:** 에러 없이 완료

---

### I2: 씬 전환 안정성

**절차:**
1. 전투 중 퇴각 버튼 클릭
2. 승리 결과 화면 전환
3. 다시 전투 시작
4. 패배 시뮬레이션

**성공 기준:** Promise 잔류 에러 없음

---

### I3: 메모리 누수 검사

**절차:**
1. Chrome DevTools Memory 탭 열기
2. 힙 스냅샷 1 (초기)
3. 전투 10회 반복
4. 힙 스냅샷 2 (최종)
5. 증가율 계산

**성공 기준:** 증가율 < 10%

---

### I4: Feature Flag 롤백

**절차:**
1. useNewAnimations = false로 설정
2. 전투 3회 진행
3. 기존 로직 정상 동작 확인

**성공 기준:** 기존 delayedCall 버전 정상 동작

---

### I5: 수동 모드 호환

**절차:**
1. AUTO OFF 전환
2. 스킬 카드 클릭 (비활성화되어야 함)
3. "다음 턴" 버튼으로 진행
4. 다시 스킬 카드 클릭 시도

**성공 기준:** 애니메이션 중 클릭 무시, 완료 후 활성화

---

### I6: AoE 스킬 3적

**절차:**
1. 적 3체 전투
2. skill2 with target='all' 발동
3. 3체 모두에게 순차 공격 확인
4. 파티클 누락 없음 확인

**성공 기준:** 파티클 누락 없음, ≤ 2500ms

---

### I7: 데미지 숫자 동기화

**절차:**
1. 유튜브 슬로우모션 재생 (0.25x)
2. skill1 발동
3. 파티클 표시 시점 vs 데미지 숫자 비교

**성공 기준:** 동시에 표시됨 (±100ms)

---

## 📊 성능 벤치마크 (P1~P4)

### P1: 모바일 FPS (저사양)

**환경:** Nexus 5 에뮬, 기본공격 연속

```javascript
// Chrome DevTools > Performance 탭
// 30턴 기록, 평균 FPS 계산

Expected: ≥ 30fps
```

---

### P2: 모바일 FPS (극한)

**환경:** 3x 속도, 파티클 최대, AoE

```javascript
Expected: ≥ 25fps (허용선)
```

---

### P3: CPU 사용률

**환경:** 30턴 전투 CPU 프로파일

```javascript
// Chrome DevTools > Performance 탭
// Main thread 활동 추적

Expected: < 60% 평균
```

---

### P4: 메모리 Peak

**환경:** 한 번의 궁극기 발동

```javascript
// Chrome DevTools > Memory 탭
// 힙 증가량 측정

Expected: < 20MB
```

---

## 🎨 VFX 검증 매트릭스

### 9개 분위기 × 4가지 스킬 = 36가지 조합

| 분위기 | 기본공격 hit | skill1 | skill2 + 컷인 | 힐 |
|--------|-------------|--------|-----------------|-----|
| brave | 불꽃 파편 ✓ | 화염 폭발 ✓ | 불기둥 ✓ | - |
| fierce | 주황 파편 ✓ | 마그마 파동 ✓ | 충격파 ✓ | - |
| wild | 초록 파편 ✓ | 바람 베기 ✓ | 토네이도 ✓ | - |
| calm | 파란 파편 ✓ | 물결 확산 ✓ | 해일 ✓ | 물방울 ✓ |
| stoic | 회색 파편 ✓ | 돌 충격 ✓ | 지진 ✓ | - |
| devoted | 분홍 파편 ✓ | 빛줄기 ✓ | 광휘 ✓ | 빛 ✓ |
| cunning | 보라 파편 ✓ | 얼음 창 ✓ | 빙결 ✓ | - |
| noble | 금색 파편 ✓ | 금빛 참격 ✓ | 섬광 ✓ | 금빛 ✓ |
| mystic | 주황 파편 ✓ | 별빛 탄환 ✓ | 신성 폭발 ✓ | 별 ✓ |

---

## ⚠️ 주의사항

1. **배속 반영 필수**
   ```javascript
   const speedMul = 1 / (this.scene.battleSpeed || 1);
   const duration = timing.phases.impact * speedMul;
   ```

2. **Promise 안전성**
   ```javascript
   if (!this.scene) return Promise.resolve();
   ```

3. **Scene 정리**
   ```javascript
   shutdown() {
     if (this.skillAnimator) {
       this.skillAnimator.destroy();
     }
   }
   ```

4. **AoE 순차 처리** (동시 100ms 간격)
   ```javascript
   for (const t of targetList) {
     await skillAnimator.playUltimateSkill(...);
   }
   ```

5. **기존 메서드 보존** (Feature Flag 폴백용)

---

## 📚 참고 자료

- **전체 설계:** `docs/ARCHITECTURE_VFX-2.1.md`
- **실행 요약:** `docs/VFX-2.1_EXECUTIVE_SUMMARY.md`
- **기존 코드:** `src/scenes/BattleScene.js` (2100줄), `src/systems/ParticleManager.js`

---

**체크리스트 버전:** 1.0  
**최종 수정:** 2026-02-08  
**상태:** READY FOR IMPLEMENTATION
