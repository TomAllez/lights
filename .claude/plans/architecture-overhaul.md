# Lights — Architectural Overhaul Plan

**Author**: Architect agent  
**Status**: Approved for implementation  
**Scope**: Full codebase — signal pipeline, state management, IPC protocol, resilience, observability, testing

---

## Diagnosis

The features are real and the domain model is sound. The problems are structural. Left unaddressed they compound: every new module slows inference more, every new action makes the reducer harder to reason about, every crash silently stops the pipeline with no recovery.

### Critical flaws

**1. The Python IPC protocol wastes 10× bandwidth on every inference call.**  
`encode_face_event` returns `list(buf)` — 5 616 bytes of binary landmarks serialised as a JSON array of integers: `[12, 34, 56, …]`. At 30 fps with both modules running, the IPC pipes carry ~1 MB/s of JSON that encodes ~100 KB/s of actual data. The deserialization cost on the Node side is paid every single frame.

**2. Every inference call copies the entire frame.**  
`rebuildFrame()` in `python-module.ts` reallocates and copies 921 600 bytes (640 × 480 × 3) per call just to attach events to a frame. At 30 fps per module that is 55 MB/s of unnecessary copying.

**3. If a Python process crashes, the pipeline goes silent forever.**  
`PythonModule` logs the exit code and sets `pythonProcess = undefined`. The graph continues; nothing tells the UI; no restart is attempted. The user sees the feed freeze and has no idea why.

**4. The graph cannot update module params without a full restart.**  
`guidelines.md` describes a hot params channel. It does not exist. Changing a confidence threshold kills the graph, respawns all Python processes, and drops frames for several seconds.

**5. `ProjectContext` is a god-reducer.**  
40+ action types, UI selection state and persistent data state in a single context. Every `selectedSurface` update re-renders components that only care about slide names. The file is already 400 lines and will grow without bound.

**6. The Python scripts share 80% of their code with no shared module.**  
`facemesh/main.py` and `handpose/main.py` are near-identical twins. Protocol reading, arg parsing, numpy handling — all duplicated. Every IPC protocol change must be applied twice, in sync, by hand.

**7. The project file has no version field and no migration path.**  
When the type shapes change (and they will — `Volume`, `Reaction`, `GraphConfig` are all evolving), old project files will silently produce wrong behaviour or crash. There is no schema, no validator, no migration system.

**8. Detection canvas renderers run on the main thread inside the React render cycle.**  
`OutputApp.tsx` calls `renderer.render()` synchronously during the animation loop. A slow renderer stalls the projection output. There is no isolation.

**9. Zero tests for the Python inference modules.**  
The most critical latency-sensitive code in the system — the inference loop and its IPC wire format — has no automated verification.

**10. No observability.**  
`Graph` can collect P50/P95 latency and FPS per node, but nothing surfaces this data to the user. There is no way to know if the pipeline is healthy or degraded.

---

## Vision

**The pipeline is a first-class citizen. Every module is resilient, observable, and hot-configurable. State has one owner per concern. The IPC boundary is a typed, versioned, binary contract — not a JSON accident. The test suite is a specification, not an afterthought.**

The target architecture has four layers:

```
┌─────────────────────────────────────────────────────────────────┐
│  UI Layer (React)                                               │
│  ProjectStore · UIStore · GraphStore  (split, no god context)  │
│  ObservabilityPanel (live FPS + latency per node)              │
│  OffscreenCanvas Workers (detection effects off main thread)   │
└─────────────────────────────────────────────────────────────────┘
                            │ Electron IPC (typed, versioned)
┌─────────────────────────────────────────────────────────────────┐
│  Graph Layer (Node / Electron main)                            │
│  ModuleRegistry (data-driven, no hardcoding)                   │
│  GraphManager (diff + drain, not stop-all-restart)             │
│  Hot params channel (no restart for threshold changes)         │
│  Health monitor (auto-restart with backoff)                    │
└─────────────────────────────────────────────────────────────────┘
                            │ Binary IPC (zero-JSON on hot path)
┌─────────────────────────────────────────────────────────────────┐
│  Inference Layer (Python subprocesses)                         │
│  lights_core library (shared IPC, frame, CLI)                  │
│  facemesh / handpose (thin wrappers, ~30 lines each)           │
│  Buffer reuse, pre-warmed model                                │
└─────────────────────────────────────────────────────────────────┘
                            │ Frame pool (no per-frame allocation)
┌─────────────────────────────────────────────────────────────────┐
│  Signal Layer (lib/)                                           │
│  FramePool (buffer reuse)                                      │
│  Frame (unchanged API, pooled backing)                         │
│  Graph / Port / Module (unchanged)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Foundation  
*Highest ROI, lowest risk. Implement these first.*

### 1.1 — Python shared core library  
**Files to create**: `packages/py/lights_core/__init__.py`, `ipc.py`, `frame.py`, `cli.py`  
**Files to change**: `packages/py/facemesh/main.py`, `packages/py/handpose/main.py`

Extract the shared IPC code into a proper Python package that lives alongside the two scripts.

```
packages/py/
  lights_core/
    __init__.py
    ipc.py      ← read_message(), write_response()
    frame.py    ← parse_rgb24_frame()
    cli.py      ← base_arg_parser() returning common args
  facemesh/
    main.py     ← now ~40 lines: parse args, init model, loop
  handpose/
    main.py     ← now ~40 lines: parse args, init model, loop
