<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `yarn nx build`, `yarn exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Project: Lights

Projection mapping desktop app (Electron + React + Three.js). A camera captures video; ML inference detects faces/hands; results drive real-time visual effects on physical surfaces via a projector.

## Repository Layout

```
lib/
  driver/          BaseDriver — abstract frame source
  io/              Frame, InputPort, OutputPort (RxJS-based)
  module/          BaseModule, AsyncModule — processing nodes
  graph/           Graph — DAG wiring drivers/modules/renderers; per-node stats
  renderer/        BaseRenderer — abstract frame consumer
  three-scene/     VolumeSceneManager, homography GLSL helpers

packages/ts/
  lights/          Main Electron app (React UI, IPC, Three.js output)
  modules/
    driver-ffmpeg/ FFmpeg-based camera driver (spawns ffmpeg, emits RGB24 frames)
    python-module/ PythonModule — spawns Python subprocess, handles IPC

packages/py/
  facemesh/main.py   MediaPipe FaceMesh — 468 landmarks per face
  handpose/main.py   MediaPipe Hands — 21 landmarks per hand + handedness
```

Key design documents: `packages/ts/lights/guidelines.md` (full product spec, data model, milestones).

## Inference Pipeline

```
FFmpeg process
  │  stdout: raw RGB24 bytes
  ↓
FfmpegDriver  (packages/ts/modules/driver-ffmpeg)
  │  emits: Frame (RGB24 binary blob + metadata)
  ↓
PythonModule  (packages/ts/modules/python-module)
  │  stdin:  [4-byte LE uint32 header_len][JSON header][RGB24 data]
  │  stdout: [4-byte LE uint32 json_len][JSON events]
  ↓
Python inference process  (packages/py/facemesh or handpose)
  │  runs: MediaPipe FaceMesh / Hands on each frame
  │  emits: JSON { events: [{ type, data: number[] }] }
  ↓
Graph  (lib/graph)
  │  rewraps events back into Frame
  ↓
Renderer / React UI  (packages/ts/lights)
```

### IPC Protocol (Node → Python)

```
stdin per frame:
  [4 bytes LE uint32]  JSON header length
  [N bytes]            JSON: { timestamp, duration, metadata: { partName: { offset, size } } }
  [M bytes]            raw binary frame data (all parts concatenated)

stdout per frame:
  [4 bytes LE uint32]  JSON response length
  [N bytes]            JSON: { events: [{ type: string, data: number[] }] }
```

Event `data` field encodes binary landmarks as a **JSON array of byte values** (e.g. `[12, 34, ...]`). For facemesh: 468 × 3 float32 = 5 616 bytes → serializes as ~16 KB JSON. This is the primary serialization bottleneck.

## Inference Optimization Targets

The following are the highest-leverage areas for reducing end-to-end inference latency:

| # | Area | Current state | Target |
|---|------|---------------|--------|
| 1 | Event serialization | `list(buf)` → JSON array of ints (~16 KB per face) | Base64-encode binary blobs; decode in `PythonModule` |
| 2 | Frame resolution | Full 640×480 sent to Python | Downscale before send or use `--scale` arg in FFmpeg |
| 3 | Frame scheduling | All frames queued (`'queue'` strategy) | Use `'latest'` strategy on the Python edge to drop stale frames |
| 4 | Python startup | No warm-up; first frame pays model load cost | Pre-warm on spawn by running a blank frame |
| 5 | NumPy reshape | `np.frombuffer(...).reshape(...)` per frame | Pre-allocate buffer, use in-place copy |

### Quick wins (no protocol change needed)

- **Frame strategy**: In `packages/ts/lights/electron/graph.ts`, connect Python modules with `{ strategy: 'latest' }` to drop frames when inference is slower than capture FPS.
- **Resolution**: Pass `--width 320 --height 240` to `PythonModule` `scriptArgs`; scale down in FfmpegDriver at capture time.

### Requires protocol change

- **Base64 events**: Change `encode_face_event` / `encode_hand_event` in Python to emit base64, update `PythonModule.handleStdout` to decode. Cuts stdout payload by ~60%.
- **Binary stdout framing**: Replace JSON wrapper with a fixed binary header for zero-copy deserialization.

## Project File Versioning

`.lights.json` files carry a top-level `version` integer. On open, `validateProject()` in
`packages/ts/lights/src/model/schema.ts` migrates old files to `CURRENT_VERSION` before
they reach the renderer. Files from a newer app version are rejected with a user-facing dialog.

**To add a migration** (e.g. when changing `Slide`, `Surface`, or `Layer` shapes):
1. Append a function to the `migrations` array in `packages/ts/lights/src/model/migrations.ts`.
   `CURRENT_VERSION` increments automatically — no manual bookkeeping.
2. Update the affected types in `types.ts`.
3. Add a row to the migration history table in `migrations.ts`.

See the JSDoc block at the top of `migrations.ts` for the full how-to.

## Development Commands

```bash
yarn nx test @lights/graph          # run graph unit tests
yarn nx test @lights/python-module  # run python-module unit tests
yarn nx run-many -t test            # run all tests
yarn nx build @lights/app           # typecheck + build Electron app
yarn nx lint lights                 # lint
```

## Key Files for Inference Work

| File | Role |
|------|------|
| `packages/py/facemesh/main.py` | FaceMesh inference loop, IPC read/write |
| `packages/py/handpose/main.py` | Hands inference loop, IPC read/write |
| `packages/ts/modules/python-module/src/python-module.ts` | Node side of Python IPC |
| `packages/ts/lights/electron/graph.ts` | Wires the full pipeline; edge strategies live here |
| `lib/graph/src/graph.ts` | Graph DAG, `ConnectOptions.strategy`, `NodeStats` |
| `lib/io/src/frame.ts` | `Frame` type (immutable, carry binary + events) |
