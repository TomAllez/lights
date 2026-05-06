import { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { ImageLayer, Layer, Project, ShaderLayer, ShaderPreset, Slide, Surface, TextLayer, Volume, VolumeCamera, VolumeEditMode } from './types'

export type EditorMode = 'stage' | 'surface' | 'volume-align' | 'volume-editor'

// ── State ────────────────────────────────────────────────────────────────────

export interface ProjectState {
  project: Project
  selectedSlideId: string | null
  selectedSurfaceId: string | null
  selectedLayerId: string | null
  editorMode: EditorMode
  volumeEditMode: VolumeEditMode
  selectedShapeId: string | null
  isDirty: boolean
  currentFilePath: string | null
}

const initial: ProjectState = {
  project: { slides: [], calibration: {} },
  selectedSlideId: null,
  selectedSurfaceId: null,
  selectedLayerId: null,
  editorMode: 'stage',
  volumeEditMode: 'object',
  selectedShapeId: null,
  isDirty: false,
  currentFilePath: null,
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type ProjectAction =
  | { type: 'project:load'; project: Project; filePath: string }
  | { type: 'project:saved'; filePath: string }
  | { type: 'project:new' }
  | { type: 'slide:add' }
  | { type: 'slide:rename'; slideId: string; name: string }
  | { type: 'surface:rename'; slideId: string; surfaceId: string; name: string }
  | { type: 'slide:duplicate'; slideId: string }
  | { type: 'slide:remove'; slideId: string }
  | { type: 'slide:select'; slideId: string | null }
  | { type: 'surface:add'; slideId: string }
  | { type: 'surface:paste'; slideId: string; surface: Surface }
  | { type: 'surface:update'; slideId: string; surface: Surface }
  | { type: 'surface:remove'; slideId: string; surfaceId: string }
  | { type: 'surface:select'; surfaceId: string | null }
  | { type: 'surface:enter' }   // double-click → open flat editor
  | { type: 'surface:exit' }    // back / Escape → return to stage, keep selection
  | { type: 'layer:add'; slideId: string; surfaceId: string }
  | { type: 'layer:add-image'; slideId: string; surfaceId: string; src: string; name: string }
  | { type: 'layer:add-text'; slideId: string; surfaceId: string }
  | { type: 'layer:add-shader'; slideId: string; surfaceId: string; preset?: ShaderPreset }
  | { type: 'layer:remove'; slideId: string; surfaceId: string; layerId: string }
  | { type: 'layer:update'; slideId: string; surfaceId: string; layer: Layer }
  | { type: 'layer:reorder'; slideId: string; surfaceId: string; layerIds: string[] }
  | { type: 'layer:select'; layerId: string | null }
  | { type: 'layer:toggle-visibility'; slideId: string; surfaceId: string; layerId: string }
  | { type: 'slide:updateGraphConfig'; slideId: string; config: import('../ipc/types').GraphConfig }
  | { type: 'volume:add'; slideId: string }
  | { type: 'volume:remove'; slideId: string }
  | { type: 'volume:alignStart' }
  | { type: 'volume:alignDone' }
  | { type: 'volume:updateCamera'; slideId: string; camera: VolumeCamera }
  | { type: 'volume:editorEnter' }
  | { type: 'volume:editorExit' }
  | { type: 'volume:shapeAdd'; slideId: string; shapeType: import('./types').VolumeShapeType }
  | { type: 'volume:shapeRemove'; slideId: string; shapeId: string }
  | { type: 'volume:shapeUpdate'; slideId: string; shape: import('./types').VolumeShape }
  | { type: 'volume:shapeSelect'; shapeId: string | null }
  | { type: 'volume:editModeSet'; mode: VolumeEditMode }

// ── Helpers ──────────────────────────────────────────────────────────────────

function patchSurfaceLayers(
  state: ProjectState,
  slideId: string,
  surfaceId: string,
  fn: (layers: Layer[]) => Layer[]
): ProjectState {
  return {
    ...state,
    project: {
      ...state.project,
      slides: state.project.slides.map(s =>
        s.id === slideId
          ? { ...s, surfaces: s.surfaces.map(sf => sf.id === surfaceId ? { ...sf, layers: fn(sf.layers) } : sf) }
          : s
      ),
    },
  }
}

// ── Sub-reducers ──────────────────────────────────────────────────────────────

type SlideAction   = Extract<ProjectAction, { type: `slide:${string}` }>
type SurfaceAction = Extract<ProjectAction, { type: `surface:${string}` }>
type LayerAction   = Extract<ProjectAction, { type: `layer:${string}` }>
type VolumeAction  = Extract<ProjectAction, { type: `volume:${string}` }>

function applySlideAction(state: ProjectState, action: SlideAction): ProjectState {
  const { project } = state
  switch (action.type) {
    case 'slide:add': {
      const slide: Slide = {
        id: crypto.randomUUID(),
        name: `Slide ${project.slides.length + 1}`,
        surfaces: [],
        graphConfig: { modules: {} },
      }
      return {
        ...state,
        project: { ...project, slides: [...project.slides, slide] },
        selectedSlideId: slide.id,
        selectedSurfaceId: null,
        editorMode: 'stage',
      }
    }

    case 'slide:duplicate': {
      const src = project.slides.find(s => s.id === action.slideId)
      if (!src) return state
      const copy: Slide = {
        ...src,
        id: crypto.randomUUID(),
        name: `${src.name} copy`,
        surfaces: src.surfaces.map(sf => ({
          ...sf,
          id: crypto.randomUUID(),
          layers: sf.layers.map(l => ({ ...l, id: crypto.randomUUID() })),
        })),
      }
      const idx = project.slides.findIndex(s => s.id === action.slideId)
      const slides = [...project.slides.slice(0, idx + 1), copy, ...project.slides.slice(idx + 1)]
      return {
        ...state,
        project: { ...project, slides },
        selectedSlideId: copy.id,
        selectedSurfaceId: null,
        editorMode: 'stage',
      }
    }

    case 'slide:remove': {
      const slides = project.slides.filter(s => s.id !== action.slideId)
      const selectedSlideId =
        state.selectedSlideId === action.slideId
          ? (slides[0]?.id ?? null)
          : state.selectedSlideId
      return {
        ...state,
        project: { ...project, slides },
        selectedSlideId,
        selectedSurfaceId: null,
        editorMode: 'stage',
      }
    }

    case 'slide:select':
      return { ...state, selectedSlideId: action.slideId, selectedSurfaceId: null, selectedLayerId: null, editorMode: 'stage' }

    case 'slide:rename':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s => s.id === action.slideId ? { ...s, name: action.name } : s),
        },
      }

    case 'slide:updateGraphConfig':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s => s.id === action.slideId ? { ...s, graphConfig: action.config } : s),
        },
      }

    default:
      return state
  }
}

