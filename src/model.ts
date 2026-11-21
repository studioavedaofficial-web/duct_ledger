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
  pricingUnit?: Unit;
  groupCode?: string;
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
export function normalizeUnit(v: string): Unit | null {
  if (typeof v !== "string") return null;
  const text = v.trim().toLowerCase();
  return ["m²", "m2", "sqm", "m^2"].includes(text)
    ? "m²"
    : ["m", "metre", "meter", "rm"].includes(text)
      ? "m"
      : ["pc", "pcs", "piece", "ea", "no", "nos"].includes(text)
        ? "pc"
        : null;
}
export function pricingUnit(item: Item, rev: Rev): Unit {
  if (piece(item.kind)) return "pc";
  const specified = normalizeUnit(item.pricingUnit ?? "");
  if (specified === "m" || specified === "m²") return specified;
  return normalizeUnit(
    rev.rates.find((v) => v.code === item.code)?.unit ?? "",
  ) === "m"
    ? "m"
    : "m²";
}
export function mappingIssue(unit: Unit, rate: Rate | undefined) {
  if (!rate) return "BOQ mapping unresolved";
  return normalizeUnit(rate.unit) === unit
    ? ""
    : "Needs remapping · item uses " +
        unit +
        ", " +
        rate.code +
        " uses " +
        rate.unit;
}
export const moneyPolicy =
  "Priced quantities use up to six decimal places. Each item amount is rounded to two decimal places before summing. Scope is rounded per change. Rate effect carries the remaining cents.";
export function calculate(item: Item, rev: Rev) {
  const s = rev.sheets.find((x) => x.id === item.sheet),
    r = rev.rates.find((x) => x.code === item.code),
    errors: string[] = [];
  const fitting = piece(item.kind),
    unit = pricingUnit(item, rev);
  if (!s?.scale || s.mixed)
    errors.push(s?.mixed ? "Mixed-scale sheet blocked" : "Calibration missing");
  if (!item.spec.trim()) errors.push("Material specification missing");
  if (!item.zone.trim() || !item.system.trim())
    errors.push("System or zone missing");
  const mapping = mappingIssue(unit, r);
  if (mapping) errors.push(mapping);
  if (item.groupCode && item.groupCode !== item.code) {
    const groupIssue = mappingIssue(
      unit,
      rev.rates.find((v) => v.code === item.groupCode),
    );
    if (groupIssue) errors.push(groupIssue);
  }
  if (r?.rate == null) errors.push("Rate missing");
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
    sheetId: string;
    oldSheetId?: string;
    newSheetId?: string;
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
        sheetId: (side === "old" ? a : b)!.sheet,
        oldSheetId: x ? a?.sheet : undefined,
        newSheetId: y ? b?.sheet : undefined,
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
          : a.sheet !== b.sheet ||
              JSON.stringify(a.pts) !== JSON.stringify(b.pts)
            ? "Rerouted"
            : a.spec !== b.spec ||
                a.kind !== b.kind ||
                a.zone !== b.zone ||
                a.system !== b.system
              ? "Specification changed"
              : (a.groupCode || a.code) !== (b.groupCode || b.code) ||
                  a.code !== b.code
                ? "BOQ mapping changed"
                : o?.rate !== n?.rate
                  ? "Rate changed"
                  : o?.quantity !== n?.quantity
                    ? "Quantity changed"
                    : (o?.amount === null) !== (n?.amount === null)
                      ? "Pricing checks changed"
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
  return Array.from(new Set(r.items.map((i) => i.groupCode || i.code))).map(
    (code) => {
      const rows = r.items.filter((i) => (i.groupCode || i.code) === code),
        rate = r.rates.find((v) => v.code === code);
      const lines = rows.map((item) => ({ item, calc: calculate(item, r) }));
      const unit = normalizeUnit(rate?.unit ?? "");
      const rates = new Set(lines.map((l) => l.calc.rate)),
        excluded = lines.filter((l) => l.calc.amount === null).length;
      const quantity = lines.every(
        (l) =>
          l.calc.quantity !== null &&
          l.calc.unit === unit &&
          !l.calc.errors.some((e) => e.startsWith("Needs remapping")),
      )
        ? round(
            lines.reduce((n, l) => n + l.calc.quantity!, 0),
            6,
          )
        : null;
      const amount =
        excluded === rows.length
          ? null
          : round(lines.reduce((n, l) => n + (l.calc.amount ?? 0), 0));
      return {
        code,
        rows,
        lines,
        rate,
        unit,
        quantity,
        amount,
        excluded,
        mixedRates: rates.size > 1,
        unitRate: rates.size === 1 ? lines[0].calc.rate : null,
      };
    },
  );
}
export type Change = ReturnType<typeof changes>[number];
export function quantityDifference(c: Change) {
  if (c.old?.quantity === null || c.next?.quantity === null) return null;
  return (c.next?.quantity ?? 0) - (c.old?.quantity ?? 0);
}
export const confirmed = (r: Rev, c: Change) =>
  r.approved.includes(c.key) || r.approved.includes(c.id);
