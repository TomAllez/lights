import {
  Breadcrumb,
  Canvas,
  InspectorPanel,
  SlidePanel,
  StageOverlay,
  SurfaceCanvas,
  TopBar,
  VolumeAlignHUD,
  VolumeEditor,
} from './components';
import { useProject } from './model';

export default function App() {
  const {
    state: { editorMode },
  } = useProject();

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        <SlidePanel />
        <div className="stage-area">
          <Breadcrumb />
          <div className="stage-canvas-container">
            {editorMode === 'volume-editor' ? (
              <VolumeEditor />
            ) : editorMode === 'surface' ? (
              <SurfaceCanvas />
            ) : (
              <div className="stage-canvas">
                <Canvas />
                {editorMode === 'volume-align' ? <VolumeAlignHUD /> : <StageOverlay />}
              </div>
            )}
          </div>
        </div>
        <InspectorPanel />
      </div>
    </div>
  );
}
