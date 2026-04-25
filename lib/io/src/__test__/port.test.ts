import { describe, expect, it } from 'vitest';
import { Subject } from 'rxjs';
import { InputPort, OutputPort } from '../port';
import { createFrame } from '../frame';
import { Frame } from '../frame';

const makeFrame = (): Frame =>
  createFrame({ timestamp: 0, duration: 16, metadata: {}, data: new Uint8Array(), events: [] });

describe('OutputPort', () => {
  it('emits frames to subscribers', () => {
    const port = new OutputPort();
    const received: Frame[] = [];
    port.stream$.subscribe(f => received.push(f));

    const frame = makeFrame();
    port.emit(frame);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(frame);
  });

  it('emits to multiple subscribers', () => {
    const port = new OutputPort();
    const a: Frame[] = [];
    const b: Frame[] = [];
    port.stream$.subscribe(f => a.push(f));
    port.stream$.subscribe(f => b.push(f));

    port.emit(makeFrame());

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe('InputPort', () => {
  it('starts disconnected', () => {
    const port = new InputPort();
    expect(port.connected).toBe(false);
  });

  it('receives frames after connecting to a source', () => {
    const source = new Subject<Frame>();
    const port = new InputPort();
    const received: Frame[] = [];
    port.stream$.subscribe(f => received.push(f));

    port.connect(source.asObservable());
    const frame = makeFrame();
    source.next(frame);

    expect(port.connected).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(frame);
  });

  it('stops receiving frames after disconnect', () => {
    const source = new Subject<Frame>();
    const port = new InputPort();
    const received: Frame[] = [];
    port.stream$.subscribe(f => received.push(f));

    port.connect(source.asObservable());
    port.disconnect();
    source.next(makeFrame());

    expect(port.connected).toBe(false);
    expect(received).toHaveLength(0);
  });

  it('switches source on reconnect', () => {
    const source1 = new Subject<Frame>();
    const source2 = new Subject<Frame>();
    const port = new InputPort();
    const received: Frame[] = [];
    port.stream$.subscribe(f => received.push(f));

    port.connect(source1.asObservable());
    source1.next(makeFrame());

    port.connect(source2.asObservable());
    source1.next(makeFrame()); // old source, should be ignored
    source2.next(makeFrame());

    expect(received).toHaveLength(2);
  });

  it('works as a bridge between OutputPort and subscriber', () => {
    const output = new OutputPort();
    const input = new InputPort();
    const received: Frame[] = [];
    input.stream$.subscribe(f => received.push(f));

    input.connect(output.stream$);
    output.emit(makeFrame());

    expect(received).toHaveLength(1);
  });
});
