import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useProject } from '../model/ProjectContext';
import { buildSurfaceMesh, disposeSurfaceMesh } from '../shaders/homography';
import type { Hand, Landmark } from './canvas/landmarks';
import {
  decodeFacemesh,
  decodeHandpose,
  drawFaces,
  drawHands,
  frameRect,
} from './canvas/landmarks';

/**
 * Main stage canvas: renders the live camera frame as a WebGL texture, overlays
 * the active slide's surface homography meshes, and draws MediaPipe landmark
 * skeletons on a transparent 2D canvas sitting above the WebGL layer.
 */
export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const surfaceGroupRef = useRef<THREE.Group | null>(null);

  const { state } = useProject();
  const { project, selectedSlideId } = state;

  const surfaces = useMemo(
    () => project.slides.find((s) => s.id === selectedSlideId)?.surfaces ?? [],
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

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;

    let pendingHands: Hand[] = [];
    let pendingFaces: Landmark[][] = [];

    function updateLayout() {
      const { clientWidth: w, clientHeight: h } = container;
      const fa = frameW / frameH;
      const wa = w / h;
      mesh.scale.set(wa > fa ? fa / wa : 1, wa > fa ? 1 : wa / fa, 1);
      renderer.setSize(w, h);
      overlay.width = w;
      overlay.height = h;
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

    const off = window.lights.onEvent((event) => {
      if (event.type === 'detection') {
        if (
          event.moduleId === 'HandPoseEstimation' &&
          event.data.byteLength >= 1 + 21 * 12
        ) {
          pendingHands.push(decodeHandpose(event.data));
        } else if (
          event.moduleId === 'FaceMesh' &&
          event.data.byteLength >= 468 * 12
        ) {
          pendingFaces.push(decodeFacemesh(event.data));
        }
        return;
      }

      if (event.type !== 'frame') return;
      ensureTexture(event.width, event.height);

      if (event.data.byteLength === frameW * frameH * 3) {
        const src = new Uint8Array(event.data);
        for (let i = 0; i < frameW * frameH; i++) {
          frameBuffer[i * 4] = src[i * 3];
          frameBuffer[i * 4 + 1] = src[i * 3 + 1];
          frameBuffer[i * 4 + 2] = src[i * 3 + 2];
          frameBuffer[i * 4 + 3] = 255;
        }
        texture.needsUpdate = true;
      }

      render();

      const { clientWidth: cw, clientHeight: ch } = container;
      ctx.clearRect(0, 0, cw, ch);
      const r = frameRect(cw, ch, frameW, frameH);
      if (pendingHands.length > 0) {
        drawHands(ctx, pendingHands, r);
        pendingHands = [];
      }
      if (pendingFaces.length > 0) {
        drawFaces(ctx, pendingFaces, r);
        pendingFaces = [];
      }
    });

    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);

    return () => {
      off();
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
      container.removeChild(overlay);
    };
  }, []);

  // ── Surface meshes (rebuilt whenever the active slide's surfaces change) ──
  useEffect(() => {
    const group = surfaceGroupRef.current;
    if (!group) return;

    surfaces.forEach((surface, i) => group.add(buildSurfaceMesh(surface, i)));
    renderRef.current();

    return () => {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) disposeSurfaceMesh(child);
      });
      group.clear();
    };
  }, [surfaces]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
}
