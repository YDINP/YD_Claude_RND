# ArcaneCollectors 현재 상태

> **최종 업데이트**: 2026-03-06
> **브랜치**: `arcane/integration`
> **테스트**: 699개 유닛 (전부 통과) | **빌드**: 0 에러 | **ESLint**: 에러 0개
> **번들 크기**: 568KB gzip (최적화 완료)
> **최근 작업**: P1 MainMenu PvP/Guild 버튼 연결, P2 arcane/integration→main 머지, P3 GachaSystem 전직영웅 방어코드 (2026-03-06)

---

## 완료된 작업 (전체)

### Phase 1: 통합 기초 — 69/69 (100%)
Team A~H + Worker 전체 완료. 상세: `docs/done/tasks/TASK_TRACKER.md`

### Phase 2 Sprint 1: 코드 품질 — 29/31 (94%)
6개 워크트리 병렬 (COMPAT, TS, UIX, VFX, QA, RES). 상세: `docs/done/tasks/TASK_PROGRESS.md`

### Phase 2 Sprint 2: 심화 — Wave 1(14) + Wave 2(19) = 33/33 (100%)
baseStats→stats 통일, TS 전환, RadarChart, Mood 파티클, 유닛테스트 337개. 상세: 동일 파일

### Sprint 3: UI/UX + 팝업 전환 — 전체 완료
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| Task #7 | 자동전투 파티 연동 | `7c6fd82` | 02-14 |
| Task #8 | BottomNav 제거 + 하단 메뉴 아이콘 | `366ca10` | 02-14 |
| Task #9 | 7개 씬 → 팝업 전환 (PopupBase) | `366ca10` | 02-14 |
| Task #10 | 전투력 ProgressionSystem 통일 | `7c6fd82` | 02-14 |
| Task #11 | 모험 속도 개선 + 자동 스테이지 진행 | `7c6fd82` | 02-14 |
| Task #12 | 자동전투 HP바/스테이지 저장 버그 수정 | `dcd784f` | 02-14 |
| 보스전 | 턴제 전투 구현 (데이터 기반 + 인트로) | `4cacc63`~`cf83f74` | 02-14 |
| 팝업 Fix | 닫기 라이프사이클 + 이름 표시 | `66ede26`, `d50fb9a` | 02-14 |
| 에너지 Fix | 초기화 + 보석충전 + 레이아웃 | `69d6a1b` | 02-14 |

### Sprint 3 후속: 백로그 일괄 완료
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| QA-OPT-1 | scene.restart() → 부분 갱신 최적화 | `27f4b6d` | 02-14 |
| QA-OPT-2 | clearedStages 숫자 정렬 개선 | `27f4b6d` | 02-14 |
| QA-OPT-3 | IdleBattleView/IdleProgressSystem 타이밍 동기화 | `27f4b6d` | 02-14 |
| AUTH-1.1 | 자동로그인 (BootScene localStorage) | `b8f9ad5` | 02-14 |
| AUTH-1.2 | 계정 변경 (SettingsPopup) | `b8f9ad5` | 02-14 |
| AUTH-1.3 | 로그인 화면 개선 (체크박스) | `b8f9ad5` | 02-14 |
| ART-1.1 | 프로시저럴 배경 5종 (BackgroundFactory) | `f1e0ccf` | 02-14 |
| ART-1.2 | 프로시저럴 UI 아이콘 7종 (IconFactory) | `f1e0ccf` | 02-14 |
| ART-1.3 | 캐릭터 렌더러 강화 (실루엣/글로우/Mood) | `f1e0ccf` | 02-14 |

### Sprint 4: 게임플레이 + 인프라 확장
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| GP-3 | 이벤트 던전 시스템 (3종 이벤트+상점+팝업) | `128fdf0` | 02-15 |
| ART-2.1 | 배경 5종 강화 (성/전투/마법진/월드맵/탑) | `954f702` | 02-15 |
| ART-2.2 | 캐릭터 실루엣 4종 (warrior/mage/archer/healer) | `954f702` | 02-15 |
| ART-2.3 | UI 아이콘 7종 강화 + 등급 프레임 | `954f702` | 02-15 |
| INFRA-1 | 빌드 최적화 (2.1MB→568KB gzip, 73% 압축) | `88c1cec` | 02-15 |
| INFRA-2 | CI/CD GitHub Actions (ci+deploy+pr-check) | `f689b87` | 02-15 |
| INFRA-3 | 배포 설정 (Vercel+Netlify+PWA manifest) | `88c1cec` | 02-15 |
| GP-4 | 유휴 전투 보스 기반 리디자인 (DPS 누적 진행) | `fd3a7f6` | 02-15 |
| GP-5 | 샌드백 보스 + 진행도 시스템 (6개 서브태스크) | - | 02-15 |

