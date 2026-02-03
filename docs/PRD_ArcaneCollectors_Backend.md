# Arcane Collectors - Backend PRD

## 1. 개요

### 1.1 프로젝트 목표
Arcane Collectors 게임의 유저 데이터를 안전하게 저장하고 관리하는 백엔드 서버 구축

### 1.2 현재 상태
- **현재**: localStorage 기반 클라이언트 저장 (브라우저/기기 종속)
- **문제점**:
  - 브라우저 데이터 삭제 시 진행 상황 손실
  - 다른 기기에서 접속 시 데이터 공유 불가
  - 치팅/해킹에 취약
  - 통계 및 분석 데이터 수집 불가

### 1.3 목표
- 클라우드 기반 유저 데이터 저장
- 크로스 디바이스 플레이 지원
- 서버 사이드 검증으로 치팅 방지
- 게임 분석 데이터 수집

---

## 2. 기술 스택

### 2.1 권장 스택 (Option A - Serverless)
| 구분 | 기술 | 이유 |
|------|------|------|
| **Runtime** | Node.js 20+ | 프론트엔드와 언어 통일 |
| **Framework** | Express.js / Fastify | 경량, 빠른 개발 |
| **Database** | Supabase (PostgreSQL) | 무료 티어, 실시간 기능 |
| **Auth** | Supabase Auth | 소셜 로그인 내장 |
| **Hosting** | Vercel / Railway | 무료 티어, 자동 배포 |
| **Cache** | Upstash Redis | 서버리스 Redis |

### 2.2 대안 스택 (Option B - Self-hosted)
| 구분 | 기술 | 이유 |
|------|------|------|
| **Runtime** | Node.js 20+ | - |
| **Framework** | NestJS | 구조화된 대규모 앱 |
| **Database** | MongoDB Atlas | 유연한 스키마, 무료 티어 |
| **Auth** | JWT + Passport.js | 커스텀 가능 |
| **Hosting** | Fly.io / Render | 무료 티어 |

### 2.3 MVP 추천: **Supabase 올인원**
- Auth, Database, Storage, Realtime 모두 제공
- 무료 티어로 충분한 테스트 가능
- 클라이언트 SDK로 빠른 개발

---

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Phaser 3   │  │ SaveManager │  │  Supabase Client    │  │
│  │   Game      │◄─┤  (Hybrid)   │◄─┤  @supabase/supabase-js│ │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
└───────────────────────────────────────────────┼─────────────┘
                                                │ HTTPS
                    ┌───────────────────────────▼───────────────┐
                    │              Supabase Cloud               │
                    │  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
                    │  │  Auth   │  │ Database│  │ Storage │   │
                    │  │ (GoTrue)│  │(Postgres)│ │  (S3)   │   │
                    │  └─────────┘  └─────────┘  └─────────┘   │
                    │  ┌─────────┐  ┌─────────┐                │
                    │  │Realtime │  │  Edge   │                │
                    │  │(Phoenix)│  │Functions│                │
                    │  └─────────┘  └─────────┘                │
                    └───────────────────────────────────────────┘
```

---

## 4. 데이터 모델

### 4.1 Users 테이블
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  nickname VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  is_banned BOOLEAN DEFAULT FALSE
);
```

### 4.2 Player_Data 테이블 (게임 저장 데이터)
```sql
CREATE TABLE player_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Player Info
  player_level INT DEFAULT 1,
  player_exp BIGINT DEFAULT 0,
  player_name VARCHAR(50) DEFAULT '모험가',

  -- Resources
  gold BIGINT DEFAULT 10000,
  gems INT DEFAULT 1500,
  summon_tickets INT DEFAULT 5,
  energy INT DEFAULT 50,
  max_energy INT DEFAULT 50,

  -- Progress
  current_chapter VARCHAR(20) DEFAULT 'chapter_1',
  tower_floor INT DEFAULT 1,
  total_battles INT DEFAULT 0,

  -- Gacha
  pity_counter INT DEFAULT 0,
  total_pulls INT DEFAULT 0,

  -- Settings
  settings JSONB DEFAULT '{"bgmVolume":1,"sfxVolume":1,"autoSkip":false,"battleSpeed":1}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_online TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);
```

### 4.3 Characters 테이블 (보유 캐릭터)
```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  character_id VARCHAR(50) NOT NULL, -- 'ssr_aelara', 'sr_kira' 등

  level INT DEFAULT 1,
  exp INT DEFAULT 0,
  stars INT DEFAULT 1,
  skill_levels INT[] DEFAULT '{1,1,1}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, character_id)
);
```

