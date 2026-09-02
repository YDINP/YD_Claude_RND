# ArcaneCollectors 완성 단계 통합 기획서 (PLAN_COMPLETION_STAGE)

> **작성일**: 2026-08-25
> **작성**: 게임 기획 디렉터 (연구+문서 태스크 — 코드 수정 없음)
> **근거 문서**: CURRENT_STATUS.md(2026-08-24), PRD_Unified_v5.md(v5.2), EVOLUTION_SYSTEM_GDD.md(v2.0 최종), CHARACTER_SYSTEM_GDD.md(v1.0, 구버전 참고), CULT_SYSTEM_DESIGN.md, ../docs/PRD_ArcaneCollectors_v5.md(미구현 콘텐츠), base-heroes.json / ascended-heroes.json 스키마
> **교차검증**: src/systems(31파일), src/scenes(15씬), src/data(24파일), src/components/popups(13종), src/services(8종), public/assets 실존 확인 + **vitest/tsc/build 직접 실행**

---

## 0. 핵심 요약 (Executive Summary)

**이 게임은 기능적으로 80% 이상 완성되었지만, 현재 저장소 HEAD는 "출시 가능" 상태가 아니다.**

직접 실행 검증 결과 (2026-08-25):

| 검증 | 결과 | 원인 |
|------|------|------|
| `npx tsc --noEmit` | ❌ **28 errors** | `GuildPopup.js:122` 문자열 리터럴 내 실제 개행(문법 손상) |
| `npm run build` | ❌ **실패** | 동일 파일 — vite:build-import-analysis 파스 실패 |
| `npx vitest run` | ❌ **593 collected / 10 failed** | ① `constants.test.js` 스위트 로드 실패(TypeError) ② `helpers.test.js` 로드 실패(`src/utils/helpers.js:32` 파스 오류) ③ `EventDungeonSystem` 10건 실패(events.json 종료일 만료 — QA-2 수정 이후 **재발**) |
| 테스트 수 | ⚠️ **685 → 593 회귀** | 스위트 2개가 로드 자체에 실패하여 수집 누락 |
| git 상태 | ⚠️ **약 20개 파일 미커밋** | 2026-08-24 세션(가챠 활성화+포트레이트) 전체 |

CURRENT_STATUS.md의 "⚠️ 검증 대기" 경고가 **실제로 적중**했다. Bash 복구 후 최우선 실행 항목이었던 `vitest → tsc → build → 커밋`이 모두 실패하는 것이 이번 분석의 최대 발견이다. **P0의 대부분은 새 기능이 아니라 "깨진 것 복구"다.**

반대로, 코드 실존 교차검증 결과 다음은 **완료 확정**이므로 본 계획의 "할 일"에서 제외한다:

- ✅ 코어 시스템 전반: 전투(BattleSystem/V2/PhaseManager), 저장(SaveManager), 에너지, 장비, 퀘스트, 소탕, 시너지, 무드, 진행도, 유휴전투, 쿠폰, 디버그
- ✅ 진화 시스템 v2.0 데이터/UI: base-heroes 10명 + ascended 24종(JSON 유효, 한글 정상), cults v2.1(12기관), AscensionPopup, PitySystem, SaveManager 각인 메서드
- ✅ 가챠 + 피티: GachaSystem(RATES/soft75/hard90/pickup180) + BootScene 초기화 + banners.json 재작성 (2026-08-24)
- ✅ PvP(GP-1) / 길드(GP-2) 시스템+마이그레이션 SQL — ※길드는 현재 빌드를 깨는 범인이므로 "복구"만 필요
- ✅ 이벤트 던전(EventDungeonSystem+팝업) — ※기간 관리 정책만 필요
- ✅ 인증: LoginScene + AuthService + 자동로그인
- ✅ 배포 인프라: Vercel 운용 중, GitHub Actions(ci/deploy/pr-check), PWA manifest+아이콘
- ✅ 아셋 매핑: portrait-mapping 38 ID, **실제 PNG 92장 존재**(hero_001~092) + ensureTexture 플레이스홀더 폴백

