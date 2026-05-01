import { createContext, useContext, useEffect, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type { Project, Slide, Surface } from './types'

// ── State ────────────────────────────────────────────────────────────────────

export interface ProjectState {
  project: Project
  selectedSlideId: string | null
  selectedSurfaceId: string | null
}

const initial: ProjectState = {
  project: { slides: [], calibration: {} },
  selectedSlideId: null,
  selectedSurfaceId: null,
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

// ── Reducer ──────────────────────────────────────────────────────────────────

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
      }
    }

    case 'slide:select':
      return { ...state, selectedSlideId: action.slideId, selectedSurfaceId: null }

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
      }
    }

    case 'surface:select':
      return { ...state, selectedSurfaceId: action.surfaceId }
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

  // Activate the selected slide on the backend whenever it changes
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
