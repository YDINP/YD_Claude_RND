# 오케스트레이션 플레이북 — 분석·기획 워크플로 + Phase 러너

> 출처: 무명전(fantasy-life-sim) 실제 실행 기록(2026-10-16). 러너 원본은 같은 폴더 `phase-runner.js`.
> 실행 수단: Claude Code **Workflow 도구**(스크립트 안에서 `agent()` / `parallel()` / `pipeline()` / `phase()` / `log()`).

---

## 0. 오케스트레이션 개요

1. **분석·기획 워크플로 1회**(약 54분, 에이전트 16개) → `docs/analysis`, `docs/design`
2. 사람(사용자)이 열린 질문 확정 → 기획 커밋
3. **Phase 러너**를 Phase 묶음 단위로 반복 실행(Phase마다 계약 → 병렬 구현 → 통합 → 이중 리뷰 → 수정 → 커밋/푸시)
4. 엔진에 의존하지 않는 일은 Phase 0 커밋에서 **git worktree 트랙**으로 떼어 동시에 러너를 돌린다

```
main(엔진)      P0 ─► P1 ─► P2 ─► P3 ─┬─► 병합 ─► P4(UI 연결) ─► P5(콘텐츠 정규화) ─► …
track/ui         └─► U1(테마·컴포넌트·i18n·저장·공유·안전, 목 데이터) ─┘
track/content    └─► C1(콘텐츠 초안 + drafts-lint) ──────────────────┘
```

---

## 1. 분석·기획 워크플로 (실제 구성)

| 단계 | 에이전트 | 하는 일 | 산출 |
|---|---|---|---|
| Fetch | 1 (effort low) | 대상 사이트 HTML·JS·CSS·manifest·하위 페이지를 scratchpad에 미러링, 압축 JS는 포맷 사본. **실행 금지, 텍스트로만** | 파일 목록 |
| Analyze | 5 병렬 | ① 기술 구조 ② 게임 메카닉(공식·테이블) ③ UX·콘텐츠·감정 설계 ④ 서버·소셜·결제·개인정보 ⑤ 시장·반응(웹 검색) | `analysis/01~05` |
| Summary | 1 | 5편 종합: 한 장 요약, 루프 다이어그램, 재구현 시스템 목록·난이도·MVP 여부, 먹히는 이유, 가져갈/바꿀/버릴 것, 문서 간 모순 | `analysis/00-summary.md` |
| Concept | 3 병렬 | 서로 다른 관점 3개로 컨셉안 작성(무명전: 통계 리얼리즘 / 신화·연대기 / 평범한 판타지인) | `design/concepts/*` |
| Judge | 1 | 5기준 점수(무게·새로움·구현 용이성·재플레이성·바이럴) → 우승안 + 준우승안 접목 → 통합 컨셉 | `design/00-final-concept.md` |
| Design | 4 병렬 | 세계·연감 데이터 / 시스템 / UX 화면 / 기술 아키텍처 + Phase 로드맵 | `design/01~04` |
| Critique | 1 | 적대적 비평: 문서 간 불일치를 직접 고치고, 사람만 정할 수 있는 것은 «열린 질문(추천안 포함)» 최대 5개로 | `design/05-open-questions.md`, `README.md` |

요령:
- 분석 프롬프트에 «재구현 가능한 수준으로 공식·확률·테이블·타이밍 숫자를, 코드 복사 없이 원리로»를 명시한다.
- 컨셉 단계 이후 모든 프롬프트에 «확정 컨셉의 이름(집단·지역·스탯)을 그대로 쓸 것»을 넣어 용어 드리프트를 막는다.
- 비평 단계가 문서를 **직접 고치게** 해야 사람이 볼 질문이 5개 안으로 줄어든다.

## 2. Phase 러너 (병렬 단위 자동 실행)

### 2.1 개요

**Phase 러너**는 다음을 **자동으로** 수행:

```
1️⃣ 계약 (타입·인터페이스·스텁)
   └─ npm 의존성 설치, typecheck 통과
   
2️⃣ 병렬 구현 (Phase의 units 수만큼, 디렉터리 소유권으로 분리)
   ├─ 예) P1: rng-math / machine-schedule / record-stats-time
   └─ 예) P3: birth-omen / career-econ-edu / family / mana-war-legend / decisions-companions

3️⃣ 통합 검증 루프 (최대 3회)
   ├─ `pnpm build` 성공?
   ├─ `pnpm test` 통과?
   ├─ 완료 기준 수치 확인?
   └─ 실패 시 원인 파악 & 수정

4️⃣ 이중 리뷰 (병렬)
   ├─ 코드 리뷰: 정확성·메모리·규칙 위반
   └─ 설계 리뷰: 문서와 일치? 완료 기준 검증됨?

5️⃣ 지적 사항 수정 + 재검증

6️⃣ 커밋 + 푸시
```

