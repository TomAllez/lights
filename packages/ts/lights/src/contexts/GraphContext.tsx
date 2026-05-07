import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Subject } from 'rxjs'
import { GraphStatus, decodeTypedDetection } from '../ipc'
import type { GraphEvent, TypedDetectionEvent } from '../ipc'
import { useProject } from './ProjectContext'

// ── Types ─────────────────────────────────────────────────────────────────────

type DetectionEvent = Extract<GraphEvent, { type: 'detection' }>

interface GraphContextValue {
  status: GraphStatus
  stopGraph: () => void
  detection$: Subject<DetectionEvent>
  /** Decoded, strongly-typed detection stream. Prefer this over `detection$` for new consumers. */
  typedDetection$: Subject<TypedDetectionEvent>
}

// ── Context ───────────────────────────────────────────────────────────────────

const GraphContext = createContext<GraphContextValue | null>(null)

export function GraphProvider({ children }: { children: ReactNode }) {
  const { state } = useProject()
  const { selectedSlideId, project } = state

  const [status, setStatus] = useState<GraphStatus>(GraphStatus.Stopped)

  // Stable Subject — created once, never replaced. Consumers subscribe via
  // useEffect and unsubscribe on cleanup; no React state copy of detections.
  const detection$ = useRef(new Subject<DetectionEvent>()).current
  const typedDetection$ = useRef(new Subject<TypedDetectionEvent>()).current

  function stopGraph() {
    window.lights.sendCommand({ type: 'graph:stop' })
  }

  // Subscribe to all IPC graph events. Status updates go into React state
  // (low frequency). Detections are pushed directly into the Subject (high
  // frequency — bypasses React render cycle entirely).
  useEffect(() => {
    return window.lights.onEvent(event => {
      if (event.type === 'graph:status') {
        setStatus(event.status)
      } else if (event.type === 'detection') {
        detection$.next(event as DetectionEvent)
        const typed = decodeTypedDetection(event.moduleId, event.position, event.data)
        if (typed) typedDetection$.next(typed)
      }
    })
  }, [detection$])

  // Serialise graphConfig of the active slide. The graph restarts only when
  // the slide changes or a module is toggled/retuned — not on geometry edits.
  const graphConfigKey = useMemo(() => {
    if (!selectedSlideId) return null
    const slide = project.slides.find(s => s.id === selectedSlideId)
    return slide ? JSON.stringify(slide.graphConfig) : null
  }, [selectedSlideId, project.slides])

  useEffect(() => {
    if (selectedSlideId === null || graphConfigKey === null) {
      window.lights.sendCommand({ type: 'graph:stop' })
      return
    }
    const slide = project.slides.find(s => s.id === selectedSlideId)
    if (!slide) return
    const aois: Record<string, { x: number; y: number }[]> = {}
    for (const surface of slide.surfaces) {
      if (surface.areaOfInterest) aois[surface.id] = surface.areaOfInterest
    }
    window.lights.sendCommand({ type: 'slide:activate', config: slide.graphConfig, aois })
  }, [selectedSlideId, graphConfigKey])

  return (
    <GraphContext.Provider value={{ status, stopGraph, detection$, typedDetection$ }}>
      {children}
    </GraphContext.Provider>
  )
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) throw new Error('useGraph must be used within GraphProvider')
  return ctx
}
