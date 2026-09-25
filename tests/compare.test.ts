import { describe, expect, test } from "bun:test";
import { PNG } from "pngjs";
import { comparePng } from "../src/compare.ts";

type Rgb = [number, number, number];

/** Solid PNG of `width`×`height`; `paint` recolours the first `n` pixels in row-major order. */
function png(width: number, height: number, fill: Rgb = [255, 255, 255], paint?: { n: number; color: Rgb }): Uint8Array {
  const img = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const c = paint && i < paint.n ? paint.color : fill;
    img.data.set([...c, 255], i * 4);
  }
  return new Uint8Array(PNG.sync.write(img));
}

const decode = (bytes: Uint8Array) => PNG.sync.read(Buffer.from(bytes));

describe("comparePng with equal dimensions", () => {
  test("identical images are same with ratio 0 and a decodable diff", () => {
    const r = comparePng(png(10, 10), png(10, 10), 0.01);
    expect(r).toMatchObject({ state: "same", diffPixels: 0, ratio: 0, allowance: 0.01, dimensionsChanged: false });
    if (r.state === "error") throw new Error("unexpected");
    expect(r.baseline).toEqual({ width: 10, height: 10 });
    expect(r.actual).toEqual({ width: 10, height: 10 });
    expect(decode(r.diffPng)).toMatchObject({ width: 10, height: 10 });
  });

  test("ratio below, equal to and above the allowance (100 px image, 1 px = 0.01)", () => {
    const base = png(10, 10);
    const black = (n: number) => png(10, 10, [255, 255, 255], { n, color: [0, 0, 0] });
    expect(comparePng(base, black(1), 0.02)).toMatchObject({ state: "same", diffPixels: 1, ratio: 0.01 });
    expect(comparePng(base, black(2), 0.02)).toMatchObject({ state: "same", diffPixels: 2, ratio: 0.02 });
    expect(comparePng(base, black(3), 0.02)).toMatchObject({ state: "changed", diffPixels: 3, ratio: 0.03 });
    expect(comparePng(base, black(1), 0)).toMatchObject({ state: "changed" });
    expect(comparePng(base, black(100), 1)).toMatchObject({ state: "same", ratio: 1 });
  });

  test("uses pixelmatch threshold 0.1: small colour deltas ignored, larger ones counted", () => {
    const grey = (v: number) => png(10, 10, [255, 255, 255], { n: 50, color: [v, v, v] });
    // YIQ delta for white vs 250 grey is far below 0.1 of the max; 200 grey is above it.
    expect(comparePng(png(10, 10), grey(250), 0)).toMatchObject({ state: "same", diffPixels: 0 });
    expect(comparePng(png(10, 10), grey(200), 0)).toMatchObject({ state: "changed", diffPixels: 50, ratio: 0.5 });
  });
});

describe("comparePng with different dimensions", () => {
  test("height-only change is changed regardless of allowance, with padded diff", () => {
    const r = comparePng(png(10, 10), png(10, 14), 1);
    expect(r).toMatchObject({ state: "changed", dimensionsChanged: true, diffPixels: null, ratio: null, allowance: 1 });
    if (r.state === "error") throw new Error("unexpected");
    expect(r.baseline).toEqual({ width: 10, height: 10 });
    expect(r.actual).toEqual({ width: 10, height: 14 });
    const diff = decode(r.diffPng);
    expect({ width: diff.width, height: diff.height }).toEqual({ width: 10, height: 14 });
    // The rows only the actual image has differ from the padding and are marked, not blank.
    const at = (x: number, y: number) => [...diff.data.subarray((y * diff.width + x) * 4, (y * diff.width + x) * 4 + 4)];
    expect(at(5, 12)).not.toEqual(at(5, 2));
  });

  test("width-only change and both-axis change do not crash", () => {
    expect(comparePng(png(10, 10), png(12, 10), 0.5)).toMatchObject({
      state: "changed",
      dimensionsChanged: true,
      baseline: { width: 10, height: 10 },
      actual: { width: 12, height: 10 },
    });
    const both = comparePng(png(20, 5), png(8, 30), 0.5);
    expect(both).toMatchObject({ state: "changed", baseline: { width: 20, height: 5 }, actual: { width: 8, height: 30 } });
    if (both.state === "error") throw new Error("unexpected");
    expect(decode(both.diffPng)).toMatchObject({ width: 20, height: 30 });
  });
});

describe("comparePng with undecodable input", () => {
  test("corrupt baseline or actual PNG is an explicit error, not a crash", () => {
    const good = png(4, 4);
    const garbage = new TextEncoder().encode("not a png");
    const truncated = good.subarray(0, 30);
    expect(comparePng(garbage, good, 0.01)).toMatchObject({ state: "error", detail: expect.stringContaining("baseline PNG") });
    expect(comparePng(good, truncated, 0.01)).toMatchObject({ state: "error", detail: expect.stringContaining("actual PNG") });
    expect(comparePng(new Uint8Array(), good, 0.01)).toMatchObject({ state: "error" });
  });
});
