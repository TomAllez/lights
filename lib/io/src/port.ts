import { Observable, Subject, Subscription } from 'rxjs';
import { Frame } from './frame';

export class InputPort {
  private _subject = new Subject<Frame>();
  private _subscription: Subscription | undefined;

  readonly stream$: Observable<Frame> = this._subject.asObservable();

  get connected(): boolean {
    return this._subscription !== undefined;
  }

  connect(source: Observable<Frame>): void {
    this.disconnect();
    this._subscription = source.subscribe(this._subject);
  }

  disconnect(): void {
    this._subscription?.unsubscribe();
    this._subscription = undefined;
  }
}

export class OutputPort {
  private _subject = new Subject<Frame>();

  readonly stream$: Observable<Frame> = this._subject.asObservable();

  emit(frame: Frame): void {
    this._subject.next(frame);
  }
}
