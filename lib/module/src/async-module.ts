import { Subscription, concatMap, from } from 'rxjs';
import { Frame, InputPort, OutputPort } from '@lights/io';

/**
 * Abstract base class for async frame-processing modules.
 * Subclasses implement {@link process} to transform frames asynchronously.
 * Uses `concatMap` so frames are queued and processed in order.
 * Apply `strategy: 'latest'` on the graph edge to drop frames before they reach the module.
 *
 * @property {InputPort} input - The input port receiving frames
 * @property {OutputPort} output - The output port emitting processed frames
 */
export abstract class AsyncModule {
  /**
   * Input port receiving frames to process.
   */
  readonly input = new InputPort();
  /**
   * Output port emitting processed frames.
   */
  readonly output = new OutputPort();
  private subscription: Subscription | undefined;

  /**
   * Asynchronously transforms a frame.
   * @param {Frame} frame - The frame to process
   * @returns {Promise<Frame>} The processed frame
   */
  abstract process(frame: Frame): Promise<Frame>;

  /**
   * Starts active processing: frames are passed through {@link process} via concatMap.
   */
  start(): void {
    this.subscription?.unsubscribe();
    this.subscription = this.input.stream$.pipe(
      concatMap(frame => from(this.process(frame))),
    ).subscribe(frame => this.output.emit(frame));
  }

  /**
   * Switches to passthrough mode: frames are forwarded unchanged without processing.
   */
  passthrough(): void {
    this.subscription?.unsubscribe();
    this.subscription = this.input.stream$.subscribe(frame => this.output.emit(frame));
  }

  /**
   * Stops all frame flow and unsubscribes from the input stream.
   */
  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}
