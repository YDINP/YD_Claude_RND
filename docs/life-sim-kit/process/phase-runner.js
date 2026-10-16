export const meta = {
  name: 'mumyeongjeon-phase-runner',
  description: '무명전 Phase 순차 실행: 계약 → 병렬 구현 → 통합 검증 → 이중 리뷰 → 수정 → 커밋/푸시',
  phases: [
    { title: 'Contract', detail: '공유 계약·의존성 고정' },
    { title: 'Build', detail: '디렉터리 소유권별 병렬 구현' },
    { title: 'Integrate', detail: '완료 명령 녹색까지 통합·수정' },
    { title: 'Review', detail: '코드 품질 + 설계 적합성 리뷰' },
    { title: 'Fix', detail: '확인된 지적 수정 + 재검증' },
    { title: 'Commit', detail: 'Phase 커밋 + 푸시' },
  ],
}

const ROOT = args.root || 'D:/park/YD_Claude_RND/fantasy-life-sim'
const PUSH = args.push || 'git push'
const RULES = `프로젝트: 「무명전(無名傳)」 판타지 인생 시뮬 — 작업 디렉터리 ${ROOT} (자체 git 레포, pnpm). 모든 명령·파일 수정은 반드시 이 디렉터리 안에서만 하라(다른 worktree 경로 건드리지 말 것).${args.trackNote ? '\n' + args.trackNote : ''} 1in8b.life 분석(docs/analysis)과 설계(docs/design 00~05)가 기준이다. 설계 우선순위: 수치·식은 design 01(연감)·02(시스템) > 04(아키텍처). 05-open-questions.md 끝 «결정 기록»의 확정안(Q1 B, Q2 이월, Q3 B, Q4 A, Q5 A)을 따른다. 필요한 설계 절만 Grep으로 찾아 읽어라(전체 통독 금지).
코딩 규칙(사용자 최우선 지시):
- 책임으로 파일을 나눈다: 순수 계산 / 상태 보관 / 입출력 / 조립을 다른 파일로. 모듈 500줄 안팎 상한. 진입 모듈(index.ts)에서 재수출.
- 단계가 정해진 흐름은 boolean 플래그 조합이 아니라 명시적 상태 머신(판별 유니온 + 전이 함수). 순수 함수로 계획을 만들고 부작용은 가장자리에서.
- 자료구조로 메모리 관리: 링버퍼(최근 N개), 객체 재사용/풀, 타입 배열 델타, 캐시는 상한+LRU. 매 틱 불필요한 할당 금지.
- 과설계 금지: 한 번만 쓰는 추상화·의미 없는 인터페이스 금지.
- 엔진(src/engine)은 DOM·Date·Math.random·performance 금지, 결정론(같은 시드+입력 = 같은 결과).
- TypeScript strict. any 남용 금지. 테스트는 Vitest로 같이 쓴다.
- 기존 코드 스타일·네이밍을 따르고, 남이 소유한 디렉터리는 수정하지 말 것(필요하면 보고서에 요청으로 남겨라).
- 데스크톱 자동조작 금지(브라우저 창 띄우지 말 것, Playwright는 headless만).`

