import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { BaseModule } from '@lights/module';
import { Frame, FrameEvent, createFrame } from '@lights/io';
import { AvailableModule } from './available-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGES_PATH = path.resolve(__dirname, '../../../py');

export type PythonModuleOptions = {
  python?: string;
  packagesPath?: string;
  /** Extra CLI arguments forwarded to the python script (e.g. ['--width', '640', '--height', '480']) */
  scriptArgs?: string[];
};

export class PythonModule extends BaseModule {
  private pythonProcess: ChildProcess | undefined;
  private stdoutBuffer = Buffer.alloc(0);
  private pendingEvents: FrameEvent[] = [];

  private readonly python: string;
  private readonly scriptPath: string;
  private readonly scriptArgs: string[];

  constructor(moduleType: AvailableModule, options: PythonModuleOptions = {}) {
    super(`python-${moduleType}`);
    this.python = options.python ?? 'python3';
    const packagesPath = options.packagesPath ?? DEFAULT_PACKAGES_PATH;
    this.scriptPath = path.join(packagesPath, moduleType, 'main.py');
    this.scriptArgs = options.scriptArgs ?? [];
  }

  override start(): void {
    this.spawnPython();
    this.attachProcess((frame) => this.processFrame(frame));
    super.start();
  }

  override stop(): void {
    super.stop();
    this.pythonProcess?.kill('SIGTERM');
    this.pythonProcess = undefined;
    this.pendingEvents = [];
    this.stdoutBuffer = Buffer.alloc(0);
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

  private processFrame(frame: Frame): Frame {
    this.sendFrameToPython(frame);

    const events = [...frame.getEvents(), ...this.pendingEvents];
    this.pendingEvents = [];

    return rebuildFrame(frame, events);
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
        const response = JSON.parse(responseJson) as { events: Array<{ type: string; data: number[] }> };
        this.pendingEvents = (response.events ?? []).map(e => ({
          type: e.type,
          data: new Uint8Array(e.data),
        }));
      } catch (err) {
        console.error(`[python-${this.scriptPath}] failed to parse response: ${err}`);
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
