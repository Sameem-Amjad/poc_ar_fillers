export interface DisplacementEntry {
  landmark: number;
  dx: number;
  dy: number;
}

export interface DoseConfig {
  displacements: DisplacementEntry[];
  intensity_range: [number, number];
}

export interface TreatmentPreset {
  id: string;
  name: string;
  category: 'lips' | 'cheeks' | 'chin' | 'jaw' | 'nasolabial';
  icon: string;
  description: string;
  doses: Record<string, DoseConfig>;
}

import type { NormalizedLandmark, ControlPoint } from './deform';

export function buildControlPoints(
  landmarks: NormalizedLandmark[],
  preset: TreatmentPreset,
  dose: string,
  intensity: number
): ControlPoint[] {
  const doseConfig = preset.doses[dose];
  if (!doseConfig) return [];

  return doseConfig.displacements
    .filter(d => d.landmark >= 0 && d.landmark < landmarks.length)
    .map(disp => {
      const lm = landmarks[disp.landmark];
      return {
        src: [lm.x, lm.y] as [number, number],
        dst: [
          lm.x + disp.dx * intensity,
          lm.y + disp.dy * intensity,
        ] as [number, number],
      };
    });
}

// All treatment presets (inline for POC — would come from API/JSON in production)
export const PRESETS: TreatmentPreset[] = [
  {
    id: 'natural_lips',
    name: 'Natural Lips',
    category: 'lips',
    icon: '💋',
    description: 'Subtle balanced lip enhancement',
    doses: {
      '0.5ml': {
        displacements: [
          { landmark: 0,   dx:  0.000, dy: -0.003 },
          { landmark: 37,  dx: -0.0015, dy: -0.0025 },
          { landmark: 267, dx:  0.0015, dy: -0.0025 },
          { landmark: 14,  dx:  0.000, dy:  0.002 },
          { landmark: 17,  dx:  0.000, dy:  0.0035 },
          { landmark: 84,  dx: -0.001, dy:  0.0025 },
          { landmark: 314, dx:  0.001, dy:  0.0025 },
          { landmark: 61,  dx: -0.0015, dy:  0.001 },
          { landmark: 291, dx:  0.0015, dy:  0.001 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '1.0ml': {
        displacements: [
          { landmark: 0,   dx:  0.000, dy: -0.006 },
          { landmark: 37,  dx: -0.003, dy: -0.005 },
          { landmark: 267, dx:  0.003, dy: -0.005 },
          { landmark: 14,  dx:  0.000, dy:  0.004 },
          { landmark: 17,  dx:  0.000, dy:  0.007 },
          { landmark: 84,  dx: -0.002, dy:  0.005 },
          { landmark: 314, dx:  0.002, dy:  0.005 },
          { landmark: 61,  dx: -0.0025, dy:  0.002 },
          { landmark: 291, dx:  0.0025, dy:  0.002 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'russian_lips',
    name: 'Russian Lips',
    category: 'lips',
    icon: '💄',
    description: 'Defined cupid bow, projecting upper lip',
    doses: {
      '0.5ml': {
        displacements: [
          { landmark: 0,   dx:  0.000, dy: -0.005 },
          { landmark: 37,  dx: -0.0025, dy: -0.0045 },
          { landmark: 267, dx:  0.0025, dy: -0.0045 },
          { landmark: 13,  dx:  0.000, dy: -0.003 },
          { landmark: 14,  dx:  0.000, dy:  0.001 },
          { landmark: 17,  dx:  0.000, dy:  0.0015 },
          { landmark: 61,  dx: -0.001, dy:  0.0005 },
          { landmark: 291, dx:  0.001, dy:  0.0005 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '1.0ml': {
        displacements: [
          { landmark: 0,   dx:  0.000, dy: -0.008 },
          { landmark: 37,  dx: -0.0035, dy: -0.007 },
          { landmark: 267, dx:  0.0035, dy: -0.007 },
          { landmark: 13,  dx:  0.000, dy: -0.005 },
          { landmark: 14,  dx:  0.000, dy:  0.0015 },
          { landmark: 17,  dx:  0.000, dy:  0.0025 },
          { landmark: 61,  dx: -0.0015, dy:  0.001 },
          { landmark: 291, dx:  0.0015, dy:  0.001 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '1.5ml': {
        displacements: [
          { landmark: 0,   dx:  0.000, dy: -0.011 },
          { landmark: 37,  dx: -0.005, dy: -0.009 },
          { landmark: 267, dx:  0.005, dy: -0.009 },
          { landmark: 13,  dx:  0.000, dy: -0.007 },
          { landmark: 14,  dx:  0.000, dy:  0.002 },
          { landmark: 17,  dx:  0.000, dy:  0.0035 },
          { landmark: 61,  dx: -0.002, dy:  0.0015 },
          { landmark: 291, dx:  0.002, dy:  0.0015 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'french_lips',
    name: 'French Lips',
    category: 'lips',
    icon: '✨',
    description: 'Full lower lip with subtle upper',
    doses: {
      '0.5ml': {
        displacements: [
          { landmark: 17,  dx:  0.000, dy:  0.0045 },
          { landmark: 84,  dx: -0.0015, dy:  0.004 },
          { landmark: 314, dx:  0.0015, dy:  0.004 },
          { landmark: 146, dx: -0.001, dy:  0.003 },
          { landmark: 375, dx:  0.001, dy:  0.003 },
          { landmark: 0,   dx:  0.000, dy: -0.0015 },
          { landmark: 37,  dx: -0.001, dy: -0.0015 },
          { landmark: 267, dx:  0.001, dy: -0.0015 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '1.0ml': {
        displacements: [
          { landmark: 17,  dx:  0.000, dy:  0.008 },
          { landmark: 84,  dx: -0.0025, dy:  0.007 },
          { landmark: 314, dx:  0.0025, dy:  0.007 },
          { landmark: 146, dx: -0.002, dy:  0.0055 },
          { landmark: 375, dx:  0.002, dy:  0.0055 },
          { landmark: 0,   dx:  0.000, dy: -0.0025 },
          { landmark: 37,  dx: -0.0015, dy: -0.002 },
          { landmark: 267, dx:  0.0015, dy: -0.002 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'cheek_lift',
    name: 'Cheek Lift',
    category: 'cheeks',
    icon: '⬆️',
    description: 'Lateral cheek volume & lift',
    doses: {
      '1.0ml': {
        displacements: [
          { landmark: 50,  dx: -0.0025, dy: -0.004 },
          { landmark: 101, dx: -0.002,  dy: -0.005 },
          { landmark: 36,  dx: -0.003,  dy: -0.004 },
          { landmark: 116, dx: -0.0015, dy: -0.003 },
          { landmark: 280, dx:  0.0025, dy: -0.004 },
          { landmark: 330, dx:  0.002,  dy: -0.005 },
          { landmark: 266, dx:  0.003,  dy: -0.004 },
          { landmark: 345, dx:  0.0015, dy: -0.003 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '2.0ml': {
        displacements: [
          { landmark: 50,  dx: -0.005, dy: -0.0075 },
          { landmark: 101, dx: -0.004, dy: -0.009 },
          { landmark: 36,  dx: -0.006, dy: -0.0075 },
          { landmark: 116, dx: -0.003, dy: -0.006 },
          { landmark: 280, dx:  0.005, dy: -0.0075 },
          { landmark: 330, dx:  0.004, dy: -0.009 },
          { landmark: 266, dx:  0.006, dy: -0.0075 },
          { landmark: 345, dx:  0.003, dy: -0.006 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'nasolabial',
    name: 'Nasolabial',
    category: 'nasolabial',
    icon: '〰️',
    description: 'Soften cheek-to-mouth folds',
    doses: {
      '1.0ml': {
        displacements: [
          { landmark: 36,  dx: -0.004, dy: -0.005 },
          { landmark: 206, dx: -0.005, dy: -0.004 },
          { landmark: 187, dx: -0.003, dy: -0.004 },
          { landmark: 266, dx:  0.004, dy: -0.005 },
          { landmark: 426, dx:  0.005, dy: -0.004 },
          { landmark: 411, dx:  0.003, dy: -0.004 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'chin_aug',
    name: 'Chin Aug',
    category: 'chin',
    icon: '◇',
    description: 'Forward chin projection',
    doses: {
      '1.0ml': {
        displacements: [
          { landmark: 152, dx:  0.000, dy:  0.005 },
          { landmark: 148, dx: -0.0015, dy:  0.004 },
          { landmark: 377, dx:  0.0015, dy:  0.004 },
          { landmark: 176, dx: -0.001, dy:  0.003 },
          { landmark: 400, dx:  0.001, dy:  0.003 },
        ],
        intensity_range: [0.0, 1.0],
      },
      '2.0ml': {
        displacements: [
          { landmark: 152, dx:  0.000, dy:  0.009 },
          { landmark: 148, dx: -0.0025, dy:  0.0075 },
          { landmark: 377, dx:  0.0025, dy:  0.0075 },
          { landmark: 176, dx: -0.002, dy:  0.0055 },
          { landmark: 400, dx:  0.002, dy:  0.0055 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
  {
    id: 'jaw_contour',
    name: 'Jawline',
    category: 'jaw',
    icon: '▱',
    description: 'Define and sharpen jawline',
    doses: {
      '2.0ml': {
        displacements: [
          { landmark: 172, dx: -0.003, dy:  0.0025 },
          { landmark: 136, dx: -0.004, dy:  0.002 },
          { landmark: 150, dx: -0.0035, dy:  0.0015 },
          { landmark: 397, dx:  0.003, dy:  0.0025 },
          { landmark: 365, dx:  0.004, dy:  0.002 },
          { landmark: 379, dx:  0.0035, dy:  0.0015 },
        ],
        intensity_range: [0.0, 1.0],
      },
    },
  },
];
