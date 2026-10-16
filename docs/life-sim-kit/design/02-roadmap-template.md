# Phase 로드맵 템플릿 (Phase 0~10)

> 출처: [design 04 §13~14] 로드맵, [05-open-questions.md] 확정 결정 Q1~Q2
> 용도: 새 컨셉 프로젝트의 개발 일정 수립

---

## 0. 로드맵 개요

```
Phase 0-1: 기획 & 계약 (1주)
     ↓
Phase 2-4: MVP 핵심 (4주)
     ↓
Phase 5-7: 완성 & 배포 (3주)
     ↓
Phase 8: 2차 기능 (병렬 또는 이월)
     ↓
Phase 9-10: 플랫폼 확장 (3차)
```

**총 일정**: 8~10주 (1인 + AI, 일일 6시간)  
**병렬 트랙**: 엔진 / 콘텐츠 / UI

---

## 1. Phase 0-1: 기획 & 계약

### Phase 0: 컨셉 확정

**범위**:
- 컨셉 3안 심사 (심사 루브릭 [design/01 §2] 사용)
- 세계관 문서 1장
- 원인 변수 6개 + 지역 6곳 기초 정의
- Q1~Q5 답변 수집 (오케스트레이션)

**완료 기준**:
- [ ] 컨셉 최종 확정 (조직 내 합의)
- [ ] 원인 변수 정의서 (각 1페이지)
- [ ] 종족·신분·직업 기초 표 (엑셀)
- [ ] 열린 질문 5개 답변 확정

**소요**: 3~5일

**디렉터리 소유권**:
- `docs/design/00-final-concept.md` — 기획자
- `content/almanac/regions/*.yaml` — 기획자 초안

---

### Phase 1: 엔진 & 데이터 계약

**범위**:
- 생성 모델 조정 (tools/almanac)
- 지역·종족·신분 스키마 확정
- 자기일관성 CI 첫 통과
- 엔진 타입 정의 (engine/index.ts)
- DSL 조건식 예시 5개

**완료 기준**:
- [ ] `generated/almanac.json` 생성 성공
- [ ] 자기일관성 CI 5개 항목 모두 PASS
- [ ] engine TypeScript strict 타입 체크 통과
- [ ] 데이터 로더 (data/index.ts) 구현

**소요**: 5~7일

**디렉터리 소유권**:
- `tools/almanac/` — 아키텍트(AI)
- `src/engine/` — 아키텍트(AI)
- `content/` — 기획자 + 집필자

---

## 2. Phase 2-4: MVP 핵심 (병렬 3트랙)

### Phase 2: 엔진 구현

**범위**:
- RNG 시스템 (engine/rng)
- 해저드 모델 (engine/mortality)
- 생애 상태 머신 (engine/machine)
- 기본 시뮬 루프 (planTick / endTick)
- 단위 테스트 20개

**완료 기준**:
- [ ] `createLife(seed).dispatch(cmd)` 동작
- [ ] 같은 시드 = 같은 결과 (golden test 20개)
- [ ] 번들 engine ≤ 45KB
- [ ] Vitest unit 20/20 통과

**소요**: 7~10일 (병렬)

**디렉터리 소유권**: `src/engine/`

---

### Phase 3: 콘텐츠 저작 (병렬)

**범위**:
- 결정 카드 60장 (지역별 변주)
- 사건 140종 (각 3~5 변종)
- DSL 조건식 + 효과
- i18n 구조 (L`…` 태그)
- content 스키마 검증

**완료 기준**:
- [ ] 60 + 140 파일 모두 zod 검증 통과
- [ ] 1회/생 ≤ 2회 CI 통과
- [ ] 번들 content.ko ≤ 160KB
- [ ] i18n 사전 1,000+ 항목

**소요**: 10~14일 (병렬, AI 보조 저작)

**디렉터리 소유권**:
- `content/cards/` — 집필자 + AI
- `content/events/` — 집필자 + AI
- `src/i18n/` — 로컬라이저

---

### Phase 4: UI & 브릿지

