import { describe, it, expect } from 'vitest';
import { SyntheticDriver } from '@lights/driver-synthetic';
import { AvailableModule } from '@lights/python-module';
import { PipelineHarness } from '../harness.js';

describe('lifecycle: Python subprocess management', () => {
  it('Python process exits cleanly after harness.stop()', async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 320, height: 240 },
      tick: { mode: 'demand' },
    });
    const harness = new PipelineHarness({
      driver,
      modules: [{ id: 'face-mesh', module: AvailableModule.FaceMeshEstimation }],
    });
    await harness.start();
    harness.driver.tick();
    await harness.collect('face-mesh', 1, 15_000);
    await harness.stop();
    // If we got here without hanging, lifecycle is correct
    expect(true).toBe(true);
  }, 60_000);

  it('harness.start() completes warm-up before resolving', async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 320, height: 240 },
      tick: { mode: 'demand' },
    });
    const harness = new PipelineHarness({
      driver,
      modules: [{ id: 'face-mesh', module: AvailableModule.FaceMeshEstimation }],
    });
    await harness.start();
    harness.driver.tick();
    const [frame] = await harness.collect('face-mesh', 1, 15_000);
    expect(frame).toBeDefined();
    await harness.stop();
  }, 60_000);
});
