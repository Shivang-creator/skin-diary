import { describe, it, expect } from "vitest";
import { parseSkinAnalysis, type SkinAnalysisOutput } from "./client";
import {
  fixtureAnalysis,
  fixtureOutput,
  simulateAnalysis,
  FIXTURE_PROVENANCE,
} from "./fixture";
import { CONCERNS, unitCostFor, UNITS_PER_CAPTURE } from "../domain";

/**
 * The parser is the seam between YouCam's wire format and everything
 * else. Its output shape is polymorphic — score-bearing concerns, a
 * region-split concern, a bare `score` for `all` and `skin_age`, a string
 * for `skin_type` — so it is worth testing directly rather than only
 * through a live call we cannot afford to repeat.
 */

describe("parseSkinAnalysis", () => {
  it("extracts raw and ui scores for tracked concerns", () => {
    const out: SkinAnalysisOutput[] = [
      { type: "acne", raw_score: 78.41, ui_score: 82 },
      { type: "redness", raw_score: 66.92, ui_score: 74 },
    ];
    const parsed = parseSkinAnalysis(out);
    expect(parsed.scores.acne).toBe(78.41);
    expect(parsed.scores.redness).toBe(66.92);
    expect(parsed.uiScores.acne).toBe(82);
  });

  it("reads the composite and skin age from their bare `score` field", () => {
    const parsed = parseSkinAnalysis([
      { type: "all", score: 66.64 },
      { type: "skin_age", score: 29 },
    ]);
    expect(parsed.overall).toBe(66.64);
    expect(parsed.skinAge).toBe(29);
  });

  it("keeps the whole-face region and discards sub-regions", () => {
    // A crop that shifts between days would make region readings
    // incomparable, so only `whole` is stored.
    const parsed = parseSkinAnalysis([
      { type: "acne", region: "whole", raw_score: 70 },
      { type: "acne", region: "forehead", raw_score: 40 },
      { type: "acne", region: "nose", raw_score: 20 },
    ]);
    expect(parsed.scores.acne).toBe(70);
  });

  it("ignores concerns Slept On does not track", () => {
    const parsed = parseSkinAnalysis([
      { type: "wrinkle", raw_score: 50 },
      { type: "firmness", raw_score: 55 },
      { type: "hd_pore", region: "whole", raw_score: 60 },
      { type: "acne", raw_score: 70 },
    ]);
    expect(Object.keys(parsed.scores)).toEqual(["acne"]);
  });

  it("ignores non-score rows like resize_image", () => {
    const parsed = parseSkinAnalysis([
      { type: "resize_image", mask_urls: ["https://example.com/x.jpg"] },
      { type: "acne", raw_score: 70 },
    ]);
    expect(Object.keys(parsed.scores)).toEqual(["acne"]);
    expect(parsed.overall).toBeNull();
  });

  it("captures the first mask URL per concern", () => {
    const parsed = parseSkinAnalysis([
      {
        type: "redness",
        raw_score: 60,
        mask_urls: ["https://example.com/a.png", "https://example.com/b.png"],
      },
    ]);
    expect(parsed.maskUrls.redness).toBe("https://example.com/a.png");
  });

  it("returns empty structures for an empty output without throwing", () => {
    const parsed = parseSkinAnalysis([]);
    expect(parsed.scores).toEqual({});
    expect(parsed.overall).toBeNull();
    expect(parsed.skinAge).toBeNull();
  });

  it("skips rows missing the score field rather than storing undefined", () => {
    const parsed = parseSkinAnalysis([
      { type: "acne" },
      { type: "redness", raw_score: 60 },
    ]);
    expect("acne" in parsed.scores).toBe(false);
    expect(parsed.scores.redness).toBe(60);
  });
});

describe("the dev fixture", () => {
  it("declares where it came from", () => {
    expect(FIXTURE_PROVENANCE.endpoint).toBe(
      "GET /s2s/v2.0/task/skin-analysis/{task_id}",
    );
    expect(FIXTURE_PROVENANCE.dstActions).toEqual([...CONCERNS]);
  });

  it("parses through the production parser and yields all seven concerns", () => {
    // This is the check that keeps fixture mode honest: the stored
    // response must survive exactly the code path a live response takes.
    const parsed = fixtureAnalysis();
    for (const c of CONCERNS) {
      expect(typeof parsed.scores[c], c).toBe("number");
      expect(parsed.scores[c]).toBeGreaterThan(0);
      expect(parsed.scores[c]).toBeLessThanOrEqual(100);
    }
    expect(parsed.overall).not.toBeNull();
    expect(parsed.skinAge).not.toBeNull();
  });

  it("contains the rows a real response contains", () => {
    const types = new Set(fixtureOutput().map((o) => o.type));
    expect(types.has("all")).toBe(true);
    expect(types.has("skin_age")).toBe(true);
    for (const c of CONCERNS) expect(types.has(c), c).toBe(true);
  });
});

describe("simulated captures", () => {
  const imgA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const imgB = new Uint8Array([250, 249, 248, 247, 246, 245, 244, 243, 242, 1]);

  it("is deterministic for the same image", () => {
    expect(simulateAnalysis(imgA)).toEqual(simulateAnalysis(imgA));
  });

  it("differs between different images", () => {
    expect(simulateAnalysis(imgA).scores).not.toEqual(
      simulateAnalysis(imgB).scores,
    );
  });

  it("stays inside the valid score range", () => {
    for (const img of [imgA, imgB]) {
      const parsed = simulateAnalysis(img);
      for (const c of CONCERNS) {
        expect(parsed.scores[c]).toBeGreaterThanOrEqual(1);
        expect(parsed.scores[c]).toBeLessThanOrEqual(99);
      }
    }
  });

  it("produces a value for every tracked concern", () => {
    const parsed = simulateAnalysis(imgA);
    expect(Object.keys(parsed.scores).sort()).toEqual([...CONCERNS].sort());
  });
});

describe("unit pricing", () => {
  it("uses YouCam's documented SD tiers", () => {
    expect(unitCostFor(1)).toBe(9);
    expect(unitCostFor(4)).toBe(9);
    expect(unitCostFor(5)).toBe(12);
    expect(unitCostFor(7)).toBe(12);
  });

  it("refuses to guess a price above the documented tiers", () => {
    expect(unitCostFor(8)).toBeNaN();
  });

  it("prices a Slept On capture at the top of the second tier", () => {
    expect(CONCERNS.length).toBe(7);
    expect(UNITS_PER_CAPTURE).toBe(12);
  });

  it("means a 1,500-unit budget buys 125 captures", () => {
    expect(Math.floor(1500 / UNITS_PER_CAPTURE)).toBe(125);
  });
});
