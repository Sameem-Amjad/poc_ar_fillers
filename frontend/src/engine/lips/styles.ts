// Parametric lip-filler styles.
//
// Instead of hardcoded per-landmark pixel offsets, each style is defined by
// anatomical parameters (volume distribution, cupid's bow definition, corner
// behavior, eversion). Displacements are generated per frame from the live
// lip geometry: directions come from the face-relative mouth frame (correct
// under head tilt) and magnitudes scale with mouth width (consistent at any
// camera distance or resolution).

import {
  type NormalizedLandmark,
  type MouthFrame,
  computeMouthFrame,
  UPPER_OUTER,
  LOWER_OUTER,
  UPPER_INNER,
  LOWER_INNER,
  LIP_CORNER_L,
  LIP_CORNER_R,
  CUPID_PEAK_L,
  CUPID_PEAK_R,
  CUPID_DIP,
  lipParam,
} from './topology';

// Volume distribution along the lip, param t: 0 at corners → 1 at center.
export type VolumeProfile = 'arc' | 'plateau' | 'central';

export interface LipStyle {
  id: string;
  name: string;
  tagline: string;
  // Geometry — fractions of mouth width at dose 1.0 ml
  upperVolume: number;
  lowerVolume: number;
  upperProfile: VolumeProfile;
  lowerProfile: VolumeProfile;
  cupidBow: number;      // extra lift at peaks 37/267; the dip at 0 is held back
  cornerLift: number;    // upward bias at commissures (positive = subtle smile)
  widthChange: number;   // lateral shift of corners: negative narrows (projects)
  eversion: number;      // fraction of outer displacement passed to inner ring
  maxDoseMl: number;
  // Photometrics at dose 1.0 ml (renderer scales with dose response)
  gloss: number;         // amplification of existing highlights (wet/hydrated)
  vibrance: number;      // saturation lift of the patient's own lip color
  borderDefinition: number; // subtle vermillion-border contact shadow
  // Learned displacement field (statistical outcome model trained on the
  // clinic's real before/after pairs). When present it REPLACES the
  // parametric geometry above: per-landmark [right, up] displacement in
  // mouth-width units at 1.0 ml-equivalent dose.
  field?: Record<string, [number, number]>;
}

// Statistical outcome model v0 — aggregate displacement field trained on the
// clinic's own verified before/after pairs (dataset_tools/lips_train.mjs).
// Anonymized aggregate numbers only; no patient data.
import clinicData from './clinicField.json';

export const LIP_STYLES: LipStyle[] = [
  {
    id: 'natural',
    name: 'Natural',
    tagline: 'Balanced enhancement, true to shape',
    upperVolume: 0.026,
    lowerVolume: 0.032,
    upperProfile: 'arc',
    lowerProfile: 'arc',
    cupidBow: 0.004,
    cornerLift: 0.004,
    widthChange: 0,
    eversion: 0.38,
    maxDoseMl: 1.0,
    gloss: 0.30,
    vibrance: 0.08,
    borderDefinition: 0.30,
  },
  {
    id: 'russian',
    name: 'Russian',
    tagline: 'Lifted upper lip, defined cupid’s bow',
    upperVolume: 0.036,
    lowerVolume: 0.020,
    upperProfile: 'plateau',
    lowerProfile: 'central',
    cupidBow: 0.006,
    cornerLift: 0.002,
    widthChange: -0.003, // slight narrowing reads as forward projection
    eversion: 0.45,
    maxDoseMl: 1.5,
    gloss: 0.25,
    vibrance: 0.10,
    borderDefinition: 0.40,
  },
  {
    id: 'french',
    name: 'French',
    tagline: 'Full lower lip, soft upper accent',
    upperVolume: 0.012,
    lowerVolume: 0.046,
    upperProfile: 'arc',
    lowerProfile: 'central',
    cupidBow: 0.003,
    cornerLift: 0.006,
    widthChange: 0,
    eversion: 0.40,
    maxDoseMl: 1.0,
    gloss: 0.42,
    vibrance: 0.08,
    borderDefinition: 0.25,
  },
];

