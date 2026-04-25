import { describe, it, expect, vi } from 'vitest';
import { Subject } from 'rxjs';
import { BaseModule } from '../module';
import { Frame, createFrame } from '@lights/io';

describe('BaseModule', () => {
  const mockFrame: Frame = createFrame({
    timestamp: Date.now(),
    duration: 100,
    metadata: {},
    data: new Uint8Array(),
    events: []
  });

  it('should pass through frames when no process is attached', () => {
    const source$ = new Subject<Frame>();
    const module = new BaseModule('test-module');
    const results: Frame[] = [];

    module.input.connect(source$.asObservable());
    module.output.stream$.subscribe(f => results.push(f));
    module.start();

    source$.next(mockFrame);

    expect(results).toContain(mockFrame);
    module.stop();
  });

  it('should apply process function to frames', () => {
    const source$ = new Subject<Frame>();
    const module = new BaseModule('test-module');
    const processedFrame = createFrame({
      timestamp: mockFrame.getTimestamp(),
      duration: 200,
      metadata: {},
      data: new Uint8Array(),
      events: []
    });
    const process = vi.fn().mockReturnValue(processedFrame);
    const results: Frame[] = [];

    module.input.connect(source$.asObservable());
    module.attachProcess(process);
    module.output.stream$.subscribe(f => results.push(f));
    module.start();

    source$.next(mockFrame);

    expect(process).toHaveBeenCalledWith(mockFrame);
    expect(results).toContain(processedFrame);
    module.stop();
  });

  it('should pass through frames even when stop() is called', () => {
    const source$ = new Subject<Frame>();
    const module = new BaseModule('test-module');
    const results: Frame[] = [];

    module.input.connect(source$.asObservable());
    module.output.stream$.subscribe(f => results.push(f));
    module.start();

    source$.next(mockFrame);
    expect(results.length).toBe(1);

    module.stop();
    source$.next(mockFrame);
    expect(results.length).toBe(2);
    expect(results[results.length - 1]).toBe(mockFrame);
  });
});
