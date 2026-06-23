'use client';

import { useEffect, useState, useCallback } from 'react';
import type { RuleDef } from '@/lib/types';
import type { Feedback } from '@/lib/engine';
import { starRating } from '@/lib/engine';
import { buildShareText } from '@/lib/share';
import { effectiveStreak } from '@/lib/storage';

interface ResultModalProps {
  puzzleNumber: number;
  mistakes: number;
  feedback: Feedback;
  rule: RuleDef;
  dateStr: string;
  msUntilNext: number;
}

export default function ResultModal({
  puzzleNumber,
  mistakes,
  feedback,
  rule,
  dateStr,
  msUntilNext: initialMs,
}: ResultModalProps) {
  const stars = starRating(mistakes);
  const [copied, setCopied] = useState(false);
  const [remainMs, setRemainMs] = useState(initialMs);
  const [starsAnimated, setStarsAnimated] = useState<number[]>([]);

  // 카운트다운
  useEffect(() => {
    const id = setInterval(() => {
      setRemainMs((prev) => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // 별 순차 등장 애니메이션
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
    const streak = effectiveStreak(dateStr);
    const text = buildShareText({
      puzzleNumber,
      attempts: mistakes,
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
        // share 취소 — 클립보드로 fallback
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 실패 무시
    }
  }, [puzzleNumber, mistakes, feedback, dateStr]);

  const starLabels = ['★', '★', '★'];

  return (
    /* 오버레이 */
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
      {/* 패널 */}
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
          gap: 20,
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
            #{puzzleNumber} · 시도 {mistakes}회
          </p>
        </div>

        {/* 별 등급 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 8,
          }}
          aria-label={`${stars}성 달성`}
        >
          {starLabels.map((_, i) => (
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
            오늘의 숨겨진 규칙
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

        {/* 카운트다운 */}
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

        {/* 공유 버튼 */}
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
      </div>
    </div>
  );
}
