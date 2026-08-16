/**
 * The demo diary.
 *
 * A judge, or anyone else, opens Skin Diary with zero history. An empty
 * product cannot demonstrate a longitudinal product, so this module
 * synthesises a realistic six-week diary with KNOWN planted signals.
 *
 * It is labelled as demo data everywhere it appears in the UI, and it is
 * never mixed into a real diary.
 *
 * Two properties matter:
 *
 *  - DETERMINISTIC. A seeded PRNG, so every visitor sees the same diary
 *    and the same findings, and so the analysis engine can be regression
 *    tested against known ground truth (see seed.test.ts).
 *
 *  - HONEST IN SHAPE. It includes missed days, one factor with no real
 *    effect at all (dairy), and noise large enough that the engine has to
 *    actually work. The engine is not fed a clean answer.
 */

import {
  CONCERNS,
  emptyLog,
  type Concern,
  type Entry,
  type DailyLog,
} from "../domain";
import { addDays, fromDayKey, todayKey, type DayKey } from "../dates";

/* ------------------------------------------------------------------ */
/* Ground truth — what the demo diary actually contains                */
/* ------------------------------------------------------------------ */

/**
 * The relationships planted in the demo data. The analysis engine is
 * given no knowledge of this table; seed.test.ts asserts that it
 * rediscovers these and does NOT invent the ones marked null.
 */
export const PLANTED_SIGNALS = [
  { factor: "sleepHours", metric: "redness", lag: 1, direction: 1 },
  { factor: "sleepHours", metric: "dark_circle_v2", lag: 1, direction: 1 },
  { factor: "alcohol", metric: "redness", lag: 1, direction: -1 },
  { factor: "alcohol", metric: "oiliness", lag: 1, direction: -1 },
  { factor: "stress", metric: "acne", lag: 2, direction: -1 },
  { factor: "waterLitres", metric: "moisture", lag: 1, direction: 1 },
  { factor: "exercise", metric: "radiance", lag: 1, direction: 1 },
] as const;

/** Factors deliberately given NO effect — the engine must not "find" them. */
export const NULL_FACTORS = ["dairy", "sunscreen"] as const;

export const DEMO_PRODUCT = {
  name: "Niacinamide 10% serum",
  /** Days from the start of the diary. */
  dayIndex: 20,
  metric: "redness" as Concern,
  /** Points of improvement, applied after the washout. */
  effect: 11,
  washoutDays: 7,
};

export const DEMO_SPAN_DAYS = 46;
/** Days deliberately left blank, to look like a real diary and exercise gap handling. */
export const DEMO_MISSED_DAY_INDEXES = [6, 17, 29, 38];

/* ------------------------------------------------------------------ */
/* Deterministic PRNG                                                  */
/* ------------------------------------------------------------------ */

/** mulberry32 — small, fast, well-distributed, and completely reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller normal deviate from a uniform generator. */
function normal(rng: () => number, mean = 0, sd = 1): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

const BASELINE: Record<Concern, number> = {
  acne: 74,
  redness: 68,
  oiliness: 66,
  moisture: 61,
  radiance: 73,
  texture: 71,
  dark_circle_v2: 65,
};

interface DayFactors {
  sleepHours: number;
  waterLitres: number;
  stress: number;
  alcohol: boolean;
  dairy: boolean;
  exercise: boolean;
  sunscreen: boolean;
}

const NOTES = [
  "",
  "Skin felt tight this morning.",
  "Long day, barely drank any water.",
  "Slept badly — noisy neighbours.",
  "Felt good today.",
  "",
  "Forgot moisturiser last night.",
  "",
  "Cheeks look a bit calmer.",
  "",
  "Work deadline. Rough week.",
  "",
];

export const DEMO_SEED = 20260817;

/**
 * Build the demo diary.
 *
 * @param endDate the most recent day in the diary (defaults to today, so
 *                the demo always looks current)
 */
