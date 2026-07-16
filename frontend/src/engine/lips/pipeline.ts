// Face tracking + per-frame render-state assembly.
//
// FaceEngine wraps the MediaPipe Face Landmarker (served from OUR origin —
// no CDN dependency, works offline, no third-party runtime requests) and
// applies One-Euro smoothing in video mode.

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LandmarkSmoother } from './smoothing';
import { type NormalizedLandmark, computeMouthFrame } from './topology';
import { LIP_STYLES, type LipStyle, doseResponse, mouthOpenSuppression } from './styles';
import { computeLipWarp, countGridFolds, maxContourKinkDeg, toPixelSpace, type LipWarpResult } from './warp';
import type { RenderState } from './glRenderer';

const WASM_PATH = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const MODEL_PATH = `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`;

export class FaceEngine {
  private landmarker: FaceLandmarker | null = null;
  private smoother = new LandmarkSmoother();
  private closed = false;
  private initPromise: Promise<void> | null = null;

  init(mode: 'VIDEO' | 'IMAGE'): Promise<void> {
    this.initPromise ??= (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
      const lm = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
        runningMode: mode,
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
      if (this.closed) {
        lm.close();
        return;
      }
      this.landmarker = lm;
    })();
    return this.initPromise;
  }

  whenReady(): Promise<void> {
    return this.initPromise ?? Promise.resolve();
  }

  get ready(): boolean {
    return this.landmarker !== null;
  }

  detectVideo(video: HTMLVideoElement, tsMs: number): NormalizedLandmark[] | null {
    if (!this.landmarker) return null;
    const result = this.landmarker.detectForVideo(video, tsMs);
    const lm = result.faceLandmarks[0];
    if (!lm || lm.length === 0) {
      this.smoother.noteMissed();
      return null;
    }
    return this.smoother.apply(lm, tsMs);
  }

  detectImage(img: HTMLImageElement | HTMLCanvasElement): NormalizedLandmark[] | null {
    if (!this.landmarker) return null;
    const result = this.landmarker.detect(img);
    const lm = result.faceLandmarks[0];
    return lm && lm.length > 0 ? [...lm] : null;
  }

  close(): void {
    this.closed = true;
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export interface FrameState {
  render: RenderState;
  warp: LipWarpResult | null;
  suppression: number; // 0 = effect fully suppressed (mouth open)
}

const NO_PHOTO = { gloss: 0, vibrance: 0, border: 0 };

// Assemble everything the renderer needs for one frame.
// `showOriginal` = hold-to-compare: geometry and photometrics both off.
export function buildFrameState(
  lm: NormalizedLandmark[] | null,
  frameW: number,
  frameH: number,
  style: LipStyle | null,
  doseMl: number,
  mirror: boolean,
  fit: 'cover' | 'contain',
  showOriginal = false
): FrameState {
  const base: RenderState = {
    grid: null,
    outerRing: null,
    innerRing: null,
    photo: NO_PHOTO,
    mirror,
    fit,
  };

  if (!lm || !style || showOriginal || doseMl <= 0) {
    return { render: base, warp: null, suppression: 1 };
  }

  const lmPx = toPixelSpace(lm, frameW, frameH);
  const frame = computeMouthFrame(lmPx, 1);
  const suppression = mouthOpenSuppression(lmPx, frame, 1);
  const strength = (doseResponse(doseMl) / doseResponse(1.0)) * suppression;

  let warp = computeLipWarp(lmPx, style, strength, frameW, frameH);
  if (!warp) return { render: base, warp: null, suppression };

  // Geometry guards (batch QA on 420 diverse faces set the thresholds):
  // a folded mesh renders as torn pixels, a contour kink as a sawtooth —
  // both only occur when landmarks degrade (extreme poses, tiny faces).
  // Back off smoothly in proportion to the kink; never render bad geometry.
  const KINK_LIMIT_DEG = 22; // healthy faces stay under ~15° at max dose
  const folds = countGridFolds(warp.grid);
  const kink = maxContourKinkDeg(warp.outerRingSrc, warp.outerRing);
  if (folds > 0 || kink > KINK_LIMIT_DEG) {
    const backoff = folds > 0 ? 0.55 : Math.max(0.25, KINK_LIMIT_DEG / kink);
    warp = computeLipWarp(lmPx, style, strength * backoff, frameW, frameH);
    if (
      !warp ||
      countGridFolds(warp.grid) > 0 ||
      maxContourKinkDeg(warp.outerRingSrc, warp.outerRing) > KINK_LIMIT_DEG * 1.3
    ) {
      return { render: base, warp: null, suppression: 0 };
    }
  }

  // Photometrics track the same dose response so light and geometry agree.
  const p = Math.min(strength, 1.2);
  return {
    render: {
      grid: warp.grid,
      outerRing: warp.outerRing,
      innerRing: warp.innerRing,
      photo: {
        gloss: style.gloss * p,
        vibrance: style.vibrance * p,
        border: style.borderDefinition * p,
      },
      mirror,
      fit,
    },
    warp,
    suppression,
  };
}

export { LIP_STYLES };
export type { LipStyle };