---

## 1. 완성 단계 정의 (Definition of Done)

"출시 가능한 완성 단계"의 객관적 기준 14개. **모두 충족 시 완성 선언** 가능하다.

| # | 기준 | 검증 방법 |
|---|------|----------|
| DoD-1 | **빌드 체인 그린**: `tsc --noEmit` 0 에러, `npm run build` 성공, ESLint 0 에러 | CI(cy.yml) 통과 |
| DoD-2 | **유닛테스트 전량 그린**: 수집 ≥ 685개, 실패 0. 스위트 로드 실패 0 | `npx vitest run` |
| DoD-3 | **코어 루프 E2E 완주**: 가챠 → 기본영웅 각성 → 기관 선택 전직 → 파티 편성 → 전투 → 보상/저장 → 재접속 복원, 전 체인 수동+E2E 검증 | Playwright 시나리오 |
| DoD-4 | **단일 플레이 콘텐츠 3축**: 모험 5챕터 25스테이지 + 무한의 탑 100층 + 이벤트 던전이 실제 플레이 가능하고 보상이 저장됨 | 스테이지 순회 E2E |
| DoD-5 | **주간 콘텐츠 1종 이상**: 레이드 또는 탑 시즌 중 1개가 주간 리셋과 함께 동작 | 수동 플레이 + 타이머 테스트 |
| DoD-6 | **수집 완성도**: 기본영웅 10명 전원 각성 가능, 24종 전직 영웅 획득/육성/편성 가능, 도감에서 진행률 표시 | 데이터↔UI 대조 |
| DoD-7 | **전투 깊이 확보**: Mood 상성 ±20% + 교단 시너지 + 최소 공세/제어/지속/균형 4그룹 각 1기관의 시그니처 메커니즘이 전투에 반영 | 전투 시뮬레이션 유닛테스트 |
| DoD-8 | **소셜 3종**: PvP 랭킹 ✅ / 길드 ✅ / 친구(대여+포인트) 동작, Supabase 장애 시 오프라인 폴백 | 네트워크 차단 테스트 |
| DoD-9 | **경제 밸런스 검증**: 가챠 10,000회 시뮬레이션(등급 편차 ±0.5%), 재화 일일 수급/소모 시뮬레이션 리포트 존재 | 시뮬 스크립트 산출물 |
| DoD-10 | **아트 완성**: 전 플레이 가능 캐릭터(34+)에 최종 포트레이트 적용, 플레이스홀더/CC0 임시본 제거 또는 수용 결정 문서화 | 에셋 감사 |
| DoD-11 | **사운드**: BGM 3종 이상(로비/전투/보스), SFX 10종 이상, 음량 설정 저장 | 수동 청음 + 설정 저장 테스트 |
| DoD-12 | **품질 게이트**: 번들 ≤ 700KB gzip, 초기 로딩 ≤ 3초(4G), 전투 60fps, iOS Safari/Android Chrome 동작 | `build:analyze` + 실기기 |
| DoD-13 | **운영 준비**: 에러 모니터링 연동, 이벤트 기간 자동 스케줄(하드코딩 종료일 제거), 확률 고지 UI, 세이브 export/import | 운영 체크리스트 |
| DoD-14 | **문서 SSOT**: CURRENT_STATUS와 실제 코드 일치, PRD v5.2의 구버전 "치명적 이슈" 목록 정리(해소/잔존 표기) | 문서 감사 |

---

## 2. 현재 ↔ 목표 갭 분석 테이블

갭 크기: S=반나절~1일 / M=2~5일 / L=1주 이상 (멀티에이전트 기준)
우선순위: P0=출시 차단(지금 깨짐) / P1=출시 위해 필수 / P2=출시 후 첫 패치 허용

### 2-1. ✅ 완료 확정 (재검토 불필요 — 최종 회귀만 수행)