```

**`ipc.py` contract**:
```python
def read_message(stdin) -> dict | None:
    """Read one lights IPC message from stdin. Returns None on EOF."""

def write_response(stdout, events: list[dict]) -> None:
    """Write one response containing the given events."""
```

**`frame.py` contract**:
```python
def parse_rgb24_part(raw_bytes: bytes, metadata: dict, width: int, height: int) -> np.ndarray | None:
    """Extract and reshape the video part from a raw binary blob. Returns HxWx3 uint8 or None."""
```

After this change, adding a new inference module (e.g. body pose) is a 40-line file, not a copy-paste of 120 lines.

---

### 1.2 — Binary event encoding (eliminate JSON on the hot path)

**Files to change**:
- `packages/py/lights_core/ipc.py` (new)
- `packages/ts/modules/python-module/src/python-module.ts`

**The problem in numbers**: at 30 fps, facemesh serializes 5 616 bytes as a JSON integer array on every frame. The JSON string is ~17 000 characters. Node.js parses it and converts back to `Uint8Array`. This is pure overhead.

**The fix**: base64-encode binary event payloads. Keep the outer JSON wrapper for the events array (it is small and flexible), but change the `data` field from `number[]` to `string` (base64).

**Python side** — change in `lights_core/ipc.py`:
```python
import base64

def encode_binary_event(event_type: str, data: bytes) -> dict:
    return {"type": event_type, "data": base64.b64encode(data).decode("ascii")}
```

**Node side** — change in `python-module.ts`:
```ts
// Before
data: new Uint8Array(e.data)

// After
data: Buffer.from(e.data as string, 'base64')
```

This is a one-line change on each side. Payload drops from ~17 KB to ~7.5 KB. Zero protocol breakage — the wrapper JSON structure is unchanged. The `type` field remains a string discriminant.

**Longer-term target (Phase 3)**: full binary framing on stdout (see §3.1).

---

### 1.3 — Project file schema and versioning

**Files to create**: `packages/ts/lights/src/model/schema.ts`, `packages/ts/lights/src/model/migrations.ts`  
**Files to change**: `packages/ts/lights/electron/main.ts` (load path)

Add a `version` field to the project root type and a migration chain. Implement using a simple typed array of transforms.

**`schema.ts`**:
```ts
export const CURRENT_VERSION = 1;

export function validateProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid project file');
  const versioned = raw as { version?: number };
  const version = versioned.version ?? 0;
  return migrate(raw, version);
}
```

**`migrations.ts`**:
```ts
type Migration = (prev: unknown) => unknown;

const migrations: Migration[] = [
  // v0 → v1: add version field, default graphConfig.modules to {}
  (raw) => ({ version: 1, ...raw as object }),
];

export function migrate(raw: unknown, fromVersion: number): Project {
  let current = raw;
  for (let v = fromVersion; v < CURRENT_VERSION; v++) {
    current = migrations[v](current);
  }
  return current as Project;
}
```

Call `validateProject()` in the `project:open` IPC handler before setting state. Any project that cannot migrate throws a user-facing error with the version mismatch, not a silent crash.

---

### 1.4 — Split `ProjectContext` into three focused stores

**Files to create**: `src/stores/projectStore.ts`, `src/stores/uiStore.ts`  
**Files to change**: `src/contexts/ProjectContext.tsx` (becomes a thin wrapper), all consumers

`ProjectContext` conflates three unrelated concerns:

| Concern | Current location | Target |
|---|---|---|
| Persistent project data (slides, surfaces, layers, volumes) | `ProjectContext` | `projectStore` |
| Transient UI state (selectedSlide, selectedSurface, editorMode) | `ProjectContext` | `uiStore` |
| File/dirty state (filePath, isDirty) | `ProjectContext` | `projectStore` |

Use [Zustand](https://github.com/pmndrs/zustand) — it is already aligned with this codebase's philosophy (no boilerplate, TypeScript-first, no provider tree, fine-grained subscriptions that prevent spurious re-renders).

```ts
// projectStore.ts
export const useProjectStore = create<ProjectStore>((set) => ({
  project: defaultProject(),
  filePath: null,
  isDirty: false,
  dispatch: (action) => set(state => ({ project: applyProjectAction(state.project, action) })),
}));

