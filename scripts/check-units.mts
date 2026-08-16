/**
 * Read-only unit check. Spends nothing.
 *
 *   YOUCAM_API_KEY=... npm run check:units
 */

import { getUnitBalance, getFeatureCosts, YouCamError } from "../src/lib/youcam/client";
import { CONCERNS, UNITS_PER_CAPTURE, UNIT_COST_TIERS } from "../src/lib/domain";

async function main() {
  const apiKey = process.env.YOUCAM_API_KEY;
  if (!apiKey) {
    console.log("\n  YOUCAM_API_KEY not set — nothing to check.");
    console.log("\n  Documented pricing for AI Skin Analysis (SD):");
    for (const t of UNIT_COST_TIERS) {
      console.log(`    ${String(t.units).padStart(3)} units  —  ${t.label}`);
    }
    console.log(
      `\n  Skin Diary requests ${CONCERNS.length} concerns => ${UNITS_PER_CAPTURE} units per capture.\n`,
    );
    return;
  }

  try {
    const balance = await getUnitBalance(apiKey);
    console.log(`\n  Balance: ${balance.total.toFixed(2)} units`);
    for (const b of balance.buckets) {
      const exp = b.expiry ? new Date(b.expiry).toISOString().slice(0, 10) : "no expiry";
      console.log(`    ${b.amount.toFixed(2).padStart(9)} units  expires ${exp}`);
    }
    console.log(
      `\n  At ${UNITS_PER_CAPTURE} units per capture: ${Math.floor(balance.total / UNITS_PER_CAPTURE)} captures remaining.`,
    );

    const skus = await getFeatureCosts(apiKey);
    const skin = skus.filter((s) => s.description.toLowerCase().includes("skin analysis"));
    if (skin.length) {
      console.log("\n  Live price list:");
      for (const s of skin) {
        console.log(`    ${String(s.amount).padStart(3)} units per ${s.unit}  —  ${s.description}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(
      `\n  ✗ ${err instanceof YouCamError ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
}

main();
