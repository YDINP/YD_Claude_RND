# ArcaneCollectors 현재 상태

> **최종 업데이트**: 2026-03-07
> **브랜치**: `arcane/integration`
> **테스트**: 1001개 유닛 (1001/1001 통과, 35파일) | **빌드**: 0 에러 | **ESLint**: 에러 0개
> **번들 크기**: 568KB gzip (최적화 완료)
> **최근 작업**: [버그 수정] UI 팝업 전수 테스트 발견 HIGH 2건 + MED 2건 수정 완료 (z-order / 젬차감 / i18n) — auto-pipeline APPROVED (commit `f7188a5`)

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
| TASK-C | TutorialScene.js 신규 (4단계 온보딩), BootScene.js 라우팅 패치, gameConfig.js 씬 등록, TutorialScene.test.js 30개 테스트 | `src/scenes/TutorialScene.js` 외 3개 | 03-06 |
| TASK-A | GachaSystem CHARACTER_POOL 초기화 수정 — `initializePool()` 모듈 로드 시 자동 실행, ascended-heroes 가챠 풀 활성화, pull() 내 재초기화 guard 추가 | `src/systems/GachaSystem.js`, `tests/systems/GachaSystem.test.js` (+4 테스트) | 03-06 |
| TASK-B | BattleSystem finishBattle() EXP 분배 연동 — ProgressionSystem import, 균등 EXP 분배, expResults 배열 result 포함 | `src/systems/BattleSystem.js`, `tests/systems/BattleSystem.test.js` (+8 테스트), `tests/systems/GachaSystem.test.js` (회귀 수정) | 03-06 |
| TASK-D | HeroListPopup 컬렉션 도감 UI 확장 — 4개 순수 함수 export (buildOwnedSet/calcCodexProgress/buildAscendedCardData/buildCodexSections), 보유/미획득 영웅 구분, 전직 루트 그리드 표시 | `src/components/popups/HeroListPopup.js`, `tests/components/HeroListPopup.test.js` (+34 테스트) | 03-06 |

**결과**: 빌드 ✅ + 775/775 테스트 통과 + code-reviewer APPROVED (TASK-D)
| TASK-E | StageSystem.js 신규 생성 — 8개 public 메서드 (getStageById/calculateCultBonus 등), lazy init Map 패턴 | `src/systems/StageSystem.js` | 03-07 |
| TASK-E | stages.json 9챕터x5스테이지 확장 (5챕터→9챕터 45스테이지, 전 스테이지 recommendedCult+cultBonus 추가) | `src/data/stages.json` | 03-07 |
| TASK-E | StageSystem.test.js 신규 31개 테스트 (getStageById/calculateCultBonus/getUnlockedStages 등 전체 메서드 유닛 테스트) | `tests/systems/StageSystem.test.js` | 03-07 |

**결과**: 빌드 ✅ + 806/806 테스트 통과 + code-reviewer APPROVED (TASK-E)