// uiStore.ts
export const useUIStore = create<UIStore>((set) => ({
  selectedSlideId: null,
  selectedSurfaceId: null,
  selectedLayerId: null,
  editorMode: 'stage',
  setEditorMode: (mode) => set({ editorMode: mode }),
  // ...
}));
```

Components subscribe only to what they need. `SlidePanel` subscribes to `project.slides` and `selectedSlideId` — changes to `editorMode` never re-render it.

**Migration path**: keep `ProjectContext.tsx` as a compatibility shim that reads from both stores. Remove the shim once all consumers are migrated.

---

## Phase 2 — Resilience  
*Make the pipeline impossible to silently fail.*

### 2.1 — Module health monitoring and auto-restart

**Files to change**: `packages/ts/modules/python-module/src/python-module.ts`  
**Files to create**: none

Add a restart policy to `PythonModule`. When the process exits with a non-zero code, attempt restart with exponential backoff (1 s, 2 s, 4 s). After 3 consecutive failures, mark the module as `failed` and emit a `module:status` event.

```ts
type ModuleHealth = 'starting' | 'running' | 'restarting' | 'failed';

private health: ModuleHealth = 'starting';
private restartCount = 0;
private readonly MAX_RESTARTS = 3;
private readonly RESTART_DELAYS_MS = [1000, 2000, 4000];

// In the 'exit' handler:
private onProcessExit(code: number | null): void {
  if (this.health === 'failed' || code === 0 || code === null) return;

  if (this.restartCount < this.MAX_RESTARTS) {
    const delay = this.RESTART_DELAYS_MS[this.restartCount];
    this.health = 'restarting';
    this.restartCount++;
    setTimeout(() => this.spawnPython(), delay);
  } else {
    this.health = 'failed';
    this.onHealthChange?.('failed');
  }
}
```

The `onHealthChange` callback is injected at construction time (by `GraphManager`) and routes to the `module:status` IPC event, which the UI displays in the `GraphConfigPanel`.

---

### 2.2 — Hot params channel (no restart for config changes)

**Files to change**: `packages/py/lights_core/ipc.py`, `packages/ts/modules/python-module/src/python-module.ts`, `packages/ts/lights/electron/graph.ts`

Add a second message type to the stdin protocol: a params message. The Python process reads it between frames and updates its internal config without restarting.

**Protocol addition** (stdin only):
```
message_type = 1  (params)
[4 bytes LE uint32]  JSON header length (message_type=1)
[N bytes]            JSON: { type: "params", data: Record<string, unknown> }
```

**Python side** — in `lights_core/ipc.py`:
```python
def read_message(stdin) -> dict | None:
    length_bytes = stdin.buffer.read(4)
    if len(length_bytes) < 4:
        return None
    length = struct.unpack('<I', length_bytes)[0]
    return json.loads(stdin.buffer.read(length))

# main loop becomes:
while True:
    msg = read_message(sys.stdin)
    if msg is None:
        break
    if msg['type'] == 'params':
        apply_params(msg['data'])   # update confidence thresholds, etc.
    elif msg['type'] == 'frame':
        process_frame(msg, ...)
```

**Node side** — add `setParams(params: Record<string, unknown>)` to `PythonModule`:
```ts
setParams(params: Record<string, unknown>): void {
  if (!this.pythonProcess?.stdin?.writable) return;
  const message = JSON.stringify({ type: 'params', data: params });
  const lengthBuf = Buffer.allocUnsafe(4);
  lengthBuf.writeUInt32LE(Buffer.byteLength(message), 0);
  this.pythonProcess.stdin.write(lengthBuf);
  this.pythonProcess.stdin.write(Buffer.from(message));
}
```

`GraphManager` calls `setParams()` in response to `module:setParams` IPC commands. No graph restart needed for threshold or AOI changes.

---

### 2.3 — Frame buffer pooling

**Files to create**: `lib/io/src/frame-pool.ts`  
**Files to change**: `packages/ts/modules/python-module/src/python-module.ts`

Pre-allocate a pool of `Uint8Array` buffers sized for the expected frame dimensions. `rebuildFrame()` checks out a buffer from the pool instead of allocating; the consumer returns it after use.

```ts
export class FramePool {
  private readonly pool: Uint8Array[] = [];
  private readonly bufferSize: number;

