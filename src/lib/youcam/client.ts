/**
 * YouCam API client (Perfect Corp).
 *
 * Implements the full documented AI Skin Analysis pipeline:
 *
 *   1. POST /s2s/v2.0/file                       -> file_id + presigned PUT URL
 *   2. PUT  <presigned URL>                      -> actually upload the bytes
 *   3. POST /s2s/v2.0/task/skin-analysis         -> task_id
 *   4. GET  /s2s/v2.0/task/skin-analysis/{id}    -> poll until success | error
 *
 * Plus the two unit-accounting endpoints, which are free to call:
 *
 *   GET /s2s/v1.0/client/credit                  -> remaining balance
 *   GET /s2s/v2.0/credit/feature-cost            -> price list per SKU
 *
 * Docs: https://docs.perfectcorp.com/reference/ai_skin_analysis
 *
 * The API key is read from the environment by the caller and passed in.
 * It never appears in this file, and it never reaches the browser: every
 * call here runs server-side behind /api routes.
 */

import { CONCERNS, type Concern } from "../domain";

export const YOUCAM_API_BASE = "https://yce-api-01.makeupar.com";

/* ------------------------------------------------------------------ */
/* Wire types — mirror the documented OpenAPI schema                   */
/* ------------------------------------------------------------------ */

interface FileApiResponse {
  status: number;
  data: {
    files: Array<{
      content_type: string;
      file_name: string;
      file_id: string;
      requests: Array<{
        method: string;
        url: string;
        headers: Record<string, string>;
      }>;
    }>;
  };
}

interface RunTaskResponse {
  status: number;
  data: { task_id: string };
}

/**
 * One row of the `format: "json"` result payload.
 *
 * Note the polymorphism: score-bearing concerns carry raw_score/ui_score,
 * `skin_type` carries a string, and `all` / `skin_age` carry a bare
 * `score`. The parser below handles all three shapes.
 */
export interface SkinAnalysisOutput {
  type: string;
  region?: string;
  raw_score?: number;
  ui_score?: number;
  score?: number;
  skin_type?: string;
  mask_urls?: string[];
}

export interface TaskStatusResponse {
  status: number;
  data: {
    task_status: "running" | "success" | "error";
    error?: string;
    error_code?: string;
    polling_interval?: number;
    results?: { output: SkinAnalysisOutput[] } | string;
  };
}

/**
 * The live v1.0 credit endpoint returns a top-level `results` array — one
 * entry per credit bucket — not the `result.credits` shape the written docs
 * imply. Both are accepted here: `results` is what the server actually
 * sends, `result.credits` is kept as a fallback so a future docs-shaped
 * response doesn't silently report a zero balance.
 *
 * Getting this wrong is quiet and expensive: a mis-read balance reads as
 * "0 units, you have nothing" when 1,500 are sitting there.
 */
export interface CreditResponse {
  status: number;
  results?: Array<{
    id: number;
    type: string;
    amount?: number;
    amount_dec?: number;
    expiry?: number;
  }>;
  result?: {
    credits?: Array<{
      id: number;
      type: string;
      amount?: number;
      amount_dec?: number;
      expiry?: number;
    }>;
  };
}

export interface FeatureCostResponse {
  status: number;
  result?: {
    next_token: string | null;
    skus: Array<{
      description: string;
      amount: number;
      unit: string;
      proc_unit: number;
      run_task_url: string;
    }>;
  };
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class YouCamError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
    /** True when the user can fix this by retaking the photo. */
    readonly userFixable = false,
  ) {
    super(message);
    this.name = "YouCamError";
  }
}

/**
 * Engine errors are the ones worth explaining properly — they mean the
 * photo was wrong, not that the integration is broken. Note that these
 * cost zero units: YouCam only charges on a successful result.
 */
const ENGINE_ERROR_MESSAGES: Record<string, string> = {
  error_no_face:
    "No face detected. Take the photo straight on, with your whole face in frame.",
  error_src_face_too_small:
    "Your face is too small in the frame. It needs to fill more than 60% of the image width — move closer.",
  error_src_face_out_of_bound:
    "Part of your face is outside the frame. Centre your face and try again.",
  error_lighting_dark:
    "The photo is too dark to analyse. Find brighter, more even light.",
  error_below_min_image_size:
    "The image resolution is too low. The short side must be at least 480 pixels.",
  error_exceed_max_image_size: "The image resolution is too high.",
  exceed_max_filesize: "The image is larger than the 10MB limit.",
  error_pose:
    "Could not read your head position. Look straight into the camera with a neutral expression.",
  error_nsfw_content_detected: "That image was rejected by the content filter.",
  error_decode_image: "That image file could not be read. Try a JPEG or PNG.",
};

