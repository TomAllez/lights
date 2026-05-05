import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Subject } from 'rxjs';

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => Buffer.from('<html/>')),
}));

vi.mock('ws', () => {
  class MockWebSocket {
    static OPEN = 1;
    readyState = 1;
    send = vi.fn();
    terminate = vi.fn();
    private _listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    on(event: string, handler: (...args: unknown[]) => void) {
      (this._listeners[event] ??= []).push(handler);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      (this._listeners[event] ?? []).forEach(h => h(...args));
    }
  }
  class MockWebSocketServer {
    close = vi.fn();
    private _listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    on(event: string, handler: (...args: unknown[]) => void) {
      (this._listeners[event] ??= []).push(handler);
      return this;
    }
    emit(event: string, ...args: unknown[]) {
      (this._listeners[event] ?? []).forEach(h => h(...args));
    }
  }
  return { WebSocketServer: vi.fn(() => new MockWebSocketServer()), WebSocket: MockWebSocket };
});

vi.mock('http', () => {
  class MockServer {
    listen = vi.fn((_port: number, cb?: () => void) => { cb?.(); return this; });
    close = vi.fn();
  }
  return { createServer: vi.fn(() => new MockServer()) };
});

import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { WebSocketRenderer } from '../renderer-websocket.js';
import { BaseRenderer } from '@lights/renderer';
import { Frame, createFrame } from '@lights/io';

const makeFrame = (): Frame =>
  createFrame({
    timestamp: 0, duration: 16,
    metadata: { video: { offset: 0, size: 6 } },
    data: new Uint8Array([1, 2, 3, 4, 5, 6]),
    events: [],
  });

type WssInstance = {
  close: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
};

describe('WebSocketRenderer', () => {
  let wssInstance: WssInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(WebSocketServer).mockImplementation(function(this: unknown) {
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      const instance = {
        close: vi.fn(),
        on(event: string, handler: (...args: unknown[]) => void) {
          (listeners[event] ??= []).push(handler);
          return this;
        },
        emit(event: string, ...args: unknown[]) {
          (listeners[event] ?? []).forEach(h => h(...args));
        },
      };
      wssInstance = instance as WssInstance;
      return instance;
    } as never);
  });

  it('extends BaseRenderer', () => {
    expect(new WebSocketRenderer()).toBeInstanceOf(BaseRenderer);
  });

  it('creates an HTTP server on start()', () => {
    new WebSocketRenderer().start();
    expect(createServer).toHaveBeenCalled();
  });

  it('listens on the configured port', () => {
    new WebSocketRenderer({ port: 4000 }).start();
    const server = vi.mocked(createServer).mock.results.at(-1)!.value;
    expect(server.listen).toHaveBeenCalledWith(4000, expect.any(Function));
  });

  it('sends config to a connecting client', () => {
    new WebSocketRenderer({ width: 320, height: 240 }).start();
    const ws = { send: vi.fn(), terminate: vi.fn(), readyState: WebSocket.OPEN, on: vi.fn() };
    wssInstance.emit('connection', ws);
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'config', width: 320, height: 240, partName: 'video' }),
    );
  });

  it('broadcasts frame data to open clients', () => {
    const renderer = new WebSocketRenderer();
    const src = new Subject<Frame>();
    renderer.input.connect(src.asObservable());
    renderer.start();

    const ws = { send: vi.fn(), terminate: vi.fn(), readyState: WebSocket.OPEN, on: vi.fn() };
    wssInstance.emit('connection', ws);

    src.next(makeFrame());

    const frameCalls = ws.send.mock.calls.filter(([arg]) => arg instanceof Uint8Array);
    expect(frameCalls).toHaveLength(1);
    expect(frameCalls[0][0]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it('does not broadcast to closed clients', () => {
    const renderer = new WebSocketRenderer();
    const src = new Subject<Frame>();
    renderer.input.connect(src.asObservable());
    renderer.start();

    const ws = { send: vi.fn(), terminate: vi.fn(), readyState: 0, on: vi.fn() };
    wssInstance.emit('connection', ws);

    src.next(makeFrame());

    const frameCalls = ws.send.mock.calls.filter(([arg]) => arg instanceof Uint8Array);
    expect(frameCalls).toHaveLength(0);
  });

  it('stop() terminates clients and closes the server', () => {
    const renderer = new WebSocketRenderer();
    renderer.start();

    const ws = { send: vi.fn(), terminate: vi.fn(), readyState: WebSocket.OPEN, on: vi.fn() };
    wssInstance.emit('connection', ws);
    renderer.stop();

    expect(ws.terminate).toHaveBeenCalled();
    const server = vi.mocked(createServer).mock.results.at(-1)!.value;
    expect(server.close).toHaveBeenCalled();
  });

  it('stop() is safe when not started', () => {
    expect(() => new WebSocketRenderer().stop()).not.toThrow();
  });
});
