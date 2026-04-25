import { describe, it, expect } from 'vitest';
import { BaseDriver } from '../driver.js';
import { Frame, createFrame } from '@lights/io';

class TestDriver extends BaseDriver {
  public isStarted = false;

  start() { this.isStarted = true; }
  stop() { this.isStarted = false; }
}

describe('BaseDriver', () => {
  it('should be able to extend BaseDriver and emit frames', () => {
    const driver = new TestDriver();
    const frames: Frame[] = [];
    driver.output.stream$.subscribe(f => frames.push(f));

    const mockFrame = createFrame({
      timestamp: Date.now(),
      duration: 100,
      metadata: {},
      data: new Uint8Array(),
      events: []
    });

    driver.output.emit(mockFrame);

    expect(frames.length).toBe(1);
    expect(frames[0]).toBe(mockFrame);
  });

  it('should handle start and stop', () => {
    const driver = new TestDriver();
    expect(driver.isStarted).toBe(false);
    driver.start();
    expect(driver.isStarted).toBe(true);
    driver.stop();
    expect(driver.isStarted).toBe(false);
  });
});