**범위**:
- 화면 5개 (landing / birth / life / death / records)
- 상태 머신 라우팅
- 엔진 ↔ UI 어댑터 (bridge)
- Preact 컴포넌트 (생명력 바, 생애지도, 카드 등)
- e2e 테스트 (Playwright)

**완료 기준**:
- [ ] 전체 UX 흐름 동작
- [ ] 번들 app ≤ 90KB
- [ ] Lighthouse 점수 ≥ 90
- [ ] e2e 테스트 회귀 통과

**소요**: 8~10일 (병렬)

**디렉터리 소유권**:
- `src/app/` — 디자이너(AI) + 엔지니어
- `src/app/bridge/` — 엔지니어

---

## 3. Phase 5-7: 완성 & 배포

### Phase 5: 통합 & 밸런스

**범위**:
- 세 트랙 통합 검증
- 통계 테스트 (N=10,000)
- 실험실 밸런싱 (lab-cli)
- 공유 카드 렌더링
- 저장 / 복구 시스템

**완료 기준**:
- [ ] `pnpm build` 성공 (모든 청크 예산 통과)
- [ ] 통계 테스트 e0 오차 ≤ ±2%
- [ ] 공유 카드 샘플 5개 렌더링 정확
- [ ] 세이브/로드 라운드트립 통과

**소요**: 5~7일

**디렉터리 소유권**:
- `tests/stats/` — 아키텍트(AI)
- `src/share/` — 디자이너(AI)
- `src/persist/` — 엔지니어

---

### Phase 6: 품질 보증 & 보안

**범위**:
- 메모리 검증 (memory-smoke)
- 결정론 검증 (determinism test 20개)
- 민감 콘텐츠 린트 (자해·폭력 등)
- CSP 검증 (inline script 금지)
- 크로스브라우저 테스트

**완료 기준**:
- [ ] 메모리 ≤ 100MB (4명 동시 + 만 생)
- [ ] 결정론 해시 일치 20/20
- [ ] 린트 지적 0개
- [ ] CSP `default-src 'self'` 통과
- [ ] Safari / Chrome / Firefox 테스트 통과

**소요**: 3~5일

**디렉터리 소유권**:
- `tests/` — QA 엔지니어(AI)

---

### Phase 7: 배포 & 런칭

**범위**:
- Cloudflare Pages 배포
- PWA 설정 (manifest.json)
- SEO 최적화 (metatags)
- 오류 모니터링 설정 (Sentry)
- 심사 문서 (프라이버시, 접근성)

**완료 기준**:
- [ ] 라이브 URL 동작
- [ ] Lighthouse 모바일 ≥ 90
- [ ] 오프라인 플레이 검증
- [ ] 프라이버시 정책 게시
- [ ] 접근성 가이드라인 WCAG 2.1 AA

**소요**: 2~3일

**디렉터리 소유권**:
- `vite.config.ts` — DevOps(AI)
- `docs/` — 기획자

---

## 4. Phase 8: 2차 기능 (이월 또는 병렬)

**Q2 결정 기준**: Phase 6 완료 후 우선순위 선택

| 기능 | 범위 | 예상 공수 | 상태 |
|------|------|---------|------|
| **연대기 화면** | 전생 목록을 시간축 위 띠로 | 5~7일 | 이월(Phase 8) |
| **전승 7종** | 설화 × 왜곡 3단계 | 3~5일 | 이월(Phase 8) |
| **절차 생성 음악** | Web Audio 앰비언트 | 2~3일 | 이월(Phase 8) |
| **묘역 기능** | 공유 아카이브 + 서버 | 1주 | Phase 9+ |
| **반엘프 자녀** | 이종족 결혼 + 세대 | 3~5일 | Phase 9+ |
| **일본어판** | i18n + 로컬라이즈 | 1주 | Phase 9+ |

**소요**: 2~3주 (병렬 가능)

---

## 5. Phase 9-10: 플랫폼 확장

### Phase 9: 서버 기능 (Cloudflare Workers + D1)

**범위**:
- 묘역 데이터 저장 (D1)
- 공유 링크 단축 (Workers KV)
- 실시간 현황 API (Durable Objects)
- 기록 옮기기 (export/import)

