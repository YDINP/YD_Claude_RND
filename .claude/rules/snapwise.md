---
paths:
  - "shortform-blog/**"
---

# SnapWise 카드 시스템 규칙

## 스택
- Next.js 15 (App Router) + TypeScript + Tailwind v4 + Framer Motion
- 배포: Vercel (main 브랜치 자동 배포) — https://snapwise-beta.vercel.app
- GitHub: YDINP/snapwise

## StepType 목록 (v3 시네마틱)
- `cinematic-hook` — 오프닝 훅
- `scene` — 장면 묘사
- `dialogue` — 대화
- `narration` — 내레이션
- `impact` — 임팩트 포인트
- `reveal-title` — 제목 공개 (Title-Last 패턴 핵심)
- `outro` — 마무리

## Title-Last 패턴 (필수)
- 카드 시작 시 주제명을 숨기고 `reveal-title` 스텝에서 공개
- `cinematic-hook`에서 주제명 직접 언급 금지
- 궁금증 유발 → 스토리 전개 → 마지막 공개 순서 유지

## MDX Frontmatter 필수 필드
```yaml
title: string          # 카드 제목 (공개용)
category: string       # science|psychology|people|history|life|business|culture
description: string    # 카드 설명 (SEO용)
pubDate: string        # 생성 당일 날짜 — date +%Y-%m-%d 실행값 (하드코딩 금지)
steps:                 # 최소 6개, 최대 15개
  - type: StepType
    content: string
```

## 날짜 규칙
- `pubDate`는 카드 생성 시점의 **실제 오늘 날짜**를 사용
- 에이전트는 Bash로 `date +%Y-%m-%d` 실행 후 삽입 (고정값 하드코딩 금지)
- 자동 생성(card-batch-runner)도 동일하게 적용

## 카테고리 & 파일 경로
- 7개 카테고리: science, psychology, people, history, life, business, culture
- 파일 위치: `shortform-blog/content/{category}/{slug}.mdx`
- 카테고리당 10개 카드 (총 70개)

## 에이전트 활용
| 작업 | 에이전트 |
|------|---------|
| 단일 카드 생성 | `card-scenario` |
| 대량 생성 | `card-batch-runner` |
| 유효성 검증 | `mdx-validator` |

## 의존성
- `lucide-react`: OutroStep 아이콘
- `gray-matter`: MDX 파싱
- `motion` (framer-motion): 애니메이션

## 빌드
- 83페이지 SSG
- `npm run build` → Vercel 자동 배포
