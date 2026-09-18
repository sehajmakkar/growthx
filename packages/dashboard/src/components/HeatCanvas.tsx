import { useEffect, useRef } from "react";

export interface Point { x: number; y: number; weight: number; type?: string }

/**
 * Classic two-pass heatmap.
 *
 * Pass one draws each point as a radial gradient in greyscale, so overlapping
 * points accumulate density in the alpha channel. Pass two replaces every
 * pixel's colour by looking its alpha up in a ramp. Doing it in two passes,
 * rather than drawing coloured blobs directly, is what makes overlapping clicks
 * blend into a continuous field instead of a pile of discs.
 *
 * Points arrive as page fractions (PLAN §4.5), so the same data draws correctly
 * over a 390px screenshot and a 1440px one with no re-measurement.
 */
const RAMPS: Record<string, [number, [number, number, number, number]][]> = {
  clicks: [
    [0.0, [44, 26, 74, 0]],
    [0.25, [123, 42, 107, 150]],
    [0.5, [199, 74, 69, 195]],
    [0.75, [232, 133, 58, 220]],
    [1.0, [245, 208, 122, 240]],
  ],
  attention: [
    [0.0, [0, 34, 78, 0]],
    [0.35, [59, 107, 125, 150]],
    [0.7, [126, 154, 110, 200]],
    [1.0, [211, 193, 100, 230]],
  ],
};

function buildLut(kind: string): Uint8ClampedArray {
  const stops = RAMPS[kind] ?? RAMPS.clicks!;
  const lut = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0]!, b = stops[stops.length - 1]!;
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s]![0] && t <= stops[s + 1]![0]) { a = stops[s]!; b = stops[s + 1]!; break; }
    }
    const span = b[0] - a[0] || 1;
    const f = (t - a[0]) / span;
    for (let c = 0; c < 4; c++) lut[i * 4 + c] = a[1][c]! + (b[1][c]! - a[1][c]!) * f;
  }
  return lut;
}

export function HeatCanvas({
  points, width, height, radius = 24, intensity = 1, kind = "clicks",
}: {
  points: Point[]; width: number; height: number;
  radius?: number; intensity?: number; kind?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width || !height) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    if (!points.length) return;

    for (const p of points) {
      const px = p.x * width;
      const py = p.y * height;
      const r = radius * (1 + Math.min(1, (p.weight - 1) * 0.35));
      const alpha = Math.min(0.9, 0.18 * intensity * p.weight);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(0,0,0,${alpha})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const img = ctx.getImageData(0, 0, width, height);
    const data = img.data;
    const lut = buildLut(kind);
    for (let i = 0; i < data.length; i += 4) {
      const density = data[i + 3]!;
      if (density === 0) continue;
      const o = density * 4;
      data[i] = lut[o]!;
      data[i + 1] = lut[o + 1]!;
      data[i + 2] = lut[o + 2]!;
      data[i + 3] = lut[o + 3]!;
    }
    ctx.putImageData(img, 0, 0);
  }, [points, width, height, radius, intensity, kind]);

  return (
    <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
  );
}

/**
 * Scroll reach as horizontal bands, not blobs.
 *
 * How far down people got is a property of depth alone; drawing it as a point
 * cloud would imply a horizontal distribution the data does not contain.
 */
export function ScrollOverlay({
  bands, height,
}: { bands: { depth_pct: number; reach_pct: number }[]; height: number }) {
  if (!bands.length || !height) return null;
  const sorted = [...bands].sort((a, b) => a.depth_pct - b.depth_pct);

  return (
    <div className="pointer-events-none absolute inset-0">
      {sorted.map((b, i) => {
        const top = i === 0 ? 0 : (sorted[i - 1]!.depth_pct / 100) * height;
        const bottom = (b.depth_pct / 100) * height;
        const mix = Math.round((b.reach_pct / 100) * 80);
        return (
          <div key={b.depth_pct} className="absolute left-0 w-full"
               style={{
                 top, height: Math.max(0, bottom - top),
                 background: `color-mix(in srgb, var(--scroll-2) ${mix}%, var(--scroll-0))`,
                 opacity: 0.6,
               }}>
            <div className="absolute right-3 top-2 rounded bg-surface px-1.5 py-0.5
                            font-mono text-[0.625rem] font-medium text-ink shadow-card">
              {b.reach_pct}% reached {b.depth_pct}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
