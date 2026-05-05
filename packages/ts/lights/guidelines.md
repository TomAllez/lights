# Lights

Projection mapping application: design and control content projected onto physical surfaces, with real-time interactivity driven by a backend ML event pipeline.

## Vision

A slide-based editor where each slide is a collection of **surfaces** mapped to physical regions in the real world. Users author content in a clean, flat surface editor and the app handles the projection warping transparently. The backend detects events (motion, hand pose, face mesh, sound, lighting) and users wire those to reactions on individual surfaces — no coding required.

## Target Platform

**Electron** desktop app. The Node.js backend (graph, drivers, modules) runs in the Electron main process — no separate server, native file system and dialog access, tight IPC integration.

## Tech Stack

- **Shell**: Electron
- **Frontend**: React + Vite (`@nx/vite`)
- **Language**: TypeScript throughout
- **Renderer**: Three.js (WebGL) with custom GLSL shaders for homography warping
- **Styling**: plain CSS to start, revisit when the UI stabilises
- **Backend connection**: Electron IPC
- **State**: React context + local state; no external store until complexity demands it

## Core Concepts

### Homography

Each surface has a **homography transform** — a 4-corner perspective warp that maps the surface's flat local space onto the projector output space. This handles surfaces at any angle to the projector accurately. Implemented as a custom GLSL shader in Three.js; same performance as raw WebGL with less boilerplate.

### Two Coordinate Spaces

**Stage space** — the projector's full output canvas. Surfaces appear here as warped polygons, positioned as the audience will see them. This is where you define surface geometry.

**Surface local space** — a flat, undistorted rectangle. This is where you author content. Looks like a normal canvas editor; the app applies the homography transparently at render time.

## Data Model

```ts
interface Project {
  slides: Slide[]
  calibration: Calibration  // shared across slides
}

interface Slide {
  id: string
  name: string
  surfaces: Surface[]
  graphConfig: GraphConfig   // which modules are active for this slide
}

interface Surface {
  id: string
  name: string
  outputPolygon: Point[]     // 4 corners in stage space (projector output)
  areaOfInterest?: Polygon   // region in camera frame space for event routing
  layers: Layer[]            // authored in local flat space
  reactions: Reaction[]      // event → layer action bindings
}

interface GraphConfig {
  modules: {
    [moduleId: string]: {
      enabled: boolean
      params?: Record<string, unknown>  // user-authored params (e.g. confidence threshold)
      // aoi is NOT stored here — it is derived at slide activation time
    }
  }
}
```

The driver (video capture) and renderer always run. Modules are toggled per slide — only what the slide needs is running.

### Area of Interest (AOI)

Each surface can define an AOI: a polygon in camera frame space. AOIs serve two purposes:

**1. Module-level cropping (at graph start):** When a slide activates, the app computes the union of all surface AOIs and passes it to each enabled module as a crop parameter. The module runs inference only on that region — fewer pixels processed, lower latency. Users never configure this manually; it is derived automatically from the surface definitions.

**2. App-level event routing (at event time):** When a module emits a detection with a position, the app checks which surface AOIs contain that position and routes the event only to matching surfaces. A detection can hit multiple surfaces if their AOIs overlap.

```
Slide activates
  → union of all surface AOIs computed
  → passed to enabled modules as crop params
  → graph starts

Module runs inference on cropped region only
  → emits detection with position (remapped to full frame space)
  → app routes to surfaces whose AOI contains the position
  → matching surface reactions fire
```

### Graph Lifecycle on Slide Switch

1. Diff `graphConfig` of the outgoing slide vs the incoming slide
2. Stop modules the new slide does not need (drain in-flight frames first)
3. Start modules the new slide needs that weren't running, with derived AOI params
4. Swap the visual canvas

Events available in the reaction editor are scoped to the modules enabled in the slide's `graphConfig` — no dangling bindings to inactive modules.

## Command Bus

The frontend and backend communicate through a typed, bidirectional protocol. The frontend sends commands; the backend emits events. Neither side knows about the transport layer — today Electron IPC, extensible later without changing either end.

### Two categories of graph change

**Topology changes** (add/remove modules, rewire connections) — structural changes that are unsafe to apply to a live RxJS pipeline. The graph drains in-flight frames, stops, reconfigures, and restarts. Happens on slide switch.

**Param changes** (AOI crop, confidence threshold, etc.) — hot-updatable without restart. Delivered to running modules via a params channel alongside the frame pipeline.

### Protocol

```ts
// Frontend → Backend
type GraphCommand =
  | { type: 'calibration:start' }
  | { type: 'calibration:stop' }
  | { type: 'slide:activate'; config: GraphConfig; aois: AOIMap }
  | { type: 'module:setParams'; moduleId: string; params: Record<string, unknown> }
  | { type: 'graph:stop' }

// Backend → Frontend
type GraphEvent =
  | { type: 'calibration:project'; pattern: Pattern }
  | { type: 'calibration:result'; surfaces: Surface[] }
  | { type: 'frame'; data: ArrayBuffer }
  | { type: 'detection'; moduleId: string; position: Point; data: unknown }
  | { type: 'graph:status'; status: 'running' | 'stopped' | 'error' }
```

