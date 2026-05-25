import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'child_process';
import { PythonModule } from '../python-module.js';
import { AvailableModule } from '../available-module.js';
import { createFrame } from '@lights/io';

// ── Fake process ──────────────────────────────────────────────────────────────

class MockProcess extends EventEmitter {
  stdin = {
    writable: true,
    write: vi.fn(),
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = vi.fn();
  killed = false;
}

function makeModule(): { module: PythonModule; proc: MockProcess } {
  const proc = new MockProcess();
  vi.mocked(spawn).mockReturnValue(proc as never);
  const module = new PythonModule(AvailableModule.FaceMeshEstimation, {
    python: 'python3',
    packagesPath: '/fake',
  });
  module.start();
  return { module, proc };
}

const makeFrame = (videoBytes = 6) =>
  createFrame({
    timestamp: 1000,
    duration: 33,
    metadata: { video: { offset: 0, size: videoBytes } },
    data: new Uint8Array(videoBytes).fill(0xab),
    events: [],
  });

function buildResponse(events: Array<{ type: string; data: string }>): Buffer {
  const payload = Buffer.from(JSON.stringify({ events }), 'utf8');
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32LE(payload.length, 0);
  return Buffer.concat([len, payload]);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PythonModule — IPC framing', () => {
  beforeEach(() => vi.mocked(spawn).mockReset());
  afterEach(() => vi.useRealTimers());

  it('sends a 4-byte LE header length before the JSON header', () => {
    const { module, proc } = makeModule();
    module.process(makeFrame());

    const writes: Buffer[] = proc.stdin.write.mock.calls.map(c => Buffer.from(c[0]));
    // First write is the 4-byte length prefix
    expect(writes[0]).toHaveLength(4);
    const declaredLen = writes[0].readUInt32LE(0);
    // Second write is the JSON header itself
    expect(writes[1]).toHaveLength(declaredLen);
  });

  it('sends a well-formed JSON header with timestamp, duration and metadata', () => {
    const { module, proc } = makeModule();
    const frame = makeFrame(6);
    module.process(frame);

    const writes: Buffer[] = proc.stdin.write.mock.calls.map(c => Buffer.from(c[0]));
    const header = JSON.parse(writes[1].toString('utf8'));
    expect(header.timestamp).toBe(1000);
    expect(header.duration).toBe(33);
    expect(header.metadata).toEqual({ video: { offset: 0, size: 6 } });
  });

  it('sends raw frame bytes after the header', () => {
    const { module, proc } = makeModule();
    const payload = new Uint8Array([0xca, 0xfe, 0xba, 0xbe, 0x01, 0x02]);
    const frame = createFrame({
      timestamp: 0, duration: 16,
      metadata: { video: { offset: 0, size: 6 } },
      data: payload, events: [],
    });
    module.process(frame);

    const writes: Buffer[] = proc.stdin.write.mock.calls.map(c => Buffer.from(c[0]));
    // Third write = raw data
    expect(Array.from(writes[2])).toEqual(Array.from(payload));
  });

  it('resolves process() after a complete stdout response arrives', async () => {
    const { module, proc } = makeModule();
    const p = module.process(makeFrame());

    proc.stdout.emit('data', buildResponse([{ type: 'facemesh', data: '' }]));

    const result = await p;
    expect(result.getEvents()).toHaveLength(1);
    expect(result.getEvents()[0].type).toBe('facemesh');
  });

  it('resolves process() when stdout arrives in multiple chunks', async () => {
    const { module, proc } = makeModule();
    const p = module.process(makeFrame());

    const full = buildResponse([{ type: 'test', data: '' }]);
    // Split at byte 2 — before the length prefix is complete
    proc.stdout.emit('data', full.subarray(0, 2));
    proc.stdout.emit('data', full.subarray(2));

    const result = await p;
    expect(result.getEvents()[0].type).toBe('test');
  });

  it('decodes base64 event data into a Uint8Array', async () => {
    const { module, proc } = makeModule();
    const p = module.process(makeFrame());

    const binary = new Uint8Array(5616).fill(0xff);
    const b64 = Buffer.from(binary).toString('base64');
    proc.stdout.emit('data', buildResponse([{ type: 'facemesh', data: b64 }]));

    const result = await p;
    const eventData = result.getEvents()[0].data;
    expect(eventData).toBeInstanceOf(Uint8Array);
    expect(eventData).toHaveLength(5616);
    expect(eventData[0]).toBe(0xff);
  });

  it('resolves multiple queued frames in FIFO order', async () => {
    const { module, proc } = makeModule();

    const p1 = module.process(makeFrame());
    const p2 = module.process(makeFrame());
    const p3 = module.process(makeFrame());

    proc.stdout.emit('data', buildResponse([{ type: 'first', data: '' }]));
    proc.stdout.emit('data', buildResponse([{ type: 'second', data: '' }]));
    proc.stdout.emit('data', buildResponse([{ type: 'third', data: '' }]));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.getEvents()[0].type).toBe('first');
    expect(r2.getEvents()[0].type).toBe('second');
    expect(r3.getEvents()[0].type).toBe('third');
  });

