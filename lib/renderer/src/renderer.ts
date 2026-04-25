import { BehaviorSubject } from 'rxjs';
import { Frame, InputPort } from '@lights/io';

/**
 * Interface representing a renderer that consumes frames.
 * @interface BaseRendererInterface
 * @property {InputPort} input - Input port receiving frames to render
 */
export interface BaseRendererInterface {
  /**
   * Input port receiving frames to render.
   */
  input: InputPort;
  /**
   * Starts the renderer — an attached process will be called for each incoming frame.
   */
  start(): void;
  /**
   * Stops the renderer — incoming frames are dropped.
   */
  stop(): void;
  /**
   * Attaches a render function to be called for each frame when running.
   * @param {function(Frame): void} process - The render function
   */
  attachProcess(process: (frame: Frame) => void): void;
}

/**
 * Base implementation of a renderer.
 * Terminal sink in the graph: receives frames and passes them to an attached render function.
 * Frames are dropped when stopped.
 *
 * @param {string} id - Unique identifier for the renderer
 * @property {InputPort} input - The input port receiving frames
 */
export class BaseRenderer implements BaseRendererInterface {
  private running$ = new BehaviorSubject<boolean>(false);
  private process: ((frame: Frame) => void) | undefined;

  readonly input = new InputPort();

  /**
   * Creates an instance of BaseRenderer.
   * @param {string} id - Unique identifier for the renderer
   */
  constructor(private id: string) {
    this.input.stream$.subscribe((frame:Frame) => {
      if (this.running$.value) {
        if (!this.process)
          console.log(`[${this.id}] No process attached, frame will be dropped`);
        else
          this.process(frame);
      }
    });
  }

  /**
   * Starts the rendering mode.
   */
  start() { this.running$.next(true); }

  /**
   * Stops the rendering mode — frames are dropped.
   */
  stop() { this.running$.next(false); }

  /**
   * Attaches a render function to be called for each frame.
   * @param {function(Frame): void} process - Function that takes a Frame and renders it
   */
  attachProcess(process: (frame: Frame) => void) { this.process = process; }
}
