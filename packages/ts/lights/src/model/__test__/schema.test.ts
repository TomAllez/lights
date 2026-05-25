import { describe, it, expect } from 'vitest';
import { validateProject, CURRENT_VERSION } from '../schema';

describe('validateProject', () => {
  it('throws on null input', () => {
    expect(() => validateProject(null)).toThrow('Invalid project file');
  });

  it('throws on non-object primitives', () => {
    expect(() => validateProject('hello')).toThrow('Invalid project file');
    expect(() => validateProject(42)).toThrow('Invalid project file');
    expect(() => validateProject(true)).toThrow('Invalid project file');
  });

  it('throws when version exceeds CURRENT_VERSION', () => {
    expect(() =>
      validateProject({ version: CURRENT_VERSION + 1, slides: [], calibration: {} }),
    ).toThrow(/newer version/i);
  });

  it('accepts a file at CURRENT_VERSION without running any migration', () => {
    const input = { version: CURRENT_VERSION, slides: [], calibration: {} };
    const result = validateProject(input);
    expect(result.version).toBe(CURRENT_VERSION);
    expect(result.slides).toEqual([]);
  });

  it('migrates a v0 file (no version field) up to CURRENT_VERSION', () => {
    const result = validateProject({ slides: [] });
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('defaults slides to [] when the field is absent in a v0 file', () => {
    const result = validateProject({});
    expect(Array.isArray(result.slides)).toBe(true);
    expect(result.slides).toHaveLength(0);
  });

  it('adds graphConfig.modules:{} to slides that were missing graphConfig (v0→v1)', () => {
    const result = validateProject({
      slides: [{ id: 'slide-1' }],
    });
    expect(result.slides[0].graphConfig).toEqual({ modules: {} });
  });

  it('preserves an existing graphConfig when migrating from v0', () => {
    const existing = { modules: { 'face-mesh': { enabled: true } } };
    const result = validateProject({
      slides: [{ id: 'slide-1', graphConfig: existing }],
    });
    expect(result.slides[0].graphConfig).toEqual(existing);
  });

  it('preserves unknown top-level fields through migration', () => {
    const result = validateProject({ slides: [], calibration: { x: 42 } });
    expect((result as Record<string, unknown>).calibration).toEqual({ x: 42 });
  });
});

describe('migrate — chain integrity', () => {
  it('running from v0 through CURRENT_VERSION yields a valid version field', () => {
    const result = validateProject({ slides: [] });
    expect(typeof result.version).toBe('number');
    expect(result.version).toBe(CURRENT_VERSION);
  });

  it('running from an explicit version 0 is equivalent to omitting the field', () => {
    const fromZero = validateProject({ version: 0, slides: [] });
    const fromOmit = validateProject({ slides: [] });
    expect(fromZero.version).toBe(fromOmit.version);
  });
});
