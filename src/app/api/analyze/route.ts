import { NextResponse } from "next/server";
import {
  analyseImage,
  YouCamError,
  type ParsedAnalysis,
} from "@/lib/youcam/client";
import { simulateAnalysis } from "@/lib/youcam/fixture";
import { CONCERNS, UNITS_PER_CAPTURE } from "@/lib/domain";

export const runtime = "nodejs";
/** A live analysis is a multi-step upload + poll; give it room. */
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024; // YouCam's documented limit.

export interface AnalyzeResponse {
  mode: "live" | "simulated";
  scores: ParsedAnalysis["scores"];
  uiScores: ParsedAnalysis["uiScores"];
  overall: number | null;
  skinAge: number | null;
  unitsConsumed: number;
  taskId?: string;
  elapsedMs?: number;
  concerns: readonly string[];
  notice?: string;
}

export async function POST(req: Request) {
  let bytes: Uint8Array;
  let contentType: "image/jpeg" | "image/png";

  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "No image supplied.", code: "no_image" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: "That image is larger than the 10MB limit.",
          code: "too_large",
        },
        { status: 400 },
      );
    }
    const type = file.type || "image/jpeg";
    if (type !== "image/jpeg" && type !== "image/png") {
      return NextResponse.json(
        { error: "Only JPEG and PNG images are supported.", code: "bad_type" },
        { status: 400 },
      );
    }
    contentType = type;
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: "Could not read the uploaded image.", code: "bad_request" },
      { status: 400 },
    );
  }

  const apiKey = process.env.YOUCAM_API_KEY;

  /* ---- Fixture mode: no key configured, or explicitly forced ---- */
  if (!apiKey || process.env.YOUCAM_MODE === "fixture") {
    const parsed = simulateAnalysis(bytes);
    const payload: AnalyzeResponse = {
      mode: "simulated",
      ...parsed,
      unitsConsumed: 0,
      concerns: CONCERNS,
      notice: apiKey
        ? "Simulated reading: YOUCAM_MODE=fixture is set, so no API units were spent."
        : "Simulated reading: no YouCam API key is configured, so this score did not come from the YouCam model.",
    };
    return NextResponse.json(payload);
  }

  /* ---- Live mode: the real four-step YouCam pipeline ---- */
  try {
    const result = await analyseImage(
      apiKey,
      bytes,
      contentType,
      `skin-diary-${Date.now()}.${contentType === "image/png" ? "png" : "jpg"}`,
      CONCERNS,
    );

    const payload: AnalyzeResponse = {
      mode: "live",
      scores: result.scores,
      uiScores: result.uiScores,
      overall: result.overall,
      skinAge: result.skinAge,
      // Units are charged only on a successful result, and only at the
      // tier for the number of concerns requested.
      unitsConsumed: UNITS_PER_CAPTURE,
      taskId: result.taskId,
      elapsedMs: result.elapsedMs,
      concerns: CONCERNS,
    };
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof YouCamError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.code,
          userFixable: err.userFixable,
          // Failed tasks are free: YouCam only deducts on success.
          unitsConsumed: 0,
        },
        { status: err.userFixable ? 422 : 502 },
      );
    }
    return NextResponse.json(
      {
        error: "Unexpected error running the analysis.",
        code: "internal_error",
        unitsConsumed: 0,
      },
      { status: 500 },
    );
  }
}