  constructor(frameWidth: number, frameHeight: number, poolSize = 8) {
    this.bufferSize = frameWidth * frameHeight * 3; // RGB24
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(new Uint8Array(this.bufferSize));
    }
  }

  checkout(): Uint8Array {
    return this.pool.pop() ?? new Uint8Array(this.bufferSize);
  }

  checkin(buffer: Uint8Array): void {
    if (buffer.length === this.bufferSize && this.pool.length < 16) {
      this.pool.push(buffer);
    }
  }
}
```

The `Frame` class gets an optional `release()` method. When the frame is no longer referenced (renderer consumed it), the buffer returns to the pool. This eliminates 55 MB/s of allocation at 30 fps per module.

---

## Phase 3 — Performance & Observability

### 3.1 — Full binary stdout protocol (zero-JSON on inference hot path)

**Files to change**: `packages/py/lights_core/ipc.py`, `packages/ts/modules/python-module/src/python-module.ts`

Once Phase 1.2 is shipped and measured, replace the JSON event wrapper with a fixed binary framing on stdout. This eliminates JSON parsing entirely from the inference-to-Node path.

**New stdout framing**:
```
Per response:
  [4 bytes LE uint32]  response_length (total bytes following)
  [1 byte]             event_count
  Per event:
    [1 byte]           event_type  (0=facemesh, 1=handpose, 2=reserved)
    [4 bytes LE uint32] data_length
    [N bytes]          raw binary event payload (unchanged layout)
```

**Node side** — `handleStdout()` becomes a pure binary parser, no `JSON.parse()`:
```ts
private parseResponseBuffer(): void {
  while (this.stdoutBuffer.length >= 5) {
    const responseLen = this.stdoutBuffer.readUInt32LE(0);
    if (this.stdoutBuffer.length < 4 + responseLen) break;

    const eventCount = this.stdoutBuffer[4];
    let offset = 5;
    const events: FrameEvent[] = [];

    for (let i = 0; i < eventCount; i++) {
      const eventType = this.stdoutBuffer[offset];
      const dataLen = this.stdoutBuffer.readUInt32LE(offset + 1);
      const data = this.stdoutBuffer.subarray(offset + 5, offset + 5 + dataLen);
      events.push({ type: EVENT_TYPE_NAMES[eventType], data: new Uint8Array(data) });
      offset += 5 + dataLen;
    }

    this.stdoutBuffer = this.stdoutBuffer.subarray(4 + responseLen);
    this.pendingResolvers.shift()?.(events);
  }
}
```

Benchmark before and after with `packages/py/benchmark.py` (to be added in the testing phase).

---

### 3.2 — Data-driven module registry

**Files to create**: `packages/ts/lights/electron/module-registry.ts`  
**Files to change**: `packages/ts/lights/electron/graph.ts`

Remove the `switch`/`if-else` module wiring from `GraphManager`. Replace with a registry that maps module IDs to descriptors.

```ts
interface ModuleDescriptor {
  moduleId: string;
  label: string;
  scriptModule: AvailableModule;
  defaultParams: Record<string, unknown>;
  defaultScriptArgs: (params: Record<string, unknown>) => string[];
}