## Editor UX

### Slide Panel (left sidebar)

Thumbnails show the **projected result** — surfaces warped and positioned on a dark canvas as the audience will see them. This reinforces that the output will be projected.

### Main Area — Two Modes

**Stage mode** (default when a slide is selected): shows the full projector output canvas. Surfaces appear as polygons. Users drag corners to define or adjust surface geometry. Clicking a surface enters Surface mode.

**Surface mode** (active surface selected): shows the surface's flat local canvas — clean, undistorted, normal canvas editor feel. Users place, resize, rotate, and edit layers here. A back button returns to Stage mode.

```
Stage mode                         Surface mode
┌─────────────────────────┐        ┌─────────────────────────┐
│  [dark stage canvas]    │        │  [clean flat canvas]    │
│                         │        │                         │
│   ┌──────┐              │ click  │  ┌───────────────────┐  │
│   │ surf │  ╲           │───────▶│  │  layer 1          │  │
│   └──────┘   ╲          │        │  │  layer 2          │  │
│         ┌─────╲──┐      │        │  └───────────────────┘  │
│         │  surf  │      │        │                         │
│         └────────┘      │        │        [← stage]        │
└─────────────────────────┘        └─────────────────────────┘
```

### Right Panel

- In Stage mode: slide-level properties, graph config (module toggles + params), list of surfaces
- In Surface mode: layer stack, AOI editor (draw region in camera space), reaction bindings

## Projector Output Window

A second Electron `BrowserWindow` that serves as the actual projection — the user drags it onto the projector display (macOS extended desktop) and fullscreens it. No UI chrome: black background, surfaces rendered at their warped positions with real layer content, nothing else.

### Relationship to the editor

The two windows run in separate renderer processes and share no state directly. The editor sends changes to the Electron main process via IPC; the main process forwards the active slide to the output window.

```
Editor window  ──IPC──▶  Main process  ──IPC──▶  Output window
 (authoring)               (state hub)             (projection)
```

### Coordinate system

The output window's canvas **is** the projector coordinate space. `outputPolygon` points (normalised [0,1]) map to the output window's full width × height with no letterboxing or aspect-ratio box — the window fills the display, and the display is the projector.

The Three.js renderer covers NDC [−1, 1] filling the entire window, so the existing homography vertex shader works unchanged. Only the fragment shaders differ: the output window renders actual layer content (solid fill, image, text) instead of the editor's checkerboard placeholder.

### IPC addition

```ts
// Main → Output window
type OutputCommand =
  | { type: 'slide:render'; slide: Slide }
```

Sent whenever the active slide changes or its surfaces/layers are edited. The output window re-renders immediately on receipt.

### Window lifecycle

1. Created on app launch alongside the editor window — hidden or shown on a secondary display
2. User positions it on the projector display and fullscreens it (standard macOS window management)
3. On slide switch: main process sends `slide:render` with the new slide; output window re-renders
4. Output window has no interaction surface — pointer events ignored, no menu bar

### Build plan

- **M2**: create the output window shell — Electron `BrowserWindow`, basic Three.js renderer, IPC wiring. Renders black (no layers yet). Establishes the multi-window architecture before content exists.
- **M3**: output window renders real layer content. Solid fill is the first target — immediately makes the projection useful.
- **M4**: reactions fire in the output window (layer animations, visibility changes driven by ML events).

### Constraints

- Single output window only — one projector. Multi-projector is a non-goal.
- User positions the window manually — no auto-detect of the projector display.
- The checkerboard placeholder is editor-only and never sent to the output window.

## Milestones

### Milestone 1 — Electron Shell + Live Canvas

Goal: prove the stack works and see something moving on screen.

- React + Vite app scaffolded in `packages/ts/lights`
- Wrapped in Electron; backend graph runs in main process
- Electron IPC renderer replaces `renderer-websocket`
- Three.js canvas fills the window; renders incoming RGB24 frames as a texture
- ML event overlays drawn on top (hand landmarks, face mesh)
- Command bus wired at its simplest: backend emits `frame` and `detection`, frontend displays them
- Minimal chrome: canvas, connection status, dark theme

**Done when**: the app launches as a standalone desktop window with the live feed and ML overlays visible. No separate Node process to start.

### Milestone 2 — Stage & Surfaces

Goal: define surfaces manually and see content warped correctly onto them.

- Slide panel (left sidebar) with projected thumbnails
- Stage mode: dark canvas at projector aspect ratio; draw surfaces as quads by dragging corners
- Homography GLSL shader applied: anything placed in surface local space warps correctly to stage
- Surface mode: click a surface to enter its flat local editor; back button returns to stage
- Slide switch triggers graph lifecycle (diff, drain, stop/start modules)
- **Projector output window shell**: second `BrowserWindow` created, IPC wiring in place, renders black (no layers yet)

