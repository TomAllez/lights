import { createContext, useContext, useEffect, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { Layer, Project, Slide, Surface } from './types'

// ── State ────────────────────────────────────────────────────────────────────

export interface ProjectState {
  project: Project
  selectedSlideId: string | null
  selectedSurfaceId: string | null
  selectedLayerId: string | null
  surfaceMode: boolean  // true = flat local editor open
}

const initial: ProjectState = {
  project: { slides: [], calibration: {} },
  selectedSlideId: null,
  selectedSurfaceId: null,
  selectedLayerId: null,
  surfaceMode: false,
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type ProjectAction =
  | { type: 'slide:add' }
  | { type: 'slide:remove'; slideId: string }
  | { type: 'slide:select'; slideId: string | null }
  | { type: 'surface:add'; slideId: string }
  | { type: 'surface:update'; slideId: string; surface: Surface }
  | { type: 'surface:remove'; slideId: string; surfaceId: string }
  | { type: 'surface:select'; surfaceId: string | null }
  | { type: 'surface:enter' }   // double-click → open flat editor
  | { type: 'surface:exit' }    // back / Escape → return to stage, keep selection
  | { type: 'layer:add'; slideId: string; surfaceId: string }
  | { type: 'layer:remove'; slideId: string; surfaceId: string; layerId: string }
  | { type: 'layer:update'; slideId: string; surfaceId: string; layer: Layer }
  | { type: 'layer:reorder'; slideId: string; surfaceId: string; layerIds: string[] }
  | { type: 'layer:select'; layerId: string | null }
  | { type: 'layer:toggle-visibility'; slideId: string; surfaceId: string; layerId: string }

// ── Reducer ──────────────────────────────────────────────────────────────────

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

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
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
        surfaceMode: false,
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
        surfaceMode: false,
      }
    }

    case 'slide:select':
      return { ...state, selectedSlideId: action.slideId, selectedSurfaceId: null, selectedLayerId: null, surfaceMode: false }

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
        surfaceMode: selectedSurfaceId === null ? false : state.surfaceMode,
      }
    }

    case 'surface:select':
      return { ...state, selectedSurfaceId: action.surfaceId, selectedLayerId: null, surfaceMode: false }

    case 'surface:enter':
      if (!state.selectedSurfaceId) return state
      return { ...state, surfaceMode: true }

    case 'surface:exit':
      return { ...state, surfaceMode: false, selectedLayerId: null }

    case 'layer:add': {
      const slide = project.slides.find(s => s.id === action.slideId)
      const surface = slide?.surfaces.find(sf => sf.id === action.surfaceId)
      if (!surface) return state
      const layer: Layer = {
        id: crypto.randomUUID(),
        type: 'solid',
        name: `Layer ${surface.layers.length + 1}`,
        visible: true,
        color: '#111122',
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
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

interface ContextValue {
  state: ProjectState
  dispatch: Dispatch<ProjectAction>
}

const ProjectContext = createContext<ContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)

  useEffect(() => {
    if (state.selectedSlideId === null) return
    const slide = state.project.slides.find(s => s.id === state.selectedSlideId)
    if (!slide) return
    const aois: Record<string, { x: number; y: number }[]> = {}
    for (const surface of slide.surfaces) {
      if (surface.areaOfInterest) aois[surface.id] = surface.areaOfInterest
    }
    window.lights.sendCommand({ type: 'slide:activate', config: slide.graphConfig, aois })
    window.lights.sendSlide(slide)
  }, [state.selectedSlideId, state.project.slides])

  return <ProjectContext.Provider value={{ state, dispatch }}>{children}</ProjectContext.Provider>
}

export function useProject(): ContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
