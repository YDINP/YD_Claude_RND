-- ArcaneCollectors Database Schema
-- Initial migration: Core tables for game data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- users 테이블 - 사용자 기본 정보
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  nickname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_nickname ON users(nickname);

-- =====================================================
-- player_data 테이블 - 플레이어 게임 데이터
-- =====================================================
CREATE TABLE player_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gold INTEGER DEFAULT 0 CHECK (gold >= 0),
  gems INTEGER DEFAULT 0 CHECK (gems >= 0),
  energy INTEGER DEFAULT 100 CHECK (energy >= 0),
  max_energy INTEGER DEFAULT 100 CHECK (max_energy > 0),
  player_level INTEGER DEFAULT 1 CHECK (player_level >= 1),
  exp INTEGER DEFAULT 0 CHECK (exp >= 0),
  vip_level INTEGER DEFAULT 0 CHECK (vip_level >= 0),
  sweep_tickets INTEGER DEFAULT 10 CHECK (sweep_tickets >= 0),
  last_energy_update TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 인덱스
CREATE INDEX idx_player_data_user_id ON player_data(user_id);

-- =====================================================
-- heroes 테이블 - 영웅 데이터
-- =====================================================
CREATE TABLE heroes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  hero_id TEXT NOT NULL,
  level INTEGER DEFAULT 1 CHECK (level >= 1),
  exp INTEGER DEFAULT 0 CHECK (exp >= 0),
  stars INTEGER DEFAULT 1 CHECK (stars >= 1 AND stars <= 7),
  skill_levels JSONB DEFAULT '{}',
  equipment JSONB DEFAULT '{}',
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, hero_id)
);

-- 인덱스
CREATE INDEX idx_heroes_user_id ON heroes(user_id);
CREATE INDEX idx_heroes_hero_id ON heroes(hero_id);

-- =====================================================
-- parties 테이블 - 파티 구성 (4인 파티, 5개 슬롯)
-- =====================================================
CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  slot_number INTEGER CHECK (slot_number BETWEEN 1 AND 5),
  hero_ids TEXT[] CHECK (array_length(hero_ids, 1) <= 4),
  party_name TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slot_number)
);

-- 인덱스
CREATE INDEX idx_parties_user_id ON parties(user_id);

-- =====================================================
-- stage_progress 테이블 - 스테이지 진행 상황
-- =====================================================
CREATE TABLE stage_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  stars INTEGER DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  clear_count INTEGER DEFAULT 0 CHECK (clear_count >= 0),
  best_time INTEGER,
  can_sweep BOOLEAN GENERATED ALWAYS AS (stars = 3) STORED,
  first_clear_at TIMESTAMPTZ,
  last_clear_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stage_id)
);

-- 인덱스
CREATE INDEX idx_stage_progress_user_id ON stage_progress(user_id);
CREATE INDEX idx_stage_progress_stage_id ON stage_progress(stage_id);

-- =====================================================
-- inventory 테이블 - 인벤토리 아이템
-- =====================================================
CREATE TABLE inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, item_id)
);

-- 인덱스
CREATE INDEX idx_inventory_user_id ON inventory(user_id);
CREATE INDEX idx_inventory_item_id ON inventory(item_id);

-- =====================================================
-- 트리거: updated_at 자동 갱신
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_player_data_updated_at
  BEFORE UPDATE ON player_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_heroes_updated_at
  BEFORE UPDATE ON heroes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_parties_updated_at
  BEFORE UPDATE ON parties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stage_progress_updated_at
  BEFORE UPDATE ON stage_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Row Level Security (RLS) 정책
-- =====================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE heroes ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

-- Users: 자신의 데이터만 접근
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Player Data: 자신의 데이터만 접근
CREATE POLICY "Users can view own player data" ON player_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own player data" ON player_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own player data" ON player_data
  FOR UPDATE USING (auth.uid() = user_id);

-- Heroes: 자신의 영웅만 접근
CREATE POLICY "Users can view own heroes" ON heroes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own heroes" ON heroes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own heroes" ON heroes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own heroes" ON heroes
  FOR DELETE USING (auth.uid() = user_id);

-- Parties: 자신의 파티만 접근
CREATE POLICY "Users can view own parties" ON parties
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own parties" ON parties
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own parties" ON parties
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own parties" ON parties
  FOR DELETE USING (auth.uid() = user_id);

-- Stage Progress: 자신의 진행도만 접근
CREATE POLICY "Users can view own stage progress" ON stage_progress
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stage progress" ON stage_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stage progress" ON stage_progress
  FOR UPDATE USING (auth.uid() = user_id);

-- Inventory: 자신의 인벤토리만 접근
CREATE POLICY "Users can view own inventory" ON inventory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inventory" ON inventory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inventory" ON inventory
  FOR UPDATE USING (auth.uid() = user_id);
