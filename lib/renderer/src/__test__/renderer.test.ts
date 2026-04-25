import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import { BaseRenderer } from '../renderer';
import { Frame, createFrame } from '@lights/io';

describe('BaseRenderer', () => {
  const mockFrame: Frame = createFrame({
    timestamp: Date.now(),
    duration: 100,
    metadata: {},
    data: new Uint8Array(),
    events: [],
  });

  it('calls the process function when started', () => {
    const source$ = new Subject<Frame>();
    const renderer = new BaseRenderer('test-renderer');
    const process = vi.fn();

    renderer.input.connect(source$.asObservable());
    renderer.attachProcess(process);
    renderer.start();

    source$.next(mockFrame);

    expect(process).toHaveBeenCalledOnce();
    expect(process).toHaveBeenCalledWith(mockFrame);
  });

  it('drops frames when stopped', () => {
    const source$ = new Subject<Frame>();
    const renderer = new BaseRenderer('test-renderer');
    const process = vi.fn();

    renderer.input.connect(source$.asObservable());
    renderer.attachProcess(process);

    source$.next(mockFrame);

    expect(process).not.toHaveBeenCalled();
  });

  it('stops calling the process after stop()', () => {
    const source$ = new Subject<Frame>();
    const renderer = new BaseRenderer('test-renderer');
    const process = vi.fn();

    renderer.input.connect(source$.asObservable());
    renderer.attachProcess(process);
    renderer.start();

    source$.next(mockFrame);
    expect(process).toHaveBeenCalledOnce();

    renderer.stop();
    source$.next(mockFrame);
    expect(process).toHaveBeenCalledOnce();
  });

  it('can replace the attached process', () => {
    const source$ = new Subject<Frame>();
    const renderer = new BaseRenderer('test-renderer');
    const process1 = vi.fn();
    const process2 = vi.fn();

    renderer.input.connect(source$.asObservable());
    renderer.attachProcess(process1);
    renderer.start();

    source$.next(mockFrame);
    renderer.attachProcess(process2);
    source$.next(mockFrame);

    expect(process1).toHaveBeenCalledOnce();
    expect(process2).toHaveBeenCalledOnce();
  });
});
