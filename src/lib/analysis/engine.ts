/**
 * The insight engine.
 *
 * Takes a list of diary entries and returns everything the payoff screen
 * shows: per-metric trends, factor findings, product change-point tests
 * and data-quality warnings.
 *
 * Three rules govern this file, and they are the whole point of the
 * product:
 *
 *   1. NO LLM, NO MODEL, NO RANDOMNESS. Every number is arithmetic you
 *      can follow by hand. The same diary always produces the same
 *      findings, and a user can check our working.
 *
 *   2. EVERY CLAIM CARRIES ITS SAMPLE SIZE. A finding over 5 days and a
 *      finding over 40 days do not get to look alike on screen.
 *
 *   3. WE COUNT OUR OWN TESTS. Searching 7 factors x 7 metrics x 3 lags
 *      is 147 hypotheses. At p<0.05 about 7 of them would look
 *      "significant" from pure noise. Every p-value is therefore
 *      Benjamini-Hochberg corrected across the family actually run, and
 *      the family size is displayed to the user.
 */

import {
  ALL_FACTORS,
  BINARY_FACTORS,
  CONCERNS,
  CONCERN_META,
  FACTOR_META,
  type BinaryFactor,
  type Concern,
  type Entry,
  type FactorId,
  type NumericFactor,
} from "../domain";
import { addDays, daysBetween, type DayKey } from "../dates";
import {
  benjaminiHochberg,
  classifyConfidence,
  correlationTest,
  mean,
  partialCorrelation,
  spearman,
  stdDev,
  welchTTest,
  type Confidence,
} from "../stats/correlation";

/* ------------------------------------------------------------------ */
/* Tunables — stated here so they can be shown in the UI                */
/* ------------------------------------------------------------------ */

export const ANALYSIS_CONFIG = {
  /** Lags tested, in days. A factor on day D is matched to skin on day D+lag. */
  lags: [0, 1, 2] as const,
  /** Below this many paired observations we refuse to report a finding. */
  minPairedObservations: 8,
  /** BH false-discovery-rate threshold used for the "signal" cutoff. */
  fdr: 0.1,
  /** Days ignored after a product change before measuring its effect. */
  productWashoutDays: 7,
  /** Window either side of a product change. */
  productWindowDays: 14,
  /** Minimum observations either side of a product change. */
  minProductObservations: 4,
  /** Above this |r| between brightness and a metric, we flag a lighting confound. */
  brightnessConfoundThreshold: 0.5,
} as const;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Finding {
  id: string;
  factorId: FactorId;
  metricId: Concern;
  lag: number;
  kind: "correlation" | "group";
  /** Paired observations backing this finding. Always displayed. */
  n: number;
  /** Spearman rho for correlations; Cohen's d for group differences. */
  effect: number;
  /** Raw two-tailed p-value. */
  p: number;
  /** Benjamini-Hochberg corrected q-value across the whole family. */
  q: number;
  confidence: Confidence;
  /** Positive = the skin score is HIGHER (better) with more of this factor. */
  direction: 1 | -1 | 0;
  /** Plain-language claim. Template-generated, never model-generated. */
  sentence: string;
  /** The arithmetic behind the claim. */
  detail: string;
  /** For group comparisons. */
  groups?: { trueMean: number; falseMean: number; nTrue: number; nFalse: number };
  /**
   * Same correlation with photo brightness partialled out. If the signal
   * disappears here, it was probably the lighting, not the skin.
   */
  brightnessAdjusted?: { r: number; p: number; collapsed: boolean } | null;
}

export interface ProductFinding {
  id: string;
  productName: string;
  changeDate: DayKey;
  metricId: Concern;
  beforeMean: number;
  afterMean: number;
  diff: number;
  nBefore: number;
  nAfter: number;
  p: number;
  q: number;
  confidence: Confidence;
  sentence: string;
  detail: string;
}

export interface MetricSeries {
  metricId: Concern;
  points: Array<{ date: DayKey; value: number }>;
  first: number | null;
  last: number | null;
  changeFromStart: number | null;
  mean: number;
  sd: number;
  n: number;
}

