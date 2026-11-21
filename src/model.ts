export type Pt = [number, number];
export type Kind =
  | "Rectangular duct"
  | "Circular duct"
  | "Vertical riser"
  | "Elbow"
  | "Tee"
  | "Reducer"
  | "Damper"
  | "Diffuser";
export const kinds: Kind[] = [
  "Rectangular duct",
  "Circular duct",
  "Vertical riser",
  "Elbow",
  "Tee",
  "Reducer",
  "Damper",
  "Diffuser",
];
export const piece = (kind: Kind) => !kinds.slice(0, 3).includes(kind);
export type Unit = "m²" | "m" | "pc";
export type Rate = {
  code: string;
  description: string;
  unit: Unit;
  rate: number | null;
  date?: string;
  basis?: "material" | "labour";
};
export type Sheet = {
  id: string;
  name: string;
  number: string;
  doc: string;
  page: number;
  w: number;
  h: number;
  scale: number | null;
  verified?: boolean;
  log: string[];
  mixed?: boolean;
};
export type Item = {
  id: string;
  sheet: string;
  kind: Kind;
  system: string;
  zone: string;
  spec: string;
  width: number | null;
  height: number | null;
  diameter: number | null;
  rise: number | null;
  count: number;
  waste: number;
  code: string;
  pts: Pt[];
  review?: boolean;
  decision?: string;
};
export type Query = {
  id: string;
  sheet: string;
  pt: Pt;
  text: string;
  response: string;
};
export type Rev = {
  id: string;
  date: string;
  frozen: boolean;
  sheets: Sheet[];
  items: Item[];
  rates: Rate[];
  queries: Query[];
  approved: string[];
  alignment?: Record<string, number[]>;
};
export type Project = {
  version: 1;
  id: string;
  name: string;
  location: string;
  documents: Record<string, string>;
  revs: Rev[];
};
export const today = () => new Date().toISOString().slice(0, 10);
export const uid = () => crypto.randomUUID();
export const round = (n: number, d = 2) => Number(n.toFixed(d));
export const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
export const distance = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export function calculate(item: Item, rev: Rev) {
  const s = rev.sheets.find((x) => x.id === item.sheet),
    r = rev.rates.find((x) => x.code === item.code),
    errors: string[] = [];
  const fitting = piece(item.kind),
    unit = r?.unit ?? (fitting ? "pc" : "m²");
  if (!s?.scale || s.mixed)
    errors.push(s?.mixed ? "Mixed-scale sheet blocked" : "Calibration missing");
  if (!item.spec.trim()) errors.push("Material specification missing");
  if (!item.zone.trim() || !item.system.trim())
    errors.push("System or zone missing");
  if (!item.code || !r) errors.push("BOQ mapping unresolved");
  if (r?.rate == null) errors.push("Rate missing");
  if ((unit === "pc") !== fitting) errors.push("Incompatible rate unit");
  if (item.review) errors.push("Measurement requires review");
  const length =
    item.kind === "Vertical riser"
      ? item.rise
      : s?.scale && item.pts.length > 1
        ? item.pts
            .slice(1)
            .reduce((v, p, i) => v + distance(p, item.pts[i]), 0) * s.scale
        : null;
  if (!fitting && !(length && length > 0)) errors.push("Length missing");
  let perimeter: number | null = null;
  if (!fitting) {
    perimeter =
      item.kind === "Circular duct"
        ? item.diameter && (Math.PI * item.diameter) / 1000
        : item.width && item.height
          ? (2 * (item.width + item.height)) / 1000
          : null;
    if (!perimeter) errors.push("Duct dimensions missing");
  }
  if (fitting && (!Number.isInteger(item.count) || item.count <= 0))
    errors.push("Invalid piece count");
  const area = perimeter && length ? perimeter * length : null;
  const net = fitting ? item.count : unit === "m" ? length : area;
  const quantity =
    net == null
      ? null
      : round(
          net * (fitting || r?.basis === "labour" ? 1 : 1 + item.waste / 100),
          6,
        );
  const amount =
    errors.length || quantity === null || r?.rate == null
      ? null
      : round(quantity * r.rate);
  return {
    length,
    area,
    net,
    quantity,
    amount,
    unit,
    rate: r?.rate ?? null,
    errors,
  };
}
export function changes(old: Rev | undefined, next: Rev) {
  const result: {
    id: string;
    description: string;
    old: ReturnType<typeof calculate> | null;
    next: ReturnType<typeof calculate> | null;
    scope: number | null;
    rate: number | null;
    delta: number | null;
    side: "old" | "new";
    key: string;
  }[] = [];
  if (!old) return result;
  for (const id of new Set([...old.items, ...next.items].map((i) => i.id))) {
    const a = old.items.find((i) => i.id === id),
      b = next.items.find((i) => i.id === id),
      o = a ? calculate(a, old) : null,
      n = b ? calculate(b, next) : null;
    function emit(
      description: string,
      x: typeof o,
      y: typeof n,
      side: "old" | "new",
      key: string,
    ) {
      const priced = (!x || x.amount != null) && (!y || y.amount != null);
      const delta = priced ? round((y?.amount ?? 0) - (x?.amount ?? 0)) : null;
      const scope =
        delta === null
          ? null
          : x && y
            ? round((y.quantity! - x.quantity!) * x.rate!)
            : delta;
      result.push({
        id,
        description,
        old: x,
        next: y,
        delta,
        scope,
        rate: delta === null ? null : round(delta - scope!),
        side,
        key,
      });
    }
    if (o && n && o.unit !== n.unit) {
      emit("Unit change · removal", o, null, "old", id + "-remove");
      emit("Unit change · addition", null, n, "new", id + "-add");
      continue;
    }
    const type = !a
      ? "Added"
      : !b
        ? "Removed"
        : a.width !== b.width ||
            a.height !== b.height ||
            a.diameter !== b.diameter
          ? "Resized"
          : JSON.stringify(a.pts) !== JSON.stringify(b.pts)
            ? "Rerouted"
            : a.spec !== b.spec
              ? "Specification changed"
              : o?.rate !== n?.rate
                ? "Rate changed"
                : o?.quantity !== n?.quantity
                  ? "Quantity changed"
                  : b.decision && b.decision !== "Retained"
                    ? b.decision
                    : "Retained";
    if (type !== "Retained") emit(type, o, n, b ? "new" : "old", id);
  }
  return result;
}
export function exceptions(r: Rev) {
  return [
    ...r.sheets.flatMap((s) =>
      !s.scale || s.mixed ? [s.number + " · Calibration unresolved"] : [],
    ),
    ...r.items.flatMap((i) =>
      calculate(i, r).errors.map((e) => i.id + " · " + e),
    ),
    ...r.queries
      .filter((q) => !q.response.trim())
      .map((q) => q.id + " · " + q.text),
  ];
}
export function newItem(id: string, sheet: Sheet, kind: Kind, pts: Pt[]): Item {
  return {
    id,
    sheet: sheet.id,
    kind,
    pts,
    system: "Supply air",
    zone: sheet.name,
    spec: "Galvanized steel",
    width: 600,
    height: 400,
    diameter: 300,
    rise: null,
    count: 1,
    waste: 0,
    code: "",
  };
}
export function newProject(name: string, location: string): Project {
  return {
    version: 1,
    id: uid(),
    name,
    location,
    documents: {},
    revs: [
      {
        id: "A",
        date: today(),
        frozen: false,
        sheets: [],
        items: [],
        rates: [],
        queries: [],
        approved: [],
      },
    ],
  };
}
export const totals = (r: Rev) =>
  round(r.items.reduce((s, i) => s + (calculate(i, r).amount ?? 0), 0));
