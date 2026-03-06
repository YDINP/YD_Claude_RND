# ArcaneCollectors 배포 가이드

## 빌드 최적화 현황 (INFRA-1 & INFRA-3)

### 빌드 크기 비교

#### 최적화 후 (현재)
```
총 번들 크기: 2.1MB (uncompressed)
총 gzip 크기: ~527KB

세부 청크:
- phaser-CQe8KMav.js:     1.2MB → 315.21 KB (gzip)
- game-core-VgXpcV2r.js:  436KB → 116.38 KB (gzip)
- game-data-bsvm7Awb.js:  213KB →  57.88 KB (gzip)
- supabase-BK2r9XTs.js:   160KB →  41.63 KB (gzip)
- vendor-DD-jMxXN.js:     116KB →  35.49 KB (gzip)
- index-AsLnp_1Q.js:      917B  →   0.52 KB (gzip)
```

### 주요 최적화 적용 사항

#### 1. 코드 스플리팅
- **Phaser 엔진**: 별도 청크로 분리 (캐싱 효율 최대화)
- **Supabase 클라이언트**: 독립 청크
- **게임 데이터**: JSON 파일들 별도 청크
- **게임 코어**: scenes + systems 통합 (순환 참조 해결)
- **게임 UI**: UI 컴포넌트 별도 청크
- **기타 벤더**: node_modules 통합 청크

#### 2. 민파이 & 압축
- **Terser 최적화**: drop_console, drop_debugger, passes: 2
- **에셋 인라인**: 10KB 이하 파일은 base64 인라인
- **소스맵**: 프로덕션에서 비활성화 (배포 크기 절감)

#### 3. 파일명 전략
```
청크:  assets/js/[name]-[hash].js
엔트리: assets/js/[name]-[hash].js
에셋:  assets/[ext]/[name]-[hash].[ext]
```
→ 브라우저 캐싱 최적화 (hash 기반)

---

## 배포 방법

### 1. Vercel 배포

#### 초기 설정
```bash
npm install -g vercel
vercel login
```

#### 배포 실행
```bash
# 프로젝트 루트에서
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors
vercel --prod
```

#### 환경 변수 설정 (Vercel 대시보드)
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_GAME_VERSION=1.0.0
```

#### vercel.json 설정 완료
- SPA 라우팅: 모든 요청 → /index.html
- 캐시 헤더: /assets/* → max-age=31536000 (1년)
- 보안 헤더: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection

---

### 2. Netlify 배포

#### 초기 설정
```bash
npm install -g netlify-cli
netlify login
```

#### 배포 실행
```bash
# 프로젝트 루트에서
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors
netlify deploy --prod
```

#### 환경 변수 설정 (Netlify 대시보드)
Environment > Environment variables에서 동일하게 설정

#### netlify.toml 설정 완료
- 빌드 커맨드: `npm run build`
- 퍼블리시 디렉토리: `dist`
- 리다이렉트: /* → /index.html (SPA)
- 캐시 & 보안 헤더 적용

---

### 3. GitHub Pages (선택적)

#### 설정 추가 필요
```bash
# vite.config.js에서 base 경로 수정
base: '/ArcaneCollectors/'  # 레포지토리 이름

# 빌드 후 배포
npm run build
npx gh-pages -d dist
```

---

## PWA (Progressive Web App) 지원

### 완료된 설정

#### manifest.json
- 앱 이름: Arcane Collectors
- 테마 색상: #6366F1 (indigo)
- 배경 색상: #0F172A (dark slate)
- 아이콘: 192x192, 512x512 (추가 필요)
- 화면 방향: portrait (세로 고정)

#### 메타 태그 (index.html)
- `<meta name="theme-color">`: 모바일 브라우저 테마
- `<link rel="manifest">`: PWA manifest
- Apple iOS 메타 태그: 홈 화면 추가 지원
- 파비콘: 16x16, 32x32 (추가 필요)

#### 추가 작업 필요
- [ ] 아이콘 이미지 생성: `public/icon-192.png`, `public/icon-512.png`
- [ ] 파비콘 생성: `public/favicon-16x16.png`, `public/favicon-32x32.png`
- [ ] Service Worker 구현 (오프라인 캐싱)

---

## 로컬 프리뷰

빌드 결과를 로컬에서 확인:

```bash
npm run build
npm run preview
# → http://localhost:4173 에서 확인
```

---

## 번들 분석

번들 크기 및 의존성 트리 시각화:

```bash
npm run build:analyze
# → dist/stats.html 자동 열림
```

---

## 체크리스트

### 배포 전 필수 확인
- [ ] `npm run validate:data` 통과
- [ ] `npm run test` 전체 통과 (562 tests)
- [ ] `npm run build` 성공
- [ ] `npm run preview` 로컬 테스트
- [ ] 환경 변수 설정 (Supabase URL/KEY)
- [ ] PWA 아이콘 이미지 준비

### 배포 후 확인
- [ ] 홈 화면 로딩 정상
- [ ] 게임 플레이 정상
- [ ] Supabase 연동 정상
- [ ] 모바일 반응형 확인
- [ ] PWA 설치 가능 여부 (모바일)

---

## 참고 사항

### 브라우저 지원
- Chrome/Edge: 90+
- Firefox: 88+
- Safari: 14+
- Mobile Safari: 14+

### 성능 목표
- FCP (First Contentful Paint): < 1.5s
- LCP (Largest Contentful Paint): < 2.5s
- TTI (Time to Interactive): < 3.5s

### 보안 헤더
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin (Netlify)

---

## 트러블슈팅

### 빌드 에러: "terser not found"
```bash
npm install --save-dev terser
```

### 순환 참조 경고
- scenes와 systems를 단일 청크(`game-core`)로 통합하여 해결

### Vercel 배포 실패
- `vercel.json`의 `outputDirectory`가 `dist`인지 확인
- 환경 변수가 Vercel 대시보드에 설정되었는지 확인

### 모바일에서 터치 안됨
- `index.html`의 `touch-action: none` 확인
- viewport 메타 태그의 `user-scalable=no` 확인

---

## 다음 단계 (선택적)

1. **Service Worker**: Workbox로 오프라인 캐싱 구현
2. **이미지 최적화**: WebP 포맷 적용, 레이지 로딩
3. **CDN**: Cloudflare/CloudFront로 정적 에셋 서빙
4. **Analytics**: Google Analytics 또는 Plausible 연동
5. **에러 모니터링**: Sentry 연동