function applySurfaceAction(state: ProjectState, action: SurfaceAction): ProjectState {
  const { project } = state
  switch (action.type) {
    case 'surface:add': {
      const surface: Surface = {
        id: crypto.randomUUID(),
        name: `Surface ${(project.slides.find(s => s.id === action.slideId)?.surfaces.length ?? 0) + 1}`,
        outputPolygon: [
          { x: 0.25, y: 0.25 },
          { x: 0.75, y: 0.25 },
          { x: 0.75, y: 0.75 },
          { x: 0.25, y: 0.75 },
        ],
        layers: [],
        reactions: [],
      }
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId ? { ...s, surfaces: [...s.surfaces, surface] } : s
          ),
        },
      }
    }

    case 'surface:paste':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId ? { ...s, surfaces: [...s.surfaces, action.surface] } : s
          ),
        },
        selectedSurfaceId: action.surface.id,
      }

    case 'surface:update':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId
              ? { ...s, surfaces: s.surfaces.map(sf => sf.id === action.surface.id ? action.surface : sf) }
              : s
          ),
        },
      }

    case 'surface:remove': {
      const selectedSurfaceId =
        state.selectedSurfaceId === action.surfaceId ? null : state.selectedSurfaceId
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId
              ? { ...s, surfaces: s.surfaces.filter(sf => sf.id !== action.surfaceId) }
              : s
          ),
        },
        selectedSurfaceId,
        editorMode: selectedSurfaceId === null ? 'stage' : state.editorMode,
      }
    }

    case 'surface:select':
      return { ...state, selectedSurfaceId: action.surfaceId, selectedLayerId: null, editorMode: 'stage' }

    case 'surface:enter':
      if (!state.selectedSurfaceId) return state
      return { ...state, editorMode: 'surface' }

    case 'surface:exit':
      return { ...state, editorMode: 'stage', selectedLayerId: null }

    case 'surface:rename':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId
              ? { ...s, surfaces: s.surfaces.map(sf => sf.id === action.surfaceId ? { ...sf, name: action.name } : sf) }
              : s
          ),
        },
      }

    default:
      return state
  }
}

