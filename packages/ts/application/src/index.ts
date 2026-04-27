import { Graph } from '@lights/graph';
import { FfmpegDriver } from '@lights/driver-ffmpeg';
import { WebSocketRenderer } from '@lights/renderer-websocket';
import { PythonModule, AvailableModule } from '@lights/python-module';

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

const handpose = new PythonModule(AvailableModule.HandPoseEstimation, {
  scriptArgs: ['--width', '640', '--height', '480'],
});

graph.addDriver('ffmpeg', ffmpeg);
graph.addModule('handpose', handpose);
graph.addRenderer('websocket', websocket);

graph.connect('ffmpeg:output', 'handpose:input');
graph.connect('handpose:output', 'websocket:input');

console.log('Starting graph...');
graph.start();

process.on('SIGINT', () => {
  console.log('Stopping graph...');
  graph.stop();
  process.exit(0);
});
