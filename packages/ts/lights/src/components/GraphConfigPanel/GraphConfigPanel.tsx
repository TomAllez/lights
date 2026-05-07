import './GraphConfigPanel.css'
import { useProject } from '../../contexts'
import type { GraphConfig } from '../../ipc'

interface ModuleDef {
  id: string
  label: string
  available: boolean
}

const MODULES: ModuleDef[] = [
  { id: 'hand-pose', label: 'Hand Pose', available: true },
  { id: 'face-mesh', label: 'Face Mesh', available: true },
  { id: 'motion', label: 'Motion', available: false },
  { id: 'sound', label: 'Sound', available: false },
]

export default function GraphConfigPanel() {
  const { state, dispatch } = useProject()
  const { selectedSlideId, project } = state
  const slide = project.slides.find(s => s.id === selectedSlideId)

  if (!slide) return null

  const s = slide
  const config: GraphConfig = s.graphConfig

  function updateModule(moduleId: string, patch: { enabled?: boolean; threshold?: number }) {
    const existing = config.modules[moduleId] ?? { enabled: false }
    const updated: GraphConfig = {
      modules: {
        ...config.modules,
        [moduleId]: {
          ...existing,
          ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
          params: {
            ...existing.params,
            ...(patch.threshold !== undefined ? { threshold: patch.threshold } : {}),
          },
        },
      },
    }
    dispatch({ type: 'slide:updateGraphConfig', slideId: s.id, config: updated })
  }

  return (
    <div className="graph-config-panel">
      <div className="graph-config-header">Graph</div>
      <div className="graph-module-list">
        {MODULES.map(mod => {
          const modState = config.modules[mod.id]
          const enabled = modState?.enabled ?? false
          const threshold = (modState?.params?.threshold as number | undefined) ?? 0.5

          return (
            <div key={mod.id} className={`graph-module${!mod.available ? ' disabled' : ''}`}>
              <div className="graph-module-row">
                <span className="graph-module-label">
                  {mod.label}
                  {!mod.available && <span className="graph-module-badge">soon</span>}
                </span>
                <button
                  className={`graph-toggle${enabled ? ' on' : ''}`}
                  disabled={!mod.available}
                  onClick={() => updateModule(mod.id, { enabled: !enabled })}
                  title={enabled ? 'Disable' : 'Enable'}
                />
              </div>
              {enabled && mod.available && (
                <div className="graph-module-params">
                  <div className="graph-param-row">
                    <span className="graph-param-label">Threshold</span>
                    <input
                      type="range"
                      className="graph-param-slider"
                      min={0}
                      max={1}
                      step={0.01}
                      value={threshold}
                      onChange={e => updateModule(mod.id, { threshold: Number(e.target.value) })}
                    />
                    <span className="graph-param-value">{threshold.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
