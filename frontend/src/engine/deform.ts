export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface ControlPoint {
  src: [number, number];
  dst: [number, number];
}

// TPS radial basis kernel: r² log(r²)
function tpsKernel(r2: number): number {
  if (r2 < 1e-12) return 0;
  return r2 * Math.log(r2 + 1e-10);
}

// Gaussian elimination with partial pivoting
function gaussianElim(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row][col]);
      if (v > maxVal) { maxVal = v; maxRow = row; }
    }
    if (maxRow !== col) [M[col], M[maxRow]] = [M[maxRow], M[col]];

    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = sum / (M[i][i] || 1e-12);
  }
  return x;
}

export interface TPSWeights {
  wx: number[];
  wy: number[];
  controlPoints: ControlPoint[];
}

// Solve TPS system: returns weights for later per-point evaluation
export function solveTPS(controlPoints: ControlPoint[], intensity: number): TPSWeights | null {
  const n = controlPoints.length;
  if (n === 0) return null;

  // System size is (n+3): n weights + 3 polynomial coefficients
  const size = n + 3;
  const K: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));

  for (let i = 0; i < n; i++) {
    const [xi, yi] = controlPoints[i].src;
    for (let j = 0; j < n; j++) {
      const dx = xi - controlPoints[j].src[0];
      const dy = yi - controlPoints[j].src[1];
      K[i][j] = tpsKernel(dx * dx + dy * dy);
    }
    // Regularization to avoid singular matrix
    K[i][i] += 1e-6;
    // Polynomial terms P
    K[i][n] = 1; K[i][n + 1] = xi; K[i][n + 2] = yi;
    // Pt rows
    K[n][i] = 1; K[n + 1][i] = xi; K[n + 2][i] = yi;
  }
  // Bottom-right 3×3 stays zero

  const bx = [
    ...controlPoints.map(cp => (cp.dst[0] - cp.src[0]) * intensity),
    0, 0, 0,
  ];
  const by = [
    ...controlPoints.map(cp => (cp.dst[1] - cp.src[1]) * intensity),
    0, 0, 0,
  ];

  const wx = gaussianElim(K.map(r => [...r]), bx);
  const wy = gaussianElim(K.map(r => [...r]), by);

  return { wx, wy, controlPoints };
}

// Evaluate TPS displacement at point (px, py)
export function evalTPS(px: number, py: number, tps: TPSWeights): [number, number] {
  const { wx, wy, controlPoints } = tps;
  const n = controlPoints.length;

  // Polynomial part (indices n, n+1, n+2)
  let dx = wx[n] + wx[n + 1] * px + wx[n + 2] * py;
  let dy = wy[n] + wy[n + 1] * px + wy[n + 2] * py;

  // RBF part
  for (let i = 0; i < n; i++) {
    const ddx = px - controlPoints[i].src[0];
    const ddy = py - controlPoints[i].src[1];
    const U = tpsKernel(ddx * ddx + ddy * ddy);
    dx += wx[i] * U;
    dy += wy[i] * U;
  }
  return [dx, dy];
}

export function applyTPS(
  landmarks: NormalizedLandmark[],
  tps: TPSWeights
): NormalizedLandmark[] {
  return landmarks.map(lm => {
    const [dx, dy] = evalTPS(lm.x, lm.y, tps);
    return { ...lm, x: lm.x + dx, y: lm.y + dy };
  });
}
