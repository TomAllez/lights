import { describe, it, expect } from 'vitest';
import { Subject } from 'rxjs';
import { AsyncModule } from '../async-module';
import { Frame, createFrame } from '@lights/io';

const makeFrame = (): Frame =>
  createFrame({ timestamp: 0, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

class TestAsyncModule extends AsyncModule {
  processImpl: (frame: Frame) => Promise<Frame> = frame => Promise.resolve(frame);
  async process(frame: Frame): Promise<Frame> {
    return this.processImpl(frame);
  }
}

describe('AsyncModule', () => {
  it('emits the processed frame to output', async () => {
    const module = new TestAsyncModule();
    const received: Frame[] = [];
    module.output.stream$.subscribe(f => received.push(f));

    const source = new Subject<Frame>();
    module.input.connect(source.asObservable());
    module.start();

    const frame = makeFrame();
    source.next(frame);
    await flush();

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(frame);

    module.stop();
  });

  it('queues frames received while process() is running', async () => {
    const module = new TestAsyncModule();
    const processed: Frame[] = [];
    let resolveFirst!: (f: Frame) => void;

    module.processImpl = frame => {
      processed.push(frame);
      if (processed.length === 1) {
        return new Promise<Frame>(r => { resolveFirst = r; });
      }
      return Promise.resolve(frame);
    };

    const received: Frame[] = [];
    module.output.stream$.subscribe(f => received.push(f));

    const source = new Subject<Frame>();
    module.input.connect(source.asObservable());
    module.start();

    const [f1, f2, f3] = [makeFrame(), makeFrame(), makeFrame()];

    source.next(f1); // starts process(f1) — held open
    source.next(f2); // queued by concatMap
    source.next(f3); // queued by concatMap

    expect(processed).toHaveLength(1); // only f1 entered process() so far
    expect(received).toHaveLength(0);  // nothing emitted yet

    resolveFirst(f1);
    await flush();

    expect(received).toHaveLength(3);  // all three frames processed in order
    expect(received[0]).toBe(f1);
    expect(received[1]).toBe(f2);
    expect(received[2]).toBe(f3);
    expect(processed).toHaveLength(3);

    module.stop();
  });

  it('accepts a new frame after the previous one completes', async () => {
    const module = new TestAsyncModule();
    const received: Frame[] = [];
    module.output.stream$.subscribe(f => received.push(f));

    const source = new Subject<Frame>();
    module.input.connect(source.asObservable());
    module.start();

    const [f1, f2] = [makeFrame(), makeFrame()];

    source.next(f1);
    await flush();
    source.next(f2);
    await flush();

    expect(received).toHaveLength(2);
    expect(received[0]).toBe(f1);
    expect(received[1]).toBe(f2);

    module.stop();
  });

  it('stop() prevents further output', async () => {
    const module = new TestAsyncModule();
    const received: Frame[] = [];
    module.output.stream$.subscribe(f => received.push(f));

    const source = new Subject<Frame>();
    module.input.connect(source.asObservable());
    module.start();
    module.stop();

    source.next(makeFrame());
    await flush();

    expect(received).toHaveLength(0);
  });
});