export const MODULE_REGISTRY: ModuleDescriptor[] = [
  {
    moduleId: 'hand-pose',
    label: 'Hand Pose',
    scriptModule: AvailableModule.HandPoseEstimation,
    defaultParams: { minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 },
    defaultScriptArgs: (p) => [
      '--min-detection-confidence', String(p.minDetectionConfidence),
      '--min-tracking-confidence', String(p.minTrackingConfidence),
    ],
  },
  {
    moduleId: 'face-mesh',
    label: 'Face Mesh',
    scriptModule: AvailableModule.FaceMeshEstimation,
    defaultParams: { minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 },
    defaultScriptArgs: (p) => [
      '--min-detection-confidence', String(p.minDetectionConfidence),
      '--min-tracking-confidence', String(p.minTrackingConfidence),
    ],
  },
];
```

`GraphManager` iterates `MODULE_REGISTRY` to build the graph. Adding a new module type (body pose, gaze estimation, sound) is adding one descriptor object — no `GraphManager` changes.

---

### 3.3 — Offscreen canvas workers for detection effects

**Files to create**: `packages/ts/lights/src/workers/detection-canvas.worker.ts`  
**Files to change**: `packages/ts/lights/src/OutputApp.tsx`, detection canvas renderer interface

`DetectionCanvasRenderer.render()` currently runs synchronously on the main thread during the Three.js animation loop. A complex renderer (particle system, GPU-simulated trail) can stall the output frame.

Move all detection canvas rendering to a `Worker`:

```ts
// Main thread: hand an OffscreenCanvas to the worker
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker(new URL('./workers/detection-canvas.worker', import.meta.url));
worker.postMessage({ type: 'init', canvas: offscreen, rendererId }, [offscreen]);

// Main thread: feed events to the worker, never blocks
worker.postMessage({ type: 'detection', event: typedEvent });
```

The worker owns the canvas context and the renderer instance. It calls `requestAnimationFrame` inside the worker scope. The main thread never blocks on rendering.

---

### 3.4 — Observability panel

**Files to create**: `packages/ts/lights/src/components/ObservabilityPanel/ObservabilityPanel.tsx`  
**Files to change**: `packages/ts/lights/electron/graph.ts` (emit stats event), `src/ipc/types.ts`

Wire the existing `Graph.getStats()` to a periodic IPC event:

```ts
// electron/graph.ts — emit every 2 seconds
setInterval(() => {
  const stats = graph.getStats();
  mainWindow.webContents.send('graph:event', { type: 'graph:stats', stats });
}, 2000);
```

**New IPC event type**:
```ts
| { type: 'graph:stats'; stats: NodeStats[] }
```

**`ObservabilityPanel`** renders a compact table, toggled by a keyboard shortcut (e.g. `Ctrl+Shift+P`):

```
node           in fps   out fps   p50 ms   p95 ms
──────────────────────────────────────────────────
camera          30.0     30.0       —        —
hand-pose       30.0     28.3     24.1     41.0
face-mesh       30.0     27.9     31.2     55.8
renderer        28.3      —        —       2.1 ms drift
```

This transforms debugging from "why is the screen frozen" to "hand-pose p95 is 55 ms, I need to lower resolution or enable `latest` strategy".

---

## Phase 4 — Testing Fortress  
*Code without tests is a hypothesis. Code with tests is a proof.*

### 4.1 — Python IPC integration tests

**Files to create**: `packages/py/tests/test_ipc.py`, `packages/py/tests/test_facemesh_protocol.py`, `packages/py/tests/test_handpose_protocol.py`

Spawn each inference script as a subprocess. Feed synthetic frames via stdin. Assert the stdout binary response matches the expected framing without requiring a real camera or model. Use `unittest.mock` to patch `mediapipe` so tests run in CI without the GPU.

```python
def test_facemesh_returns_empty_events_on_blank_frame():
    with patch('mediapipe.solutions.face_mesh.FaceMesh') as mock_mesh:
        mock_mesh.return_value.process.return_value.multi_face_landmarks = None
        proc = start_facemesh_process(width=64, height=64)
        send_frame(proc.stdin, width=64, height=64, timestamp=0)
        response = read_response(proc.stdout)
        assert response['events'] == []
```

### 4.2 — Binary decoder unit tests

**Files to create**: `lib/io/src/__test__/frame.test.ts`, `packages/ts/lights/src/__test__/detectionTypes.test.ts`

The binary decoders in `detectionTypes.ts` have zero tests. They contain magic byte offsets. Every optimisation to the binary protocol risks silently breaking them.

```ts
it('decodes a handpose event with the correct landmark at index 0', () => {
  // Arrange — build a known binary payload
  const buf = new ArrayBuffer(253);
  const view = new DataView(buf);
  view.setUint8(0, 1); // Right hand
  view.setFloat32(1, 0.5, true); // wrist x
  view.setFloat32(5, 0.25, true); // wrist y
  view.setFloat32(9, 0.1, true); // wrist z

  // Act
  const event = decodeHandpose(new Uint8Array(buf));

  // Assert
  expect(event.handedness).toBe('Right');
  expect(event.landmarks[0]).toEqual({ x: 0.5, y: 0.25, z: 0.1 });
});
```

### 4.3 — Frame pipeline property tests

**Files to create**: `lib/io/src/__test__/concat.test.ts` (expand), `lib/graph/src/__test__/graph.test.ts` (expand)

The `concat()` utility and the `Graph` wiring logic have targeted unit tests but no property-based coverage. Use [fast-check](https://github.com/dubzzz/fast-check) to generate arbitrary frame sequences and assert invariants:

- `concat(frames)` total data size equals sum of part sizes
- `concat(frames)` timestamp equals `frames[0].timestamp`
- `Graph.start()` after `Graph.stop()` does not throw
- `Graph` with a `'latest'` strategy never emits more frames than received

### 4.4 — Python benchmark harness

**Files to create**: `packages/py/benchmark.py`

A standalone script (no Electron, no camera) that feeds synthetic RGB24 frames to an inference module and reports P50/P95/P99 latency. Run before and after every inference optimisation to measure actual impact.

```
$ python3 packages/py/benchmark.py --module facemesh --frames 200 --width 320 --height 240

