import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Subject } from 'rxjs'
import { GraphStatus } from '../ipc/types'
import type { GraphEvent } from '../ipc/types'
import { useProject } from './ProjectContext'
import { useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type DetectionEvent = Extract<GraphEvent, { type: 'detection' }>

interface GraphContextValue {
  status: GraphStatus
  stopGraph: () => void
  detection$: Subject<DetectionEvent>
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
      }
    })
  }, [detection$])

  // Send slide:activate when the selected slide changes, graph:stop when none.
  useEffect(() => {
    if (selectedSlideId === null) {
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
  }, [selectedSlideId, project.slides])

  return (
    <GraphContext.Provider value={{ status, stopGraph, detection$ }}>
      {children}
    </GraphContext.Provider>
  )
}

export function useGraph(): GraphContextValue {
  const ctx = useContext(GraphContext)
  if (!ctx) throw new Error('useGraph must be used within GraphProvider')
  return ctx
}