| 영역 | 근거 |
|------|------|
| 코어 시스템(전투/저장/에너지/장비/퀘스트/소탕/시너지/무드/유휴전투) | systems 31파일 실존 + Phase 1~4 완료 기록 |
| 진화 시스템 v2.0 (데이터+UI+피티) | base 10/asc 24 JSON 유효, AscensionPopup, PitySystem 실존 |
| 가챠 + 피티 (2026-08-24 활성화) | GachaSystem lazy-init, banners.json 재작성, SSOT 동기화 기록 |
| PvP/랭킹 (GP-1) | PvPSystem 18KB + PvPPopup + 마이그레이션 SQL + 테스트 24 |
| 길드 (GP-2) | GuildSystem 11KB + GuildPopup + SQL — ※문법 오류 복구 필요(FIX-01) |
| 이벤트 던전 (GP-3) | EventDungeonSystem + 팝업 + 테스트 — ※기간 정책 필요(FIX-04) |
| 인증/자동로그인 | LoginScene + AutoLogin 테스트 16 |
| 배포 인프라 | Vercel URL 운용, CI/CD 3워크플로우, PWA 아이콘/manifest |
| 디자인 시스템/포트레이트 매핑 | designSystem DS-1~5, portrait-mapping 38ID + PNG 92장 |
| 스테이지/적/스킬/아이템/타워 JSON | stages 37KB, enemies 33KB 등 데이터 실존 |

### 2-2. 갭 테이블 (미구현/부분구현/파손)

