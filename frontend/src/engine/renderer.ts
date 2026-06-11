import type { NormalizedLandmark } from './deform';
import type { ControlPoint } from './deform';
import Delaunator from 'delaunator';

// Cache triangulation so we don't recompute every frame
let triCache: { triangles: [number, number, number][]; frame: number } | null = null;

export function getTriangulation(landmarks: NormalizedLandmark[]): [number, number, number][] {
  const interval = 30; // recompute every 30 frames
  if (triCache && triCache.frame % interval !== 0) {
    triCache.frame++;
    return triCache.triangles;
  }

  const coords = new Float64Array(landmarks.flatMap(lm => [lm.x, lm.y]));
  const del = new Delaunator(coords);
  const triangles: [number, number, number][] = [];
  for (let i = 0; i < del.triangles.length; i += 3) {
    triangles.push([del.triangles[i], del.triangles[i + 1], del.triangles[i + 2]]);
  }

  triCache = { triangles, frame: 1 };
  return triangles;
}

// Compute affine coefficients for canvas setTransform(a,b,c,d,e,f)
// Maps (sx,sy) -> (dx,dy) via: dx=a*sx+c*sy+e, dy=b*sx+d*sy+f
function getAffineCoeffs(
  src: [number, number][],
  dst: [number, number][]
): [number, number, number, number, number, number] | null {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dst;

  const det =
    s0[0] * (s1[1] - s2[1]) -
    s0[1] * (s1[0] - s2[0]) +
    (s1[0] * s2[1] - s2[0] * s1[1]);

  if (Math.abs(det) < 0.5) return null;
  const id = 1 / det;

  const a = ((d0[0] * (s1[1] - s2[1]) + d1[0] * (s2[1] - s0[1]) + d2[0] * (s0[1] - s1[1])) * id);
  const c = ((d0[0] * (s2[0] - s1[0]) + d1[0] * (s0[0] - s2[0]) + d2[0] * (s1[0] - s0[0])) * id);
  const e = ((d0[0] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[0] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[0] * (s0[0] * s1[1] - s1[0] * s0[1])) * id);
  const b = ((d0[1] * (s1[1] - s2[1]) + d1[1] * (s2[1] - s0[1]) + d2[1] * (s0[1] - s1[1])) * id);
  const d = ((d0[1] * (s2[0] - s1[0]) + d1[1] * (s0[0] - s2[0]) + d2[1] * (s1[0] - s0[0])) * id);
  const f = ((d0[1] * (s1[0] * s2[1] - s2[0] * s1[1]) + d1[1] * (s2[0] * s0[1] - s0[0] * s2[1]) + d2[1] * (s0[0] * s1[1] - s1[0] * s0[1])) * id);

  return [a, b, c, d, e, f];
}

function drawWarpedTriangle(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  src: [number, number][],
  dst: [number, number][]
) {
  const coeffs = getAffineCoeffs(src, dst);
  if (!coeffs) return;
  const [a, b, c, d, e, f] = coeffs;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dst[0][0], dst[0][1]);
  ctx.lineTo(dst[1][0], dst[1][1]);
  ctx.lineTo(dst[2][0], dst[2][1]);
  ctx.closePath();
  ctx.clip();

  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(source, 0, 0);
  ctx.restore();
}

// Get set of landmark indices that actually moved
function getMovedIndices(
  orig: NormalizedLandmark[],
  warped: NormalizedLandmark[],
  threshold = 0.001
): Set<number> {
  const moved = new Set<number>();
  for (let i = 0; i < orig.length; i++) {
    const dx = orig[i].x - warped[i].x;
    const dy = orig[i].y - warped[i].y;
    if (dx * dx + dy * dy > threshold * threshold) moved.add(i);
  }
  return moved;
}

export function renderWarpedFace(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  originalLandmarks: NormalizedLandmark[],
  warpedLandmarks: NormalizedLandmark[],
  triangles: [number, number, number][],
  width: number,
  height: number
) {
  // 1. Draw raw video as background
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(video, 0, 0, width, height);

  // 2. Find affected triangles (any vertex moved)
  const moved = getMovedIndices(originalLandmarks, warpedLandmarks);
  const affected = triangles.filter(([i, j, k]) => moved.has(i) || moved.has(j) || moved.has(k));

  if (affected.length === 0) return;

  // 3. Warp each affected triangle
  for (const [i, j, k] of affected) {
    const src: [number, number][] = [
      [originalLandmarks[i].x * width, originalLandmarks[i].y * height],
      [originalLandmarks[j].x * width, originalLandmarks[j].y * height],
      [originalLandmarks[k].x * width, originalLandmarks[k].y * height],
    ];
    const dst: [number, number][] = [
      [warpedLandmarks[i].x * width, warpedLandmarks[i].y * height],
      [warpedLandmarks[j].x * width, warpedLandmarks[j].y * height],
      [warpedLandmarks[k].x * width, warpedLandmarks[k].y * height],
    ];
    drawWarpedTriangle(ctx, video, src, dst);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Ordered landmark contours per treatment category
// Each sub-array is one closed polygon drawn on the face
const REGION_CONTOURS: Record<string, number[][]> = {
  lips: [
    // Outer lip boundary: upper edge L→R, lower edge R→L
    [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146],
  ],
  cheeks: [
    // Left cheek — roughly clockwise from under-eye
    [111, 117, 118, 119, 50, 123, 101, 36, 206, 187, 116],
    // Right cheek — mirrored
    [340, 346, 347, 348, 280, 352, 330, 266, 426, 411, 345],
  ],
  nasolabial: [
    // Left fold region
    [36, 206, 187, 216, 212, 57, 40, 39],
    // Right fold region
    [266, 426, 411, 436, 432, 287, 270, 269],
  ],
  chin: [
    [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  ],
  jaw: [
    [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397],
  ],
};

export function drawRegionOutline(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  category: string,
  width: number,
  height: number
) {
  const contours = REGION_CONTOURS[category];
  if (!contours) return;

  ctx.save();

  for (const contour of contours) {
    // Build the path
    ctx.beginPath();
    let started = false;
    for (const idx of contour) {
      if (idx >= landmarks.length) continue;
      const x = landmarks[idx].x * width;
      const y = landmarks[idx].y * height;
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // White halo so the line is visible on any skin tone
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Black dashed line on top
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.82)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

export function drawMeshOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  controlPoints: ControlPoint[],
  width: number,
  height: number
) {
  const srcSet = new Set(controlPoints.map(cp => {
    const idx = landmarks.findIndex(lm => Math.abs(lm.x - cp.src[0]) < 0.001 && Math.abs(lm.y - cp.src[1]) < 0.001);
    return idx;
  }));

  ctx.strokeStyle = 'rgba(0,255,200,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * width;
    const y = landmarks[i].y * height;
    ctx.moveTo(x, y);
    ctx.arc(x, y, srcSet.has(i) ? 3 : 1, 0, Math.PI * 2);
  }
  ctx.stroke();
}