### PvP/랭킹 시스템 (2026-03-05) — pt-pipeline auto 5단계 실행
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| GP-1 | Supabase 마이그레이션 SQL (pvp_snapshots/pvp_battles/pvp_leaderboard + RLS) | `supabase/migrations/20260305_pvp_leaderboard.sql` | 03-05 |
| GP-1 | PvPSystem.js — savePartySnapshot/findOpponents/simulateBattle/executePvPBattle/getLeaderboard/getMyRecord | `src/systems/PvPSystem.js` | 03-05 |
| GP-1 | PvPPopup.js — 3탭 UI (대전/결과/랭킹) | `src/components/popups/PvPPopup.js` | 03-05 |
| GP-1 | PvPSystem export 추가 | `src/systems/index.js` | 03-05 |
| GP-1 | PvPPopup export 추가 | `src/components/popups/index.js` | 03-05 |
| GP-1 | PvPSystem 유닛 테스트 24개 신규 | `tests/systems/PvPSystem.test.js` | 03-05 |

**결과**: 빌드 ✅ + 649/649 테스트 통과 (+24개 신규) + code-reviewer APPROVED

| GP-2 | Supabase 마이그레이션 SQL (guilds/guild_members + RLS + 트리거) | \ | 03-05 |
| GP-2 | GuildSystem.js — createGuild/joinGuild/leaveGuild/kickMember/donate/getGuildList + 오프라인 폴백 | \ | 03-05 |
| GP-2 | GuildPopup.js — 3탭 UI (Guild Info/Members/Donate) | \ | 03-05 |
| GP-2 | GuildPopup export 추가 | \ | 03-05 |
| GP-2 | GuildSystem 유닛 테스트 36개 신규 | \ | 03-05 |

**결과**: 빌드 ✅ + 685/685 테스트 통과 (+36개 신규) + code-reviewer APPROVED
- Singleton static 패턴, localStorage 캐시 폴백
- VALID_MAX_MEMBERS: [10,20,30,50], DONATION_MIN/MAX: 100/100000
- RLS: guilds(anon read / auth write), guild_members(owner only)
- GuildPopup: 로딩 중 버튼 잠금, 기부 후 2초 피드백, 길드 없을 시 생성 폼 표시

### Sprint 5: 씬↔시스템 연결 & 온보딩 (2026-03-06)
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| P1 | MainMenuScene PvP/Guild 팝업 버튼 연결 (menuItems 8→10개) | `src/scenes/MainMenuScene.js` | 03-06 |
| P2 | arcane/integration → main 머지 (git merge -X theirs, 203개 커밋) | `main` 브랜치 | 03-06 |
| P3 | GachaSystem 전직영웅 방어 코드 추가 (ascended-hero source 기록) | `src/systems/GachaSystem.js` | 03-06 |

**결과**: 빌드 ✅ + 699/699 테스트 통과 + code-reviewer APPROVED (P1/P3), main 브랜치 최신화 (P2)

- BattleSystem 재사용: simulateBattle()에서 BattleSystem 인스턴스 생성, 최대 20턴 시뮬레이션
- 오프라인 지원: Supabase 연결 실패 시 localStorage 캐시 폴백
- 매칭 로직: 내 전투력 ±30% 범위 쿼리, 최대 5명 반환
- 점수 시스템: 승리 +25점, 패배 -10점, 무승부 +5점 기본 (전투력 차이 반영)

### QA 감사 이슈 수정 (2026-03-05)

