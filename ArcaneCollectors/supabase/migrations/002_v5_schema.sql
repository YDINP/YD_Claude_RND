-- ArcaneCollectors Database Schema v5
-- Migration: Extended schema for v5 features
-- Features: VIP system, gacha pity, friends system

-- =====================================================
-- player_data 테이블 확장
-- =====================================================

-- VIP 레벨 컬럼이 없으면 추가 (이미 001에 있을 수 있음)
-- sweep_count_today: 일일 소탕 횟수 추적
DO $$
BEGIN
  -- sweep_count_today 컬럼 추가
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_data' AND column_name = 'sweep_count_today'
  ) THEN
    ALTER TABLE player_data ADD COLUMN sweep_count_today INTEGER DEFAULT 0 CHECK (sweep_count_today >= 0);
  END IF;

  -- sweep_reset_date: 소탕 횟수 리셋 날짜
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_data' AND column_name = 'sweep_reset_date'
  ) THEN
    ALTER TABLE player_data ADD COLUMN sweep_reset_date DATE DEFAULT CURRENT_DATE;
  END IF;

  -- total_gems_spent: VIP 레벨 계산용 총 젬 소비량
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_data' AND column_name = 'total_gems_spent'
  ) THEN
    ALTER TABLE player_data ADD COLUMN total_gems_spent INTEGER DEFAULT 0 CHECK (total_gems_spent >= 0);
  END IF;
END $$;

-- =====================================================
-- gacha_history 테이블 - 가챠 기록 및 천장 시스템
-- =====================================================
CREATE TABLE IF NOT EXISTS gacha_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  banner_id TEXT NOT NULL,
  pull_type TEXT NOT NULL CHECK (pull_type IN ('single', 'multi_10')),
  results JSONB NOT NULL, -- [{hero_id, rarity, is_new, is_pity}]
  pity_count_before INTEGER NOT NULL CHECK (pity_count_before >= 0),
  pity_count_after INTEGER NOT NULL CHECK (pity_count_after >= 0),
  gems_spent INTEGER NOT NULL CHECK (gems_spent >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_gacha_history_user_id ON gacha_history(user_id);
CREATE INDEX IF NOT EXISTS idx_gacha_history_banner_id ON gacha_history(banner_id);
CREATE INDEX IF NOT EXISTS idx_gacha_history_created_at ON gacha_history(created_at);

-- =====================================================
-- gacha_pity 테이블 - 배너별 천장 카운터
-- =====================================================
CREATE TABLE IF NOT EXISTS gacha_pity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  banner_id TEXT NOT NULL,
  pity_count INTEGER DEFAULT 0 CHECK (pity_count >= 0),
  guaranteed_5star BOOLEAN DEFAULT false, -- 50/50 실패 후 다음 확정
  last_5star_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, banner_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_gacha_pity_user_id ON gacha_pity(user_id);
CREATE INDEX IF NOT EXISTS idx_gacha_pity_banner_id ON gacha_pity(banner_id);

-- =====================================================
-- friends 테이블 - 친구 시스템
-- =====================================================
CREATE TABLE IF NOT EXISTS friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, friend_id),
  CHECK (user_id != friend_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);

-- =====================================================
-- friend_requests_view - 친구 요청 뷰
-- =====================================================
CREATE OR REPLACE VIEW friend_requests_view AS
SELECT
  f.id,
  f.user_id AS from_user_id,
  f.friend_id AS to_user_id,
  u.nickname AS from_nickname,
  p.player_level AS from_level,
  f.requested_at,
  f.status
FROM friends f
JOIN users u ON f.user_id = u.id
LEFT JOIN player_data p ON f.user_id = p.user_id
WHERE f.status = 'pending';

-- =====================================================
-- 트리거: gacha_pity updated_at 자동 갱신
-- =====================================================
CREATE TRIGGER update_gacha_pity_updated_at
  BEFORE UPDATE ON gacha_pity
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friends_updated_at
  BEFORE UPDATE ON friends
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) 정책
-- =====================================================
ALTER TABLE gacha_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacha_pity ENABLE ROW LEVEL SECURITY;
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- Gacha History: 자신의 기록만 접근
CREATE POLICY "Users can view own gacha history" ON gacha_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gacha history" ON gacha_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Gacha Pity: 자신의 천장만 접근
CREATE POLICY "Users can view own gacha pity" ON gacha_pity
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gacha pity" ON gacha_pity
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gacha pity" ON gacha_pity
  FOR UPDATE USING (auth.uid() = user_id);

-- Friends: 자신이 관련된 친구 관계만 접근
CREATE POLICY "Users can view own friends" ON friends
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can insert friend requests" ON friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update friend requests" ON friends
  FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "Users can delete own friend relations" ON friends
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- =====================================================
-- 함수: 일일 소탕 횟수 리셋
-- =====================================================
CREATE OR REPLACE FUNCTION reset_daily_sweep_count()
RETURNS void AS $$
BEGIN
  UPDATE player_data
  SET sweep_count_today = 0,
      sweep_reset_date = CURRENT_DATE
  WHERE sweep_reset_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 함수: VIP 레벨 계산
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_vip_level(total_spent INTEGER)
RETURNS INTEGER AS $$
BEGIN
  -- VIP 레벨 기준 (총 젬 소비량 기준)
  -- VIP 0: 0
  -- VIP 1: 100+
  -- VIP 2: 500+
  -- VIP 3: 1000+
  -- VIP 4: 3000+
  -- VIP 5: 5000+
  -- VIP 6: 10000+
  -- VIP 7: 20000+
  -- VIP 8: 50000+
  -- VIP 9: 100000+
  -- VIP 10: 200000+
  RETURN CASE
    WHEN total_spent >= 200000 THEN 10
    WHEN total_spent >= 100000 THEN 9
    WHEN total_spent >= 50000 THEN 8
    WHEN total_spent >= 20000 THEN 7
    WHEN total_spent >= 10000 THEN 6
    WHEN total_spent >= 5000 THEN 5
    WHEN total_spent >= 3000 THEN 4
    WHEN total_spent >= 1000 THEN 3
    WHEN total_spent >= 500 THEN 2
    WHEN total_spent >= 100 THEN 1
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 트리거: VIP 레벨 자동 업데이트
-- =====================================================
CREATE OR REPLACE FUNCTION update_vip_level()
RETURNS TRIGGER AS $$
BEGIN
  NEW.vip_level = calculate_vip_level(NEW.total_gems_spent);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vip_level
  BEFORE UPDATE OF total_gems_spent ON player_data
  FOR EACH ROW EXECUTE FUNCTION update_vip_level();