| # | 항목 | 현재 상태 (검증 기반) | 목표 (DoD 매핑) | 갭 | 우선순위 |
|---|------|----------------------|----------------|----|---------|
| G-01 | **빌드 체인** | ❌ GuildPopup.js:122 개행 삽입 → build/tsc 실패, Vercel 재배포 불가 | DoD-1 | **S** | **P0** |
| G-02 | **유닛테스트** | ❌ 593 수집(685 대비 -92), 10 실패, 2 스위트 로드 실패(helpers.js:32 파스 오류, constants.test TypeError) | DoD-2 | **S** | **P0** |
| G-03 | **미커밋 변경분** | ⚠️ 08-24 세션 ~20 파일 uncommitted (작업 손실 위험) | DoD-1 | S | **P0** |
| G-04 | **이벤트 기간 운영** | ❌ events.json 종료일 하드코딩 만료 재발(QA-2 이후 2회째) — 시간 폭탄 | DoD-13 | S | **P0** |
| G-05 | **무한의 탑 고도화** | 🔶 TowerScene(16KB)+TowerSystem(14KB)+tower.json 실존 — 100층 전체/보상표/보스 10종/시즌 리셋/순위는 미확인(부분구현) | DoD-4, 5 | M | **P0**(연결 검증) → P1(고도화) |
| G-06 | **레이드 시스템** | ❌ RaidSystem/RaidScene 파일 없음, 레이드 데이터 없음 | DoD-5 | **L** | **P1** |
| G-07 | **친구 시스템** | ❌ 미구현 (PRD_ArcaneCollectors_v5 Phase 6: 50명/대여 3회·일/포인트 상점) | DoD-8 | M | **P1** |
| G-08 | **컬렉션/도감 완성** | 🔶 AscensionPopup(각인)은 있으나 컬렉션 완성 보너스(Evolution GDD S-1/C-4), 세계수의 씨앗 추가 루트 개방(S-2) 미확인 | DoD-6 | M | **P1** |
| G-09 | **교단 시그니처 메커니즘** | 🔶 ascended 데이터에 `cultEffect`(예: thunderstruck_40) 존재하나 BattleSystem의 12기관 메커니즘(Divine Charge/Berserker Rage 등) 구현 미확인 | DoD-7 | **L** | **P1** |
| G-10 | **캐릭터 데이터 확장** | 🔶 base 10 + asc 24 + 레거시 char_1~4(플레이스홀더). N등급 부재, 무드/역할 균형 미검증. characters.json 레거시 마이그레이션(GDD Phase 2~4) 미완 | DoD-6 | M | **P1** |
| G-11 | **장비 데이터/장비가챠** | 🔶 equipment.json 37KB + backup/new 잔재 3개(정리 필요). PRD 목표 81종 대비 축소, 장비 가챠 탭 상태 미확인 | DoD-4 | M | **P1** |
| G-12 | **사운드/BGM** | ❌ SoundManager.js(7KB)만 존재, `public/assets/audio/**` **빈 폴더(.gitkeep)** — 에셋 0 | DoD-11 | M | **P1** |
| G-13 | **최종 캐릭터 아트 (Phase 3b)** | 🔶 PNG 92장은 CC0/임시(mapping 주석: "Phase B CC0 교체 예정"), AI 생성 환경 미구축(gemini/codex 미설치 블로커 명시) | DoD-10 | **L** | **P1**(외부 의존) |
| G-14 | **밸런스 시뮬레이션** | ❌ 가챠 10,000회 검증(PRD D-3), 캐릭터 1:1 시뮬(E-10) 실행 기록 없음 | DoD-9 | S | **P1** |
| G-15 | **E2E/크로스브라우저** | 🔶 Playwright 34개 작성됨, 최근 실행/통과 기록 없음. 모바일 실기기 검증 없음 | DoD-3, 12 | S | **P1** |
| G-16 | **연출 폴리싱** | 🔶 SkillAnimationManager/ParticleManager 실존. 진화 연출(C-3), SSR 가챠 컷인(H-3), 궁극기 컷인(A-8.4) 미확인 | DoD-7 보조 | M | **P2** |
| G-17 | **서버 신뢰성** | 🔶 가챠 판정이 클라이언트 사이드. 서버사이드 검증 RPC(PRD C-3.3) 미확인. RLS는 PvP/길드만 신규 작성 | DoD-13 | S | **P2** |
| G-18 | **운영/모니터링** | ❌ Sentry 등 에러 트래킹 없음, 세이브 export/import 없음(DebugManager에 일부 가능) | DoD-13 | S | **P2** |
| G-19 | **문서 SSOT** | 🔶 PRD_Unified v5.2의 [C1]~[C9]/Dead 버튼 목록은 Phase 1~3에서 대부분 해소됐으나 문서에 "해소" 표기 없음 → 신규 개발자 혼란 | DoD-14 | S | **P2** |
| G-20 | **호감도/의상/채팅 등 확장** | ❌ 미착수 (PRD §7 확장 아이디어) | 완성 범위 아님 | — | **P2**(선택) |

**갭 요약**: P0 = 5건 / P1 = 10건 / P2 = 5건

---

## 3. 완성 단계 WBS (P0 → P1 → P2, 병렬 트랙)

난이도: S/M/L. 의존성은 같은 트랙 내 선행 태스크 또는 `[G-xx]` 갭 ID.

### TRACK A — 긴급 복구 (P0) 🚨 *모든 트랙의 선행 조건*

> 목표: "HEAD가 다시 배포 가능한 상태"로 복귀. 신규 기능 금지, 복구만.

