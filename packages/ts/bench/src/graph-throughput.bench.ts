/**
 * Benchmarks RxJS graph throughput — how many frames/sec the pipeline can
 * sustain with zero-cost modules (passthrough).
 *
 * This isolates the RxJS Subject + operator overhead from any real work,
 * establishing the ceiling throughput for the core DAG plumbing.
 *
 * Candidates for improvement:
 *   - Replace RxJS hot path with direct function calls for simple linear chains
 *   - Use SharedArrayBuffer + Atomics for lock-free producer/consumer between
 *     the FFmpeg driver and the first module
 */

import { bench, describe } from 'vitest';
import { Graph } from '@lights/graph';
import { BaseDriver } from '@lights/driver';
import { BaseModule } from '@lights/module';
import { BaseRenderer } from '@lights/renderer';
import { createFrame, Frame } from '@lights/io';

class SyntheticDriver extends BaseDriver {
  start() {}
  stop() {}
}

const makeFrame = (): Frame =>
  createFrame({ timestamp: Date.now(), duration: 33, metadata: {}, data: new Uint8Array(), events: [] });

const makeFrameWithData = (size: number): Frame => {
  const pixels = new Uint8Array(size);
  return createFrame({
    timestamp: Date.now(), duration: 33,
    metadata: { video: { offset: 0, size } },
    data: pixels, events: [],
  });
};

// ─── Linear chain: d → m1 → m2 → r ───────────────────────────────────────────

const chainDriver = new SyntheticDriver();
{
  const m1 = new BaseModule('m1');
  const m2 = new BaseModule('m2');
  m1.attachProcess(f => f);
  m2.attachProcess(f => f);
  const r = new BaseRenderer('r');
  r.attachProcess(() => {});
  new Graph()
    .addDriver('d', chainDriver)
    .addModule('m1', m1)
    .addModule('m2', m2)
    .addRenderer('r', r)
    .connect('d:output', 'm1:input')
    .connect('m1:output', 'm2:input')
    .connect('m2:output', 'r:input')
    .start();
}

describe('Graph — linear chain (empty frames)', () => {
  bench('emit frame through d → m1 → m2 → r', () => {
    chainDriver.output.emit(makeFrame());
  });
});

// ─── Single module, varying frame sizes ───────────────────────────────────────

const sizeDriver = new SyntheticDriver();
{
  const m = new BaseModule('m');
  m.attachProcess(f => f);
  const r = new BaseRenderer('r2');
  r.attachProcess(() => {});
  new Graph()
    .addDriver('d', sizeDriver)
    .addModule('m', m)
    .addRenderer('r', r)
    .connect('d:output', 'm:input')
    .connect('m:output', 'r:input')
    .start();
}

describe('Graph — single module, varying frame sizes', () => {
  bench('emit 640×480 frame (921 KB)', () => {
    sizeDriver.output.emit(makeFrameWithData(640 * 480 * 3));
  });

  bench('emit 1280×720 frame (2.7 MB)', () => {
    sizeDriver.output.emit(makeFrameWithData(1280 * 720 * 3));
  });
});

// ─── Fanout: one driver → two parallel modules ────────────────────────────────

const fanoutDriver = new SyntheticDriver();
{
  const mA = new BaseModule('mA');
  const mB = new BaseModule('mB');
  mA.attachProcess(f => f);
  mB.attachProcess(f => f);
  const rA = new BaseRenderer('rA');
  const rB = new BaseRenderer('rB');
  rA.attachProcess(() => {});
  rB.attachProcess(() => {});
  new Graph()
    .addDriver('d', fanoutDriver)
    .addModule('mA', mA)
    .addModule('mB', mB)
    .addRenderer('rA', rA)
    .addRenderer('rB', rB)
    .connect('d:output', 'mA:input')
    .connect('d:output', 'mB:input')
    .connect('mA:output', 'rA:input')
    .connect('mB:output', 'rB:input')
    .start();
}

describe('Graph — fanout to two parallel modules', () => {
  bench('fanout: d → mA + mB → rA + rB', () => {
    fanoutDriver.output.emit(makeFrame());
  });
});