### 2.2 실행 방법

`phase-runner.js`는 node로 직접 돌리는 CLI가 아니다. **Claude Code의 Workflow 도구**에 넘기는 스크립트다(`agent()`/`parallel()`/`phase()` 훅은 Workflow 런타임이 제공한다). 대화에서 «이 러너로 Phase N 돌려»라고 하면 Claude가 아래처럼 호출한다.

```text
Workflow({
  scriptPath: "D:/park/YD_Claude_RND/docs/life-sim-kit/process/phase-runner.js",
  args: { ...아래 args 형식... }
})
```

- 실행 중 끊겼으면 `resumeFromRunId`로 이어 간다. 프롬프트가 바뀌지 않은 agent 호출은 캐시로 즉시 반환된다.
- 끊고 규칙을 바꿔 다시 돌릴 때는 `oopBuildFrom`/`oopReviewFrom`처럼 «몇 번째 Phase부터 적용»하는 인덱스로 바꾸면, 이미 끝난 Phase의 캐시를 살릴 수 있다.
- 주의: 러너 상단의 `ROOT` 기본값과 `RULES` 문구는 무명전 기준이다. 새 프로젝트에서는 `args.root`를 꼭 넘기고, RULES의 프로젝트명·설계 문서 경로를 새 프로젝트에 맞게 고쳐 쓴다.

#### args 형식

| 키 | 타입 | 뜻 |
|---|---|---|
| `root` | string | 작업 디렉터리(그 프로젝트의 git 루트 또는 worktree) |
| `push` | string | 커밋 뒤 실행할 푸시 명령. 기본 `git push`. worktree 트랙은 `git push -u origin track/ui` 처럼 |
| `trackNote` | string? | 병렬 트랙일 때 «건드리면 안 되는 경로·목 데이터 사용» 같은 트랙 규칙 |
| `oopBuildFrom` | number? | 이 인덱스 이상 Phase는 계약·구현 단계부터 객체지향 규칙 적용(기본 0) |
| `oopReviewFrom` | number? | 이 인덱스 이상 Phase는 리뷰·수정 단계에서 객체지향 리팩터링 지적(기본 0) |
| `phases` | array | 순서대로 실행할 Phase 목록. 하나가 실패하면 거기서 멈추고 결과를 반환 |

Phase 항목:

| 키 | 타입 | 뜻 |
|---|---|---|
| `n` | number \| string | Phase 번호(`2`, `"U1"` 등) |
| `label` | string? | 커밋 제목 접두어(기본 `Phase n`) |
| `title` / `scope` | string | 제목과 범위 서술 |
| `contract` | string | 계약 담당이 먼저 고정할 공유 파일·타입·의존성 |
| `units` | `{key, owns, task}[]` | 디렉터리 소유권별 병렬 작업 단위(`owns`가 겹치면 안 된다) |
| `criteria` | string | 완료 기준(수치 포함, 한 문자열) |
| `verify` | string | 완료 명령. 통합 담당이 실제로 돌려 green을 확인한다 |
| `fixMinor` | boolean? | true면 minor 지적도 수정 |

#### 예시 (무명전 Phase 1에서 실제로 쓴 형태를 줄인 것)

```json
{
  "root": "D:/park/YD_Claude_RND/fantasy-life-sim",
  "oopBuildFrom": 0,
  "phases": [{
    "n": 1,
    "title": "엔진 코어",
    "scope": "src/engine의 rng/ math/ time/ machine/ schedule/ record/ stats/, 헤드리스 실행기, pnpm sim CLI",
    "contract": "src/engine/machine/types.ts, src/engine/index.ts 공개 API, 하위 폴더 index.ts 스텁",
    "units": [
      {"key": "rng-math", "owns": "src/engine/rng/, src/engine/math/", "task": "xoshiro128** + 키 스트림, 수학 유틸, 속성 테스트"},
      {"key": "machine-schedule", "owns": "src/engine/machine/, src/engine/schedule/", "task": "생애 상태 머신, planYear, 예약 큐, sim CLI"},
      {"key": "record-stats-time", "owns": "src/engine/record/, src/engine/stats/, src/engine/time/", "task": "링버퍼, 연 기록, 4스탯, 틱 시계"}
    ],
    "criteria": "결정론 테스트 통과, 상태 머신 전 조합 표 테스트, 단위 테스트 ≥ 90, 스텁으로 1생 완주",
    "verify": "pnpm ci:all && pnpm sim --seed 7k3m9q2x4p8rt"
  }]
}
```

