import { useState } from 'react';
import { Canvas, LayerToolbar, SlidePanel, StageOverlay, SurfaceCanvas, SurfacePanel } from './components';
import { useProject, useGraph } from './model';
import PaverPanel from './components/PaverPanel';
import PaverEditor from './components/PaverEditor';
import type { Paver } from './model/types';

export default function App() {
  const { status } = useGraph();
  const { state } = useProject();
  const { surfaceMode, project, selectedSlideId, selectedVolumeId } = state;
  const [showVideo, setShowVideo] = useState(true);
  const [paverEditorOpen, setPaverEditorOpen] = useState(false);

  const slide = project.slides.find(s => s.id === selectedSlideId);
  const selectedPaver = slide?.volumes?.find(v => v.id === selectedVolumeId) as Paver | undefined;

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
        {paverEditorOpen && selectedPaver && selectedSlideId && (
          <PaverEditor
            paver={selectedPaver}
            slideId={selectedSlideId}
            onClose={() => setPaverEditorOpen(false)}
          />
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
      {selectedPaver && selectedSlideId ? (
        <PaverPanel
          paver={selectedPaver}
          slideId={selectedSlideId}
          onOpenEditor={() => setPaverEditorOpen(true)}
        />
      ) : (
        <SurfacePanel />
      )}
    </div>
  );
}
