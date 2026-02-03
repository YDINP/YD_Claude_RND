# ArcaneCollectors v4 - 병합 전략 가이드

## 1. 병합 흐름

```
Worker 브랜치 (w1~w5)
        │
        ▼
  arcane/integration (통합 테스트)
        │
        ▼
      main (릴리즈)
```

---

## 2. Worker별 병합 순서

### Phase 1: 기반 시스템
```bash
# 1. W5 (독립적) - 설정/문서 먼저
git checkout arcane/integration
git merge --no-ff arcane/w5-config -m "[Merge] W5 설정/문서 통합"

# 2. W1 (기반) - 백엔드
git merge --no-ff arcane/w1-backend -m "[Merge] W1 백엔드 통합"
```

### Phase 2: 데이터 계층
```bash
# 3. W2 - 게임 데이터 (W1 이후)
git merge --no-ff arcane/w2-data -m "[Merge] W2 게임 데이터 통합"
```

### Phase 3: 로직 & UI
```bash
# 4. W4 - 시스템 (W1, W2 이후)
git merge --no-ff arcane/w4-system -m "[Merge] W4 게임 시스템 통합"

# 5. W3 - UI (W2, W4 이후)
git merge --no-ff arcane/w3-ui -m "[Merge] W3 UI 통합"
```

---

## 3. 충돌 해결 가이드

### 3.1 파일 소유권 기반 해결

| 파일 패턴 | 우선 Worker | 이유 |
|----------|------------|------|
| `supabase/**` | W1 | 백엔드 담당 |
| `src/api/**` | W1 | API 인터페이스 |
| `src/services/**` | W1 | 서비스 로직 |
| `src/data/**` | W2 | 데이터 스키마 |
| `src/scenes/**` | W3 | UI 컴포넌트 |
| `src/components/**` | W3 | UI 컴포넌트 |
| `src/systems/**` | W4 | 게임 로직 |
| `src/config/**` | W5 | 설정 |
| `docs/**` | W5 | 문서 |

### 3.2 공유 파일 충돌

공유 파일에서 충돌 시:

```javascript
// 예: src/config/gameConfig.js 충돌

// W3의 해상도 설정 + W5의 색상 설정 모두 유지
export const GAME_CONFIG = {
  // W3: 해상도 (유지)
  width: 720,
  height: 1280,

  // W5: 성격 색상 (유지)
  PERSONALITY_COLORS: {
    Brave: '#E74C3C',
    Cunning: '#9B59B6',
    // ...
  }
};
```

### 3.3 충돌 해결 명령어

```bash
# 충돌 파일 확인
git status

# 충돌 파일 편집 후
git add <file>
git commit -m "[Merge] W3+W4 충돌 해결"

# 또는 특정 Worker 버전 선택
git checkout --theirs <file>  # 병합되는 브랜치 버전
git checkout --ours <file>    # 현재 브랜치 버전
```

---

## 4. 통합 테스트 체크리스트

### 4.1 빌드 테스트
```bash
cd D:\park\YD_Claude_RND-integration\ArcaneCollectors
npm install
npm run build
```

### 4.2 기능 테스트

| 테스트 항목 | 담당 | 확인 |
|------------|------|------|
| Supabase 연결 | W1 | [ ] |
| 로그인/회원가입 | W1 | [ ] |
| 캐릭터 데이터 로드 | W2 | [ ] |
| 시너지 계산 | W2+W4 | [ ] |
| 메인 화면 렌더링 | W3 | [ ] |
| 전투 시스템 | W4 | [ ] |
| 에너지 시스템 | W4 | [ ] |
| 설정 적용 | W5 | [ ] |

---

## 5. Rebase vs Merge

### 권장: Merge (--no-ff)
```bash
git merge --no-ff arcane/w1-backend
```
- 병합 히스토리 명확
- Worker 작업 이력 보존
- 롤백 용이

### 선택: Rebase (개인 브랜치)
```bash
# Worker가 main 최신 반영 시
git checkout arcane/w1-backend
git rebase main
```
- main 변경사항 가져오기
- 선형 히스토리 유지

---

## 6. 긴급 핫픽스

```bash
# main에서 핫픽스 브랜치 생성
git checkout main
git checkout -b hotfix/critical-bug

# 수정 후 main에 병합
git checkout main
git merge --no-ff hotfix/critical-bug

# 모든 Worker 브랜치에 전파
for branch in arcane/w1-backend arcane/w2-data arcane/w3-ui arcane/w4-system arcane/w5-config; do
    git checkout $branch
    git merge main
done
```

---

## 7. 릴리즈 절차

```bash
# 1. integration에서 최종 테스트
git checkout arcane/integration
npm run build
npm test

# 2. main에 병합
git checkout main
git merge --no-ff arcane/integration -m "[Release] v4.0.0"

# 3. 태그 생성
git tag -a v4.0.0 -m "ArcaneCollectors v4.0.0 - 대규모 개편"

# 4. 푸시
git push origin main --tags
```
