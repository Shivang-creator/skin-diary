/**
 * Slept On — domain model.
 *
 * A diary entry pairs ONE YouCam AI Skin Analysis reading with the boring
 * lifestyle variables logged for the same day. Everything downstream
 * (trends, correlations, product change-point tests) is computed from a
 * list of these.
 */

/* ------------------------------------------------------------------ */
/* Skin metrics                                                        */
/* ------------------------------------------------------------------ */

/**
 * The seven SD-tier YouCam skin concerns Slept On tracks.
 *
 * These are deliberately the concerns that can plausibly MOVE on a
 * day-to-day timescale in response to sleep, hydration, stress and
 * products. YouCam also exposes `wrinkle`, `firmness`, `age_spot`,
 * `droopy_upper_eyelid`, `droopy_lower_eyelid`, `eye_bag`, `tear_trough`
 * and `skin_type`; those are structural and effectively constant over a
 * few weeks, so tracking them daily would only add noise and cost units.
 *
 * Cost note: YouCam prices AI Skin Analysis in tiers by concern count
 * (SD 1~4 concerns = 9 units, SD 5~7 concerns = 12 units). Seven is the
 * top of the 12-unit tier — maximum information per unit spent.
 */
export const CONCERNS = [
  "acne",
  "redness",
  "oiliness",
  "moisture",
  "radiance",
  "texture",
  "dark_circle_v2",
] as const;

export type Concern = (typeof CONCERNS)[number];

export interface ConcernMeta {
  id: Concern;
  /** Human label. */
  label: string;
  /** What YouCam says this measures. */
  blurb: string;
  /** Chart series slot (1-8) from the validated categorical palette. */
  slot: number;
}

export const CONCERN_META: Record<Concern, ConcernMeta> = {
  acne: {
    id: "acne",
    label: "Acne",
    blurb: "Breakout severity and count across the face.",
    slot: 1,
  },
  redness: {
    id: "redness",
    label: "Redness",
    blurb: "Erythema — how flushed or irritated the skin reads.",
    slot: 2,
  },
  oiliness: {
    id: "oiliness",
    label: "Oiliness",
    blurb: "Sebum level, weighted toward the T-zone.",
    slot: 3,
  },
  moisture: {
    id: "moisture",
    label: "Moisture",
    blurb: "Apparent hydration of the stratum corneum.",
    slot: 4,
  },
  radiance: {
    id: "radiance",
    label: "Radiance",
    blurb: "Brightness and evenness of tone.",
    slot: 5,
  },
  texture: {
    id: "texture",
    label: "Texture",
    blurb: "Surface smoothness and roughness.",
    slot: 6,
  },
  dark_circle_v2: {
    id: "dark_circle_v2",
    label: "Dark circles",
    blurb: "Periorbital darkness under the eyes.",
    slot: 7,
  },
};

/**
 * IMPORTANT SCORING CONVENTION.
 *
 * YouCam returns every concern on a 1-100 scale where HIGHER IS BETTER —
 * a redness score of 90 means very little redness, not a lot. This is
 * stated in their docs: "A higher score indicates healthier and more
 * aesthetically pleasing skin condition."
 *
 * Slept On keeps YouCam's raw orientation everywhere so the numbers on
 * screen match the numbers the API returned, and phrases all prose in
 * terms of the score ("your redness score is higher") rather than the
 * concern ("you have more redness"), which would invert the meaning.
 */
export const HIGHER_IS_BETTER = true;

/* ------------------------------------------------------------------ */
/* Logged lifestyle factors                                            */
/* ------------------------------------------------------------------ */

export const NUMERIC_FACTORS = ["sleepHours", "waterLitres", "stress"] as const;
export const BINARY_FACTORS = [
  "alcohol",
  "dairy",
  "exercise",
  "sunscreen",
] as const;

export type NumericFactor = (typeof NUMERIC_FACTORS)[number];
export type BinaryFactor = (typeof BINARY_FACTORS)[number];
export type FactorId = NumericFactor | BinaryFactor;

export interface FactorMeta {
  id: FactorId;
  kind: "numeric" | "binary";
  label: string;
  /** Phrase used in generated sentences, e.g. "on days after 7+ hours of sleep". */
  unit?: string;
  /** For binary factors: how to phrase the "true" group. */
  trueLabel?: string;
  falseLabel?: string;
  min?: number;
  max?: number;
  step?: number;
}

