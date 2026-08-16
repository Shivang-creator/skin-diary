import { NextResponse } from "next/server";
import { getUnitBalance, getFeatureCosts, YouCamError } from "@/lib/youcam/client";
import { UNITS_PER_CAPTURE, CONCERNS } from "@/lib/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live unit accounting.
 *
 * Both upstream endpoints are free to call — they report the balance and
 * the price list, they do not run any AI task. Surfacing them means the
 * app can tell you what the next capture will cost BEFORE you spend it,
 * which is the difference between a metered API being a footgun and being
 * a budget you can actually manage.
 */
export async function GET() {
  const apiKey = process.env.YOUCAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      configured: false,
      costPerCapture: UNITS_PER_CAPTURE,
      concernCount: CONCERNS.length,
      balance: null,
      skus: [],
    });
  }

  try {
    const [balance, skus] = await Promise.all([
      getUnitBalance(apiKey),
      getFeatureCosts(apiKey).catch(() => []),
    ]);

    return NextResponse.json({
      configured: true,
      costPerCapture: UNITS_PER_CAPTURE,
      concernCount: CONCERNS.length,
      balance: balance.total,
      capturesRemaining: Math.floor(balance.total / UNITS_PER_CAPTURE),
      buckets: balance.buckets,
      skus: skus.filter((s) =>
        s.description.toLowerCase().includes("skin analysis"),
      ),
    });
  } catch (err) {
    const message =
      err instanceof YouCamError ? err.message : "Could not reach YouCam.";
    return NextResponse.json(
      {
        configured: true,
        error: message,
        costPerCapture: UNITS_PER_CAPTURE,
        concernCount: CONCERNS.length,
        balance: null,
        skus: [],
      },
      { status: 200 },
    );
  }
}
