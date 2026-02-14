/**
 * EventBus.test.js
 * Unit tests for EventBus - 게임 전역 이벤트 시스템
 * 16 tests total
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus, GameEvents, EventUtils } from '../../src/systems/EventBus.js';

describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  describe('on', () => {
    it('registers event listener', () => {
      const callback = vi.fn();
      EventBus.on('test_event', callback);

      EventBus.emit('test_event', { data: 'test' });

      expect(callback).toHaveBeenCalledWith({ data: 'test' });
    });

    it('returns unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = EventBus.on('test_event', callback);

      unsubscribe();
      EventBus.emit('test_event', { data: 'test' });

      expect(callback).not.toHaveBeenCalled();
    });

    it('allows multiple listeners for same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('test_event', callback1);
      EventBus.on('test_event', callback2);
      EventBus.emit('test_event', {});

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('once', () => {
    it('registers one-time listener', () => {
      const callback = vi.fn();
      EventBus.once('test_event', callback);

      EventBus.emit('test_event', {});
      EventBus.emit('test_event', {});

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('removes listener after first call', () => {
      const callback = vi.fn();
      EventBus.once('test_event', callback);

      EventBus.emit('test_event', {});

      expect(EventBus.listenerCount('test_event')).toBe(0);
    });
  });

  describe('off', () => {
    it('removes specific listener', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('test_event', callback1);
      EventBus.on('test_event', callback2);

      EventBus.off('test_event', callback1);
      EventBus.emit('test_event', {});

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('offAll', () => {
    it('removes all listeners for event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('test_event', callback1);
      EventBus.on('test_event', callback2);

      EventBus.offAll('test_event');
      EventBus.emit('test_event', {});

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('emit', () => {
    it('calls all registered listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      EventBus.on('test_event', callback1);
      EventBus.on('test_event', callback2);

      EventBus.emit('test_event', { value: 42 });

      expect(callback1).toHaveBeenCalledWith({ value: 42 });
      expect(callback2).toHaveBeenCalledWith({ value: 42 });
    });

    it('handles listener errors gracefully', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Test error');
      });
      const normalCallback = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      EventBus.on('test_event', errorCallback);
      EventBus.on('test_event', normalCallback);

      EventBus.emit('test_event', {});

      expect(consoleError).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('does nothing for unregistered events', () => {
      expect(() => {
        EventBus.emit('unknown_event', {});
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('removes all listeners', () => {
      EventBus.on('event1', vi.fn());
      EventBus.on('event2', vi.fn());

      EventBus.clear();

      expect(EventBus.listenerCount('event1')).toBe(0);
      expect(EventBus.listenerCount('event2')).toBe(0);
    });
  });

  describe('listenerCount', () => {
    it('returns correct count of listeners', () => {
      EventBus.on('test_event', vi.fn());
      EventBus.on('test_event', vi.fn());
      EventBus.once('test_event', vi.fn());

      expect(EventBus.listenerCount('test_event')).toBe(3);
    });

    it('returns 0 for unregistered event', () => {
      expect(EventBus.listenerCount('unknown')).toBe(0);
    });
  });

  describe('getEventNames', () => {
    it('returns list of registered events', () => {
      EventBus.on('event1', vi.fn());
      EventBus.on('event2', vi.fn());
      EventBus.once('event3', vi.fn());

      const names = EventBus.getEventNames();

      expect(names).toContain('event1');
      expect(names).toContain('event2');
      expect(names).toContain('event3');
    });

    it('returns unique event names', () => {
      EventBus.on('test_event', vi.fn());
      EventBus.once('test_event', vi.fn());

      const names = EventBus.getEventNames();
      const count = names.filter(n => n === 'test_event').length;

      expect(count).toBe(1);
    });
  });

  describe('GameEvents constants', () => {
    it('defines all required event types', () => {
      expect(GameEvents.RESOURCE_CHANGED).toBe('resource_changed');
      expect(GameEvents.CHARACTER_ADDED).toBe('character_added');
      expect(GameEvents.BATTLE_START).toBe('battle_start');
      expect(GameEvents.BATTLE_END).toBe('battle_end');
      expect(GameEvents.LEVEL_UP).toBe('level_up');
      expect(GameEvents.QUEST_COMPLETE).toBe('quest_complete');
    });
  });
});

describe('EventUtils', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  describe('emitResourceChange', () => {
    it('emits resource change event', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.RESOURCE_CHANGED, callback);

      EventUtils.emitResourceChange('gold', 100, 1000);

      expect(callback).toHaveBeenCalledWith({
        type: 'gold',
        amount: 100,
        newTotal: 1000
      });
    });
  });

  describe('showToast', () => {
    it('emits toast show event with defaults', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.TOAST_SHOW, callback);

      EventUtils.showToast('Test message');

      expect(callback).toHaveBeenCalledWith({
        message: 'Test message',
        type: 'info',
        duration: 3000
      });
    });

    it('accepts custom type and duration', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.TOAST_SHOW, callback);

      EventUtils.showToast('Error!', 'error', 5000);

      expect(callback).toHaveBeenCalledWith({
        message: 'Error!',
        type: 'error',
        duration: 5000
      });
    });
  });

  describe('emitError', () => {
    it('emits error event with Error object', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.ERROR_OCCURRED, callback);

      const error = new Error('Test error');
      EventUtils.emitError('TestSystem', error);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'TestSystem',
          message: 'Test error'
        })
      );
    });

    it('emits error event with string', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.ERROR_OCCURRED, callback);

      EventUtils.emitError('TestSystem', 'Error message');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'TestSystem',
          message: 'Error message'
        })
      );
    });
  });

  describe('setLoading', () => {
    it('emits loading start event', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.LOADING_START, callback);

      EventUtils.setLoading(true, 'battle');

      expect(callback).toHaveBeenCalledWith({ context: 'battle' });
    });

    it('emits loading end event', () => {
      const callback = vi.fn();
      EventBus.on(GameEvents.LOADING_END, callback);

      EventUtils.setLoading(false, 'battle');

      expect(callback).toHaveBeenCalledWith({ context: 'battle' });
    });
  });
});
