import { Observable, Subject, Subscription } from 'rxjs';
import { Frame } from './frame';

/**
 * Receives frames from an upstream {@link OutputPort}.
 * Connect a source observable to start receiving frames; disconnect to stop.
 *
 * @property {Observable<Frame>} stream$ - Observable of frames received from the connected source
 */
export class InputPort {
  private _subject = new Subject<Frame>();
  private _subscription: Subscription | undefined;

  /**
   * Observable of frames received from the connected source.
   */
  readonly stream$: Observable<Frame> = this._subject.asObservable();

  /**
   * Whether this port is currently connected to a source.
   */
  get connected(): boolean {
    return this._subscription !== undefined;
  }

  /**
   * Connects this port to an upstream frame source.
   * Disconnects any existing connection first.
   * @param {Observable<Frame>} source - The upstream observable to subscribe to
   */
  connect(source: Observable<Frame>): void {
    this.disconnect();
    this._subscription = source.subscribe(this._subject);
  }

  /**
   * Disconnects from the current source, stopping frame delivery.
   */
  disconnect(): void {
    this._subscription?.unsubscribe();
    this._subscription = undefined;
  }
}

/**
 * Emits frames to downstream consumers via its observable stream.
 *
 * @property {Observable<Frame>} stream$ - Observable that downstream ports can subscribe to
 */
export class OutputPort {
  private _subject = new Subject<Frame>();

  /**
   * Observable that downstream ports can subscribe to.
   */
  readonly stream$: Observable<Frame> = this._subject.asObservable();

  /**
   * Emits a frame to all downstream subscribers.
   * @param {Frame} frame - The frame to emit
   */
  emit(frame: Frame): void {
    this._subject.next(frame);
  }
}