| ID | 태스크 | 난이도 | 의존성 | 수용 기준 (Acceptance Criteria) | 상태 |
|----|--------|--------|--------|-------------------------------|------|
| **FIX-01** | GuildPopup.js:122 문자열 리터럴 개행 오류 복구 (`'Not in a guild.\nCreate or join!'` 한 줄화) | S | 없음 | `tsc --noEmit` 0 에러, `npm run build` 성공 | ✅ |
| **FIX-02** | src/utils/helpers.js:32 파스 오류 복구 | S | 없음 | helpers.test.js 13개 테스트 정상 수집·통과 | ✅ |
| **FIX-03** | constants.test.js 로드 실패("Cannot convert undefined or null to object") 원인 규명·수정 | S | 없음 | constants 37개 테스트 수집·통과, 총 수집 수 ≥ 685 | ✅ |
| **FIX-04** | 이벤트 기간 하드코딩 제거 — events.json에 롤링 기간(예: 종료일 미만이면 자동 연장) 또는 상대 기간 도입 + 시간 의존 테스트는 fake timer로 고정 | S | 없음 | 시스템 시계와 무관하게 EventDungeon 10개 테스트 통과 (재발 방지) | ✅ |
| **FIX-05** | 08-24 미커밋 변경분 전수 검증 후 커밋·푸시 → Vercel 자동 재배포 확인 | S | FIX-01~04 | CI 그린 + https://arcane-collectors.vercel.app 이 HEAD 빌드와 일치 | ✅ |
| **FIX-06** | CURRENT_STATUS.md 갱신: "685 통과" 표기를 실측으로 교정, 본 문서 링크 추가 | S | FIX-05 | 문서-실측 일치 (DoD-14 일부) | ✅ (2026-09-02 재갱신) |

> **2026-09-02 기준**: `npx vitest run` 29파일 884 테스트 전량 통과 / `npx tsc --noEmit` 0 에러 / `npm run build` 성공 — TRACK A 전 항목 해소 확인.

### TRACK B — 콘텐츠 완성 (P0 후반 → P1)

| ID | 태스크 | 난이도 | 의존성 | 수용 기준 | 상태 |
|----|--------|--------|--------|----------|------|
| **TOWER-01** | 탑 현상태 감사: TowerScene↔TowerSystem↔tower.json 연결, 층 진행/보상/저장 실동작 확인 | S | FIX-05 | 감사 리포트: 동작/미동작 목록화 | ✅ 09-02 |
| **TOWER-02** | 탑 100층 완성: tower.json 층별 데이터(10층마다 보스 10종, 층별 보상표 — PRD §5.2), 부족분 데이터 생성 | M | TOWER-01 | 50층까지 순회 클리어 E2E, 보상이 SaveManager에 반영 | ✅ 09-02 |
| **TOWER-03** | 탑 시즌/순위 (월간 리셋 + pvp_leaderboard 패턴 재사용) — *출시 후 첫 패치 허용 시 P2로 강등 가능* | M | TOWER-02 | 시즌 리셋 시 진행도 초기화 + 최고기록 보존 확인 | ❌ 미착수 |
| **RAID-01** | 레이드 기획 확정+데이터: 주간 보스 5종(니드호그/야마타노오로치/티폰/펜리르/이자나미 — PRD_ArcaneCollectors_v5 §6.2), 약점 무드, HP 스케일 | M | FIX-05 | raids.json + 보스 5종 enemies 등록, 스키마 테스트 | ✅ 09-02 |
| **RAID-02** | 레이드 시스템 구현: 데미지 누적(주간), 기여도 기반 보상, 입장 티켓/에너지 연동 | L | RAID-01, G-09(교단메커니즘 일부) | 주간 리셋 동작, 보상 수령 저장, 유닛테스트 ≥ 20 | ✅ 09-02 |
| **FRIEND-01** | 친구 시스템: friends 테이블+RLS, 추가/삭제/목록(50명), 친구 대여(1일 3회) | M | FIX-05 | 대여 영웅을 파티에 편성해 전투 1회 사용 가능, 오프라인 폴백 | ✅ 09-02 |
| **FRIEND-02** | 친구 포인트: 일일 전송/수령(20pt/일), 포인트 상점 아이템 5종 | M | FRIEND-01 | 이중 수령 방지 테스트, 포인트 상점 구매 저장 | ✅ 09-02 |
| **COLL-01** | 컬렉션 시스템: 기본영웅별 루트 수집 현황 UI + 완성 보너스(Evolution GDD S-1/C-4) | M | FIX-05 | 3루트 완성 시 칭호+보너스 스탯 적용 확인 | ✅ 09-02 |
| **COLL-02** | 추가 루트 개방: 세계수의 씨앗 재화 + 개방 비용 1.5배 로직(S-2) | S | COLL-01 | 동일 기본영웅 2루트 보유 + 파티 1체 제한 강회 테스트 | ✅ 09-02 |

