import { Graph, NodeStats } from '@lights/graph';
import { Frame } from '@lights/io';
import { AvailableModule, PythonModule } from '@lights/python-module';
import { BaseRenderer } from '@lights/renderer';
import { SyntheticDriver } from '@lights/driver-synthetic';

export type CapturedFrame = {
  frame: Frame;
  events: ReturnType<Frame['getEvents']>;
  receivedAt: number;
};

export type ModuleConfig = {
  id: string;
  module: AvailableModule;
  scriptArgs?: string[];
};

export type HarnessOptions = {
  driver: SyntheticDriver;
  modules: ModuleConfig[];
  stats?: boolean;
  python?: string;
};

export class PipelineHarness {
  private graph: Graph;
  readonly driver: SyntheticDriver;
  private rendererMap = new Map<string, BaseRenderer>();
  private queues = new Map<string, CapturedFrame[]>();
  private waiters = new Map<string, Array<{ count: number; resolve: (frames: CapturedFrame[]) => void; reject: (err: Error) => void }>>();

  constructor(options: HarnessOptions) {
    this.graph = new Graph({ stats: options.stats ?? true });
    this.driver = options.driver;

    this.graph.addDriver('driver', this.driver);

    for (const cfg of options.modules) {
      const mod = new PythonModule(cfg.module, {
        python: options.python,
        scriptArgs: cfg.scriptArgs,
      });
      const renderer = new BaseRenderer(`renderer-${cfg.id}`);

      this.graph.addModule(cfg.id, mod);
      this.graph.addRenderer(`renderer-${cfg.id}`, renderer);
      this.graph.connect('driver:output', `${cfg.id}:input`);
      this.graph.connect(`${cfg.id}:output`, `renderer-${cfg.id}:input`);

      this.rendererMap.set(cfg.id, renderer);
      this.queues.set(cfg.id, []);
      this.waiters.set(cfg.id, []);

      renderer.attachProcess(frame => {
        const captured: CapturedFrame = {
          frame,
          events: frame.getEvents(),
          receivedAt: Date.now(),
        };
        const queue = this.queues.get(cfg.id)!;
        queue.push(captured);
        this.drainWaiters(cfg.id);
      });
    }
  }

  private drainWaiters(moduleId: string): void {
    const queue = this.queues.get(moduleId)!;
    const waiters = this.waiters.get(moduleId)!;
    while (waiters.length > 0 && queue.length >= waiters[0].count) {
      const { count, resolve } = waiters.shift()!;
      resolve(queue.splice(0, count));
    }
  }

  async start(): Promise<void> {
    this.graph.start();
    if (this.rendererMap.size === 0) return;
    const firstId = this.rendererMap.keys().next().value as string;
    this.queues.set(firstId, []);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Warm-up timeout (30s): Python did not respond')), 30_000);
      const waiters = this.waiters.get(firstId)!;
      waiters.push({
        count: 1,
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject,
      });
      this.driver.tick();
    });
    for (const [id] of this.queues) this.queues.set(id, []);
  }

  async stop(): Promise<void> {
    for (const [, waiters] of this.waiters) {
      for (const { reject } of waiters) reject(new Error('harness stopped'));
      waiters.length = 0;
    }
    this.graph.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  collect(moduleId: string, count: number, timeoutMs = 30_000): Promise<CapturedFrame[]> {
    const queue = this.queues.get(moduleId);
    if (!queue) return Promise.reject(new Error(`Unknown module: ${moduleId}`));
    if (queue.length >= count) {
      return Promise.resolve(queue.splice(0, count));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiters = this.waiters.get(moduleId)!;
        const idx = waiters.findIndex(w => w.resolve === wrappedResolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`collect() timeout (${timeoutMs}ms): got ${queue.length}/${count} frames from ${moduleId}`));
      }, timeoutMs);
      const wrappedResolve = (frames: CapturedFrame[]) => { clearTimeout(timer); resolve(frames); };
      this.waiters.get(moduleId)!.push({ count, resolve: wrappedResolve, reject });
    });
  }

  stats(): NodeStats[] { return this.graph.getStats(); }
}
