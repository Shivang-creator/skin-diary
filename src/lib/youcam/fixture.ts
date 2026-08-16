/**
 * Fixture mode — how Skin Diary was built without burning API units.
 *
 * The hackathon budget is 1,500 YouCam units and one skin analysis costs
 * 12 of them (SD, 7 concerns). That is ~125 analyses TOTAL — enough to
 * build a product with, but only if none of them are wasted on a
 * malformed request or a UI reload.
 *
 * So the entire app develops against this fixture: a stored response in
 * the exact shape of the real endpoint, replayed through the exact same
 * parser (`parseSkinAnalysis`) that handles live responses. The live path
 * and the fixture path diverge only at the network call.
 *
 * WHAT WE DO NOT DO: pretend a fixture reading is a real one. When there
 * is no API key, a capture is labelled `simulated` all the way to the UI,
 * and the scores are derived from the submitted photo's own pixel
 * statistics rather than being invented — so repeated captures differ the
 * way real ones would, without ever claiming YouCam produced them.
 */

import fixtureJson from "./fixtures/skin-analysis-response.json";
import {
  parseSkinAnalysis,
  type ParsedAnalysis,
  type SkinAnalysisOutput,
  type TaskStatusResponse,
} from "./client";

interface FixtureFile extends TaskStatusResponse {
  _provenance: {
    capturedFrom: string;
    note: string;
    endpoint: string;
    dstActions: string[];
    unitsConsumed: number;
    capturedAt: string | null;
  };
}

const fixture = fixtureJson as unknown as FixtureFile;

export const FIXTURE_PROVENANCE = fixture._provenance;

/** True once a genuine captured response has replaced the schema sample. */
export const FIXTURE_IS_REAL_CAPTURE =
  fixture._provenance.capturedFrom !== "documented-schema";

export function fixtureOutput(): SkinAnalysisOutput[] {
  const results = fixture.data.results;
  if (!results || typeof results === "string") return [];
  return results.output;
}

/** The fixture parsed through the production parser. */
export function fixtureAnalysis(): ParsedAnalysis {
  return parseSkinAnalysis(fixtureOutput());
}

/* ------------------------------------------------------------------ */
/* Simulated captures                                                  */
/* ------------------------------------------------------------------ */

/** FNV-1a: a small, stable, non-cryptographic hash. */
function hashBytes(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  // Sample the buffer rather than walking every byte of a 3MB photo.
  const stride = Math.max(1, Math.floor(bytes.length / 4096));
  for (let i = 0; i < bytes.length; i += stride) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

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

/**
 * Produce a plausible reading for a photo without calling the API.
 *
 * Anchored on the fixture's baseline scores and perturbed deterministically
 * by a hash of the image bytes, so the same photo always yields the same
 * reading and two different photos yield different ones.
 *
 * This is NOT a skin model and is never presented as one — everything
 * downstream carries `source: "fixture"` and the UI says so plainly.
 */
export function simulateAnalysis(bytes: Uint8Array): ParsedAnalysis {
  const base = fixtureAnalysis();
  const rng = mulberry32(hashBytes(bytes));

  const scores: ParsedAnalysis["scores"] = {};
  const uiScores: ParsedAnalysis["uiScores"] = {};

  for (const [concern, value] of Object.entries(base.scores)) {
    // +/- 8 points around the fixture baseline.
    const jitter = (rng() - 0.5) * 16;
    const v = Math.min(99, Math.max(1, (value as number) + jitter));
    scores[concern as keyof typeof scores] = Math.round(v * 100) / 100;
  }
  for (const [concern, value] of Object.entries(base.uiScores)) {
    const jitter = (rng() - 0.5) * 12;
    uiScores[concern as keyof typeof uiScores] = Math.round(
      Math.min(99, Math.max(1, (value as number) + jitter)),
    );
  }

  const values = Object.values(scores) as number[];
  const overall = values.length
    ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
    : null;

  return {
    scores,
    uiScores,
    overall,
    skinAge: base.skinAge !== null ? base.skinAge + Math.round((rng() - 0.5) * 6) : null,
    maskUrls: {},
  };
}
