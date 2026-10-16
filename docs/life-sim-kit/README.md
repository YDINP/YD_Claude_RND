# Life-Sim Kit — 인생 시뮬 공용 키트

«80억 분의 1»(1in8b.life) 리서치와 「무명전」(판타지판, `fantasy-life-sim/`) 설계에서 **컨셉과 무관하게 다시 쓸 수 있는 것**만 뽑아 둔 곳이다. 다음 컨셉의 인생 시뮬을 시작할 때 여기서 출발한다.

- 작성: 2026-10-16. 원작 분석 기준 버전 v0.7.44 베타.
- 원본(상세판): `fantasy-life-sim/docs/analysis/00~05`, `fantasy-life-sim/docs/design/00~05`. 숫자나 공식이 의심스러우면 원본 절을 확인할 것.

## 새 컨셉을 시작하는 순서

1. `research/04-market-and-lessons.md` — 왜 먹혔는지, 무엇을 가져가고 바꿀지
2. `design/01-concept-adaptation-guide.md` — 매핑표·컨셉 슬롯 채우기, 3안 심사 루브릭, 열린 질문 체크리스트, 분량 산정
3. `engine/02-world-almanac-pattern.md` — 세계 «가상 통계 연감»과 사망 모델 설계
4. `engine/01-architecture-blueprint.md` — 스택·모듈 경계·결정론·테스트·객체지향 패턴 매핑
5. `design/02-roadmap-template.md` — Phase 0~10과 병렬 트랙
6. `process/01-orchestration-playbook.md` + `process/phase-runner.js` — 분석·기획 워크플로와 Phase 러너 실행법

## 목차

| 폴더 | 파일 | 내용 |
|---|---|---|
| research | `01-reference-service-1in8b.md` | 원작 해부: 루프·화면 흐름·핵심 수치·기술·서버·수익 |
| research | `02-mechanics-reference.md` | 재구현용 공식: 출생 추첨, 생명표(곰페르츠–메이컴), 사인표, 스탯, 소득, 결정 카드 엔진, 자동 결정, 동반자, 가족 |
| research | `03-ux-emotion-safety.md` | 감정 설계, 죽음 의식, 비교의 거울, 공유 카드·바이럴 루프, 안전장치, 접근성 |
| research | `04-market-and-lessons.md` | 확산 경로, 반응, 경쟁작, 약점과 기회, 컨셉 선정 기준 |
| engine | `01-architecture-blueprint.md` | Vite+TS+Preact, 순수 엔진·상태 머신·시드 RNG·YAML DSL·저장 마이그레이션·메모리·번들 예산·테스트, 모듈별 클래스/패턴 표 |
| engine | `02-world-almanac-pattern.md` | 원인 변수→파생 지표 생성 모델, 이중 시간축 해저드 일반형, 신뢰구간, 자기 일관성 CI, 차별 독해 방지, 확률 피치 정합 |
| design | `01-concept-adaptation-guide.md` | 원작 매핑표 템플릿, 컨셉 슬롯, 심사 루브릭, 열린 질문 유형, 분량 산정식 |
| design | `02-roadmap-template.md` | Phase 템플릿(범위·완료 기준·소유권·계약 선행), worktree 트랙, 체크 명령 |
| process | `01-orchestration-playbook.md` | 실제로 쓴 분석·기획 워크플로 구성, Phase 러너 args·단계·실패 대응, worktree 명령 |
| process | `phase-runner.js` | Workflow 도구용 Phase 러너 원본(무명전에서 쓰는 그대로). 새 프로젝트는 `args.root`와 RULES 문구를 바꿔 쓴다 |

## 공통 원칙 (모든 컨셉에 적용)

- 한 번뿐인 삶의 무게: 점수·레벨·업적 팝업 없이, 죽음은 의식으로 치른다.
- 통계적 공정성: 출생은 복권이고, 전생이 다음 생을 유리하게 만들지 않는다. 확률은 숫자로 공개한다.
- 집단 축(국가·종족·계층 등)이 운명처럼 읽히지 않게, 차이를 환경 요인으로 분해해 보여 준다.
- 무거운 주제는 통계 빈도로만, 장면 묘사 없이, 도움 창구와 함께 다룬다.
- 런타임 AI·서버 비용 0에 가깝게: 콘텐츠는 빌드 타임 데이터, MVP는 정적 PWA.
- 코드: 객체지향 + 디자인 패턴 + 자료구조로 우아하게, 엔진은 결정론(같은 시드 = 같은 삶).
