-- RAID-01/02: 주간 레이드 시스템
-- Migration: raid_damage + raid_rewards_claimed 테이블 + RLS

-- =====================================================
-- raid_damage 테이블: 주간 보스별 유저 데미지 누적
-- =====================================================
CREATE TABLE IF NOT EXISTS raid_damage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  boss_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  damage BIGINT NOT NULL DEFAULT 0 CHECK (damage >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, boss_id, week_key)
);

-- =====================================================
-- raid_rewards_claimed 테이블: 기여도 구간 보상 수령 이력 (이중 수령 방지)
-- =====================================================
CREATE TABLE IF NOT EXISTS raid_rewards_claimed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  boss_id TEXT NOT NULL,
  week_key TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier >= 1),
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, boss_id, week_key, tier)
);

-- =====================================================
-- 인덱스
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_raid_damage_user ON raid_damage(user_id);
CREATE INDEX IF NOT EXISTS idx_raid_damage_boss_week ON raid_damage(boss_id, week_key);
CREATE INDEX IF NOT EXISTS idx_raid_damage_week_damage ON raid_damage(week_key, damage DESC);
CREATE INDEX IF NOT EXISTS idx_raid_rewards_claimed_user ON raid_rewards_claimed(user_id, boss_id, week_key);

-- =====================================================
-- RLS 정책
-- =====================================================
ALTER TABLE raid_damage ENABLE ROW LEVEL SECURITY;
ALTER TABLE raid_rewards_claimed ENABLE ROW LEVEL SECURITY;

-- raid_damage: 자신의 데미지만 읽기/쓰기 (주간 랭킹 집계는 뷰 또는 서버사이드로 확장 가능)
CREATE POLICY "Users can manage own raid damage" ON raid_damage
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can read raid damage for ranking" ON raid_damage
  FOR SELECT USING (true);

-- raid_rewards_claimed: 자신의 수령 이력만 관리 (읽기 제한 — 위변조 방지)
CREATE POLICY "Users can manage own raid reward claims" ON raid_rewards_claimed
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- updated_at 트리거 (함수 이미 존재하면 재사용)
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

CREATE TRIGGER update_raid_damage_updated_at
  BEFORE UPDATE ON raid_damage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
