# PRD Sprint 3: UI/UX 고도화

> **Version**: 1.0
> **Date**: 2026-02-13
> **Base Branch**: `arcane/integration`

---

## UIX-3.1: BottomNav 히트영역 + 비주얼 수정

### 문제
- 부모-자식 Container 좌표 변환으로 hitArea 클릭 불일치
- hitArea y범위(-35~+35)가 실제 터치 포인트와 불일치
- 같은 탭 재클릭 시 피드백 없음

### 요구사항
1. hitArea를 **컨테이너 로컬 좌표 기준으로 정확히 재계산**
2. 탭 높이 100px로 확대 (터치 친화)
3. 히트영역 상단 여유분 10px 추가
4. Press 상태 시각 피드백 (스케일 0.95 + 색상 변화)
5. 같은 탭 클릭 시에도 시각 피드백 (바운스)
6. 활성 탭 인디케이터 애니메이션 개선

### 수정 파일
- `src/components/BottomNav.js`
- `src/config/layoutConfig.js` (BOTTOM_NAV.HEIGHT: 100→120)

### 완료 기준
- [x] 모든 5탭 클릭 100% 반응
- [x] Playwright MCP로 각 탭 클릭 테스트 통과
- [x] 시각 피드백 애니메이션 동작

---

## UIX-3.2: 홈 방치형 컨텐츠

### 컨셉
홈 화면에서 현재 파티가 **자동으로 전투/수집**하는 미니뷰를 표시.
직접 상호작용 없이도 "성장하고 있다"는 느낌 제공.

### 요구사항

#### A. 자동전투 미니뷰 (화면 중앙)
1. 현재 파티 4명의 아바타가 좌측에 배치
2. 랜덤 몬스터가 우측에서 등장
3. 자동으로 공격 애니메이션 (스윙, 마법진 등 간단 효과)
4. 몬스터 HP 바 감소 → 처치 → 보상 팝업
5. 반복 사이클: 몬스터 등장(1초) → 전투(3초) → 보상(1초) → 반복

#### B. 획득 자원 플로팅
1. 전투 완료 시 "+10 Gold", "+5 EXP" 텍스트 부유
2. 상단바 자원 값에 자연스럽게 합산
3. 누적 오프라인 수익 표시 (팝업 아닌 상시 작은 텍스트)

#### C. 진행도 표시
1. 파티 평균 레벨 + 경험치 바
2. 현재 자동전투 스테이지 표시 ("Stage 1-3 자동사냥 중")
3. 시간당 예상 수익 (Gold/h, EXP/h)

#### D. IdleProgressSystem
1. 오프라인 시간 계산 (최대 12시간)
2. 시간 × 파티전투력 × 스테이지계수 → 보상 계산
3. 접속 시 오프라인 보상 팝업 (기존 Modal 활용)

### 신규 파일
- `src/systems/IdleProgressSystem.js`
- `src/components/IdleBattleView.js`

### 수정 파일
- `src/scenes/MainMenuScene.js` (미니뷰 통합)

### 완료 기준
- [x] 홈 화면에서 자동전투 미니뷰 표시
- [x] 5초 주기로 전투 사이클 반복
- [x] 자원 획득 플로팅 텍스트 동작
- [x] 오프라인 보상 계산 정상

---

## UIX-3.3: 홈 퀵액세스 통합

### 컨셉
홈에서 모든 핵심 기능에 접근 가능하도록 퀵메뉴 확장.

### 요구사항

#### A. 콘텐츠 버튼 확장
1. 6→8개 버튼 (2행 → 2행 4열)
2. 추가: 소환(가챠), 모험(스테이지)
3. 각 버튼에 알림 배지 (미완료 퀘스트 수 등)

#### B. 상단바 확장
1. 플레이어 레벨 표시 (좌측)
2. 전투력 표시 (메인 파티)
3. 에너지 바 터치 시 충전 팝업

#### C. 빠른 소환
1. 홈에서 "무료 소환" 버튼 (일일 1회)
2. 소환 결과 미니 팝업 (GachaScene 이동 없이)

### 수정 파일
- `src/scenes/MainMenuScene.js`

### 완료 기준
- [x] 8개 버튼 정상 작동
- [x] 모든 씬으로 이동 가능
- [x] 상단바 레벨/전투력 표시

---

## UIX-3.4: 씬별 레이아웃 고도화

### 대상 씬 (6개)
1. **GachaScene**: 소환 연출 개선, 확률 표시 명확화
2. **StageSelectScene**: 챕터/스테이지 맵 레이아웃 개선
3. **HeroListScene**: 카드 그리드 정렬, 필터 UI 개선
4. **TowerScene**: 타워 층 표시 개선
5. **QuestScene**: 퀘스트 목록 정렬, 보상 미리보기
6. **InventoryScene**: 장비 카드 정렬, 비교 뷰

### 공통 요구사항
1. TopBar ↔ BottomNav 사이 콘텐츠 영역 정확히 계산
2. 스크롤 가능한 콘텐츠 (overflow 처리)
3. 뒤로가기 버튼 위치 통일 (좌상단 50×50)
4. 배경 그래디언트 씬별 차별화

### 완료 기준
- [x] 6개 씬 레이아웃 겹침 없음
- [x] 스크롤 정상 동작
- [x] 콘텐츠가 네비 영역 침범하지 않음

---

## ART-1.1: 배경 이미지

