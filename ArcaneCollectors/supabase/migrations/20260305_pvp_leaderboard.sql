-- GP-1: PvP 및 리더보드 시스템
-- Migration: 비동기 PvP 전투 + 랭킹 테이블

-- =====================================================
-- pvp_snapshots 테이블: 플레이어 파티 스냅샷 (PvP 방어 덱)
-- =====================================================
CREATE TABLE IF NOT EXISTS pvp_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL DEFAULT '모험가',
  party_snapshot JSONB NOT NULL DEFAULT '[]',
  combat_power INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- pvp_battles 테이블: PvP 전투 기록
-- =====================================================
CREATE TABLE IF NOT EXISTS pvp_battles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  attacker_id UUID REFERENCES users(id) ON DELETE SET NULL,
  defender_id UUID REFERENCES users(id) ON DELETE SET NULL,
  attacker_name TEXT NOT NULL DEFAULT '모험가',
  defender_name TEXT NOT NULL DEFAULT '모험가',
  attacker_power INTEGER NOT NULL DEFAULT 0,
  defender_power INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL CHECK (result IN ('win', 'lose', 'draw')),
  battle_log JSONB NOT NULL DEFAULT '[]',
  attacker_score_change INTEGER NOT NULL DEFAULT 0,
  defender_score_change INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- pvp_leaderboard 테이블: 랭킹/점수
-- =====================================================
CREATE TABLE IF NOT EXISTS pvp_leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL DEFAULT '모험가',
  score INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  win_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  season INTEGER NOT NULL DEFAULT 1,
  rank_tier TEXT NOT NULL DEFAULT 'bronze' CHECK (rank_tier IN ('bronze', 'silver', 'gold', 'platinum', 'diamond', 'master')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, season)
);

-- =====================================================
-- 인덱스
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_pvp_snapshots_user_id ON pvp_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_pvp_snapshots_combat_power ON pvp_snapshots(combat_power);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_attacker ON pvp_battles(attacker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_battles_defender ON pvp_battles(defender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_leaderboard_season_score ON pvp_leaderboard(season, score DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_leaderboard_user_season ON pvp_leaderboard(user_id, season);

-- =====================================================
-- RLS 정책
-- =====================================================
ALTER TABLE pvp_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pvp_leaderboard ENABLE ROW LEVEL SECURITY;

-- pvp_snapshots: 자신 CRUD, 타인 읽기 허용 (매칭용)
CREATE POLICY "Users can manage own pvp snapshot" ON pvp_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read pvp snapshots for matching" ON pvp_snapshots
  FOR SELECT USING (true);

-- pvp_battles: 자신이 관련된 전투 읽기, 시스템 삽입
CREATE POLICY "Users can read own pvp battles" ON pvp_battles
  FOR SELECT USING (auth.uid() = attacker_id OR auth.uid() = defender_id);

CREATE POLICY "Users can insert pvp battles as attacker" ON pvp_battles
  FOR INSERT WITH CHECK (auth.uid() = attacker_id);

-- pvp_leaderboard: 자신 CRUD, 타인 읽기 허용 (랭킹 조회용)
CREATE POLICY "Users can manage own leaderboard entry" ON pvp_leaderboard
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read pvp leaderboard" ON pvp_leaderboard
  FOR SELECT USING (true);

-- =====================================================
-- updated_at 트리거
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

CREATE TRIGGER update_pvp_snapshots_updated_at
  BEFORE UPDATE ON pvp_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pvp_leaderboard_updated_at
  BEFORE UPDATE ON pvp_leaderboard
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