function describeEngineError(code: string | undefined, fallback: string) {
  if (code && ENGINE_ERROR_MESSAGES[code]) {
    return new YouCamError(ENGINE_ERROR_MESSAGES[code], code, undefined, true);
  }
  return new YouCamError(fallback, code ?? "unknown_error");
}

/* ------------------------------------------------------------------ */
/* Low-level request helper                                            */
/* ------------------------------------------------------------------ */

async function request<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${YOUCAM_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new YouCamError(
      `YouCam returned a non-JSON response (HTTP ${res.status})`,
      "bad_response",
      res.status,
    );
  }

  if (!res.ok) {
    const b = body as { error?: string; error_code?: string };
    if (res.status === 401) {
      throw new YouCamError(
        "YouCam rejected the API key. Check YOUCAM_API_KEY.",
        "invalid_api_key",
        401,
      );
    }
    if (res.status === 429) {
      throw new YouCamError(
        "Rate limited by YouCam (max 250 requests / 300s). Try again shortly.",
        "rate_limited",
        429,
      );
    }
    throw new YouCamError(
      b.error ?? `YouCam request failed (HTTP ${res.status})`,
      b.error_code ?? "http_error",
      res.status,
    );
  }

  return body as T;
}

/* ------------------------------------------------------------------ */
/* Pipeline steps                                                      */
/* ------------------------------------------------------------------ */

/**
 * Step 1 + 2: register the file, then actually PUT the bytes to the
 * presigned URL.
 *
 * The docs are emphatic about this and it is the single most common
 * integration mistake: calling the File API does NOT upload anything. If
 * you skip the PUT, the task fails later with an opaque 500.
 */
export async function uploadImage(
  apiKey: string,
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
  fileName: string,
): Promise<string> {
  const fileRes = await request<FileApiResponse>(apiKey, "/s2s/v2.0/file", {
    method: "POST",
    body: JSON.stringify({
      files: [
        {
          content_type: contentType,
          file_name: fileName,
          file_size: bytes.byteLength,
        },
      ],
    }),
  });

  const file = fileRes.data?.files?.[0];
  const upload = file?.requests?.[0];
  if (!file?.file_id || !upload?.url) {
    throw new YouCamError(
      "YouCam File API did not return an upload URL.",
      "bad_file_response",
    );
  }

  const putRes = await fetch(upload.url, {
    method: upload.method || "PUT",
    headers: upload.headers ?? {
      "Content-Type": contentType,
      "Content-Length": String(bytes.byteLength),
    },
    body: bytes as unknown as BodyInit,
  });

  if (!putRes.ok) {
    throw new YouCamError(
      `Uploading the image to storage failed (HTTP ${putRes.status}).`,
      "upload_failed",
      putRes.status,
    );
  }

  return file.file_id;
}

/** Step 3: start the analysis task. Returns a task_id. */
export async function createSkinAnalysisTask(
  apiKey: string,
  srcFileId: string,
  dstActions: readonly string[] = CONCERNS,
): Promise<string> {
  const res = await request<RunTaskResponse>(
    apiKey,
    "/s2s/v2.0/task/skin-analysis",
    {
      method: "POST",
      body: JSON.stringify({
        src_file_id: srcFileId,
        dst_actions: dstActions,
        // `json` returns the scores inline. The default, `zip`, would
        // hand back a download URL for an archive containing
        // score_info.json plus every mask PNG -- more bytes and an extra
        // round trip for data we would only throw away.
        format: "json",
      }),
    },
  );

  const taskId = res.data?.task_id;
  if (!taskId) {
    throw new YouCamError("YouCam did not return a task_id.", "no_task_id");
  }
  return taskId;
}

/**
 * Step 4: poll until the task resolves.
 *
 * The docs warn that abandoning a running task can expire it — and that
 * units may still be charged for work that completed. So this polls
 * patiently with a gentle backoff rather than giving up early, and
 * respects a server-supplied `polling_interval` when one is present.
 */
