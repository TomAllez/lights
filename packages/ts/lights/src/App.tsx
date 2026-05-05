import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import {
  Canvas,
  LayerToolbar,
  SlidePanel,
  StageOverlay,
  SurfaceCanvas,
  SurfacePanel,
  VolumeAlignHUD,
  VolumeEditor,
} from './components';
import { useGraph, useProject } from './model';

export default function App() {
  const { status } = useGraph();
  const {
    state: { surfaceMode, volumeAlignMode, volumeEditorMode },
  } = useProject();
  const [showVideo, setShowVideo] = useState(true);

  // *Claude* : Should slide panel be visible in surface mode ?
  return (
    <div className="app">
      <SlidePanel />
      <div className="stage-area">
        {volumeEditorMode ? (
          <VolumeEditor />
        ) : surfaceMode ? (
          <SurfaceCanvas />
        ) : (
          <div className="stage-canvas">
            <Canvas showVideo={showVideo} />
            {volumeAlignMode ? <VolumeAlignHUD /> : <StageOverlay />}
          </div>
        )}
        {!surfaceMode && !volumeEditorMode && (
          <button
            className={`canvas-video-toggle${showVideo ? '' : ' off'}`}
            title={showVideo ? 'Hide video' : 'Show video'}
            onClick={() => setShowVideo((v) => !v)}
          >
            {showVideo ? (
              <Square size={12} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
          </button>
        )}
        <span className="status">{status}</span>
      </div>
      <LayerToolbar />
      <SurfacePanel />
    </div>
  );
}
