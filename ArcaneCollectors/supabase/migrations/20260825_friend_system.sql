-- FRIEND-01/02: 친구 시스템
-- Migration: friends + friend_points 테이블 + RLS
-- 작성일: 2026-08-25

-- =====================================================
-- friends 테이블: 친구 관계 (단방향 owner → friend)
--   동일 user_id 쌍은 (owner_id, friend_id) 방향으로만 1행 존재
-- =====================================================
CREATE TABLE IF NOT EXISTS friends (
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  friend_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  friend_name TEXT NOT NULL DEFAULT '모험가',
  friend_level INTEGER NOT NULL DEFAULT 1,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (owner_id, friend_id),
  CHECK (owner_id <> friend_id)
);

-- =====================================================
-- friend_points 테이블: 일일 친구 호감도 포인트 송수신 로그
--   day_key = 'YYYY-MM-DD' (UTC)
--   (sender_id, receiver_id, day_key) 복합 유니크 → 이중수령/이중전송 방지
-- =====================================================
CREATE TABLE IF NOT EXISTS friend_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  day_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  received_at TIMESTAMPTZ,
  UNIQUE (sender_id, receiver_id, day_key),
  CHECK (sender_id <> receiver_id)
);

-- =====================================================
-- 인덱스
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_friends_owner_id ON friends(owner_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friend_points_sender_day ON friend_points(sender_id, day_key);
CREATE INDEX IF NOT EXISTS idx_friend_points_receiver_day ON friend_points(receiver_id, day_key);

-- =====================================================
-- RLS 정책
-- =====================================================
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_points ENABLE ROW LEVEL SECURITY;

-- friends: 본인이 owner 인 행만 읽기/쓰기 가능
CREATE POLICY "Users can read own friend list" ON friends
  FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Users can add friends" ON friends
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can remove friends" ON friends
  FOR DELETE USING (auth.uid() = owner_id);

-- friend_points: 본인이 sender 또는 receiver 인 행만 조회 가능
CREATE POLICY "Participants can read point logs" ON friend_points
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send points" ON friend_points
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 수령 시각 갱신은 receiver 만
CREATE POLICY "Receiver can mark points received" ON friend_points
  FOR UPDATE USING (auth.uid() = receiver_id);
