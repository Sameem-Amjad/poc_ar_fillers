// Batch-QA harness — dev-only page (qa.html), never part of the product build.
//
// Runs the REAL engine (same modules the app ships) over arbitrary images and
// returns mathematical artifact metrics per style × dose:
//   · foldCount   — warp-grid triangles whose orientation flips (mesh fold-over)
//   · spikeDeg    — max increase in turning angle along the warped outer lip
//                   contour vs the original (sawtooth detector)
//   · maxDispFrac — max control-point displacement / mouth width (cap check)
//   · suppression — mouth-open guard value (0 = effect fully suppressed)
// plus an ITA-based skin-tone estimate for fairness binning and mouth crops
// for the human review grid.

import { FaceEngine, buildFrameState, LIP_STYLES } from '../engine/lips/pipeline';
import { LipRenderer } from '../engine/lips/glRenderer';
import type { NormalizedLandmark } from '../engine/lips/topology';
import type { WarpGrid, Point2 } from '../engine/lips/warp';

const MAX_EDGE = 900;

let engine: FaceEngine;
let renderer: LipRenderer;
let glCanvas: HTMLCanvasElement;
const sampler = document.createElement('canvas');

function signedArea(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
}

function countFolds(grid: WarpGrid): number {
  let folds = 0;
  const { indices, src, dst } = grid;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 2, indices[i + 1] * 2, indices[i + 2] * 2];
    const s = signedArea(src[a], src[a + 1], src[b], src[b + 1], src[c], src[c + 1]);
    const d = signedArea(dst[a], dst[a + 1], dst[b], dst[b + 1], dst[c], dst[c + 1]);
    if (s * d < 0 || (Math.abs(s) > 1e-9 && Math.abs(d) / Math.abs(s) < 0.02)) folds++;
  }
  return folds;
}

function turningAngles(ring: Point2[]): number[] {
  const n = ring.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = ring[(i - 1 + n) % n], q = ring[i], r = ring[(i + 1) % n];
    const a1 = Math.atan2(q.y - p.y, q.x - p.x);
    const a2 = Math.atan2(r.y - q.y, r.x - q.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out.push(Math.abs(d));
  }
  return out;
}

function maxSpikeDeg(orig: Point2[], warped: Point2[]): number {
  const a = turningAngles(orig);
  const b = turningAngles(warped);
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, b[i] - a[i]);
  return (m * 180) / Math.PI;
}

// Individual Typology Angle from cheek/forehead patches → skin tone bin I–VI.
function estimateITA(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], w: number, h: number): { ita: number; bin: string } {
  const PATCH_LMS = [50, 280, 151]; // left cheek, right cheek, forehead
  const samples: number[][] = [];
  for (const idx of PATCH_LMS) {
    const cx = Math.round(lm[idx].x * w), cy = Math.round(lm[idx].y * h);
    const r = Math.max(3, Math.round(w * 0.015));
    const data = ctx.getImageData(
      Math.max(0, cx - r), Math.max(0, cy - r), r * 2, r * 2
    ).data;
    for (let i = 0; i < data.length; i += 16) samples.push([data[i], data[i + 1], data[i + 2]]);
  }
  const med = (k: number) => {
    const v = samples.map(s => s[k]).sort((x, y) => x - y);
    return v[v.length >> 1] / 255;
  };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const [r, g, b] = [lin(med(0)), lin(med(1)), lin(med(2))];
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const L = 116 * f(Y) - 16;
  const bLab = 200 * (f(Y / 1.0) - f(Z / 1.08883));
  const ita = (Math.atan2(L - 50, bLab) * 180) / Math.PI;
  const bin = ita > 55 ? 'I' : ita > 41 ? 'II' : ita > 28 ? 'III' : ita > 10 ? 'IV' : ita > -30 ? 'V' : 'VI';
  return { ita: Math.round(ita * 10) / 10, bin };
}

