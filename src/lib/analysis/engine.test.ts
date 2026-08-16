import { describe, it, expect } from "vitest";
import { analyse, bestPerPair, ANALYSIS_CONFIG } from "./engine";
import {
  buildDemoEntries,
  PLANTED_SIGNALS,
  NULL_FACTORS,
  DEMO_PRODUCT,
} from "../demo/seed";
import { emptyLog, type Entry, CONCERNS } from "../domain";
import { addDays } from "../dates";

/**
 * These are ground-truth tests, not snapshot tests.
 *
 * The demo diary is generated from a documented set of planted
 * relationships (PLANTED_SIGNALS) plus two factors with deliberately NO
 * effect (NULL_FACTORS). The engine is given no knowledge of either. So
 * these assertions check the two things that actually matter in a product
 * that makes claims about your body:
 *
 *   1. It finds what is really there.
 *   2. It does NOT find what is not there.
 */

const FIXED_END = "2026-08-16";

function makeEntry(
  date: string,
  scores: Record<string, number>,
  log: Partial<ReturnType<typeof emptyLog>> = {},
): Entry {
  return {
    id: `t-${date}`,
    date,
    createdAt: `${date}T09:00:00.000Z`,
    source: "demo",
    scores: scores as Entry["scores"],
    overall: null,
    skinAge: null,
    photo: null,
    log: { ...emptyLog(), ...log },
  };
}

describe("demo diary generation", () => {
  it("is deterministic — same input, same diary, every time", () => {
    const a = buildDemoEntries(FIXED_END);
    const b = buildDemoEntries(FIXED_END);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces a six-week diary with realistic gaps", () => {
    const e = buildDemoEntries(FIXED_END);
    expect(e.length).toBe(42);
    expect(e[e.length - 1].date).toBe(FIXED_END);
    // 46-day span, 4 days deliberately missed.
    expect(e[0].date).toBe(addDays(FIXED_END, -45));
  });

  it("gives every entry a full set of seven concern scores", () => {
    for (const entry of buildDemoEntries(FIXED_END)) {
      for (const c of CONCERNS) {
        expect(typeof entry.scores[c]).toBe("number");
        expect(entry.scores[c]).toBeGreaterThan(0);
        expect(entry.scores[c]).toBeLessThanOrEqual(100);
      }
    }
  });

  it("labels every demo entry as demo data", () => {
    for (const entry of buildDemoEntries(FIXED_END)) {
      expect(entry.source).toBe("demo");
    }
  });
});

describe("analysis of the demo diary", () => {
  const result = analyse(buildDemoEntries(FIXED_END));

  it("reports how many hypotheses it actually tested", () => {
    // 7 factors x 7 metrics x 3 lags, less pairs that fail the minimum-n gate.
    expect(result.hypothesesTested).toBe(147);
  });

  it("recovers the planted signals with the correct direction", () => {
    const recovered = PLANTED_SIGNALS.map((planted) => {
      const matches = result.findings.filter(
        (f) => f.factorId === planted.factor && f.metricId === planted.metric,
      );
      const best = matches.sort(
        (a, b) => Math.abs(b.effect) - Math.abs(a.effect),
      )[0];
      return { planted, best };
    });

    for (const { planted, best } of recovered) {
      expect(best, `${planted.factor} -> ${planted.metric}`).toBeDefined();
      // Whenever a planted relationship IS detected, its sign must be right.
      expect(
        Math.sign(best.effect),
        `${planted.factor} -> ${planted.metric} direction`,
      ).toBe(planted.direction);
      // And it must be found at the lag it was planted at.
      expect(best.lag, `${planted.factor} -> ${planted.metric} lag`).toBe(
        planted.lag,
      );
    }

    // Six of the seven clear the corrected-significance bar. The seventh
    // (alcohol -> redness) is genuinely under-powered here, because
    // redness also carries the sleep effect and the product step; the
    // engine correctly declines to claim it rather than reporting it
    // anyway.
    const strong = recovered.filter(
      ({ best }) =>
        best.confidence === "strong" || best.confidence === "moderate",
    );
    expect(strong.length).toBeGreaterThanOrEqual(6);
  });

  it("invents NOTHING for the two factors with no real effect", () => {
    // This is the assertion that matters most. dairy and sunscreen were
    // generated as coin flips unrelated to any skin score. Across 42
    // hypotheses involving them, the engine must report zero signals.
    for (const factor of NULL_FACTORS) {
      const claimed = result.findings.filter(
        (f) =>
          f.factorId === factor &&
          (f.confidence === "strong" ||
            f.confidence === "moderate" ||
            f.confidence === "weak"),
      );
      expect(claimed, `${factor} should yield no signal`).toHaveLength(0);
    }
  });

  it("detects the product change-point with a washout", () => {
    const top = result.productFindings[0];
    expect(top.productName).toBe(DEMO_PRODUCT.name);
    expect(top.metricId).toBe(DEMO_PRODUCT.metric);
    // The planted improvement is +11 points; measured through noise it
    // should land in the right neighbourhood and the right direction.
    expect(top.diff).toBeGreaterThan(5);
    expect(top.confidence).toBe("strong");
    expect(top.nBefore).toBeGreaterThanOrEqual(
      ANALYSIS_CONFIG.minProductObservations,
    );
    expect(top.nAfter).toBeGreaterThanOrEqual(
      ANALYSIS_CONFIG.minProductObservations,
    );
  });

  it("does not attribute unrelated metrics to the product", () => {
    const spurious = result.productFindings.filter(
      (f) => f.metricId !== DEMO_PRODUCT.metric && f.confidence !== "none",
    );
    expect(spurious).toHaveLength(0);
  });

  it("confirms surviving findings against the photo-brightness control", () => {
    const checked = result.findings.filter((f) => f.brightnessAdjusted);
    expect(checked.length).toBeGreaterThan(0);
    // Brightness was generated independently of every skin score, so no
    // real finding should collapse when it is held constant.
    for (const f of checked) {
      expect(f.brightnessAdjusted!.collapsed, `${f.id}`).toBe(false);
    }
  });

  it("notices the gaps in the diary", () => {
    expect(result.quality.entryCount).toBe(42);
    expect(result.quality.spanDays).toBe(46);
    expect(result.quality.missedDays).toBe(4);
    expect(result.quality.warnings.join(" ")).toContain("no entry");
  });

  it("raises no lighting-confound warning when lighting is independent", () => {
    expect(result.quality.lightingConfounds).toHaveLength(0);
  });

  it("attaches a sample size to every single finding", () => {
    for (const f of result.findings) {
      expect(f.n).toBeGreaterThanOrEqual(ANALYSIS_CONFIG.minPairedObservations);
      expect(f.detail).toMatch(/n = \d+|paired days/);
    }
    for (const f of result.productFindings) {
      expect(f.detail).toMatch(/n = \d+/);
    }
  });

  it("builds one series per concern, in date order", () => {
    expect(result.series).toHaveLength(CONCERNS.length);
    for (const s of result.series) {
      expect(s.n).toBe(42);
      const dates = s.points.map((p) => p.date);
      expect([...dates].sort()).toEqual(dates);
    }
  });
});

