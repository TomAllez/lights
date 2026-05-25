import { readFileSync } from 'fs';
import { BaseDriver } from '@lights/driver';
import { createFrame } from '@lights/io';

export type FrameSource =
  | { kind: 'synthetic'; width: number; height: number; fill?: [number, number, number] }
  | { kind: 'file'; path: string; width: number; height: number };

export type TickMode =
  | { mode: 'interval'; fps: number }
  | { mode: 'demand' };

export type SyntheticDriverOptions = {
  source: FrameSource;
  tick: TickMode;
  partName?: string;
  loop?: boolean;
};

export class SyntheticDriver extends BaseDriver {
  private frames: Uint8Array[] = [];
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private _framesEmitted = 0;
  private started = false;

  private readonly source: FrameSource;
  private readonly tickMode: TickMode;
  private readonly partName: string;
  private readonly loop: boolean;
  private readonly frameSize: number;

  constructor(options: SyntheticDriverOptions) {
    super();
    this.source = options.source;
    this.tickMode = options.tick;
    this.partName = options.partName ?? 'video';
    this.loop = options.loop ?? true;
    this.frameSize = options.source.width * options.source.height * 3;
  }

  get framesEmitted(): number { return this._framesEmitted; }

  start(): void {
    this.loadFrames();
    this.started = true;
    if (this.tickMode.mode === 'interval') {
      this.timer = setInterval(() => this.tick(), Math.round(1000 / this.tickMode.fps));
    }
  }

  stop(): void {
    this.started = false;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.frames = [];
    this.frameIndex = 0;
    this._framesEmitted = 0;
  }

  tick(): void {
    if (!this.started || this.frames.length === 0) return;
    if (this.frameIndex >= this.frames.length) {
      if (!this.loop) return;
      this.frameIndex = 0;
    }
    const frameData = this.frames[this.frameIndex++];
    this._framesEmitted++;
    const duration = this.tickMode.mode === 'interval'
      ? Math.round(1000 / this.tickMode.fps)
      : 33;
    this.output.emit(
      createFrame({
        timestamp: Date.now(),
        duration,
        metadata: { [this.partName]: { offset: 0, size: this.frameSize } },
        data: new Uint8Array(frameData),
        events: [],
      }),
    );
  }

  private loadFrames(): void {
    if (this.source.kind === 'synthetic') {
      const fill = this.source.fill ?? [255, 255, 255];
      const frame = new Uint8Array(this.frameSize);
      for (let i = 0; i < this.frameSize; i += 3) {
        frame[i] = fill[0];
        frame[i + 1] = fill[1];
        frame[i + 2] = fill[2];
      }
      this.frames = [frame];
    } else {
      const raw = readFileSync(this.source.path);
      const totalFrames = Math.floor(raw.length / this.frameSize);
      this.frames = [];
      for (let i = 0; i < totalFrames; i++) {
        this.frames.push(new Uint8Array(raw.buffer, raw.byteOffset + i * this.frameSize, this.frameSize));
      }
    }
    this.frameIndex = 0;
  }
}