export async function pollSkinAnalysisTask(
  apiKey: string,
  taskId: string,
  opts: { timeoutMs?: number; onTick?: (attempt: number) => void } = {},
): Promise<SkinAnalysisOutput[]> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const started = Date.now();
  let delay = 1500;
  let attempt = 0;

  for (;;) {
    attempt++;
    opts.onTick?.(attempt);

    const res = await request<TaskStatusResponse>(
      apiKey,
      `/s2s/v2.0/task/skin-analysis/${encodeURIComponent(taskId)}`,
    );

    const status = res.data?.task_status;

    if (status === "success") {
      const results = res.data.results;
      if (!results || typeof results === "string") {
        throw new YouCamError(
          "Task succeeded but returned no inline JSON results.",
          "unexpected_result_format",
        );
      }
      return results.output ?? [];
    }

    if (status === "error") {
      throw describeEngineError(
        res.data.error_code,
        res.data.error ?? "The analysis engine could not process this photo.",
      );
    }

    if (Date.now() - started > timeoutMs) {
      throw new YouCamError(
        `Analysis timed out after ${Math.round(timeoutMs / 1000)}s.`,
        "timeout",
      );
    }

    if (res.data?.polling_interval && res.data.polling_interval > 0) {
      delay = res.data.polling_interval * 1000;
    }
    await sleep(delay);
    // Gentle backoff, capped well inside the 5 req/s rate limit.
    delay = Math.min(delay * 1.4, 5000);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ------------------------------------------------------------------ */
/* Result parsing                                                      */
/* ------------------------------------------------------------------ */

export interface ParsedAnalysis {
  scores: Partial<Record<Concern, number>>;
  uiScores: Partial<Record<Concern, number>>;
  overall: number | null;
  skinAge: number | null;
  maskUrls: Partial<Record<Concern, string>>;
}

/**
 * Turn YouCam's flat output array into per-concern scores.
 *
 * Skin Diary stores `raw_score`, not `ui_score`. YouCam is explicit that
 * ui_score is deliberately flattered — "adjusted to produce more
 * favourable results... beauty psychology". A diary whose job is to
 * detect a 4-point change over six weeks needs the unmassaged number.
 * ui_score is kept alongside only so the UI can show what a consumer-
 * facing app would have displayed.
 */
export function parseSkinAnalysis(
  output: SkinAnalysisOutput[],
): ParsedAnalysis {
  const scores: Partial<Record<Concern, number>> = {};
  const uiScores: Partial<Record<Concern, number>> = {};
  const maskUrls: Partial<Record<Concern, string>> = {};
  let overall: number | null = null;
  let skinAge: number | null = null;

  const concernSet = new Set<string>(CONCERNS);

  for (const row of output) {
    if (row.type === "all") {
      overall = typeof row.score === "number" ? row.score : null;
      continue;
    }
    if (row.type === "skin_age") {
      skinAge = typeof row.score === "number" ? row.score : null;
      continue;
    }
    if (!concernSet.has(row.type)) continue;

    // Concerns with sub-regions repeat the same `type` once per region.
    // We keep the whole-face reading; a region-specific one would not be
    // comparable across days if the crop shifted.
    if (row.region && row.region !== "whole") continue;

    const concern = row.type as Concern;
    if (typeof row.raw_score === "number") scores[concern] = row.raw_score;
    if (typeof row.ui_score === "number") uiScores[concern] = row.ui_score;
    if (row.mask_urls?.[0]) maskUrls[concern] = row.mask_urls[0];
  }

  return { scores, uiScores, overall, skinAge, maskUrls };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export interface AnalyseImageResult extends ParsedAnalysis {
  taskId: string;
  fileId: string;
  /** Raw output, kept so a real response can be captured as a fixture. */
  raw: SkinAnalysisOutput[];
  elapsedMs: number;
}

export async function analyseImage(
  apiKey: string,
  bytes: Uint8Array,
  contentType: "image/jpeg" | "image/png",
  fileName = "skin-diary-capture.jpg",
  dstActions: readonly string[] = CONCERNS,
): Promise<AnalyseImageResult> {
  const started = Date.now();
  const fileId = await uploadImage(apiKey, bytes, contentType, fileName);
  const taskId = await createSkinAnalysisTask(apiKey, fileId, dstActions);
  const raw = await pollSkinAnalysisTask(apiKey, taskId);
  return {
    ...parseSkinAnalysis(raw),
    taskId,
    fileId,
    raw,
    elapsedMs: Date.now() - started,
  };
}

/* ------------------------------------------------------------------ */
/* Unit accounting (free endpoints)                                    */
/* ------------------------------------------------------------------ */

export async function getUnitBalance(apiKey: string): Promise<{
  total: number;
  buckets: Array<{ amount: number; expiry: number | null }>;
}> {
  const res = await request<CreditResponse>(
    apiKey,
    "/s2s/v1.0/client/credit",
  );
  const credits = res.results ?? res.result?.credits ?? [];
  return {
    total: credits.reduce((s, c) => s + (c.amount_dec ?? c.amount ?? 0), 0),
    buckets: credits.map((c) => ({
      amount: c.amount_dec ?? c.amount ?? 0,
      expiry: c.expiry ?? null,
    })),
  };
}

export async function getFeatureCosts(apiKey: string): Promise<
  Array<{ description: string; amount: number; unit: string }>
> {
  const res = await request<FeatureCostResponse>(
    apiKey,
    "/s2s/v2.0/credit/feature-cost?page_size=20",
  );
  return (res.result?.skus ?? []).map((s) => ({
    description: s.description,
    amount: s.amount,
    unit: s.unit,
  }));
}
