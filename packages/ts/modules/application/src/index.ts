import { FfmpegDriver } from '@lights/driver-ffmpeg';
import { Graph } from '@lights/graph';
import { AvailableModule, PythonModule } from '@lights/python-module';
import { WebSocketRenderer } from '@lights/renderer-websocket';

const graph = new Graph({ stats: true });

// const WIDTH = 1280;
// const HEIGHT = 720;
const WIDTH = 320;
const HEIGHT = 240;

const ffmpeg = new FfmpegDriver({
  width: WIDTH,
  height: HEIGHT,
  fps: 30
});

const websocket = new WebSocketRenderer({
  port: 3000,
  width: WIDTH,
  height: HEIGHT
});

const handPose = new PythonModule(AvailableModule.HandPoseEstimation, {
  scriptArgs: ['--width', WIDTH.toString(), '--height', HEIGHT.toString()],
});

graph.addDriver('ffmpeg', ffmpeg);
graph.addModule('handpose', handPose);
graph.addRenderer('websocket', websocket);

graph.connect('ffmpeg:output', 'handpose:input');
graph.connect('handpose:output', 'websocket:input');

setInterval(() => {
  for (const node of graph.getStats()) {
    console.log(
      `[${node.nodeId}] in=${node.inputFps.toFixed(1)}fps out=${node.outputFps.toFixed(1)}fps p50=${node.latencyP50}ms p95=${node.latencyP95}ms${node.drift !== undefined
        ? `                              
  drift=${node.drift.toFixed(0)}ms`
        : ''
      }`,
    );
  }
}, 1000);

console.log('Starting graph...');
graph.start();

process.on('SIGINT', () => {
  console.log('Stopping graph...');
  graph.stop();
  process.exit(0);
});