| ID | 이슈 | 수정 파일 | 날짜 |
|----|------|---------|------|
| QA-1 | GachaSystem 테스트 11개 실패 — CHARACTER_POOL 비어있어 pull() 즉시 실패 반환 | `tests/systems/GachaSystem.test.js` | 03-05 |
| QA-2 | EventDungeonSystem 테스트 실패 — evt_shadow_tower 종료일(02-28)이 현재(03-05) 이전 | `src/data/events.json` (종료일 → 03-31) | 03-05 |
| QA-3 | IdleProgressSystem DPS 계수 초과 — calculateDPS 계수 0.25→0.15 수정 | `src/systems/IdleProgressSystem.js` | 03-05 |
| QA-4 | IdleProgressSystem constructor 테스트 불일치 — BUG-12 수정 이후 loadCurrentBoss 호출 시점 변경 | `tests/systems/IdleProgressSystem.test.js` | 03-05 |
| QA-5 | GachaSystem/SaveManager updateGachaCounter 시그니처 불일치 — (count, currentPity)→(pulls, gotSSR) 통일 | `src/systems/GachaSystem.js`, `src/systems/SaveManager.js` | 03-05 |
| QA-6 | ESLint eqeqeq 에러 — safeAccess.js `!=` → `!==` 수정 | `src/utils/safeAccess.js` | 03-05 |

**결과**: 빌드 0 에러 + 623/623 테스트 통과 + ESLint 에러 0개 (1회 반복만에 PASS)

### 디자인 시스템 통합 (2026-03-05)
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| DS-1 | 배경/브랜드 컬러 통일 (NIKKE 딥 다크 + 블루아카 시안) | `designSystem.js` | 03-05 |
| DS-2 | 교단 12종 색상 단일 진실 원천 정렬 (cults.json 기준) | `designSystem.js`, `layoutConfig.js` | 03-05 |
| DS-3 | 등급 글로우 강화 (R 글로우 추가, SSR 브라이트 골드) | `designSystem.js`, `layoutConfig.js` | 03-05 |
| DS-4 | Orbitron 헤드라인 폰트 추가 (title/subtitle/heading) | `index.html`, `textStyles.ts` | 03-05 |
| DS-5 | 하드코딩 배경색 정리 (tooltip/heroLevel → design token) | `textStyles.ts` | 03-05 |

### 에셋 매핑 시스템 (2026-03-05) — pt + auto-pipeline 실행
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| ASSET-A | portrait-mapping.json SSOT 신규 생성 (char_1~4 → hero_001~004 매핑) | `src/data/portrait-mapping.json` | 03-05 |
| ASSET-A | HeroAssetLoader.js SSOT 연동 (JSON import + `_PORTRAIT_MAP` + `loadImages()` 매핑 적용) | `src/systems/HeroAssetLoader.js` | 03-05 |
| ASSET-B | portrait-mapping.json 커버리지 확장 4→38개 (base_iris~base_paolo + asc_iris_olympus~asc_paolo_balance) | `src/data/portrait-mapping.json` | 03-05 |

**결과**: 빌드 ✅ + 623/623 테스트 통과 + code-reviewer APPROVED (블로커 없음)
- Phase A 핵심: `getTextureKey(hero)` → `hero_${hero.id}` 패턴 유지, `_PORTRAIT_MAP[hero.id] ?? hero.id` 폴백으로 실제 PNG 로드
- Phase B 커버리지: char_1~4 + base_iris~base_paolo(10명) + asc_iris_olympus~asc_paolo_balance(24명) = 38개

**디자인 방향**: Blue Archive(밝은 Civi 캐릭터) × NIKKE(다크 서브컬쳐 UI) 하이브리드
- 폰트 역할 분리: Orbitron(헤드라인) + Noto Sans KR(캐릭터명/본문) + Roboto Mono(수치)
- 교단 색상 3파일 동기화: `cults.json` → `designSystem.js` → `layoutConfig.js`
- balance/chaos/nature 교단 색상 2파일에 누락→추가 완료

### 캐릭터 시스템 재설계 (2026-03-04)
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| CHAR-SLIM | 캐릭터 풀 슬림화 (91캐릭터 → 4슬롯 플레이스홀더, 가챠 비활성화) | `a484671` | 03-04 |
| GDD-1 | CHARACTER_SYSTEM_GDD.md — 전직 시스템 v1.0 기획서 | - | 03-04 |
| GDD-2 | CULT_NARRATIVE_DESIGN.md — 교단 세계관·캐릭터 내러티브 | - | 03-04 |
| GDD-3 | CULT_SYSTEM_DESIGN.md — 교단별 전투 메커니즘·상성 시스템 | - | 03-04 |
| GDD-4 | INSTITUTION_REDESIGN.md — 소환 기관/학파 컨셉 리디자인 | - | 03-04 |
| GDD-5 | EVOLUTION_SYSTEM_GDD.md — 기본영웅 복수 진화루트 v2.0 (최종) | - | 03-04 |

