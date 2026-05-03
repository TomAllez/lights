import { Canvas, LayerToolbar, SlidePanel, StageOverlay, SurfaceCanvas, SurfacePanel } from './components';
import { useProject, useGraph } from './model';

export default function App() {
  const { status } = useGraph();
  const {
    state: { surfaceMode },
  } = useProject();

  // *Claude* : Should slide panel be visible in surface mode ?
  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {surfaceMode ? (
          <SurfaceCanvas />
        ) : (
          <div className="stage-canvas">
            <Canvas />
            <StageOverlay />
          </div>
        )}
        <span className="status">{status}</span>
      </div>
      <LayerToolbar />
      <SurfacePanel />
    </div>
  );
}
