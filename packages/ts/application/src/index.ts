import { Graph } from '@lights/graph';
import { FfmpegDriver } from '@lights/driver-ffmpeg';
import { WebSocketRenderer } from '@lights/renderer-websocket';

const graph = new Graph();

const ffmpeg = new FfmpegDriver({
  width: 640,
  height: 480,
  fps: 30
});

const websocket = new WebSocketRenderer({
  port: 3000,
  width: 640,
  height: 480
});

graph.addDriver('ffmpeg', ffmpeg);
graph.addRenderer('websocket', websocket);

graph.connect('ffmpeg:output', 'websocket:input');

console.log('Starting graph...');
graph.start();

process.on('SIGINT', () => {
  console.log('Stopping graph...');
  graph.stop();
  process.exit(0);
});
