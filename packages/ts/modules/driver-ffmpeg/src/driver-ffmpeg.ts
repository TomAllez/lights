import { spawn, ChildProcess } from 'child_process';
import { BaseDriver } from '@lights/driver';
import { createFrame } from '@lights/io';

export type FfmpegDriverOptions = {
  /** avfoundation device index or name, default "0" (first camera) */
  device?: string;
  /** capture width in pixels, default 640 */
  width?: number;
  /** capture height in pixels, default 480 */
  height?: number;
  /** frames per second, default 30 */
  fps?: number;
  /** name of the video part in emitted Frames, default "video" */
  partName?: string;
};

export class FfmpegDriver extends BaseDriver {
  private process: ChildProcess | undefined;

  // Pre-allocated accumulation buffer — avoids Buffer.concat on every chunk.
  // Sized at 2× frameSize so it can hold one full in-progress frame plus any
  // leftover bytes from the previous read. Grows dynamically if a single chunk
  // ever exceeds the available headroom (rare in practice).
  private accumBuffer: Buffer;
  private accumFill = 0;

  private readonly device: string;
  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;
  private readonly partName: string;
  private readonly frameSize: number;

  constructor(options: FfmpegDriverOptions = {}) {
    super();
    this.device = options.device ?? '0';
    this.width = options.width ?? 640;
    this.height = options.height ?? 480;
    this.fps = options.fps ?? 30;
    this.partName = options.partName ?? 'video';
    this.frameSize = this.width * this.height * 3; // RGB24: 3 bytes per pixel
    this.accumBuffer = Buffer.allocUnsafe(this.frameSize * 2);
  }

  start(): void {
    this.process = spawn(
      'ffmpeg',
      [
        '-f', 'avfoundation',
        '-framerate', String(this.fps),
        '-i', this.device,
        '-vf', `scale=${this.width}:${this.height}`,
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );

    this.process.stdout?.on('data', (chunk: Buffer) => {
      // Grow accumulator if a single chunk exceeds remaining capacity.
      if (this.accumFill + chunk.length > this.accumBuffer.length) {
        const newBuf = Buffer.allocUnsafe(Math.max(this.accumBuffer.length * 2, this.accumFill + chunk.length));
        this.accumBuffer.copy(newBuf, 0, 0, this.accumFill);
        this.accumBuffer = newBuf;
      }

      chunk.copy(this.accumBuffer, this.accumFill);
      this.accumFill += chunk.length;

      while (this.accumFill >= this.frameSize) {
        // Copy out the completed frame before advancing (buffer will be reused).
        const frameData = new Uint8Array(this.frameSize);
        frameData.set(this.accumBuffer.subarray(0, this.frameSize));

        // Shift remaining bytes to the front.
        this.accumBuffer.copy(this.accumBuffer, 0, this.frameSize, this.accumFill);
        this.accumFill -= this.frameSize;

        this.output.emit(
          createFrame({
            timestamp: Date.now(),
            duration: Math.round(1000 / this.fps),
            metadata: { [this.partName]: { offset: 0, size: this.frameSize } },
            data: frameData,
            events: [],
          }),
        );
      }
    });
  }

  stop(): void {
    this.process?.kill('SIGTERM');
    this.process = undefined;
    this.accumFill = 0;
  }
}
