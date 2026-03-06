# ArcaneCollectors v5 PRD (Product Requirements Document)

**버전**: 5.0
**작성일**: 2025-02-04
**이전 버전**: v4 (파티 4인, 성격 시스템, 에너지/소탕 시스템)
**목표**: v4 미구현 기능 완성 + 신규 콘텐츠 추가

---

## 1. 개요

### 1.1 목적
ArcaneCollectors v5는 v4에서 미구현된 핵심 기능(백엔드, 계정 시스템)을 완성하고, 게임의 장기 플레이 콘텐츠를 확장하는 것을 목표로 합니다.

### 1.2 주요 변경사항 요약

| 영역 | v4 상태 | v5 목표 |
|------|---------|---------|
| 백엔드 | 미구현 | Supabase 완전 연동 |
| 계정 시스템 | 미구현 | 회원가입/로그인/클라우드 저장 |
| 데이터 완성도 | 60% | 100% |
| 가챠 시스템 | 기본 | 천장 + 픽업 |
| 콘텐츠 | 모험만 | 무한의 탑 + 레이드 |
| 소셜 | 없음 | 친구 시스템 |

---

## 2. Phase 1: 백엔드 시스템 (최우선)

### 2.1 Supabase 데이터베이스 스키마

#### 2.1.1 users 테이블
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE
);
```

#### 2.1.2 player_data 테이블
```sql
CREATE TABLE player_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER DEFAULT 1,
  exp BIGINT DEFAULT 0,
  gold BIGINT DEFAULT 0,
  gems INTEGER DEFAULT 0,
  energy INTEGER DEFAULT 100,
  energy_updated_at TIMESTAMP DEFAULT NOW(),
  vip_level INTEGER DEFAULT 0,
  sweep_count_today INTEGER DEFAULT 0,
  sweep_reset_at DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.1.3 heroes 테이블
```sql
CREATE TABLE heroes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  character_id VARCHAR(50) NOT NULL,
  level INTEGER DEFAULT 1,
  exp INTEGER DEFAULT 0,
  stars INTEGER DEFAULT 1,
  personality VARCHAR(20),
  equipment JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.1.4 parties 테이블
```sql
CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  hero_ids UUID[] NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  name VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 2.1.5 stage_progress 테이블
```sql
CREATE TABLE stage_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stage_id VARCHAR(50) NOT NULL,
  stars INTEGER DEFAULT 0,
  clear_count INTEGER DEFAULT 0,
  best_time INTEGER,
  first_clear_at TIMESTAMP,
  UNIQUE(user_id, stage_id)
);
```

#### 2.1.6 inventory 테이블
```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  item_type VARCHAR(20) NOT NULL,
  quantity INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, item_id)
);
```

