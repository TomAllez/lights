import { useGraph, useProject } from '../../model'
import { GraphStatus } from '../../ipc/types'
import './TopBar.css'

const STATUS_DISPLAY_LABELS: Record<GraphStatus, string> = {
  [GraphStatus.Running]: 'Running',
  [GraphStatus.Stopped]: 'Stopped',
  [GraphStatus.Error]:   'Error',
}

function resolveStatusDotColor(status: GraphStatus): string {
  if (status === GraphStatus.Running) return 'var(--accent)'
  if (status === GraphStatus.Error)   return 'var(--danger)'
  return 'var(--text-muted)'
}

export default function TopBar() {
  const { status } = useGraph()
  const { state } = useProject()

  // Project type does not yet carry a name field; fall back to 'Untitled' until added.
  const projectName = (state.project as { name?: string }).name || 'Untitled'
  const isDirty = state.isDirty

  return (
    <div className="topbar">
      <div className="topbar__left">
        <span
          className="topbar__status-dot"
          style={{ color: resolveStatusDotColor(status) }}
          aria-hidden="true"
        >
          ●
        </span>
        <span className="topbar__app-name">Lights</span>
      </div>

      <div className="topbar__center">
        <span className="topbar__project-name">
          {projectName}
          {isDirty && <span className="topbar__dirty-marker">•</span>}
        </span>
      </div>

      <div className="topbar__right">
        <span className={`status-pill status-pill--${status}`}>
          {STATUS_DISPLAY_LABELS[status]}
        </span>
      </div>
    </div>
  )
}
