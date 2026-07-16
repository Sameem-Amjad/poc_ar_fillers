// Warp-field assembly: parametric lip displacements + fixed anchor ring →
// thin-plate-spline solve → dense warp grid for the GPU renderer.
//
// Everything here works in VIDEO PIXEL SPACE (isotropic, square pixels), so
// TPS kernel distances are physically meaningful and aspect ratio never
// distorts directions.

import { solveTPS, evalTPS, type ControlPoint, type TPSWeights } from '../deform';
import {
  type NormalizedLandmark,
  ANCHOR_RING,
  OUTER_LIP_RING,
  INNER_LIP_RING,
} from './topology';
import { buildLipDisplacements, type LipStyle } from './styles';

export interface Point2 {
  x: number;
  y: number;
}

export interface WarpGrid {
  cols: number;
  rows: number;
  // Interleaved x,y — source positions (video px) and warped positions
  src: Float32Array;
  dst: Float32Array;
  indices: Uint16Array;
}

// Count warp-grid triangles whose orientation flips (or nearly collapses) —
// a folded mesh renders as torn/streaked pixels and must never reach screen.
export function countGridFolds(grid: WarpGrid): number {
  const { indices, src, dst } = grid;
  const area = (p: Float32Array, a: number, b: number, c: number) =>
    (p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1]);
  let folds = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i] * 2, indices[i + 1] * 2, indices[i + 2] * 2];
    const s = area(src, a, b, c);
    const d = area(dst, a, b, c);
    if (s * d < 0 || (Math.abs(s) > 1e-9 && Math.abs(d) / Math.abs(s) < 0.02)) folds++;
  }
  return folds;
}

// Max increase in turning angle (degrees) along the warped outer lip contour
// vs the original — a direct "will this contour kink?" measure.
export function maxContourKinkDeg(orig: Point2[], warped: Point2[]): number {
  const turn = (ring: Point2[], i: number) => {
    const n = ring.length;
    const p = ring[(i - 1 + n) % n], q = ring[i], r = ring[(i + 1) % n];
    let d = Math.atan2(r.y - q.y, r.x - q.x) - Math.atan2(q.y - p.y, q.x - p.x);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };
  let m = 0;
  for (let i = 0; i < orig.length; i++) m = Math.max(m, turn(warped, i) - turn(orig, i));
  return (m * 180) / Math.PI;
}

export interface LipWarpResult {
  grid: WarpGrid;
  outerRing: Point2[];       // warped outer lip contour (video px) — for mask
  innerRing: Point2[];       // warped inner lip contour
  outerRingSrc: Point2[];    // unwarped, for debug overlay
  controlPoints: ControlPoint[];
  maxDisplacementPx: number;
}

// Convert normalized landmarks to pixel space once per frame.
export function toPixelSpace(lm: NormalizedLandmark[], w: number, h: number): NormalizedLandmark[] {
  return lm.map(p => ({ ...p, x: p.x * w, y: p.y * h }));
}

// Cell size must stay well below the sharpest feature in the TPS field
// (the cupid's bow) or the linear interpolation between grid vertices
// aliases into a sawtooth along the vermillion border.
const GRID_COLS = 80;
const GRID_ROWS = 64;

let cachedIndices: Uint16Array | null = null;
function gridIndices(): Uint16Array {
  if (cachedIndices) return cachedIndices;
  const idx: number[] = [];
  for (let r = 0; r < GRID_ROWS - 1; r++) {
    for (let c = 0; c < GRID_COLS - 1; c++) {
      const i = r * GRID_COLS + c;
      idx.push(i, i + 1, i + GRID_COLS, i + 1, i + GRID_COLS + 1, i + GRID_COLS);
    }
  }
  cachedIndices = new Uint16Array(idx);
  return cachedIndices;
}

