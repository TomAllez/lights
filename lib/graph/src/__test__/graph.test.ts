import { describe, it, expect, vi, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { exhaustMap, map, take } from 'rxjs';
import { Graph } from '../graph';
import { BaseDriver } from '@lights/driver';
import { BaseModule } from '@lights/module';
import { BaseRenderer } from '@lights/renderer';
import { Frame, createFrame } from '@lights/io';

class TestDriver extends BaseDriver {
  isStarted = false;
  start() { this.isStarted = true; }
  stop() { this.isStarted = false; }
}

class TestRenderer extends BaseRenderer {
  constructor() { super('test-renderer'); }
}

const makeFrame = (): Frame =>
  createFrame({ timestamp: 0, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

describe('Graph', () => {
  it('supports fluent chaining', () => {
    const graph = new Graph()
      .addDriver('d', new TestDriver())
      .addModule('m', new BaseModule('m'))
      .connect('d:output', 'm:input');

    expect(graph).toBeInstanceOf(Graph);
  });

  it('throws on duplicate node id', () => {
    const graph = new Graph().addDriver('d', new TestDriver());
    expect(() => graph.addDriver('d', new TestDriver())).toThrow('Node "d" already exists');
    expect(() => graph.addModule('d', new BaseModule('m'))).toThrow('Node "d" already exists');
  });

  it('starts all nodes on start()', () => {
    const driver = new TestDriver();

    new Graph()
      .addDriver('d', driver)
      .addModule('m', new BaseModule('m'))
      .connect('d:output', 'm:input')
      .start();

    expect(driver.isStarted).toBe(true);
  });

  it('routes frames from driver to module', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input')
      .start();

    module.output.stream$.subscribe(f => received.push(f));
    driver.output.emit(makeFrame());

    expect(received).toHaveLength(1);
  });

  it('routes frames through a chain of modules', () => {
    const driver = new TestDriver();
    const m1 = new BaseModule('m1');
    const m2 = new BaseModule('m2');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m1', m1)
      .addModule('m2', m2)
      .connect('d:output', 'm1:input')
      .connect('m1:output', 'm2:input')
      .start();

    m2.output.stream$.subscribe(f => received.push(f));
    driver.output.emit(makeFrame());

    expect(received).toHaveLength(1);
  });

  it('stops all nodes and disconnects ports on stop()', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    const graph = new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input');

    graph.start();
    module.output.stream$.subscribe(f => received.push(f));

    graph.stop();
    driver.output.emit(makeFrame());

    expect(driver.isStarted).toBe(false);
    expect(module.input.connected).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('throws on unknown node in edge', () => {
    const graph = new Graph()
      .addDriver('d', new TestDriver())
      .connect('d:output', 'unknown:input');

    expect(() => graph.start()).toThrow('Node "unknown" not found');
  });

  it('throws on invalid port reference format', () => {
    const graph = new Graph()
      .addDriver('d', new TestDriver())
      .addModule('m', new BaseModule('m'))
      .connect('d:output', 'nocolon');

    expect(() => graph.start()).toThrow('Invalid port reference "nocolon"');
  });

  it('throws when connecting to a non-InputPort', () => {
    const graph = new Graph()
      .addDriver('d', new TestDriver())
      .addModule('m', new BaseModule('m'))
      .connect('d:output', 'm:output'); // output is an OutputPort, not InputPort

    expect(() => graph.start()).toThrow('is not an InputPort');
  });
});

describe('Graph connect strategies', () => {
  it('queue strategy (default) passes every frame', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input', { strategy: 'queue' })
      .start();

    module.input.stream$.subscribe(f => received.push(f));

    driver.output.emit(makeFrame());
    driver.output.emit(makeFrame());
    driver.output.emit(makeFrame());

    expect(received).toHaveLength(3);
  });

  it('latest strategy routes frames when consumer keeps up', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input', { strategy: 'latest' })
      .start();

    module.input.stream$.subscribe(f => received.push(f));

    driver.output.emit(makeFrame());
    driver.output.emit(makeFrame());

    expect(received).toHaveLength(2);
  });

  it('latest strategy drops frames while consumer is busy', () => {
    // Demonstrates the exhaustMap mechanism used by the 'latest' strategy.
    // A controlled Subject acts as the inner observable so we can hold the
    // "processing slot" open and verify that new frames emitted in the
    // meantime are silently dropped.
    const source = new Subject<Frame>();
    const slot = new Subject<void>();
    const received: Frame[] = [];

    source
      .pipe(exhaustMap(frame => slot.pipe(take(1), map(() => frame))))
      .subscribe(f => received.push(f));

    const frames = [makeFrame(), makeFrame(), makeFrame(), makeFrame()];

    source.next(frames[0]); // slot held open – consumer "busy"
    source.next(frames[1]); // dropped
    source.next(frames[2]); // dropped

    expect(received).toHaveLength(0); // nothing delivered yet

    slot.next(); // consumer finishes: frames[0] is delivered

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(frames[0]);

    source.next(frames[3]); // accepted: slot is free again
    slot.next();

    expect(received).toHaveLength(2);
    expect(received[1]).toBe(frames[3]);
  });

  it('sample strategy emits exactly 1 frame per n received', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input', { strategy: { sample: 3 } })
      .start();

    module.input.stream$.subscribe(f => received.push(f));

    for (let i = 0; i < 9; i++) driver.output.emit(makeFrame());

    // frames at index 0, 3, 6 pass; 1, 2, 4, 5, 7, 8 are dropped
    expect(received).toHaveLength(3);
  });

  it('sample strategy with n=1 passes every frame', () => {
    const driver = new TestDriver();
    const module = new BaseModule('m');
    const received: Frame[] = [];

    new Graph()
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input', { strategy: { sample: 1 } })
      .start();

    module.input.stream$.subscribe(f => received.push(f));

    for (let i = 0; i < 5; i++) driver.output.emit(makeFrame());

    expect(received).toHaveLength(5);
  });
});

