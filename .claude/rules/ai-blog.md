---
paths:
  - "ai-revenue-blog/**"
  - "life-revenue-blog/**"
---

# AI Revenue Blog 규칙

## 스택
- Astro SSG + Vercel + Supabase + n8n
- 배포: Vercel (master 브랜치 자동 배포) — https://ai-revenue-blog.vercel.app
- GitHub: YDINP/ai-revenue-blog (master 브랜치)

## 최신 데이터 원칙 (최우선 규칙)
- 모든 포스트는 검증 가능한 실제 데이터 기반
- 허구 수치/제품명 절대 금지
- 벤치마크·가격은 공식 발표 기준
- 비교글 작성 시 반드시 웹 크롤링으로 최신 데이터 수집 후 작성

## 날짜 규칙
- 게시 날짜는 반드시 오늘(현재일) 이하
- 미래 날짜 frontmatter 절대 금지

## 카테고리
- AI, Dev, Review, Game (4개)
- 동적 라우트: `/blog/ai/`, `/blog/dev/`, `/blog/review/`, `/blog/game/`

## 쿠팡 링크
- frontmatter `coupangLinks` 배열 → `CoupangBanner` 컴포넌트 자동 렌더링
- 형식: `{ name: string, url: string, price: string }`

## 차트 시스템 (비교/분석 글 필수)
- `chart-bar`: 막대 차트 (수치 비교)
- `chart-radar`: 레이더 차트 (다차원 점수 비교)
- `BlogPostLayout`에서 frontmatter 기반 자동 렌더링
- 비교/분석 글에 차트 삽입 필수 (BLOG_GUIDELINES.md 규칙)

## CSS 변수
- `:root` / `:root.dark` 기반 다크모드
- `--color-primary`, `--color-bg`, `--color-text` 등

## Supabase
- 프로젝트 ID: `xyprbsmagtlzebxyxsvj`
- URL: `https://xyprbsmagtlzebxyxsvj.supabase.co`
- pageview 추적: `increment_page_views` RPC
- 쿠팡 클릭 추적: `analytics-ingest` Edge Function v2
- 테이블: analytics, blog_posts, newsletter_subscribers

## Pexels API
- Key: `auC4jZ0hXy8yWDBX2UakTc0ywXJ4BIS99taY8HJRZx2Y9K5w6K3iDmmv`
- 히어로 이미지 실검색 시 사용

## n8n
- URL: `http://localhost:5678` / PW: `dydwls12A`
- API: Cookie 기반 `/rest/login` → `/rest/workflows/{id}`
- blog-content-generator 워크플로우 ID: `acGsV8QPxEk9DcEo`

## Astro SSG 패턴
- `getStaticPaths()` — 빌드 시 정적 생성
- `CLAUDE.local.md`나 `.env`에 민감 정보 분리
