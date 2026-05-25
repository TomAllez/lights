import { useProject } from '../../contexts'
import StageModePanel from './StageModePanel'
import SurfaceModePanel from './SurfaceModePanel'
import VolumeEditorPanel from './VolumeEditorPanel'

export default function InspectorPanel() {
  const { state } = useProject()
  if (state.editorMode === 'surface') return <SurfaceModePanel />
  if (state.editorMode === 'volume-editor') return <VolumeEditorPanel />
  return <StageModePanel />
}