### Sprint 6: 서브컬쳐 교단 v3.0 전면 교체 + 각성 시스템 (2026-03-07) — pt-pipeline auto 5단계
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| CULT-UI | HeroListPopup.js — 교단 필터/정렬/명칭 10개 신규 서브컬쳐 ID로 교체 | `src/components/popups/HeroListPopup.js` | 03-07 |
| CULT-UI | GachaPopup.js — cult 기본값 `'olympus'` → `'cafe_encore'` | `src/components/popups/GachaPopup.js` | 03-07 |
| CULT-UI | gameConfig.js — CULTS/COLORS/CULT_COLORS/CULT_INFO 10개 신규 교체 | `src/config/gameConfig.js` | 03-07 |
| CULT-UI | designSystem.js — DESIGN.colors.cult 10개 신규 hex 교체 | `src/config/designSystem.js` | 03-07 |
| CULT-UI | layoutConfig.js — CULT_COLORS 10개 신규 교체 | `src/config/layoutConfig.js` | 03-07 |
| CULT-UI | GachaScene.js — cult 기본값 2곳 `'olympus'` → `'cafe_encore'` | `src/scenes/GachaScene.js` | 03-07 |
| CULT-UI | HeroListScene.js — 교단 필터 배열 + cultOrder 정렬 10개 신규 교체 | `src/scenes/HeroListScene.js` | 03-07 |
| CULT-TS | character.d.ts — CultType union 10개 신규 서브컬쳐 ID | `src/types/character.d.ts` | 03-07 |
| CULT-TS | helpers.ts — Cult type union + getCultIcon() 이모지 10개 신규 | `src/utils/helpers.ts` | 03-07 |
| CULT-TS | constants.ts — CULT const enum + CULT_INFO + CULT_MOOD_BONUS 10개 교단 재매핑 | `src/utils/constants.ts` | 03-07 |
| CULT-TS | HeroFactory.ts — normalize() cult 기본값 `'cafe_encore'` | `src/systems/HeroFactory.ts` | 03-07 |
| AWAKE-1 | AwakeningSystem.js 신규 — 10교단 각성조건 + 5단계 진행도 + SaveManager 추상화 | `src/systems/AwakeningSystem.js` | 03-07 |
| AWAKE-1 | AwakeningSystem.test.js 신규 39개 테스트 (TC-01~TC-39) | `tests/systems/AwakeningSystem.test.js` | 03-07 |
| QA | constants.test.js 기존 테스트 수정 (10교단 + CUNNING 중복 매핑 허용) | `tests/utils/constants.test.js` | 03-07 |
| QA | data/index.test.js cult 기대값 `'cafe_encore'` 수정 | `tests/data/index.test.js` | 03-07 |

**결과**: 빌드 ✅ + 845/845 테스트 통과 + src 내 구 교단 ID 잔존 0건 + code-reviewer APPROVED

| AWAKE-2 | cult-materials.json 신규 — 10교단 소재(소재명/요구량/등급/아이콘/획득처) + cult_imprint_stone SSR 전용 | `src/data/cult-materials.json` | 03-07 |
| AWAKE-2 | AwakeningSystem.js — cult-materials.json import, getMaterialInfo(cultId) 헬퍼 추가 | `src/systems/AwakeningSystem.js` | 03-07 |
| AWAKE-2 | cult-materials.test.js 신규 25개 테스트 (TC-M01~M25, AWAKENING_REQUIREMENTS 교차 검증) | `tests/data/cult-materials.test.js` | 03-07 |

**결과**: 빌드 ✅ + 870/870 테스트 통과 + code-reviewer APPROVED

| AWAKE-3 | AwakeningPopup.js 신규 — PopupBase 상속, 레벨/친밀도/소재/시련 조건 체크리스트 + 프로그레스 바 + SSR 각인석 조건 + 각성 버튼(활성/비활성) + 글로우 효과 | `src/ui/AwakeningPopup.js` | 03-07 |
| AWAKE-3 | AwakeningPopup.test.js 신규 36개 테스트 (TC-01~TC-36, 헬퍼 함수 + 클래스 통합) | `tests/ui/AwakeningPopup.test.js` | 03-07 |

**결과**: 빌드 ✅ + 906/906 테스트 통과 + code-reviewer APPROVED (AWAKE-3)

| AWAKE-4 | AwakeningCutscene.js 신규 — 7단계 풀스크린 컷신(페이드인/파티클/캐릭터전환/텍스트빌드업/플래시/스탯업/페이드아웃), 10교단 파티클 컬러, play() 정적 메서드, AWAKENING_SOUND_KEY, 스킵 기능 | `src/systems/AwakeningCutscene.js` | 03-07 |
| AWAKE-4 | AwakeningPopup.js 연동 — 각성 버튼 → AwakeningCutscene.play() 호출 | `src/ui/AwakeningPopup.js` | 03-07 |
| AWAKE-4 | AwakeningCutscene.test.js 신규 21개 테스트 (10교단 전부, play() 시그니처, onComplete, 스킵, 입력 차단/해제) | `tests/systems/AwakeningCutscene.test.js` | 03-07 |

**결과**: 빌드 ✅ + 927/927 테스트 통과 + code-reviewer APPROVED (AWAKE-4)