export interface DataQuality {
  entryCount: number;
  firstDate: DayKey | null;
  lastDate: DayKey | null;
  spanDays: number;
  /** Days in the span with no entry. */
  missedDays: number;
  /** Std-dev of photo brightness across entries; high = inconsistent lighting. */
  brightnessSd: number | null;
  /** Metrics whose readings track photo brightness suspiciously closely. */
  lightingConfounds: Array<{ metricId: Concern; r: number; n: number }>;
  warnings: string[];
}

export interface AnalysisResult {
  series: MetricSeries[];
  findings: Finding[];
  productFindings: ProductFinding[];
  quality: DataQuality;
  /** How many hypotheses were tested — shown to the user. */
  hypothesesTested: number;
  productChanges: Array<{ date: DayKey; name: string }>;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function byDate(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function indexByDate(entries: Entry[]): Map<DayKey, Entry> {
  const m = new Map<DayKey, Entry>();
  for (const e of entries) m.set(e.date, e);
  return m;
}

function factorValue(e: Entry, id: FactorId): number | null {
  const meta = FACTOR_META[id];
  if (meta.kind === "binary") {
    return e.log[id as BinaryFactor] ? 1 : 0;
  }
  const v = e.log[id as NumericFactor];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Build (factor on day D, metric on day D+lag) pairs.
 *
 * Uses real calendar dates rather than array positions, so a gap in the
 * diary never silently shifts a "next day" comparison onto the wrong day.
 */
function buildPairs(
  entries: Entry[],
  byDay: Map<DayKey, Entry>,
  factorId: FactorId,
  metricId: Concern,
  lag: number,
): { xs: number[]; ys: number[]; brightness: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  const brightness: number[] = [];

  for (const e of entries) {
    const x = factorValue(e, factorId);
    if (x === null) continue;

    const target = lag === 0 ? e : byDay.get(addDays(e.date, lag));
    if (!target) continue;

    const y = target.scores[metricId];
    if (typeof y !== "number" || !Number.isFinite(y)) continue;

    xs.push(x);
    ys.push(y);
    brightness.push(target.photo?.brightness ?? NaN);
  }
  return { xs, ys, brightness };
}

function lagPhrase(lag: number): string {
  if (lag === 0) return "the same day";
  if (lag === 1) return "the next day";
  return `${lag} days later`;
}

function fmt(n: number, dp = 1): string {
  return Number.isFinite(n) ? n.toFixed(dp) : "—";
}

function fmtSigned(n: number, dp = 2): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(dp)}`;
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "—";
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function analyse(rawEntries: Entry[]): AnalysisResult {
  const entries = byDate(rawEntries);
  const byDay = indexByDate(entries);

  /* ---------------- Series ---------------- */

  const series: MetricSeries[] = CONCERNS.map((metricId) => {
    const points = entries
      .filter((e) => typeof e.scores[metricId] === "number")
      .map((e) => ({ date: e.date, value: e.scores[metricId] as number }));
    const values = points.map((p) => p.value);
    return {
      metricId,
      points,
      first: values.length ? values[0] : null,
      last: values.length ? values[values.length - 1] : null,
      changeFromStart:
        values.length >= 2 ? values[values.length - 1] - values[0] : null,
      mean: mean(values),
      sd: stdDev(values),
      n: values.length,
    };
  });

  /* ---------------- Factor findings ---------------- */

  interface Candidate {
    factorId: FactorId;
    metricId: Concern;
    lag: number;
    kind: "correlation" | "group";
    n: number;
    effect: number;
    p: number;
    groups?: Finding["groups"];
    xs: number[];
    ys: number[];
    brightness: number[];
  }

  const candidates: Candidate[] = [];

  for (const factorId of ALL_FACTORS) {
    const isBinary = FACTOR_META[factorId].kind === "binary";
    for (const metricId of CONCERNS) {
      for (const lag of ANALYSIS_CONFIG.lags) {
        const { xs, ys, brightness } = buildPairs(
          entries,
          byDay,
          factorId,
          metricId,
          lag,
        );
        if (xs.length < ANALYSIS_CONFIG.minPairedObservations) continue;

        if (isBinary) {
          const yTrue = ys.filter((_, i) => xs[i] === 1);
          const yFalse = ys.filter((_, i) => xs[i] === 0);
          if (
            yTrue.length < ANALYSIS_CONFIG.minProductObservations ||
            yFalse.length < ANALYSIS_CONFIG.minProductObservations
          ) {
            continue;
          }
          const w = welchTTest(yTrue, yFalse);
          if (!Number.isFinite(w.p)) continue;
          candidates.push({
            factorId,
            metricId,
            lag,
            kind: "group",
            n: xs.length,
            effect: w.cohensD,
            p: w.p,
            groups: {
              trueMean: w.meanA,
              falseMean: w.meanB,
              nTrue: w.nA,
              nFalse: w.nB,
            },
            xs,
            ys,
            brightness,
          });
        } else {
          const r = spearman(xs, ys);
          if (!Number.isFinite(r)) continue;
          const test = correlationTest(r, xs.length);
          if (!Number.isFinite(test.p)) continue;
          candidates.push({
            factorId,
            metricId,
            lag,
            kind: "correlation",
            n: xs.length,
            effect: r,
            p: test.p,
            xs,
            ys,
            brightness,
          });
        }
      }
    }
  }

  // One BH family across every test we ran. This is the honest denominator.
  const qs = benjaminiHochberg(candidates.map((c) => c.p));

  const findings: Finding[] = candidates.map((c, i) => {
    const q = qs[i];
    // Group differences are graded on Cohen's d, correlations on rho;
    // both are bounded-ish effect sizes, but d can exceed 1, so it is
    // scaled onto a comparable footing for the confidence gate.
    const gradeEffect =
      c.kind === "group" ? Math.tanh(Math.abs(c.effect) / 2) : c.effect;
    const confidence = classifyConfidence(
      gradeEffect,
      c.n,
      q,
      ANALYSIS_CONFIG.minPairedObservations,
    );
    const direction = c.effect > 0 ? 1 : c.effect < 0 ? -1 : 0;

    const metric = CONCERN_META[c.metricId].label;
    const factor = FACTOR_META[c.factorId];

    let sentence: string;
    let detail: string;

    if (c.kind === "group" && c.groups) {
      const g = c.groups;
      const higher = g.trueMean > g.falseMean;
      const label =
        c.lag === 0
          ? `on ${factor.label.toLowerCase()} days`
          : `${lagPhrase(c.lag)} after ${factor.label.toLowerCase()}`;
      sentence = `Your ${metric} score is ${fmt(
        Math.abs(g.trueMean - g.falseMean),
      )} points ${higher ? "higher" : "lower"} ${label}.`;
      detail = `${fmt(g.trueMean)} (n = ${g.nTrue}) vs ${fmt(
        g.falseMean,
      )} (n = ${g.nFalse}) · Welch p = ${fmtP(c.p)} · corrected q = ${fmtP(
        q,
      )} · Cohen's d = ${fmtSigned(c.effect)}`;
    } else {
      const more = c.effect > 0 ? "higher" : "lower";
      sentence = `Your ${metric} score tends to be ${more} ${lagPhrase(
        c.lag,
      )} after more ${factor.label.toLowerCase()}.`;
      detail = `Spearman ρ = ${fmtSigned(c.effect)} across ${
        c.n
      } paired days · p = ${fmtP(c.p)} · corrected q = ${fmtP(q)}`;
    }

