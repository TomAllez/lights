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

/**
 * Driver that captures video from a macOS camera via FFmpeg (avfoundation).
 * Emits one Frame per video frame with raw RGB24 pixel data.
 *
 * @param {FfmpegDriverOptions} options - Capture configuration
 */
export class FfmpegDriver extends BaseDriver {
  private process: ChildProcess | undefined;
  private buffer = Buffer.alloc(0);

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
  }

  /**
   * Spawns the ffmpeg process and begins emitting frames.
   */
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
      this.buffer = Buffer.concat([this.buffer, chunk]);

      while (this.buffer.length >= this.frameSize) {
        const frameData = this.buffer.subarray(0, this.frameSize);
        this.buffer = this.buffer.subarray(this.frameSize);

        this.output.emit(
          createFrame({
            timestamp: Date.now(),
            duration: Math.round(1000 / this.fps),
            metadata: { [this.partName]: { offset: 0, size: this.frameSize } },
            data: new Uint8Array(frameData),
            events: [],
          }),
        );
      }
    });
  }

  /**
   * Kills the ffmpeg process and clears the internal buffer.
   * Sends SIGTERM first; if the process has not exited within 2 s
   * (e.g. while avfoundation holds the camera device), escalates to SIGKILL.
   */
  stop(): void {
    const proc = this.process;
    this.process = undefined;
    this.buffer = Buffer.alloc(0);
    if (!proc) return;

    proc.kill('SIGTERM');
    const forceKill = setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 2000);
    proc.once('exit', () => clearTimeout(forceKill));
  }
}
