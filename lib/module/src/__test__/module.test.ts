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
    const input$ = new Subject<Frame>();
    const module = new BaseModule(input$, 'test-module');
    const results: (Frame | undefined)[] = [];

    module.output$.subscribe(f => results.push(f));
    module.start();

    input$.next(mockFrame);

    expect(results).toContain(mockFrame);
    module.stop();
  });

  it('should apply process function to frames', () => {
    const input$ = new Subject<Frame>();
    const module = new BaseModule(input$, 'test-module');
    const processedFrame = createFrame({
      timestamp: mockFrame.getTimestamp(),
      duration: 200,
      metadata: {},
      data: new Uint8Array(),
      events: []
    });
    const process = vi.fn().mockReturnValue(processedFrame);
    const results: (Frame | undefined)[] = [];

    module.attachProcess(process);
    module.output$.subscribe(f => results.push(f));
    module.start();

    input$.next(mockFrame);

    expect(process).toHaveBeenCalledWith(mockFrame);
    expect(results).toContain(processedFrame);
    module.stop();
  });

  it('should pass through frames even when stop() is called', () => {
    const input$ = new Subject<Frame>();
    const module = new BaseModule(input$, 'test-module');
    const results: (Frame | undefined)[] = [];

    module.output$.subscribe(f => results.push(f));
    module.start();
    input$.next(mockFrame);
    expect(results.filter(f => f !== undefined).length).toBe(1);

    module.stop();
    input$.next(mockFrame);
    // Should now be 2 because it passes through when stopped
    expect(results.filter(f => f !== undefined).length).toBe(2);
    expect(results[results.length - 1]).toBe(mockFrame);
  });
});