describe('Graph stats', () => {
  afterEach(() => vi.useRealTimers());

  it('getStats() returns empty array when stats are disabled', () => {
    const graph = new Graph()
      .addDriver('d', new TestDriver())
      .addModule('m', new BaseModule('m'))
      .connect('d:output', 'm:input');

    graph.start();
    expect(graph.getStats()).toEqual([]);
  });

  it('collects input and output fps per node', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const driver = new TestDriver();
    const module = new BaseModule('m');

    const graph = new Graph({ stats: true })
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input');

    graph.start();

    // 3 frames over 200 ms → 10 fps
    driver.output.emit(makeFrame());
    vi.advanceTimersByTime(100);
    driver.output.emit(makeFrame());
    vi.advanceTimersByTime(100);
    driver.output.emit(makeFrame());

    const stats = graph.getStats();
    const dStats = stats.find(s => s.nodeId === 'd')!;
    const mStats = stats.find(s => s.nodeId === 'm')!;

    expect(dStats.outputFps).toBeGreaterThan(0);
    expect(mStats.inputFps).toBeGreaterThan(0);
    expect(mStats.outputFps).toBeGreaterThan(0);
  });

  it('p50 and p95 latency are non-negative numbers after frames pass through', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const driver = new TestDriver();
    const module = new BaseModule('m');

    const graph = new Graph({ stats: true })
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input');

    graph.start();

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(10);
      driver.output.emit(makeFrame());
    }

    const mStats = graph.getStats().find(s => s.nodeId === 'm')!;

    expect(mStats.latencyP50).toBeGreaterThanOrEqual(0);
    expect(mStats.latencyP95).toBeGreaterThanOrEqual(0);
    expect(mStats.latencyP95).toBeGreaterThanOrEqual(mStats.latencyP50);
  });

  it('collects renderer drift equal to frame.age() at receipt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);

    const driver = new TestDriver();
    const renderer = new TestRenderer();

    const graph = new Graph({ stats: true })
      .addDriver('d', driver)
      .addRenderer('r', renderer)
      .connect('d:output', 'r:input');

    graph.start();

    // Frame captured 200 ms ago
    const frame = createFrame({ timestamp: 800, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });
    driver.output.emit(frame);

    const rStats = graph.getStats().find(s => s.nodeId === 'r')!;

    expect(rStats.drift).toBe(200);
  });

  it('drift is undefined for non-renderer nodes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const driver = new TestDriver();
    const module = new BaseModule('m');

    const graph = new Graph({ stats: true })
      .addDriver('d', driver)
      .addModule('m', module)
      .connect('d:output', 'm:input');

    graph.start();
    driver.output.emit(makeFrame());

    const stats = graph.getStats();
    expect(stats.find(s => s.nodeId === 'd')!.drift).toBeUndefined();
    expect(stats.find(s => s.nodeId === 'm')!.drift).toBeUndefined();
  });
});
