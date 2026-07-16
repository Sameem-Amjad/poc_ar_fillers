import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { FaceEngine, buildFrameState, LIP_STYLES, type LipStyle } from '../../engine/lips/pipeline';
import { LipRenderer } from '../../engine/lips/glRenderer';
import type { NormalizedLandmark } from '../../engine/lips/topology';
import type { Point2 } from '../../engine/lips/warp';

export type StageStatus = 'initializing' | 'tracking' | 'no-face' | 'no-source' | 'error';

export interface StyleRender {
  id: string;
  name: string;
  doseMl: number;
  dataURL: string;
}

export interface CaptureResult {
  before: string;
  after: string;
  // Every style rendered from the same frozen frame at the current dose
  // (clamped per style) — feeds the consultation comparison grid.
  styles: StyleRender[];
}

interface StageParams {
  mode: 'camera' | 'photo';
  facingMode: 'user' | 'environment';
  style: LipStyle | null;
  doseMl: number;
  showOriginal: boolean;
  showLandmarks: boolean;
}

interface Props extends StageParams {
  image: HTMLImageElement | null; // photo mode source
  onStatus: (s: StageStatus) => void;
  captureRef: RefObject<(() => CaptureResult | null) | null>;
}

// Photos are downscaled to this long edge before processing — keeps the FBO
// and TPS costs bounded on large uploads without visible quality loss.
const MAX_PHOTO_EDGE = 1600;

// Clinical tracking overlay: warped outer lip contour as small teal points.
function drawOverlay(
  overlay: HTMLCanvasElement | null,
  renderer: LipRenderer | null,
  points: Point2[] | null
): void {
  if (!overlay) return;
  const ctx = overlay.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!points || !renderer) return;

  ctx.fillStyle = 'rgba(42, 140, 134, 0.9)';
  ctx.beginPath();
  for (const p of points) {
    const c = renderer.frameToCss(p);
    ctx.moveTo(c.x, c.y);
    ctx.arc(c.x, c.y, 1.8, 0, Math.PI * 2);
  }
  ctx.fill();
}