function mouthCrop(ring: Point2[], frameW: number, frameH: number): string {
  // Map frame px → canvas px for the contain fit used in render.
  const cw = glCanvas.width, ch = glCanvas.height;
  const scale = Math.min(cw / frameW, ch / frameH);
  const offX = (cw - frameW * scale) / 2, offY = (ch - frameH * scale) / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ring) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const mw = maxX - minX, mh = maxY - minY;
  minX -= mw * 0.35; maxX += mw * 0.35; minY -= mh * 0.8; maxY += mh * 0.8;
  const sx = offX + minX * scale, sy = offY + minY * scale;
  const sw = (maxX - minX) * scale, sh = (maxY - minY) * scale;
  const out = document.createElement('canvas');
  const W = 220;
  out.width = W;
  out.height = Math.round((W * sh) / sw);
  out.getContext('2d')!.drawImage(glCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.85);
}

interface ConfigResult {
  style: string;
  doseMl: number;
  foldCount: number;
  spikeDeg: number;
  maxDispFrac: number;
  suppression: number;
  crop: string | null;
}

async function qaProcess(dataUrl: string, wantCrops: boolean): Promise<Record<string, unknown>> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  sampler.width = w; sampler.height = h;
  const sctx = sampler.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, w, h);

  const lm = engine.detectImage(sampler);
  if (!lm) return { detected: false };

  const tone = estimateITA(sctx, lm, w, h);

  // Head-pitch proxy: eye-line→mouth distance over inter-ocular width.
  // Foreshortens as the head tilts down/up — used to calibrate a pose fade.
  const px = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const eL = px(33), eR = px(263), m13 = px(13), m14 = px(14);
  const eyeMid = { x: (eL.x + eR.x) / 2, y: (eL.y + eR.y) / 2 };
  const mouthMid = { x: (m13.x + m14.x) / 2, y: (m13.y + m14.y) / 2 };
  const poseRatio = Math.hypot(eyeMid.x - mouthMid.x, eyeMid.y - mouthMid.y) /
    (Math.hypot(eL.x - eR.x, eL.y - eR.y) || 1);

  renderer.resize(Math.min(w, 640), Math.min(h, 640), 1);
  renderer.setSourceSize(w, h);
  renderer.uploadFrame(sampler);

  // Baseline (before) render + crop
  const base = buildFrameState(lm, w, h, null, 0, false, 'contain', true);
  renderer.render(base.render);
  // Ring for cropping comes from any style's warp source; compute with a tiny strength
  const probe = buildFrameState(lm, w, h, LIP_STYLES[0], 0.3, false, 'contain');
  const ring = probe.warp?.outerRing ?? null;
  const beforeCrop = wantCrops && ring ? mouthCrop(ring, w, h) : null;

  const mouthWidthPx = ring
    ? Math.hypot(ring[10].x - ring[0].x, ring[10].y - ring[0].y)
    : 1;

  const results: ConfigResult[] = [];
  for (const style of LIP_STYLES) {
    for (const doseMl of [0.5, style.maxDoseMl]) {
      const fs = buildFrameState(lm, w, h, style, doseMl, false, 'contain');
      let foldCount = 0, spikeDeg = 0, maxDispFrac = 0;
      if (fs.warp) {
        foldCount = countFolds(fs.warp.grid);
        spikeDeg = Math.round(maxSpikeDeg(fs.warp.outerRingSrc, fs.warp.outerRing) * 10) / 10;
        maxDispFrac = Math.round((fs.warp.maxDisplacementPx / mouthWidthPx) * 1000) / 1000;
      }
      let crop: string | null = null;
      if (wantCrops && fs.warp) {
        renderer.render(fs.render);
        crop = mouthCrop(fs.warp.outerRing, w, h);
      }
      results.push({
        style: style.id, doseMl, foldCount, spikeDeg, maxDispFrac,
        suppression: Math.round(fs.suppression * 100) / 100, crop,
      });
    }
  }

  return {
    detected: true, ita: tone.ita, toneBin: tone.bin,
    mouthWidthPx: Math.round(mouthWidthPx),
    poseRatio: Math.round(poseRatio * 100) / 100,
    beforeCrop, results,
  };
}

// ── Measurement mode: anthropometric lip metrics for dataset curation ──
// All lengths normalized by inter-ocular distance (scale-invariant), so
// values are comparable across photos of the same patient at different
// distances. vermilionArea is the visible lip area (outer minus mouth
// opening) — the primary fullness signal (filler adds ~10-30%).
import { OUTER_LIP_RING, INNER_LIP_RING } from '../engine/lips/topology';

function polyArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

