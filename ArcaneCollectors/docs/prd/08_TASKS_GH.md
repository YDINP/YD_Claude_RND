# 5-4. TASK 상세: Team G (치트 API) + Team H (디자인 & 에셋)
> 원본: PRD_Unified_v5.md §5 (lines 1313-1399)

### TEAM G TASK (치트 API) - 상세

#### G-1: DebugManager require() → import() 마이그레이션
**우선순위**: P0
**문제**: 모든 내부 호출이 `require()` (CJS) → ES Modules 프로젝트에서 런타임 에러
**서브 태스크**:
- G-1.1: `require('./SaveManager.js')` → static `import` 변환
- G-1.2: `require('../data/index.js')` → static `import` 변환
- G-1.3: 모든 치트 메서드 정상 동작 확인
- G-1.4: `import.meta.env.DEV` 조건부 활성화 래핑

#### G-2: clearAllStages/skipToChapter stages.json 연동
**우선순위**: P0
**문제**: 10챕터×10스테이지 하드코딩 → stages.json은 5챕터×5스테이지
**서브 태스크**:
- G-2.1: stages.json 데이터 기반 동적 챕터/스테이지 ID 생성
- G-2.2: clearAllStages() → stages.json 전체 순회 클리어
- G-2.3: skipToChapter(n) → 해당 챕터까지만 클리어

#### G-3: 에너지 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static refillEnergy()                     // 에너지 최대치로 충전
static setEnergy(amount)                  // 에너지 특정 값 설정
static setInfiniteEnergy(enabled)         // 무한 에너지 모드
static setEnergyRecoverySpeed(multiplier) // 회복 속도 배율 (1x~100x)
```

#### G-4: 가챠 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static setPityCounter(count)              // 천장 카운터 강제 설정
static setNextPullRarity(rarity)          // 다음 소환 등급 강제
static setNextPullCharacter(charId)       // 다음 소환 캐릭터 강제 지정
static freeGacha(enabled)                 // 무료 소환 모드
static simulateGacha(count)              // N회 소환 시뮬레이션 (결과 로그)
static resetPity()                        // 천장 카운터 리셋
static forcePickup(enabled)              // 픽업 확정 모드
```

#### G-5: 장비 시스템 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static giveEquipment(equipId)             // 특정 장비 지급
static giveRandomEquipment(rarity, slot)  // 랜덤 장비 생성 지급
static giveAllEquipment()                 // 모든 장비 지급
static maxEnhanceEquipment(equipId)       // 장비 강화 MAX (+15)
static setEnhanceAlwaysSuccess(enabled)   // 강화 100% 성공
```

#### G-6: 무한의 탑 치트 API
**우선순위**: P1
**목표 API**:
```javascript
static setTowerFloor(floor)               // 현재 층 강제 설정
static clearTowerFloors(from, to)         // 범위 층 클리어
static clearAllTowerFloors()              // 전 층 클리어
static resetTower()                       // 탑 진행도 리셋
static setTowerDifficulty(multiplier)     // 난이도 배율 설정
```

#### G-7: 소탕 & 퀘스트 치트 API
**우선순위**: P1
**목표 API**:
```javascript
// 소탕
static addSweepTickets(amount)            // 소탕권 추가
static setInfiniteSweeps(enabled)         // 무한 소탕 모드
static resetDailySweepCount()             // 일일 소탕 횟수 리셋
// 퀘스트
static completeAllDailyQuests()           // 일일 퀘스트 전체 완료
static completeAllWeeklyQuests()          // 주간 퀘스트 전체 완료
static claimAllQuestRewards()             // 미수령 보상 전체 수령
static resetDailyQuests()                 // 일일 퀘스트 리셋
```

#### G-8: 세이브 & 시간 치트 API
**우선순위**: P2
**목표 API**:
```javascript
// 세이브
static exportSave()                       // 세이브 JSON 다운로드
static importSave(jsonString)             // 세이브 JSON 업로드
static resetAllData()                     // 전체 데이터 초기화
static createBackup(slotName)             // 백업 슬롯 생성
// 시간
static fastForwardOffline(hours)          // 오프라인 보상 N시간 빨리감기
static setLastOnlineTime(hoursAgo)        // 마지막 접속 시간 변경
static resetDailyTimers()                 // 일일 리셋 타이머 초기화
```

#### G-9: 분위기 & 시너지 & 파티 치트 API
**우선순위**: P2
**목표 API**:
```javascript
// 분위기 상성
static setMoodAdvantage(enabled)   // 항상 상성 유리
static viewMoodMatchup(a, b)       // 두 분위기 상성 확인
// 시너지
static viewActiveSynergies(partyIds)      // 파티의 활성 시너지 확인
static forceSynergyBonus(synergyId)       // 특정 시너지 강제 활성화
// 파티
static autoOptimalParty()                 // 최적 파티 자동 편성
static clearParty()                       // 파티 초기화
```

#### G-10: 디버그 콘솔 UI & 치트코드 확장
**우선순위**: P2
**서브 태스크**:
- G-10.1: 카테고리별 탭 UI (리소스/캐릭터/전투/에너지/가챠/장비/탑/시간)
- G-10.2: 실시간 상태 표시 패널 (현재 리소스, 에너지, 천장 카운터)
- G-10.3: 치트코드 25개 등록 (기존 8개 + 신규 17개)
- G-10.4: `window.debug` 글로벌 등록 (개발 모드 전용)
- G-10.5: `debug.help()` 도움말 테이블
**치트코드 목록**:
```
기존: GOLDRAIN, GEMSTORM, SUMMONALL, GODMODE, ONEPUNCH, SPEEDUP, UNLOCKALL, CLEARALL
신규: ENERGYMAX, INFINERGY, SSRFORCE, FREEPULL, PITY89, GEARMAX, GEARALL,
      TOWER100, QUESTDONE, SWEEP999, TIMETRAVEL, MAXALL, NEWGAME, BACKUP 등