// Build the full warp for one frame.
// `lmPx` must already be in pixel space. `strength` combines dose response,
// intensity and mouth-open suppression (0 disables everything).
export function computeLipWarp(
  lmPx: NormalizedLandmark[],
  style: LipStyle,
  strength: number,
  videoW: number,
  videoH: number
): LipWarpResult | null {
  if (lmPx.length < 468 || strength <= 0) return null;

  const { displacements } = buildLipDisplacements(lmPx, style, strength, 1);

  // Assemble control points, deduped by landmark id (corners are shared
  // between rings — duplicate rows would make the TPS system singular).
  const seen = new Set<number>();
  const controlPoints: ControlPoint[] = [];
  let maxDisplacementPx = 0;

  for (const d of displacements) {
    if (seen.has(d.landmark)) continue;
    seen.add(d.landmark);
    const p = lmPx[d.landmark];
    controlPoints.push({
      src: [p.x, p.y],
      dst: [p.x + d.dx, p.y + d.dy],
    });
    maxDisplacementPx = Math.max(maxDisplacementPx, Math.hypot(d.dx, d.dy));
  }

  // Anchors: zero displacement — pin the surrounding face so the warp is
  // strictly local and blends to nothing at the mouth's neighborhood.
  for (const idx of ANCHOR_RING) {
    if (seen.has(idx)) continue;
    seen.add(idx);
    const p = lmPx[idx];
    controlPoints.push({ src: [p.x, p.y], dst: [p.x, p.y] });
  }

  const tps = solveTPS(controlPoints, 1.0);
  if (!tps) return null;

  const grid = buildGrid(controlPoints, tps, videoW, videoH);

  const warpRing = (ring: readonly number[], disps: Map<number, Point2>): Point2[] =>
    ring.map(i => {
      const p = lmPx[i];
      const d = disps.get(i) ?? { x: 0, y: 0 };
      return { x: p.x + d.x, y: p.y + d.y };
    });

  const dispMap = new Map<number, Point2>(
    displacements.map(d => [d.landmark, { x: d.dx, y: d.dy }])
  );

  return {
    grid,
    outerRing: warpRing(OUTER_LIP_RING, dispMap),
    innerRing: warpRing(INNER_LIP_RING, dispMap),
    outerRingSrc: OUTER_LIP_RING.map(i => ({ x: lmPx[i].x, y: lmPx[i].y })),
    controlPoints,
    maxDisplacementPx,
  };
}

function buildGrid(
  controlPoints: ControlPoint[],
  tps: TPSWeights,
  videoW: number,
  videoH: number
): WarpGrid {
  // Grid covers the control-point bbox plus margin; displacement is forced to
  // zero at the grid boundary so the mesh seams perfectly with the backdrop.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cp of controlPoints) {
    minX = Math.min(minX, cp.src[0]); maxX = Math.max(maxX, cp.src[0]);
    minY = Math.min(minY, cp.src[1]); maxY = Math.max(maxY, cp.src[1]);
  }
  const marginX = (maxX - minX) * 0.18;
  const marginY = (maxY - minY) * 0.18;
  minX = Math.max(0, minX - marginX);
  maxX = Math.min(videoW, maxX + marginX);
  minY = Math.max(0, minY - marginY);
  maxY = Math.min(videoH, maxY + marginY);

  const n = GRID_COLS * GRID_ROWS;
  const src = new Float32Array(n * 2);
  const dst = new Float32Array(n * 2);

  for (let r = 0; r < GRID_ROWS; r++) {
    const fy = r / (GRID_ROWS - 1);
    const y = minY + fy * (maxY - minY);
    for (let c = 0; c < GRID_COLS; c++) {
      const fx = c / (GRID_COLS - 1);
      const x = minX + fx * (maxX - minX);
      const i = (r * GRID_COLS + c) * 2;

      const [dx, dy] = evalTPS(x, y, tps);

      // Radial falloff → exactly zero displacement on the outermost cells.
      const ex = Math.min(fx, 1 - fx) / 0.12;
      const ey = Math.min(fy, 1 - fy) / 0.12;
      const edge = Math.min(ex, ey, 1);
      const fall = edge * edge * (3 - 2 * edge);

      src[i] = x;
      src[i + 1] = y;
      dst[i] = x + dx * fall;
      dst[i + 1] = y + dy * fall;
    }
  }

  return { cols: GRID_COLS, rows: GRID_ROWS, src, dst, indices: gridIndices() };
}
