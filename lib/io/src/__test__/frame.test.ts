import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFrame, FrameEvent } from '../frame';

afterEach(() => vi.useRealTimers());

describe('Frame.withEvents()', () => {
  const makeFrame = (events: FrameEvent[] = []) => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
    return createFrame({
      timestamp: 1000,
      duration: 33,
      metadata: { video: { offset: 0, size: 6 } },
      data,
      events,
    });
  };

  it('returns a new frame with the given events', () => {
    const original = makeFrame();
    const events: FrameEvent[] = [{ type: 'test', data: new Uint8Array([42]) }];
    const next = original.withEvents(events);
    expect(next.getEvents()).toEqual(events);
  });

  it('preserves timestamp, duration, and parts', () => {
    const original = makeFrame();
    const next = original.withEvents([]);
    expect(next.getTimestamp()).toBe(1000);
    expect(next.getDuration()).toBe(33);
    expect(next.getPartsName()).toEqual(['video']);
    expect(next.getPart('video')).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('shares the underlying data buffer — no copy', () => {
    const original = makeFrame();
    const next = original.withEvents([]);
    // Both frames slice into the same ArrayBuffer.
    expect(next.getPart('video')!.buffer).toBe(original.getPart('video')!.buffer);
  });

  it('does not mutate the original events', () => {
    const original = makeFrame([{ type: 'existing', data: new Uint8Array() }]);
    original.withEvents([{ type: 'new', data: new Uint8Array() }]);
    expect(original.getEvents()).toHaveLength(1);
    expect(original.getEvents()[0].type).toBe('existing');
  });
});

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