**소요**: 1~2주

---

### Phase 10: 모바일 + 부가 기능

**범위**:
- iOS/Android 웹앱 설치 가이드
- 다크 모드 확장
- 음성 지원 (TTS)
- 친구 공유 기능

**소요**: 2주+

---

## 6. 병렬 트랙 관리

### 6.1 엔진 독립 병렬 실행

Phase 2, 3, 4는 **완전히 독립적**:

```
엔진(P2)     콘텐츠(P3)    UI(P4)
─────────    ──────────    ──────
rng.ts       cards/*.yaml  screens/
mortality.ts events/*.yaml components/
machine.ts   i18n/         bridge.ts
             (DSL 없음)     (엔진 타입만)
```

**의존성 최소화**:
- engine/index.ts만 export (변경 X)
- 콘텐츠는 런타임 fetch (빌드 타임 검증만)
- UI는 engine 타입 import (구현 아님)

### 6.2 Worktree로 병렬 격리

```bash
# 메인 브랜치에서
git worktree add --orphan ../wt-engine \
  engine-p2 src/engine

git worktree add --orphan ../wt-content \
  content-p3 content/

git worktree add --orphan ../wt-ui \
  ui-p4 src/app/

# 각 worktree에서 독립적 git log, diff
cd ../wt-engine
pnpm run test:engine
git commit -am 'Phase 2: RNG + mortality'
git push origin engine-p2

# 메인으로 merge (p2 완료 후)
cd ../
git merge wt-engine/engine-p2 --no-ff
```

### 6.3 Phase별 체크 명령

**Phase 2 완료 검증**:
```bash
cd src/engine
pnpm test:unit
pnpm test:determinism
pnpm run lint
```

**Phase 3 완료 검증**:
```bash
cd content
pnpm run compile-content
# → generated/content.json ✓
pnpm run check-i18n
```

**Phase 4 완료 검증**:
```bash
pnpm build:app
pnpm test:e2e
pnpm run lighthouse
```

---

## 7. 체크리스트: 각 Phase 시작 전

### 각 Phase 체크인

```
[ ] 전 Phase 모든 완료 기준 통과?
[ ] git status 깨끗함 (커밋 완료)?
[ ] CHANGELOG.md 업데이트?
[ ] 팀 동기화 (변경 사항 공유)?
[ ] 다음 Phase 디렉터리 소유권 명확?
[ ] 병렬 트랙 간 충돌 없음?
```

### Phase 완료 커밋

```
commit message:
feat: [Phase N] {제목}

{주요 변경 3~6줄}

테스트: {number}개
제출자: {이름}
```

---

## 8. 리스크 & 대응

| 리스크 | 신호 | 대응 |
|--------|------|------|
| 자기일관성 CI 반복 실패 | P1 → P2 진입 불가 | 원인변수 재검토, calibration 조정 |
| 콘텐츠 저작 지연 | 카드 <50장 + 사건 <100종 | AI 보조 저작 강화, 지역 수 축소 |
| 번들 예산 초과 | 청크 예산 ±10% | 콘텐츠 지연 로드 조정, 글꼴 서브셋 재추출 |
| 통계 오차 ±5% 이상 | P5 통계 테스트 실패 | 실험실 N=10,000 재실행, calibration 미세 조정 |

---

## 9. 성공 지표

### 최종 검증 (배포 직전)

```
✓ 번들 예산 모두 통과
✓ 통계 테스트 N=10,000 e0 ±2%
✓ 메모리 smoke 테스트 ≤ 100MB
✓ 결정론 검증 해시 20/20
✓ 민감 콘텐츠 린트 0개
✓ Lighthouse 모바일 ≥ 90
✓ 크로스브라우저 ✓ Safari / Chrome / Firefox
✓ 오프라인 플레이 동작
✓ 접근성 가이드라인 WCAG 2.1 AA
```

### 런칭 후 모니터링

```
메트릭:
- 초기 로드 시간 (LCP) ≤ 2초 (4G)
- 세션당 평균 재시도 횟수
- 크래시 회수 (Sentry)
- 사용자 피드백 도움말 창구
```