module     : facemesh
resolution : 320×240
frames     : 200

  p50  : 18.4 ms
  p95  : 27.1 ms
  p99  : 31.0 ms
  throughput (p50): 54.3 fps
```

---

## Implementation Order for Agents

| Phase | Task | Agent | Effort | Risk |
|---|---|---|---|---|
| 1.1 | Python shared core library | developer | S | Low |
| 1.2 | Base64 event encoding | developer | XS | Low |
| 1.3 | Project schema + migrations | developer | S | Medium |
| 1.4 | Split ProjectContext → Zustand | refactorer | L | Medium |
| 4.4 | Benchmark harness | tester | S | Low |
| 4.2 | Binary decoder unit tests | tester | S | Low |
| 2.1 | Module auto-restart | developer | S | Low |
| 2.2 | Hot params channel | developer + architect | M | Medium |
| 2.3 | Frame buffer pooling | developer | M | Low |
| 4.1 | Python IPC integration tests | tester | M | Low |
| 4.3 | Property-based tests | tester | M | Low |
| 3.1 | Full binary stdout protocol | developer | M | Medium |
| 3.2 | Module registry | refactorer | S | Low |
| 3.3 | Offscreen canvas workers | developer | L | High |
| 3.4 | Observability panel | developer | M | Low |

**Effort**: XS < 1h · S < 3h · M < 1d · L < 3d  
**Risk**: Low = isolated change · Medium = crosses a module boundary · High = requires browser API negotiation

---

## Non-Goals

These are good ideas that are explicitly out of scope for this plan:

- **GPU inference** (CoreML, ONNX Runtime, WebGPU compute): valid but requires replacing MediaPipe wholesale. Measure Python bottleneck first.
- **Multi-projector support**: described in guidelines as a non-goal.
- **Cloud sync / user accounts**: non-goal.
- **Custom video layer types**: post-milestone-3.

---

## Appendix A — New type contracts

```ts
// Module health event (new, emitted by GraphManager)
| { type: 'module:status'; moduleId: string; health: 'running' | 'restarting' | 'failed' }

// Stats event (new, periodic)
| { type: 'graph:stats'; stats: NodeStats[] }

// Hot params command (already defined in IPC types, now actually wired)
| { type: 'module:setParams'; moduleId: string; params: Record<string, unknown> }
```

```ts
// projectStore.ts
interface ProjectStore {
  project: Project;
  filePath: string | null;
  isDirty: boolean;
  dispatch: (action: ProjectAction) => void;
  load: (filePath: string) => Promise<void>;
  save: () => Promise<void>;
}

// uiStore.ts
interface UIStore {
  selectedSlideId: string | null;
  selectedSurfaceId: string | null;
  selectedLayerId: string | null;
  editorMode: EditorMode;
  setEditorMode: (mode: EditorMode) => void;
  selectSlide: (id: string | null) => void;
  selectSurface: (id: string | null) => void;
  selectLayer: (id: string | null) => void;
}
```

---

## Appendix B — Binary protocol version table

| Version | Direction | Format | Status |
|---|---|---|---|
| v0 | stdin (frame) | 4B len + JSON header + raw binary | Current |
| v0 | stdout (response) | 4B len + JSON `{events:[{type,data:number[]}]}` | Current — replace in 1.2 |
| v1 | stdout (response) | 4B len + JSON `{events:[{type,data:string(base64)}]}` | Phase 1.2 |
| v2 | stdin (frame+params) | 4B len + JSON `{type,…payload}` | Phase 2.2 |
| v3 | stdout (response) | fully binary framing (see §3.1) | Phase 3.1 |
