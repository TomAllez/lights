import { Graph } from '@lights/graph';
import { FfmpegDriver } from '@lights/driver-ffmpeg';
import { WebSocketRenderer } from '@lights/renderer-websocket';
import { PythonModule, AvailableModule } from '@lights/python-module';

const graph = new Graph({ stats: true });

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

const facemesh = new PythonModule(AvailableModule.FaceMeshEstimation, {
  scriptArgs: ['--width', '640', '--height', '480'],
});

graph.addDriver('ffmpeg', ffmpeg);
graph.addModule('facemesh', facemesh);
graph.addRenderer('websocket', websocket);

graph.connect('ffmpeg:output', 'facemesh:input');
graph.connect('facemesh:output', 'websocket:input');

setInterval(() => {
  for (const node of graph.getStats()) {
    console.log(
      `[${node.nodeId}] in=${node.inputFps.toFixed(1)}fps out=${node.outputFps.toFixed(1)}fps p50=${node.latencyP50}ms p95=${node.latencyP95}ms${
        node.drift !== undefined
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
