import { describe, it, expect } from 'vitest';
import { decodeHandpose, decodeFacemesh, frameRect } from '../landmarks';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a 253-byte handpose buffer: 1 byte handedness + 21 × 3 float32 LE. */
function buildHandBuffer(
  handedness: 0 | 1,
  landmarks: Array<{ x: number; y: number; z: number }>,
): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 21 * 12);
  new Uint8Array(buf)[0] = handedness;
  const view = new DataView(buf);
  for (let i = 0; i < landmarks.length; i++) {
    const off = 1 + i * 12;
    view.setFloat32(off,     landmarks[i].x, true);
    view.setFloat32(off + 4, landmarks[i].y, true);
    view.setFloat32(off + 8, landmarks[i].z, true);
  }
  return buf;
}

/** Build a 5616-byte facemesh buffer: 468 × 3 float32 LE. */
function buildFaceBuffer(
  landmarks: Array<{ x: number; y: number; z: number }>,
): ArrayBuffer {
  const buf = new ArrayBuffer(468 * 12);
  const view = new DataView(buf);
  for (let i = 0; i < landmarks.length; i++) {
    const off = i * 12;
    view.setFloat32(off,     landmarks[i].x, true);
    view.setFloat32(off + 4, landmarks[i].y, true);
    view.setFloat32(off + 8, landmarks[i].z, true);
  }
  return buf;
}

const defaultLandmarks = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: i * 0.001, y: i * 0.002, z: i * 0.0005 }));

// ── decodeHandpose ─────────────────────────────────────────────────────────────

describe('decodeHandpose', () => {
  it('returns "Right" when byte 0 is 1', () => {
    const { handedness } = decodeHandpose(buildHandBuffer(1, defaultLandmarks(21)));
    expect(handedness).toBe('Right');
  });

  it('returns "Left" when byte 0 is 0', () => {
    const { handedness } = decodeHandpose(buildHandBuffer(0, defaultLandmarks(21)));
    expect(handedness).toBe('Left');
  });

  it('returns exactly 21 landmarks', () => {
    const { landmarks } = decodeHandpose(buildHandBuffer(1, defaultLandmarks(21)));
    expect(landmarks).toHaveLength(21);
  });

  it('decodes landmark[0] x/y/z from bytes 1–12', () => {
    const lms = [{ x: 0.375, y: 0.625, z: 0.125 }, ...defaultLandmarks(20)];
    const { landmarks } = decodeHandpose(buildHandBuffer(1, lms));
    expect(landmarks[0].x).toBeCloseTo(0.375, 5);
    expect(landmarks[0].y).toBeCloseTo(0.625, 5);
    expect(landmarks[0].z).toBeCloseTo(0.125, 5);
  });

  it('decodes landmark[20] from offset 1 + 20 × 12 = 241', () => {
    const lms = [...defaultLandmarks(20), { x: 0.9, y: 0.8, z: 0.1 }];
    const { landmarks } = decodeHandpose(buildHandBuffer(1, lms));
    expect(landmarks[20].x).toBeCloseTo(0.9, 5);
    expect(landmarks[20].y).toBeCloseTo(0.8, 5);
  });
});

// ── decodeFacemesh ─────────────────────────────────────────────────────────────

describe('decodeFacemesh', () => {
  it('returns exactly 468 landmarks', () => {
    const landmarks = decodeFacemesh(buildFaceBuffer(defaultLandmarks(468)));
    expect(landmarks).toHaveLength(468);
  });

  it('decodes landmark[0] x/y/z from offset 0', () => {
    const lms = [{ x: 0.1, y: 0.2, z: 0.3 }, ...defaultLandmarks(467)];
    const landmarks = decodeFacemesh(buildFaceBuffer(lms));
    expect(landmarks[0].x).toBeCloseTo(0.1, 5);
    expect(landmarks[0].y).toBeCloseTo(0.2, 5);
    expect(landmarks[0].z).toBeCloseTo(0.3, 5);
  });

  it('decodes landmark[467] from offset 467 × 12 = 5604', () => {
    const lms = [...defaultLandmarks(467), { x: 0.55, y: 0.66, z: 0.77 }];
    const landmarks = decodeFacemesh(buildFaceBuffer(lms));
    expect(landmarks[467].x).toBeCloseTo(0.55, 5);
    expect(landmarks[467].y).toBeCloseTo(0.66, 5);
  });
});

// ── frameRect ─────────────────────────────────────────────────────────────────

describe('frameRect — letterbox/pillarbox', () => {
  it('fills the full rect when aspect ratios match exactly', () => {
    const r = frameRect(800, 600, 4, 3); // both 4:3
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(0);
    expect(r.w).toBeCloseTo(800);
    expect(r.h).toBeCloseTo(600);
  });

  it('pillarboxes when canvas is wider than the frame', () => {
    const r = frameRect(800, 600, 1, 1); // frame is square, canvas is 4:3
    expect(r.h).toBeCloseTo(600);
    expect(r.w).toBeCloseTo(600); // width constrained by height
    expect(r.x).toBeCloseTo(100); // centered horizontally
    expect(r.y).toBeCloseTo(0);
  });

  it('letterboxes when canvas is taller than the frame', () => {
    const r = frameRect(600, 800, 1, 1); // frame is square, canvas is portrait
    expect(r.w).toBeCloseTo(600);
    expect(r.h).toBeCloseTo(600); // height constrained by width
    expect(r.y).toBeCloseTo(100); // centered vertically
    expect(r.x).toBeCloseTo(0);
  });

  it('produces w × h that preserves the frame aspect ratio', () => {
    const fw = 16, fh = 9;
    const r = frameRect(1920, 1080, fw, fh);
    expect(r.w / r.h).toBeCloseTo(fw / fh, 4);
  });

  it('never exceeds the canvas dimensions', () => {
    const r = frameRect(640, 480, 16, 9);
    expect(r.x + r.w).toBeLessThanOrEqual(640 + 0.001);
    expect(r.y + r.h).toBeLessThanOrEqual(480 + 0.001);
  });
});