### Sprint 6 Swarm: 에셋/방랑자/UX (2026-03-07) — pt-swarm 4태스크 병렬 실행
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| SWARM-1 | AwakeningCutscene.js AWAKENING_PARTICLE_COLORS 10개 GDD 기준 통일 (prism_stars→0xFF6EB4, neon_crow→0x00F5FF 등) | `src/systems/AwakeningCutscene.js` | 03-07 |
| SWARM-1 | characters.json cult→null/preferredCult 방랑자 시스템 적용 (4캐릭터) | `src/data/characters.json` | 03-07 |
| SWARM-1 | GachaScene.js cult 폴백 `'cafe_encore'`→null (방랑자 상태 유지) | `src/scenes/GachaScene.js` | 03-07 |
| SWARM-2 | portrait-mapping.json 현행화 — char_1~4→hero_001~004, 구 교단 ID 34개 제거 | `src/data/portrait-mapping.json` | 03-07 |
| SWARM-3 | ProceduralAssets.js 신규 — Canvas 픽셀아트 배경/UI 텍스처 8종 (메인메뉴/전투/가챠/버튼/패널) | `src/systems/ProceduralAssets.js` | 03-07 |
| SWARM-3 | AudioGenerator.js 신규 — Web Audio API 8비트 SFX/BGM (click/가챠롤/SSR팡파레/타격/스킬/각성/전투BGM/메뉴BGM) | `src/systems/AudioGenerator.js` | 03-07 |
| SWARM-3 | PreloadScene.js Phase 1에 ProceduralAssets.generateAll() 연동 | `src/scenes/PreloadScene.js` | 03-07 |
| SWARM-4 | BattleScene.js 배속 [1,2,3]→[1,2,4] 변경 + showSkillBanner() 신규 (교단 컬러 슬라이드 배너) | `src/scenes/BattleScene.js` | 03-07 |

**결과**: 빌드 ✅ + 953/953 테스트 통과 (+26개 신규: ProceduralAssets 11 + AudioGenerator 15) | 34개 테스트 파일 | 충돌 없는 자동 머지 4건

### Sprint 6 Swarm-A: 가챠 동기화 + BA×NIKKE 에셋 + DebugFAB 드래그 (2026-03-07) — pt-swarm 3태스크 병렬 실행
| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| SWARM-A1 | GachaPopup.js cult 폴백 →null (방랑자 교단 null 보존) |  | 03-07 |
| SWARM-A1 | character.schema.json cult enum 신규 10개 교단으로 교체 + oneOf[null, enum] 패턴 |  | 03-07 |
| SWARM-A2 | ProceduralAssets.js BA×NIKKE 스타일 전면 개선 — 별빛 그라데이션/소성운/방사광/동심원 링 파티클 |  | 03-07 |
| SWARM-A2 | designSystem.js background/accent/glowIntensity 신규 토큰 추가 |  | 03-07 |
| SWARM-A2 | 신규 텍스처: star-field(별 파티클), neon-grid(네온 격자) |  | 03-07 |
| SWARM-A3 | DebugFAB.js 드래그 이동 기능 — 5px 임계값 클릭/드래그 구분, 화면 경계 clamp |  | 03-07 |
| SWARM-A3 | DebugFAB.js localStorage 위치 저장/복원 () |  | 03-07 |

**결과**: 빌드 ✅ | 충돌 없는 자동 머지 3건

### Sprint 7: 스킬/가챠/퀘스트/메뉴 UX + UI 레이아웃 QA (2026-03-07) — pt-swarm 4태스크 + QA 루프