// ── Dose response ───────────────────────────────────────────────────────────
// Clinical volume-to-visible-change is sub-linear: the first 0.5 ml shows the
// most, later increments add less. Exponent 0.75 keeps 0.3→1.5 ml feeling
// natural rather than linear/uncanny.
export function doseResponse(ml: number): number {
  return Math.pow(Math.max(ml, 0), 0.75);
}

// ── Expression guard ────────────────────────────────────────────────────────
// When the mouth opens (speaking, smiling wide) the geometric assumptions
// weaken; fade the effect out smoothly rather than letting it break.
export function mouthOpenSuppression(lm: NormalizedLandmark[], frame: MouthFrame, aspect: number): number {
  const top = lm[13];   // inner upper center
  const bot = lm[14];   // inner lower center
  const gap = Math.hypot((top.x - bot.x) * aspect, top.y - bot.y);
  const ratio = gap / (frame.mouthWidth || 1e-6);
  // fully on below 18% opening, fully off above 42%
  const t = Math.min(Math.max((ratio - 0.18) / (0.42 - 0.18), 0), 1);
  return 1 - t * t * (3 - 2 * t); // smoothstep, inverted
}

function profileValue(t: number, profile: VolumeProfile): number {
  switch (profile) {
    case 'arc':      return Math.sin((t * Math.PI) / 2);            // smooth rise to center
    case 'plateau': { const s = Math.min(t / 0.45, 1); return s * s * (3 - 2 * s); } // fast rise, flat top
    case 'central':  return t * t;                                   // concentrated at center
  }
}

export interface LipDisplacement {
  landmark: number;
  dx: number; // aspect-corrected normalized space
  dy: number;
}

// Hard cap on any single displacement — the anti-duck-lip guard.
const MAX_DISPLACEMENT_FRAC = 0.085; // of mouth width