```

---

### TEAM H TASK (디자인 & 에셋) - 상세

#### H-1: UI 디자인 시스템 정립
**우선순위**: P1
**서브 태스크**:
- H-1.1: 컬러 팔레트 통합: Primary(#6366F1), Secondary(#EC4899), BG(#0F172A~#1E293B), Accent(#F59E0B)
- H-1.2: 등급 컬러 표준: N(#9CA3AF), R(#3B82F6), SR(#A855F7), SSR(#F59E0B)
- H-1.3: 타이포그래피: 제목 Bold 24px, 본문 14px, 숫자 Mono
- H-1.4: 컴포넌트 가이드: 둥근 모서리(12px), 그라데이션 버튼, 글로우 이펙트
- H-1.5: textStyles.js, drawUtils.js 확장

#### H-2: 영웅 이미지 에셋 시스템
**우선순위**: P1
**서브 태스크**:
- H-2.1: AI 생성 파이프라인 (Stable Diffusion/Midjourney/DALL-E) 프롬프트 템플릿
- H-2.2: 교단별 비주얼 가이드 (olympus: 그리스/금색, takamagahara: 벚꽃, valhalla: 바이킹 등)
- H-2.3: 등급별 퀄리티: SSR(전신+배경), SR(전신), R(반신), N(아이콘)
- H-2.4: n8n 워크플로우 + Pexels API 레퍼런스 수집
- H-2.5: fallback: 컬러 실루엣 + 이름 텍스트 (이미지 미완시)
- H-2.6: 최소 10장 테스트 이미지 생성

#### H-3: 가챠 소환 연출 디자인
**우선순위**: P1
**서브 태스크**:
- H-3.1: 등급별 연출: N(0.5초 간단), R(1초 파란 마법진), SR(1.5초 보라+파티클), SSR(3초 금빛+컷인)
- H-3.2: 마법진 이펙트 (Phaser 파티클)
- H-3.3: SSR 전용 캐릭터 등장 애니메이션
- H-3.4: 10연차 카드 뒤집기 연출
- H-3.5: 스킵 기능 (터치로 연출 스킵)

#### H-4: 전투 이펙트 & 애니메이션
**우선순위**: P1
**서브 태스크**:
- H-4.1: 스킬 이펙트: 기본(슬래시), 마법(파티클), 힐(초록 빛기둥), 궁극기(풀스크린)
- H-4.2: 데미지 숫자: 일반(흰), 크리티컬(빨강+흔들림), 유리(노랑↑), 불리(파랑↓), 힐(초록)
- H-4.3: 전투 전환 연출 (페이드, 파티 등장)
- H-4.4: 승리/패배 화면 연출

#### H-5: 메인 로비 & Scene 전환 연출
**우선순위**: P2
**서브 태스크**:
- H-5.1: 배경 일러스트 (AI 생성 판타지 길드 홀)
- H-5.2: 대표 캐릭터 idle 흔들림 (Live2D 스타일 시뮬레이션)
- H-5.3: 터치 반응: 바운스 + 대사 말풍선
- H-5.4: 공통 페이드 트랜지션 (0.3초)
- H-5.5: 배경 파티클 (별/꽃잎/마법진)

#### H-6: HeroCard & 등급 프레임 디자인
**우선순위**: P2
**서브 태스크**:
- H-6.1: 등급별 프레임: N(회색), R(파랑+은), SR(보라 그라데이션+빛남), SSR(금색+홀로그램+파티클)
- H-6.2: 카드 획득 애니메이션 (뒤집기 + 등급 이펙트)
- H-6.3: 교단별 배경 색상 반영

#### H-7: 사운드 & BGM 에셋 계획
**우선순위**: P3
**서브 태스크**:
- H-7.1: BGM: 로비/전투/보스전/가챠 (무료 에셋 또는 AI 생성 Suno/Udio)
- H-7.2: SFX: 버튼/스킬/승리/패배/소환/레벨업
- H-7.3: Phaser 내장 사운드 시스템 또는 Howler.js 통합
- H-7.4: 음량 조절 SaveManager 연동

#### H-8: 반응형 & 모바일 터치 UX
**우선순위**: P2
**서브 태스크**:
- H-8.1: 다양한 비율(16:9, 18:9, 20:9) 대응
- H-8.2: 터치 영역 최소 44×44px 보장
- H-8.3: 스와이프 제스처 (챕터 전환, 영웅 스크롤)
- H-8.4: 롱프레스 (아이템/스킬 상세 팝업)
- H-8.5: 햅틱 피드백 (지원 기기)

#### H-9: 로딩 & 스플래시 스크린
**서브 태스크**:
- H-9.1: 게임 로고 디자인 (AI 생성 또는 텍스트 기반)
- H-9.2: 스플래시 화면 (3초, 로고 + 페이드)
- H-9.3: 프리로드 진행바 디자인 (마법진 회전 + 퍼센트)
- H-9.4: Scene 전환 로딩 스피너

#### H-10: 이펙트 파티클 라이브러리
**서브 태스크**:
- H-10.1: 공통 파티클 프리셋: 별 반짝임, 연기, 불꽃, 빛기둥
- H-10.2: 등급별 파티클: N(없음), R(파랑), SR(보라), SSR(금색)
- H-10.3: 레벨업/진화 축하 파티클
- H-10.4: 파티클 풀링 (성능 최적화)

---
