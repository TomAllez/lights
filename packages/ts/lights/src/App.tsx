import { useState } from 'react';
import { Canvas, LayerToolbar, SlidePanel, StageOverlay, SurfaceCanvas, SurfacePanel } from './components';
import { useProject, useGraph } from './model';

export default function App() {
  const { status } = useGraph();
  const { state: { surfaceMode } } = useProject();
  const [showVideo, setShowVideo] = useState(true);

  // *Claude* : Should slide panel be visible in surface mode ?
  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {surfaceMode ? (
          <SurfaceCanvas />
        ) : (
          <div className="stage-canvas">
            <Canvas showVideo={showVideo} />
            <StageOverlay />
          </div>
        )}
        <button
          className={`canvas-video-toggle${showVideo ? '' : ' off'}`}
          title={showVideo ? 'Hide video' : 'Show video'}
          onClick={() => setShowVideo(v => !v)}
        >
          {showVideo ? '⏹' : '▶'}
        </button>
        <span className="status">{status}</span>
      </div>
      <LayerToolbar />
      <SurfacePanel />
    </div>
  );
}
