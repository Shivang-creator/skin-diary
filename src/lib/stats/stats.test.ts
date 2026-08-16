import { describe, it, expect } from "vitest";
import {
  logGamma,
  incompleteBeta,
  studentTTwoTailed,
  studentTCdf,
} from "./distributions";
import {
  mean,
  variance,
  stdDev,
  median,
  pearson,
  rank,
  spearman,
  correlationTest,
  partialCorrelation,
  welchTTest,
  benjaminiHochberg,
  classifyConfidence,
} from "./correlation";

/**
 * Reference values in this file come from two independent sources:
 *
 *  1. Closed-form identities (Γ(n) = (n-1)!, the Cauchy CDF, the
 *     arcsine form of I_x(½,½), I_x(1,1) = x).
 *  2. An independent Python implementation of the regularised incomplete
 *     beta by adaptive Simpson integration of the beta density — a
 *     completely different algorithm from the Lentz continued fraction
 *     used in distributions.ts, so agreement is a real cross-check
 *     rather than a restatement.
 */

const CLOSE = 1e-9;

describe("logGamma", () => {
  it("reproduces factorials: Γ(n) = (n-1)!", () => {
    expect(Math.exp(logGamma(1))).toBeCloseTo(1, 9);
    expect(Math.exp(logGamma(2))).toBeCloseTo(1, 9);
    expect(Math.exp(logGamma(5))).toBeCloseTo(24, 7);
    expect(Math.exp(logGamma(9))).toBeCloseTo(40320, 3);
  });

  it("reproduces Γ(½) = √π", () => {
    expect(Math.exp(logGamma(0.5))).toBeCloseTo(Math.sqrt(Math.PI), 9);
  });

  it("handles the reflection branch for x < ½", () => {
    // Γ(0.25)Γ(0.75) = π / sin(π/4)
    const lhs = Math.exp(logGamma(0.25) + logGamma(0.75));
    expect(lhs).toBeCloseTo(Math.PI / Math.sin(Math.PI / 4), 8);
  });
});

describe("incompleteBeta", () => {
  it("I_x(1,1) = x", () => {
    for (const x of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(incompleteBeta(1, 1, x)).toBeCloseTo(x, 12);
    }
  });

  it("matches the arcsine closed form I_x(½,½) = (2/π)·asin(√x)", () => {
    for (const x of [0.05, 0.2, 0.5, 0.8, 0.99]) {
      const expected = (2 / Math.PI) * Math.asin(Math.sqrt(x));
      expect(incompleteBeta(0.5, 0.5, x)).toBeCloseTo(expected, 10);
    }
  });

  it("satisfies the symmetry I_x(a,b) = 1 - I_{1-x}(b,a)", () => {
    const cases: Array<[number, number, number]> = [
      [2, 5, 0.3],
      [7.5, 0.5, 0.62],
      [0.5, 10, 0.11],
    ];
    for (const [a, b, x] of cases) {
      expect(incompleteBeta(a, b, x)).toBeCloseTo(
        1 - incompleteBeta(b, a, 1 - x),
        10,
      );
    }
  });

  it("clamps outside [0,1]", () => {
    expect(incompleteBeta(2, 3, 0)).toBe(0);
    expect(incompleteBeta(2, 3, 1)).toBe(1);
    expect(incompleteBeta(2, 3, -0.5)).toBe(0);
    expect(incompleteBeta(2, 3, 1.5)).toBe(1);
  });
});

