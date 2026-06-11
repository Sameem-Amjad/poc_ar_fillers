import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useCamera } from './useCamera';
import { solveTPS, applyTPS } from '../../engine/deform';
import { getTriangulation, renderWarpedFace, drawMeshOverlay, drawRegionOutline } from '../../engine/renderer';
import { buildControlPoints, type TreatmentPreset } from '../../engine/presets';

interface ARCameraProps {
  preset: TreatmentPreset | null;
  dose: string;
  intensity: number;
  showMesh: boolean;
  facingMode: 'user' | 'environment';
  onCapture: (before: string, after: string) => void;
  captureRef: RefObject<(() => void) | null>;
}

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function ARCamera({
  preset,
  dose,
  intensity,
  showMesh,
  facingMode,
  onCapture,
  captureRef,
}: ARCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const animFrameRef = useRef<number>(0);
  const lastTsRef = useRef<number>(-1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'no-face' | 'error'>('loading');

  // Mirror video for selfie cam
  const isMirrored = facingMode === 'user';

  useCamera(videoRef, facingMode);

  // Initialize MediaPipe once
  useEffect(() => {
    let destroyed = false;
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
        if (destroyed) return;
        const lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        if (destroyed) { lm.close(); return; }
        landmarkerRef.current = lm;
        setStatus('ready');
      } catch (e) {
        console.error('MediaPipe init failed:', e);
        setStatus('error');
      }
    }
    init();
    return () => {
      destroyed = true;
      landmarkerRef.current?.close();
    };
  }, []);

  // Capture callback
  const doCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    // Before: raw video frame
    const beforeCanvas = document.createElement('canvas');
    beforeCanvas.width = canvas.width;
    beforeCanvas.height = canvas.height;
    const bCtx = beforeCanvas.getContext('2d')!;
    if (isMirrored) {
      bCtx.translate(canvas.width, 0);
      bCtx.scale(-1, 1);
    }
    bCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const before = beforeCanvas.toDataURL('image/jpeg', 0.85);

    // After: current warped canvas
    const after = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(before, after);
  }, [isMirrored, onCapture]);

  useEffect(() => {
    if (captureRef) (captureRef as React.MutableRefObject<(() => void) | null>).current = doCapture;
  }, [captureRef, doCapture]);

  // Main render loop
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function renderFrame(ts: number) {
      animFrameRef.current = requestAnimationFrame(renderFrame);

      if (!landmarkerRef.current || video!.readyState < 2) return;
      if (ts === lastTsRef.current) return;
      lastTsRef.current = ts;

      const w = canvas!.width;
      const h = canvas!.height;

      // Mirror transform for selfie mode
      ctx!.save();
      if (isMirrored) {
        ctx!.translate(w, 0);
        ctx!.scale(-1, 1);
      }

      const result = landmarkerRef.current!.detectForVideo(video!, ts);
      const landmarks = result.faceLandmarks[0];

      if (!landmarks || landmarks.length === 0) {
        ctx!.drawImage(video!, 0, 0, w, h);
        ctx!.restore();
        setStatus(s => s === 'ready' || s === 'no-face' ? 'no-face' : s);
        return;
      }

      setStatus('ready');

      if (!preset) {
        ctx!.drawImage(video!, 0, 0, w, h);
        if (showMesh) drawMeshOverlay(ctx!, landmarks, [], w, h);
        ctx!.restore();
        return;
      }

      // Build control points and solve TPS
      const controlPoints = buildControlPoints(landmarks, preset, dose, intensity);
      const tps = solveTPS(controlPoints, 1.0);
      const warped = tps ? applyTPS(landmarks, tps) : landmarks;

      // Get triangulation and render
      const triangles = getTriangulation(landmarks);
      renderWarpedFace(ctx!, video!, landmarks, warped, triangles, w, h);
      drawRegionOutline(ctx!, warped, preset.category, w, h);

      if (showMesh) drawMeshOverlay(ctx!, warped, controlPoints, w, h);

      ctx!.restore();
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [preset, dose, intensity, showMesh, isMirrored]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <canvas
        ref={canvasRef}
        className="w-full h-full object-cover"
        width={720}
        height={960}
        style={{ transform: isMirrored ? 'scaleX(-1)' : 'none' }}
      />

      {/* Status overlays */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/70 text-sm">Loading AI model…</p>
        </div>
      )}
      {status === 'no-face' && !preset && (
        <div className="absolute bottom-32 left-0 right-0 flex justify-center pointer-events-none">
          <span className="bg-black/60 text-white/60 text-xs px-4 py-2 rounded-full">
            Point camera at your face
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-red-400 text-sm text-center px-8">
            Failed to load AR model.<br />Check your internet connection.
          </p>
        </div>
      )}
    </div>
  );
}
