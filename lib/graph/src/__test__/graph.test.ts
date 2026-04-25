import { describe, it, expect } from 'vitest';
import { Graph } from '../graph';
import { BaseDriver } from '@lights/driver';
import { BaseModule } from '@lights/module';
import { Frame, createFrame } from '@lights/io';

class TestDriver extends BaseDriver {
  isStarted = false;
  start() { this.isStarted = true; }
  stop() { this.isStarted = false; }
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
