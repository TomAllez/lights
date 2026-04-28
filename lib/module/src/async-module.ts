import { Subscription, exhaustMap, from } from 'rxjs';
import { Frame, InputPort, OutputPort } from '@lights/io';

export abstract class AsyncModule {
  readonly input = new InputPort();
  readonly output = new OutputPort();
  private subscription: Subscription | undefined;

  abstract process(frame: Frame): Promise<Frame>;

  start(): void {
    this.subscription = this.input.stream$.pipe(
      exhaustMap(frame => from(this.process(frame))),
    ).subscribe(frame => this.output.emit(frame));
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }
}