describe("studentTTwoTailed", () => {
  it("matches the independent Simpson-integration reference", () => {
    expect(studentTTwoTailed(2.0, 10)).toBeCloseTo(0.0733880348, 9);
    expect(studentTTwoTailed(2.228, 10)).toBeCloseTo(0.0500117718, 9);
    expect(studentTTwoTailed(3.0, 20)).toBeCloseTo(0.0070758988, 9);
    expect(studentTTwoTailed(0.5, 3)).toBeCloseTo(0.6514479648, 9);
    expect(studentTTwoTailed(4.5, 7)).toBeCloseTo(0.0027983301, 9);
  });

  it("matches the exact closed form at df = 2", () => {
    // For df=2, F(t) = ½ + t / (2·√(2+t²)) exactly.
    const cdf2 = (t: number) => 0.5 + t / (2 * Math.sqrt(2 + t * t));
    for (const t of [0.5, 1.5, 3.0, 7.25]) {
      expect(studentTTwoTailed(t, 2)).toBeCloseTo(2 * (1 - cdf2(t)), 11);
    }
  });

  it("matches the exact closed form at df = 3", () => {
    // For df=3, F(t) = ½ + (1/π)·[ (t/√3)/(1 + t²/3) + atan(t/√3) ].
    const cdf3 = (t: number) => {
      const u = t / Math.sqrt(3);
      return 0.5 + (1 / Math.PI) * (u / (1 + (t * t) / 3) + Math.atan(u));
    };
    for (const t of [0.5, 1.2, 2.5, 6.0]) {
      expect(studentTTwoTailed(t, 3)).toBeCloseTo(2 * (1 - cdf3(t)), 11);
    }
  });

  it("matches the Cauchy closed form at df = 1", () => {
    // df=1 is the Cauchy distribution: P(|T| >= 1) = 1/2 exactly.
    expect(studentTTwoTailed(1, 1)).toBeCloseTo(0.5, 10);
    // P(|T| >= t) = 1 - (2/π)·atan(t)
    for (const t of [0.5, 2, 5]) {
      expect(studentTTwoTailed(t, 1)).toBeCloseTo(
        1 - (2 / Math.PI) * Math.atan(t),
        10,
      );
    }
  });

  it("reproduces the classic two-tailed 5% critical values", () => {
    // Standard t-table: these t values sit at p = 0.05.
    expect(studentTTwoTailed(12.706, 1)).toBeCloseTo(0.05, 4);
    expect(studentTTwoTailed(2.086, 20)).toBeCloseTo(0.05, 4);
    expect(studentTTwoTailed(1.96, 100000)).toBeCloseTo(0.05, 4);
  });

  it("is symmetric in the sign of t and monotone decreasing in |t|", () => {
    expect(studentTTwoTailed(-2.3, 9)).toBeCloseTo(
      studentTTwoTailed(2.3, 9),
      12,
    );
    expect(studentTTwoTailed(0, 9)).toBeCloseTo(1, 10);
    expect(studentTTwoTailed(1, 9)).toBeGreaterThan(studentTTwoTailed(2, 9));
    expect(studentTTwoTailed(2, 9)).toBeGreaterThan(studentTTwoTailed(3, 9));
  });

  it("returns NaN for nonsense degrees of freedom", () => {
    expect(studentTTwoTailed(2, 0)).toBeNaN();
    expect(studentTTwoTailed(2, -3)).toBeNaN();
    expect(studentTTwoTailed(NaN, 5)).toBeNaN();
  });
});

describe("studentTCdf", () => {
  it("is 0.5 at t = 0 and complementary about the origin", () => {
    expect(studentTCdf(0, 7)).toBeCloseTo(0.5, 10);
    expect(studentTCdf(1.5, 7) + studentTCdf(-1.5, 7)).toBeCloseTo(1, 10);
  });
});

describe("descriptive statistics", () => {
  it("computes mean, variance, sd, median", () => {
    const xs = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(xs)).toBe(5);
    // Sample variance (n-1): sum of squared deviations = 32, /7
    expect(variance(xs)).toBeCloseTo(32 / 7, 12);
    expect(stdDev(xs)).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(median(xs)).toBe(4.5);
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns NaN rather than a fake number on empty/singleton input", () => {
    expect(mean([])).toBeNaN();
    expect(variance([5])).toBeNaN();
    expect(median([])).toBeNaN();
  });
});

