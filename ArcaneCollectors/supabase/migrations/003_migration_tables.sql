-- 003: W1-1.4 마이그레이션 지원 테이블 추가
-- gacha, quests, settings, statistics + migration_status

-- 가챠 데이터
CREATE TABLE IF NOT EXISTS gacha_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  pity_counter INTEGER DEFAULT 0,
  total_pulls INTEGER DEFAULT 0,
  last_ssr_pull INTEGER DEFAULT 0,
  banner_pulls JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 퀘스트 데이터
CREATE TABLE IF NOT EXISTS quest_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  daily_quests JSONB DEFAULT '{}',
  daily_progress JSONB DEFAULT '{}',
  last_reset TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 설정 데이터
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  bgm_volume REAL DEFAULT 1.0,
  sfx_volume REAL DEFAULT 1.0,
  auto_skip BOOLEAN DEFAULT FALSE,
  battle_speed INTEGER DEFAULT 1,
  language TEXT DEFAULT 'ko',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 통계 데이터
CREATE TABLE IF NOT EXISTS user_statistics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  total_gold_earned BIGINT DEFAULT 0,
  total_gems_spent BIGINT DEFAULT 0,
  characters_collected INTEGER DEFAULT 0,
  highest_damage INTEGER DEFAULT 0,
  total_battles INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 마이그레이션 상태 추적
CREATE TABLE IF NOT EXISTS migration_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  migration_completed BOOLEAN DEFAULT FALSE,
  migration_version INTEGER DEFAULT 0,
  local_data_hash TEXT,
  migrated_at TIMESTAMPTZ,
  error_log JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS 정책
ALTER TABLE gacha_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own gacha data" ON gacha_data
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own quest data" ON quest_data
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own statistics" ON user_statistics
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own migration status" ON migration_status
  FOR ALL USING (auth.uid() = user_id);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_gacha_data_updated_at BEFORE UPDATE ON gacha_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_quest_data_updated_at BEFORE UPDATE ON quest_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_statistics_updated_at BEFORE UPDATE ON user_statistics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
