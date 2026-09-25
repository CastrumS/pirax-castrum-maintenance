import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export type Dimensions = { width: number; height: number };

export type Comparison =
  | {
      state: "same" | "changed";
      baseline: Dimensions;
      actual: Dimensions;
      /** Any width or height difference; always `changed`, and pixel counts are then null. */
      dimensionsChanged: boolean;
      diffPixels: number | null;
      /** `diffPixels / (width * height)`; changed iff it exceeds `allowance`. */
      ratio: number | null;
      allowance: number;
      /** Diff PNG; for dimension changes, both images padded to a common canvas first. */
      diffPng: Uint8Array;
    }
  | { state: "error"; detail: string };

// Stable, explicit pixelmatch settings (threshold 0.1 is locked; the rest are pixelmatch defaults).
const MATCH = {
  threshold: 0.1,
  includeAA: false,
  alpha: 0.1,
  aaColor: [255, 255, 0],
  diffColor: [255, 0, 0],
  diffMask: false,
} satisfies Parameters<typeof pixelmatch>[5];

// Magenta marks canvas area outside one image when dimensions differ.
const PAD: [number, number, number, number] = [255, 0, 255, 255];

export function comparePng(baselinePng: Uint8Array, actualPng: Uint8Array, allowance: number): Comparison {
  let base: PNG, actual: PNG;
  try {
    base = PNG.sync.read(Buffer.from(baselinePng));
  } catch (e) {
    return { state: "error", detail: `baseline PNG could not be decoded: ${(e as Error).message}` };
  }
  try {
    actual = PNG.sync.read(Buffer.from(actualPng));
  } catch (e) {
    return { state: "error", detail: `actual PNG could not be decoded: ${(e as Error).message}` };
  }

  const dims = { baseline: { width: base.width, height: base.height }, actual: { width: actual.width, height: actual.height } };
  if (base.width !== actual.width || base.height !== actual.height) {
    const width = Math.max(base.width, actual.width);
    const height = Math.max(base.height, actual.height);
    const a = pad(base, width, height);
    const b = pad(actual, width, height);
    const diff = new PNG({ width, height });
    pixelmatch(a.data, b.data, diff.data, width, height, MATCH);
    return { state: "changed", ...dims, dimensionsChanged: true, diffPixels: null, ratio: null, allowance, diffPng: encode(diff) };
  }

  const { width, height } = base;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(base.data, actual.data, diff.data, width, height, MATCH);
  const ratio = diffPixels / (width * height);
  const state = ratio > allowance ? "changed" : "same";
  return { state, ...dims, dimensionsChanged: false, diffPixels, ratio, allowance, diffPng: encode(diff) };
}

function pad(img: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) out.data.set(PAD, i * 4);
  PNG.bitblt(img, out, 0, 0, img.width, img.height, 0, 0);
  return out;
}

const encode = (img: PNG) => new Uint8Array(PNG.sync.write(img));