export function LipStage({
  mode,
  image,
  facingMode,
  style,
  doseMl,
  showOriginal,
  showLandmarks,
  onStatus,
  captureRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const rendererRef = useRef<LipRenderer | null>(null);
  const engineRef = useRef<FaceEngine | null>(null);
  const photoSourceRef = useRef<HTMLCanvasElement | null>(null);
  const photoLandmarksRef = useRef<NormalizedLandmark[] | null>(null);
  const renderPhotoRef = useRef<() => void>(() => {});
  const [glError, setGlError] = useState(false);

  // Live loop and capture read the latest params through this ref so the
  // rAF loop never has to restart on a control change.
  const paramsRef = useRef<StageParams>({ mode, facingMode, style, doseMl, showOriginal, showLandmarks });
  useEffect(() => {
    paramsRef.current = { mode, facingMode, style, doseMl, showOriginal, showLandmarks };
  });

  const statusRef = useRef<StageStatus>('initializing');
  const setStatus = useCallback((s: StageStatus) => {
    if (statusRef.current !== s) {
      statusRef.current = s;
      onStatus(s);
    }
  }, [onStatus]);

  // ── Renderer + canvas sizing ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: LipRenderer | null = null;
    try {
      renderer = new LipRenderer(canvas);
    } catch {
      queueMicrotask(() => {
        setGlError(true);
        setStatus('error');
      });
      return;
    }
    rendererRef.current = renderer;

    const resize = () => {
      const r = container.getBoundingClientRect();
      renderer!.resize(r.width, r.height, window.devicePixelRatio || 1);
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.width = r.width;
        overlay.height = r.height;
      }
      if (paramsRef.current.mode === 'photo') renderPhotoRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      ro.disconnect();
      renderer!.dispose();
      rendererRef.current = null;
    };
  }, [setStatus]);

  // ── Face engine (per mode) ──
  useEffect(() => {
    const engine = new FaceEngine();
    engineRef.current = engine;
    setStatus('initializing');
    engine.init(mode === 'camera' ? 'VIDEO' : 'IMAGE').then(() => {
      if (engineRef.current === engine && mode === 'photo' && !photoSourceRef.current) {
        setStatus('no-source');
      }
    }).catch(() => setStatus('error'));

    return () => {
      engine.close();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [mode, setStatus]);

  // ── Camera stream ──
  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
      } catch {
        if (!cancelled) setStatus('no-source');
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      video.srcObject = null;
    };
  }, [mode, facingMode, setStatus]);

  // ── Live render loop (camera) ──
  useEffect(() => {
    if (mode !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    let lastVideoTime = -1;

    // Clear any stale photo frame while the stream warms up.
    rendererRef.current?.clear();
    drawOverlay(overlayRef.current, rendererRef.current, null);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const renderer = rendererRef.current;
      const engine = engineRef.current;
      if (!renderer || !engine?.ready || video.readyState < 2) return;
      if (video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;

      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;
      renderer.setSourceSize(w, h);

      const p = paramsRef.current;
      const lm = engine.detectVideo(video, performance.now());
      setStatus(lm ? 'tracking' : 'no-face');

      const frame = buildFrameState(
        lm, w, h, p.style, p.doseMl, p.facingMode === 'user', 'cover', p.showOriginal
      );
      renderer.uploadFrame(video);
      renderer.render(frame.render);
      drawOverlay(overlayRef.current, renderer, p.showLandmarks && frame.warp ? frame.warp.outerRing : null);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, setStatus]);

  // ── Photo mode: ingest image, detect once ──
  useEffect(() => {
    if (mode !== 'photo') return;
    if (!image) {
      photoSourceRef.current = null;
      photoLandmarksRef.current = null;
      if (engineRef.current?.ready) setStatus('no-source');
      return;
    }
    let cancelled = false;
    const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(image.naturalWidth * scale);
    c.height = Math.round(image.naturalHeight * scale);
    c.getContext('2d')!.drawImage(image, 0, 0, c.width, c.height);
    photoSourceRef.current = c;
    photoLandmarksRef.current = null;

    const engine = engineRef.current;
    (async () => {
      if (!engine) return;
      await engine.whenReady();
      if (cancelled || engineRef.current !== engine || photoSourceRef.current !== c) return;
      photoLandmarksRef.current = engine.detectImage(c);
      setStatus(photoLandmarksRef.current ? 'tracking' : 'no-face');
      renderPhotoRef.current();
    })();

    return () => { cancelled = true; };
  }, [mode, image, setStatus]);

  // ── Photo render (on-demand, re-runs when any control changes) ──
  useEffect(() => {
    if (mode !== 'photo') return;
    const doRender = () => {
      const renderer = rendererRef.current;
      const src = photoSourceRef.current;
      if (!renderer || !src) {
        // No photo loaded — clear the stale last frame (e.g. from live camera)
        renderer?.clear();
        drawOverlay(overlayRef.current, renderer, null);
        return;
      }
      renderer.setSourceSize(src.width, src.height);
      const frame = buildFrameState(
        photoLandmarksRef.current, src.width, src.height,
        style, doseMl, false, 'contain', showOriginal
      );
      renderer.uploadFrame(src);
      renderer.render(frame.render);
      drawOverlay(overlayRef.current, renderer, showLandmarks && frame.warp ? frame.warp.outerRing : null);
    };
    renderPhotoRef.current = doRender;
    doRender();
  }, [mode, image, style, doseMl, showOriginal, showLandmarks]);

  // ── Capture: before/after through the identical pipeline (pixel-aligned) ──
  useEffect(() => {
    captureRef.current = () => {
      const renderer = rendererRef.current;
      if (!renderer) return null;
      const p = paramsRef.current;

      let source: TexImageSource | null;
      let w: number;
      let h: number;
      let lm: NormalizedLandmark[] | null;

      if (p.mode === 'camera') {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return null;
        source = video;
        w = video.videoWidth;
        h = video.videoHeight;
        lm = engineRef.current?.detectVideo(video, performance.now()) ?? null;
      } else {
        source = photoSourceRef.current;
        if (!source) return null;
        w = (source as HTMLCanvasElement).width;
        h = (source as HTMLCanvasElement).height;
        lm = photoLandmarksRef.current;
      }
      if (!w || !h) return null;

      const mirror = p.mode === 'camera' && p.facingMode === 'user';
      const fit = p.mode === 'camera' ? ('cover' as const) : ('contain' as const);

      renderer.setSourceSize(w, h);
      renderer.uploadFrame(source);

      const after = buildFrameState(lm, w, h, p.style, p.doseMl, mirror, fit, false);
      renderer.render(after.render);
      const afterURL = renderer.captureDataURL();

      const before = buildFrameState(lm, w, h, null, 0, mirror, fit, true);
      renderer.render(before.render);
      const beforeURL = renderer.captureDataURL();

      // All styles from the same frozen frame — for the comparison grid.
      const styles: StyleRender[] = [];
      if (lm) {
        for (const s of LIP_STYLES) {
          const dose = Math.min(p.doseMl, s.maxDoseMl);
          const fs = buildFrameState(lm, w, h, s, dose, mirror, fit, false);
          renderer.render(fs.render);
          styles.push({ id: s.id, name: s.name, doseMl: dose, dataURL: renderer.captureDataURL() });
        }
      }

      renderer.render(after.render); // restore live view
      return { before: beforeURL, after: afterURL, styles };
    };
  });

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#0f1116]">
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="w-full h-full" />
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      {glError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/70 text-sm text-center px-10">
            This device does not support WebGL2, which is required for the live preview.
          </p>
        </div>
      )}
    </div>
  );
}