### TRACK C — 전투 깊이 & 데이터/밸런스 (P1)

| ID | 태스크 | 난이도 | 의존성 | 수용 기준 | 상태 |
|----|--------|--------|--------|----------|------|
| **MECH-01** | 교단 메커니즘 감사: BattleSystem에서 `cultEffect` 처리 여부 확인, 미구현 목록화 | S | FIX-05 | 12기관 × 구현여부 매트릭스 산출 | ✅ 09-02 |
| **MECH-02** | 4그룹 대표 기관 구현: Olympus(Divine Charge), Yomi(Death Gaze/Doom), Kunlun(Five Poisons) 또는 Avalon(Holy Ward), Asgard(Rune Inscription) — CULT_SYSTEM_DESIGN Phase 2 범위 | L | MECH-01 | 각 메커니즘당 유닛테스트 ≥ 5, 전투 시뮬로 수치 검증 | ✅ 09-02 (`CultMechanicsSystem`, 4기관/토큰 20종. 나머지 8기관·36토큰은 미구현) |
| **DATA-01** | 캐릭터 데이터 확장: 레거시 char_1~4 정리, N등급 최소 세트, 무드 5종×기관 12개 커버리지 점검(E-1/E-9 축소판) | M | FIX-05 | 스키마 검증 통과, 무드별 최소 4종 이상 | ❌ 미착수 |
| **DATA-02** | 장비 정리+확장: backup/new 파일 3개 삭제, 40종 이상(4슬롯×등급), 장비 가챠 탭 활성화 여부 결정·구현(B-7) | M | FIX-05 | equipment 스키마 테스트, 가챠→장비 지급 저장 확인 | ❌ 미착수 |
| **BAL-01** | 가챠/경제 시뮬레이션: 10,000회 pull 시뮬 스크립트 + 일일 재화 수지표 작성(D-3/E-10) | S | FIX-05 | 등급 편차 ±0.5% 리포트, 피티 90회 도달 확인, 리포트 docs/commit | ✅ 09-02 |
| **BAL-02** | 전투 밸런스 곡선: 스테이지 25개 + 탑 100층 DPS 요구치 vs 파티 성장곡선 대조 | M | DATA-01, MECH-02 | 챕터별 권장 전투력 표 산출, 이탈 구간 없음 | ❌ 미착수 |

### TRACK D — 프레젠테이션 (P1/P2)

| ID | 태스크 | 난이도 | 의존성 | 수용 기준 | 상태 |
|----|--------|--------|--------|----------|------|
| **SND-01** | 무료/AI 생성 BGM 3종+(로비/전투/보스) 조달 → `public/assets/audio/bgm`, SoundManager 루프/전환 연동 | S | FIX-05 | 씬 전환 시 BGM 교체, 음소거 저장 | ❌ 미착수 |
| **SND-02** | SFX 10종+(버튼/스킬/승패/소환/레벨업) + 음량 설정 UI(SettingsPopup) | S | SND-01 | 설정값 SaveManager 저장·복원 | ❌ 미착수 |
| **ART-01** | 최종 포트레이트 파이프라인(Phase 3b): 로컬 이미지생성(ComfyUI/Z-Image Turbo) 또는 API 생성 환경 구축 → 34캐릭터 최종본 생성·매핑 교체 | L(외부 의존) | FIX-05 | portrait-mapping 대상 38 ID 전부 최종본, ensureTexture 플레이스홀더는 폴백 전용으로 격하 | 🔶 부분 완료 — 09-02 hero_005~038(34장) ComfyUI 1024px 교체. hero_001~004, hero_039~091은 여전히 CC0 플레이스홀더 |
| **VFX-01** | 핵심 연출 3종: 진화 연출(C-3), SSR 가챠 연출 강화(H-3), 궁극기/전직 컷인(A-8.4) | M | ART-01(부분 병렬 가능) | 스킵 가능, 저사양에서 프레임 드롭 없음 | ❌ 미착수 |

