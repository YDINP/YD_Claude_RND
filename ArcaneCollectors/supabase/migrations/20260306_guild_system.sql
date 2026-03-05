-- GP-2: 길드 시스템
-- Migration: guilds + guild_members 테이블 + RLS

-- =====================================================
-- guilds 테이블: 길드 기본 정보
-- =====================================================
CREATE TABLE IF NOT EXISTS guilds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  max_members INTEGER NOT NULL DEFAULT 30 CHECK (max_members IN (10, 20, 30, 50)),
  guild_points INTEGER NOT NULL DEFAULT 0,
  master_id UUID REFERENCES users(id) ON DELETE SET NULL,
  master_name TEXT NOT NULL DEFAULT '모험가',
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- guild_members 테이블: 길드원 목록
-- =====================================================
CREATE TABLE IF NOT EXISTS guild_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  guild_id UUID REFERENCES guilds(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL DEFAULT '모험가',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('master', 'member')),
  combat_power INTEGER NOT NULL DEFAULT 0,
  total_donation INTEGER NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- =====================================================
-- 인덱스
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_guilds_name ON guilds(name);
CREATE INDEX IF NOT EXISTS idx_guilds_guild_points ON guilds(guild_points DESC);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild_id ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_combat_power ON guild_members(guild_id, combat_power DESC);

-- =====================================================
-- RLS 정책
-- =====================================================
ALTER TABLE guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_members ENABLE ROW LEVEL SECURITY;

-- guilds: 모두 읽기 허용, 생성/수정은 자신이 마스터인 경우
CREATE POLICY "Anyone can read guilds" ON guilds
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create guild" ON guilds
  FOR INSERT WITH CHECK (auth.uid() = master_id);

CREATE POLICY "Guild master can update guild" ON guilds
  FOR UPDATE USING (auth.uid() = master_id);

CREATE POLICY "Guild master can delete guild" ON guilds
  FOR DELETE USING (auth.uid() = master_id);

-- guild_members: 모두 읽기 허용, 자신의 멤버십 관리
CREATE POLICY "Anyone can read guild members" ON guild_members
  FOR SELECT USING (true);

CREATE POLICY "Users can join guild (insert own membership)" ON guild_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave guild (delete own membership)" ON guild_members
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can update own member record" ON guild_members
  FOR UPDATE USING (auth.uid() = user_id);

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

CREATE TRIGGER update_guilds_updated_at
  BEFORE UPDATE ON guilds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