export function buildDemoEntries(endDate: DayKey = todayKey()): Entry[] {
  const rng = mulberry32(DEMO_SEED);
  const startDate = addDays(endDate, -(DEMO_SPAN_DAYS - 1));

  // ---- 1. Generate the lifestyle log for every day in the span ----
  const factors: DayFactors[] = [];
  for (let i = 0; i < DEMO_SPAN_DAYS; i++) {
    const date = addDays(startDate, i);
    // Local-midnight parse: `new Date("YYYY-MM-DD")` would parse as UTC
    // and shift the weekday for anyone west of Greenwich.
    const dow = fromDayKey(date).getDay(); // 0 Sun .. 6 Sat
    const isWeekendEve = dow === 5 || dow === 6;

    // Sleep: a weekly rhythm plus noise, occasionally a bad night.
    const sleepBase = 7.1 + (isWeekendEve ? 0.5 : 0) - (dow === 1 ? 0.4 : 0);
    const sleepHours = clamp(round(normal(rng, sleepBase, 1.05), 1), 4, 10);

    const waterLitres = clamp(round(normal(rng, 2.1, 0.6), 2), 0.4, 4);

    // Stress: higher mid-week, with a stressful stretch around day 24-30.
    const stressBase =
      3 + (dow >= 1 && dow <= 4 ? 0.4 : -0.5) + (i >= 24 && i <= 30 ? 0.9 : 0);
    const stress = clamp(Math.round(normal(rng, stressBase, 0.95)), 1, 5);

    factors.push({
      sleepHours,
      waterLitres,
      stress,
      alcohol: rng() < (isWeekendEve ? 0.55 : 0.16),
      // Null control: pure coin flip, unrelated to anything.
      dairy: rng() < 0.45,
      exercise: rng() < (dow === 0 ? 0.25 : 0.45),
      sunscreen: rng() < 0.62,
    });
  }

  // ---- 2. Derive skin scores from the factors, with lags ----
  const entries: Entry[] = [];

  for (let i = 0; i < DEMO_SPAN_DAYS; i++) {
    if (DEMO_MISSED_DAY_INDEXES.includes(i)) continue;

    const date = addDays(startDate, i);
    const prev = i >= 1 ? factors[i - 1] : null;
    const prev2 = i >= 2 ? factors[i - 2] : null;
    const scores: Partial<Record<Concern, number>> = {};

    // Slow baseline drift — skin genuinely wanders over six weeks.
    const drift = Math.sin(i / 11) * 1.6;

    for (const metric of CONCERNS) {
      let v = BASELINE[metric] + drift;

      if (metric === "redness") {
        if (prev) {
          v += 5.0 * (prev.sleepHours - 7.1);
          v -= prev.alcohol ? 8.5 : 0;
        }
        // The product effect, after its washout.
        if (i >= DEMO_PRODUCT.dayIndex + DEMO_PRODUCT.washoutDays) {
          v += DEMO_PRODUCT.effect;
        }
      }
      if (metric === "dark_circle_v2" && prev) {
        v += 4.1 * (prev.sleepHours - 7.1);
      }
      if (metric === "oiliness" && prev) {
        v -= prev.alcohol ? 5.5 : 0;
        v -= 1.4 * (prev.stress - 3);
      }
      if (metric === "acne" && prev2) {
        v -= 3.6 * (prev2.stress - 3);
      }
      if (metric === "moisture" && prev) {
        v += 4.6 * (prev.waterLitres - 2.1);
      }
      if (metric === "radiance" && prev) {
        v += prev.exercise ? 5.2 : 0;
        v += 1.1 * (prev.sleepHours - 7.1);
      }
      if (metric === "texture") {
        // Texture is deliberately near-inert: it should surface as
        // "no clear signal" for almost everything.
        v += normal(rng, 0, 0.8);
      }

      // Measurement noise — the API is not a perfect instrument.
      v += normal(rng, 0, 2.4);
      scores[metric] = round(clamp(v, 1, 100), 2);
    }

    const overall = round(
      CONCERNS.reduce((s, c) => s + (scores[c] as number), 0) / CONCERNS.length,
      2,
    );

    const f = factors[i];
    const isProductDay = i === DEMO_PRODUCT.dayIndex;

    const log: DailyLog = {
      ...emptyLog(),
      sleepHours: f.sleepHours,
      waterLitres: f.waterLitres,
      stress: f.stress,
      alcohol: f.alcohol,
      dairy: f.dairy,
      exercise: f.exercise,
      sunscreen: f.sunscreen,
      productChanged: isProductDay,
      productName: isProductDay ? DEMO_PRODUCT.name : null,
      note: isProductDay
        ? `Started ${DEMO_PRODUCT.name} tonight.`
        : NOTES[Math.floor(rng() * NOTES.length)],
    };

    entries.push({
      id: `demo-${date}`,
      date,
      createdAt: `${date}T08:15:00.000Z`,
      source: "demo",
      scores,
      overall,
      // Skin age moves slowly and is mostly a function of the structural
      // concerns, which this diary does not track daily.
      skinAge: Math.round(28 + Math.sin(i / 14) * 1.2),
      photo: {
        // Lighting varies as it would in real life, but is deliberately
        // NOT wired to any skin score -- so the brightness-controlled
        // readout demonstrates findings surviving the control.
        brightness: round(clamp(normal(rng, 138, 11), 60, 230), 1),
        contrast: round(clamp(normal(rng, 47, 5), 10, 90), 1),
        warmth: round(normal(rng, 12, 4), 1),
        thumbnail: "",
      },
      log,
    });
  }

  return entries;
}