### TRACK E — QA · 운영 · 릴리즈 (P1/P2)

| ID | 태스크 | 난이도 | 의존성 | 수용 기준 |
|----|--------|--------|--------|----------|
| **QA-01** | 전면 회귀: vitest(≥685)+tsc+build+Playwright 34 전량 실행, 결과 CURRENT_STATUS 반영 | S | TRACK A 완료 | DoD-1, 2 충족 |
| **QA-02** | 코어 루프 수동 E2E 5종: 가챠→전직→전투→저장 / 탑 50층 / PvP / 길드 / 이벤트 던전 | M | TRACK A, TOWER-02 | 시나리오별 체크리스트 통과 (DoD-3, 4) |
| **QA-03** | 모바일/크로스브라우저: iOS Safari, Android Chrome, 18:9~20:9 비율, 번들≤700KB·로딩≤3초·60fps 측정 | M | QA-01 | DoD-12 충족 리포트 |
| **OPS-01** | 에러 모니터링(Sentry 또는 경량 대안) 연동 + sourcemap 업로드 | S | FIX-05 | 프로덕션 에러가 대시보드에 수집됨 |
| **OPS-02** | 세이브 export/import UI + 확률 고지 화면(가챠 정보 팝업에 RATES 표기 — 이미 부분 존재, 법적 문구 보강) | S | QA-01 | export→import 왕복 무손실 |
| **DOC-01** | 문서 SSOT 정리: PRD v5.2 이슈 목록에 해소/잔존 마킹, 본 WBS를 CURRENT_STATUS 백로그로 흡수 | S | FIX-06 | DoD-14 |

### 실행 순서 및 병렬화

```
[Week 0] TRACK A (FIX-01~06) ── 단독 최우선, 병렬 가능: FIX-01/02/03/04 동시
              │
[Week 1]     ├─ TRACK B: TOWER-01, RAID-01, COLL-01, DATA-01, BAL-01, SND-01  ← 6개 병렬 워커 가능
             ├─ TRACK C: MECH-01
             └─ TRACK E: QA-01
              │
[Week 2~3]   ├─ TRACK B: TOWER-02, RAID-02, FRIEND-01→02, COLL-02
             ├─ TRACK C: MECH-02, DATA-02, BAL-02
             ├─ TRACK D: ART-01 (외부 의존 — 조기 착수 권장), VFX-01, SND-02
             └─ TRACK E: QA-02, OPS-01
              │
[Week 4 릴리즈 스프린트]
             └─ QA-03, OPS-02, DOC-01, (TOWER-03은 P2로 이연 가능)
                 → DoD 14항목 최종 채점 → 완성 선언
```

---

## 4. 잔여 리스크 & 오픈 이슈

