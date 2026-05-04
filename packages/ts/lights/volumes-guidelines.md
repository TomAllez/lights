# Volumes Editor — Feature Guidelines

## What is a Volume?

A **Volume** is a 3D scene composited into the main stage canvas. It has its own virtual camera
whose perspective you align with your real-world projection environment, so the 3D content appears
to "sit" correctly in the physical space. Once the camera is aligned, you enter the Volume editor
to populate the scene with 3D primitives.

Think of it as: the Stage is 2D + flat Surfaces; a Volume punches a 3D viewport into that same
canvas, perspective-matched to the projector.

---

## Workflow

```
Stage view
  └── Add Volume
        ↓
      3D scene composited on canvas (empty at first)
      [Align camera] → HUD with vanishing point overlay + arrow controls
        ↓
      Enter Volume editor
        └── Add primitives (box, sphere, cylinder…)
            Position / rotate / scale them in 3D space
```

Camera alignment happens **in the stage view** — you're watching the full projected output while
nudging the virtual camera until it matches the physical environment. Only then do you go inside
to build the scene.

---

## Data Model

```ts
export type VolumeShapeType = 'box' | 'sphere' | 'cylinder' | 'cone'

export interface VolumeShape {
  id: string
  name: string
  type: VolumeShapeType
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }  // Euler XYZ degrees
  scale: { x: number; y: number; z: number }
  layers: Layer[]        // same types as Surface — texture mapped onto the shape
  reactions: Reaction[]  // same types as Surface
}

export interface VolumeCamera {
  position: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }  // look-at point
  fov: number  // degrees, default 50
}

export interface Volume {
  id: string
  name: string
  camera: VolumeCamera
  shapes: VolumeShape[]
}
```

`Slide` gains a `volume?: Volume` field alongside `surfaces`. One Volume per slide — a single 3D
scene for the whole projected output. World unit scale is arbitrary but consistent within a scene.

`VolumeShape` deliberately mirrors `Surface`: same `Layer` and `Reaction` types, same mental model.
This keeps the UI familiar and makes future factorization straightforward.

---

## Stage View — Camera Alignment

Clicking **[Align camera]** on the Volume row in the side panel activates the alignment HUD over
the stage canvas. The HUD renders a fixed **two-point perspective grid** (horizon line + two sets
of converging lines) as a visual reference. You nudge the virtual camera until the grid lines
match the perspective of the real-world environment visible in the projected output.

Arrow controls (always one fixed increment per click):

| Button | Effect |
|--------|--------|
| Orbit ←→ ↑↓ | Rotate camera around target point |
| Pan ←→ ↑↓ | Translate camera + target laterally |
| Dolly + − | Push camera toward / away from target |
| FOV + − | Widen / narrow field of view |

All changes to `Volume.camera` are live. **[Done]** exits the HUD and saves camera state.

---

## Volume Editor — 3D Scene

Entering a Volume switches the canvas to a dedicated 3D editor. The editor camera is a free orbit
camera (independent from the projection camera) so you can navigate freely while authoring. The
projection camera is shown as a ghost frustum so you always know what the projector will see.

Controls:
- **Orbit / pan / zoom** — mouse drag / scroll (`OrbitControls`)
- **Create Shape** — picker for box / sphere / cylinder / cone, inserted at origin
- **Select + transform gizmo** — click to select, drag handles to translate / rotate / scale
  (`TransformControls`)
- **Delete** — removes selected shape
- **View from projector** — snaps the editor camera to `Volume.camera` for a projection preview

A ground grid and axis indicator help with orientation.

---

## Rendering / Compositing

The Volume's 3D scene renders in the same Three.js canvas as the Stage, as a separate pass on top
of the flat surface quads. The projection camera (`Volume.camera`) drives the perspective matrix
for this pass. The free-orbit editor camera is only active inside the Volume editor.

**Open question:** render order — does the 3D scene always render on top of flat surfaces, or
should depth ordering be respected? Rendering on top is simpler; depth ordering requires a unified
depth buffer across both passes.

---

## Out of scope

- Custom mesh / OBJ / GLTF import
- Per-face layer assignment
- Spatial audio
- Animation / keyframing
- Camera calibration tie-in (M5)
- Numeric transform input fields, snapping, grid alignment
- Mouse-drag orbit on the stage overlay
- User-draggable vanishing point lines