### 4.4 Stage_Progress 테이블 (스테이지 클리어 기록)
```sql
CREATE TABLE stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stage_id VARCHAR(20) NOT NULL, -- '1-1', '1-2' 등
  stars INT DEFAULT 0 CHECK (stars >= 0 AND stars <= 3),
  clear_count INT DEFAULT 0,
  best_time_ms INT,
  first_clear_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, stage_id)
);
```

### 4.5 Inventory 테이블 (인벤토리)
```sql
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(50) NOT NULL,
  quantity INT DEFAULT 1,
  metadata JSONB,

  UNIQUE(user_id, item_id)
);
```

### 4.6 Gacha_History 테이블 (뽑기 기록)
```sql
CREATE TABLE gacha_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  banner_id VARCHAR(50) NOT NULL,
  character_id VARCHAR(50) NOT NULL,
  rarity VARCHAR(10) NOT NULL, -- 'N', 'R', 'SR', 'SSR'
  is_pity BOOLEAN DEFAULT FALSE,
  pulled_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.7 Activity_Log 테이블 (활동 로그 - 분석용)
```sql
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- 'battle', 'gacha', 'levelup', 'purchase'
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_activity_log_user_action ON activity_log(user_id, action);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);
```

---

## 5. API 엔드포인트

### 5.1 인증 (Supabase Auth 내장)
| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/auth/signup` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| POST | `/auth/logout` | 로그아웃 |
| POST | `/auth/oauth/{provider}` | 소셜 로그인 (Google, Discord) |
| POST | `/auth/guest` | 게스트 로그인 |

### 5.2 플레이어 데이터
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/player` | 전체 플레이어 데이터 조회 |
| PUT | `/api/player` | 플레이어 데이터 저장 |
| PATCH | `/api/player/resources` | 리소스만 업데이트 |
| GET | `/api/player/offline-rewards` | 오프라인 보상 계산 |
| POST | `/api/player/claim-offline` | 오프라인 보상 수령 |

### 5.3 캐릭터
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/characters` | 보유 캐릭터 목록 |
| POST | `/api/characters` | 캐릭터 추가 (소환) |
| PATCH | `/api/characters/:id` | 캐릭터 업데이트 (레벨업 등) |

### 5.4 스테이지
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/stages/progress` | 스테이지 진행도 조회 |
| POST | `/api/stages/:stageId/start` | 전투 시작 (에너지 차감) |
| POST | `/api/stages/:stageId/complete` | 전투 완료 (보상 지급) |

### 5.5 가챠
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/gacha/info` | 가챠 정보 (천장, 확률) |
| POST | `/api/gacha/pull` | 단일 뽑기 |
| POST | `/api/gacha/pull10` | 10연차 |
| GET | `/api/gacha/history` | 뽑기 기록 |

### 5.6 상점
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/shop/items` | 상점 아이템 목록 |
| POST | `/api/shop/purchase` | 구매 |

---

## 6. 핵심 기능 상세

### 6.1 하이브리드 저장 시스템
클라이언트-서버 동기화 전략:

```javascript
// SaveManager 확장
class HybridSaveManager {
  // 로컬 저장 (즉시)
  saveLocal(data) {
    localStorage.setItem('arcane_save', JSON.stringify(data));
  }

  // 서버 동기화 (debounced, 5초)
  syncToServer = debounce(async (data) => {
    await supabase.from('player_data').upsert(data);
  }, 5000);

  // 저장 (로컬 + 서버)
  save(data) {
    this.saveLocal(data);
    this.syncToServer(data);
  }