    // Lighting-confound check, only worth running on findings that
    // survived — and only where we actually have brightness readings.
    let brightnessAdjusted: Finding["brightnessAdjusted"] = null;
    const haveBrightness = c.brightness.every((b) => Number.isFinite(b));
    if (
      haveBrightness &&
      c.kind === "correlation" &&
      (confidence === "strong" || confidence === "moderate" || confidence === "weak")
    ) {
      const adj = partialCorrelation(c.xs, c.ys, c.brightness);
      if (Number.isFinite(adj.r)) {
        brightnessAdjusted = {
          r: adj.r,
          p: adj.p,
          // "Collapsed" = the relationship more than halved once lighting
          // was held constant.
          collapsed: Math.abs(adj.r) < Math.abs(c.effect) / 2,
        };
      }
    }

    return {
      id: `${c.factorId}:${c.metricId}:${c.lag}`,
      factorId: c.factorId,
      metricId: c.metricId,
      lag: c.lag,
      kind: c.kind,
      n: c.n,
      effect: c.effect,
      p: c.p,
      q,
      confidence,
      direction,
      sentence,
      detail,
      groups: c.groups,
      brightnessAdjusted,
    };
  });

  /* ---------------- Product change-points ---------------- */

  const productChanges = entries
    .filter((e) => e.log.productChanged && e.log.productName)
    .map((e) => ({ date: e.date, name: e.log.productName as string }));

  interface ProductCandidate {
    productName: string;
    changeDate: DayKey;
    metricId: Concern;
    before: number[];
    after: number[];
    p: number;
    diff: number;
    beforeMean: number;
    afterMean: number;
  }

  const productCandidates: ProductCandidate[] = [];

  for (const change of productChanges) {
    for (const metricId of CONCERNS) {
      const before: number[] = [];
      const after: number[] = [];

      for (const e of entries) {
        const v = e.scores[metricId];
        if (typeof v !== "number") continue;
        const delta = daysBetween(change.date, e.date);

        if (delta < 0 && delta >= -ANALYSIS_CONFIG.productWindowDays) {
          before.push(v);
        } else if (
          // Skip the washout window: a product that works does not work
          // on day one, and comparing across it would understate it.
          delta >= ANALYSIS_CONFIG.productWashoutDays &&
          delta <
            ANALYSIS_CONFIG.productWashoutDays +
              ANALYSIS_CONFIG.productWindowDays
        ) {
          after.push(v);
        }
      }

      if (
        before.length < ANALYSIS_CONFIG.minProductObservations ||
        after.length < ANALYSIS_CONFIG.minProductObservations
      ) {
        continue;
      }

      const w = welchTTest(after, before);
      if (!Number.isFinite(w.p)) continue;

      productCandidates.push({
        productName: change.name,
        changeDate: change.date,
        metricId,
        before,
        after,
        p: w.p,
        diff: w.diff,
        beforeMean: w.meanB,
        afterMean: w.meanA,
      });
    }
  }

  // Separate BH family: these are a different question from the
  // lifestyle-factor search, and pooling them would over-penalise both.
  const productQs = benjaminiHochberg(productCandidates.map((c) => c.p));

  const productFindings: ProductFinding[] = productCandidates.map((c, i) => {
    const q = productQs[i];
    const n = Math.min(c.before.length, c.after.length);
    const confidence = classifyConfidence(
      Math.tanh(Math.abs(c.diff) / 10),
      n,
      q,
      ANALYSIS_CONFIG.minProductObservations,
    );
    const metric = CONCERN_META[c.metricId].label;
    const better = c.diff > 0;

    return {
      id: `${c.changeDate}:${c.productName}:${c.metricId}`,
      productName: c.productName,
      changeDate: c.changeDate,
      metricId: c.metricId,
      beforeMean: c.beforeMean,
      afterMean: c.afterMean,
      diff: c.diff,
      nBefore: c.before.length,
      nAfter: c.after.length,
      p: c.p,
      q,
      confidence,
      sentence: `Since starting ${c.productName}, your ${metric} score is ${fmt(
        Math.abs(c.diff),
      )} points ${better ? "higher" : "lower"}.`,
      detail: `Before: ${fmt(c.beforeMean)} (n = ${
        c.before.length
      }) · after a ${
        ANALYSIS_CONFIG.productWashoutDays
      }-day washout: ${fmt(c.afterMean)} (n = ${
        c.after.length
      }) · Welch p = ${fmtP(c.p)} · corrected q = ${fmtP(q)}`,
    };
  });

  /* ---------------- Data quality ---------------- */

  const quality = assessQuality(entries);

  return {
    series,
    findings: rankFindings(findings),
    productFindings: productFindings.sort(
      (a, b) => rankConfidence(b.confidence) - rankConfidence(a.confidence) ||
        Math.abs(b.diff) - Math.abs(a.diff),
    ),
    quality,
    hypothesesTested: candidates.length,
    productChanges,
  };
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  strong: 4,
  moderate: 3,
  weak: 2,
  none: 1,
  insufficient: 0,
};

