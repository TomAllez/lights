import { Observable, Subscription, exhaustMap, filter, of } from 'rxjs';
import { Frame, InputPort, OutputPort } from '@lights/io';
import { BaseDriver } from '@lights/driver';
import { AsyncModule, BaseModule } from '@lights/module';
import { BaseRenderer } from '@lights/renderer';

export interface NodeStats {
  nodeId: string;
  inputFps: number;
  outputFps: number;
  latencyP50: number;
  latencyP95: number;
  drift?: number;
}

interface GraphOptions {
  stats?: boolean;
}

/**
 * Directed acyclic graph of drivers, modules and renderers.
 * Nodes are registered by ID; edges are declared as "nodeId:portName" string pairs.
 * Wiring and startup happen lazily on start().
 */
export class Graph {
  private drivers = new Map<NodeId, BaseDriver>();
  private modules = new Map<NodeId, BaseModule | AsyncModule | BaseRenderer>();
  private edges: Array<{ from: string; to: string; options?: ConnectOptions }> = [];
  private statsEnabled: boolean;
  private collectors = new Map<NodeId, StatsCollector>();
  private statsSubs: Subscription[] = [];

  constructor(options: GraphOptions = {}) {
    this.statsEnabled = !!options.stats;
  }

  /**
   * Registers a driver node.
   * @param {string} id - Unique node identifier
   * @param {BaseDriver} driver - The driver instance
   */
  addDriver(id: NodeId, driver: BaseDriver): this {
    if (this.hasNode(id)) throw new Error(`Node "${id}" already exists`);
    this.drivers.set(id, driver);
    return this;
  }

  /**
   * Registers a module node.
   * @param {string} id - Unique node identifier
   * @param {BaseModule} module - The module instance
   */
  addModule(id: NodeId, module: BaseModule | AsyncModule): this {
    if (this.hasNode(id)) throw new Error(`Node "${id}" already exists`);
    this.modules.set(id, module);
    return this;
  }

  /**
   * Registers a renderer node.
   * @param {string} id - Unique node identifier
   * @param {BaseRenderer} renderer - The renderer instance
   */
  addRenderer(id: NodeId, renderer: BaseRenderer): this {
    if (this.hasNode(id)) throw new Error(`Node "${id}" already exists`);
    this.modules.set(id, renderer);
    return this;
  }

  /**
   * Declares an edge between two ports.
   * @param {string} from - Source port reference as "nodeId:portName"
   * @param {string} to - Target port reference as "nodeId:portName"
   * @param {ConnectOptions} options - Optional scheduling strategy for this edge
   */
  connect(from: string, to: string, options?: ConnectOptions): this {
    this.edges.push({ from, to, options });
    return this;
  }

  /**
   * Validates the topology, wires all ports, then starts every node.
   */
  start(): void {
    for (const { from, to, options } of this.edges) {
      const fromRef = parsePortRef(from);
      const toRef = parsePortRef(to);

      const fromNode =
        this.drivers.get(fromRef.nodeId) ?? this.modules.get(fromRef.nodeId);
      if (!fromNode) throw new Error(`Node "${fromRef.nodeId}" not found`);

      const toNode = this.modules.get(toRef.nodeId);
      if (!toNode) throw new Error(`Node "${toRef.nodeId}" not found`);

      const source = applyStrategy(
        resolveOutputPort(fromNode, fromRef.portName).stream$,
        options,
      );

      resolveInputPort(toNode, toRef.portName).connect(source);
    }

    if (this.statsEnabled) {
      for (const [id, driver] of this.drivers) {
        const c = new StatsCollector();
        this.collectors.set(id, c);
        this.statsSubs.push(driver.output.stream$.subscribe(f => c.recordOutput(f)));
      }
      for (const [id, node] of this.modules) {
        const isRenderer = node instanceof BaseRenderer;
        const c = new StatsCollector();
        this.collectors.set(id, c);
        this.statsSubs.push(node.input.stream$.subscribe(f => {
          c.recordInput(f);
          if (isRenderer) c.recordDrift(f);
        }));
        if (!isRenderer) {
          this.statsSubs.push((node as BaseModule | AsyncModule).output.stream$.subscribe(f => c.recordOutput(f)));
        }
      }
    }

    for (const driver of this.drivers.values()) driver.start();
    for (const module of this.modules.values()) module.start();
  }

