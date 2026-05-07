import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useProject } from '../../contexts';
import { buildSurfaceMesh, disposeSurfaceMesh, preloadSurfaces, buildShapeMesh, disposeShapeMesh } from '@lights/three-scene';
import type { Hand, Landmark } from './landmarks';
import {
  decodeFacemesh,
  decodeHandpose,
  drawFaces,
  drawHands,
  frameRect,
} from './landmarks';

/**
 * Main stage canvas: renders the live camera frame as a WebGL texture, overlays
 * the active slide's surface homography meshes, and draws MediaPipe landmark
 * skeletons on a transparent 2D canvas sitting above the WebGL layer.
 */
export default function Canvas({ showVideo }: { showVideo: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const surfaceGroupRef = useRef<THREE.Group | null>(null);
  const volumeGroupRef = useRef<THREE.Group | null>(null);
  const volumeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const showVideoRef = useRef(showVideo);
  showVideoRef.current = showVideo;

  const { state } = useProject();
  const { project, selectedSlideId } = state;

  const surfaces = useMemo(
    () => project.slides.find((s) => s.id === selectedSlideId)?.surfaces ?? [],
    [project.slides, selectedSlideId],
  );

  const volume = useMemo(
    () => project.slides.find((s) => s.id === selectedSlideId)?.volume,
    [project.slides, selectedSlideId],
  );

  // ── WebGL setup (runs once) ───────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current!;

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // 2D overlay for landmarks — appended after WebGL canvas so it sits on top
    const overlay = document.createElement('canvas');
    overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    container.appendChild(overlay);
    const ctx = overlay.getContext('2d')!;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    let frameW = 1;
    let frameH = 1;
    let frameBuffer = new Uint8Array(4);
    let texture = new THREE.DataTexture(frameBuffer, 1, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const surfaceGroup = new THREE.Group();
    scene.add(surfaceGroup);
    surfaceGroupRef.current = surfaceGroup;

    const volumeScene = new THREE.Scene();
    const volumeCamera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    volumeCamera.position.set(0, 2, 5);
    volumeCamera.lookAt(0, 0, 0);
    volumeCameraRef.current = volumeCamera;

    const volumeGroup = new THREE.Group();
    volumeScene.add(volumeGroup);
    volumeGroupRef.current = volumeGroup;

    const render = () => {
      mesh.visible = showVideoRef.current;
      renderer.autoClear = true;
      renderer.render(scene, camera);
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(volumeScene, volumeCamera);
    };
    renderRef.current = render;

    // Last confirmed detections — redrawn on every frame so landmarks persist
    // across frames where the Python module was busy (exhaustMap dropped them).
    // Hands are keyed by moduleId ('handpose:left' / 'handpose:right') so both
    // hands are tracked independently with their own TTLs.
    const lastHandsMap = new Map<string, Hand>();
    const handExpiries = new Map<string, ReturnType<typeof setTimeout>>();
    let lastFaces: Landmark[][] = [];
    let facesExpiry: ReturnType<typeof setTimeout> | null = null;

    const LANDMARK_TTL = 300;

    function updateLayout() {
      const { clientWidth: w, clientHeight: h } = container;
      const fa = frameW / frameH;
      const wa = w / h;
      mesh.scale.set(wa > fa ? fa / wa : 1, wa > fa ? 1 : wa / fa, 1);
      renderer.setSize(w, h);
      overlay.width = w;
      overlay.height = h;
      volumeCamera.aspect = w / h;
      volumeCamera.updateProjectionMatrix();
      render();
    }

    function ensureTexture(w: number, h: number) {
      if (w === frameW && h === frameH) return;
      texture.dispose();
      frameW = w;
      frameH = h;
      frameBuffer = new Uint8Array(w * h * 4);
      texture = new THREE.DataTexture(frameBuffer, w, h);
      material.map = texture;
      material.needsUpdate = true;
      updateLayout();
    }

    updateLayout();

    function drawOverlay() {
      const { clientWidth: cw, clientHeight: ch } = container;
      ctx.clearRect(0, 0, cw, ch);
      const r = frameRect(cw, ch, frameW, frameH);
      if (lastHandsMap.size > 0) drawHands(ctx, [...lastHandsMap.values()], r);
      if (lastFaces.length > 0) drawFaces(ctx, lastFaces, r);
    }

    const off = window.lights.onEvent((event) => {
      if (event.type === 'detection') {
        if (event.moduleId.startsWith('handpose:') && event.data.byteLength >= 1 + 21 * 12) {
          lastHandsMap.set(event.moduleId, decodeHandpose(event.data));
          const prev = handExpiries.get(event.moduleId);
          if (prev) clearTimeout(prev);
          handExpiries.set(event.moduleId, setTimeout(() => {
            lastHandsMap.delete(event.moduleId);
            handExpiries.delete(event.moduleId);
            drawOverlay();
          }, LANDMARK_TTL));
        } else if (event.moduleId === 'facemesh' && event.data.byteLength >= 468 * 12) {
          lastFaces = [decodeFacemesh(event.data)];
          if (facesExpiry) clearTimeout(facesExpiry);
          facesExpiry = setTimeout(() => { lastFaces = []; drawOverlay(); }, LANDMARK_TTL);
        }
        drawOverlay();
        return;
      }

      if (event.type !== 'frame') return;
      ensureTexture(event.width, event.height);

      if (event.data.byteLength === frameW * frameH * 3) {
        const src = new Uint8Array(event.data);
        // FFmpeg outputs rows top-to-bottom; WebGL DataTexture expects
        // bottom-to-top. Flip rows during the RGB→RGBA copy.
        for (let row = 0; row < frameH; row++) {
          const srcRow = frameH - 1 - row;
          for (let col = 0; col < frameW; col++) {
            const dst = (row * frameW + col) * 4;
            const s   = (srcRow * frameW + col) * 3;
            frameBuffer[dst]     = src[s];
            frameBuffer[dst + 1] = src[s + 1];
            frameBuffer[dst + 2] = src[s + 2];
            frameBuffer[dst + 3] = 255;
          }
        }
        texture.needsUpdate = true;
      }

      render();
      drawOverlay();
    });

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);

    return () => {
      off();
      observer.disconnect();
      for (const t of handExpiries.values()) clearTimeout(t);
      if (facesExpiry) clearTimeout(facesExpiry);
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.removeChild(overlay);
    };
  }, []);

  // Re-render when showVideo toggles so the mesh visibility updates immediately.
  useEffect(() => { renderRef.current(); }, [showVideo]);

  // ── Volume scene (rebuilt whenever the active slide's volume changes) ──────
  useEffect(() => {
    const group = volumeGroupRef.current;
    const cam = volumeCameraRef.current;
    if (!group || !cam) return;

    group.traverse(child => { if (child instanceof THREE.Mesh) disposeShapeMesh(child as THREE.Mesh) });
    group.clear();

    if (volume) {
      const { position: p, target: t, fov } = volume.camera;
      cam.position.set(p.x, p.y, p.z);
      cam.lookAt(new THREE.Vector3(t.x, t.y, t.z));
      cam.fov = fov;
      cam.updateProjectionMatrix();
      for (const shape of volume.shapes) group.add(buildShapeMesh(shape));
    }

    renderRef.current();
  }, [volume]);

  // ── Surface meshes (rebuilt whenever the active slide's surfaces change) ──
  useEffect(() => {
    const group = surfaceGroupRef.current;
    if (!group) return;

    let cancelled = false;
    preloadSurfaces(surfaces).then(() => {
      if (cancelled) return;
      surfaces.forEach((surface, i) => group.add(buildSurfaceMesh(surface, i)));
      renderRef.current();
    });

    return () => {
      cancelled = true;
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      group.clear();
    };
  }, [surfaces]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
