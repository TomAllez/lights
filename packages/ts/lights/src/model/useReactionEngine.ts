import { useEffect, useRef } from 'react'
import { useGraph } from './GraphContext'
import { useProject } from './ProjectContext'
import type { ProjectState } from './ProjectContext'
import { shaderBus } from './shaderBus'

// Subscribes to detection$ and executes matching reactions on the active slide.
// State is read via ref so the subscription never needs to be recreated.
export function useReactionEngine() {
  const { detection$ } = useGraph()
  const { state, dispatch } = useProject()

  const stateRef = useRef<ProjectState>(state)
  stateRef.current = state

  useEffect(() => {
    const sub = detection$.subscribe(event => {
      const { project, selectedSlideId } = stateRef.current
      const slide = project.slides.find(s => s.id === selectedSlideId)
      if (!slide) return

      for (const surface of slide.surfaces) {
        for (const reaction of surface.reactions) {
          if (reaction.trigger.kind !== 'detection') continue
          if (reaction.trigger.moduleId !== event.moduleId) continue

          const { action } = reaction
          if (action.kind === 'shader:setUniform') {
            shaderBus.setUniform(action.layerId, action.uniform, action.value)
          } else if (action.kind === 'layer:opacity') {
            // Drive visibility; opacity rendering can be refined in a later pass
            if (action.value > 0.5) {
              dispatch({
                type: 'layer:toggle-visibility',
                slideId: slide.id,
                surfaceId: surface.id,
                layerId: action.layerId,
              })
            }
          }
        }
      }
    })
    return () => sub.unsubscribe()
  }, [detection$, dispatch]) // detection$ and dispatch are both stable
}
