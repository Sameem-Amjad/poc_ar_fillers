// One-Euro filter — adaptive low-pass for landmark streams.
// Removes tracker jitter at rest while staying responsive to fast motion.
// Casiez et al., CHI 2012. Standard choice for real-time AR landmark smoothing.

import type { NormalizedLandmark } from './topology';

class LowPass {
  private y = 0;
  private initialized = false;

  filter(x: number, alpha: number): number {
    if (!this.initialized) {
      this.y = x;
      this.initialized = true;
      return x;
    }
    this.y = alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  last(): number {
    return this.y;
  }

  reset(): void {
    this.initialized = false;
  }
}

class OneEuro {
  private xFilter = new LowPass();
  private dxFilter = new LowPass();
  private lastTime = -1;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  constructor(minCutoff: number, beta: number, dCutoff: number) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tSec: number): number {
    if (this.lastTime < 0) {
      this.lastTime = tSec;
      this.dxFilter.filter(0, 1);
      return this.xFilter.filter(x, 1);
    }
    const dt = Math.max(tSec - this.lastTime, 1e-4);
    this.lastTime = tSec;

    const dx = (x - this.xFilter.last()) / dt;
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(x, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = -1;
  }
}

// Filters a full landmark array. Lazily allocates one filter pair per landmark.
export class LandmarkSmoother {
  private filters: { x: OneEuro; y: OneEuro }[] = [];
  private missedFrames = 0;
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  // minCutoff (Hz): lower = smoother at rest. beta: higher = snappier on motion.
  constructor(minCutoff = 1.2, beta = 0.025, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  apply(landmarks: NormalizedLandmark[], tMs: number): NormalizedLandmark[] {
    const t = tMs / 1000;
    while (this.filters.length < landmarks.length) {
      this.filters.push({
        x: new OneEuro(this.minCutoff, this.beta, this.dCutoff),
        y: new OneEuro(this.minCutoff, this.beta, this.dCutoff),
      });
    }
    this.missedFrames = 0;
    return landmarks.map((lm, i) => ({
      ...lm,
      x: this.filters[i].x.filter(lm.x, t),
      y: this.filters[i].y.filter(lm.y, t),
    }));
  }

  // Call on frames with no detection; resets after a short gap so the filter
  // doesn't blend stale positions when the face reappears elsewhere.
  noteMissed(): void {
    if (++this.missedFrames > 5) this.reset();
  }

  reset(): void {
    for (const f of this.filters) {
      f.x.reset();
      f.y.reset();
    }
    this.missedFrames = 0;
  }
}