### 진화 시스템 데이터 구현 (2026-03-04) — auto-pipeline 실행
| ID | 태스크 | 커밋 | 날짜 |
|----|--------|------|------|
| CHAR-1 | base-heroes.json 생성 — 기본영웅 10명 (GDD v2.0 스키마) | - | 03-04 |
| CHAR-2a | ascended-heroes.json 생성 — 전직영웅 24개 (SSR 14/SR 7/R 3) | - | 03-04 |
| CHAR-2b | cults.json v2.1 — 5개 기관 추가(avalon/helheim/tartarus/balance/nature), institutionName+baseRarity | - | 03-04 |
| CHAR-4 | index.ts — getBaseHero/getAscendedHero/getCharacterOrHero 등 6개 함수 추가 | - | 03-04 |
| CHAR-4b | BattleSystem.js — getCharacterOrHero 폴백 연동 | - | 03-04 |

### 테스트 커버리지 확장
| 항목 | 커밋 | 날짜 |
|------|------|------|
| 유닛 테스트 9개 시스템 추가 (353→562) | `654c71a` | 02-14 |
| Playwright E2E 34개 (로그인/메뉴/팝업/전투/자동로그인) | `654c71a` | 02-14 |
| 이벤트 던전 유닛 테스트 28개 추가 (562→590) | `128fdf0` | 02-15 |
| 보스 전투 테스트 7개 추가 (590→597) | `fd3a7f6` | 02-15 |
| 샌드백 보스 테스트 4개 추가 (597→601) | - | 02-15 |

---

## 현재 기획 방향 (2026-03-04 기준)

### 캐릭터 진화 시스템 v2.0 (EVOLUTION_SYSTEM_GDD.md)

```
미정령 (Unbound Spirit) → 기본영웅 (Base Hero) → 전직 영웅 (Ascended Hero)
```

**기본영웅 10명 (MVP)**: 아이리스, 세라, 루카, 카이, 린, 오마르, 솔, 하나, 레온, 파올로

**소환 기관 12개 (코드명 유지)**:
- 폭격 계열: olympus, valhalla, chaos
- 봉쇄 계열: yomi, helheim, tartarus
- 지속 계열: kunlun, avalon, nature
- 조율 계열: asgard, takamagahara, balance

**MVP 전직 영웅**: 24개 (SSR 14 / SR 7 / R 3)

**핵심 특징**: 같은 기본영웅을 여러 기관 루트로 동시 육성 가능 (멀티-각성), 파티 내 동일 기본영웅 1체 제한

**데이터 구현 현황 (2026-03-05 기준)**:
- `src/data/base-heroes.json` ✅ 생성 완료 (10명, GDD v2.0 스키마)
- `src/data/ascended-heroes.json` ✅ 생성 완료 (24개, SSR 14/SR 7/R 3)
- `src/data/cults.json` ✅ v2.1 업데이트 (14개 기관, institutionName/baseRarity 추가)
- `src/data/index.ts` ✅ 진화 시스템 접근 함수 6개 추가
- `src/systems/BattleSystem.js` ✅ getCharacterOrHero 폴백 연동
- `src/components/popups/AscensionPopup.js` ✅ CHAR-3: 3단계 기관 각인 팝업 UI (커밋: a5c08ba) / CHAR-5: 피티 배지 UI 추가
- `src/systems/SaveManager.js` ✅ CHAR-3: 각인 메서드 6개 + baseHeroes/ascendedHeroes 저장 필드 / CHAR-5: pity 필드 + 4개 메서드 추가
- `src/systems/PitySystem.js` ✅ CHAR-5: 소프트/하드 피티 계산 유틸리티 (신규 생성)
- **다음 구현 태스크**: GP-2 길드 시스템 (GP-1 PvP/랭킹 ✅ 완료 — 2026-03-05)

---

## 남은 태스크 (백로그)

