# CI/CD 파이프라인 설정 가이드

ArcaneCollectors 프로젝트의 GitHub Actions 기반 CI/CD 파이프라인 설정 방법입니다.

## 전제 조건

- GitHub 저장소에 프로젝트 푸시 완료
- Node.js 20 LTS 로컬 설치 (검증용)
- Vercel 계정 (배포 시)

## 1단계: GitHub 저장소 설정

### 1.1 저장소 생성

```bash
# GitHub에 저장소 생성 후
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors

# Git 초기화 (아직 안 했다면)
git init
git add .
git commit -m "Initial commit with CI/CD pipeline"

# 원격 저장소 추가
git remote add origin https://github.com/YDINP/ArcaneCollectors.git
git branch -M main
git push -u origin main
```

### 1.2 브랜치 보호 규칙 설정 (권장)

Repository Settings → Branches → Add rule:

**Branch name pattern:** `main`

체크할 항목:
- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - 필수 체크: `lint-and-typecheck`, `unit-tests`, `e2e-tests`, `build`
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings

이렇게 설정하면 CI 통과 없이는 `main` 브랜치에 머지 불가.

## 2단계: Vercel 배포 설정 (선택)

### 2.1 Vercel 프로젝트 생성

1. [Vercel 대시보드](https://vercel.com/dashboard) 접속
2. "Add New..." → "Project" 클릭
3. GitHub 저장소 연결 (ArcaneCollectors)
4. 프로젝트 설정:
   - **Framework Preset:** Other
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

5. "Deploy" 클릭 (첫 배포)

### 2.2 Vercel 토큰 발급

1. Vercel 대시보드 → Settings → Tokens
2. "Create Token" 클릭
3. 토큰 이름: `ArcaneCollectors CI/CD`
4. Scope: Full Account
5. Expiration: No Expiration (또는 1년)
6. 생성된 토큰 복사 (한 번만 표시됨!)

### 2.3 Vercel 프로젝트 ID 확인

프로젝트 Settings → General → "Project ID" 복사

### 2.4 Vercel 조직 ID 확인

프로젝트 Settings → General → "Team ID" 복사 (개인 계정이면 없을 수 있음)

또는 CLI로 확인:

```bash
npm i -g vercel
vercel login
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors
vercel link
# .vercel/project.json 파일 생성됨
cat .vercel/project.json
# orgId, projectId 확인
```

### 2.5 GitHub Secrets 등록

Repository → Settings → Secrets and variables → Actions → New repository secret:

| Secret 이름 | 값 |
|-------------|-----|
| `VERCEL_TOKEN` | (2.2에서 발급한 토큰) |
| `VERCEL_ORG_ID` | (2.4에서 확인한 조직 ID, 없으면 생략) |
| `VERCEL_PROJECT_ID` | (2.3에서 확인한 프로젝트 ID) |

**주의:** `.vercel/` 폴더는 `.gitignore`에 포함되어야 합니다 (이미 포함됨).

## 3단계: GitHub Pages 배포 설정 (선택)

스테이징 환경으로 GitHub Pages 사용 시:

### 3.1 Pages 활성화

Repository → Settings → Pages:
- **Source:** GitHub Actions
- **Custom domain:** (선택)

### 3.2 Base Path 수정 (필요시)

GitHub Pages는 `https://username.github.io/repo-name/` 형태로 서브패스에 배포됩니다.

Vite 설정 수정:

```js
// vite.config.js
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/ArcaneCollectors/' : './',
  // ...
})
```

워크플로우에서 환경 변수 설정:

```yaml
# .github/workflows/deploy.yml
- name: Build project
  run: npm run build
  env:
    GITHUB_PAGES: true
```

**현재 설정:** `base: './'`로 상대 경로 사용 중, 수정 불필요.

## 4단계: CI 워크플로우 검증

### 4.1 첫 실행 확인

프로젝트를 GitHub에 푸시하면 자동으로 CI 워크플로우가 실행됩니다.

확인 경로:
```
Repository → Actions → CI 워크플로우 클릭
```

### 4.2 로컬 사전 검증

CI 실패를 방지하기 위해 로컬에서 먼저 검증:

```bash
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors

# 전체 검증 스크립트
npm run typecheck && \
npm run lint && \
npm run format:check && \
npm run validate:data && \
npm test && \
npm run build

# E2E는 별도 터미널
npm run dev  # 터미널 1
npm run test:e2e  # 터미널 2 (dev server 시작 후)
```

모든 검증 통과 시 CI도 통과합니다.

## 5단계: PR 워크플로우 테스트

### 5.1 테스트 브랜치 생성

```bash
git checkout -b feature/test-ci
```

### 5.2 작은 변경 사항 추가

```bash
# 예: README 수정
echo "# CI/CD Test" >> README.md
git add README.md
git commit -m "Test: Add CI/CD test line"
git push origin feature/test-ci
```

### 5.3 PR 생성

GitHub에서 `feature/test-ci` → `main` PR 생성:
- PR 생성 즉시 `ci.yml`, `pr-check.yml` 워크플로우 실행
- ~12분 후 결과 확인
- PR 코멘트에 분석 결과 자동 추가됨

### 5.4 머지

모든 체크 통과 시 "Merge pull request" 버튼 활성화:
- Squash and merge (권장)
- `main` 브랜치 업데이트 → `deploy.yml` 자동 실행

## 6단계: 배포 확인

### 6.1 Vercel 배포 확인

`main` 브랜치에 머지되면:
1. CI 워크플로우 실행 (~12분)
2. Deploy 워크플로우 실행 (~3분)
3. Vercel 배포 URL 확인:
   - Actions → Deploy 워크플로우 → Summary → Environment URLs

### 6.2 배포 URL 접속

```
https://arcane-collectors-xyz.vercel.app
```

게임 로딩 확인:
- ✅ 캔버스 렌더링
- ✅ 로그인 화면
- ✅ 게스트 로그인
- ✅ 메인 메뉴
- ✅ 자동 전투 작동

## 7단계: 상태 배지 추가 (완료)

README.md에 이미 추가되어 있습니다:

```markdown
[![CI](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/ci.yml)
[![Deploy](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml/badge.svg)](https://github.com/YDINP/ArcaneCollectors/actions/workflows/deploy.yml)
```

## 고급 설정

### A. 슬랙 알림 추가

워크플로우 실패 시 슬랙으로 알림:

```yaml
# .github/workflows/ci.yml
jobs:
  notify:
    runs-on: ubuntu-latest
    needs: [status-check]
    if: failure()
    steps:
      - name: Send Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "text": "❌ CI failed for ${{ github.repository }}"
            }
```

Secrets에 `SLACK_WEBHOOK_URL` 추가 필요.

### B. 커버리지 리포트 업로드

Codecov 연동:

```yaml
# .github/workflows/ci.yml
- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    files: ./coverage/coverage-final.json
```

[Codecov](https://codecov.io) 계정 생성 후 토큰 발급.

### C. 자동 릴리스 노트

태그 푸시 시 자동으로 릴리스 노트 생성:

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
```

릴리스 생성:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 트러블슈팅

### 1. CI 실패: "npm ci" 오류

**원인:** `package-lock.json`과 `package.json` 불일치

**해결:**
```bash
rm -rf node_modules package-lock.json
npm install
git add package-lock.json
git commit -m "fix: Update package-lock.json"
git push
```

### 2. E2E 테스트 타임아웃

**원인:** Dev server 시작 실패 또는 포트 충돌

**확인:**
```yaml
# .github/workflows/ci.yml
- name: Wait for dev server
  run: |
    timeout 60 bash -c 'until curl -s http://localhost:3000 > /dev/null; do sleep 1; done'
```

포트가 `vite.config.js`의 `server.port`와 일치하는지 확인 (현재: 3000).

### 3. Vercel 배포 실패

**원인:** Secrets 미설정 또는 잘못된 토큰

**확인:**
```bash
# 로컬에서 Vercel CLI로 테스트
vercel --prod --token=$VERCEL_TOKEN
```

### 4. Playwright 브라우저 설치 오류

**원인:** Ubuntu 시스템 의존성 부족

**해결:** `--with-deps` 플래그 사용 (이미 적용됨):
```yaml
- run: npx playwright install chromium --with-deps
```

## 체크리스트

설정 완료 체크리스트:

- [ ] GitHub 저장소 생성 및 푸시
- [ ] 브랜치 보호 규칙 설정 (권장)
- [ ] Vercel 프로젝트 생성
- [ ] Vercel Secrets 등록 (VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID)
- [ ] CI 워크플로우 첫 실행 성공
- [ ] PR 워크플로우 테스트
- [ ] 배포 워크플로우 성공
- [ ] 배포된 사이트 접속 확인
- [ ] README 상태 배지 표시 확인

## 다음 단계

CI/CD 파이프라인 구축 완료 후:

1. **자동 테스트 추가**: 새 기능 개발 시 테스트도 함께 작성
2. **커버리지 목표 설정**: PR에서 커버리지 감소 시 경고
3. **성능 모니터링**: Lighthouse CI 통합
4. **보안 스캔**: npm audit, Snyk 통합
5. **자동 릴리스**: Semantic versioning + 자동 태그

## 참고 자료

- [GitHub Actions 공식 문서](https://docs.github.com/en/actions)
- [Vercel 배포 가이드](https://vercel.com/docs/concepts/deployments/overview)
- [Playwright CI 가이드](https://playwright.dev/docs/ci)
- [Vitest Coverage](https://vitest.dev/guide/coverage.html)
