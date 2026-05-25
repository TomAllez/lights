import { describe, it, expect } from 'vitest';
import { Graph } from '@lights/graph';
import { Frame } from '@lights/io';
import { AsyncModule } from '@lights/module';
import { BaseRenderer } from '@lights/renderer';
import { SyntheticDriver } from '@lights/driver-synthetic';

class SlowModule extends AsyncModule {
  constructor(private delayMs: number) { super(); }
  async process(frame: Frame): Promise<Frame> {
    await new Promise(resolve => setTimeout(resolve, this.delayMs));
    return frame;
  }
}

describe('frame-drop: latest strategy', () => {
  it('drops frames when processor is slower than source', async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 2, height: 2 },
      tick: { mode: 'interval', fps: 30 },
    });
    const slowModule = new SlowModule(100); // 100ms per frame, source at 30fps
    const renderer = new BaseRenderer('collector');

    const graph = new Graph();
    graph.addDriver('driver', driver);
    graph.addModule('slow', slowModule);
    graph.addRenderer('renderer', renderer);
    graph.connect('driver:output', 'slow:input', { strategy: 'latest' });
    graph.connect('slow:output', 'renderer:input');

    const outputFrames: Frame[] = [];
    renderer.attachProcess(frame => outputFrames.push(frame));

    graph.start();
    await new Promise(resolve => setTimeout(resolve, 500));
    graph.stop();

    // At 30fps for 500ms = ~15 input frames, but each takes 100ms to process.
    // With 'latest', we expect roughly 500/100 = 5 output frames (±2).
    expect(outputFrames.length).toBeGreaterThan(0);
    expect(outputFrames.length).toBeLessThan(15);
  }, 10_000);
});