export const FACTOR_META: Record<FactorId, FactorMeta> = {
  sleepHours: {
    id: "sleepHours",
    kind: "numeric",
    label: "Sleep",
    unit: "hours",
    min: 0,
    max: 12,
    step: 0.5,
  },
  waterLitres: {
    id: "waterLitres",
    kind: "numeric",
    label: "Water",
    unit: "litres",
    min: 0,
    max: 5,
    step: 0.25,
  },
  stress: {
    id: "stress",
    kind: "numeric",
    label: "Stress",
    unit: "/5",
    min: 1,
    max: 5,
    step: 1,
  },
  alcohol: {
    id: "alcohol",
    kind: "binary",
    label: "Alcohol",
    trueLabel: "days after drinking",
    falseLabel: "days after not drinking",
  },
  dairy: {
    id: "dairy",
    kind: "binary",
    label: "Dairy",
    trueLabel: "days after dairy",
    falseLabel: "days after no dairy",
  },
  exercise: {
    id: "exercise",
    kind: "binary",
    label: "Exercise",
    trueLabel: "days after exercise",
    falseLabel: "days after no exercise",
  },
  sunscreen: {
    id: "sunscreen",
    kind: "binary",
    label: "SPF",
    trueLabel: "days after wearing SPF",
    falseLabel: "days after skipping SPF",
  },
};

export const ALL_FACTORS: FactorId[] = [...NUMERIC_FACTORS, ...BINARY_FACTORS];

/* ------------------------------------------------------------------ */
/* The entry                                                           */
/* ------------------------------------------------------------------ */

export interface DailyLog {
  sleepHours: number | null;
  waterLitres: number | null;
  /** 1 (calm) - 5 (very stressed). */
  stress: number | null;
  alcohol: boolean;
  dairy: boolean;
  exercise: boolean;
  sunscreen: boolean;
  /** Did the user start/stop/change a skincare product today? */
  productChanged: boolean;
  productName: string | null;
  note: string;
}

export function emptyLog(): DailyLog {
  return {
    sleepHours: null,
    waterLitres: null,
    stress: null,
    alcohol: false,
    dairy: false,
    exercise: false,
    sunscreen: false,
    productChanged: false,
    productName: null,
    note: "",
  };
}

/**
 * Photo capture conditions, measured in-browser from the pixels BEFORE
 * upload. These are not from YouCam — they exist so the analysis can tell
 * the difference between "your skin changed" and "your lighting changed",
 * which is the single biggest validity threat to a photo-based diary.
 */
export interface PhotoStats {
  /** Mean luma 0-255. */
  brightness: number;
  /** Std-dev of luma 0-255. */
  contrast: number;
  /** Mean warmth: (R - B), roughly colour temperature. */
  warmth: number;
  /** Downscaled JPEG data URL kept for the timeline. */
  thumbnail: string;
}

export type EntrySource = "demo" | "live" | "fixture";

export interface Entry {
  id: string;
  /** Local calendar day, YYYY-MM-DD. One entry per day. */
  date: string;
  createdAt: string;
  source: EntrySource;
  /** YouCam raw_score per concern, 1-100, higher = better. */
  scores: Partial<Record<Concern, number>>;
  /** YouCam's `all` composite score. */
  overall: number | null;
  /** YouCam's `skin_age`. */
  skinAge: number | null;
  photo: PhotoStats | null;
  log: DailyLog;
}

/* ------------------------------------------------------------------ */
/* Unit accounting                                                     */
/* ------------------------------------------------------------------ */

/**
 * YouCam AI Skin Analysis pricing, from
 * GET /s2s/v2.0/credit/feature-cost (documented example values).
 * Charged per successful result only — failed tasks cost nothing.
 */
export const UNIT_COST_TIERS = [
  { maxConcerns: 4, units: 9, label: "SD 1~4 concerns" },
  { maxConcerns: 7, units: 12, label: "SD 5~7 concerns" },
] as const;

export function unitCostFor(concernCount: number): number {
  for (const tier of UNIT_COST_TIERS) {
    if (concernCount <= tier.maxConcerns) return tier.units;
  }
  // Above the documented tiers we cannot know the price; refuse to guess.
  return NaN;
}

/** What one Slept On capture costs: 7 concerns = 12 units. */
export const UNITS_PER_CAPTURE = unitCostFor(CONCERNS.length);