  // 로드 (서버 우선, 로컬 폴백)
  async load() {
    try {
      const { data } = await supabase.from('player_data').select('*').single();
      if (data) {
        this.saveLocal(data); // 로컬 캐시 업데이트
        return data;
      }
    } catch (e) {
      console.warn('서버 로드 실패, 로컬 데이터 사용');
    }
    return JSON.parse(localStorage.getItem('arcane_save'));
  }
}
```

### 6.2 서버 사이드 가챠 검증
치팅 방지를 위해 뽑기는 반드시 서버에서 수행:

```javascript
// Edge Function: gacha-pull
export async function POST(req) {
  const { userId, pullCount } = await req.json();

  // 1. 유저 리소스 확인
  const player = await getPlayerData(userId);
  const cost = pullCount === 10 ? 2700 : 300; // 젬

  if (player.gems < cost) {
    return Response.json({ error: 'NOT_ENOUGH_GEMS' }, { status: 400 });
  }

  // 2. 서버에서 뽑기 수행
  const results = [];
  let pity = player.pity_counter;

  for (let i = 0; i < pullCount; i++) {
    pity++;
    const rarity = calculateRarity(pity); // 확률 + 천장 계산
    const character = pickCharacter(rarity);

    if (rarity === 'SSR') pity = 0;
    results.push({ character, rarity, isPity: pity === 0 });
  }

  // 3. 리소스 차감 및 캐릭터 추가
  await updatePlayerGems(userId, -cost);
  await updatePityCounter(userId, pity);
  await addCharacters(userId, results);

  // 4. 히스토리 기록
  await logGachaHistory(userId, results);

  return Response.json({ results, newPity: pity });
}
```

### 6.3 오프라인 보상 계산
```javascript
// Edge Function: offline-rewards
export async function GET(req) {
  const userId = req.headers.get('x-user-id');
  const player = await getPlayerData(userId);

  const now = Date.now();
  const lastOnline = new Date(player.last_online).getTime();
  let minutesAway = Math.floor((now - lastOnline) / 60000);

  // 최대 24시간
  minutesAway = Math.min(minutesAway, 1440);

  if (minutesAway < 5) {
    return Response.json({ gold: 0, exp: 0 });
  }

  const gold = Math.floor(minutesAway * 10 * (1 + player.player_level * 0.1));
  const exp = Math.floor(minutesAway * 5 * (1 + player.player_level * 0.05));

  return Response.json({
    gold,
    exp,
    duration: minutesAway,
    formattedDuration: formatDuration(minutesAway)
  });
}
```

---

## 7. 보안 고려사항

### 7.1 Row Level Security (RLS)
```sql
-- 자신의 데이터만 접근 가능
ALTER TABLE player_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own data" ON player_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON player_data
  FOR UPDATE USING (auth.uid() = user_id);
```

### 7.2 Rate Limiting
```javascript
// 가챠 API rate limit
const rateLimiter = {
  windowMs: 60000, // 1분
  max: 10,         // 최대 10회 요청
};
```

### 7.3 데이터 검증
- 서버에서 모든 리소스 변경 검증
- 클라이언트 요청 값 범위 체크
- 비정상적인 증가 패턴 모니터링

---

## 8. 마이그레이션 전략

### 8.1 기존 유저 데이터 이전
1. 게임 시작 시 localStorage 데이터 체크
2. 서버에 해당 유저 데이터 없으면 로컬 데이터 업로드
3. 충돌 시 서버 데이터 우선 (타임스탬프 비교 옵션)

```javascript
async function migrateLocalData(userId) {
  const localData = localStorage.getItem('arcane_collectors_save');
  if (!localData) return;

  const { data: serverData } = await supabase
    .from('player_data')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!serverData) {
    // 서버에 데이터 없음 - 로컬 데이터 업로드
    await supabase.from('player_data').insert({
      user_id: userId,
      ...JSON.parse(localData)
    });
  }
}
```

---

## 9. 모니터링 및 분석

### 9.1 수집 지표
| 지표 | 설명 |
|------|------|
| DAU/MAU | 일간/월간 활성 유저 |
| 리텐션 | D1, D7, D30 리텐션 |
| 가챠 전환율 | 유저당 평균 뽑기 횟수 |
| 스테이지 클리어율 | 챕터별 진행도 분포 |
| 평균 플레이 시간 | 세션당 플레이 시간 |

### 9.2 대시보드
- Supabase Dashboard (기본)
- Grafana + Prometheus (고급)
- Mixpanel / Amplitude (제품 분석)

---

## 10. 비용 추정

### 10.1 Supabase 무료 티어
| 항목 | 한도 |
|------|------|
| Database | 500MB |
| Auth | 50,000 MAU |
| Storage | 1GB |
| Edge Functions | 500K 호출/월 |
| Realtime | 200 동시 연결 |

**예상**: MVP 단계에서 무료 티어로 충분 (MAU 1,000명 이하)

### 10.2 확장 시 (Pro Plan - $25/월)
- 8GB Database
- 100,000 MAU
- 100GB Storage
- 2M Edge Function 호출

---

## 11. 개발 일정 (예상)

| Phase | 내용 | 예상 작업량 |
|-------|------|------------|
| Phase 1 | Supabase 설정, DB 스키마 | 1일 |
| Phase 2 | 인증 시스템 (게스트/소셜) | 1일 |
| Phase 3 | 플레이어 데이터 CRUD | 1일 |
| Phase 4 | 서버사이드 가챠 | 1일 |
| Phase 5 | 스테이지/전투 검증 | 1일 |
| Phase 6 | 클라이언트 통합 | 2일 |
| Phase 7 | 테스트 및 배포 | 1일 |

**총 예상**: 8일

---

## 12. 향후 확장

- 실시간 PvP (Supabase Realtime)
- 길드 시스템
- 랭킹 시스템
- 이벤트 배너 관리 CMS
- 결제 시스템 연동 (Stripe)