#### SPRINT7 병렬 구현 (pt-swarm 4태스크)
| ID | 태스크 | 파일 | 커밋 | 날짜 |
|----|--------|------|------|------|
| SWARM7-1 | skills.json `character_skills`(athena/sigrun/heije) + `synergy_skills`(Olympus 2/3/4인) + `grade_multipliers` 섹션 추가 | `src/data/skills.json` | `2cb5811` | 03-07 |
| SWARM7-1 | BattleSystem.js `SkillCooldownManager` + `CultSynergyCalculator` 클래스 추가, 스킬 로드/패시브/반응/액티브 메서드 6개 신규 | `src/systems/BattleSystem.js` | `2cb5811` | 03-07 |
| SWARM7-2 | GachaScene.js 등급별 연출 8개 메서드 추가 (+623줄) — N/R/SR/SSR 차별화, SSR 3단계 서스펜스, 10연 5×2 그리드 | `src/scenes/GachaScene.js` | `8b52cdc` | 03-07 |
| SWARM7-3 | DailyQuestSystem.js 신규 — ES6 싱글톤, 오전 5시 기준 갱신, 5개 일일 퀘스트(DQ-001~005), EventBus 구독 | `src/systems/DailyQuestSystem.js` | `78fcf58` | 03-07 |
| SWARM7-3 | quests.json `gddDailyQuests` + `gddCompletionBonus` 섹션 추가 | `src/data/quests.json` | `78fcf58` | 03-07 |
| SWARM7-3 | systems/index.js DailyQuestSystem + dailyQuestSystem 싱글톤 export 추가 | `src/systems/index.js` | `78fcf58` | 03-07 |
| SWARM7-4 | MainMenuScene.js `createBottomMenu()` P1/P2/P3 3계층 재구성 — P1 전투 70%/펄스, P2 가챠+파티 2버튼, P3 8서브아이콘 2행4열 | `src/scenes/MainMenuScene.js` | `db62da3` | 03-07 |

#### 후속 연동 (병렬 3개)
| ID | 태스크 | 파일 | 커밋 | 날짜 |
|----|--------|------|------|------|
| POST-1 | BattleScene.js `BattleSystem` import + `initializeBattlers()` stats 동기화 + `loadSkillData/processActiveSkills` 호출 연결 | `src/scenes/BattleScene.js` | `e7074d3` | 03-07 |
| POST-2 | GachaSystem.js `GACHA_COMPLETE` 이벤트 신규 emit (results/count/pityInfo) + `source: 'gacha'` 필드 추가 | `src/systems/GachaSystem.js` | `6aaeb41` | 03-07 |
| POST-2 | DailyQuestSystem.js GACHA_COMPLETE 기반 가챠 퀘스트 트래킹으로 교체 (중복 캐릭터 케이스 해결) | `src/systems/DailyQuestSystem.js` | `6aaeb41` | 03-07 |

#### UI 레이아웃 QA 루프 (pt-qa-loop — 1/3 이터레이션 PASS)
| ID | 이슈 | 수정 내용 | 파일 | 날짜 |
|----|------|---------|------|------|
| QA-LAY-1 | MainMenuScene AdventurePanel/IdleBattleView 225px 겹침 | `viewY: s(500)→s(632)`, `viewHeight: s(300)→s(250)`, `summaryY: s(795)→s(770)` | `src/scenes/MainMenuScene.js` | 03-07 |

**결과**: 빌드 ✅ (10.87s) | 950 통과 / 3 실패(ProceduralAssets.test.js 기존) | QA_RESULT: PASS (1/3 이터레이션)

### 포트레이트 매핑 시스템 91개 전체 확장 (2026-03-07) — pt + pt-qa-loop
| ID | 태스크 | 파일 | 커밋 | 날짜 |
|----|--------|------|------|------|
| PORTRAIT-P2 | HeroAssetLoader.js `generatePlaceholders()` null 방어 — `characters.forEach` → `characters.filter(Boolean).forEach` (null/undefined 입력 TypeError 방지) | `src/systems/HeroAssetLoader.js` | `abae293` | 03-07 |
| PORTRAIT-P3 | portrait-mapping.json 4→91개 확장 — char_1~char_91 전체를 hero_001~hero_091 PNG에 매핑 | `src/data/portrait-mapping.json` | `abae293` | 03-07 |
| PORTRAIT-P3 | characters.json 4→91개 확장 — char_5~char_91 87개 스텁 추가 (rarity/class/cult 균등 배분) | `src/data/characters.json` | `abae293` | 03-07 |
| PORTRAIT-P3 | PORTRAIT_MAPPING_GUIDE.md 신규 — 10교단별 캐릭터 배분 계획 + 91개 ID↔hero_NNN↔교단 매핑 표 | `docs/PORTRAIT_MAPPING_GUIDE.md` | `abae293` | 03-07 |
| PORTRAIT-TEST | HeroAssetLoader.test.js 신규 — 48개 유닛 테스트 (TC-HAL-01~09: 매핑 로드/포트레이트 키/generatePlaceholders/null 방어) | `tests/systems/HeroAssetLoader.test.js` | `abae293` | 03-07 |