### 2.3 Phase 러너의 6단계 상세

#### 1️⃣ 계약 단계 (Contract)

**입력**: Phase 정의 + contract 필드  
**역할**: 계약 담당자(architect)

```
1. 공유 npm 의존성 모두 설치
2. 타입·인터페이스만 정의, 구현은 스텁
3. 각 작업자가 알아야 할 공개 API 정리
4. typecheck 통과 확인
```

**출력**: 60줄 이내 핵심 시그니처 요약

```typescript
// 예시 출력
interface RNG {
  (seed: Uint8Array, key: string): number
}

class Life {
  dispatch(cmd: Command): Result
  drain(n: number): Event[]
  snapshot(): LifeSnapshot
}
```

#### 2️⃣ 병렬 구현 (Build)

**입력**: 계약 + 작업 단위(unit) 목록  
**역할**: 작업 단위별 에이전트(units 항목 하나 = 에이전트 하나)

```
1. 소유 경로 안에서만 작업
2. 의존성 설치 금지 (계약 단계에서 완료)
3. 각자 테스트 쓰고 `pnpm vitest run {path}` 녹색 확인
4. 다른 경로 수정 필요 시 보고만 (수정하지 말 것)
```

**보고 형식**:
```
[rng] 
- 생성 파일: src/engine/rng/index.ts, *.test.ts
- 테스트: 10개 통과
- 다른 단위에 요청: mortality가 생명표 캐시 크기 결정하면 미리 알려주길
```

#### 3️⃣ 통합 검증 루프 (Integrate)

**입력**: 모든 작업자 보고  
**역할**: 통합 담당자(architect)

```
최대 3회 반복:
  1. 완료 명령 실행: pnpm build + pnpm test
  2. 실패하면:
     - 원인 파악 (git diff, 콘솔 출력)
     - 누락된 구현 찾기
     - 직접 채우거나, 해당 작업자에게 지시
  3. 테스트 수 · 번들 크기 · 기준 수치 확인
  4. 완료 기준 모두 통과하면 green 보고
```

**실패 시 중단 + 보고**:
```json
{
  "phase": 2,
  "status": "integration-failed",
  "verify": {
    "green": false,
    "output": "src/engine/machine.ts:150 - Property 'tick' missing in type 'Life'",
    "notes": "RNG 작업자가 인덱싱 함수를 export 안 함"
  }
}
```

#### 4️⃣ 이중 리뷰 (Review, 병렬)

**역할**: 코드 리뷰 에이전트 + 설계 적합성 리뷰 에이전트(병렬). `oopReviewFrom` 이상 Phase는 객체지향 규칙 위반도 major로 지적

**코드 리뷰**:
```
관점:
  - 정확성 버그 (null check, 범위 초과)
  - 결정론 위반 (Date, Math.random, 전역상태)
  - 경계 위반 (engine이 DOM 접근?)
  - 메모리 (불필요 할당, 무제한 배열, 캐시 상한)
  - 코딩 규칙 (책임분리, 500줄, 상태머신, 과설계)
  
출력 형식:
{
  "severity": "major",
  "file": "src/engine/rng/index.ts:47",
  "issue": "Math.random() 사용 — 결정론 위반",
  "fix": "splitmix32로 대체"
}
```

**설계 리뷰**:
```
확인사항:
  - 식·상수·상태 전이가 design 문서와 일치?
  - 완료 기준이 실제로 검증되었나?
  - 테스트가 형식적이지 않은가? (값 검사 vs 존재 확인)

출력:
{
  "severity": "minor",
  "file": "tests/engine/rng.test.ts",
  "issue": "rng() 호출 순서가 문서와 다름 — keyStream[t] vs keyStream[t++]",
  "fix": "문서 §5와 맞추기"
}
```

#### 5️⃣ 수정 + 재검증 (Fix)

**입력**: 리뷰 지적 목록  
**역할**: 해당 작업자 또는 통합 담당자

```
1. git diff로 문제 확인 (오탐이면 사유 기록)
2. 지적 수정
3. 완료 명령 다시 실행
4. green 확인 또는 추가 수정
```

#### 6️⃣ 커밋 + 푸시 (Commit)

**역할**: 통합 담당자

```
메시지(한국어, HEREDOC):
feat: [Phase N] {제목}

{주요 변경 3~6줄}

테스트: {숫자}개
리뷰 지적: {숫자}건 처리
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

명령:
git commit -am "feat: ..."
git push origin main  (또는 --push 옵션값)
```

