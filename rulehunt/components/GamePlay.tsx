'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Board as BoardType, Tile, Color, Shape, RuleDef } from '@/lib/types';
import { COLORS, SHAPES } from '@/lib/types';
import {
  createBoard,
  placeTile,
  evaluate,
  isClear,
  isFull,
  starRating,
} from '@/lib/engine';
import type { Feedback } from '@/lib/engine';
import {
  recordResult,
  recordStageClear,
  effectiveStreak,
  getDayResult,
} from '@/lib/storage';
import { buildShareText } from '@/lib/share';
import { msUntilNextKstMidnight } from '@/lib/daily';
import { TOTAL_STAGES } from '@/lib/stages';

import Board from '@/components/Board';
import Tray from '@/components/Tray';
import EvidencePanel from '@/components/EvidencePanel';

/* ── 요일 라벨 ─────────────────────────────────────────── */
const WEEKDAY_LABEL: Record<number, string> = {
  0: '복합',
  1: '색',
  2: '모양',
  3: '위치',
  4: '인접',
  5: '복합',
  6: '패턴',
};

/* ── 힌트 토스트 ─────────────────────────────────────────── */
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

/* ── 간단 토스트 (25칸 미완성 알림) ─────────────────────────── */
function InfoToast({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
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
        border: '1px solid var(--border-strong)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

/* ── 결과 모달 ─────────────────────────────────────────────── */
interface ResultModalProps {
  mode: 'daily' | 'stage';
  submitCount: number;
  feedback: Feedback;
  rule: RuleDef;
  // daily 전용
  puzzleNumber?: number;
  dateStr?: string;
  // stage 전용
  stageNumber?: number;
  totalStages?: number;
  // 공유 관련
  onClose: () => void;
  onNextStage?: () => void;
  onStageList?: () => void;
}

function ResultModal({
  mode,
  submitCount,
  feedback,
  rule,
  puzzleNumber,
  dateStr,
  stageNumber,
  totalStages,
  onClose,
  onNextStage,
  onStageList,
}: ResultModalProps) {
  const stars = starRating(submitCount);
  const [copied, setCopied] = useState(false);
  const [remainMs, setRemainMs] = useState(() => msUntilNextKstMidnight());
  const [starsAnimated, setStarsAnimated] = useState<number[]>([]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemainMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let i = 0;
    const show = () => {
      i++;
      setStarsAnimated(Array.from({ length: i }, (_, k) => k));
      if (i < stars) setTimeout(show, 200);
    };
    const t = setTimeout(show, 300);
    return () => clearTimeout(t);
  }, [stars]);

  const formatCountdown = (ms: number) => {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleShare = useCallback(async () => {
    if (mode !== 'daily' || !dateStr || !puzzleNumber) return;
    const streak = effectiveStreak(dateStr);
    const text = buildShareText({
      puzzleNumber,
      attempts: submitCount,
      streak,
      cleared: true,
      feedback,
      url: 'rulehunt.today',
    });
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // share 취소
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 무시
    }
  }, [mode, dateStr, puzzleNumber, submitCount, feedback]);

  const hasNextStage = stageNumber != null && totalStages != null && stageNumber < totalStages;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="클리어 결과"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
        padding: '0 0 env(safe-area-inset-bottom, 0)',
      }}
    >
      <div
        className="animate-modal-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          padding: '28px 24px 36px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          border: '1px solid var(--border-subtle)',
          borderBottom: 'none',
        }}
      >
        {/* 헤더 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🎉</div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--text-primary)',
              letterSpacing: '-0.04em',
              marginBottom: 4,
            }}
          >
            규칙 해독 완료!
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {mode === 'daily'
              ? `#${puzzleNumber} · 제출 ${submitCount}회`
              : `스테이지 ${stageNumber} · 제출 ${submitCount}회`}
          </p>
        </div>

        {/* 별 등급 */}
        <div
          style={{ display: 'flex', justifyContent: 'center', gap: 8 }}
          aria-label={`${stars}성 달성`}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={starsAnimated.includes(i) ? 'animate-star-pop' : ''}
              style={{
                fontSize: 36,
                opacity: starsAnimated.includes(i) ? 1 : 0.15,
                filter: i < stars ? 'none' : 'grayscale(1)',
                display: 'inline-block',
              }}
              aria-hidden="true"
            >
              ⭐
            </span>
          ))}
        </div>

        {/* 규칙 공개 */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 8,
            }}
          >
            숨겨진 규칙
          </div>
          <p
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
              letterSpacing: '-0.02em',
            }}
          >
            {rule.reveal}
          </p>
        </div>

        {/* daily: 카운트다운 + 공유 */}
        {mode === 'daily' && (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>다음 규칙까지</span>
              <span
                className="font-mono-num"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '0.06em',
                }}
              >
                {formatCountdown(remainMs)}
              </span>
            </div>
            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: copied ? 'var(--feedback-pass)' : 'var(--text-primary)',
                color: copied ? '#fff' : '#0d0d0d',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '-0.02em',
                transition: 'background 0.15s ease, color 0.15s ease',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{copied ? '✓' : '📤'}</span>
              <span>{copied ? '복사됨!' : '결과 공유'}</span>
            </button>
          </>
        )}

        {/* stage: 다음 스테이지 / 목록 버튼 */}
        {mode === 'stage' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hasNextStage && (
              <button
                onClick={onNextStage}
                style={{
                  padding: '14px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  background: 'var(--text-primary)',
                  color: '#0d0d0d',
                  fontSize: 14,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  letterSpacing: '-0.02em',
                  outline: 'none',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                다음 스테이지 →
              </button>
            )}
            <button
              onClick={onStageList}
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                letterSpacing: '-0.02em',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              스테이지 목록으로
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── GamePlay 메인 컴포넌트 ─────────────────────────────────── */

type DailyMeta = {
  puzzleNumber: number;
  weekday: number;
  dateStr: string;
};

type StageMeta = {
  stageNumber: number;
};

interface GamePlayProps {
  rule: RuleDef;
  seed: number;
  mode: 'daily' | 'stage';
  meta: DailyMeta | StageMeta;
  onBack: () => void;
  onNextStage?: (n: number) => void;
  onStageList?: () => void;
}

export default function GamePlay({
  rule,
  seed,
  mode,
  meta,
  onBack,
  onNextStage,
  onStageList,
}: GamePlayProps) {
  const dailyMeta = mode === 'daily' ? (meta as DailyMeta) : null;
  const stageMeta = mode === 'stage' ? (meta as StageMeta) : null;

  /* 초기 상태: 이미 오늘 클리어했으면 cleared=true */
  const initCleared = mode === 'daily' && dailyMeta
    ? getDayResult(dailyMeta.dateStr)?.cleared ?? false
    : false;

  const [board, setBoard] = useState<BoardType>(() => createBoard());
  const [brush, setBrush] = useState<{ color: Color; shape: Shape }>({
    color: COLORS[0],
    shape: SHAPES[0],
  });
  // 피드백: null = 중립 (빌드 중), 제출 후에만 위반 표시
  const [feedback, setFeedback] = useState<Feedback>(() =>
    Array.from({ length: 5 }, () => Array(5).fill(null))
  );
  const [submitCount, setSubmitCount] = useState(0);
  const [cleared, setCleared] = useState(initCleared);
  const [hintsShown, setHintsShown] = useState(0);
  const [activeHint, setActiveHint] = useState<string | null>(null);
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const [lastViolated, setLastViolated] = useState<{ r: number; c: number } | null>(null);
  const [showResult, setShowResult] = useState(initCleared);

  const clearedRef = useRef(initCleared);

  const streak = mode === 'daily' && dailyMeta ? effectiveStreak(dailyMeta.dateStr) : 0;

  /* 보드 탭 핸들러 */
  const handleCellTap = useCallback(
    (r: number, c: number) => {
      if (cleared) return;
      const currentCell = board[r][c];
      let nextBoard: BoardType;
      if (currentCell) {
        nextBoard = placeTile(board, r, c, null);
      } else {
        const tile: Tile = { color: brush.color, shape: brush.shape };
        nextBoard = placeTile(board, r, c, tile);
      }
      setBoard(nextBoard);
      // 편집 시 직전 제출 피드백 해제 → 중립 복귀
      setFeedback(Array.from({ length: 5 }, () => Array(5).fill(null)));
      setLastViolated(null);
    },
    [board, brush, cleared]
  );

  /* 제출 핸들러 */
  const handleSubmit = useCallback(() => {
    if (cleared) return;
    if (!isFull(board)) {
      setInfoToast('25칸을 모두 채운 뒤 제출하세요');
      return;
    }
    const nextSubmit = submitCount + 1;
    setSubmitCount(nextSubmit);

    // evaluate: true=준수, false=위반
    const fb = evaluate(board, rule);
    setFeedback(fb);

    if (isClear(board, rule)) {
      // 클리어
      clearedRef.current = true;
      setCleared(true);
      setShowResult(true);
      if (mode === 'daily' && dailyMeta) {
        recordResult(dailyMeta.dateStr, nextSubmit, true);
      } else if (mode === 'stage' && stageMeta) {
        recordStageClear(stageMeta.stageNumber, nextSubmit);
      }
    } else {
      // 위반 칸 흔들림 트리거: 첫 위반 칸 찾기
      let found = false;
      outer: for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (fb[r][c] === false) {
            setLastViolated({ r, c });
            found = true;
            break outer;
          }
        }
      }
      if (!found) setLastViolated(null);
    }
  }, [board, cleared, submitCount, rule, mode, dailyMeta, stageMeta]);

  /* 힌트 */
  const handleHint = useCallback(() => {
    if (cleared || hintsShown >= 3) return;
    setActiveHint(rule.hints[hintsShown]);
    setHintsShown((p) => p + 1);
  }, [cleared, hintsShown, rule]);

  const hintAvailable = !cleared && hintsShown < 3;

  const modeLabel =
    mode === 'daily' && dailyMeta
      ? `#${dailyMeta.puzzleNumber} · ${WEEKDAY_LABEL[dailyMeta.weekday] ?? '규칙'}의 날`
      : `스테이지 ${stageMeta?.stageNumber}`;

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      {/* 상단 HUD */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '460px',
          padding: '10px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: 8,
        }}
      >
        {/* 뒤로가기 */}
        <button
          onClick={onBack}
          aria-label="뒤로 가기"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            flexShrink: 0,
          }}
        >
          ← 홈
        </button>

        {/* 가운데: 모드 라벨 + 제출횟수 + 스트릭 */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            flex: 1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              letterSpacing: '-0.02em',
              textAlign: 'center',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {modeLabel}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {submitCount}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>회 제출</span>
            </div>
            {mode === 'daily' && streak > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '2px 7px',
                  borderRadius: 20,
                  background: 'rgba(234,179,8,0.1)',
                  border: '1px solid rgba(234,179,8,0.25)',
                }}
              >
                <span style={{ fontSize: 12 }}>🔥</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#eab308',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {streak}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 힌트 버튼 */}
        <button
          onClick={handleHint}
          disabled={!hintAvailable}
          aria-label={
            cleared
              ? '클리어 완료'
              : hintsShown >= 3
              ? '힌트를 모두 사용했습니다'
              : `힌트 보기 (${hintsShown}/3)`
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-default)',
            background: hintAvailable ? 'var(--bg-elevated)' : 'transparent',
            color: hintAvailable ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: hintAvailable ? 'pointer' : 'not-allowed',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'opacity 0.12s ease',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            opacity: hintAvailable ? 1 : 0.4,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13 }}>💡</span>
          <span>{hintsShown}/3</span>
        </button>
      </header>

      {/* 본문 */}
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '16px 16px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          flex: 1,
        }}
      >
        {/* 증거 패널 */}
        <EvidencePanel rule={rule} seed={seed} />

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

        {/* 제출 버튼 */}
        {!cleared && (
          <button
            onClick={handleSubmit}
            aria-label="보드 제출"
            style={{
              width: '100%',
              maxWidth: '320px',
              padding: '15px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--text-primary)',
              color: '#0d0d0d',
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '-0.02em',
              outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              transition: 'opacity 0.12s ease',
            }}
          >
            제출
          </button>
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
            <p style={{ fontSize: 13, color: 'var(--feedback-pass)', fontWeight: 600 }}>
              {mode === 'daily' ? '내일 새로운 규칙이 공개됩니다 🎉' : '스테이지 클리어! 🎉'}
            </p>
          </div>
        )}
      </div>

      {/* 힌트 토스트 */}
      {activeHint && (
        <HintToast text={activeHint} onDone={() => setActiveHint(null)} />
      )}

      {/* 미완성 토스트 */}
      {infoToast && (
        <InfoToast text={infoToast} onDone={() => setInfoToast(null)} />
      )}

      {/* 결과 모달 */}
      {showResult && (
        <ResultModal
          mode={mode}
          submitCount={submitCount}
          feedback={feedback}
          rule={rule}
          puzzleNumber={dailyMeta?.puzzleNumber}
          dateStr={dailyMeta?.dateStr}
          stageNumber={stageMeta?.stageNumber}
          totalStages={TOTAL_STAGES}
          onClose={() => setShowResult(false)}
          onNextStage={
            stageMeta && onNextStage
              ? () => onNextStage(stageMeta.stageNumber + 1)
              : undefined
          }
          onStageList={onStageList}
        />
      )}
    </div>
  );
}
