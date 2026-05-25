import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SyntheticDriver } from '@lights/driver-synthetic';
import { AvailableModule } from '@lights/python-module';
import { PipelineHarness } from '../harness.js';

describe('serialization: event data encoding', () => {
  let harness: PipelineHarness;

  beforeAll(async () => {
    const driver = new SyntheticDriver({
      source: { kind: 'synthetic', width: 320, height: 240, fill: [255, 255, 255] },
      tick: { mode: 'demand' },
    });
    harness = new PipelineHarness({
      driver,
      modules: [{ id: 'face-mesh', module: AvailableModule.FaceMeshEstimation, scriptArgs: ['--width', '320', '--height', '240'] }],
    });
    await harness.start();
  }, 60_000);

  afterAll(async () => { await harness.stop(); });

  it('blank frame produces a valid (possibly empty) events array', async () => {
    harness.driver.tick();
    const [captured] = await harness.collect('face-mesh', 1, 15_000);
    expect(Array.isArray(captured.events)).toBe(true);
  });

  it('event data fields are Uint8Array when events are present', async () => {
    for (let i = 0; i < 3; i++) harness.driver.tick();
    const frames = await harness.collect('face-mesh', 3, 30_000);
    for (const { events } of frames) {
      for (const event of events) {
        expect(event.data).toBeInstanceOf(Uint8Array);
        expect(event.type).toBe('facemesh');
        // 468 landmarks × 3 float32 = 5616 bytes
        expect(event.data.byteLength).toBe(5616);
      }
    }
  });
});