---

## 3. Worktree 병렬 트랙 (실제 사용한 명령)

```bash
cd fantasy-life-sim                         # main, Phase 0 커밋 33ee06b 이후
git worktree add -b track/ui      ../fantasy-life-sim-ui      33ee06b
git worktree add -b track/content ../fantasy-life-sim-content 33ee06b
(cd ../fantasy-life-sim-ui && pnpm install --prefer-offline)
(cd ../fantasy-life-sim-content && pnpm install --prefer-offline)
```

- 각 트랙은 러너 args에 `root`(worktree 경로), `push: "git push -u origin track/xxx"`, `trackNote`(건드리면 안 되는 경로, 엔진 데이터는 목/뷰모델로 대체)를 준다.
- 트랙 경계는 디렉터리로 나눈다. UI 트랙은 `src/app`, `src/i18n`, `src/persist`, `src/share`만, 콘텐츠 트랙은 `content/drafts`, `tools/drafts-lint.ts`만 쓴다. 엔진·스키마는 main만 쓴다.
- 병합은 엔진이 공개 API·스키마를 확정한 뒤(무명전은 Phase 3 후) main에서 `git merge --no-ff track/ui`, `track/content` 순서로 한다. 그다음 Phase에서 UI는 bridge로 엔진에 연결하고, 콘텐츠 초안은 확정 스키마로 정규화한다.
- 정리: `git worktree remove ../fantasy-life-sim-ui`

---

## 4. 체크 명령 (무명전 로드맵 기준)

| Phase | 완료 명령 |
|---|---|
| 0 골격 | `pnpm ci:all` (typecheck·lint·depcruise·test·build·bundle-budget) |
| 1 엔진 코어 | `pnpm ci:all && pnpm sim --seed <seed>` |
| 2 데이터·사망 모델 | `pnpm ci:all && pnpm build:content && pnpm test --project stats` |
| 3 출생·하위 시스템 | `pnpm ci:all && pnpm build:content && pnpm test && pnpm golden:check && pnpm smoke:memory --headless` |
| 4~6 UI·콘텐츠·공유 | `pnpm test && pnpm e2e --project chromium` |
| 7 출시 | `pnpm ci:all && pnpm e2e && pnpm smoke:memory && pnpm lighthouse` |
| 트랙 U1 | `pnpm ci:all && pnpm exec playwright test --project chromium --grep gallery` |
| 트랙 C1 | `pnpm drafts:lint && pnpm ci:all` |

---

## 5. 설정 파일

별도 설정 파일은 없다. 위 2.2의 `args` JSON이 곧 설정이다. 긴 Phase 목록은 프로젝트 `docs/`에 JSON으로 남겨 두고 Workflow 호출 때 붙여 넣으면 재현이 쉽다.

---

## 6. 실패 대응 (러너 동작)

| 상황 | 러너 동작 | 사람이 할 일 |
|---|---|---|
| 작업 단위 에이전트 실패/누락 | 결과가 null로 들어가고 통합 담당이 누락분을 직접 채운다 | 없음 |
| 통합 3회 실패 | `status: integration-failed`로 그 Phase에서 멈추고 반환 | 실패 출력을 보고 범위를 줄이거나 계약을 고쳐 `resumeFromRunId`로 재개 |
| 리뷰 수정 후 검증 실패 | 1회 재시도, 그래도 실패면 `fix-failed`로 멈춤 | 위와 같음 |
| 실행 중 규칙 변경(예: 객체지향 지시 추가) | — | 워크플로를 멈추고 `oopBuildFrom`/`oopReviewFrom` 인덱스로 «이후 Phase부터» 적용해 재개(이전 Phase 캐시 유지) |
| 트랙이 막 시작했을 때 규칙 변경 | — | worktree를 `git checkout -- . && git clean -fd`로 되돌리고 새로 실행 |

---

## 7. 체크리스트: 첫 Phase 시작 전

```
[ ] 프로젝트 git init + GitHub 비공개 레포 생성(커밋-퍼-페이즈)
[ ] 기획 문서(design 00~05) 확정, 열린 질문 결정 기록
[ ] 러너 RULES의 프로젝트명·설계 문서 경로 수정, args.root 지정
[ ] Phase 0(골격)은 단일 작업으로 먼저 끝낸다 — 이후 모든 Phase의 토대
[ ] 엔진 독립 트랙(UI·플랫폼, 콘텐츠 초안)은 Phase 0 커밋에서 worktree로 분기
[ ] 각 트랙 trackNote에 «건드리지 말 경로» 명시
```
