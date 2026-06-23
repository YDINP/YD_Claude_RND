'use client';

import { useEffect, useState } from 'react';
import { getDaily } from '@/lib/daily';
import type { DailyInfo } from '@/lib/daily';
import { getStageRule, stageSeed } from '@/lib/stages';

import HomeScreen from '@/components/HomeScreen';
import GamePlay from '@/components/GamePlay';
import StageMap from '@/components/StageMap';

/* ── 뷰 상태 타입 ─────────────────────────────────────────── */
type View = 'home' | 'daily' | 'stagemap' | 'stage';

interface StageCtx {
  stageNumber: number;
}

export default function RootPage() {
  const [mounted, setMounted] = useState(false);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [view, setView] = useState<View>('home');
  const [stageCtx, setStageCtx] = useState<StageCtx>({ stageNumber: 1 });

  useEffect(() => {
    setMounted(true);
    setDaily(getDaily());
  }, []);

  if (!mounted || !daily) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: 'var(--bg-base)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 22, color: 'var(--text-muted)' }}>로딩 중...</div>
      </div>
    );
  }

  /* ── 홈 ─────────────────────────────────────────────────── */
  if (view === 'home') {
    return (
      <HomeScreen
        daily={daily}
        onPlayDaily={() => setView('daily')}
        onPlayStage={() => setView('stagemap')}
      />
    );
  }

  /* ── 데일리 게임 ─────────────────────────────────────────── */
  if (view === 'daily') {
    return (
      <GamePlay
        rule={daily.rule}
        seed={daily.seed}
        mode="daily"
        meta={{
          puzzleNumber: daily.puzzleNumber,
          weekday: daily.weekday,
          dateStr: daily.dateStr,
        }}
        onBack={() => setView('home')}
        onStageList={() => setView('stagemap')}
      />
    );
  }

  /* ── 스테이지 맵 ─────────────────────────────────────────── */
  if (view === 'stagemap') {
    return (
      <StageMap
        onBack={() => setView('home')}
        onSelectStage={(n) => {
          setStageCtx({ stageNumber: n });
          setView('stage');
        }}
      />
    );
  }

  /* ── 스테이지 게임 ─────────────────────────────────────────── */
  if (view === 'stage') {
    const rule = getStageRule(stageCtx.stageNumber);
    if (!rule) {
      // 잘못된 번호 → 스테이지 맵으로 복귀
      setView('stagemap');
      return null;
    }
    const seed = stageSeed(stageCtx.stageNumber);
    return (
      <GamePlay
        key={stageCtx.stageNumber} // 스테이지 전환 시 상태 리셋
        rule={rule}
        seed={seed}
        mode="stage"
        meta={{ stageNumber: stageCtx.stageNumber }}
        onBack={() => setView('stagemap')}
        onNextStage={(n) => setStageCtx({ stageNumber: n })}
        onStageList={() => setView('stagemap')}
      />
    );
  }

  return null;
}
