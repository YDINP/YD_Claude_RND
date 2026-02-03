# W1: 백엔드/Supabase Worker 가이드

## 개요
- **브랜치**: `arcane/w1-backend`
- **폴더**: `D:\park\YD_Claude_RND-w1`
- **담당**: Supabase 백엔드 구축

---

## 파일 소유권

```
supabase/**
src/api/**
src/services/AuthService.js
src/services/PlayerService.js
src/services/HeroService.js
src/services/GachaService.js
src/services/BattleService.js
src/services/SweepService.js
.env.local
```

---

## 태스크 목록

### Task 1.1: Supabase 프로젝트 설정
- [ ] supabase 폴더 구조 생성
- [ ] .env 파일에 Supabase URL/Key 설정
- [ ] supabase client 초기화 코드

### Task 1.2: 데이터베이스 스키마 생성
- [ ] users 테이블
- [ ] player_data 테이블
- [ ] heroes 테이블
- [ ] parties 테이블
- [ ] stage_progress 테이블
- [ ] inventory 테이블
- [ ] RLS 정책 설정

### Task 1.3: API 서비스 구현
- [ ] AuthService (로그인/회원가입)
- [ ] PlayerService (플레이어 데이터)
- [ ] HeroService (영웅 관리)
- [ ] GachaService (가챠)
- [ ] BattleService (전투 결과)
- [ ] SweepService (소탕)

### Task 1.4: 데이터 마이그레이션
- [ ] LocalStorage → Supabase 마이그레이션 유틸
- [ ] 기존 저장 데이터 변환
- [ ] 오프라인 폴백 처리

---

## DB 스키마 참조

### users
```sql
id: uuid (PK)
email: text
nickname: text
created_at: timestamp
last_login: timestamp
```

### player_data
```sql
id: uuid (PK)
user_id: uuid (FK)
gold: integer
gems: integer
energy: integer
max_energy: integer
player_level: integer
exp: integer
vip_level: integer
```

### heroes
```sql
id: uuid (PK)
user_id: uuid (FK)
hero_id: text
level: integer
exp: integer
stars: integer
skill_levels: jsonb
equipment: jsonb
```

### parties
```sql
id: uuid (PK)
user_id: uuid (FK)
slot_number: integer (1-5)
hero_ids: text[] (4개)
is_active: boolean
```

### stage_progress
```sql
id: uuid (PK)
user_id: uuid (FK)
stage_id: text
stars: integer (0-3)
clear_count: integer
best_time: integer
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|-------|------|------|
| POST | /auth/register | 회원가입 |
| POST | /auth/login | 로그인 |
| GET | /player/data | 플레이어 데이터 조회 |
| PUT | /player/data | 플레이어 데이터 저장 |
| GET | /heroes | 보유 영웅 목록 |
| POST | /gacha/pull | 가챠 실행 |
| POST | /battle/start | 전투 시작 |
| POST | /battle/result | 전투 결과 저장 |
| POST | /sweep | 소탕 실행 |

---

## 커밋 예시
```
[W1][1.1] Supabase 프로젝트 초기 설정
[W1][1.2] users, player_data 테이블 생성
[W1][1.3] AuthService 구현
```
