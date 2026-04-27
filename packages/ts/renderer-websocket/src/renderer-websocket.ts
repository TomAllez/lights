import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { readFileSync } from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { BaseRenderer } from '@lights/renderer';
import { Frame } from '@lights/io';

export type WebSocketRendererOptions = {
  /** HTTP + WebSocket port, default 3000 */
  port?: number;
  /** Name of the frame part to broadcast, default "video" */
  partName?: string;
  /** Frame width sent to clients on connection, default 640 */
  width?: number;
  /** Frame height sent to clients on connection, default 480 */
  height?: number;
};

/**
 * Renderer that broadcasts frames over WebSocket and serves a demo page.
 * Open http://localhost:{port} in a browser to visualise the stream.
 *
 * @param {WebSocketRendererOptions} options - Server configuration
 */
export class WebSocketRenderer extends BaseRenderer {
  private httpServer: Server | undefined;
  private wss: WebSocketServer | undefined;
  private clients = new Set<WebSocket>();

  private readonly port: number;
  private readonly partName: string;
  private readonly width: number;
  private readonly height: number;

  constructor(options: WebSocketRendererOptions = {}) {
    super('websocket-renderer');
    this.port = options.port ?? 3000;
    this.partName = options.partName ?? 'video';
    this.width = options.width ?? 640;
    this.height = options.height ?? 480;

    this.attachProcess((frame: Frame) => this.broadcast(frame));
  }

  /**
   * Starts the HTTP server, WebSocket server, and frame processing.
   */
  override start(): void {
    const html = readFileSync(new URL('../assets/demo.html', import.meta.url));

    this.httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      ws.send(JSON.stringify({
        type: 'config',
        width: this.width,
        height: this.height,
        partName: this.partName,
      }));
      ws.on('close', () => this.clients.delete(ws));
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[websocket-renderer] http://localhost:${this.port}`);
    });

    super.start();
  }

  /**
   * Stops frame processing, terminates all clients, and closes the server.
   */
  override stop(): void {
    super.stop();
    for (const client of this.clients) client.terminate();
    this.clients.clear();
    this.wss?.close();
    this.httpServer?.close();
  }

  private broadcast(frame: Frame): void {
    if (this.clients.size === 0) return;
    const data = frame.getPart(this.partName);
    if (!data) return;

    const events = frame.getEvents();
    const eventsMsg = events.length > 0
      ? JSON.stringify({
          type: 'events',
          events: events.map(e => ({ type: e.type, data: Array.from(e.data) })),
        })
      : null;

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
        if (eventsMsg) client.send(eventsMsg);
      }
    }
  }
}
