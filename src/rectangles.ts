import type { Pt } from "./model";

export type Rectangle = { x: number; y: number; w: number; h: number };

export function bounds(a: Pt, b: Pt): Rectangle {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(a[0] - b[0]),
    h: Math.abs(a[1] - b[1]),
  };
}
export function corners({ x, y, w, h }: Rectangle): Pt[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ];
}
export function samePlace(a: Rectangle, b: Rectangle) {
  const near = (n: number, size: number) =>
    Math.abs(n) <= Math.max(1, size * 0.06);
  return (
    near(a.x - b.x, a.w) &&
    near(a.y - b.y, a.h) &&
    near(a.w - b.w, a.w) &&
    near(a.h - b.h, a.h)
  );
}

// Row and column sums allow testing complete outlines even when walls meet
// another rectangle or the room contains text and other drawing marks.
export function findRectangles(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  template: Rectangle,
) {
  const stride = w + 1;
  const rows = new Uint16Array(stride * (h + 1)),
    cols = new Uint16Array(rows.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        j = y * stride + x;
      const ink =
        pixels[i + 3] > 100 && pixels[i] + pixels[i + 1] + pixels[i + 2] < 645
          ? 1
          : 0;
      rows[j + 1] = rows[j] + ink;
      cols[j + stride] = cols[j] + ink;
    }
  const found: Rectangle[] = [];
  function scan(width: number, height: number) {
    const dw = Math.max(2, Math.round(width * 0.05)),
      dh = Math.max(2, Math.round(height * 0.05));
    const minW = width - dw,
      minH = height - dh;
    if (minW < 4 || minH < 4)
      throw Error("Select a larger rectangle with four visible edges.");
    const horizontal = (x: number, y: number, len: number) =>
      rows[y * stride + x + len] - rows[y * stride + x];
    const vertical = (x: number, y: number, len: number) =>
      cols[(y + len) * stride + x] - cols[y * stride + x];
    for (let y = 0; y < h - minH; y++)
      for (let x = 0; x < w - minW; x++) {
        if (
          horizontal(x, y, 1) === 0 ||
          horizontal(x, y, minW) < minW * 0.92 ||
          vertical(x, y, minH) < minH * 0.92
        )
          continue;
        // Discard solid fills and interior pixels of thick strokes.
        if (
          horizontal(x + 2, y + 2, minW - 3) > (minW - 3) * 0.9 &&
          vertical(x + 2, y + 2, minH - 3) > (minH - 3) * 0.9
        )
          continue;
        let bestRight = -1,
          bestBottom = -1;
        for (let dx = minW; dx <= width + dw && x + dx < w; dx++)
          if (
            vertical(x + dx, y, minH) >= minH * 0.92 &&
            (bestRight < 0 ||
              Math.abs(dx - width) < Math.abs(bestRight - width))
          )
            bestRight = dx;
        if (bestRight < 0) continue;
        for (let dy = minH; dy <= height + dh && y + dy < h; dy++)
          if (
            horizontal(x, y + dy, bestRight) >= bestRight * 0.92 &&
            (bestBottom < 0 ||
              Math.abs(dy - height) < Math.abs(bestBottom - height))
          )
            bestBottom = dy;
        if (
          bestBottom < 0 ||
          vertical(x + bestRight, y, bestBottom) < bestBottom * 0.92 ||
          horizontal(x, y, bestRight) < bestRight * 0.92
        )
          continue;
        const rect = { x, y, w: bestRight, h: bestBottom };
        if (!found.some((other) => samePlace(rect, other))) found.push(rect);
      }
  }
  scan(Math.round(template.w), Math.round(template.h));
  if (Math.abs(template.w - template.h) > 2)
    scan(Math.round(template.h), Math.round(template.w));
  return found;
}
