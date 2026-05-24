/**
 * Benchmarks Python subprocess IPC round-trip latency.
 *
 * Two scenarios:
 *   1. Echo module  — reads the frame, returns {} with no inference.
 *      Isolates serialization + pipe + Python I/O overhead from ML cost.
 *   2. Handpose     — runs real MediaPipe hand landmark detection.
 *      Measures end-to-end inference latency on a synthetic blank frame.
 *
 * Requires Python 3 on PATH. Handpose additionally requires MediaPipe:
 *   pip install mediapipe numpy
 *
 * Run with: yarn nx run @lights/bench:bench
 */

import { bench, describe } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { createFrame } from '@lights/io';
import { PythonModule, AvailableModule } from '@lights/python-module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_PACKAGES = path.resolve(__dirname, '../../../../packages/py');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildIpcPayload(width: number, height: number): Buffer {
  const pixels = new Uint8Array(width * height * 3);
  const header = JSON.stringify({
    timestamp: Date.now(),
    duration: 33,
    metadata: { video: { offset: 0, size: pixels.length } },
  });
  const headerBytes = Buffer.from(header, 'utf8');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32LE(headerBytes.length, 0);
  return Buffer.concat([lenBuf, headerBytes, Buffer.from(pixels)]);
}

function readOneResponse(proc: ChildProcess): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length >= 4) {
        const len = buf.readUInt32LE(0);
        if (buf.length >= 4 + len) {
          proc.stdout!.off('data', onData);
          resolve();
        }
      }
    };

    proc.stdout!.on('data', onData);
    proc.stderr!.once('data', (d: Buffer) => reject(new Error(d.toString().trim())));
  });
}

// ─── Echo IPC — subprocess + pipe + serialization overhead ───────────────────

const echoScript = path.join(PY_PACKAGES, 'echo', 'main.py');
const echoProc = spawn('python3', [echoScript], { stdio: ['pipe', 'pipe', 'pipe'] });
echoProc.stdout!.setMaxListeners(100);
echoProc.stderr!.setMaxListeners(100);

const payload320 = buildIpcPayload(320, 240);
const payload640 = buildIpcPayload(640, 480);

// Warm-up: one round-trip so Python's import overhead isn't counted
echoProc.stdin!.write(payload640);
await readOneResponse(echoProc);

describe('Python IPC — echo (no inference)', () => {
  bench('round-trip 320×240 (echo)', async () => {
    echoProc.stdin!.write(payload320);
    await readOneResponse(echoProc);
  });

  bench('round-trip 640×480 (echo)', async () => {
    echoProc.stdin!.write(payload640);
    await readOneResponse(echoProc);
  });
});

// ─── Handpose — end-to-end inference latency ──────────────────────────────────

const frame640 = createFrame({
  timestamp: Date.now(),
  duration: 33,
  metadata: { video: { offset: 0, size: 640 * 480 * 3 } },
  data: new Uint8Array(640 * 480 * 3),
  events: [],
});

const handposeModule = new PythonModule(AvailableModule.HandPoseEstimation, {
  packagesPath: PY_PACKAGES,
  scriptArgs: ['--width', '640', '--height', '480'],
});
handposeModule.start();

// Warm-up: one inference to load the model before timing
await (handposeModule as unknown as { process(f: typeof frame640): Promise<typeof frame640> }).process(frame640);

describe('Python IPC — handpose (MediaPipe inference)', () => {
  bench('handpose inference @ 640×480 (blank frame)', async () => {
    await (handposeModule as unknown as { process(f: typeof frame640): Promise<typeof frame640> }).process(frame640);
  });
});