  it('drains pending resolvers with [] on stop()', async () => {
    const { module } = makeModule();
    const p = module.process(makeFrame());
    module.stop();
    const result = await p;
    expect(result.getEvents()).toEqual([]);
  });

  it('drains pending resolvers with [] on passthrough()', async () => {
    const { module } = makeModule();
    const p = module.process(makeFrame());
    module.passthrough();
    const result = await p;
    expect(result.getEvents()).toEqual([]);
  });

  it('is a no-op when sendFrameToPython is called before start', () => {
    // Build module but do NOT call start() — pythonProcess is undefined
    const proc = new MockProcess();
    vi.mocked(spawn).mockReturnValue(proc as never);
    const module = new PythonModule(AvailableModule.FaceMeshEstimation, { packagesPath: '/fake' });
    // process() still queues a resolver even without a live process
    // The important thing is it doesn't throw and stdin.write is never called
    expect(() => {
      // We do not await — just confirm no synchronous throw
      module.process(makeFrame());
    }).not.toThrow();
    expect(proc.stdin.write).not.toHaveBeenCalled();
  });

  it('sends SIGTERM immediately and SIGKILL after 2 s if process does not exit', async () => {
    vi.useFakeTimers();
    const { module, proc } = makeModule();

    module.stop();

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');

    vi.advanceTimersByTime(2000);

    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does not SIGKILL if the process exits before the 2 s timer fires', async () => {
    vi.useFakeTimers();
    const { module, proc } = makeModule();

    module.stop();
    proc.emit('exit', 0);

    vi.advanceTimersByTime(2000);

    const killCalls = proc.kill.mock.calls.map(c => c[0]);
    expect(killCalls).not.toContain('SIGKILL');
  });

  it('drains pending resolvers with [] when Python process exits unexpectedly', async () => {
    const { module, proc } = makeModule();
    const p = module.process(makeFrame());

    // Simulate unexpected crash
    proc.emit('exit', 1);

    const result = await p;
    expect(result.getEvents()).toEqual([]);
  });

  it('returns [] for invalid JSON in stdout response', async () => {
    const { module, proc } = makeModule();
    const p = module.process(makeFrame());

    const garbage = Buffer.from('not-json', 'utf8');
    const len = Buffer.allocUnsafe(4);
    len.writeUInt32LE(garbage.length, 0);
    proc.stdout.emit('data', Buffer.concat([len, garbage]));

    const result = await p;
    expect(result.getEvents()).toEqual([]);
  });

  it('preserves existing frame events alongside Python events', async () => {
    const { module, proc } = makeModule();
    const frameWithEvent = createFrame({
      timestamp: 0, duration: 16,
      metadata: { video: { offset: 0, size: 3 } },
      data: new Uint8Array(3),
      events: [{ type: 'existing', data: new Uint8Array([1]) }],
    });
    const p = module.process(frameWithEvent);

    proc.stdout.emit('data', buildResponse([{ type: 'new', data: '' }]));

    const result = await p;
    const types = result.getEvents().map(e => e.type);
    expect(types).toContain('existing');
    expect(types).toContain('new');
  });
});
