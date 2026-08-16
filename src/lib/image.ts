/**
 * Client-side photo measurement and preparation.
 *
 * Two jobs, both done before anything leaves the browser:
 *
 *  1. MEASURE THE CAPTURE CONDITIONS. Mean luma, contrast and warmth are
 *     computed from the pixels. These are not skin metrics — they are the
 *     evidence that lets the analysis distinguish "your skin changed"
 *     from "you moved to a different lamp". Without them, a photo diary
 *     is measuring its own lighting and calling it dermatology.
 *
 *  2. RESIZE. YouCam wants the short side >= 480px for SD and caps
 *     effective resolution at 2560px, under 10MB. Shrinking here means
 *     less to upload and no server-side image pipeline.
 */

import type { PhotoStats } from "./domain";

/** YouCam's documented SD minimum short side. */
export const MIN_SHORT_SIDE = 480;
/** Above this, YouCam downsizes anyway, so there is nothing to gain. */
export const MAX_LONG_SIDE = 2560;

export interface PreparedPhoto {
  /** JPEG blob sized for upload. */
  blob: Blob;
  stats: PhotoStats;
  width: number;
  height: number;
  warnings: string[];
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as an image."));
    };
    img.src = url;
  });
}

function drawToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas;
}

/**
 * Mean luma, luma standard deviation and red-blue warmth.
 *
 * Sampled on a small canvas — full resolution would change the numbers by
 * a rounding error and cost 50x the work.
 */
function measure(canvas: HTMLCanvasElement): {
  brightness: number;
  contrast: number;
  warmth: number;
} {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

  let sum = 0;
  let sumSq = 0;
  let sumWarm = 0;
  let n = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Rec. 601 luma — the standard perceptual weighting.
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += y;
    sumSq += y * y;
    sumWarm += r - b;
    n++;
  }

  if (n === 0) return { brightness: 0, contrast: 0, warmth: 0 };
  const brightness = sum / n;
  const variance = Math.max(0, sumSq / n - brightness * brightness);
  return {
    brightness: Math.round(brightness * 10) / 10,
    contrast: Math.round(Math.sqrt(variance) * 10) / 10,
    warmth: Math.round((sumWarm / n) * 10) / 10,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.9,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not encode the image.")),
      "image/jpeg",
      quality,
    );
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const img = await loadImage(file);
  const warnings: string[] = [];

  const shortSide = Math.min(img.naturalWidth, img.naturalHeight);
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);

  if (shortSide < MIN_SHORT_SIDE) {
    warnings.push(
      `This photo's short side is ${shortSide}px. YouCam needs at least ${MIN_SHORT_SIDE}px, so the analysis will probably be rejected.`,
    );
  }
  if (img.naturalWidth > img.naturalHeight) {
    warnings.push(
      "Portrait photos work better than landscape for skin analysis.",
    );
  }

  // Scale down only; never upscale a small photo into a false resolution.
  const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const full = drawToCanvas(img, w, h);
  const blob = await canvasToBlob(full, 0.92);

  // Measure and thumbnail from a small copy.
  const thumbW = 160;
  const thumbH = Math.max(1, Math.round((thumbW * h) / w));
  const thumbCanvas = drawToCanvas(img, thumbW, thumbH);
  const measured = measure(thumbCanvas);

  if (measured.brightness < 60) {
    warnings.push(
      "This photo is quite dark. YouCam rejects under-lit photos, and dark readings are not comparable with bright ones.",
    );
  }
  if (measured.brightness > 215) {
    warnings.push(
      "This photo is very bright and may be blown out, which flattens skin detail.",
    );
  }

  return {
    blob,
    width: w,
    height: h,
    warnings,
    stats: {
      ...measured,
      thumbnail: thumbCanvas.toDataURL("image/jpeg", 0.6),
    },
  };
}

/** How far this capture's lighting sits from the diary's usual. */
export function lightingDeviation(
  stats: PhotoStats,
  history: PhotoStats[],
): { delta: number; message: string | null } {
  const values = history
    .map((p) => p.brightness)
    .filter((v) => Number.isFinite(v));
  if (values.length < 3) return { delta: 0, message: null };

  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const delta = stats.brightness - mean;

  if (Math.abs(delta) < 25) return { delta, message: null };
  return {
    delta,
    message: `This photo is ${Math.abs(delta).toFixed(0)} points ${
      delta > 0 ? "brighter" : "darker"
    } than your usual (${mean.toFixed(0)}/255). Readings taken under different light are not directly comparable.`,
  };
}