### P0: 캐릭터 진화 시스템 구현
| ID | 태스크 | 난이도 | 상태 | 설명 |
|----|--------|--------|------|------|
| CHAR-1 | 기본영웅 데이터 생성 | M | ✅ | base-heroes.json (10명) + ascended-heroes.json (24명) |
| CHAR-2 | 소환 기관 데이터 업데이트 | M | ✅ | cults.json v2.1 — institutionName/baseRarity + 5개 기관 추가 |
| CHAR-3 | 기관 각인 UI | H | 미완 | 기본영웅 선택 → 기관 선택 → 전직 확인 플로우 |
| CHAR-4 | BattleSystem 연동 | M | ✅ | index.ts 6개 함수 + BattleSystem.js 폴백 연동 |
| CHAR-3 | 기관 각인 UI | H | ✅ | AscensionPopup.js 3단계 UI + SaveManager 각인 메서드 6개 (커밋: a5c08ba, 2026-03-05) |
| CHAR-5 | 피티 시스템 구현 | M | ✅ | PitySystem.js 신규 + SaveManager 확장 + AscensionPopup 배지 (2026-03-05) |

### P1: 게임플레이 확장
| ID | 태스크 | 난이도 | 설명 |
|----|--------|--------|------|
| GP-1 | PvP/랭킹 | H | ✅ 완료 (2026-03-05) — 비동기 PvP + Supabase 리더보드 |
| GP-2 | 길드 시스템 | H | ✅ 완료 (2026-03-06) — 길드 생성/가입/기부/탈퇴 |

### P2: 배포 & 운영 — ✅ 완료
| ID | 태스크 | 상태 | 설명 |
|----|--------|------|------|
| DEPLOY-1 | Vercel 실제 배포 | ✅ | https://arcane-collectors.vercel.app |
| DEPLOY-2 | 환경 변수 설정 | ✅ | Supabase URL/KEY Vercel 환경변수 설정 완료 |
| DEPLOY-3 | PWA 아이콘 | ✅ | 192x192, 512x512 프로시저럴 생성 완료 |

### Sprint 5 백로그 (다음 스프린트 후보)
| ID | 태스크 | 우선순위 | 난이도 | 설명 |
|----|--------|---------|--------|------|
| TASK-A | 가챠-전직 연동 수리 | P0 | M | GachaPopup → GachaSystem.pull() 교체, 전직영웅 가챠 풀 활성화 |
| TASK-B | 전투 성장 루프 완결 | P0 | M | BattleScene에 BattleSystem import, ProgressionSystem 경험치 연결 |
| TASK-C | 신규 유저 최소 온보딩 | P1 | H | TutorialScene(3분) + 무료 가챠 체험 + 첫 전직 안내 |
| TASK-D | 컬렉션 도감 UI | P1 | M | HeroListPopup 확장 — 전직 루트 진행 현황, 미획득 실루엣 표시 |
| TASK-E | 스테이지 시스템 교단 연계 | P1 | M | stages.json 9챕터×5스테이지 확장, 교단 보너스 스테이지 연결 |

---

## 테스트 현황

### Vitest 유닛 테스트 (699개, 26파일)
| # | 파일 | 테스트 수 |
|---|------|----------|
| 1 | data/index.test.js | 62 |
| 2 | BattleSystem.test.js | 45 |
| 3 | EquipmentSystem.test.js | 44 |
| 4 | constants.test.js | 37 |
| 5 | PartyManager.test.js | 33 |
| 6 | SaveManager.test.js | 41 (+8 CHAR-5) |
| 7 | EventDungeonSystem.test.js | 28 |
| 8 | IdleProgressSystem.test.js | 28 |
| 9 | ProgressionSystem.test.js | 26 |
| 10 | SweepSystem.test.js | 25 |
| 11 | CouponSystem.test.js | 24 |
| 12 | EvolutionSystem.test.js | 24 |
| 13 | EventBus.test.js | 23 |
| 14 | errorPatterns.test.js | 23 |
| 15 | MoodSystem.test.js | 21 |
| 16 | TowerSystem.test.js | 21 |
| 17 | QuestSystem.test.js | 20 |
| 18 | EnergySystem.test.js | 17 |
| 19 | GachaSystem.test.js | 16 |
| 20 | SynergySystem.test.js | 16 |
| 21 | AutoLogin.test.js | 16 |
| 22 | helpers.test.js | 13 |
| 23 | **PitySystem.test.js** | **14 (CHAR-5 신규)** |
| 24 | **PvPSystem.test.js** | **24 (GP-1 신규)** |
| 25 | **GuildSystem.test.js** | **36 (GP-2 신규)** |
| 26 | (기타) | — |

