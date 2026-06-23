'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Board as BoardType, Tile, Color, Shape } from '@/lib/types';
import { COLORS, SHAPES } from '@/lib/types';
import { createBoard, placeTile, evaluate, isClear } from '@/lib/engine';
import type { Feedback } from '@/lib/engine';
import { getDaily } from '@/lib/daily';
import type { DailyInfo } from '@/lib/daily';
import { msUntilNextKstMidnight } from '@/lib/daily';
import { recordResult, effectiveStreak, getDayResult } from '@/lib/storage';

import Board from '@/components/Board';
import Tray from '@/components/Tray';
import Hud from '@/components/Hud';
import ResultModal from '@/components/ResultModal';

/* 요일 → 한국어 테마 라벨 */
const WEEKDAY_LABEL: Record<number, string> = {
  0: '복합',
  1: '색',
  2: '모양',
  3: '위치',
  4: '인접',
  5: '복합',
  6: '패턴',
};

const INTRO_KEY = 'rulehunt:seen-intro';

function IntroOverlay({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="게임 안내"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '24px 20px',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="animate-modal-in"
        style={{
          width: '100%',
          maxWidth: '360px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          padding: '28px 24px',
          border: '1px solid var(--border-default)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.04em',
              marginBottom: 6,
            }}
          >
            오늘의 규칙
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            매일 새로운 숨겨진 규칙이 주어집니다
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
          }}
        >
          {[
            { icon: '🎨', text: '색상과 모양을 선택해 5×5 보드를 채우세요' },
            { icon: '🟢', text: '초록 = 규칙 준수, 빨강 = 규칙 위반' },
            { icon: '💡', text: '힌트 버튼으로 단계적으로 규칙을 추론하세요' },
            { icon: '🏆', text: '25칸을 모두 올바르게 채우면 클리어!' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {text}
              </span>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          규칙은 직접 추론하세요.
          <br />
          클리어 전까지 규칙 내용은 공개되지 않습니다.
        </p>

        <button
          onClick={onDismiss}
          style={{
            padding: '13px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: 'var(--text-primary)',
            color: '#0d0d0d',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            letterSpacing: '-0.02em',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          시작하기
        </button>
      </div>
    </div>
  );
}

/* 힌트 토스트 */
function HintToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="animate-fade-in"
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        maxWidth: '360px',
        width: 'calc(100% - 40px)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

export default function GamePage() {
  const [mounted, setMounted] = useState(false);
  const [daily, setDaily] = useState<DailyInfo | null>(null);
  const [board, setBoard] = useState<BoardType>(() => createBoard());
  const [brush, setBrush] = useState<{ color: Color; shape: Shape }>({
    color: COLORS[0],
    shape: SHAPES[0],
  });
  const [feedback, setFeedback] = useState<Feedback>([
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
    [null, null, null, null, null],
  ]);
  const [mistakes, setMistakes] = useState(0);
  const [cleared, setCleared] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [lastViolated, setLastViolated] = useState<{ r: number; c: number } | null>(null);
  const [msUntilNext, setMsUntilNext] = useState(0);
  const clearedRef = useRef(false);

  // 마운트 + 데일리 초기화
  useEffect(() => {
    setMounted(true);
    const d = getDaily();
    setDaily(d);
    setMsUntilNext(msUntilNextKstMidnight());

    // 이미 오늘 플레이했는지 확인
    const prev = getDayResult(d.dateStr);
    if (prev?.cleared) {
      setCleared(true);
      clearedRef.current = true;
      setMistakes(prev.attempts);
    }

    // 인트로 확인
    try {
      const seen = localStorage.getItem(INTRO_KEY);
      if (!seen) setShowIntro(true);
    } catch {
      // localStorage 없음 무시
    }
  }, []);

  const dismissIntro = useCallback(() => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      // ignore
    }
  }, []);

  const handleCellTap = useCallback(
    (r: number, c: number) => {
      if (!daily || cleared) return;
      const { rule } = daily;
      const currentCell = board[r][c];

      let nextBoard: BoardType;
      if (currentCell) {
        // 채워진 칸 → 제거
        nextBoard = placeTile(board, r, c, null);
      } else {
        // 빈 칸 → 브러시 타일 배치
        const tile: Tile = { color: brush.color, shape: brush.shape };
        nextBoard = placeTile(board, r, c, tile);
        // 배치 직후 이 칸이 위반이면 mistakes++
        const isViolation = rule.cellViolates(nextBoard, r, c);
        if (isViolation) {
          setMistakes((prev) => prev + 1);
          setLastViolated({ r, c });
        } else {
          setLastViolated(null);
        }
      }

      const nextFeedback = evaluate(nextBoard, rule);
      setBoard(nextBoard);
      setFeedback(nextFeedback);

      // 클리어 판정
      if (!clearedRef.current && isClear(nextBoard, rule)) {
        clearedRef.current = true;
        setCleared(true);
        const finalMistakes = mistakes + (currentCell ? 0 : rule.cellViolates(nextBoard, r, c) ? 1 : 0);
        recordResult(daily.dateStr, finalMistakes, true);
        setMsUntilNext(msUntilNextKstMidnight());
      }
    },
    [board, brush, cleared, daily, mistakes]
  );

  const handleHint = useCallback(() => {
    if (!daily || hintsShown >= 3 || cleared) return;
    const hint = daily.rule.hints[hintsShown];
    setActiveHint(hint);
    setHintsShown((prev) => prev + 1);
  }, [daily, hintsShown, cleared]);

  const streak = daily ? effectiveStreak(daily.dateStr) : 0;

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
        <div style={{ fontSize: 24, color: 'var(--text-muted)' }}>로딩 중...</div>
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* HUD */}
      <Hud
        puzzleNumber={daily.puzzleNumber}
        themeLabel={WEEKDAY_LABEL[daily.weekday] ?? '규칙'}
        mistakes={mistakes}
        streak={streak}
        hintsShown={hintsShown}
        onHintClick={handleHint}
        cleared={cleared}
      />

      {/* 게임 콘텐츠 */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '20px 20px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          flex: 1,
        }}
      >
        {/* 상태 메시지 */}
        <div
          style={{
            width: '100%',
            maxWidth: '320px',
            textAlign: 'center',
          }}
        >
          {cleared ? (
            <p style={{ fontSize: 13, color: 'var(--feedback-pass)', fontWeight: 600 }}>
              규칙을 해독했습니다! 🎉
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              타일을 배치해 숨겨진 규칙을 추론하세요
            </p>
          )}
        </div>

        {/* 보드 */}
        <Board
          board={board}
          feedback={feedback}
          onCellTap={handleCellTap}
          lastViolated={lastViolated}
        />

        {/* 트레이 */}
        {!cleared && (
          <div style={{ width: '100%' }}>
            <Tray brush={brush} onPick={setBrush} />
          </div>
        )}

        {/* 클리어 후 안내 */}
        {cleared && (
          <div
            style={{
              width: '100%',
              maxWidth: '320px',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.2)',
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              내일 새로운 규칙이 공개됩니다
            </p>
          </div>
        )}
      </div>

      {/* 인트로 오버레이 */}
      {showIntro && <IntroOverlay onDismiss={dismissIntro} />}

      {/* 힌트 토스트 */}
      {activeHint && (
        <HintToast text={activeHint} onDone={() => setActiveHint(null)} />
      )}

      {/* 결과 모달 */}
      {cleared && !showIntro && (
        <ResultModal
          puzzleNumber={daily.puzzleNumber}
          mistakes={mistakes}
          feedback={feedback}
          rule={daily.rule}
          dateStr={daily.dateStr}
          msUntilNext={msUntilNext}
        />
      )}
    </main>
  );
}
