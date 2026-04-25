import { BehaviorSubject, map } from 'rxjs';
import { Frame, InputPort, OutputPort } from '@lights/io';

/**
 * Interface representing a module that can process frames.
 * @interface BaseModuleInterface
 * @property {InputPort} input - Input port receiving frames to process
 * @property {OutputPort} output - Output port emitting processed or passed-through frames
 */
export interface BaseModuleInterface {
  /**
   * Input port receiving frames to process.
   */
  input: InputPort;
  /**
   * Output port emitting processed or passed-through frames.
   */
  output: OutputPort;
  /**
   * Starts the module processing.
   */
  start(): void;
  /**
   * Stops the module processing (frames will pass through).
   */
  stop(): void;
  /**
   * Attaches a process function to transform frames when the module is running.
   * @param {function(Frame): Frame} process - The transformation function
   */
  attachProcess(process: (frame: Frame) => Frame): void;
}

/**
 * Base implementation of a module.
 * It handles an input port of frames and applies a transformation process if started.
 * If stopped, it passes frames through untouched.
 *
 * @param {string} id - Unique identifier for the module
 * @property {InputPort} input - The input port receiving frames
 * @property {OutputPort} output - The output port emitting frames
 */
export class BaseModule implements BaseModuleInterface {
  private running$ = new BehaviorSubject<boolean>(false);
  private process: ((frame: Frame) => Frame) | undefined;

  readonly input = new InputPort();
  readonly output = new OutputPort();

  /**
   * Creates an instance of BaseModule.
   * @param {string} id - Unique identifier for the module
   */
  constructor(private id: string) {
    this.input.stream$.pipe(
      map((frame) => {
        if (this.running$.value) {
          if (!this.process)
            console.log(`[${this.id}] No process attached, frame will be returned as is`);
          return this.process ? this.process(frame) : frame;
        }
        return frame;
      })
    ).subscribe(frame => this.output.emit(frame));
  }

  /**
   * Starts the processing mode.
   */
  start() { this.running$.next(true); }

  /**
   * Stops the processing mode, enabling passthrough.
   */
  stop() { this.running$.next(false); }

  /**
   * Attaches a transformation function to be applied to frames.
   * @param {function(Frame): Frame} process - Function that takes a Frame and returns a Frame
   */
  attachProcess(process: (frame: Frame) => Frame) { this.process = process; }
}