// Generate displacements for every lip landmark.
// `strength` = doseResponse(ml)/doseResponse(1.0) × suppression, computed by caller.
export function buildLipDisplacements(
  lm: NormalizedLandmark[],
  style: LipStyle,
  strength: number,
  aspect: number
): { displacements: LipDisplacement[]; frame: MouthFrame } {
  const frame = computeMouthFrame(lm, aspect);
  const W = frame.mouthWidth;
  const { up, right } = frame;
  const out: LipDisplacement[] = [];
  const cap = MAX_DISPLACEMENT_FRAC * W;

  // With lips closed the two inner rings are nearly coincident at the seam.
  // Displacing them apart would fold the warp mesh (coincident control
  // points with opposing targets), so the seam stays PINNED when closed —
  // filler inflates the lip outward from the seam, which is also the
  // anatomically correct read. Inner rings only follow once the mouth opens.
  const gap = Math.hypot((lm[13].x - lm[14].x), lm[13].y - lm[14].y);
  const gapRatio = gap / (W || 1e-6);
  const tOpen = Math.min(Math.max((gapRatio - 0.03) / (0.14 - 0.03), 0), 1);
  const innerFollow = tOpen * tOpen * (3 - 2 * tOpen);

  const dispMap = new Map<number, { x: number; y: number }>();
  const push = (landmark: number, ux: number, uy: number) => {
    const mag = Math.hypot(ux, uy);
    const s = mag > cap ? cap / mag : 1;
    if (!dispMap.has(landmark)) dispMap.set(landmark, { x: ux * s, y: uy * s });
  };

  // Corner treatment is shared by all four rings (corners appear in each).
  const cornerDisp = (sideRight: boolean) => {
    const lat = style.widthChange * W * strength * (sideRight ? 1 : -1);
    const lift = style.cornerLift * W * strength;
    return {
      x: right.x * lat + up.x * lift,
      y: right.y * lat + up.y * lift,
    };
  };
  const cornerL = cornerDisp(false);
  const cornerR = cornerDisp(true);

  const emitRing = (
    ring: readonly number[],
    volume: number,
    profile: VolumeProfile,
    dir: 1 | -1,          // +1 = toward nose (upper), −1 = toward chin (lower)
    everted: boolean       // inner rings get a fraction of the outer motion
  ) => {
    const scale = everted ? style.eversion * innerFollow : 1;
    for (const idx of ring) {
      if (idx === LIP_CORNER_L) { push(idx, cornerL.x, cornerL.y); continue; }
      if (idx === LIP_CORNER_R) { push(idx, cornerR.x, cornerR.y); continue; }

      const t = lipParam(idx, ring);
      let mag = volume * profileValue(t, profile) * W * strength * scale;

      // Cupid's bow: raise the peaks, hold the philtrum dip back slightly so
      // the M-shape sharpens instead of ballooning flat. Kept gentle — the
      // mesh has no landmarks between peak and dip, so a large differential
      // renders as a spike rather than definition.
      if (dir === 1 && !everted) {
        if (idx === CUPID_PEAK_L || idx === CUPID_PEAK_R) {
          mag += style.cupidBow * W * strength;
        } else if (idx === CUPID_DIP) {
          mag *= 0.88;
        }
      }

      push(idx, up.x * mag * dir, up.y * mag * dir);
    }
  };

  if (style.field) {
    // Learned field: reconstruct each landmark's displacement from its
    // [right, up] components in the live face frame. Inner-ring entries get
    // the same seam-pinning treatment as parametric styles.
    const innerSet = new Set<number>([...UPPER_INNER, ...LOWER_INNER]);
    for (const [key, [fx, fy]] of Object.entries(style.field)) {
      const idx = Number(key);
      const s = (innerSet.has(idx) ? innerFollow : 1) * W * strength;
      push(idx, (right.x * fx + up.x * fy) * s, (right.y * fx + up.y * fy) * s);
    }
  } else {
    emitRing(UPPER_OUTER, style.upperVolume, style.upperProfile, 1, false);
    emitRing(LOWER_OUTER, style.lowerVolume, style.lowerProfile, -1, false);
    emitRing(UPPER_INNER, style.upperVolume, style.upperProfile, 1, true);
    emitRing(LOWER_INNER, style.lowerVolume, style.lowerProfile, -1, true);
  }

  // Ring smoothing (1-2-1 on interior points, endpoints fixed): adjacent
  // control points must never disagree sharply, or the contour kinks at the
  // commissures — batch QA on 420 faces surfaced corner spikes exactly where
  // corner narrowing met the plateau-boosted neighbor displacement.
  for (const ring of [UPPER_OUTER, LOWER_OUTER, UPPER_INNER, LOWER_INNER]) {
    const snapshot = ring.map(idx => dispMap.get(idx) ?? { x: 0, y: 0 });
    for (let i = 1; i < ring.length - 1; i++) {
      dispMap.set(ring[i], {
        x: 0.25 * snapshot[i - 1].x + 0.5 * snapshot[i].x + 0.25 * snapshot[i + 1].x,
        y: 0.25 * snapshot[i - 1].y + 0.5 * snapshot[i].y + 0.25 * snapshot[i + 1].y,
      });
    }
  }

  for (const [landmark, d] of dispMap) out.push({ landmark, dx: d.x, dy: d.y });
  return { displacements: out, frame };
}

// Register the learned style when a trained field is available.
if (clinicData?.field && Object.keys(clinicData.field).length > 0) {
  LIP_STYLES.push({
    id: 'clinic',
    name: 'Clinic',
    tagline: `Learned from ${clinicData.meta?.trainedOn ?? 'this clinic’s'} real treatment outcomes`,
    upperVolume: 0,
    lowerVolume: 0,
    upperProfile: 'arc',
    lowerProfile: 'arc',
    cupidBow: 0,
    cornerLift: 0,
    widthChange: 0,
    eversion: 0.4,
    maxDoseMl: 1.0,
    gloss: 0.30,
    vibrance: 0.08,
    borderDefinition: 0.30,
    field: clinicData.field as unknown as Record<string, [number, number]>,
  });
}
