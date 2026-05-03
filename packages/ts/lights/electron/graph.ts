import { ipcMain, BrowserWindow } from 'electron'
import { Graph } from '@lights/graph'
import { FfmpegDriver } from '@lights/driver-ffmpeg'
import { PythonModule, AvailableModule } from '@lights/python-module'
import { BaseRenderer } from '@lights/renderer'
import type { FrameEvent } from '@lights/io'
import type { GraphCommand, GraphConfig, GraphEvent } from '../src/ipc/types'
import { GraphStatus } from '../src/ipc/types'

// ── Position decoders ─────────────────────────────────────────────────────────
// Each Python module encodes its output differently. We extract a single
// representative (x, y) position in normalised [0,1] camera-frame coordinates.

function decodePosition(event: FrameEvent): { x: number; y: number } {
  const view = new DataView(event.data.buffer, event.data.byteOffset, event.data.byteLength)
  switch (event.type) {
    case 'handpose':
      // byte 0 = handedness, bytes 1-4 = wrist x (float32 LE), bytes 5-8 = wrist y
      return { x: view.getFloat32(1, true), y: view.getFloat32(5, true) }
    case 'facemesh':
      // TODO: document facemesh binary layout and decode nose-bridge landmark
      return { x: view.getFloat32(0, true), y: view.getFloat32(4, true) }
    default:
      return { x: 0, y: 0 }
  }
}

// Maps graphConfig module IDs (as used in the UI) to AvailableModule values
// (which match the Python script directory names).
const MODULE_MAP: Partial<Record<string, AvailableModule>> = {
  'hand-pose': AvailableModule.HandPoseEstimation,
  'face-mesh': AvailableModule.FaceMeshEstimation,
}

const CAPTURE_WIDTH = 640
const CAPTURE_HEIGHT = 480

// ── Graph handler ─────────────────────────────────────────────────────────────

export function registerGraphHandlers(mainWindow: BrowserWindow): void {
  let graph: Graph | null = null

  function emit(event: GraphEvent) {
    mainWindow.webContents.send('graph:event', event)
  }

  function stopGraph() {
    graph?.stop()
    graph = null
    emit({ type: 'graph:status', status: GraphStatus.Stopped })
  }

  function startGraph(config: GraphConfig) {
    stopGraph()

    graph = new Graph()

    const driver = new FfmpegDriver({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, fps: 30 })
    graph.addDriver('ffmpeg', driver)

    // Video renderer — always connected directly to the driver.
    // Forwards raw pixel data to the renderer window for the live feed.
    const videoRenderer = new BaseRenderer('video')
    graph.addRenderer('video', videoRenderer)
    graph.connect('ffmpeg:output', 'video:input')
    videoRenderer.attachProcess(frame => {
      const pixels = frame.getPart('video')
      if (pixels) {
        emit({ type: 'frame', width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data: pixels.buffer as ArrayBuffer })
      }
    })

    // Per-module renderers — one per enabled module.
    // Fan-out from the driver; each module path has its own renderer that
    // extracts and forwards detection events. Fan-in is not used because
    // InputPort only supports one upstream connection at a time.
    const enabledModules = Object.entries(config.modules)
      .filter(([, m]) => m.enabled)
      .flatMap(([id]) => {
        const mod = MODULE_MAP[id]
        return mod ? [[id, mod] as [string, AvailableModule]] : []
      })

    for (const [moduleId, availableModule] of enabledModules) {
      const pythonMod = new PythonModule(availableModule, {
        scriptArgs: ['--width', String(CAPTURE_WIDTH), '--height', String(CAPTURE_HEIGHT)],
      })
      const modRenderer = new BaseRenderer(`renderer-${moduleId}`)

      graph.addModule(moduleId, pythonMod)
      graph.addRenderer(`renderer-${moduleId}`, modRenderer)
      graph.connect('ffmpeg:output', `${moduleId}:input`, { strategy: 'latest' })
      graph.connect(`${moduleId}:output`, `renderer-${moduleId}:input`)

      modRenderer.attachProcess(frame => {
        for (const event of frame.getEvents()) {
          emit({
            type: 'detection',
            moduleId: event.type,
            position: decodePosition(event),
            data: event.data.buffer as ArrayBuffer,
          })
        }
      })
    }

    graph.start()
    emit({ type: 'graph:status', status: GraphStatus.Running })
  }

  ipcMain.on('graph:command', (_event, cmd: GraphCommand) => {
    switch (cmd.type) {
      case 'slide:activate':
        startGraph(cmd.config)
        break
      case 'graph:stop':
        stopGraph()
        break
      case 'module:setParams':
        // TODO: hot-update module params without graph restart
        break
    }
  })
}
