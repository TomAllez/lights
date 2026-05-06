import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useProject } from '../model/ProjectContext';
import { buildSurfaceMesh, disposeSurfaceMesh, preloadSurfaces, buildShapeMesh, disposeShapeMesh, buildShaderLayerMeshes, disposeShaderLayerMesh } from '@lights/three-scene';
import { shaderBus } from '../model/shaderBus';
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
export default function Canvas({ showVideo }: { showVideo: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderRef = useRef<() => void>(() => {});
  const surfaceGroupRef = useRef<THREE.Group | null>(null);
  const shaderGroupRef  = useRef<THREE.Group | null>(null);
  const volumeGroupRef  = useRef<THREE.Group | null>(null);
  const volumeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const startAnimRef    = useRef<() => void>(() => {});
  const stopAnimRef     = useRef<() => void>(() => {});
  // layerId → timestamp of last reaction trigger, for uIntensity decay
  const triggerMapRef   = useRef(new Map<string, number>());

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

    const shaderGroup = new THREE.Group();
    scene.add(shaderGroup);
    shaderGroupRef.current = shaderGroup;

    // rAF loop — runs only while shader layers are present on the active slide
    const DECAY_MS = 600;
    let animId: number | null = null;
    const t0 = performance.now();
    function tick() {
      const now = performance.now();
      const t = (now - t0) / 1000;
      shaderGroup.traverse(obj => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mat = obj.material as THREE.ShaderMaterial;
        if (mat.uniforms?.uTime) mat.uniforms.uTime.value = t;
        const layerId = obj.userData.layerId as string | undefined;
        if (layerId && mat.uniforms?.uIntensity) {
          const firedAt = triggerMapRef.current.get(layerId);
          if (firedAt !== undefined) {
            const intensity = Math.max(0, 1 - (now - firedAt) / DECAY_MS);
            mat.uniforms.uIntensity.value = intensity;
            if (intensity === 0) triggerMapRef.current.delete(layerId);
          }
        }
      });
      render();
      animId = requestAnimationFrame(tick);
    }
    startAnimRef.current = () => { if (animId === null) animId = requestAnimationFrame(tick); };
    stopAnimRef.current  = () => { if (animId !== null) { cancelAnimationFrame(animId); animId = null; } };

    // Register with the shader bus so the reaction engine can drive uniforms
    shaderBus.setUniform = (layerId, name, value) => {
      if (name === 'uIntensity') {
        triggerMapRef.current.set(layerId, performance.now());
      } else {
        shaderGroup.traverse(obj => {
          if (!(obj instanceof THREE.Mesh) || obj.userData.layerId !== layerId) return;
          const mat = obj.material as THREE.ShaderMaterial;
          if (mat.uniforms[name]) mat.uniforms[name].value = value;
        });
      }
    };

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
    let lastHands: Hand[] = [];
    let lastFaces: Landmark[][] = [];
    let handsExpiry: ReturnType<typeof setTimeout> | null = null;
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
      if (lastHands.length > 0) drawHands(ctx, lastHands, r);
      if (lastFaces.length > 0) drawFaces(ctx, lastFaces, r);
    }

    const off = window.lights.onEvent((event) => {
      if (event.type === 'detection') {
        if (event.moduleId === 'handpose' && event.data.byteLength >= 1 + 21 * 12) {
          lastHands = [decodeHandpose(event.data)];
          if (handsExpiry) clearTimeout(handsExpiry);
          handsExpiry = setTimeout(() => { lastHands = []; drawOverlay(); }, LANDMARK_TTL);
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
      stopAnimRef.current();
      shaderBus.setUniform = () => {};
      off();
      observer.disconnect();
      if (handsExpiry) clearTimeout(handsExpiry);
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
    const group       = surfaceGroupRef.current;
    const shaderGroup = shaderGroupRef.current;
    if (!group || !shaderGroup) return;

    let cancelled = false;

    // Clear shader meshes immediately so stale ones don't linger during preload
    shaderGroup.traverse(obj => { if (obj instanceof THREE.Mesh) disposeShaderLayerMesh(obj); });
    shaderGroup.clear();

    preloadSurfaces(surfaces).then(() => {
      if (cancelled) return;
      surfaces.forEach((surface, i) => group.add(buildSurfaceMesh(surface, i)));
      for (const surface of surfaces) {
        for (const mesh of buildShaderLayerMeshes(surface)) shaderGroup.add(mesh);
      }
      const hasShaders = surfaces.some(s => s.layers.some(l => l.type === 'shader' && l.visible));
      if (hasShaders) startAnimRef.current();
      else { stopAnimRef.current(); renderRef.current(); }
    });

    return () => {
      cancelled = true;
      group.traverse((child) => { if (child instanceof THREE.Mesh) disposeSurfaceMesh(child); });
      group.clear();
      shaderGroup.traverse(obj => { if (obj instanceof THREE.Mesh) disposeShaderLayerMesh(obj); });
      shaderGroup.clear();
      stopAnimRef.current();
    };
  }, [surfaces]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} />;
}