const OOP = `객체지향 설계 규칙(사용자 추가 지시, 최우선): "코딩은 객체지향적으로 디자인패턴을 사용하여 자료구조를 활용한 우아한 프로그래밍을 할 것."
- 상태를 가진 것은 클래스로 캡슐화한다(private 필드 + 의도가 드러나는 메서드, 생성자 주입). 하위 시스템·저장소·렌더러·큐·스케줄러는 인터페이스를 구현하는 클래스로.
- 순수성과 결정론은 유지한다: 계산·확률·계획은 부작용 없는 메서드(또는 정적 순수 함수)로 두고, RNG는 주입한다. 클래스 인스턴스도 같은 시드 = 같은 결과.
- 적극 적용할 패턴(맞는 곳에만): State(생애 단계별 상태 클래스 — 판별 유니온 대신 또는 함께), Strategy(자동 결정·배속·초점·사인 선택), Command(입력 커맨드 객체 + 실행 로그로 리플레이), Observer(타입 안전 이벤트 버스), Factory + Registry(하위 시스템·카드·사건 등록), Template Method(Subsystem 추상 기본 클래스의 resolve 골격), Builder(문구·공유 카드 조립), Adapter/Repository(저장소), Null Object(폴백), Object Pool.
- 자료구조를 의도적으로 고른다: Ring Buffer(최근 N), 우선순위 큐/이진 힙(예약 큐), 가중 선택은 누적합 + 이진 탐색 또는 Alias 테이블, LRU(Map 기반 상한 캐시), 타입 배열(연 기록), 비트셋(플래그).
- 과설계는 금지: 한 번만 쓰는 추상 클래스·의미 없는 인터페이스·깊은 상속 금지(상속은 1단계, 그 이상은 합성).`
const RULES_FOR = (i) => i >= (args.oopBuildFrom ?? 0) ? `${RULES}\n${OOP}` : RULES
const OOP_REVIEW = (i) => i >= (args.oopReviewFrom ?? 0)
  ? `\n\n${OOP}\n이 Phase 코드가 위 객체지향 규칙 이전에 작성되었을 수 있다. 상태를 가진 모듈이 클로저·자유 함수 묶음·플래그로 흩어져 있으면 «major»로 지적하고, 어떤 클래스/패턴/자료구조로 바꿀지 fix에 구체적으로 적어라(공개 API는 진입 모듈에서 유지).`
  : ''

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    green: { type: 'boolean', description: '완료 명령과 완료 기준이 모두 통과했는가' },
    testCount: { type: 'number' },
    output: { type: 'string', description: '마지막 실행 결과 핵심 줄(실패 시 실패 내용)' },
    notes: { type: 'string' },
  },
  required: ['green', 'testCount', 'output'],
}
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          file: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const results = []
for (const [PI, P] of args.phases.entries()) {
  const tag = `P${P.n}`
  log(`=== Phase ${P.n}: ${P.title} 시작 ===`)
  const PHASE_CTX = `${RULES_FOR(PI)}\n\n현재 Phase ${P.n}: ${P.title}\n범위: ${P.scope}\n완료 기준: ${P.criteria}\n완료 명령: ${P.verify}\n(설계 근거: docs/design/04-tech-architecture.md §13.1 Phase ${P.n} 행 및 거기서 참조하는 절)`

  // 1) 계약 / 골격
  const contract = await agent(`${PHASE_CTX}\n\n당신은 이 Phase의 «계약 담당»이다. 병렬 작업자들이 충돌 없이 일하도록 먼저 고정하라:\n${P.contract}\n- 이 Phase에 필요한 npm 의존성은 지금 모두 설치하라(병렬 작업자는 설치 금지).\n- 타입·인터페이스·빈 진입점·스텁만 만들고, 각 작업 단위의 내부 구현은 남겨 둬라. 단 typecheck는 통과해야 한다.\n반환: 고정한 계약 파일 목록과 각 작업자가 알아야 할 핵심 시그니처 요약(작업자 프롬프트에 그대로 들어간다, 60줄 이내).`, { label: `${tag}:contract`, phase: 'Contract' })

  // 2) 병렬 구현
  const built = await parallel(P.units.map(u => () =>
    agent(`${PHASE_CTX}\n\n계약 담당이 고정한 계약:\n${contract}\n\n당신의 작업 단위: [${u.key}] 소유 경로: ${u.owns}\n과제: ${u.task}\n- 소유 경로 밖 파일 수정 금지(테스트 파일은 tests/ 아래 자기 단위 이름 하위 폴더 또는 소유 경로 옆 *.test.ts).\n- 의존성 설치 금지. 계약 변경이 필요하면 최소한으로 하고 보고하라.\n- 자기 단위 테스트를 써서 'pnpm vitest run <자기 경로>'로 녹색을 확인하라. 전체 typecheck에서 자기 파일 오류 0.\n반환: 만든 파일, 테스트 수, 남은 문제, 다른 단위에 대한 요청(10줄 이내).`, { label: `${tag}:${u.key}`, phase: 'Build' })))

  // 3) 통합 검증 루프
  let verify = null
  for (let i = 0; i < 3; i++) {
    verify = await agent(`${PHASE_CTX}\n\n병렬 작업 보고:\n${built.map((b, j) => `[${P.units[j].key}] ${b ?? '(실패/누락)'}`).join('\n')}\n\n${i === 0 ? '' : `이전 통합 시도 결과(아직 실패):\n${verify?.output}\n`}당신은 통합 담당이다. 완료 명령을 실제로 실행하고, 실패하면 원인을 고쳐라(작업 단위 간 이음새, 누락 구현, 타입 오류, 테스트 실패). 누락된 단위 구현이 있으면 직접 채워라. 완료 기준의 수치(테스트 수 등)를 확인하라. 테스트를 지우거나 skip해서 통과시키는 것은 금지. 최종 실행 결과로 green 여부를 정직하게 보고하라.`, { label: `${tag}:integrate#${i + 1}`, phase: 'Integrate', schema: VERIFY_SCHEMA })
    if (verify?.green) break
  }
  if (!verify?.green) {
    log(`Phase ${P.n} 통합 실패 — 중단`)
    results.push({ phase: P.n, status: 'integration-failed', verify })
    return { results }
  }

  // 4) 이중 리뷰
  const reviews = await parallel([
    () => agent(`${PHASE_CTX}\n\n코드 리뷰: 이번 Phase에서 새로 생긴/바뀐 코드(git status·git diff로 확인)를 리뷰하라. 관점: 정확성 버그, 결정론 위반, 경계 위반(엔진→DOM 등), 메모리(불필요 할당·무제한 배열·캐시 상한), 코딩 규칙(책임 분리·500줄·상태 머신·과설계). 실제로 문제인 것만, 근거(file:line)와 함께. 사소한 취향은 제외.${OOP_REVIEW(PI)}`, { label: `${tag}:review-code`, phase: 'Review', schema: FINDINGS_SCHEMA }),
    () => agent(`${PHASE_CTX}\n\n설계 적합성 리뷰: 이번 Phase 구현이 설계 문서(design 01/02/04의 해당 절, 확정 결정 Q1~Q5)와 맞는지 확인하라. 공식·상수·상태 전이·스트림 키·스키마가 문서와 다른 곳, 완료 기준 중 실제로 검증되지 않은 항목(테스트가 형식적인 경우 포함)을 찾아라. 근거(문서 절 + file:line)를 달아라.`, { label: `${tag}:review-design`, phase: 'Review', schema: FINDINGS_SCHEMA }),
  ])
  const findings = reviews.filter(Boolean).flatMap(r => r.findings).filter(f => f.severity !== 'minor' || P.fixMinor)
  log(`Phase ${P.n} 리뷰 지적 ${findings.length}건 (minor 제외 여부: ${!P.fixMinor})`)

  // 5) 수정 + 재검증
  let finalVerify = verify
  if (findings.length) {
    finalVerify = await agent(`${PHASE_CTX}\n\n리뷰 지적 목록:\n${JSON.stringify(findings, null, 1)}\n\n각 지적을 먼저 코드에서 확인하고(오탐이면 이유를 적고 건너뜀), 실제 문제는 고쳐라. 그 뒤 완료 명령을 다시 실행해 green을 확인하라. notes에 지적별 처리 결과(수정/오탐)를 한 줄씩.${OOP_REVIEW(PI) ? '\n객체지향 리팩터링 지적은 공개 API·테스트 의도를 유지한 채 수행하고, 기존 테스트가 계속 통과해야 한다.' + OOP_REVIEW(PI) : ''}`, { label: `${tag}:fix`, phase: 'Fix', schema: VERIFY_SCHEMA })
    if (!finalVerify?.green) {
      finalVerify = await agent(`${PHASE_CTX}\n\n리뷰 수정 후 검증이 실패했다:\n${finalVerify?.output}\n원인을 고치고 완료 명령을 green으로 만들어라(테스트 삭제·skip 금지).`, { label: `${tag}:fix-retry`, phase: 'Fix', schema: VERIFY_SCHEMA })
    }
    if (!finalVerify?.green) {
      results.push({ phase: P.n, status: 'fix-failed', findings, verify: finalVerify })
      return { results }
    }
  }

  // 6) 커밋 + 푸시
  const commit = await agent(`${ROOT} 에서 Phase ${P.n} 작업을 커밋하고 푸시하라. 'git status'로 생성물(generated/, dist/, node_modules/, 테스트 산출물)이 섞이지 않았는지 확인하고 필요하면 .gitignore 보강. 커밋 메시지(한국어, HEREDOC):\n제목: feat: [${P.label || 'Phase ' + P.n}] ${P.title}\n본문: 주요 변경 3~6줄, 테스트 수 ${finalVerify.testCount}, 리뷰 지적 ${findings.length}건 처리\n마지막 줄: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n그 뒤 '${PUSH}'. 훅 우회 금지. 반환: 커밋 해시 한 줄.`, { label: `${tag}:commit`, phase: 'Commit', effort: 'low' })

  results.push({ phase: P.n, status: 'done', tests: finalVerify.testCount, findings: findings.length, fixNotes: finalVerify.notes, commit })
}
return { results }