export function reviewTotals(rows: Change[], r: Rev, old?: Rev) {
  const unresolved = rows.flatMap((c) =>
    (["old", "next"] as const).flatMap((side) => {
      const line = c[side];
      if (!line || line.amount !== null) return [];
      const baseline = side === "old";
      const rev = baseline ? old : r;
      const sheetId = baseline ? c.oldSheetId : c.newSheetId;
      return [
        {
          id: c.id,
          baseline,
          sheet:
            rev?.sheets.find((s) => s.id === sheetId)?.number ?? sheetId ?? "",
          reason: [...new Set(line.errors)].join(" · ") || "Amount unavailable",
          needsRate: line.rate === null,
        },
      ];
    }),
  );
  const unpricedIds = new Set(unresolved.map((item) => item.id));
  const pricedIds = new Set<string>();
  let accepted = 0,
    pending = 0,
    additions = 0,
    credits = 0;
  for (const c of rows) {
    // A unit change can span two rows. Include it only when both legs are valued.
    if (c.delta === null || unpricedIds.has(c.id)) continue;
    pricedIds.add(c.id);
    if (confirmed(r, c)) accepted += c.delta;
    else pending += c.delta;
    if (c.delta < 0) credits += c.delta;
    else additions += c.delta;
  }
  const unpriced = unpricedIds.size;
  const pricedSubtotal = round(accepted + pending);
  const needsRate = unresolved.every((entry) => entry.needsRate);
  const reason =
    unpriced === 0
      ? ""
      : unpriced === 1
        ? needsRate
          ? "1 changed item needs a rate."
          : "1 changed item cannot be priced."
        : unpriced +
          (needsRate
            ? " changed items need rates."
            : " changed items cannot be priced.");
  return {
    status: unpriced ? "Incomplete" : "Complete",
    proposed: unpriced ? null : pricedSubtotal,
    pricedSubtotal,
    pricedCount: pricedIds.size,
    confirmed: round(accepted),
    pending: round(pending),
    additions: round(additions),
    credits: round(credits),
    unpriced,
    unresolved,
    reason,
  };
}
export type VariationSummary = ReturnType<typeof reviewTotals>;
export const variationHeadline = (m: VariationSummary) =>
  "Total proposed variation: " +
  (m.proposed === null ? m.status : "PKR " + fmt(m.proposed));
export const pricedSubtotalText = (m: VariationSummary) =>
  m.unpriced && !m.pricedCount
    ? "No priced changes yet"
    : "PKR " + fmt(m.pricedSubtotal);
export function finalChecks(r: Rev, rows: Change[]) {
  return [
    ...exceptions(r),
    ...rows
      .filter((c) => !confirmed(r, c))
      .map((c) => c.id + " · " + c.description + " awaiting confirmation"),
    ...rows
      .filter((c) => c.delta === null)
      .map((c) => c.id + " · Variation has an unresolved amount"),
  ];
}
export const sheetLabel = (s: Sheet | undefined) =>
  s ? s.number + " · " + s.name.replace(/ HVAC Plan$/i, "") : "Unpaired sheet";
export function keepValidApprovals(
  before: Rev,
  after: Rev,
  old: Rev | undefined,
) {
  if (!before.approved.length) return [];
  const previous = changes(old, before);
  const evidence = (r: Rev, c: Change) => {
    const i = r.items.find((i) => i.id === c.id),
      s = r.sheets.find((s) => s.id === i?.sheet);
    return JSON.stringify([
      c,
      i && [
        i.sheet,
        i.pts,
        i.kind,
        i.width,
        i.height,
        i.diameter,
        i.rise,
        i.count,
        i.waste,
        i.code,
        i.groupCode || i.code,
        i.spec,
        i.system,
        i.zone,
        i.decision || "",
        pricingUnit(i, r),
      ],
      s && [s.doc, s.page, s.scale, s.mixed ?? false],
    ]);
  };
  return changes(old, after)
    .filter((c) => {
      const was = previous.find((v) => v.key === c.key);
      return (
        was &&
        confirmed(before, was) &&
        evidence(before, was) === evidence(after, c)
      );
    })
    .map((c) => c.key);
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
