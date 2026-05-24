/**
 * Benchmarks the buffer copy patterns in the hot path.
 *
 * Current hot paths with unnecessary allocations:
 *   FfmpegDriver:      this.buffer = Buffer.concat([this.buffer, chunk])
 *   PythonModule:      this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk])
 *   rebuildFrame():    allocates a new Uint8Array and copies all frame data
 *
 * Candidates for improvement:
 *   - Pre-allocated ring buffer with a write-offset pointer (no alloc per chunk)
 *   - Return the same frame object when events are the only change (skip rebuildFrame copy)
 */

import { bench, describe } from 'vitest';
import { createFrame } from '@lights/io';

// Synthetic frames at common capture resolutions
const SIZES = {
  '320x240': new Uint8Array(320 * 240 * 3),   //  230,400 bytes
  '640x480': new Uint8Array(640 * 480 * 3),   //  921,600 bytes
  '1280x720': new Uint8Array(1280 * 720 * 3), // 2,764,800 bytes
};

// Simulate FFmpeg or Python stdout arriving in 16 KB chunks
const CHUNK_SIZE = 16_384;

// ─── Buffer accumulation ───────────────────────────────────────────────────────

describe('Buffer accumulation — concat (current pattern)', () => {
  for (const [label, frame] of Object.entries(SIZES)) {
    bench(`concat chunks → ${label}`, () => {
      let buffer = Buffer.alloc(0);
      for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
        const chunk = Buffer.from(frame.subarray(offset, Math.min(offset + CHUNK_SIZE, frame.length)));
        buffer = Buffer.concat([buffer, chunk]);
      }
    });
  }
});

describe('Buffer accumulation — pre-allocated (candidate)', () => {
  for (const [label, frame] of Object.entries(SIZES)) {
    bench(`pre-alloc chunks → ${label}`, () => {
      // Double-size pre-allocation: holds one in-progress frame plus an extra chunk
      const buffer = Buffer.allocUnsafe(frame.length + CHUNK_SIZE);
      let writePos = 0;
      for (let offset = 0; offset < frame.length; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, frame.length);
        buffer.set(frame.subarray(offset, end), writePos);
        writePos += end - offset;
      }
    });
  }
});

// ─── rebuildFrame cost ─────────────────────────────────────────────────────────
// rebuildFrame is called in PythonModule.process() every time a frame comes back
// from inference — even when only the events array changed and the pixel data is
// identical.

describe('rebuildFrame — full copy (current)', () => {
  for (const [label, pixels] of Object.entries(SIZES)) {
    const frame = createFrame({
      timestamp: Date.now(),
      duration: 33,
      metadata: { video: { offset: 0, size: pixels.length } },
      data: pixels,
      events: [],
    });

    bench(`rebuildFrame copy @ ${label}`, () => {
      const names = frame.getPartsName();
      const meta: Record<string, { offset: number; size: number }> = {};
      const bufs: Uint8Array[] = [];
      let off = 0;
      for (const name of names) {
        const part = frame.getPart(name)!;
        meta[name] = { offset: off, size: part.length };
        bufs.push(part);
        off += part.length;
      }
      const total = bufs.reduce((s, b) => s + b.length, 0);
      const data = new Uint8Array(total);
      let pos = 0;
      for (const buf of bufs) { data.set(buf, pos); pos += buf.length; }
      createFrame({ timestamp: frame.getTimestamp(), duration: frame.getDuration(), metadata: meta, data, events: [] });
    });
  }
});

describe('rebuildFrame — events-only path (candidate: skip copy)', () => {
  for (const [label, pixels] of Object.entries(SIZES)) {
    const frame = createFrame({
      timestamp: Date.now(),
      duration: 33,
      metadata: { video: { offset: 0, size: pixels.length } },
      data: pixels,
      events: [],
    });

    bench(`return same frame @ ${label}`, () => {
      // When frame data didn't change, return the existing frame directly.
      // This is safe if Frame is treated as immutable.
      void frame;
    });
  }
});