function applyLayerAction(state: ProjectState, action: LayerAction): ProjectState {
  const { project } = state
  switch (action.type) {
    case 'layer:add': {
      const slide = project.slides.find(s => s.id === action.slideId)
      const surface = slide?.surfaces.find(sf => sf.id === action.surfaceId)
      if (!surface) return state
      const layer: Layer = {
        id: crypto.randomUUID(),
        type: 'solid',
        name: `Layer ${surface.layers.length + 1}`,
        visible: true,
        color: '#3a6ea5',
        transform: { x: 0.5, y: 0.5, w: 0.8, h: 0.8, rotation: 0 },
      }
      return {
        ...patchSurfaceLayers(state, action.slideId, action.surfaceId, layers => [layer, ...layers]),
        selectedLayerId: layer.id,
      }
    }

    case 'layer:add-text': {
      const slide = project.slides.find(s => s.id === action.slideId)
      const surface = slide?.surfaces.find(sf => sf.id === action.surfaceId)
      if (!surface) return state
      const layer: TextLayer = {
        id: crypto.randomUUID(),
        type: 'text',
        name: 'Text',
        visible: true,
        content: 'Text',
        fontSize: 48,
        color: '#ffffff',
        transform: { x: 0.5, y: 0.5, w: 0.5, h: 0.2, rotation: 0 },
      }
      return {
        ...patchSurfaceLayers(state, action.slideId, action.surfaceId, layers => [layer, ...layers]),
        selectedLayerId: layer.id,
      }
    }

    case 'layer:add-image': {
      const slide = project.slides.find(s => s.id === action.slideId)
      const surface = slide?.surfaces.find(sf => sf.id === action.surfaceId)
      if (!surface) return state
      const layer: ImageLayer = {
        id: crypto.randomUUID(),
        type: 'image',
        name: action.name,
        visible: true,
        src: action.src,
        transform: { x: 0.5, y: 0.5, w: 1.0, h: 1.0, rotation: 0 },
      }
      return {
        ...patchSurfaceLayers(state, action.slideId, action.surfaceId, layers => [layer, ...layers]),
        selectedLayerId: layer.id,
      }
    }

    case 'layer:add-shader': {
      const slide = project.slides.find(s => s.id === action.slideId)
      const surface = slide?.surfaces.find(sf => sf.id === action.surfaceId)
      if (!surface) return state
      const layer: ShaderLayer = {
        id: crypto.randomUUID(),
        type: 'shader',
        name: `Shader ${surface.layers.length + 1}`,
        visible: true,
        preset: action.preset ?? 'pulse',
        uniforms: { uIntensity: 0 },
        transform: { x: 0.5, y: 0.5, w: 1.0, h: 1.0, rotation: 0 },
      }
      return {
        ...patchSurfaceLayers(state, action.slideId, action.surfaceId, layers => [layer, ...layers]),
        selectedLayerId: layer.id,
      }
    }

    case 'layer:remove': {
      const next = patchSurfaceLayers(state, action.slideId, action.surfaceId, layers =>
        layers.filter(l => l.id !== action.layerId)
      )
      return {
        ...next,
        selectedLayerId: state.selectedLayerId === action.layerId ? null : state.selectedLayerId,
      }
    }

    case 'layer:update':
      return patchSurfaceLayers(state, action.slideId, action.surfaceId, layers =>
        layers.map(l => l.id === action.layer.id ? action.layer : l)
      )

    case 'layer:reorder':
      return patchSurfaceLayers(state, action.slideId, action.surfaceId, layers => {
        const map = new Map(layers.map(l => [l.id, l]))
        return action.layerIds.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
      })

    case 'layer:select':
      return { ...state, selectedLayerId: action.layerId }

    case 'layer:toggle-visibility':
      return patchSurfaceLayers(state, action.slideId, action.surfaceId, layers =>
        layers.map(l => l.id === action.layerId ? { ...l, visible: !l.visible } : l)
      )

    default:
      return state
  }
}