  /**
   * Stops every node and disconnects all wired input ports.
   */
  stop(): void {
    for (const sub of this.statsSubs) sub.unsubscribe();
    this.statsSubs = [];

    for (const driver of this.drivers.values()) driver.stop();
    for (const module of this.modules.values()) module.stop();

    for (const { to } of this.edges) {
      const { nodeId, portName } = parsePortRef(to);
      const node = this.modules.get(nodeId);
      if (!node) continue;
      const port = (node as unknown as Record<string, unknown>)[portName];
      if (port instanceof InputPort) port.disconnect();
    }
  }

  getStats(): NodeStats[] {
    return Array.from(this.collectors.entries()).map(([id, c]) => c.snapshot(id));
  }

  private hasNode(id: NodeId): boolean {
    return this.drivers.has(id) || this.modules.has(id);
  }
}

type NodeId = string;

type Strategy = 'queue' | 'latest' | { sample: number };

export interface ConnectOptions {
  strategy?: Strategy;
}

// ─── Stats internals ─────────────────────────────────────────────────────────

const WINDOW = 120;

class StatsCollector {
  private inputTimes: number[] = [];
  private outputTimes: number[] = [];
  // frame.timestamp → wall-clock time of receipt; bounded to avoid unbounded
  // growth when frames are dropped (e.g. exhaustMap in AsyncModule).
  private pendingInput = new Map<number, number>();
  private latencySamples: number[] = [];
  private driftSamples: number[] = [];

  recordInput(frame: Frame): void {
    const now = Date.now();
    push(this.inputTimes, now);
    this.pendingInput.set(frame.getTimestamp(), now);
    if (this.pendingInput.size > WINDOW) {
      this.pendingInput.delete(this.pendingInput.keys().next().value!);
    }
  }

  recordOutput(frame: Frame): void {
    const now = Date.now();
    push(this.outputTimes, now);
    const t = this.pendingInput.get(frame.getTimestamp());
    if (t !== undefined) {
      push(this.latencySamples, now - t);
      this.pendingInput.delete(frame.getTimestamp());
    }
  }

  recordDrift(frame: Frame): void {
    push(this.driftSamples, frame.age());
  }

  snapshot(nodeId: string): NodeStats {
    const stats: NodeStats = {
      nodeId,
      inputFps: fps(this.inputTimes),
      outputFps: fps(this.outputTimes),
      latencyP50: pct(this.latencySamples, 50),
      latencyP95: pct(this.latencySamples, 95),
    };
    if (this.driftSamples.length > 0) stats.drift = avg(this.driftSamples);
    return stats;
  }
}

function push(arr: number[], val: number): void {
  arr.push(val);
  if (arr.length > WINDOW) arr.shift();
}

function fps(times: number[]): number {
  if (times.length < 2) return 0;
  const span = times[times.length - 1] - times[0];
  return span > 0 ? (times.length - 1) / (span / 1000) : 0;
}

function pct(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor((p / 100) * (sorted.length - 1))];
}

function avg(samples: number[]): number {
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

// ─── Strategy application ────────────────────────────────────────────────────

function applyStrategy(
  source: Observable<Frame>,
  options?: ConnectOptions,
): Observable<Frame> {
  const strategy = options?.strategy ?? 'queue';
  if (strategy === 'latest') {
    return source.pipe(exhaustMap(frame => of(frame)));
  }
  if (typeof strategy === 'object' && 'sample' in strategy) {
    const n = strategy.sample;
    return source.pipe(filter((_, i) => i % n === 0));
  }
  return source;
}

// ─── Port helpers ─────────────────────────────────────────────────────────────

function parsePortRef(ref: string): { nodeId: NodeId; portName: string } {
  const colon = ref.indexOf(':');
  if (colon === -1)
    throw new Error(
      `Invalid port reference "${ref}", expected "nodeId:portName"`,
    );
  return { nodeId: ref.slice(0, colon), portName: ref.slice(colon + 1) };
}

function resolveOutputPort(
  node: BaseDriver | BaseModule | BaseRenderer,
  portName: string,
): OutputPort {
  const port = (node as unknown as Record<string, unknown>)[portName];
  if (!(port instanceof OutputPort))
    throw new Error(`Port "${portName}" is not an OutputPort`);
  return port;
}

function resolveInputPort(
  node: BaseModule | BaseRenderer,
  portName: string,
): InputPort {
  const port = (node as unknown as Record<string, unknown>)[portName];
  if (!(port instanceof InputPort))
    throw new Error(`Port "${portName}" is not an InputPort`);
  return port;
}