### Playwright E2E 테스트 (34개)
| 카테고리 | 테스트 수 | 내용 |
|----------|----------|------|
| 로그인 플로우 | 3 | 캔버스, LoginScene, MainMenu 전환 |
| 메인 메뉴 | 3 | 활성화, IdleBattleView, UI 요소 |
| 팝업 7종 | 21 | 열기/닫기/복귀 × 7 |
| 자동전투 | 4 | HP바, 전투사이클, 적 유닛 |
| 자동 로그인 | 3 | localStorage, 씬 스킵 |

실행 명령:
```bash
npm test              # Vitest 유닛 테스트
npm run test:e2e      # Playwright E2E (headless)
npm run test:e2e:headed  # E2E (브라우저 표시)
npm run build:analyze  # 번들 분석
```

---

## 빌드 & 배포

### 번들 크기 (프로덕션)
| 청크 | 원본 | gzip | 압축률 |
|------|------|------|--------|
| phaser | 1,188KB | 315KB | 73.5% |
| game-core | 436KB | 116KB | 73.3% |
| game-data | 164KB | 58KB | 64.6% |
| supabase | 164KB | 42KB | 74.6% |
| vendor | 118KB | 35KB | 70.0% |
| **총합** | **2,070KB** | **568KB** | **73%** |

### CI/CD 파이프라인
- `ci.yml`: 타입체크 → 데이터검증 → 유닛테스트 → E2E → 빌드 (병렬)
- `deploy.yml`: CI 통과 후 Vercel/GitHub Pages 자동 배포
- `pr-check.yml`: PR 상태 체크

### 배포 설정 파일
- `vercel.json`: SPA 라우팅 + 캐싱 + 보안 헤더
- `netlify.toml`: 빌드 + 리다이렉트 + 헤더
- `public/manifest.json`: PWA 기본 설정

---

## 프로젝트 문서 구조

```
docs/
├── PRD_Unified_v5.md                    ← 메인 기획서 (91캐릭터, 시스템 전체)
├── CURRENT_STATUS.md                    ← 이 파일
├── AUTH_SYSTEM.md                       ← 자동로그인 시스템 문서
├── PROCEDURAL_ART_GUIDE.md             ← 프로시저럴 아트 가이드
├── GP-3-EventDungeonSystem-Implementation.md ← 이벤트 던전 구현 문서
├── INFRA-2-CI-CD-REPORT.md             ← CI/CD 구축 리포트
├── CHARACTER_SYSTEM_GDD.md             ← 전직 시스템 v1.0 기획 (구버전 참고)
├── CULT_NARRATIVE_DESIGN.md            ← 교단 세계관/캐릭터 내러티브 (참고)
├── CULT_SYSTEM_DESIGN.md               ← 교단별 전투 메커니즘 (참고)
├── INSTITUTION_REDESIGN.md             ← 소환 기관/학파 컨셉 (참고)
├── EVOLUTION_SYSTEM_GDD.md             ← ★ 기본영웅 복수 진화루트 v2.0 (최신 최종)
├── prd/
│   └── PRD_Sprint3_UIX.md              ← Sprint 3 PRD
└── done/                               ← 완료된 문서 아카이브
    ├── tasks/                          ← Phase 1~2 태스크 기록
    ├── prd-completed/                  ← 완료된 PRD
    ├── POPUP_USAGE.md                  ← 팝업 시스템 가이드
    ├── testing/                        ← 테스트 결과
    ├── dev-logs/                       ← 개발 로그
    └── workers/                        ← 워커 태스크 기록
```

---

## 기술 스택

| 항목 | 값 |
|------|-----|
| 엔진 | Phaser 3 (v3.90.0) |
| 번들러 | Vite 5 |
| 모듈 | ES Modules |
| 해상도 | 720x1280 |
| 유닛 테스트 | Vitest (699개, 26파일) |
| E2E 테스트 | Playwright (34개, 5카테고리) |
| 타입체크 | TypeScript (tsc --noEmit) |
| 백엔드 | Supabase (하이브리드 저장) |
| CI/CD | GitHub Actions (ci + deploy + pr-check) |
| 배포 | Vercel (https://arcane-collectors.vercel.app) |
| 빌드 크기 | 568KB gzip (73% 압축) |
