// MediaPipe Face Landmarker 468-point landmark groups

export const LANDMARKS = {
  // LIPS
  UPPER_LIP_TOP:    [0, 37, 267, 13, 14, 17, 84, 17],
  UPPER_LIP_BOTTOM: [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291],
  LOWER_LIP_TOP:    [146, 91, 181, 84, 17, 314, 405, 321, 375],
  LOWER_LIP_BOTTOM: [17, 84, 181, 91, 146, 375, 321, 405, 314],
  CUPID_BOW:        [0, 37, 267],
  LIP_CORNERS:      [61, 291],
  ALL_LIPS:         [0, 13, 14, 17, 37, 39, 40, 61, 84, 91, 146, 181, 185,
                     267, 269, 270, 291, 314, 321, 375, 405, 409],

  // CHEEKS
  LEFT_CHEEK:  [50, 101, 36, 206, 187, 123, 116, 111, 117, 118, 119],
  RIGHT_CHEEK: [280, 330, 266, 426, 411, 352, 345, 340, 346, 347, 348],

  // JAWLINE
  LEFT_JAW:   [172, 136, 150, 149, 176, 148],
  RIGHT_JAW:  [397, 365, 379, 378, 400, 377],
  CHIN:       [152, 148, 176, 149, 379, 397, 400],

  // NASOLABIAL
  LEFT_NASOLABIAL:  [36, 206, 187, 216, 212],
  RIGHT_NASOLABIAL: [266, 426, 411, 436, 432],
} as const;

export type LandmarkGroup = keyof typeof LANDMARKS;