describe("pearson", () => {
  it("matches a hand-computed value", () => {
    // x=[1..5], y=[2,4,5,4,5]: Sxy=6, Sxx=10, Syy=6 -> 6/sqrt(60)
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(
      6 / Math.sqrt(60),
      12,
    );
    expect(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(
      0.7745966692,
      9,
    );
  });

  it("is +1 / -1 on perfectly linear data", () => {
    expect(pearson([1, 2, 3, 4], [3, 5, 7, 9])).toBeCloseTo(1, 12);
    expect(pearson([1, 2, 3, 4], [9, 7, 5, 3])).toBeCloseTo(-1, 12);
  });

  it("is invariant to positive affine rescaling", () => {
    const x = [4, 8, 15, 16, 23, 42];
    const y = [1, 3, 2, 5, 4, 9];
    const scaled = y.map((v) => v * 7.5 + 100);
    expect(pearson(x, scaled)).toBeCloseTo(pearson(x, y), 12);
  });

  it("returns NaN when a series has zero variance", () => {
    // A flat series has no correlation *defined* -- reporting 0 would be
    // a claim we cannot support.
    expect(pearson([1, 1, 1, 1], [1, 2, 3, 4])).toBeNaN();
  });

  it("throws on mismatched lengths rather than silently truncating", () => {
    expect(() => pearson([1, 2, 3], [1, 2])).toThrow();
  });
});

describe("rank", () => {
  it("assigns 1-based ranks", () => {
    expect(rank([10, 30, 20])).toEqual([1, 3, 2]);
  });

  it("averages tied ranks (midranks)", () => {
    expect(rank([2, 4, 5, 4, 5])).toEqual([1, 2.5, 4.5, 2.5, 4.5]);
    expect(rank([7, 7, 7, 7])).toEqual([2.5, 2.5, 2.5, 2.5]);
  });
});

describe("spearman", () => {
  it("matches a hand-computed tied-rank value", () => {
    // ranks: x=[1..5], y=[1,2.5,4.5,2.5,4.5] -> 7/sqrt(90)
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 5, 4, 5])).toBeCloseTo(
      7 / Math.sqrt(90),
      12,
    );
  });

  it("is 1 for any monotone increasing relationship, even a nonlinear one", () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = x.map((v) => Math.exp(v)); // wildly nonlinear, perfectly monotone
    expect(spearman(x, y)).toBeCloseTo(1, 12);
    // Pearson does NOT see this as perfect -- which is exactly why Skin
    // Diary defaults to Spearman.
    expect(pearson(x, y)).toBeLessThan(0.95);
  });

  it("resists a wild outlier that Pearson cannot", () => {
    // The relationship is still perfectly monotone; only the magnitude of
    // the last reading is extreme. Spearman sees the intact ordering,
    // Pearson is dragged badly off.
    const x = [1, 2, 3, 4, 5, 6, 7, 8];
    const yOutlier = [1, 2, 3, 4, 5, 6, 7, 500];
    expect(spearman(x, yOutlier)).toBeCloseTo(1, 12);
    expect(pearson(x, yOutlier)).toBeCloseTo(0.5866242196, 9);
    expect(Math.abs(spearman(x, yOutlier))).toBeGreaterThan(
      Math.abs(pearson(x, yOutlier)),
    );
  });

  it("matches an independent implementation on real-shaped data", () => {
    const X = [5, 7, 8, 7, 2, 17, 2, 9, 4, 11, 12, 9, 6];
    const Y = [99, 86, 87, 88, 111, 86, 103, 87, 94, 78, 77, 85, 86];
    expect(spearman(X, Y)).toBeCloseTo(-0.8375032311, 9);
    expect(pearson(X, Y)).toBeCloseTo(-0.7585915244, 9);
  });
});

describe("correlationTest", () => {
  it("computes t = r·sqrt(df/(1-r²)) and its two-tailed p", () => {
    const res = correlationTest(0.5, 20);
    expect(res.df).toBe(18);
    expect(res.t).toBeCloseTo(0.5 * Math.sqrt(18 / 0.75), 12);
    expect(res.p).toBeCloseTo(studentTTwoTailed(res.t, 18), 12);
  });

  it("reports a weak correlation over few points as non-significant", () => {
    // r = 0.5 with n = 5 is nothing -- p must be nowhere near 0.05.
    expect(correlationTest(0.5, 5).p).toBeGreaterThan(0.3);
  });

  it("reports the same r over many points as significant", () => {
    expect(correlationTest(0.5, 60).p).toBeLessThan(0.0001);
  });

  it("handles the degenerate perfect and undersized cases", () => {
    expect(correlationTest(1, 10).p).toBe(0);
    expect(correlationTest(-1, 10).p).toBe(0);
    expect(correlationTest(0.9, 2).p).toBeNaN(); // df = 0
    expect(correlationTest(NaN, 30).p).toBeNaN();
  });
});

