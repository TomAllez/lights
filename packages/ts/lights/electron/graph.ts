import { FfmpegDriver } from '@lights/driver-ffmpeg'
import { Graph } from '@lights/graph'
import type { FrameEvent } from '@lights/io'
import { AvailableModule, PythonModule } from '@lights/python-module'
import { BaseRenderer } from '@lights/renderer'
import { BrowserWindow, ipcMain } from 'electron'
import type { GraphCommand, GraphConfig, GraphEvent } from '../src/ipc'
import { GraphStatus } from '../src/ipc'

// ── Position decoders ─────────────────────────────────────────────────────────

/**
 * Extracts a single representative (x, y) position from a raw detection frame
 * in normalised [0, 1] camera-frame coordinates.
 *
 * Each Python module uses its own binary layout; this function centralises the
 * per-type decoding so the rest of the graph never needs to know the wire format.
 */
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

/**
 * Maps graphConfig module IDs (as used in the UI) to {@link AvailableModule} values
 * (which match the Python script directory names).
 */
const MODULE_MAP: Partial<Record<string, AvailableModule>> = {
  'hand-pose': AvailableModule.HandPoseEstimation,
  'face-mesh': AvailableModule.FaceMeshEstimation,
}

const CAPTURE_WIDTH = 940
const CAPTURE_HEIGHT = 480

// ── GraphManager ──────────────────────────────────────────────────────────────

/** Runtime state for a single AI module and its paired detection renderer. */
type ModuleEntry = { module: PythonModule; renderer: BaseRenderer; active: boolean }

/**
 * Manages the lifetime of the processing graph for a single Electron window.
 *
 * The graph is built once on the first {@link activate} call and kept alive across
 * slide changes. Subsequent activations only reconcile per-module state (start vs.
 * passthrough) without tearing down the driver or rewiring the topology.
 *
 * Each public method maps directly to one `graph:command` IPC message type.
 */
class GraphManager {
  private graph: Graph | null = null
  private readonly modules = new Map<string, ModuleEntry>()

  constructor(private readonly mainWindow: BrowserWindow) {}

  // ── IPC command handlers ────────────────────────────────────────────────────

  /**
   * Activates a slide's processing config.
   *
   * Builds the graph on the first call; on subsequent calls it only reconciles
   * which modules are active vs. in passthrough — no teardown or rewiring.
   */
  activate(config: GraphConfig): void {
    if (this.graph) {
      this.applyConfig(config)
      return
    }
    this.build(config)
  }

  /**
   * Stops the graph and all running modules, freeing the camera and Python processes.
   * Emits a `graph:status` stopped event to the renderer.
   */
  stop(): void {
    this.graph?.stop()
    this.graph = null
    this.modules.clear()
    this.emit({ type: 'graph:status', status: GraphStatus.Stopped })
  }

  /**
   * Updates runtime parameters for a running module.
   * @param _moduleId - ID of the target module
   * @param _params   - New parameter map to apply
   */
  setModuleParams(_moduleId: string, _params: Record<string, unknown>): void {
    // TODO: hot-update module params without graph restart
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Sends a {@link GraphEvent} to the renderer process.
   * No-ops silently if the window has already been destroyed.
   */
  private emit(event: GraphEvent): void {
    if (this.mainWindow.isDestroyed()) return
    this.mainWindow.webContents.send('graph:event', event)
  }

  /**
   * Reconciles each module's running state against `config`.
   *
   * Only toggles modules whose enabled state actually changed, so in-flight frames
   * on stable slides are never disrupted. Disabled modules are put in passthrough
   * (frames still flow, no Python processing) and their renderer is stopped.
   */
  private applyConfig(config: GraphConfig): void {
    for (const [moduleId, entry] of this.modules) {
      const desired = config.modules[moduleId]?.enabled ?? false
      if (desired === entry.active) continue
      entry.active = desired
      if (desired) {
        entry.module.start()
        entry.renderer.start()
      } else {
        entry.module.passthrough()
        entry.renderer.stop()
      }
    }
  }

  /**
   * Constructs the full graph topology, starts every node, then calls
   * {@link applyConfig} to immediately put disabled modules into passthrough.
   *
   * All modules from {@link MODULE_MAP} are pre-wired regardless of the initial
   * config so that later enables/disables never require rewiring.
   */
  private build(config: GraphConfig): void {
    this.graph = new Graph()
    this.modules.clear()

    const driver = new FfmpegDriver({ width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, fps: 30 })
    this.graph.addDriver('ffmpeg', driver)

    // Video renderer — always connected directly to the driver.
    // Forwards raw pixel data to the renderer window for the live feed.
    const videoRenderer = new BaseRenderer('video')
    this.graph.addRenderer('video', videoRenderer)
    this.graph.connect('ffmpeg:output', 'video:input')
    videoRenderer.attachProcess(frame => {
      const pixels = frame.getPart('video')
      if (pixels) {
        this.emit({ type: 'frame', width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT, data: pixels.buffer as ArrayBuffer })
      }
    })

    // Fan-out from the driver to every known module. Each module has its own
    // renderer that forwards detection events. Fan-in is not used because
    // InputPort only supports one upstream connection at a time.
    for (const [moduleId, availableModule] of Object.entries(MODULE_MAP)) {
      if (!availableModule) continue

      const pythonMod = new PythonModule(availableModule, {
        scriptArgs: ['--width', String(CAPTURE_WIDTH), '--height', String(CAPTURE_HEIGHT)],
      })
      const modRenderer = new BaseRenderer(`renderer-${moduleId}`)

      this.graph.addModule(moduleId, pythonMod)
      this.graph.addRenderer(`renderer-${moduleId}`, modRenderer)
      this.graph.connect('ffmpeg:output', `${moduleId}:input`, { strategy: 'latest' })
      this.graph.connect(`${moduleId}:output`, `renderer-${moduleId}:input`)

      modRenderer.attachProcess(frame => {
        for (const event of frame.getEvents()) {
          this.emit({
            type: 'detection',
            moduleId: event.type,
            position: decodePosition(event),
            data: event.data.buffer as ArrayBuffer,
          })
        }
      })

      // active=false: reconciled by applyConfig immediately after graph.start()
      this.modules.set(moduleId, { module: pythonMod, renderer: modRenderer, active: false })
    }

    // Wires all ports and starts every node; Python processes are spawned here.
    this.graph.start()
    this.emit({ type: 'graph:status', status: GraphStatus.Running })

    // graph.start() left all modules active; reflect that before reconciling.
    for (const entry of this.modules.values()) entry.active = true

    this.applyConfig(config)
  }
}

// ── IPC registration ──────────────────────────────────────────────────────────

/**
 * Creates a {@link GraphManager} for `mainWindow`, registers the `graph:command`
 * IPC listener, and returns a cleanup handle that stops the graph and removes the
 * listener when the window closes.
 */
export function registerGraphHandlers(mainWindow: BrowserWindow) {
  const manager = new GraphManager(mainWindow)

  const onCommand = (_event: Electron.IpcMainEvent, cmd: GraphCommand) => {
    switch (cmd.type) {
      case 'slide:activate':    manager.activate(cmd.config);                       break
      case 'graph:stop':        manager.stop();                                     break
      case 'module:setParams':  manager.setModuleParams(cmd.moduleId, cmd.params);  break
    }
  }

  ipcMain.on('graph:command', onCommand)

  return {
    stop: () => {
      manager.stop()
      ipcMain.removeListener('graph:command', onCommand)
    }
  }
}