**Done when**: you can define a surface, place a solid color on it, and see it correctly warped in the stage view. The output window opens alongside the editor.

### Milestone 3 — Layers, Content & Project

Goal: author real content on surfaces and see it live on the projector.

- Layer types: solid color, image (file picker), text
- Drag, resize, rotate layers in surface local space
- Layer panel (right sidebar): stack, visibility toggles, reorder
- Graph config panel per slide: toggle modules on/off, expose key params
- Project save/load via native file dialogs (JSON file)
- **Output window renders real layers**: solid fill first, then image and text. Edits in the editor appear on the projector in real time.

**Done when**: you can build a multi-surface, multi-slide project with real content, save it, reopen it, and see it projected correctly on the output window.

### Milestone 4 — Volumes Editor

Goal: add depth to a scene by compositing a 3D scene onto the stage canvas.

A **Volume** is a single 3D scene attached to a slide. It renders as a separate pass on top of
the flat surfaces, perspective-matched to the real-world projection environment via a virtual
camera. `VolumeShape` mirrors `Surface`: same `Layer` and `Reaction` types, same mental model.

```ts
interface Volume {
  id: string
  name: string
  camera: VolumeCamera  // position, target, fov
  shapes: VolumeShape[]
}

interface VolumeShape {
  id: string; name: string; type: 'box' | 'sphere' | 'cylinder' | 'cone'
  position, rotation, scale: { x, y, z }
  layers: Layer[]
  reactions: Reaction[]
}
```

`Slide` gains a `volume?: Volume` field. One Volume per slide.

**Camera alignment** — a HUD activated from the side panel. Overlays a fixed two-point
perspective grid (horizon + two sets of converging lines) on the stage canvas. Arrow controls
(orbit / pan / dolly / FOV) nudge `Volume.camera` in fixed increments; the 3D scene updates
live until the grid matches the physical environment.

**Volume editor** — entering a Volume switches the canvas to a free-orbit 3D editor
(`OrbitControls` + `TransformControls`). Shapes are created, positioned, and deleted here.
A "View from projector" button snaps the editor camera to `Volume.camera` for a projection
preview. A ghost frustum shows the projection camera at all times.

**Done when**: you can add a 3D primitive to a slide, align the virtual camera to the physical
environment, and see the shape rendered correctly in the projected output.

---

### Milestone 5 — Event Reactions

Goal: make the installation interactive — the fun payoff.

- Graph config panel activates: toggle modules per slide, set confidence thresholds
- AOI editor per surface: manually draw the region in camera space where this surface listens for events (manual until M5 calibration provides the camera-to-projector mapping)
- Event inspector: live feed of incoming detections for the active slide's modules
- Reaction editor: bind events to layer actions (show/hide, animate, change color)
- AOI routing: detections are routed only to surfaces whose AOI contains the detection position
- Only events from enabled modules appear as available triggers; no dangling bindings

**Done when**: waving your hand changes something on a specific surface, configured entirely in the UI.

### Milestone 6 — Calibration & Geometry

Goal: replace manual surface placement with automatic geometry detection.

**Calibration graph** — a dedicated graph that runs only during calibration, separate from any slide graph:

```
Camera Driver → Calibration Module
                     ↓ emits:
                       calibration:project { pattern }  → app renders pattern fullscreen on projector
                       calibration:result  { surfaces } → app stores geometry, graph stops
```

**Sequence:**
1. App starts; calibration graph launches before any slide loads
2. Calibration module emits `calibration:project` with a test pattern
3. App renders the pattern fullscreen on the projector output
4. Camera captures the result; driver feeds the frame back to the module
5. Module computes the difference between expected and observed pattern
6. Repeats with refined patterns, converging iteratively
7. Module emits `calibration:result` with computed surface geometries
8. App stores surfaces and camera-to-projector mapping in the project, stops calibration graph
9. Slide editor unlocks with surfaces pre-positioned; AOI editor now uses the accurate mapping

**Note on the camera driver:** the existing FFmpeg driver reads a file or stream. Calibration requires live camera input — this will likely need a dedicated live camera driver or a live-capture mode of the existing one.

Manual fine-adjustment of corners remains available after auto-detection. Calibration result is persisted in the project file.

**Done when**: the app auto-detects surface geometry on launch, surfaces appear pre-positioned, and AOI regions align accurately with the physical setup.

## Open Questions

**Recalibration on drift** — what happens when the physical setup changes mid-session (projector bumped, surface moved)? Options:
- Manual "Recalibrate" button the user triggers explicitly
- App detects projection drift (by continuously comparing a reference pattern against camera input) and prompts the user to recalibrate
- App detects drift and recalibrates silently in the background

The silent option is the most seamless but risks surprising the user if it fires at the wrong moment (e.g. mid-performance). Worth deciding before Milestone 5 (Calibration).

## Non-Goals (for now)

- Multi-projector support
- Non-planar surface warping (mesh deformation)
- Custom video/audio layer types
- User accounts or cloud sync
- Mobile or web deployment
- Accessibility