export function boq(r: Rev) {
  return Array.from(new Set(r.items.map((i) => i.code))).map((code) => {
    const rows = r.items.filter((i) => i.code === code),
      rate = r.rates.find((x) => x.code === code),
      c = rows.map((i) => calculate(i, r));
    return {
      code,
      rows,
      rate,
      quantity: c.some((x) => x.quantity == null)
        ? null
        : round(
            c.reduce((a, x) => a + x.quantity!, 0),
            6,
          ),
      amount: c.some((x) => x.amount == null)
        ? null
        : round(c.reduce((a, x) => a + x.amount!, 0)),
    };
  });
}

export function quantityExplanation(i: Item, r: Rev) {
  const q = calculate(i, r),
    rate = r.rates.find((v) => v.code === i.code),
    s = r.sheets.find((s) => s.id === i.sheet);
  const shape = piece(i.kind)
    ? fmt(i.count) + " counted pieces"
    : i.kind === "Circular duct"
      ? "π × (" +
        fmt(i.diameter) +
        " mm / 1,000) × " +
        fmt(q.length, 4) +
        " m = " +
        fmt(q.area, 4) +
        " m²"
      : "2 × ((" +
        fmt(i.width) +
        " + " +
        fmt(i.height) +
        ") mm / 1,000) × " +
        fmt(q.length, 4) +
        " m = " +
        fmt(q.area, 4) +
        " m²";
  const source = piece(i.kind)
    ? "Manual count"
    : i.kind === "Vertical riser"
      ? "Explicit vertical length " + fmt(i.rise) + " m"
      : "Calibrated path at " + fmt(s?.scale, 6) + " m per PDF point";
  const waste =
    piece(i.kind) || rate?.basis === "labour"
      ? "No waste applied"
      : fmt(i.waste) + "% material waste";
  return (
    source +
    ". " +
    shape +
    ". " +
    fmt(q.net, 6) +
    " " +
    q.unit +
    " net, " +
    waste +
    "; " +
    fmt(q.quantity, 6) +
    " " +
    q.unit +
    " priced × PKR " +
    fmt(q.rate, 6) +
    "/" +
    q.unit +
    " = PKR " +
    fmt(q.amount) +
    "."
  );
}

/** Pair by stable sheet ID, independently of both files' page order. */
export function pairSheets(
  incoming: Sheet[],
  baseline: Rev,
  pairs: string[],
): Sheet[] {
  const assigned = pairs.filter(Boolean);
  if (
    incoming.length !== pairs.length ||
    new Set(assigned).size !== assigned.length ||
    assigned.some((id) => !baseline.sheets.some((s) => s.id === id))
  )
    throw Error(
      "Each revised page needs a distinct baseline match or a new sheet designation.",
    );
  const used = new Set(
    assigned.map((id) => baseline.sheets.find((s) => s.id === id)!.number),
  );
  return incoming.map((sh, n) => {
    const previous = baseline.sheets.find((s) => s.id === pairs[n]);
    if (previous)
      return {
        ...sh,
        id: previous.id,
        name: previous.name,
        number: previous.number,
        scale: null,
        verified: false,
        log: [
          "Paired to " +
            previous.number +
            " in Revision " +
            baseline.id +
            ". Recalibration required.",
        ],
      };
    let number = sh.number,
      index = 101;
    while (used.has(number)) number = "M-" + index++;
    used.add(number);
    return { ...sh, number };
  });
}
