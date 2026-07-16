// MediaPipe Face Landmarker lip topology + geometric helpers.
//
// All indices follow the canonical 478-point face mesh. The outer/inner rings
// are ordered contours (left corner → across the top → right corner → across
// the bottom → back to left corner) so adjacent array entries are adjacent on
// the lip contour — required for computing tangents/normals along the lip.

export interface Point2 {
  x: number;
  y: number;
}

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

// ── Ordered contours ────────────────────────────────────────────────────────

// Outer vermillion border, counter-clockwise in image space.
// Top edge: left corner → cupid's bow → right corner. Bottom edge: right → left.
export const OUTER_LIP_RING = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, // upper edge  L→R
  375, 321, 405, 314, 17, 84, 181, 91, 146,        // lower edge  R→L
] as const;

// Inner lip ring (wet line), same winding.
export const INNER_LIP_RING = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, // upper inner L→R
  324, 318, 402, 317, 14, 87, 178, 88, 95,          // lower inner R→L
] as const;

// Segments used by the style engine (indices into the rings above are
// positional along the contour; these are the raw landmark ids).
export const UPPER_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291] as const;
export const LOWER_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291] as const;
export const UPPER_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308] as const;
export const LOWER_INNER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308] as const;

export const LIP_CORNER_L = 61;
export const LIP_CORNER_R = 291;
export const CUPID_PEAK_L = 37;   // left cupid's bow peak
export const CUPID_PEAK_R = 267;  // right cupid's bow peak
export const CUPID_DIP = 0;       // philtrum dip (top-center)
export const LOWER_CENTER = 17;   // bottom-center of lower lip

export const ALL_LIP_INDICES: number[] = Array.from(
  new Set<number>([...OUTER_LIP_RING, ...INNER_LIP_RING])
);

// ── Anchor ring ─────────────────────────────────────────────────────────────
// Points surrounding the mouth that must NOT move. They pin the TPS so the
// deformation stays strictly local to the lips and blends to zero smoothly.
// Deliberately NOT anchored: the philtrum points right above the upper lip
// (164/393/167) — pinning them creates an extreme gradient over ~15px when
// the lip rises, which renders as a sawtooth along the vermillion border.
// The philtrum should compress smoothly, as it does with real filler.
export const ANCHOR_RING = [
  // nose base / subnasale
  2, 98, 327,
  // nasolabial / cheek, left then right
  205, 50, 425, 280, 212, 432, 57, 287,
  // jaw sides near mouth level
  172, 397, 136, 365,
  // chin
  152, 176, 400, 148, 377, 199, 200,
] as const;

// Landmarks used for the scale/orientation frame.
export const NOSE_BASE = 2;      // subnasale — defines the face "up" direction
export const LEFT_EYE_OUTER = 33;
export const RIGHT_EYE_OUTER = 263;

// ── Geometry helpers ────────────────────────────────────────────────────────

export interface MouthFrame {
  center: Point2;      // mouth centroid
  up: Point2;          // unit vector: mouth center → nose base (face-relative up)
  right: Point2;       // unit vector perpendicular to up (toward landmark 291)
  mouthWidth: number;  // |corner L − corner R| in normalized units
  faceScale: number;   // inter-ocular distance — stable global size reference
}

function sub(a: Point2, b: Point2): Point2 { return { x: a.x - b.x, y: a.y - b.y }; }
function len(v: Point2): number { return Math.hypot(v.x, v.y); }
function norm(v: Point2): Point2 { const l = len(v) || 1e-9; return { x: v.x / l, y: v.y / l }; }

// Build a face-relative coordinate frame around the mouth. Displacements are
// expressed in this frame so they stay correct under head tilt/roll and at
// any distance from the camera (everything scales with mouthWidth).
export function computeMouthFrame(lm: NormalizedLandmark[], aspect: number): MouthFrame {
  // Work in aspect-corrected space so directions/lengths are isotropic.
  const P = (i: number): Point2 => ({ x: lm[i].x * aspect, y: lm[i].y });

  const cornerL = P(LIP_CORNER_L);
  const cornerR = P(LIP_CORNER_R);
  const top = P(CUPID_DIP);
  const bottom = P(LOWER_CENTER);

  const center: Point2 = {
    x: (cornerL.x + cornerR.x + top.x + bottom.x) / 4,
    y: (cornerL.y + cornerR.y + top.y + bottom.y) / 4,
  };

  const up = norm(sub(P(NOSE_BASE), center));
  // right = up rotated -90° so it points from L corner toward R corner side
  let right: Point2 = { x: -up.y, y: up.x };
  if ((cornerR.x - cornerL.x) * right.x + (cornerR.y - cornerL.y) * right.y < 0) {
    right = { x: -right.x, y: -right.y };
  }

  return {
    center,
    up,
    right,
    mouthWidth: len(sub(cornerR, cornerL)),
    faceScale: len(sub(P(RIGHT_EYE_OUTER), P(LEFT_EYE_OUTER))),
  };
}

// Position along the lip from corner to corner: 0 at either corner, 1 at center.
// Used to shape volume profiles (e.g. Russian = plateau, Natural = smooth arc).
export function lipParam(idx: number, segment: readonly number[]): number {
  const i = segment.indexOf(idx);
  if (i < 0) return 0;
  const t = i / (segment.length - 1); // 0..1 across the segment
  return 1 - Math.abs(2 * t - 1);     // 0 at corners → 1 at center
}