function applyVolumeAction(state: ProjectState, action: VolumeAction): ProjectState {
  const { project } = state
  switch (action.type) {
    case 'volume:add': {
      const volume: Volume = {
        id: crypto.randomUUID(),
        name: 'Volume',
        camera: {
          position: { x: 0, y: 2, z: 5 },
          target: { x: 0, y: 0, z: 0 },
          fov: 50,
        },
        shapes: [],
      }
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s => s.id === action.slideId ? { ...s, volume } : s),
        },
      }
    }

    case 'volume:remove':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s => s.id === action.slideId ? { ...s, volume: undefined } : s),
        },
      }

    case 'volume:alignStart':
      return { ...state, editorMode: 'volume-align' }

    case 'volume:alignDone':
      return { ...state, editorMode: 'stage' }

    case 'volume:updateCamera':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId && s.volume
              ? { ...s, volume: { ...s.volume, camera: action.camera } }
              : s
          ),
        },
      }

    case 'volume:editorEnter':
      return { ...state, editorMode: 'volume-editor', selectedShapeId: null }

    case 'volume:editorExit':
      return { ...state, editorMode: 'stage', selectedShapeId: null }

    case 'volume:shapeAdd': {
      const slide = project.slides.find(s => s.id === action.slideId)
      if (!slide?.volume) return state
      const shape: import('./types').VolumeShape = {
        id: crypto.randomUUID(),
        name: `${action.shapeType.charAt(0).toUpperCase() + action.shapeType.slice(1)} ${slide.volume.shapes.length + 1}`,
        type: action.shapeType,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        layers: [],
        reactions: [],
      }
      return {
        ...state,
        selectedShapeId: shape.id,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId && s.volume
              ? { ...s, volume: { ...s.volume, shapes: [...s.volume.shapes, shape] } }
              : s
          ),
        },
      }
    }

    case 'volume:shapeRemove': {
      const newSelected = state.selectedShapeId === action.shapeId ? null : state.selectedShapeId
      return {
        ...state,
        selectedShapeId: newSelected,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId && s.volume
              ? { ...s, volume: { ...s.volume, shapes: s.volume.shapes.filter(sh => sh.id !== action.shapeId) } }
              : s
          ),
        },
      }
    }

    case 'volume:shapeUpdate':
      return {
        ...state,
        project: {
          ...project,
          slides: project.slides.map(s =>
            s.id === action.slideId && s.volume
              ? { ...s, volume: { ...s.volume, shapes: s.volume.shapes.map(sh => sh.id === action.shape.id ? action.shape : sh) } }
              : s
          ),
        },
      }

    case 'volume:shapeSelect':
      return { ...state, selectedShapeId: action.shapeId }
    case 'volume:editModeSet':
      return { ...state, volumeEditMode: action.mode }

    default:
      return state
  }
}

// ── Reducer ──────────────────────────────────────────────────────────────────

function projectMutationReducer(state: ProjectState, action: ProjectAction): ProjectState {
  if (action.type.startsWith('slide:'))   return applySlideAction(state,   action as SlideAction)
  if (action.type.startsWith('surface:')) return applySurfaceAction(state, action as SurfaceAction)
  if (action.type.startsWith('layer:'))   return applyLayerAction(state,   action as LayerAction)
  if (action.type.startsWith('volume:'))  return applyVolumeAction(state,  action as VolumeAction)
  return state
}

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  if (action.type === 'project:load') {
    return {
      ...initial,
      project: action.project,
      currentFilePath: action.filePath,
      selectedSlideId: action.project.slides[0]?.id ?? null,
    }
  }
  if (action.type === 'project:saved') {
    return { ...state, isDirty: false, currentFilePath: action.filePath }
  }
  if (action.type === 'project:new') {
    return { ...initial }
  }

  const next = projectMutationReducer(state, action)
  return next.project !== state.project ? { ...next, isDirty: true } : next
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ContextValue {
  state: ProjectState
  dispatch: Dispatch<ProjectAction>
}

const ProjectContext = createContext<ContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (state.selectedSlideId === null) return
    const slide = state.project.slides.find(s => s.id === state.selectedSlideId)
    if (!slide) return
    window.lights.sendSlide(slide)
  }, [state.selectedSlideId, state.project.slides])

  useEffect(() => {
    window.lights.notifyDirty(state.isDirty)
  }, [state.isDirty])

  useEffect(() => {
    const save = async () => {
      const result = await window.lights.saveProject(stateRef.current.project)
      if (result) dispatch({ type: 'project:saved', filePath: result.filePath })
    }

    const offSave        = window.lights.onMenuSave(save)
    const offSaveAs      = window.lights.onMenuSaveAs(async () => {
      const result = await window.lights.saveProjectAs(stateRef.current.project)
      if (result) dispatch({ type: 'project:saved', filePath: result.filePath })
    })
    const offSaveAndQuit = window.lights.onMenuSaveAndQuit(async () => {
      const result = await window.lights.saveProject(stateRef.current.project)
      if (result) {
        dispatch({ type: 'project:saved', filePath: result.filePath })
        window.lights.confirmQuit()
      }
    })
    const offOpened      = window.lights.onProjectOpened(({ project, filePath }) => {
      dispatch({ type: 'project:load', project: project as Project, filePath })
    })
    const offNew         = window.lights.onMenuNew(() => {
      if (stateRef.current.isDirty && !window.confirm('Discard unsaved changes?')) return
      dispatch({ type: 'project:new' })
    })

    return () => { offSave(); offSaveAs(); offSaveAndQuit(); offOpened(); offNew() }
  }, [])

  return <ProjectContext.Provider value={{ state, dispatch }}>{children}</ProjectContext.Provider>
}

export function useProject(): ContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
