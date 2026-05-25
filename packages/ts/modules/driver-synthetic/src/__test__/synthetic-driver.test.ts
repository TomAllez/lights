import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyntheticDriver } from '../synthetic-driver.js';
import { BaseDriver } from '@lights/driver';
import { Frame } from '@lights/io';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from 'fs';

describe('SyntheticDriver', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('extends BaseDriver', () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 2, height: 2 },
      tick: { mode: 'demand' },
    });
    expect(driver).toBeInstanceOf(BaseDriver);
  });

  describe('synthetic mode', () => {
    it('emits a frame with the correct byte size on tick()', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 4, height: 3 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();

      expect(frames).toHaveLength(1);
      // 4 × 3 × 3 = 36 bytes
      expect(frames[0].getPart('video')).toHaveLength(36);
    });

    it('fills frame data with the specified fill color', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 1, fill: [10, 20, 30] },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();

      const pixels = frames[0].getPart('video')!;
      expect(pixels[0]).toBe(10);
      expect(pixels[1]).toBe(20);
      expect(pixels[2]).toBe(30);
    });

    it('defaults to solid white [255, 255, 255] when no fill is given', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();

      const pixels = frames[0].getPart('video')!;
      expect(pixels[0]).toBe(255);
      expect(pixels[1]).toBe(255);
      expect(pixels[2]).toBe(255);
    });

    it('uses a custom partName in emitted frames', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 2 },
        tick: { mode: 'demand' },
        partName: 'camera',
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();

      expect(frames[0].getPartsName()).toEqual(['camera']);
    });
  });

  describe('demand mode', () => {
    it('tick() emits exactly one frame per call', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 2 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      driver.tick();
      expect(frames).toHaveLength(1);
      driver.tick();
      expect(frames).toHaveLength(2);
      driver.tick();
      expect(frames).toHaveLength(3);
    });

    it('tick() before start() is a no-op', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 2 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));

      driver.tick();
      expect(frames).toHaveLength(0);
    });

    it('frames in demand mode carry duration of 33ms', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();

      expect(frames[0].getDuration()).toBe(33);
    });

    it('increments framesEmitted on each tick()', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      driver.start();

      expect(driver.framesEmitted).toBe(0);
      driver.tick();
      expect(driver.framesEmitted).toBe(1);
      driver.tick();
      expect(driver.framesEmitted).toBe(2);
    });
  });

  describe('interval mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('emits frames automatically at the given fps', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 2 },
        tick: { mode: 'interval', fps: 10 },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      // 10 fps → 100ms per frame; advance 300ms → expect ~3 frames
      vi.advanceTimersByTime(300);
      expect(frames.length).toBe(3);
    });

    it('frames in interval mode carry the correct duration', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'interval', fps: 25 },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      vi.advanceTimersByTime(40);
      // 25 fps → Math.round(1000/25) = 40ms
      expect(frames[0].getDuration()).toBe(40);
    });
  });

  describe('stop()', () => {
    it('clears the interval timer and stops emitting', () => {
      vi.useFakeTimers();
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 2, height: 2 },
        tick: { mode: 'interval', fps: 10 },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      vi.advanceTimersByTime(200);
      expect(frames.length).toBe(2);

      driver.stop();
      vi.advanceTimersByTime(500);
      expect(frames.length).toBe(2);
      vi.useRealTimers();
    });

    it('resets framesEmitted to 0', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      driver.start();
      driver.tick();
      driver.tick();
      expect(driver.framesEmitted).toBe(2);

      driver.stop();
      expect(driver.framesEmitted).toBe(0);
    });

    it('tick() after stop() is a no-op', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();
      driver.tick();
      driver.stop();
      driver.tick();
      expect(frames).toHaveLength(1);
    });

    it('stop() is safe when not started', () => {
      const driver = new SyntheticDriver({
        source: { kind: 'synthetic', width: 1, height: 1 },
        tick: { mode: 'demand' },
      });
      expect(() => driver.stop()).not.toThrow();
    });
  });

  describe('file mode', () => {
    it('reads frames from a raw RGB24 buffer', () => {
      // 2 frames of 2×1 pixels = 2 × 6 = 12 bytes
      const frameSize = 2 * 1 * 3;
      const rawBuffer = Buffer.alloc(frameSize * 2);
      // First frame: all red
      rawBuffer[0] = 255; rawBuffer[1] = 0; rawBuffer[2] = 0;
      rawBuffer[3] = 255; rawBuffer[4] = 0; rawBuffer[5] = 0;
      // Second frame: all blue
      rawBuffer[6] = 0; rawBuffer[7] = 0; rawBuffer[8] = 255;
      rawBuffer[9] = 0; rawBuffer[10] = 0; rawBuffer[11] = 255;

      vi.mocked(readFileSync).mockReturnValue(rawBuffer);

      const driver = new SyntheticDriver({
        source: { kind: 'file', path: '/fake/frames.bin', width: 2, height: 1 },
        tick: { mode: 'demand' },
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      driver.tick();
      driver.tick();

      expect(frames).toHaveLength(2);
      const firstPixel = frames[0].getPart('video')!;
      expect(firstPixel[0]).toBe(255); // R
      expect(firstPixel[1]).toBe(0);   // G
      expect(firstPixel[2]).toBe(0);   // B

      const secondPixel = frames[1].getPart('video')!;
      expect(secondPixel[0]).toBe(0);   // R
      expect(secondPixel[1]).toBe(0);   // G
      expect(secondPixel[2]).toBe(255); // B
    });

    it('ignores trailing bytes that do not form a complete frame', () => {
      const frameSize = 2 * 2 * 3; // 12 bytes per frame
      const rawBuffer = Buffer.alloc(frameSize + 5); // 1 full frame + 5 leftover bytes
      vi.mocked(readFileSync).mockReturnValue(rawBuffer);

      const driver = new SyntheticDriver({
        source: { kind: 'file', path: '/fake/partial.bin', width: 2, height: 2 },
        tick: { mode: 'demand' },
        loop: false,
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      driver.tick();
      driver.tick(); // second tick with loop=false should be a no-op
      expect(frames).toHaveLength(1);
    });
  });

  describe('loop behavior', () => {
    it('loop=true wraps the frame index back to 0 after the last frame', () => {
      const frameSize = 1 * 1 * 3;
      const rawBuffer = Buffer.alloc(frameSize * 2);
      rawBuffer[0] = 100; // frame 1 red channel
      rawBuffer[3] = 200; // frame 2 red channel
      vi.mocked(readFileSync).mockReturnValue(rawBuffer);

      const driver = new SyntheticDriver({
        source: { kind: 'file', path: '/fake/two-frames.bin', width: 1, height: 1 },
        tick: { mode: 'demand' },
        loop: true,
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      driver.tick(); // frame 0
      driver.tick(); // frame 1
      driver.tick(); // wraps → frame 0 again

      expect(frames).toHaveLength(3);
      // First and third frames should have the same red value
      expect(frames[0].getPart('video')![0]).toBe(frames[2].getPart('video')![0]);
    });

    it('loop=false stops emitting after all frames are exhausted', () => {
      const frameSize = 1 * 1 * 3;
      const rawBuffer = Buffer.alloc(frameSize * 2);
      vi.mocked(readFileSync).mockReturnValue(rawBuffer);

      const driver = new SyntheticDriver({
        source: { kind: 'file', path: '/fake/two-frames.bin', width: 1, height: 1 },
        tick: { mode: 'demand' },
        loop: false,
      });
      const frames: Frame[] = [];
      driver.output.stream$.subscribe(f => frames.push(f));
      driver.start();

      driver.tick(); // frame 0
      driver.tick(); // frame 1
      driver.tick(); // no-op — past end, loop disabled
      driver.tick(); // no-op

      expect(frames).toHaveLength(2);
    });
  });
});
