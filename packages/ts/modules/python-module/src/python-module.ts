import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncModule } from '@lights/module';
import { Frame, FrameEvent, createFrame } from '@lights/io';
import { AvailableModule } from './available-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGES_PATH = path.resolve(__dirname, '../../../../py');

export type PythonModuleOptions = {
  python?: string;
  packagesPath?: string;
  /** Extra CLI arguments forwarded to the python script (e.g. ['--width', '640', '--height', '480']) */
  scriptArgs?: string[];
};

export class PythonModule extends AsyncModule {
  private pythonProcess: ChildProcess | undefined;
  private stdoutBuffer = Buffer.alloc(0);
  private pendingResolvers: Array<(events: FrameEvent[]) => void> = [];

  private readonly python: string;
  private readonly scriptPath: string;
  private readonly scriptArgs: string[];

  constructor(moduleType: AvailableModule, options: PythonModuleOptions = {}) {
    super();
    this.python = options.python ?? 'python3';
    const packagesPath = options.packagesPath ?? DEFAULT_PACKAGES_PATH;
    this.scriptPath = path.join(packagesPath, moduleType, 'main.py');
    this.scriptArgs = options.scriptArgs ?? [];
  }

  override start(): void {
    if (!this.pythonProcess) {
      this.spawnPython();
    }
    super.start();
  }

  override passthrough(): void {
    this.terminatePythonProcess();
    this.drainPendingResolvers();
    super.passthrough();
  }

  override stop(): void {
    super.stop();
    this.terminatePythonProcess();
    this.drainPendingResolvers();
  }

  /**
   * Sends SIGTERM to the Python process and escalates to SIGKILL after 2 s
   * if it has not exited (e.g. while blocked inside a native MediaPipe call).
   * Clears the reference immediately so no further frames are sent.
   */
  private terminatePythonProcess(): void {
    const proc = this.pythonProcess;
    this.pythonProcess = undefined;
    if (!proc) return;

    proc.kill('SIGTERM');
    const forceKill = setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 2000);
    proc.once('exit', () => clearTimeout(forceKill));
  }

  private drainPendingResolvers(): void {
    for (const resolve of this.pendingResolvers) resolve([]);
    this.pendingResolvers = [];
    this.stdoutBuffer = Buffer.alloc(0);
  }

  async process(frame: Frame): Promise<Frame> {
    this.sendFrameToPython(frame);

    const pythonEvents = await new Promise<FrameEvent[]>(resolve => {
      this.pendingResolvers.push(resolve);
    });

    return rebuildFrame(frame, [...frame.getEvents(), ...pythonEvents]);
  }

  private spawnPython(): void {
    this.pythonProcess = spawn(this.python, [this.scriptPath, ...this.scriptArgs], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.pythonProcess.stdout?.on('data', (chunk: Buffer) => this.handleStdout(chunk));

    this.pythonProcess.stderr?.on('data', (chunk: Buffer) => {
      console.error(`[python-${this.scriptPath}] ${chunk.toString().trim()}`);
    });

    this.pythonProcess.on('error', (err) => {
      console.error(`[python-${this.scriptPath}] process error: ${err.message}`);
    });

    this.pythonProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[python-${this.scriptPath}] exited with code ${code}`);
      }
      // Drain any pending process() calls so they don't hang if the process
      // died unexpectedly (e.g. OOM, signal from outside) rather than via stop().
      this.drainPendingResolvers();
    });
  }

  private sendFrameToPython(frame: Frame): void {
    if (!this.pythonProcess?.stdin?.writable) return;

    const partNames = frame.getPartsName();
    const metadata: Record<string, { offset: number; size: number }> = {};
    const parts: Uint8Array[] = [];
    let offset = 0;

    for (const name of partNames) {
      const partData = frame.getPart(name);
      if (partData) {
        metadata[name] = { offset, size: partData.length };
        parts.push(partData);
        offset += partData.length;
      }
    }

    const header = JSON.stringify({
      timestamp: frame.getTimestamp(),
      duration: frame.getDuration(),
      metadata,
    });

    const headerBytes = Buffer.from(header, 'utf8');
    const headerLenBuf = Buffer.allocUnsafe(4);
    headerLenBuf.writeUInt32LE(headerBytes.length, 0);

    this.pythonProcess.stdin.write(headerLenBuf);
    this.pythonProcess.stdin.write(headerBytes);
    for (const part of parts) {
      this.pythonProcess.stdin.write(part);
    }
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);

    while (this.stdoutBuffer.length >= 4) {
      const responseLen = this.stdoutBuffer.readUInt32LE(0);
      if (this.stdoutBuffer.length < 4 + responseLen) break;

      const responseJson = this.stdoutBuffer.subarray(4, 4 + responseLen).toString('utf8');
      this.stdoutBuffer = this.stdoutBuffer.subarray(4 + responseLen);

      try {
        const response = JSON.parse(responseJson) as { events: Array<{ type: string; data: string }> };
        const events: FrameEvent[] = (response.events ?? []).map(e => ({
          type: e.type,
          data: Buffer.from(e.data, 'base64'),
        }));
        this.pendingResolvers.shift()?.(events);
      } catch (err) {
        console.error(`[python-${this.scriptPath}] failed to parse response: ${err}`);
        this.pendingResolvers.shift()?.([]);
      }
    }
  }
}

function rebuildFrame(frame: Frame, events: FrameEvent[]): Frame {
  const partNames = frame.getPartsName();
  const metadata: Record<string, { offset: number; size: number }> = {};
  const buffers: Uint8Array[] = [];
  let offset = 0;

  for (const name of partNames) {
    const partData = frame.getPart(name);
    if (partData) {
      metadata[name] = { offset, size: partData.length };
      buffers.push(partData);
      offset += partData.length;
    }
  }

  const totalSize = buffers.reduce((sum, b) => sum + b.length, 0);
  const data = new Uint8Array(totalSize);
  let pos = 0;
  for (const buf of buffers) {
    data.set(buf, pos);
    pos += buf.length;
  }

  return createFrame({
    timestamp: frame.getTimestamp(),
    duration: frame.getDuration(),
    metadata,
    data,
    events,
  });
}
