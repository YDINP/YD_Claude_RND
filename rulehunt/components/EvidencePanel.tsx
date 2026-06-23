'use client';

import { useMemo, useState } from 'react';
import type { RuleDef } from '@/lib/types';
import { generateExamples } from '@/lib/examples';
import ExampleBoard from './ExampleBoard';

interface EvidencePanelProps {
  rule: RuleDef;
  seed: number;
}

/**
 * 증거 패널.
 * ✓ 예시 3개 + ✗ 예시 2개를 가로 스크롤 카드로 제공.
 * 플레이어가 이 패턴들을 비교하여 규칙을 추론한다.
 */
export default function EvidencePanel({ rule, seed }: EvidencePanelProps) {
  const [expanded, setExpanded] = useState(true);

  const examples = useMemo(
    () => generateExamples(rule, seed),
    [rule, seed]
  );

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

      {/* 예시 카드 영역 */}
      {expanded && (
        <div
          style={{
            padding: '10px 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {/* ✓ 준수 예시 */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--feedback-pass)',
                marginBottom: 6,
              }}
            >
              규칙을 따르는 예시
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none',
              }}
            >
              {examples.valid.map((board, i) => (
                <ExampleBoard key={`valid-${i}`} board={board} valid={true} />
              ))}
              {examples.valid.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>생성 중...</span>
              )}
            </div>
          </div>

          {/* 구분선 */}
          <div
            style={{
              height: 1,
              background: 'var(--border-subtle)',
            }}
          />

          {/* ✗ 위반 예시 */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--feedback-fail)',
                marginBottom: 6,
              }}
            >
              규칙을 어기는 예시
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                paddingBottom: 4,
                scrollbarWidth: 'none',
              }}
            >
              {examples.invalid.map((board, i) => (
                <ExampleBoard key={`invalid-${i}`} board={board} valid={false} />
              ))}
              {examples.invalid.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>생성 중...</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
