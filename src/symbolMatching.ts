export type PixelBox = { x: number; y: number; w: number; h: number };
export type SymbolCandidate = { x: number; y: number; score: number };

export function matchSymbols(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  box: PixelBox,
): SymbolCandidate[] {
  const { x, y, w, h } = box;
  if (
    x < 0 ||
    y < 0 ||
    w < 5 ||
    h < 5 ||
    x + w > width ||
    y + h > height ||
    w > 192 ||
    h > 192
  )
    throw Error(
      "Select a tight box around one complete symbol (5–192 image pixels per side).",
    );

  // Compare foreground strokes rather than matching large regions of empty paper.
  const ink = new Uint8Array(width * height);
  const stride = width + 1;
  const sum = new Uint32Array(stride * (height + 1));
  for (let row = 0; row < height; row++) {
    let running = 0;
    for (let col = 0; col < width; col++) {
      const i = row * width + col,
        k = i * 4;
      ink[i] =
        pixels[k] * 0.299 + pixels[k + 1] * 0.587 + pixels[k + 2] * 0.114 <
          175 && pixels[k + 3] > 127
          ? 1
          : 0;
      running += ink[i];
      sum[(row + 1) * stride + col + 1] = sum[row * stride + col + 1] + running;
    }
  }
  const strokes: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++)
      if (ink[(y + j) * width + x + i]) strokes.push(j * width + i);
  if (strokes.length < 8 || strokes.length > w * h * 0.9)
    throw Error(
      "The selection has too little detail. Select the outline and internal strokes of one symbol.",
    );

  const threshold = 0.87;
  const probes = Array.from(
    { length: Math.min(strokes.length, 36) },
    (_, i) =>
      strokes[Math.floor((i * strokes.length) / Math.min(strokes.length, 36))],
  );
  const cells = new Map<number, SymbolCandidate>();
  const tileX = Math.max(2, Math.floor(w / 3)),
    tileY = Math.max(2, Math.floor(h / 3));
  const columns = Math.ceil(width / tileX);
  for (let top = 0; top <= height - h; top++)
    for (let left = 0; left <= width - w; left++) {
      const p = top * stride + left,
        q = p + h * stride;
      const count = sum[q + w] - sum[q] - sum[p + w] + sum[p];
      const needed = Math.ceil(((count + strokes.length) * threshold) / 2);
      if (needed > Math.min(count, strokes.length)) continue;
      const base = top * width + left;
      let probeHits = 0;
      for (const d of probes) probeHits += ink[base + d];
      if (probeHits < probes.length * 0.65) continue;
      let hits = 0;
      for (let i = 0; i < strokes.length; i++) {
        hits += ink[base + strokes[i]];
        if (hits + strokes.length - i - 1 < needed) break;
      }
      if (hits < needed) continue;
      const score = (2 * hits) / (count + strokes.length);
      const cell = Math.floor(top / tileY) * columns + Math.floor(left / tileX);
      if (score > (cells.get(cell)?.score ?? 0))
        cells.set(cell, { x: left + w / 2, y: top + h / 2, score });
    }
  const found: SymbolCandidate[] = [];
  const occupied = new Map<number, SymbolCandidate[]>();
  for (const pt of [...cells.values()].sort((a, b) => b.score - a.score)) {
    const cx = Math.floor(pt.x / w),
      cy = Math.floor(pt.y / h);
    let overlaps = false;
    for (let j = cy - 1; j <= cy + 1; j++)
      for (let i = cx - 1; i <= cx + 1; i++) {
        if (
          (occupied.get(j * width + i) ?? []).some(
            (v) =>
              Math.abs(v.x - pt.x) < w * 0.6 && Math.abs(v.y - pt.y) < h * 0.6,
          )
        )
          overlaps = true;
      }
    if (!overlaps) {
      found.push(pt);
      const key = cy * width + cx;
      const group = occupied.get(key) ?? [];
      group.push(pt);
      occupied.set(key, group);
    }
  }
  return found.sort((a, b) => a.y - b.y || a.x - b.x);
}
