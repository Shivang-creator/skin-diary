/**
 * Capture ONE real YouCam response and freeze it as the dev fixture.
 *
 *   YOUCAM_API_KEY=... npm run capture:fixture -- ./selfie.jpg
 *
 * This is the only script in the repo that is expected to spend units:
 * exactly one analysis, 12 units, once. Everything else in the project
 * runs against the file it writes.
 *
 * It prints the unit balance before and after, so the true cost of the
 * call is observed rather than assumed.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
import {
  analyseImage,
  getUnitBalance,
  getFeatureCosts,
  YouCamError,
} from "../src/lib/youcam/client";
import { CONCERNS, UNITS_PER_CAPTURE } from "../src/lib/domain";

const FIXTURE_PATH = resolve(
  import.meta.dirname,
  "../src/lib/youcam/fixtures/skin-analysis-response.json",
);

function fail(msg: string): never {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

async function main() {
  const apiKey = process.env.YOUCAM_API_KEY;
  if (!apiKey) {
    fail(
      "YOUCAM_API_KEY is not set.\n    Get a key from https://yce.perfectcorp.com/api-console/en/api-keys/\n    then run:  YOUCAM_API_KEY=... npm run capture:fixture -- ./selfie.jpg",
    );
  }

  const imagePath = process.argv[2];
  if (!imagePath) {
    fail(
      "No image supplied.\n    Usage: npm run capture:fixture -- ./selfie.jpg\n\n    The photo must be a front-facing selfie where the face fills more\n    than 60% of the image width, short side >= 480px, under 10MB.",
    );
  }

  const ext = extname(imagePath).toLowerCase();
  const contentType =
    ext === ".png" ? ("image/png" as const) : ("image/jpeg" as const);

  const bytes = new Uint8Array(await readFile(resolve(imagePath)));
  console.log(
    `\n  Image: ${basename(imagePath)} (${(bytes.length / 1024).toFixed(0)} KB, ${contentType})`,
  );

  /* ---- Price list & balance BEFORE ---- */
  console.log("\n  Checking price list and balance (these calls are free)...");

  const skus = await getFeatureCosts(apiKey).catch(() => []);
  const skinSkus = skus.filter((s) =>
    s.description.toLowerCase().includes("skin analysis"),
  );
  if (skinSkus.length) {
    console.log("\n  YouCam AI Skin Analysis pricing:");
    for (const s of skinSkus) {
      console.log(`    ${s.amount} units per ${s.unit}  —  ${s.description}`);
    }
  }

  const before = await getUnitBalance(apiKey);
  console.log(`\n  Balance before: ${before.total.toFixed(2)} units`);
  console.log(
    `  This call requests ${CONCERNS.length} SD concerns, expected cost ${UNITS_PER_CAPTURE} units.`,
  );
  console.log(`  Concerns: ${CONCERNS.join(", ")}`);

  /* ---- The one real call ---- */
  console.log("\n  Running the real pipeline (upload -> task -> poll)...");
  let result;
  try {
    result = await analyseImage(
      apiKey,
      bytes,
      contentType,
      `fixture-capture${ext || ".jpg"}`,
      CONCERNS,
    );
  } catch (err) {
    if (err instanceof YouCamError) {
      fail(
        `${err.message}\n    (code: ${err.code})\n\n    No units were consumed — YouCam only charges on a successful result.`,
      );
    }
    throw err;
  }

  console.log(`  ✓ task_id ${result.taskId}`);
  console.log(`  ✓ completed in ${(result.elapsedMs / 1000).toFixed(1)}s\n`);

  console.log("  Scores returned (raw_score, 1-100, higher = healthier):");
  for (const c of CONCERNS) {
    const raw = result.scores[c];
    const ui = result.uiScores[c];
    console.log(
      `    ${c.padEnd(16)} raw ${raw !== undefined ? raw.toFixed(2).padStart(6) : "  —  "}   ui ${ui ?? "—"}`,
    );
  }
  console.log(`    ${"overall (all)".padEnd(16)} ${result.overall ?? "—"}`);
  console.log(`    ${"skin_age".padEnd(16)} ${result.skinAge ?? "—"}`);

  /* ---- Balance AFTER ---- */
  const after = await getUnitBalance(apiKey);
  const spent = before.total - after.total;
  console.log(`\n  Balance after:  ${after.total.toFixed(2)} units`);
  console.log(`  Units consumed by this call: ${spent.toFixed(2)}`);
  console.log(
    `  Captures remaining at ${UNITS_PER_CAPTURE} units each: ${Math.floor(after.total / UNITS_PER_CAPTURE)}`,
  );

  /* ---- Freeze the fixture ---- */
  const fixture = {
    _provenance: {
      capturedFrom: "live-api",
      note: "Genuine captured response from the YouCam AI Skin Analysis API. Mask URLs expire after 24 hours and the scores belong to whoever's photo was submitted; only the shape and the numbers are used by the app.",
      endpoint: "GET /s2s/v2.0/task/skin-analysis/{task_id}",
      dstActions: [...CONCERNS],
      unitsConsumed: Number(spent.toFixed(2)),
      capturedAt: new Date().toISOString(),
    },
    status: 200,
    data: {
      task_status: "success",
      results: { output: result.raw },
    },
  };

  await writeFile(FIXTURE_PATH, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`\n  ✓ Fixture written to ${FIXTURE_PATH}\n`);
}

main().catch((err) => {
  // A raw stack trace here would be the first thing a new contributor
  // sees when their key is wrong. Map the known cases to something
  // actionable and keep the stack for genuine surprises.
  if (err instanceof YouCamError) {
    fail(`${err.message}\n    (code: ${err.code}${err.httpStatus ? `, HTTP ${err.httpStatus}` : ""})`);
  }
  console.error(err);
  process.exit(1);
});