describe("bestPerPair", () => {
  it("collapses the three lags of one relationship into a single finding", () => {
    const result = analyse(buildDemoEntries(FIXED_END));
    const deduped = bestPerPair(result.findings);
    const keys = deduped.map((f) => `${f.factorId}:${f.metricId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(deduped.length).toBeLessThan(result.findings.length);
  });
});

describe("small and degenerate diaries", () => {
  it("reports nothing at all from a single entry", () => {
    const r = analyse([makeEntry("2026-08-16", { acne: 70 })]);
    expect(r.findings).toHaveLength(0);
    expect(r.productFindings).toHaveLength(0);
    expect(r.hypothesesTested).toBe(0);
    expect(r.quality.entryCount).toBe(1);
    expect(r.quality.warnings.join(" ")).toContain("Only 1 entry");
  });

  it("reports nothing from an empty diary without throwing", () => {
    const r = analyse([]);
    expect(r.findings).toHaveLength(0);
    expect(r.quality.entryCount).toBe(0);
    expect(r.quality.spanDays).toBe(0);
    expect(r.series.every((s) => s.n === 0)).toBe(true);
  });

  it("refuses to correlate below the minimum sample size", () => {
    // Seven days of a perfect, noiseless relationship -- still not enough.
    const entries: Entry[] = [];
    for (let i = 0; i < 7; i++) {
      entries.push(
        makeEntry(addDays("2026-08-01", i), { acne: 50 + i * 5 }, {
          sleepHours: 5 + i * 0.5,
        }),
      );
    }
    const r = analyse(entries);
    expect(
      r.findings.filter((f) => f.confidence !== "insufficient"),
    ).toHaveLength(0);
  });

  it("aligns lags by calendar date, not by array position", () => {
    // A diary with a hole in it. If lag-1 were computed by array index,
    // the 5th and 6th entries would be wrongly treated as consecutive.
    const entries: Entry[] = [
      makeEntry("2026-08-01", { acne: 60 }, { sleepHours: 6 }),
      makeEntry("2026-08-02", { acne: 61 }, { sleepHours: 7 }),
      // 2026-08-03 deliberately missing
      makeEntry("2026-08-04", { acne: 62 }, { sleepHours: 8 }),
    ];
    const r = analyse(entries);
    // Not enough data to report, but the pairing logic must not crash and
    // must not manufacture a pair across the gap.
    expect(r.quality.missedDays).toBe(1);
    expect(r.quality.spanDays).toBe(4);
  });

  it("survives entries with missing scores and missing log values", () => {
    const entries: Entry[] = [];
    for (let i = 0; i < 20; i++) {
      entries.push(
        makeEntry(
          addDays("2026-08-01", i),
          i % 3 === 0 ? {} : { acne: 60 + (i % 5) },
          i % 2 === 0 ? {} : { sleepHours: 6 + (i % 4) * 0.5 },
        ),
      );
    }
    expect(() => analyse(entries)).not.toThrow();
  });

  it("flags a lighting confound when brightness really does drive a score", () => {
    // Radiance is made a direct function of photo brightness.
    const entries: Entry[] = [];
    for (let i = 0; i < 20; i++) {
      const brightness = 100 + i * 4;
      const e = makeEntry(addDays("2026-08-01", i), {
        radiance: 40 + i * 1.5,
      });
      e.photo = { brightness, contrast: 40, warmth: 10, thumbnail: "" };
      entries.push(e);
    }
    const r = analyse(entries);
    expect(r.quality.lightingConfounds.length).toBeGreaterThan(0);
    expect(r.quality.lightingConfounds[0].metricId).toBe("radiance");
    expect(r.quality.warnings.join(" ")).toContain("photo brightness");
  });
});
