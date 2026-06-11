import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { solveTPS, applyTPS } from '../../engine/deform';
import { getTriangulation, renderWarpedFace, drawMeshOverlay, drawRegionOutline } from '../../engine/renderer';
import { buildControlPoints, type TreatmentPreset } from '../../engine/presets';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

interface Props {
  preset: TreatmentPreset | null;
  dose: string;
  intensity: number;
  showMesh: boolean;
  onCapture: (before: string, after: string) => void;
  captureRef: RefObject<(() => void) | null>;
}

export function ARImageProcessor({ preset, dose, intensity, showMesh, onCapture, captureRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const landmarksRef = useRef<{ x: number; y: number; z: number }[] | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [imageStatus, setImageStatus] = useState<'none' | 'detecting' | 'ready' | 'no-face'>('none');

  // Initialize MediaPipe in IMAGE mode (separate from live camera's VIDEO mode)
  useEffect(() => {
    let destroyed = false;
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
        if (destroyed) return;
        const lm = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        if (destroyed) { lm.close(); return; }
        landmarkerRef.current = lm;
        setModelStatus('ready');
      } catch (e) {
        console.error('MediaPipe IMAGE init failed:', e);
        setModelStatus('error');
      }
    }
    init();
    return () => {
      destroyed = true;
      landmarkerRef.current?.close();
    };
  }, []);

  const renderToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const landmarks = landmarksRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const w = canvas.width;
    const h = canvas.height;

    if (!landmarks || !preset) {
      ctx.drawImage(img, 0, 0, w, h);
      if (landmarks && showMesh) drawMeshOverlay(ctx, landmarks, [], w, h);
      return;
    }

    const controlPoints = buildControlPoints(landmarks, preset, dose, intensity);
    const tps = solveTPS(controlPoints, 1.0);
    const warped = tps ? applyTPS(landmarks, tps) : landmarks;
    const triangles = getTriangulation(landmarks);
    renderWarpedFace(ctx, img, landmarks, warped, triangles, w, h);
    drawRegionOutline(ctx, warped, preset.category, w, h);
    if (showMesh) drawMeshOverlay(ctx, warped, controlPoints, w, h);
  }, [preset, dose, intensity, showMesh]);

  // Re-render whenever preset/dose/intensity/showMesh changes
  useEffect(() => {
    if (imageStatus === 'ready') renderToCanvas();
  }, [preset, dose, intensity, showMesh, imageStatus, renderToCanvas]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !landmarkerRef.current) return;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImageStatus('detecting');

      const result = landmarkerRef.current!.detect(img);
      const detected = result.faceLandmarks[0];

      if (detected && detected.length > 0) {
        landmarksRef.current = detected;
        setImageStatus('ready');
      } else {
        landmarksRef.current = null;
        setImageStatus('no-face');
        // Still draw the image even without a face
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')?.drawImage(img, 0, 0);
        }
      }

      URL.revokeObjectURL(url);
    };
    img.src = url;
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const doCapture = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    const beforeCanvas = document.createElement('canvas');
    beforeCanvas.width = img.naturalWidth;
    beforeCanvas.height = img.naturalHeight;
    beforeCanvas.getContext('2d')?.drawImage(img, 0, 0);
    const before = beforeCanvas.toDataURL('image/jpeg', 0.85);
    const after = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(before, after);
  }, [onCapture]);

  useEffect(() => {
    if (captureRef) (captureRef as React.MutableRefObject<(() => void) | null>).current = doCapture;
  }, [captureRef, doCapture]);

  return (
    <div className="relative w-full h-full bg-zinc-900 flex items-center justify-center overflow-hidden">

      {/* Upload prompt — shown when no image loaded */}
      {imageStatus === 'none' && (
        <label className="flex flex-col items-center gap-5 cursor-pointer select-none">
          <div className="w-28 h-28 rounded-full bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center text-5xl">
            🖼️
          </div>
          <div className="text-center">
            <p className="text-white font-medium mb-1">Upload a photo</p>
            <p className="text-white/50 text-sm">Point at a face to try treatments</p>
          </div>
          <span className="px-8 py-3 rounded-2xl bg-white text-black text-sm font-semibold hover:bg-white/90 active:scale-95 transition-all">
            Choose Photo
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      )}

      {/* Canvas — shown once image is loaded */}
      {imageStatus !== 'none' && (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
        />
      )}

      {/* Model loading overlay */}
      {modelStatus === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/70 text-sm">Loading AI model…</p>
        </div>
      )}

      {/* Detecting spinner */}
      {imageStatus === 'detecting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white/70 text-sm">Detecting face…</p>
        </div>
      )}

      {/* No face warning */}
      {imageStatus === 'no-face' && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
          <span className="bg-red-500/80 text-white text-xs px-4 py-2 rounded-full">
            No face detected — try a clearer front-facing photo
          </span>
        </div>
      )}

      {/* Change photo button */}
      {imageStatus !== 'none' && modelStatus === 'ready' && (
        <label className="absolute top-4 left-4 cursor-pointer z-10">
          <span className="bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-full border border-white/20 hover:bg-black/80 transition-colors">
            Change photo
          </span>
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
      )}

      {modelStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-red-400 text-sm text-center px-8">
            Failed to load AR model.<br />Check your internet connection.
          </p>
        </div>
      )}
    </div>
  );
}
