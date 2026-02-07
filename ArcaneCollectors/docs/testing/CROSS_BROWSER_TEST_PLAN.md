# D-5: 크로스 브라우저 & 모바일 테스트 계획

## 1. 테스트 환경 매트릭스

### 데스크탑 브라우저
| 브라우저 | 최소 버전 | WebGL | Canvas | 상태 |
|---------|----------|-------|--------|------|
| Chrome | 90+ | ✅ | ✅ | 주력 |
| Firefox | 90+ | ✅ | ✅ | 지원 |
| Safari | 15+ | ✅ | ✅ | 지원 |
| Edge | 90+ | ✅ | ✅ | 지원 |

### 모바일 브라우저
| 브라우저 | OS | 최소 버전 | 상태 |
|---------|-----|----------|------|
| Chrome Mobile | Android 10+ | 90+ | 주력 |
| Safari Mobile | iOS 15+ | 15+ | 주력 |
| Samsung Internet | Android | 15+ | 지원 |

### 해상도 테스트
| 디바이스 | 해상도 | 비율 | 우선순위 |
|---------|--------|------|---------|
| iPhone SE | 375×667 | 16:9 | P1 |
| iPhone 14 | 390×844 | ~19.5:9 | P1 |
| iPhone 14 Pro Max | 430×932 | ~19.5:9 | P1 |
| Galaxy S23 | 360×780 | ~19.5:9 | P1 |
| iPad | 810×1080 | 4:3 | P2 |
| Desktop 1080p | 1920×1080 | 16:9 | P2 |

## 2. 기능별 테스트 체크리스트

### 2.1 씬 전환 플로우
- [ ] Boot → Login → Preload → MainMenu (정상 플로우)
- [ ] 각 씬 전환 시 페이드 애니메이션
- [ ] 뒤로가기 버튼 처리
- [ ] BottomNav 탭 전환

### 2.2 터치 인터랙션
- [ ] 버튼 탭 (44px+ 터치 영역)
- [ ] 카드 탭 & 호버
- [ ] 메인 캐릭터 터치 반응
- [ ] 스크롤 (히어로 리스트, 인벤토리)
- [ ] 스와이프 제스처 (TouchManager)

### 2.3 렌더링 & 퍼포먼스
- [ ] WebGL 모드 확인 (Phaser.AUTO → WebGL 우선)
- [ ] Canvas 폴백 동작
- [ ] 파티클 이펙트 렌더링 (ParticleManager)
- [ ] 60fps 유지 (메인 메뉴, 전투)
- [ ] 메모리 누수 없음 (씬 전환 반복)

### 2.4 반응형 레이아웃
- [ ] 720×1280 기준 FIT 스케일링
- [ ] 가로 모드 경고 표시
- [ ] 작은 화면 (< 360px) 대응
- [ ] 태블릿 (> 768px) 대응
- [ ] notch/safe-area 대응

### 2.5 데이터 & 저장
- [ ] localStorage 저장/로드
- [ ] Supabase 동기화 (로그인 상태)
- [ ] 오프라인 모드 동작
- [ ] 세이브 데이터 마이그레이션

### 2.6 가챠 & 전투
- [ ] 가챠 연출 (파티클 이펙트)
- [ ] 전투 공격/스킬 애니메이션
- [ ] 데미지 표시 (ParticleManager)
- [ ] 전투 속도 조절

## 3. 알려진 호환성 이슈

### WebGL 관련
- iOS Safari: WebGL context 수 제한 (최대 8)
- 일부 Android: WebGL2 미지원 → Phaser AUTO가 Canvas로 폴백
- 해결: `Phaser.AUTO` 사용 (자동 폴백)

### 터치 관련
- iOS: `touch-action: none` CSS 필수 (기적용)
- iOS Safari: 300ms 탭 딜레이 → `user-scalable=no` viewport로 해결 (기적용)
- Samsung Internet: `pointerdown` 이벤트 지연 가능

### CSS 관련
- `aspect-ratio` 속성: Chrome 88+, Safari 15+ (지원 범위 내)
- `body::after` landscape 경고: 일부 브라우저에서 flexbox 미지원

## 4. 퍼포먼스 기준

| 지표 | 목표 | 측정 방법 |
|------|------|----------|
| FPS | ≥ 55fps (평균) | Phaser debug.showFps |
| 초기 로드 | < 3초 | Performance API |
| 씬 전환 | < 500ms | 체감 |
| 메모리 | < 200MB | Chrome DevTools |
| 번들 크기 | < 2MB (gzip) | Vite build output |

## 5. 테스트 실행 방법

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드 테스트
npm run build && npm run preview

# 모바일 테스트 (같은 네트워크)
npm run dev -- --host
# → 표시된 Network URL을 모바일에서 접속
```

## 6. 자동화 테스트 (추후)

```bash
# Playwright 설치
npm install -D @playwright/test

# 브라우저 테스트
npx playwright test

# 특정 브라우저
npx playwright test --project=chromium
npx playwright test --project=webkit
```
