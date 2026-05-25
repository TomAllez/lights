import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SyntheticDriver } from '@lights/driver-synthetic';
import { AvailableModule } from '@lights/python-module';
import { PipelineHarness } from '../harness.js';

describe('latency: per-frame inference stats', () => {
  let harness: PipelineHarness;

  beforeAll(async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 320, height: 240 },
      tick: { mode: 'demand' },
    });
    harness = new PipelineHarness({
      driver,
      modules: [{ id: 'face-mesh', module: AvailableModule.FaceMeshEstimation, scriptArgs: ['--width', '320', '--height', '240'] }],
      stats: true,
    });
    await harness.start();
  }, 60_000);

  afterAll(async () => { await harness.stop(); });

  it('records latency stats after processing 30 frames', async () => {
    const FRAME_COUNT = 30;
    for (let i = 0; i < FRAME_COUNT; i++) harness.driver.tick();
    await harness.collect('face-mesh', FRAME_COUNT, 60_000);

    const stats = harness.stats();
    const faceStats = stats.find(s => s.nodeId === 'face-mesh');
    expect(faceStats).toBeDefined();
    expect(faceStats!.latencyP50).toBeGreaterThanOrEqual(0);
    expect(faceStats!.outputFps).toBeGreaterThanOrEqual(0);
  });
});
