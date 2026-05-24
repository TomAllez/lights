import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { AsyncModule } from '@lights/module';
import { Frame, FrameEvent } from '@lights/io';
import { AvailableModule } from './available-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGES_PATH = path.resolve(__dirname, '../../../py');

export type PythonModuleOptions = {
  python?: string;
  packagesPath?: string;
  /** Extra CLI arguments forwarded to the python script (e.g. ['--width', '640', '--height', '480']) */
  scriptArgs?: string[];
};

export class PythonModule extends AsyncModule {
  private pythonProcess: ChildProcess | undefined;

  // Pre-allocated stdout accumulation buffer — avoids Buffer.concat per chunk.
  // 64 KB covers the largest expected detection payload (full face mesh ≈ 6 KB).
  // Grows dynamically if needed.
  private stdoutBuffer = Buffer.allocUnsafe(64 * 1024);
  private stdoutFill = 0;

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
    this.pythonProcess?.kill('SIGTERM');
    this.pythonProcess = undefined;
    for (const resolve of this.pendingResolvers) resolve([]);
    this.pendingResolvers = [];
    this.stdoutFill = 0;
    super.passthrough();
  }

  override stop(): void {
    super.stop();
    this.pythonProcess?.kill('SIGTERM');
    this.pythonProcess = undefined;
    for (const resolve of this.pendingResolvers) resolve([]);
    this.pendingResolvers = [];
    this.stdoutFill = 0;
  }

  async process(frame: Frame): Promise<Frame> {
    this.sendFrameToPython(frame);

    const pythonEvents = await new Promise<FrameEvent[]>(resolve => {
      this.pendingResolvers.push(resolve);
    });

    // Share the original frame's data buffer — no copy needed since only events changed.
    return frame.withEvents([...frame.getEvents(), ...pythonEvents]);
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
    // Grow accumulation buffer if needed.
    if (this.stdoutFill + chunk.length > this.stdoutBuffer.length) {
      const newBuf = Buffer.allocUnsafe(Math.max(this.stdoutBuffer.length * 2, this.stdoutFill + chunk.length));
      this.stdoutBuffer.copy(newBuf, 0, 0, this.stdoutFill);
      this.stdoutBuffer = newBuf;
    }

    chunk.copy(this.stdoutBuffer, this.stdoutFill);
    this.stdoutFill += chunk.length;

    while (this.stdoutFill >= 4) {
      const responseLen = this.stdoutBuffer.readUInt32LE(0);
      if (this.stdoutFill < 4 + responseLen) break;

      const responseJson = this.stdoutBuffer.subarray(4, 4 + responseLen).toString('utf8');

      // Shift remaining bytes to front.
      this.stdoutBuffer.copy(this.stdoutBuffer, 0, 4 + responseLen, this.stdoutFill);
      this.stdoutFill -= 4 + responseLen;

      try {
        const response = JSON.parse(responseJson) as { events: Array<{ type: string; data: number[] }> };
        const events: FrameEvent[] = (response.events ?? []).map(e => ({
          type: e.type,
          data: new Uint8Array(e.data),
        }));
        this.pendingResolvers.shift()?.(events);
      } catch (err) {
        console.error(`[python-${this.scriptPath}] failed to parse response: ${err}`);
        this.pendingResolvers.shift()?.([]);
      }
    }
  }
}
