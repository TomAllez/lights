import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFrame } from '../frame';

afterEach(() => vi.useRealTimers());

describe('Frame.age()', () => {
  it('returns elapsed ms since capture', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const frame = createFrame({ timestamp: 800, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

    expect(frame.age()).toBe(200);
  });

  it('returns 0 when measured at capture time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(500);

    const frame = createFrame({ timestamp: 500, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

    expect(frame.age()).toBe(0);
  });

  it('grows as time passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const frame = createFrame({ timestamp: 1000, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

    vi.advanceTimersByTime(250);
    expect(frame.age()).toBe(250);

    vi.advanceTimersByTime(250);
    expect(frame.age()).toBe(500);
  });
});
