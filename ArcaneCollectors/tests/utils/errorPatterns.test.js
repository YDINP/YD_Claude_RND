/**
 * errorPatterns.test.js
 * Tests for error pattern detection in GameLogger
 * QAT-LOG-1: 10 tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import GameLogger from '../../src/utils/GameLogger.js';
import { ERROR_PATTERNS, detectErrorPatterns, assertNoErrors, getErrorSummary } from '../helpers/errorDetector.js';

describe('Error Pattern Detection', () => {
  beforeEach(() => {
    // Clear history before each test
    GameLogger._history = [];
    GameLogger.setEnabled(true);
  });

  describe('GameLogger error-level log capture', () => {
    it('captures logs to history', () => {
      GameLogger.log('BATTLE', 'Test message', { value: 123 });

      const history = GameLogger.getHistory();

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].category).toBe('BATTLE');
      expect(history[0].message).toBe('Test message');
    });

    it('maintains log history up to max limit', () => {
      const maxHistory = GameLogger._maxHistory;

      // Enable DATA category for this test
      GameLogger.enable('DATA');

      for (let i = 0; i < maxHistory + 10; i++) {
        GameLogger.log('DATA', `Log ${i}`);
      }

      expect(GameLogger._history.length).toBe(maxHistory);
    });

    it('captures data along with messages', () => {
      const testData = { error: 'TypeError: foo is not a function' };
      GameLogger.log('BATTLE', 'Error occurred', testData);

      const history = GameLogger.getHistory();
      const lastEntry = history[history.length - 1];

      expect(lastEntry.data).toEqual(testData);
    });
  });

  describe('Error pattern detection utility', () => {
    it('detects TypeError pattern', () => {
      const logs = [
        { category: 'BATTLE', message: 'TypeError: Cannot read property', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].pattern).toContain('TypeError');
    });

    it('detects ReferenceError pattern', () => {
      const logs = [
        { category: 'GACHA', message: 'ReferenceError: x is not defined', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('detects NaN pattern', () => {
      const logs = [
        { category: 'ENERGY', message: 'Calculation resulted in NaN', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('detects "undefined is not" pattern', () => {
      const logs = [
        { category: 'SKILL', message: 'undefined is not a function', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('detects "Cannot read properties of" pattern', () => {
      const logs = [
        { category: 'PARTY', message: 'Cannot read properties of null', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors.length).toBeGreaterThan(0);
    });

    it('returns empty array for clean logs', () => {
      const logs = [
        { category: 'SAVE', message: 'Data saved successfully', data: { gold: 100 } },
        { category: 'BATTLE', message: 'Battle started', data: null }
      ];

      const errors = detectErrorPatterns(logs);

      expect(errors).toEqual([]);
    });
  });

  describe('assertNoErrors utility', () => {
    it('passes for clean logs', () => {
      const logs = [
        { category: 'SAVE', message: 'Save completed', data: null }
      ];

      expect(() => assertNoErrors(logs)).not.toThrow();
    });

    it('throws when errors are detected', () => {
      const logs = [
        { category: 'BATTLE', message: 'TypeError occurred', data: null }
      ];

      expect(() => assertNoErrors(logs)).toThrow('Error patterns detected');
    });
  });

  describe('Error summary utility', () => {
    it('provides summary of detected errors', () => {
      const logs = [
        { category: 'A', message: 'TypeError here', data: null },
        { category: 'B', message: 'ReferenceError there', data: null },
        { category: 'C', message: 'Another TypeError', data: null }
      ];

      const summary = getErrorSummary(logs);

      expect(summary.totalErrors).toBeGreaterThan(0);
      expect(summary.byPattern).toBeDefined();
    });
  });
});
