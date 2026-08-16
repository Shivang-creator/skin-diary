/**
 * Statistical distribution functions.
 *
 * Hand-rolled rather than pulled from a library so the whole inference
 * path is auditable in-repo, and so every p-value Skin Diary prints can
 * be traced to code that is unit-tested against known reference values
 * (scipy / standard statistical tables).
 *
 * No dependencies, no LLM, fully deterministic.
 */

/** Lanczos approximation to log Γ(x), accurate to ~15 significant digits. */
export function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    // Reflection formula.
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
    );
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Continued fraction for the incomplete beta function,
 * evaluated with the modified Lentz algorithm.
 */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITER = 300;
  const EPS = 3e-16;
  const TINY = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    // Even step.
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    // Odd step.
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const front =
    Math.exp(
      logGamma(a + b) -
        logGamma(a) -
        logGamma(b) +
        a * Math.log(x) +
        b * Math.log(1 - x),
    );

  // The continued fraction converges quickly only for x < (a+1)/(a+b+2);
  // otherwise use the symmetry I_x(a,b) = 1 - I_{1-x}(b,a).
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(a, b, x)) / a;
  }
  return 1 - (
    Math.exp(
      logGamma(a + b) -
        logGamma(a) -
        logGamma(b) +
        b * Math.log(1 - x) +
        a * Math.log(x),
    ) *
      betaContinuedFraction(b, a, 1 - x)
  ) / b;
}

/**
 * Two-tailed p-value for a Student's t statistic with `df` degrees of
 * freedom: P(|T| >= |t|).
 */
export function studentTTwoTailed(t: number, df: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return NaN;
  const x = df / (df + t * t);
  const p = incompleteBeta(df / 2, 0.5, x);
  // Guard against tiny floating point overshoot.
  return Math.min(1, Math.max(0, p));
}

/** Cumulative distribution function of Student's t. */
export function studentTCdf(t: number, df: number): number {
  const half = studentTTwoTailed(t, df) / 2;
  return t >= 0 ? 1 - half : half;
}