**결과**: 빌드 ✅ + **1001/1001 테스트 통과** (35파일, +48개 신규) | QA 루프 PASS

### UI 팝업 전수 시각 테스트 (2026-03-07) — Playwright MCP 수동 캡처

메인메뉴 하단 8개 팝업 전체를 순서대로 열고 스크린샷 캡처 후 시각 분석 수행.

| 팝업 | 좌표 | 스크린샷 | 분석 결과 |
|------|------|---------|---------|
| 일일퀘스트 | 앞 세션 | `arcane-popup-quest.png` | ✅ 정상 (5개 퀘스트, 보상 표시) |
| 영웅목록 | 앞 세션 | `arcane-popup-herolist.png` | ❌ 포트레이트 3개 누락, 이름 "???" |
| PvP | 앞 세션 | `arcane-popup-partyedit.png` | ❌ 길드 UI 전체 영문, Supabase 미연결 |
| 길드 | 앞 세션 | - | ❌ 전체 영문 미번역 |
| 타워 | (351,1739) | `arcane-popup-tower.png` | ❌ 도전 버튼 ✕ 아이콘, "slime x3" 영문 |
| 이벤트 던전 | (477,1739) | `arcane-popup-eventdungeon.png` | ❌ dragon_scale/shadow_fragment 변수명 노출 |
| 인벤토리 | (603,1739) | `arcane-popup-inventory.png` | ❌ 아이템 아이콘 전체 동일, "common" 영문 |
| 설정 | (729,1739) | `arcane-popup-settings.png` | ❌ 배경에 파티 HUD 잔상 (z-order 버그) |

#### 발견된 버그 전체 목록 (16건)

| # | 분류 | 심각도 | 설명 | 발생 위치 |
|---|------|--------|------|---------|
| 1 | 런타임 | HIGH | SaveManager 무한 로드 루프 (클릭 시 수십 번 "데이터 로드" 반복) | SaveManager.js |
| 2 | 데이터 | MED | 캐릭터 이름 "???" (4캐릭터 중 일부 이름 미표시) | HeroListPopup |
| 3 | 에셋 | MED | 캐릭터 포트레이트 누락 (영웅목록 상단 카드 X 표시) | HeroListPopup |
| 4 | 에셋 | MED | "전투/스테이지 진행", "파티 편성" 버튼 아이콘 X 표시 | MainMenuScene |
| 5 | UI | LOW | 에너지 바 색상 없음 (HUD 에너지 게이지 투명) | MainMenuScene HUD |
| 6 | 로직 | HIGH | 💎+ 버튼 클릭 시 젬 50개 감소 (팝업 없이 차감) | MainMenuScene |
| 7 | 데이터 | MED | characters.json schema 검증 실패 | 빌드/CI |
| 8 | 네트워크 | MED | PvP Supabase 연동 실패 (프로덕션 환경변수 문제 추정) | PvPSystem.js |
| 9 | i18n | MED | 길드 UI 전체 영문 미번역 (Create Guild / Guild Members 등) | GuildPopup.js |
| 10 | 에셋 | LOW | 타워 도전 버튼 좌측 ✕ 아이콘 (텍스처 누락 fallback) | TowerSystem/팝업 |
| 11 | i18n | LOW | 타워 "slime x3" 영문 미번역 | TowerSystem 데이터 |
| 12 | i18n | MED | 이벤트 팝업 "dragon_scale: 0", "shadow_fragment: 0" — 변수명 그대로 노출 | EventDungeonSystem |
| 13 | 에셋 | MED | 인벤토리 아이템 아이콘 전체 동일 (모든 장비가 동일 갈색 도형) | InventoryPopup/아이콘 시스템 |
| 14 | i18n | LOW | 인벤토리 "common" 영문 미번역 (등급 표시) | InventoryPopup |
| 15 | UI | HIGH | 설정 팝업 배경에 파티 편성 HUD 잔상 노출 (z-order 문제) | SettingsPopup/MainMenuScene |
| 16 | 에셋 | LOW | 파티 슬롯 캐릭터 원형 아이콘 X 표시 (텍스처 미등록) | MainMenuScene 파티 HUD |