### 필요 이미지
| 씬 | 분위기 | 해상도 | 파일명 |
|----|--------|--------|--------|
| MainMenu | 신비로운 성/탑 | 720×1280 | `bg_main.png` |
| Battle | 어두운 던전/필드 | 720×1280 | `bg_battle.png` |
| Gacha | 마법진/소환 서클 | 720×1280 | `bg_gacha.png` |
| StageSelect | 월드맵/판타지 지형 | 720×1280 | `bg_stage.png` |
| Tower | 어둑한 탑 내부 | 720×1280 | `bg_tower.png` |

### 소스
- 무료 게임 에셋 (CC0/CC-BY 라이선스)
- 키워드: fantasy, dark, arcane, magical, dungeon

---

## ART-1.2: UI 아이콘/버튼

### 필요 에셋
| 카테고리 | 수량 | 사이즈 | 내용 |
|---------|------|--------|------|
| 탭 아이콘 | 5 | 48×48 | home, sword, bag, dice, menu |
| 통화 아이콘 | 3 | 32×32 | gem, gold, energy |
| 클래스 아이콘 | 4 | 40×40 | warrior, mage, healer, archer |
| 버튼 배경 | 3 | 200×60 | primary, secondary, danger |

---

## ART-1.3: 캐릭터 플레이스홀더

### 필요 에셋
| 유형 | 수량 | 사이즈 | 설명 |
|------|------|--------|------|
| 직업 기본 | 4 | 128×128 | warrior, mage, healer, archer 실루엣 |
| 등급별 프레임 | 5 | 140×140 | N/R/SR/SSR/UR 테두리 |
| 적 기본 | 3 | 100×100 | 슬라임, 골렘, 보스 실루엣 |

---

## AUTH-1: 자동로그인 + 계정 변경 (Sprint 4 백로그)

> **상태**: 📋 백로그 (추후 구현)
> **우선순위**: P1
> **난이도**: MED

### 현재 상태
- `LoginScene.js`: 게스트 로그인 + Supabase 이메일/비밀번호 인증
- 로그인 후 `SaveManager.setUserId()` → `PreloadScene` 이동
- **자동로그인 없음** — 매번 LoginScene에서 수동 선택 필요

### AUTH-1.1: 자동로그인

#### 요구사항
1. 앱 시작 시 localStorage에서 이전 로그인 정보 확인
2. 정보 있으면 LoginScene 스킵 → 자동 인증 → PreloadScene 직행
3. 자동로그인 실패 시 (토큰 만료 등) LoginScene으로 폴백
4. BootScene에서 자동로그인 분기 처리

#### 구현 방향
```
BootScene.create()
  → localStorage에서 auth_token / userId 확인
  → 있으면: Supabase 세션 복원 시도
    → 성공: PreloadScene 이동 (LoginScene 스킵)
    → 실패: LoginScene 이동
  → 없으면: LoginScene 이동
```

#### 저장 데이터
```javascript
// localStorage 키
'arcane_auth': {
  userId: string,
  authType: 'guest' | 'email',
  email?: string,
  lastLogin: timestamp,
  autoLogin: boolean  // 사용자 선택
}
```

### AUTH-1.2: 계정 변경 (SettingsScene)

#### 요구사항
1. SettingsScene에 "계정 변경" 버튼 추가
2. 버튼 클릭 시 확인 모달: "현재 계정에서 로그아웃하고 로그인 화면으로 돌아갑니다"
3. 확인 시:
   - 현재 세이브 데이터 클라우드 동기화 (Supabase)
   - localStorage의 auth 정보 삭제
   - Registry 초기화
   - LoginScene으로 이동
4. 취소 시 모달 닫기

#### UI 위치
- SettingsScene 하단 "계정" 섹션
- 버튼: "🔄 계정 변경" (danger 색상, 명확한 경고)
- 현재 로그인 정보 표시: "현재: guest_abc123" 또는 "현재: user@email.com"

### AUTH-1.3: 로그인 화면 개선

#### 요구사항
1. "자동 로그인" 체크박스 추가 (기본 ON)
2. "이전 계정으로 로그인" 빠른 버튼 (최근 3개 계정)
3. 게스트 → 이메일 계정 전환(연동) 기능

### 수정 파일 (예상)
| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `src/scenes/BootScene.js` | 수정 | 자동로그인 분기 로직 |
| `src/scenes/LoginScene.js` | 수정 | 자동로그인 체크박스, 최근 계정 |
| `src/scenes/SettingsScene.js` | 수정 | 계정 변경 버튼/모달 |
| `src/systems/AuthManager.js` | 신규 | 인증 상태 관리 Singleton |
| `src/systems/SaveManager.js` | 수정 | auth 데이터 저장/삭제 |

### 완료 기준
- [ ] 이전 로그인 정보 있으면 LoginScene 스킵
- [ ] 자동로그인 실패 시 LoginScene 폴백
- [ ] SettingsScene에서 계정 변경 가능
- [ ] 계정 변경 시 데이터 동기화 후 로그아웃
- [ ] 자동로그인 ON/OFF 토글

---

## QA-3.1: 통합 테스트

### 테스트 범위
1. UIX-3.1: 모든 BottomNav 탭 클릭 반응 검증
2. UIX-3.2: 방치형 미니뷰 동작 확인
3. UIX-3.3: 8개 퀵액세스 버튼 동작
4. UIX-3.4: 6개 씬 레이아웃 겹침 검사
5. ART-1: 이미지 로드 에러 없음

### 도구
- Playwright MCP (window.__TEST_API__ 활용)
- Vitest (유닛 테스트)
- tsc --noEmit (타입 체크)
