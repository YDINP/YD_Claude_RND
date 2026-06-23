'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { buildPalette, answerFor } from '@/lib/phrasing';

interface SentenceBuilderProps {
  ruleId: string;
  seed: number;
  onSubmit: (sequence: string[]) => void;
  disabled?: boolean;
  /** 3회 이상 틀렸을 때 부분 힌트 개수 표시용 */
  partialHint?: number | null;
}

// 드래그 중 chip의 ghost 스타일 — inline 렌더링
function DragGhost({
  text,
  x,
  y,
}: {
  text: string;
  x: number;
  y: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%) scale(1.1)',
        zIndex: 9999,
        pointerEvents: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 14px',
        borderRadius: 9999,
        background: 'var(--bg-elevated)',
        border: '1.5px solid var(--border-strong)',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontWeight: 700,
        fontFamily: 'inherit',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        letterSpacing: '-0.01em',
        opacity: 0.95,
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

export default function SentenceBuilder({
  ruleId,
  seed,
  onSubmit,
  disabled = false,
  partialHint,
}: SentenceBuilderProps) {
  const palette = useMemo(() => buildPalette(ruleId, seed), [ruleId, seed]);
  const answerSlots = useMemo(() => answerFor(ruleId), [ruleId]);
  const answerLength = answerSlots.length;

  // slots: 각 슬롯에 칩 텍스트 or null
  const [slots, setSlots] = useState<(string | null)[]>(() =>
    Array(answerLength).fill(null)
  );

  // ruleId 바뀌면 슬롯 초기화
  useEffect(() => {
    setSlots(Array(answerLength).fill(null));
  }, [ruleId, answerLength]);

  // 드래그 상태
  const [dragging, setDragging] = useState<{
    text: string;
    source: { kind: 'palette'; idx: number } | { kind: 'slot'; idx: number };
    x: number;
    y: number;
  } | null>(null);

  // 드롭 대상 슬롯 인덱스 (hover)
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  // 슬롯 DOM ref 배열
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  // dragging ref — 이벤트 핸들러에서 최신 값 접근용
  const draggingRef = useRef(dragging);
  useEffect(() => {
    draggingRef.current = dragging;
  }, [dragging]);

  // 팔레트 칩이 슬롯에 사용됐는지 추적
  const usedChips = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of slots) {
      if (s != null) counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [slots]);

  // 팔레트 인덱스별 사용 여부 (중복 텍스트 대비)
  const paletteUsedSet = useMemo(() => {
    const used = new Set<number>();
    const remaining = { ...usedChips };
    for (let i = 0; i < palette.length; i++) {
      const chip = palette[i];
      if ((remaining[chip] ?? 0) > 0) {
        used.add(i);
        remaining[chip]--;
      }
    }
    return used;
  }, [palette, usedChips]);

  // 드롭 대상 슬롯 탐색 (pointer 좌표 → 슬롯 rect)
  const findSlotAt = useCallback((x: number, y: number): number | null => {
    for (let i = 0; i < slotRefs.current.length; i++) {
      const el = slotRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return i;
      }
    }
    return null;
  }, []);

  // window 레벨 pointermove/pointerup 등록 — wrapper 밖으로 벗어나도 안전
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      setDragging((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
      const target = findSlotAt(e.clientX, e.clientY);
      setDropTarget(target);
    };

    const onUp = (e: PointerEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      const targetIdx = findSlotAt(e.clientX, e.clientY);

      if (targetIdx != null) {
        setSlots((prev) => {
          const next = [...prev];
          const existing = next[targetIdx];
          next[targetIdx] = drag.text;
          if (drag.source.kind === 'slot' && drag.source.idx !== targetIdx && existing != null) {
            next[drag.source.idx] = existing;
          }
          return next;
        });
      }
      setDragging(null);
      setDropTarget(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [findSlotAt]);

  // 팔레트 칩 pointerdown → 드래그 시작
  const handlePalettePointerDown = useCallback(
    (e: React.PointerEvent, chipText: string, paletteIdx: number) => {
      if (disabled || paletteUsedSet.has(paletteIdx)) return;
      e.preventDefault();
      setDragging({
        text: chipText,
        source: { kind: 'palette', idx: paletteIdx },
        x: e.clientX,
        y: e.clientY,
      });
    },
    [disabled, paletteUsedSet]
  );

  // 슬롯 칩 pointerdown → 드래그 시작 (슬롯에서 뽑아내기)
  const handleSlotPointerDown = useCallback(
    (e: React.PointerEvent, slotIdx: number) => {
      if (disabled || slots[slotIdx] == null) return;
      e.preventDefault();
      const text = slots[slotIdx]!;
      // 슬롯에서 즉시 제거
      setSlots((prev) => {
        const next = [...prev];
        next[slotIdx] = null;
        return next;
      });
      setDragging({
        text,
        source: { kind: 'slot', idx: slotIdx },
        x: e.clientX,
        y: e.clientY,
      });
    },
    [disabled, slots]
  );

  // 팔레트 칩 탭(클릭) → 첫 번째 빈 슬롯에 배치
  const handlePaletteClick = useCallback(
    (chipText: string, paletteIdx: number) => {
      if (disabled || paletteUsedSet.has(paletteIdx) || dragging) return;
      setSlots((prev) => {
        const next = [...prev];
        const emptyIdx = next.findIndex((s) => s == null);
        if (emptyIdx !== -1) next[emptyIdx] = chipText;
        return next;
      });
    },
    [disabled, paletteUsedSet, dragging]
  );

  // 슬롯 칩 탭(클릭) → 슬롯에서 제거
  const handleSlotClick = useCallback(
    (slotIdx: number) => {
      if (disabled || dragging) return;
      setSlots((prev) => {
        const next = [...prev];
        next[slotIdx] = null;
        return next;
      });
    },
    [disabled, dragging]
  );

  const handleReset = useCallback(() => {
    if (disabled) return;
    setSlots(Array(answerLength).fill(null));
  }, [disabled, answerLength]);

  const isFull = slots.every((s) => s != null);
  const canSubmit = !disabled && isFull;

  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    // 슬롯 순서대로 칩 배열 전달
    onSubmit(slots as string[]);
  }, [canSubmit, slots, onSubmit]);

  return (
    <div
      style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {/* ── 해답 슬롯 영역 ── */}
      <div
        role="region"
        aria-label="규칙 문장 슬롯"
        style={{
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: `1px solid ${isFull ? 'var(--border-strong)' : 'var(--border-default)'}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          transition: 'border-color 0.15s ease',
          position: 'relative',
        }}
      >
        {/* 레이블 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden="true" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            ✍️
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            규칙 문장 조합
          </span>
          <span
            aria-live="polite"
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {slots.filter((s) => s != null).length} / {answerLength}
          </span>
        </div>

        {/* 슬롯들 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
            minHeight: 52,
          }}
        >
          {slots.map((chip, idx) => {
            const isDropTarget = dropTarget === idx;
            const isEmpty = chip == null;

            return (
              <div
                key={idx}
                ref={(el) => {
                  slotRefs.current[idx] = el;
                }}
                aria-label={isEmpty ? `슬롯 ${idx + 1} 비어있음` : `슬롯 ${idx + 1}: ${chip}`}
                style={{
                  minWidth: 72,
                  minHeight: 44,
                  borderRadius: 10,
                  border: isEmpty
                    ? `2px dashed ${isDropTarget ? 'var(--text-primary)' : 'var(--border-default)'}`
                    : `1.5px solid ${isDropTarget ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
                  background: isEmpty
                    ? isDropTarget
                      ? 'rgba(255,255,255,0.06)'
                      : 'transparent'
                    : isDropTarget
                    ? 'var(--bg-overlay)'
                    : 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'border-color 0.12s ease, background 0.12s ease',
                  position: 'relative',
                  cursor: chip != null && !disabled ? 'grab' : 'default',
                  boxSizing: 'border-box',
                  flexShrink: 0,
                  padding: '6px 10px',
                }}
                onPointerDown={
                  chip != null ? (e) => handleSlotPointerDown(e, idx) : undefined
                }
                onClick={chip != null ? () => handleSlotClick(idx) : undefined}
              >
                {isEmpty ? (
                  <span
                    style={{
                      fontSize: 11,
                      color: isDropTarget ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontStyle: 'italic',
                      userSelect: 'none',
                      transition: 'color 0.12s ease',
                    }}
                  >
                    단어
                  </span>
                ) : (
                  <>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.01em',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {chip}
                    </span>
                    {!disabled && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 4,
                          fontSize: 9,
                          color: 'var(--text-muted)',
                          lineHeight: 1,
                        }}
                      >
                        ✕
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* 빈 슬롯 있으면 안내 */}
        {!isFull && (
          <p
            style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            칩을 드래그하거나 탭해서 슬롯을 채우세요
          </p>
        )}
      </div>

      {/* 부분 정답 힌트 */}
      {partialHint != null && partialHint > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(234,179,8,0.08)',
            border: '1px solid rgba(234,179,8,0.2)',
            fontSize: 12,
            color: '#eab308',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          힌트: 정답과 같은 위치에 {partialHint}개 칩이 맞습니다
        </div>
      )}

      {/* ── 팔레트 ── */}
      <div
        role="group"
        aria-label="칩 팔레트 — 탭하거나 드래그해서 추가"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-overlay)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span
          style={{
            width: '100%',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 2,
            userSelect: 'none',
          }}
        >
          칩 팔레트
        </span>
        {palette.map((chip, idx) => {
          const isUsed = paletteUsedSet.has(idx);
          const isDraggingThis = dragging?.source.kind === 'palette' && dragging.source.idx === idx;

          return (
            <button
              key={idx}
              onPointerDown={
                !isUsed ? (e) => handlePalettePointerDown(e, chip, idx) : undefined
              }
              onClick={() => handlePaletteClick(chip, idx)}
              disabled={disabled || isUsed}
              aria-label={isUsed ? `"${chip}" — 이미 사용됨` : `"${chip}" 추가`}
              aria-pressed={isUsed}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 9999,
                border: `1px solid ${isUsed ? 'var(--border-subtle)' : 'var(--border-default)'}`,
                background: isUsed || isDraggingThis ? 'transparent' : 'var(--bg-elevated)',
                color: isUsed ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: isUsed || disabled ? 'not-allowed' : 'grab',
                minHeight: 40,
                opacity: isUsed || isDraggingThis ? 0.3 : 1,
                transition: 'opacity 0.15s ease, background 0.12s ease, color 0.12s ease',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                letterSpacing: '-0.01em',
                textDecoration: isUsed ? 'line-through' : 'none',
                userSelect: 'none',
                touchAction: 'none',
              }}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* 버튼 행 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleReset}
          disabled={disabled || slots.every((s) => s == null)}
          aria-label="선택 초기화"
          style={{
            flex: '0 0 auto',
            padding: '13px 18px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-default)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: disabled || slots.every((s) => s == null) ? 'not-allowed' : 'pointer',
            opacity: disabled || slots.every((s) => s == null) ? 0.4 : 1,
            transition: 'opacity 0.12s ease',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            letterSpacing: '-0.01em',
          }}
        >
          초기화
        </button>

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label={isFull ? '규칙 문장 제출' : `빈 슬롯 ${slots.filter((s) => s == null).length}개를 채워주세요`}
          title={!isFull ? `빈 슬롯 ${slots.filter((s) => s == null).length}개를 채워주세요` : undefined}
          style={{
            flex: 1,
            padding: '13px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            background: canSubmit ? 'var(--text-primary)' : 'var(--bg-elevated)',
            color: canSubmit ? '#0d0d0d' : 'var(--text-muted)',
            fontSize: 14,
            fontWeight: 800,
            fontFamily: 'inherit',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            letterSpacing: '-0.02em',
            transition: 'background 0.15s ease, color 0.15s ease, opacity 0.12s ease',
            outline: 'none',
            WebkitTapHighlightColor: 'transparent',
            opacity: canSubmit ? 1 : 0.5,
          }}
        >
          {isFull ? '제출' : `제출 (${slots.filter((s) => s != null).length}/${answerLength})`}
        </button>
      </div>

      {/* 드래그 ghost */}
      {dragging && <DragGhost text={dragging.text} x={dragging.x} y={dragging.y} />}
    </div>
  );
}