> 심각도: HIGH = 게임플레이 영향 / MED = UX 품질 저하 / LOW = 폴리싱 필요

### UI 팝업 버그 수정 (2026-03-07) — auto-pipeline 5단계 APPROVED (commit `f7188a5`)

| # | 심각도 | 버그 | 수정 방법 | 파일 |
|---|--------|------|---------|------|
| 15 | HIGH | SettingsPopup 배경에 파티 HUD 잔상 (z-order) | 팝업 open 시 `_partyObjects.forEach setVisible(false)`, close 시 복원 | `MainMenuScene.js` |
| 6 | HIGH | 💎+ 버튼 클릭 시 젬 50개 즉시 차감 | Modal 확인 팝업 경유 후 충전 실행, 즉시 차감 제거 | `MainMenuScene.js` |
| 12 | MED | "dragon_scale: 0", "shadow_fragment: 0" 변수명 노출 | `EVENT_CURRENCY_NAMES` 매핑 + `getCurrencyName()` 함수 적용 | `EventDungeonPopup.js` |
| 9 | MED | GuildPopup 전체 영문 미번역 | 영문 텍스트 18개 한국어 번역 완료 | `GuildPopup.js` |

**결과**: 빌드 ✅ + **1001/1001 테스트 통과** + code-reviewer APPROVED

---

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

### 교단 전면 재설계 v3.0 (2026-03-07) — 허구 서브컬쳐 10개 교단

| ID | 태스크 | 파일 | 날짜 |
|----|--------|------|------|
| CULT-V3 | cults.json v3.0 — 기존 14개 신화 기반 교단 전면 폐기, 허구 서브컬쳐 10개 교단으로 대체 | `src/data/cults.json` | 03-07 |
| CULT-V3 | CULT_REDESIGN_V2.md — 신규 10개 교단 전체 설계 문서 (ID/컬러/Rarity/테마/시너지/로어) | `docs/CULT_REDESIGN_V2.md` | 03-07 |
| CULT-V3 | characters.json cult 필드 갱신 — 4캐릭터 cult 매핑 (iron_beat/glitch_paradise/lunatic_circus/buddy_garden) | `src/data/characters.json` | 03-07 |
| AWAKE-GDD | AWAKENING_SYSTEM_GDD.md — 교단 각성 시스템 v1.0 기획서 (방랑자→각성 5단계, 3조건, 연출, 경제) | `docs/AWAKENING_SYSTEM_GDD.md` | 03-07 |

**10개 허구 서브컬쳐 교단**:
- SSR: prism_stars(아이돌/팬덤), neon_crow(해커/사이버펑크), stella_club(천문동아리), lunatic_circus(마술사/서커스)
- SR: ink_cyclone(그라피티), card_cartel(TCG), buddy_garden(원예), glitch_paradise(인터넷밈), iron_beat(록밴드)
- R: cafe_encore(카페/중립)

**교단 각성 시스템 핵심 설계**:
- 방랑자(Wanderer) → 관심 → 입문 → 수련 → 서약 → 각성 완료 (5단계)
- 조건: 친밀도 Lv(20~30) + 교단 소재(20~30개) + 교단 시련 클리어
- SSR 추가조건: 교단 각인석 1개 (월 1회 무료 or 다이아 500)
- 각성 연출: 8~12초 풀스크린 컷신, 교단별 파티클/컬러/사운드 차별화
- 내러티브: "공명(Resonance)" 개념, 10개 교단별 각성 트리거 정의

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
| TASK-A | 가챠-전직 연동 수리 | P0 | M | ✅ 완료 (03-06) — initializePool() 자동실행, ascended-heroes 풀 활성화 |
| TASK-B | 전투 성장 루프 완결 | P0 | M | ✅ 완료 (03-06) — finishBattle() EXP 분배 연동, expResults 포함 |
| TASK-C | 신규 유저 최소 온보딩 | P1 | H | TutorialScene(3분) + 무료 가챠 체험 + 첫 전직 안내 |
| TASK-D | 컬렉션 도감 UI | P1 | M | ✅ 완료 (03-06) — HeroListPopup 확장, 4개 순수 함수 export, +34 테스트 |
| TASK-E | 스테이지 시스템 교단 연계 | P1 | M | ✅ 완료 (03-07) — stages.json 9챕터×5스테이지, StageSystem.js, +31 테스트 |