describe("partialCorrelation", () => {
  const X = [5, 7, 8, 7, 2, 17, 2, 9, 4, 11, 12, 9, 6];
  const Y = [99, 86, 87, 88, 111, 86, 103, 87, 94, 78, 77, 85, 86];
  const Z = [1, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12];

  it("matches an independent implementation of the standard formula", () => {
    const res = partialCorrelation(X, Y, Z);
    expect(res.r).toBeCloseTo(-0.8153306825, 9);
    expect(res.n).toBe(13);
    expect(res.df).toBe(10); // n - 3, one extra estimated parameter
    expect(res.t).toBeCloseTo(-4.4530599286, 8);
    expect(res.p).toBeLessThan(0.005);
  });

  it("strips out a confound: a correlation driven entirely by z collapses", () => {
    // y is a pure function of z; x is z plus jitter. The raw x~y
    // correlation is strong and completely spurious.
    const z = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    const jitter = [0.4, -0.3, 0.5, -0.6, 0.2, -0.2, 0.6, -0.5, 0.3, -0.4, 0.1, -0.1, 0.45, -0.45];
    const x = z.map((v, i) => v + jitter[i]);
    const y = z.map((v, i) => v * 2 + jitter[(i + 7) % jitter.length] * 6);

    const raw = spearman(x, y);
    const partial = partialCorrelation(x, y, z);

    // Raw: a near-perfect relationship between x and y.
    expect(Math.abs(raw)).toBeGreaterThan(0.9);
    // Once z is held constant, most of it evaporates -- it was z all along.
    expect(Math.abs(partial.r)).toBeLessThan(Math.abs(raw) - 0.35);
    expect(partial.r).toBeCloseTo(-0.5079527265, 9);
  });

  it("returns NaN when the control is perfectly collinear with a variable", () => {
    // If z explains y exactly, "holding z constant" leaves nothing to
    // measure. NaN is the honest answer; 0 would be a claim.
    const z = [1, 2, 3, 4, 5, 6, 7, 8];
    const y = z.map((v) => v * 3);
    const x = [2, 1, 4, 3, 6, 5, 8, 7];
    expect(partialCorrelation(x, y, z).r).toBeNaN();
  });

  it("returns NaN when the control variable is degenerate", () => {
    const flat = [1, 1, 1, 1, 1, 1];
    const res = partialCorrelation([1, 2, 3, 4, 5, 6], [2, 4, 5, 4, 5, 7], flat);
    expect(res.r).toBeNaN();
  });
});

describe("welchTTest", () => {
  it("matches the reference on the standard two-sample example", () => {
    const A1 = [27.5, 21.0, 19.0, 23.6, 17.0, 17.9, 16.9, 20.1, 21.9, 22.6, 23.1, 19.6, 19.0, 21.7, 21.4];
    const A2 = [27.1, 22.0, 20.8, 23.4, 23.4, 23.5, 25.8, 22.0, 24.8, 20.2, 21.9, 22.1, 22.9, 20.5, 24.4];
    const res = welchTTest(A1, A2);
    expect(res.meanA).toBeCloseTo(20.82, 10);
    expect(res.meanB).toBeCloseTo(22.9866666667, 9);
    expect(res.t).toBeCloseTo(-2.4553563983, 9);
    expect(res.df).toBeCloseTo(24.9885292902, 8);
    expect(res.p).toBeCloseTo(0.0213780015, 8);
    expect(res.cohensD).toBeCloseTo(-0.8965693907, 9);
  });

  it("matches the reference on small unequal groups", () => {
    const g1 = [72.0, 68.5, 74.2, 70.1, 69.9, 73.3];
    const g2 = [64.1, 66.8, 62.0, 65.5, 67.2];
    const res = welchTTest(g1, g2);
    expect(res.nA).toBe(6);
    expect(res.nB).toBe(5);
    expect(res.t).toBeCloseTo(4.7544523332, 8);
    expect(res.df).toBeCloseTo(8.7468987095, 8);
    expect(res.p).toBeCloseTo(0.0011229685, 8);
    expect(res.cohensD).toBeCloseTo(2.8693453457, 8);
  });

  it("finds no difference between identical groups", () => {
    const g = [1, 2, 3, 4, 5, 6];
    const res = welchTTest(g, [...g]);
    expect(res.t).toBeCloseTo(0, 12);
    expect(res.p).toBeCloseTo(1, 10);
    expect(res.diff).toBeCloseTo(0, 12);
  });

  it("refuses to test groups too small to have a variance", () => {
    expect(welchTTest([1], [2, 3, 4]).p).toBeNaN();
    expect(welchTTest([], []).p).toBeNaN();
  });

  it("reports the sign of the difference as meanA - meanB", () => {
    const res = welchTTest([10, 11, 12, 13], [1, 2, 3, 4]);
    expect(res.diff).toBeCloseTo(9, 10);
    expect(res.t).toBeGreaterThan(0);
  });
});

