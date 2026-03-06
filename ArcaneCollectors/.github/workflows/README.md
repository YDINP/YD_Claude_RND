# GitHub Actions Workflows

ArcaneCollectors 프로젝트의 CI/CD 파이프라인 구성입니다.

## 워크플로우 목록

### 1. CI (`ci.yml`)

PR 및 push 시 자동 실행되는 검증 파이프라인입니다.

**트리거:**
- `push`: `main`, `arcane/integration` 브랜치
- `pull_request`: `main` 브랜치 대상 PR

**Job 구성:**

| Job | 실행 시간 | 설명 |
|-----|----------|------|
| `lint-and-typecheck` | ~2분 | TypeScript 타입 체크, ESLint, Prettier 검사 |
| `validate-data` | ~1분 | 게임 데이터 JSON 스키마 검증 |
| `unit-tests` | ~3분 | 562개 유닛 테스트 (Vitest) + 커버리지 리포트 |
| `e2e-tests` | ~4분 | 34개 E2E 테스트 (Playwright) |
| `build` | ~2분 | 프로덕션 빌드 + 아티팩트 업로드 |
| `status-check` | ~10초 | 전체 검증 통과 여부 확인 |

**총 예상 시간:** ~12분 (병렬 실행)

**최적화:**
- `npm ci` 사용 (lockfile 기반, 빠름)
- `actions/cache` 사용 (node_modules 캐싱)
- Playwright 브라우저 캐싱
- 병렬 job 실행

### 2. Deploy (`deploy.yml`)

`main` 브랜치 push 또는 수동 트리거 시 배포합니다.

**트리거:**
- `push`: `main` 브랜치
- `workflow_dispatch`: 수동 실행 (환경 선택 가능)

**Job 구성:**

| Job | 대상 | 설명 |
|-----|------|------|
| `ci` | - | CI 워크플로우 재사용 (검증 통과 필수) |
| `deploy-vercel` | Vercel | 프로덕션/스테이징 배포 |
| `deploy-github-pages` | GitHub Pages | 스테이징 환경 (선택) |

**환경 변수 설정 필요:**
- `VERCEL_TOKEN`: Vercel 계정 토큰
- `VERCEL_ORG_ID`: Vercel 조직 ID
- `VERCEL_PROJECT_ID`: Vercel 프로젝트 ID

### 3. PR Check (`pr-check.yml`)

PR 생성 시 추가 분석 정보를 코멘트로 제공합니다.

**트리거:**
- `pull_request`: opened, synchronize, reopened

**Job 구성:**

| Job | 설명 |
|-----|------|
| `pr-info` | PR 변경 사항 분석 + 커버리지 리포트 코멘트 |
| `size-check` | 빌드 사이즈 분석 + 코멘트 |

**제공 정보:**
- 변경된 파일 수 (타입별)
- 테스트 커버리지 (%) + 배지
- 빌드 사이즈 (total, 주요 파일별)

## 로컬 검증

CI 실행 전에 로컬에서 각 단계를 검증하세요:

```bash
# 1. 타입 체크
npm run typecheck

# 2. Lint 검사
npm run lint

# 3. 포맷 검사
npm run format:check

# 4. 데이터 검증
npm run validate:data

# 5. 유닛 테스트
npm test

# 6. E2E 테스트 (별도 터미널에서 dev server 실행 필요)
npm run dev  # 터미널 1
npm run test:e2e  # 터미널 2

# 7. 빌드
npm run build
```

## 캐싱 전략

### Node.js 패키지 캐싱

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'
```

`package-lock.json` 기반 자동 캐싱, 변경 없으면 30초 → 5초로 단축.

### Playwright 브라우저 캐싱

```yaml
- run: npx playwright install chromium --with-deps
```

Chromium 브라우저를 캐싱하여 재설치 시간 절약 (~100MB).

### 빌드 캐싱

Vite는 자체적으로 `.vite` 캐시를 사용하지만, GitHub Actions에서는 매 빌드마다 clean install하므로 별도 캐싱 불필요.

## 보안

### Secrets 설정

Repository Settings → Secrets and variables → Actions → New repository secret:

| Secret 이름 | 설명 | 예시 |
|-------------|------|------|
| `VERCEL_TOKEN` | Vercel 계정 토큰 | `v1_abc123...` |
| `VERCEL_ORG_ID` | Vercel 조직 ID | `team_abc123` |
| `VERCEL_PROJECT_ID` | Vercel 프로젝트 ID | `prj_abc123` |

### 환경 변수

빌드 시 환경 변수가 필요한 경우 (예: Supabase):

```yaml
- name: Build project
  run: npm run build
  env:
    VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
```

**주의:** 현재 프로젝트는 환경 변수 없이도 오프라인 모드로 동작하므로 필수는 아닙니다.

## 아티팩트

### 업로드되는 아티팩트

| 이름 | 경로 | 보관 기간 | 설명 |
|------|------|----------|------|
| `dist` | `dist/` | 7일 | 프로덕션 빌드 결과물 |
| `coverage-report` | `coverage/` | 7일 | 테스트 커버리지 HTML 리포트 |
| `e2e-screenshots` | `tests/e2e/*.png` | 7일 | E2E 실패 시 스크린샷 |

아티팩트는 워크플로우 실행 페이지에서 다운로드 가능:
`Actions → 워크플로우 선택 → Summary → Artifacts`

## 상태 배지

README에 추가된 배지:

```markdown
[![CI](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml)
[![Deploy](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml)
```

## 트러블슈팅

### E2E 테스트 타임아웃

E2E 테스트에서 dev server 시작을 기다리는 60초 타임아웃:

```yaml
- name: Wait for dev server
  run: |
    timeout 60 bash -c 'until curl -s http://localhost:3000 > /dev/null; do sleep 1; done'
```

만약 Vite dev server 포트가 변경되었다면 (`vite.config.js`의 `server.port`), 워크플로우도 수정 필요.

### npm ci 실패

`package-lock.json`과 `package.json`이 동기화되지 않은 경우:

```bash
# 로컬에서 재생성
rm -rf node_modules package-lock.json
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
```

### Playwright 브라우저 설치 실패

Ubuntu에서 시스템 의존성 부족 시:

```yaml
- run: npx playwright install chromium --with-deps
```

`--with-deps` 플래그가 시스템 패키지를 자동 설치합니다.

## 성능 벤치마크

실제 워크플로우 실행 시간 (평균):

| 워크플로우 | 총 시간 | 비고 |
|-----------|---------|------|
| CI (전체) | ~12분 | 병렬 실행 시 |
| CI (캐시 히트) | ~8분 | npm 캐시 재사용 |
| Deploy | ~15분 | CI + 배포 |

## 참고 자료

- [GitHub Actions 공식 문서](https://docs.github.com/en/actions)
- [Vercel GitHub Actions 가이드](https://vercel.com/docs/concepts/deployments/git/vercel-for-github)
- [Playwright CI 가이드](https://playwright.dev/docs/ci)