export function rankConfidence(c: Confidence): number {
  return CONFIDENCE_RANK[c];
}

/**
 * Order findings for display: strongest evidence first, then largest
 * effect. Deliberately NOT sorted by effect size alone — a huge
 * coefficient over nine days should not outrank a modest one over forty.
 */
function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const c = rankConfidence(b.confidence) - rankConfidence(a.confidence);
    if (c !== 0) return c;
    const e = Math.abs(b.effect) - Math.abs(a.effect);
    if (Math.abs(e) > 1e-9) return e;
    return a.q - b.q;
  });
}

function assessQuality(entries: Entry[]): DataQuality {
  const warnings: string[] = [];
  const n = entries.length;
  const firstDate = n ? entries[0].date : null;
  const lastDate = n ? entries[n - 1].date : null;
  const spanDays =
    firstDate && lastDate ? daysBetween(firstDate, lastDate) + 1 : 0;
  const missedDays = Math.max(0, spanDays - n);

  const brightnesses = entries
    .map((e) => e.photo?.brightness)
    .filter((b): b is number => typeof b === "number" && Number.isFinite(b));

  const brightnessSd = brightnesses.length >= 2 ? stdDev(brightnesses) : null;

  const lightingConfounds: DataQuality["lightingConfounds"] = [];
  if (brightnesses.length >= ANALYSIS_CONFIG.minPairedObservations) {
    for (const metricId of CONCERNS) {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const e of entries) {
        const b = e.photo?.brightness;
        const v = e.scores[metricId];
        if (typeof b === "number" && typeof v === "number") {
          xs.push(b);
          ys.push(v);
        }
      }
      if (xs.length < ANALYSIS_CONFIG.minPairedObservations) continue;
      const r = spearman(xs, ys);
      if (
        Number.isFinite(r) &&
        Math.abs(r) >= ANALYSIS_CONFIG.brightnessConfoundThreshold
      ) {
        lightingConfounds.push({ metricId, r, n: xs.length });
      }
    }
  }

  if (n < ANALYSIS_CONFIG.minPairedObservations) {
    warnings.push(
      `Only ${n} ${
        n === 1 ? "entry" : "entries"
      } so far. Skin Diary will not report any correlation until it has at least ${
        ANALYSIS_CONFIG.minPairedObservations
      }.`,
    );
  }
  if (missedDays > 0 && spanDays > 0) {
    warnings.push(
      `${missedDays} of the last ${spanDays} days have no entry. Gaps weaken the next-day comparisons most.`,
    );
  }
  if (brightnessSd !== null && brightnessSd > 25) {
    warnings.push(
      `Your photo lighting varies a lot (brightness SD ${brightnessSd.toFixed(
        0,
      )}/255). Shoot in the same place at the same time of day to make readings comparable.`,
    );
  }
  for (const c of lightingConfounds) {
    warnings.push(
      `${
        CONCERN_META[c.metricId].label
      } tracks your photo brightness closely (ρ = ${fmtSigned(
        c.r,
      )}, n = ${c.n}). Those readings may be measuring your lighting, not your skin.`,
    );
  }

  return {
    entryCount: n,
    firstDate,
    lastDate,
    spanDays,
    missedDays,
    brightnessSd,
    lightingConfounds,
    warnings,
  };
}

/** Findings worth putting at the top of the payoff screen. */
export function headlineFindings(result: AnalysisResult, limit = 3): Finding[] {
  return result.findings
    .filter(
      (f) => f.confidence === "strong" || f.confidence === "moderate",
    )
    .slice(0, limit);
}

/**
 * Deduplicate to one finding per (factor, metric) pair — the best lag.
 *
 * Showing all three lags of the same relationship would triple-count one
 * piece of evidence and read as three separate discoveries.
 */
export function bestPerPair(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding>();
  for (const f of findings) {
    const key = `${f.factorId}:${f.metricId}`;
    const prev = seen.get(key);
    if (
      !prev ||
      rankConfidence(f.confidence) > rankConfidence(prev.confidence) ||
      (rankConfidence(f.confidence) === rankConfidence(prev.confidence) &&
        Math.abs(f.effect) > Math.abs(prev.effect))
    ) {
      seen.set(key, f);
    }
  }
  return rankFindings([...seen.values()]);
}

export { BINARY_FACTORS };