### Sprint 6 백로그 (교단 v3.0 후속 구현) — 전부 완료 ✅
| ID | 태스크 | 우선순위 | 난이도 | 설명 |
|----|--------|---------|--------|------|
| ~~CULT-UI~~ | ~~UI 레이어 교단 ID 갱신~~ | P0 | M | **완료** — HeroListPopup/GachaPopup/gameConfig/designSystem/layoutConfig 교체 (845 테스트) |
| ~~CULT-TS~~ | ~~TypeScript 타입 갱신~~ | P0 | S | **완료** — character.d.ts Cult union + HeroFactory 기본값 교체 (845 테스트) |
| ~~AWAKE-1~~ | ~~AwakeningSystem.js 구현~~ | P1 | M | **완료** — cult: null 방랑자, 3조건 체크, 5단계 진행도, +39 테스트 (870 테스트) |
| ~~AWAKE-2~~ | ~~cult-materials.json 데이터~~ | P1 | S | **완료** — 10교단 소재 정의, getMaterialInfo() 헬퍼, +25 테스트 (906 테스트) |
| ~~AWAKE-3~~ | ~~AwakeningPopup.js UI~~ | P2 | M | **완료** — 진행도 게이지, 조건 체크리스트, 각성 가능 알림, +36 테스트 (927 테스트) |
| ~~AWAKE-4~~ | ~~각성 컷신 연출~~ | P3 | H | **완료** — 7단계 풀스크린 컷신, 10교단 파티클/컬러, play() 정적 메서드, 스킵 기능 (953 테스트) |

---

## 테스트 현황

### Vitest 유닛 테스트 (1001개, 35파일)
| # | 파일 | 테스트 수 |
|---|------|----------|
| 1 | data/index.test.js | 62 |
| 2 | BattleSystem.test.js | 53 (+8 TASK-B) |
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
| 19 | GachaSystem.test.js | 20 (+4 TASK-A) |
| 20 | SynergySystem.test.js | 16 |
| 21 | AutoLogin.test.js | 16 |
| 22 | helpers.test.js | 13 |
| 23 | **PitySystem.test.js** | **14 (CHAR-5 신규)** |
| 24 | **PvPSystem.test.js** | **24 (GP-1 신규)** |
| 25 | **GuildSystem.test.js** | **36 (GP-2 신규)** |
| 26 | **TutorialScene.test.js** | **30 (TASK-C 신규)** |
| 27 | **HeroListPopup.test.js** | **34 (TASK-D 신규)** |
| 28 | **StageSystem.test.js** | **31 (TASK-E 신규)** |
| 29 | **AwakeningSystem.test.js** | **39 (AWAKE-1 신규)** |
| 30 | **cult-materials.test.js** | **25 (AWAKE-2 신규)** |
| 31 | **AwakeningPopup.test.js** | **36 (AWAKE-3 신규)** |
| 32 | **AwakeningCutscene.test.js** | **21 (AWAKE-4 신규)** |
| 33 | **ProceduralAssets.test.js** | **11 (SWARM-3 신규)** |
| 34 | **AudioGenerator.test.js** | **15 (SWARM-3 신규)** |
| 35 | **HeroAssetLoader.test.js** | **48 (PORTRAIT 신규)** |

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
├── CULT_REDESIGN_V2.md                 ← ★ 허구 서브컬쳐 10개 교단 전체 설계 (v3.0 신규)
├── AWAKENING_SYSTEM_GDD.md            ← ★ 교단 각성 시스템 v1.0 기획서 (방랑자→각성, 5단계)
├── SPRINT6_GAMEDESIGN_PLAN.md         ← Sprint 6 게임디자인 우선순위 분석
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
| 유닛 테스트 | Vitest (1001개, 35파일) |
| E2E 테스트 | Playwright (34개, 5카테고리) |
| 타입체크 | TypeScript (tsc --noEmit) |
| 백엔드 | Supabase (하이브리드 저장) |
| CI/CD | GitHub Actions (ci + deploy + pr-check) |
| 배포 | Vercel (https://arcane-collectors.vercel.app) |
| 빌드 크기 | 568KB gzip (73% 압축) |
