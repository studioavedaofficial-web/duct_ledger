import type { Pt, Sheet } from "./model";

export type GenericMeasurement = {
  id: string;
  sheet: string;
  kind: "Length" | "Polyline" | "Polygon";
  points: Pt[];
  cutouts: Pt[][];
};

const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a: Pt, b: Pt, c: Pt) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function ringArea(points: Pt[]) {
  let sum = 0;
  for (let i = 1; i + 1 < points.length; i++)
    sum += cross(points[0], points[i], points[i + 1]);
  return Math.abs(sum) / 2;
}

function intersects(a: Pt, b: Pt, c: Pt, d: Pt) {
  function within(x: Pt, y: Pt, p: Pt) {
    return p.every(
      (v, k) => v >= Math.min(x[k], y[k]) && v <= Math.max(x[k], y[k]),
    );
  }
  const abc = Math.sign(cross(a, b, c)),
    abd = Math.sign(cross(a, b, d));
  const cda = Math.sign(cross(c, d, a)),
    cdb = Math.sign(cross(c, d, b));
  return (
    (abc * abd < 0 && cda * cdb < 0) ||
    (!abc && within(a, b, c)) ||
    (!abd && within(a, b, d)) ||
    (!cda && within(c, d, a)) ||
    (!cdb && within(c, d, b))
  );
}
const next = (ring: Pt[], i: number) => ring[(i + 1) % ring.length];

function simpleRing(ring: Pt[]) {
  if (ring.length < 3 || !ringArea(ring)) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = next(ring, i),
      c = next(ring, i + 1);
    if (!distance(a, b)) return false;
    if (
      !cross(a, b, c) &&
      (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) > 0
    )
      return false;
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (intersects(a, b, ring[j], next(ring, j))) return false;
    }
  }
  return true;
}

function ringsTouch(a: Pt[], b: Pt[]) {
  return a.some((p, i) =>
    b.some((q, j) => intersects(p, next(a, i), q, next(b, j))),
  );
}
function inside(point: Pt, ring: Pt[]) {
  const [x, y] = point;
  let result = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = next(ring, i);
    if (
      a[1] > y !== b[1] > y &&
      x < a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1])
    )
      result = !result;
  }
  return result;
}

export function geometryIssue(m: GenericMeasurement): string {
  if (m.kind !== "Polygon") {
    if (
      m.cutouts.length ||
      m.points.length < 2 ||
      (m.kind === "Length" && m.points.length !== 2)
    )
      return "Place two endpoints for a length or at least two vertices for a polyline.";
    if (m.points.some((p, i) => i > 0 && !distance(p, m.points[i - 1])))
      return "Adjacent vertices must be different.";
    return "";
  }
  if (!simpleRing(m.points))
    return "The outer boundary needs three or more vertices and must not cross or retrace itself.";
  for (const [i, h] of m.cutouts.entries()) {
    if (!simpleRing(h))
      return "Each cutout needs three or more vertices and must not cross or retrace itself.";
    if (ringsTouch(m.points, h) || !inside(h[0], m.points))
      return "Place each cutout completely inside the outer boundary.";
    if (
      m.cutouts
        .slice(0, i)
        .some(
          (other) =>
            ringsTouch(other, h) || inside(h[0], other) || inside(other[0], h),
        )
    )
      return "Cutouts cannot touch, overlap or contain one another.";
  }
  return "";
}

export function validMeasurement(
  raw: unknown,
  sheet: Sheet,
): raw is GenericMeasurement {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as GenericMeasurement;
  const path = (points: unknown) =>
    Array.isArray(points) &&
    points.every(
      (p) =>
        Array.isArray(p) &&
        p.length === 2 &&
        p.every(Number.isFinite) &&
        p[0] >= 0 &&
        p[0] <= sheet.w &&
        p[1] >= 0 &&
        p[1] <= sheet.h,
    );
  return (
    typeof m.id === "string" &&
    !!m.id &&
    m.sheet === sheet.id &&
    ["Length", "Polyline", "Polygon"].includes(m.kind) &&
    path(m.points) &&
    Array.isArray(m.cutouts) &&
    m.cutouts.every(path) &&
    !geometryIssue(m)
  );
}

export function measurementValues(m: GenericMeasurement, scale: number | null) {
  const unit = m.kind === "Polygon" ? "m²" : "m";
  if (
    scale === null ||
    !Number.isFinite(scale) ||
    scale <= 0 ||
    geometryIssue(m)
  )
    return { unit, gross: null, deducted: null, net: null };
  const gross =
    m.kind === "Polygon"
      ? ringArea(m.points) * scale ** 2
      : m.points
          .slice(1)
          .reduce((v, p, i) => v + distance(p, m.points[i]) * scale, 0);
  const deducted = m.cutouts.reduce((v, h) => v + ringArea(h) * scale ** 2, 0);
  return {
    unit,
    gross: Number(gross.toFixed(6)),
    deducted: Number(deducted.toFixed(6)),
    net: Number((gross - deducted).toFixed(6)),
  };
}
