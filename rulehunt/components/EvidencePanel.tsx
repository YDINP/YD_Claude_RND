'use client';

import { useMemo, useState, useCallback } from 'react';
import type { RuleDef } from '@/lib/types';
import { generateExamples } from '@/lib/examples';
import ExampleBoard from './ExampleBoard';

interface EvidencePanelProps {
  rule: RuleDef;
  seed: number;
}

/**
 * 증거 패널 — 캐러셀 방식.
 * ✓ 예시 먼저, ✗ 예시 나중 순서로 1개씩 표시.
 * ‹ › 버튼으로 순환 이동.
 */
export default function EvidencePanel({ rule, seed }: EvidencePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);

  const examples = useMemo(
    () => generateExamples(rule, seed),
    [rule, seed]
  );

  // 대조쌍을 인접 배치: ✓1, ✗1, ✓2, ✗2 … (한 칸만 다른 쌍을 ‹›로 바로 비교)
  const allItems = useMemo(() => {
    const out: { board: (typeof examples.valid)[number]; valid: boolean; pair: number }[] = [];
    const maxLen = Math.max(examples.valid.length, examples.invalid.length);
    for (let i = 0; i < maxLen; i++) {
      if (examples.valid[i]) out.push({ board: examples.valid[i], valid: true, pair: i });
      if (examples.invalid[i]) out.push({ board: examples.invalid[i], valid: false, pair: i });
    }
    return out;
  }, [examples]);

  const total = allItems.length;

  const goNext = useCallback(() => {
    setCurrentIdx((prev) => (prev + 1) % total);
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIdx((prev) => (prev - 1 + total) % total);
  }, [total]);

  const current = allItems[currentIdx] ?? null;
  const isValid = current ? current.valid : true;
  const typeLabel = isValid ? '✓ 통과 예시' : '✗ 위반 예시';
  const accentColor = isValid ? 'var(--feedback-pass)' : 'var(--feedback-fail)';
  const pairNo = current ? current.pair + 1 : 1;

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '460px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}
    >
      {/* 헤더 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label="증거 패널 펼치기/접기"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '10px 14px',
          background: 'transparent',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none',
          cursor: 'pointer',
          outline: 'none',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🔎</span>
          <div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
              }}
            >
              증거 보드
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginLeft: 6,
              }}
            >
              패턴을 비교해 규칙을 추론하세요
            </span>
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
          }}
        >
          ▾
        </span>
      </button>

      {/* 캐러셀 본문 */}
      {expanded && total > 0 && (
        <div
          style={{
            padding: '14px 14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* 타입 라벨 + 인덱스 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: accentColor,
                transition: 'color 0.2s ease',
              }}
            >
              {typeLabel}
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              대조쌍 {pairNo}
              <span style={{ marginLeft: 6, color: 'var(--border-default)' }}>·</span>
              <span style={{ marginLeft: 6 }}>
                {currentIdx + 1} / {total}
              </span>
            </span>
          </div>

          {/* 비교 안내 */}
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              textAlign: 'center',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            ‹ › 로 통과·위반을 비교하세요 — 짝꿍 예시와 <strong style={{ color: 'var(--text-secondary)' }}>딱 한 칸</strong>만 다릅니다
          </p>

          {/* 보드 + 네비 버튼 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            {/* 이전 버튼 */}
            <button
              onClick={goPrev}
              aria-label="이전 예시"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 16,
                cursor: 'pointer',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
                transition: 'background 0.12s ease, opacity 0.12s ease',
              }}
            >
              ‹
            </button>

            {/* 현재 보드 — 가운데 정렬 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                flex: 1,
                minWidth: 0,
              }}
            >
              {current && (
                <ExampleBoard
                  board={current.board}
                  valid={current.valid}
                  size={200}
                />
              )}
            </div>

            {/* 다음 버튼 */}
            <button
              onClick={goNext}
              aria-label="다음 예시"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: '1px solid var(--border-default)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: 16,
                cursor: 'pointer',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
                transition: 'background 0.12s ease, opacity 0.12s ease',
              }}
            >
              ›
            </button>
          </div>

          {/* 도트 인디케이터 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 5,
            }}
            aria-hidden="true"
          >
            {allItems.map((item, i) => (
              <button
                key={i}
                onClick={() => setCurrentIdx(i)}
                aria-label={`${i + 1}번 예시로 이동`}
                style={{
                  width: i === currentIdx ? 18 : 6,
                  height: 6,
                  borderRadius: 9999,
                  border: 'none',
                  background:
                    i === currentIdx
                      ? item.valid
                        ? 'var(--feedback-pass)'
                        : 'var(--feedback-fail)'
                      : 'var(--border-default)',
                  padding: 0,
                  cursor: 'pointer',
                  outline: 'none',
                  transition: 'width 0.2s ease, background 0.2s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* 데이터 없을 때 */}
      {expanded && total === 0 && (
        <div style={{ padding: '14px', textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>생성 중...</span>
        </div>
      )}
    </div>
  );
}