#### 2.1.7 gacha_history 테이블
```sql
CREATE TABLE gacha_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  banner_id VARCHAR(50) NOT NULL,
  pull_count INTEGER DEFAULT 0,
  pity_count INTEGER DEFAULT 0,
  last_ssr_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 API 엔드포인트

#### 인증 API
| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| POST | /auth/register | 회원가입 |
| POST | /auth/login | 로그인 |
| POST | /auth/logout | 로그아웃 |
| POST | /auth/refresh | 토큰 갱신 |
| GET | /auth/me | 현재 사용자 정보 |

#### 플레이어 API
| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| GET | /player/data | 플레이어 데이터 조회 |
| PUT | /player/data | 플레이어 데이터 업데이트 |
| POST | /player/sync | 데이터 동기화 |

#### 영웅 API
| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| GET | /heroes | 보유 영웅 목록 |
| POST | /heroes | 영웅 획득 |
| PUT | /heroes/:id | 영웅 업데이트 |
| DELETE | /heroes/:id | 영웅 삭제 |

#### 가챠 API
| 메서드 | 엔드포인트 | 설명 |
|--------|------------|------|
| POST | /gacha/pull | 단일 뽑기 |
| POST | /gacha/pull10 | 10연차 |
| GET | /gacha/pity | 천장 정보 조회 |

---

## 3. Phase 2: 계정 시스템

### 3.1 회원가입
- 이메일 + 비밀번호 방식
- 닉네임 중복 검사
- 이메일 인증 (선택적)

### 3.2 로그인
- 이메일/비밀번호 로그인
- 자동 로그인 (토큰 저장)
- 소셜 로그인 (Google, 추후 확장)

### 3.3 클라우드 저장
- 자동 동기화 (5분마다)
- 수동 동기화 버튼
- 충돌 해결 (서버 우선 / 로컬 우선 선택)

### 3.4 게스트 모드
- 회원가입 없이 플레이 가능
- 로컬 저장만 사용
- 계정 연동 시 데이터 마이그레이션

---

## 4. Phase 3: 가챠 시스템 고도화

### 4.1 천장(Pity) 시스템
```javascript
const PITY_SYSTEM = {
  softPity: 75,        // 75회부터 SSR 확률 증가
  hardPity: 90,        // 90회 SSR 확정
  softPityBonus: 0.06, // 소프트 천장 이후 회당 +6%
  pickupPity: 180      // 180회 픽업 캐릭터 확정
};
```

### 4.2 픽업 배너
- 픽업 캐릭터 확률 50% (SSR 내)
- 픽업 실패 시 다음 SSR 100% 픽업
- 배너별 천장 카운트 분리

### 4.3 확률 표시
- 각 등급별 확률 명시
- 천장까지 남은 횟수 표시
- 뽑기 기록 조회

---

## 5. Phase 4: 무한의 탑 (신규 콘텐츠)

### 5.1 개요
- 100층 + 무한 확장
- 층마다 난이도 증가
- 10층마다 보스전

### 5.2 보상 구조
| 층 | 보상 |
|----|------|
| 1-10층 | 골드 + 경험치 |
| 11-30층 | R 장비 조각 |
| 31-50층 | SR 장비 조각 |
| 51-70층 | SSR 장비 조각 |
| 71-100층 | 전설 재료 |
| 100층+ | 무한 보상 (순위 기반) |

### 5.3 시즌 시스템
- 월간 시즌 리셋
- 시즌 종료 시 순위 보상
- 시즌 업적 달성 보상

---

## 6. Phase 5: 레이드 시스템 (신규 콘텐츠)

### 6.1 개요
- 주간 보스 레이드
- 협동 데미지 누적 방식
- 길드 레이드 (추후 확장)

### 6.2 레이드 보스
| 보스 | 교단 | 약점 성격 | 보상 |
|------|------|----------|------|
| 니드호그 | 발할라 | Brave | 북유럽 장비 |
| 야마타노오로치 | 타카마가하라 | Cunning | 일본 장비 |
| 티폰 | 올림푸스 | Calm | 그리스 장비 |
| 펜리르 | 아스가르드 | Wild | 북유럽 장비 |
| 이자나미 | 요미 | Mystic | 일본 장비 |

### 6.3 보상 시스템
- 데미지 기여도 기반 보상
- 주간 클리어 보너스
- 길드 순위 보상 (길드 시스템 추가 시)

---

## 7. Phase 6: 친구 시스템 (소셜)

### 7.1 기능
- 친구 추가/삭제
- 친구 목록 (최대 50명)
- 친구 영웅 빌려쓰기 (1일 3회)

### 7.2 친구 포인트
- 친구에게 매일 포인트 전송
- 포인트로 특별 상점 이용
- 일일 수령 한도: 20포인트

---

## 8. 데이터 완성 요구사항

### 8.1 영웅 데이터 (characters.json)
- 총 81개 영웅 완성
- 각 교단별 균형 (교단당 약 16개)
- 등급 분포: N(30%), R(40%), SR(20%), SSR(10%)

### 8.2 장비 데이터 (equipment.json)
- 총 81개 장비 완성
- 4가지 슬롯: 무기, 방어구, 악세서리, 유물
- 등급별 스탯 배율 정의

### 8.3 스테이지 데이터 (stages.json)
- 5챕터 × 5스테이지 = 25 스테이지
- 각 스테이지별 적 구성
- 에너지 소비량, 보상 정의

### 8.4 적 데이터 (enemies.json)
- 일반 몬스터 50종
- 엘리트 몬스터 20종
- 보스 15종

---

## 9. UI/UX 개선사항

### 9.1 애니메이션
- 진화 연출 애니메이션
- 가챠 뽑기 연출
- 스킬 발동 이펙트
- 레벨업 축하 연출

### 9.2 사운드
- BGM (메인, 전투, 보스전)
- 효과음 (버튼, 스킬, 승리/패배)
- 보이스 (선택적)

### 9.3 반응형 최적화
- 720x1280 기본
- 1080x1920 고해상도
- 태블릿 대응

---

## 10. 기술 스택

### 10.1 프론트엔드
- Phaser 3 (게임 엔진)
- Vite (빌드 도구)
- JavaScript ES6+

### 10.2 백엔드
- Supabase (BaaS)
- PostgreSQL (데이터베이스)
- Supabase Auth (인증)
- Supabase Storage (파일 저장)

### 10.3 배포
- Vercel / Netlify (프론트엔드)
- Supabase Cloud (백엔드)

---

## 11. 일정 계획

| Phase | 내용 | 예상 작업량 |
|-------|------|------------|
| Phase 1 | 백엔드 시스템 | 워커 2명 |
| Phase 2 | 계정 시스템 | 워커 1명 |
| Phase 3 | 가챠 고도화 | 워커 1명 |
| Phase 4 | 무한의 탑 | 워커 2명 |
| Phase 5 | 레이드 시스템 | 워커 2명 |
| Phase 6 | 친구 시스템 | 워커 1명 |
| 데이터 | 데이터 완성 | 워커 1명 |
| UI/UX | 애니메이션/사운드 | 워커 1명 |

---

## 12. 성공 지표 (KPI)

| 지표 | 목표 |
|------|------|
| 일일 활성 사용자 (DAU) | 1,000명 |
| 평균 세션 시간 | 15분 |
| 7일 리텐션 | 30% |
| 가챠 전환율 | 5% |
| 버그 발생률 | < 1% |

---

*문서 버전: 5.0*
*작성일: 2025-02-04*