async function qaMeasure(dataUrl: string): Promise<Record<string, unknown>> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  sampler.width = w; sampler.height = h;
  const sctx = sampler.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, w, h);

  const lm = engine.detectImage(sampler);
  if (!lm) return { detected: false };

  const px = (i: number) => ({ x: lm[i].x * w, y: lm[i].y * h });
  const interOc = Math.hypot(px(33).x - px(263).x, px(33).y - px(263).y) || 1;

  const outer = OUTER_LIP_RING.map(px);
  const inner = INNER_LIP_RING.map(px);
  const vermilionArea = (polyArea(outer) - polyArea(inner)) / (interOc * interOc);
  const mouthWidth = Math.hypot(px(61).x - px(291).x, px(61).y - px(291).y) / interOc;
  const upperH = Math.hypot(px(0).x - px(13).x, px(0).y - px(13).y) / interOc;
  const lowerH = Math.hypot(px(17).x - px(14).x, px(17).y - px(14).y) / interOc;
  const mouthGap = Math.hypot(px(13).x - px(14).x, px(13).y - px(14).y) / interOc;

  // mouth crop for the local review page
  renderer.resize(Math.min(w, 640), Math.min(h, 640), 1);
  renderer.setSourceSize(w, h);
  renderer.uploadFrame(sampler);
  const base = buildFrameState(lm, w, h, null, 0, false, 'contain', true);
  renderer.render(base.render);
  const ring = outer.map(p => ({ x: p.x, y: p.y }));
  const crop = mouthCrop(ring, w, h);

  return {
    detected: true,
    vermilionArea: +vermilionArea.toFixed(4),
    mouthWidth: +mouthWidth.toFixed(3),
    upperH: +upperH.toFixed(3),
    lowerH: +lowerH.toFixed(3),
    mouthGap: +mouthGap.toFixed(3),
    interOcPx: Math.round(interOc),
    crop,
  };
}

// ── Training mode: mouth-frame-normalized lip landmark vectors ──
// Returns every lip landmark expressed in the face's own mouth frame
// (origin = mouth center, axes = face-relative right/up, unit = inter-ocular
// distance). Two photos of the same patient become directly comparable
// regardless of camera distance, position, or head roll — the basis for
// learning displacement fields from real before/after pairs.
import { computeMouthFrame, ALL_LIP_INDICES } from '../engine/lips/topology';

async function qaLipVectors(dataUrl: string): Promise<Record<string, unknown>> {
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = dataUrl; });
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  sampler.width = w; sampler.height = h;
  sampler.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0, w, h);

  const lm = engine.detectImage(sampler);
  if (!lm) return { detected: false };

  const lmPx = lm.map(p => ({ ...p, x: p.x * w, y: p.y * h }));
  const frame = computeMouthFrame(lmPx, 1);
  const interOc = frame.faceScale || 1;

  const vectors: Record<number, [number, number]> = {};
  for (const idx of ALL_LIP_INDICES) {
    const dx = lmPx[idx].x - frame.center.x;
    const dy = lmPx[idx].y - frame.center.y;
    // project onto the face frame axes
    const u = (dx * frame.right.x + dy * frame.right.y) / interOc;
    const v = (dx * frame.up.x + dy * frame.up.y) / interOc;
    vectors[idx] = [+u.toFixed(5), +v.toFixed(5)];
  }

  const gap = Math.hypot(lmPx[13].x - lmPx[14].x, lmPx[13].y - lmPx[14].y) / interOc;
  return {
    detected: true,
    vectors,
    mouthWidth: +(frame.mouthWidth / interOc).toFixed(4),
    mouthGap: +gap.toFixed(4),
    interOcPx: Math.round(interOc),
  };
}

declare global {
  interface Window {
    qaReady: boolean;
    qaProcess: typeof qaProcess;
    qaMeasure: typeof qaMeasure;
    qaLipVectors: typeof qaLipVectors;
  }
}

(async () => {
  const status = document.getElementById('status')!;
  glCanvas = document.getElementById('gl') as HTMLCanvasElement;
  renderer = new LipRenderer(glCanvas);
  engine = new FaceEngine();
  await engine.init('IMAGE');
  window.qaProcess = qaProcess;
  window.qaMeasure = qaMeasure;
  window.qaLipVectors = qaLipVectors;
  window.qaReady = true;
  status.textContent = 'QA harness ready';
})();