| # | 리스크/이슈 | 등급 | 내용 및 대응 |
|---|------------|------|-------------|
| R-01 | **CURRENT_STATUS.md 기록과 실측 불일치** | 🔴 High | "685 전수 통과"였으나 실측 593 수집·10 실패. 원인: 08-24 세션의 Bash 미실행 + 그 이전부터 helpers/constants 스위트 파손이 누적된 정황. → 본 문서 §0 실측값으로 교정(FIX-06), 향후 "통과" 기록은 실행 로그 첨부 의무화 |
| R-02 | **빌드 파손의 원인 불명** | 🟡 Medium | GuildPopup.js/helpers.js의 개행 삽입은 커밋된 코드에 존재(git status 미변경) → 과거 어느 세션에서 인코딩/편집 사고. 유사 손상 추가 발견 가능성 → FIX-01~03 후 전 파일 파스 검사(esbuild parse all) 1회 권장 |
| R-03 | **이벤트 종료일 타임밤 재발** | 🟡 Medium | QA-2(03-05) 수정 → 08-25 재발. 날짜 하드코딩 구조 자체가 원인 → FIX-04로 구조적 해소 전까지 이벤트 관련 테스트는 항상 red 위험 |
| R-04 | **Phase 3b 이미지 생성 블로커 (외부 의존)** | 🟡 Medium | gemini/codex 스킬 미설치. 대안 ① 로컬 ComfyUI/Z-Image Turbo(D:\AI\models) ② Claude API 이미지 생성. ART-01은 L 난이도+외부 의존이므로 Week 1부터 병렬 착수 필요. 미해결 시 DoD-10은 "플레이스홀더 수용" 결정으로 대체 가능(출시 자체는 막지 않음) |
| R-05 | **미커밋 ~20 파일** | 🔴 High | 로컬 손실 시 08-24 작업 전체 소실 위험 → FIX-05 즉시执行 |
| R-06 | **가챠 클라이언트 판정** | 🟢 Low | 확률/피티가 전부 클라이언트 계산 → 조작 가능. 웹게임 특성상 리스크 수용 가능하나, 결제 연동 전에는 서버사이드 검증(RPC) 필터 선행(G-17) |
| R-07 | **레이드/친구의 Supabase 스키마 신규 작업** | 🟡 Medium | PvP/길드 때와 달리 실시간성(데미지 누적)이 필요 → Realtime 또는 폴링 설계 결정 필요. 오프라인 폴백 정책을 PvP/길드 패턴과 통일할 것 |
| R-08 | **문서 간 사양 충돌 잔존** | 🟢 Low | CHARACTER_SYSTEM_GDD v1.0(랜덤 전직/피티 30~50회)은 EVOLUTION v2.0(기관 선택/hardPity 90)으로 대체됨 — v1.0은 폐기 표기 필요(DOC-01). PRD_Unified v5.2의 "치명적 이슈 C1~C9" 대부분은 해소됐으나 문서 미갱신 |
| R-09 | **auto-mode Bash 분류기 장애 재발** | 🟡 Medium | 08-24 세션의 근본 원인. 검증 생략이 파손을 증폭시킴(R-01) → 세션 종료 조건에 "vitest+tsc+build 3종 실행" 강제하는 운영 규칙 권장 |
| R-10 | **레거시 데이터 잔재** | 🟢 Low | equipment*.backup/new 3개, stages_backup/ch1_ch2, gen_stages.py 등이 data/에 혼재 → DATA-02에서 정리. index.js/index.ts 이중 구조는 08-24에 shim으로 해소됨 |

---

## 부록 A — 검증 실행 로그 요약 (2026-08-25)

```
$ npx tsc --noEmit        → 28 errors, 전부 src/components/popups/GuildPopup.js
                            (122:67 TS1002 Unterminated string literal — 문자열 내 실개행)
$ npm run build           → FAIL @ vite:build-import-analysis, 동일 파일 122:67
$ npx vitest run          → Test Files 3 failed | 22 passed (25)
                            Tests 10 failed | 583 passed (593)
                            - tests/utils/constants.test.js : TypeError(스위트 로드 실패)
                            - tests/utils/helpers.test.js   : RolldownError(src/utils/helpers.js:32:16 파스 실패)
                            - tests/systems/EventDungeonSystem.test.js : 10 failures(events.json 기간 만료)
$ node -e "JSON.parse..." → base-heroes 10 / ascended-heroes 24 / characters 4 — JSON 전부 유효
$ Get-ChildItem           → portraits 92 PNG, audio 폴더 비어있음(.gitkeep뿐)
$ git status              → 수정 20+ 파일 미커밋 (08-24 세션분)
```

## 부록 B — 완성 판정 절차

1. TRACK A 완료 시점 1차 게이트: DoD-1, 2
2. Week 3 말 2차 게이트: DoD-3~9, 11
3. 릴리즈 스프린트 말 최종 게이트: DoD 전 14항목 채점표 작성 → 14/14 시 "Completion Stage" 선언
   (단, DoD-10은 ART-01 미해결 시 "플레이스홀더 수용" 각서로 조건부 통과 인정)
