import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SyntheticDriver } from '@lights/driver-synthetic';
import { AvailableModule } from '@lights/python-module';
import { PipelineHarness } from '../harness.js';

describe('smoke: end-to-end pipeline', () => {
  let harness: PipelineHarness;

  beforeAll(async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 320, height: 240 },
      tick: { mode: 'demand' },
    });
    harness = new PipelineHarness({
      driver,
      modules: [{ id: 'face-mesh', module: AvailableModule.FaceMeshEstimation, scriptArgs: ['--width', '320', '--height', '240'] }],
    });
    await harness.start();
  }, 60_000);

  afterAll(async () => { await harness.stop(); });

  it('pipeline starts without error', () => {
    expect(harness).toBeDefined();
  });

  it('emits output frames after ticking', async () => {
    for (let i = 0; i < 5; i++) harness.driver.tick();
    const frames = await harness.collect('face-mesh', 5, 30_000);
    expect(frames.length).toBe(5);
  });

  it('output frames carry video part data', async () => {
    harness.driver.tick();
    const [captured] = await harness.collect('face-mesh', 1, 15_000);
    expect(captured.frame.getPart('video')).not.toBeNull();
    expect(captured.frame.getPart('video')!.length).toBe(320 * 240 * 3);
  });
});
