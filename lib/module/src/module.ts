import { BehaviorSubject, Observable, map } from 'rxjs';
import { Frame } from '@lights/io';

/**
 * Interface representing a module that can process frames.
 * @interface BaseModuleInterface
 * @property {Observable<Frame | undefined>} output$ - Observable stream of processed or passed-through frames
 */
export interface BaseModuleInterface {
  /**
   * Observable stream of frames.
   */
  output$: Observable<Frame | undefined>;
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
 * It handles an input stream of frames and applies a transformation process if started.
 * If stopped, it passes frames through untouched.
 * 
 * @param {Observable<Frame>} input$ - The input stream of frames
 * @param {string} id - Unique identifier for the module
 * @property {Observable<Frame | undefined>} output$ - The resulting stream of frames
 */
export class BaseModule implements BaseModuleInterface {
  private running$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private process: ((frame: Frame) => Frame) | undefined = undefined;

  public output$: Observable<Frame | undefined>;

  /**
   * Creates an instance of BaseModule.
   * @param {Observable<Frame>} input$ - The input stream of frames
   * @param {string} id - Unique identifier for the module
   */
  constructor(
    private input$: Observable<Frame>,
    private id: string
  ) {
    this.output$ = this.input$.pipe(
      map((frame) => {
        if (this.running$.value) {
          if(!this.process)
            console.log(`[${this.id}] No process attached, frame will be returned as is`);
          return this.process ? this.process(frame) : frame;
        }
        return frame;
      })
    );
  }

  /**
   * Starts the processing mode.
   */
  start() {
    this.running$.next(true);
  }

  /**
   * Stops the processing mode, enabling passthrough.
   */
  stop() {
    this.running$.next(false);
  }

  /**
   * Attaches a transformation function to be applied to frames.
   * @param {function(Frame): Frame} process - Function that takes a Frame and returns a Frame
   */
  attachProcess(process: (frame: Frame) => Frame) {
    this.process = process;
  }
}