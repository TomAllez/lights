import { describe, it, expect } from 'vitest';
import { decodeTypedDetection } from '../detectionTypes';

const DUMMY_POSITION = { x: 0.5, y: 0.5 };

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a 253-byte handpose buffer. */
function buildHandBuffer(handedness: 0 | 1, x0 = 0.0, y0 = 0.0): ArrayBuffer {
  const buf = new ArrayBuffer(1 + 21 * 12);
  new Uint8Array(buf)[0] = handedness;
  const view = new DataView(buf);
  view.setFloat32(1, x0, true);
  view.setFloat32(5, y0, true);
  return buf;
}

/** Build a 5616-byte facemesh buffer. */
function buildFaceBuffer(x0 = 0.0, y0 = 0.0): ArrayBuffer {
  const buf = new ArrayBuffer(468 * 12);
  const view = new DataView(buf);
  view.setFloat32(0, x0, true);
  view.setFloat32(4, y0, true);
  return buf;
}

// ── decodeTypedDetection ──────────────────────────────────────────────────────

describe('decodeTypedDetection', () => {
  it('returns null for an unknown moduleId', () => {
    expect(decodeTypedDetection('unknown', DUMMY_POSITION, new ArrayBuffer(5616))).toBeNull();
  });

  it('returns null when handpose data is too short', () => {
    const tooShort = new ArrayBuffer(5);
    expect(decodeTypedDetection('handpose:right', DUMMY_POSITION, tooShort)).toBeNull();
  });

  it('returns null when facemesh data is exactly 1 byte short', () => {
    const tooShort = new ArrayBuffer(468 * 12 - 1);
    expect(decodeTypedDetection('facemesh', DUMMY_POSITION, tooShort)).toBeNull();
  });

  it('decodes a valid handpose:right event — kind and handedness', () => {
    const result = decodeTypedDetection('handpose:right', DUMMY_POSITION, buildHandBuffer(1));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('handpose');
    if (result!.kind === 'handpose') {
      expect(result!.handedness).toBe('Right');
    }
  });

  it('decodes a valid handpose:left event — handedness Left when byte 0 is 0', () => {
    const result = decodeTypedDetection('handpose:left', DUMMY_POSITION, buildHandBuffer(0));
    expect(result).not.toBeNull();
    if (result!.kind === 'handpose') {
      expect(result!.handedness).toBe('Left');
    }
  });

  it('decodes 21 hand landmarks', () => {
    const result = decodeTypedDetection('handpose:right', DUMMY_POSITION, buildHandBuffer(1));
    if (result!.kind === 'handpose') {
      expect(result!.landmarks).toHaveLength(21);
    }
  });

  it('reads hand landmark[0] x/y from bytes 1–8', () => {
    const result = decodeTypedDetection(
      'handpose:right', DUMMY_POSITION, buildHandBuffer(1, 0.375, 0.625),
    );
    if (result!.kind === 'handpose') {
      expect(result!.landmarks[0].x).toBeCloseTo(0.375, 5);
      expect(result!.landmarks[0].y).toBeCloseTo(0.625, 5);
    }
  });

  it('decodes a valid facemesh event — kind and 468 landmarks', () => {
    const result = decodeTypedDetection('facemesh', DUMMY_POSITION, buildFaceBuffer());
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('facemesh');
    if (result!.kind === 'facemesh') {
      expect(result!.landmarks).toHaveLength(468);
    }
  });

  it('reads facemesh landmark[0] x/y from bytes 0–7', () => {
    const result = decodeTypedDetection('facemesh', DUMMY_POSITION, buildFaceBuffer(0.11, 0.22));
    if (result!.kind === 'facemesh') {
      expect(result!.landmarks[0].x).toBeCloseTo(0.11, 5);
      expect(result!.landmarks[0].y).toBeCloseTo(0.22, 5);
    }
  });

  it('attaches the supplied moduleId to the result', () => {
    const result = decodeTypedDetection('handpose:right', DUMMY_POSITION, buildHandBuffer(1));
    expect(result!.moduleId).toBe('handpose:right');
  });

  it('attaches the supplied position to the result', () => {
    const pos = { x: 0.3, y: 0.7 };
    const result = decodeTypedDetection('facemesh', pos, buildFaceBuffer());
    expect(result!.position).toEqual(pos);
  });
});
