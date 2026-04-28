import { Subscription, exhaustMap, from } from 'rxjs';
import { Frame, InputPort, OutputPort } from '@lights/io';

/**
 * Abstract base class for async frame-processing modules.
 * Subclasses implement {@link process} to transform frames asynchronously.
 * Uses `exhaustMap` so a new frame is ignored while the previous one is still being processed.
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
   * Starts processing frames from the input port.
   */
  start(): void {
    this.subscription = this.input.stream$.pipe(
      exhaustMap(frame => from(this.process(frame))),
    ).subscribe(frame => this.output.emit(frame));
  }

  /**
   * Stops processing and unsubscribes from the input stream.
   */
  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}