describe("benjaminiHochberg", () => {
  it("reproduces the textbook 10-hypothesis example", () => {
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
    const q = benjaminiHochberg(p);
    const expected = [
      0.01, 0.04, 0.084, 0.084, 0.084, 0.1, 0.1057142857, 0.216, 0.216, 0.216,
    ];
    q.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  });

  it("keeps q in the input order, not sorted order", () => {
    const q = benjaminiHochberg([0.216, 0.001, 0.06]);
    expect(q[0]).toBeCloseTo(0.216, 9);
    expect(q[1]).toBeCloseTo(0.003, 9);
    expect(q[2]).toBeCloseTo(0.09, 9);
  });

  it("is monotone non-decreasing when read in p order", () => {
    const p = [0.002, 0.01, 0.03, 0.2, 0.5, 0.9, 0.91];
    const q = benjaminiHochberg(p);
    for (let i = 1; i < q.length; i++) {
      expect(q[i]).toBeGreaterThanOrEqual(q[i - 1] - CLOSE);
    }
  });

  it("never exceeds 1", () => {
    for (const v of benjaminiHochberg([0.9, 0.95, 0.99, 0.999])) {
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("penalises exactly as many tests as were actually run", () => {
    // The same p-value is far less impressive among 50 tests than alone.
    // Here the raw q for p=0.02 at rank 1 is 0.02*50/1 = 1.0, but the
    // monotonicity step pulls it down to the 0.6 ceiling set by the
    // larger p-values above it. Either way it is no longer "significant".
    const alone = benjaminiHochberg([0.02])[0];
    const amongMany = benjaminiHochberg([0.02, ...Array(49).fill(0.6)])[0];
    expect(alone).toBeCloseTo(0.02, 9);
    expect(amongMany).toBeCloseTo(0.6, 9);
    expect(amongMany).toBeGreaterThan(alone);
  });

  it("ignores NaN entries without shifting the others", () => {
    const q = benjaminiHochberg([0.01, NaN, 0.02]);
    expect(q[1]).toBeNaN();
    // Only 2 valid tests, so 0.01 -> 0.01*2/1 = 0.02
    expect(q[0]).toBeCloseTo(0.02, 9);
    expect(q[2]).toBeCloseTo(0.02, 9);
  });

  it("returns all-NaN for no valid input", () => {
    expect(benjaminiHochberg([]).length).toBe(0);
    expect(benjaminiHochberg([NaN, NaN]).every(Number.isNaN)).toBe(true);
  });
});

describe("classifyConfidence — the honesty gate", () => {
  it("refuses to speak below the minimum sample size, however big r looks", () => {
    // r = 0.95 over 5 points is noise, and must be labelled as such.
    expect(classifyConfidence(0.95, 5, 0.001)).toBe("insufficient");
    expect(classifyConfidence(0.99, 7, 0.0001)).toBe("insufficient");
    expect(classifyConfidence(0.99, 4, 0)).toBe("insufficient");
  });

  it("reports no signal when the corrected q-value is unconvincing", () => {
    expect(classifyConfidence(0.6, 30, 0.2)).toBe("none");
    expect(classifyConfidence(0.6, 30, 0.1)).toBe("none");
    expect(classifyConfidence(0.6, 30, NaN)).toBe("none");
  });

  it("grades surviving signals by effect size", () => {
    expect(classifyConfidence(0.62, 30, 0.01)).toBe("strong");
    expect(classifyConfidence(-0.62, 30, 0.01)).toBe("strong");
    expect(classifyConfidence(0.4, 30, 0.02)).toBe("moderate");
    expect(classifyConfidence(0.15, 30, 0.02)).toBe("weak");
  });

  it("will not call a large effect strong on marginal evidence", () => {
    // |r| is big, but q sits between 0.05 and 0.10.
    expect(classifyConfidence(0.8, 30, 0.07)).toBe("moderate");
  });

  it("honours a caller-supplied minimum n", () => {
    expect(classifyConfidence(0.6, 12, 0.01, 20)).toBe("insufficient");
    expect(classifyConfidence(0.6, 25, 0.01, 20)).toBe("strong");
  });
});
