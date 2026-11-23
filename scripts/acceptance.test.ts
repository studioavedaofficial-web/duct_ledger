import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import {
  boq,
  calculate,
  changes,
  exceptions,
  newProject,
  totals,
  type Rev,
  type Item,
} from "../src/model";
import {
  makeSampleItems,
  makeSampleRates,
  makeSampleSheets,
} from "../src/sampleLayout";
import {
  estimateBook,
  populate,
  readClient,
  targetCells,
  readRateRows,
} from "../src/books";
function fixture(id: "A" | "B"): Rev {
  return {
    id,
    date: id === "A" ? "2026-10-05" : "2026-10-19",
    frozen: id === "A",
    items: makeSampleItems(id),
    sheets: makeSampleSheets(id),
    rates: makeSampleRates(id),
    queries: [],
    approved: [],
  };
}
test("A · 600 × 400 mm at 10 m costs PKR 50,000", () => {
  const r = fixture("A"),
    q = calculate(r.items[0], r);
  assert.equal(q.length, 10);
  assert.equal(q.area, 20);
  assert.equal(q.amount, 50000);
  assert.deepEqual(q.errors, []);
});
test("B · width-only change detected on an identical route", () => {
  const a = fixture("A"),
    b = fixture("B");
  b.rates = structuredClone(a.rates);
  const [c] = changes(a, b);
  assert.equal(c.description, "Resized");
  assert.equal(c.next?.net, 24);
  assert.equal(c.next!.quantity! - c.old!.quantity!, 4);
  assert.equal(c.delta, 10000);
  assert.equal(c.id, "SA-001");
});
test("C · scope and rate effects reconcile with frozen baseline", () => {
  const a = fixture("A"),
    b = fixture("B"),
    [c] = changes(a, b);
  assert.equal(c.old?.amount, 50000);
  assert.equal(c.next?.amount, 64800);
  assert.equal(c.scope, 10000);
  assert.equal(c.rate, 4800);
  assert.equal(c.delta, 14800);
  assert.equal(totals(b) - totals(a), 14800);
  assert.equal(changes(a, b).length, 1);
});
test("D · identical fitting addition and removal are equal opposites; reopening is idempotent", () => {
  const a = fixture("A"),
    b = structuredClone(a);
  b.items.push({
    ...structuredClone(a.items.find((i) => i.kind === "Elbow")!),
    id: "EL-NEW",
  });
  const c = structuredClone(b);
  c.items = c.items.filter((i) => i.id !== "EL-NEW");
  assert.equal(changes(a, b)[0].scope, 2400);
  assert.equal(changes(b, c)[0].scope, -2400);
  assert.deepEqual(changes(a, JSON.parse(JSON.stringify(b))), changes(a, b));
  assert.equal(changes(a, b).length, 1);
});
test("E · unresolved calibration, rates, unit, mapping, and explicit zero", () => {
  const r = fixture("B"),
    i = r.items[0],
    rate = r.rates[0];
  r.sheets[0].scale = null;
  assert.match(exceptions(r).join(" "), /Calibration/);
  r.sheets[0].scale = 0.025;
  rate.rate = null;
  assert.equal(calculate(i, r).amount, null);
  assert.ok(calculate(i, r).errors.includes("Rate missing"));
  rate.unit = "pc";
  assert.ok(
    calculate(i, r).errors.some((e) => e.startsWith("Needs remapping")),
  );
  i.code = "unknown";
  assert.ok(calculate(i, r).errors.includes("BOQ mapping unresolved"));
  rate.unit = "m²";
  rate.rate = 0;
  i.code = rate.code;
  assert.equal(calculate(i, r).amount, 0);
  assert.deepEqual(calculate(i, r).errors, []);
});
test("F · stable drawing IDs survive page reordering and project backup serialization", async () => {
  const a = fixture("A"),
    b = fixture("B"),
    p = newProject("Fixture", "Lahore");
  p.revs = [a, b];
  for (const id of ["A", "B"])
    p.documents[id] = (
      await readFile(
        "public/samples/ductledger-rev-" + id.toLowerCase() + ".pdf",
      )
    ).toString("base64");
  const before = totals(b);
  b.sheets.reverse();
  b.sheets.forEach((s, n) => (s.page = n + 1));
  const restored = JSON.parse(JSON.stringify(p));
  const r = restored.revs[1],
    i = r.items.find((x: Item) => x.id === "SA-001");
  assert.equal(r.sheets.find((x: { id: string }) => x.id === i.sheet).page, 2);
  assert.equal(calculate(i, r).length, 10);
  assert.equal(totals(r), before);
  assert.equal(restored.documents.B, p.documents.B);
});
test("G · client Excel round trip preserves formulas, formatting, unrelated cells and source", async () => {
  const b = fixture("B"),
    bytes = await readFile("public/samples/client-boq.xlsx"),
    wb = await readClient(new File([bytes], "client.xlsx"));
  const s = wb.worksheets[0];
  const font = structuredClone(s.getCell("B12").font),
    result = await populate(wb, s, b, 1, 3);
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(result);
  assert.equal(out.worksheets[0].getCell("C2").value, 24);
  assert.equal(out.worksheets[0].getCell("F12").formula, "SUM(F2:F8)");
  assert.equal(out.worksheets[0].getCell("B12").value, "CBC-MEP-26");
  assert.deepEqual(out.worksheets[0].getCell("B12").font, font);
  assert.ok(
    targetCells(s, b, 1, 6).every(
      (c) => c.error === "Target contains a formula",
    ),
  );
  const original = new ExcelJS.Workbook();
  await original.xlsx.load(bytes);
  assert.equal(original.worksheets[0].getCell("C2").value, null);
});
test("Circular duct, vertical riser, material waste, labour and fittings", () => {
  const r = fixture("A"),
    i = r.items[0];
  i.kind = "Circular duct";
  i.diameter = 500;
  i.waste = 10;
  assert.equal(calculate(i, r).net, Math.PI * 5);
  assert.equal(calculate(i, r).quantity, 17.27876);
  i.kind = "Vertical riser";
  i.rise = 3;
  assert.equal(calculate(i, r).net, 6);
  assert.equal(calculate(i, r).quantity, 6.6);
  r.rates[0].basis = "labour";
  assert.equal(calculate(i, r).quantity, 6);
  r.rates[0].unit = "m";
  assert.equal(calculate(i, r).net, 3);
  i.rise = null;
  assert.equal(calculate(i, r).amount, null);
  const f = r.items.find((i) => i.kind === "Elbow")!;
  f.waste = 30;
  assert.equal(calculate(f, r).quantity, 1);
});
test("Commercial unit change emits linked removal and addition with reconciled rounding", () => {
  const a = fixture("A"),
    b = fixture("B");
  b.rates[0].unit = "m";
  b.rates[0].rate = 733.335;
  const c = changes(a, b);
  assert.equal(c.length, 2);
  assert.equal(c[0].id, c[1].id);
  assert.equal(c[0].scope, -50000);
  assert.equal(c[1].scope, 7333.35);
  assert.equal(
    Math.round((c[0].delta! + c[1].delta!) * 100),
    Math.round((totals(b) - totals(a)) * 100),
  );
});
test("Draft/final gates, generated workbook and rate imports", async () => {
  const a = fixture("A"),
    b = fixture("B"),
    p = newProject("Test", "Lahore");
  p.revs = [a, b];
  await assert.rejects(() => estimateBook(p, b, a, false));
  const draft = await estimateBook(p, b, a, true);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(draft);
  assert.equal(w.worksheets.length, 5);
  assert.equal(w.getWorksheet("Variation summary")!.getCell("B7").value, 14800);
  b.approved = ["SA-001"];
  await estimateBook(p, b, a, false);
  b.queries.push({
    id: "Q1",
    sheet: b.sheets[0].id,
    pt: [50, 50],
    text: "Confirm gauge",
    response: "",
  });
  await assert.rejects(() => estimateBook(p, b, a, false));
  for (const ext of ["xlsx", "csv"]) {
    const file = new File(
      [await readFile("public/samples/contractor-rates." + ext)],
      "rates." + ext,
    );
    const rows = await readRateRows(file);
    assert.equal(rows.length, 8);
    assert.equal(rows[1][0], "GI-MAIN");
    assert.equal(Number(rows[1][3]), 2500);
  }
  assert.equal(boq(b).length, 7);
});

test("F · physical PDF page reordering keeps measured items linked to the paired drawing", async () => {
  const { PDFDocument } = await import("pdf-lib"),
    { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs"),
    { pairSheets } = await import("../src/model");
  const baseline = fixture("A"),
    rev = fixture("B"),
    source = await PDFDocument.load(
      await readFile("public/samples/ductledger-rev-b.pdf"),
    ),
    out = await PDFDocument.create();
  for (const page of await out.copyPages(source, [1, 0])) out.addPage(page);
  const bytes = await out.save(),
    doc = await getDocument({
      data: bytes,
      standardFontDataUrl: process.cwd() + "/public/pdf-assets/standard_fonts/",
    }).promise;
  const incoming = makeSampleSheets("reordered").map((s, n) => ({
    ...s,
    id: "incoming-" + n,
    scale: null,
  }));
  rev.sheets = pairSheets(incoming, baseline, ["M-102", "M-101"]);
  for (const s of rev.sheets) {
    assert.equal(s.scale, null);
    s.scale = 0.025;
    const pg = await doc.getPage(s.page);
    const text = (await pg.getTextContent()).items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    assert.ok(text.includes(s.number));
  }
  assert.equal(rev.sheets.find((s) => s.id === rev.items[0].sheet)!.page, 2);
  assert.equal(calculate(rev.items[0], rev).length, 10);
  assert.equal(calculate(rev.items[0], rev).amount, 64800);
  await doc.destroy();
});
test("Crescent baseline and GI-RA reconcile from exact numeric workbook lines", async () => {
  const a = fixture("A"),
    b = fixture("B"),
    p = newProject("Disposable Crescent", "Lahore");
  p.revs = [a, b];
  const snapshot = JSON.stringify(a),
    g = boq(b).find((g) => g.code === "GI-RA")!;
  assert.equal(totals(a), 249971.26);
  assert.equal(totals(b), 264771.26);
  assert.deepEqual(
    g.lines.map((l) => l.calc.quantity),
    [17.29, 2.1875, 17.29, 2.1875],
  );
  assert.equal(g.quantity, 38.955);
  assert.deepEqual(
    g.lines.map((l) => l.calc.amount),
    [37173.5, 4703.13, 37173.5, 4703.13],
  );
  assert.equal(g.amount, 83753.26);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await estimateBook(p, b, a, true));
  const line = w
    .getWorksheet("BOQ")!
    .getRows(3, 7)!
    .find((row) => row.getCell(1).value === "GI-RA")!;
  assert.equal(line.getCell(3).value, 38.955);
  assert.equal(line.getCell(5).value, 83753.26);
  let cents = 0;
  w.getWorksheet("Estimate")!.eachRow((row) => {
    if (row.getCell(8).value !== "GI-RA") return;
    const [q, rate, amount] = [15, 17, 18].map((col) => row.getCell(col).value);
    assert.equal(typeof q, "number");
    assert.equal(typeof rate, "number");
    assert.equal(typeof amount, "number");
    assert.equal(Number((Number(q) * Number(rate)).toFixed(2)), amount);
    cents += Math.round(Number(amount) * 100);
  });
  assert.equal(cents / 100, line.getCell(5).value);
  assert.equal(JSON.stringify(a), snapshot);
});
test("Mixed rates are disclosed and unresolved lines stay out of priced subtotals", async () => {
  const a = fixture("A"),
    r = fixture("B"),
    p = newProject("Mixed", "Lahore");
  p.revs = [a, r];
  const it = r.items.find((i) => i.id === "RA-002")!;
  it.groupCode = "GI-RA";
  it.code = "RA-ALT";
  r.rates.push({
    code: it.code,
    description: "Insulated branch",
    unit: "m²",
    rate: 2600,
  });
  let g = boq(r).find((g) => g.code === "GI-RA")!;
  assert.equal(g.mixedRates, true);
  assert.equal(g.unitRate, null);
  assert.equal(g.lines[1].calc.rate, 2600);
  const w = new ExcelJS.Workbook();
  await w.xlsx.load(await estimateBook(p, r, a, true));
  const excel = w
    .getWorksheet("BOQ")!
    .getRows(3, 7)!
    .find((v) => v.getCell(1).value === "GI-RA")!;
  assert.equal(excel.getCell(6).value, "Mixed rates");
  assert.equal(excel.getCell(5).value, g.amount);
  r.rates.at(-1)!.rate = null;
  g = boq(r).find((g) => g.code === "GI-RA")!;
  assert.equal(g.excluded, 1);
  assert.equal(g.amount, 79050.13);
  assert.equal(calculate(it, r).amount, null);
  r.rates.at(-1)!.rate = 0;
  assert.equal(calculate(it, r).amount, 0);
  assert.equal(boq(r).find((g) => g.code === "GI-RA")!.excluded, 0);
});
test("Real commercial units stay distinct while equivalent spellings agree", async () => {
  const { pricingUnit, mappingIssue, normalizeUnit, finalChecks } =
    await import("../src/model");
  const r = fixture("B"),
    i = r.items[0];
  assert.equal(pricingUnit(i, r), "m²");
  for (const u of ["m²", "m2", "sqm"])
    assert.equal(mappingIssue("m²", { ...r.rates[0], unit: u as any }), "");
  for (const u of ["pc", "pcs", "piece"]) assert.equal(normalizeUnit(u), "pc");
  for (const u of ["m", "pcs"])
    assert.match(
      mappingIssue("m²", { ...r.rates[0], unit: u as any }),
      /Needs remapping/,
    );
  i.pricingUnit = "m²";
  r.rates[0].unit = "m";
  assert.equal(calculate(i, r).amount, null);
  assert.ok(finalChecks(r, []).some((m) => m.includes("Needs remapping")));
  i.pricingUnit = "m";
  assert.equal(calculate(i, r).quantity, 10);
  assert.equal(calculate(i, r).amount, 27000);
});
test("Pending / confirmed money, credits and unit-change legs partition once", async () => {
  const { reviewTotals, keepValidApprovals } = await import("../src/model");
  const a = fixture("A"),
    b = fixture("B"),
    rows = changes(a, b);
  assert.deepEqual([rows[0].scope, rows[0].rate], [10000, 4800]);
  assert.deepEqual(reviewTotals(rows, b), {
    confirmed: 0,
    pending: 14800,
    proposed: 14800,
    status: "Complete",
    reason: "",
    unresolved: [],
    pricedCount: 1,
    pricedSubtotal: 14800,
    credits: 0,
    additions: 14800,
    unpriced: 0,
  });
  b.approved = [rows[0].key];
  assert.equal(reviewTotals(rows, b).confirmed, 14800);
  const edit = structuredClone(b);
  edit.items[0].width = 850;
  assert.deepEqual(keepValidApprovals(b, edit, a), []);
  const priceEdit = structuredClone(b);
  priceEdit.rates[0].rate = 2800;
  assert.deepEqual(keepValidApprovals(b, priceEdit, a), []);
  assert.deepEqual(keepValidApprovals(b, structuredClone(b), a), ["SA-001"]);
  const unrelated = structuredClone(b);
  unrelated.rates.find((v) => v.code === "FT-EL")!.rate = 999;
  assert.deepEqual(keepValidApprovals(b, unrelated, a), ["SA-001"]);
  const u = fixture("B");
  u.rates[0].unit = "m";
  const legs = changes(a, u);
  assert.equal(legs.length, 2);
  u.approved = [legs[0].key];
  const sum = reviewTotals(legs, u);
  assert.equal(sum.confirmed, -50000);
  assert.equal(sum.pending, 27000);
  assert.equal(sum.proposed, -23000);
});

test("Old-side, incompatible-unit and missing-quantity changes retain their unknown amount", async () => {
  const { reviewTotals, quantityDifference } = await import("../src/model");
  const a = fixture("A"),
    b = fixture("B");
  a.sheets[0].number = "M-101A";
  a.rates[0].rate = null;
  const oldMissing = reviewTotals(changes(a, b), b, a);
  assert.equal(oldMissing.proposed, null);
  assert.equal(oldMissing.unpriced, 1);
  assert.equal(oldMissing.unresolved[0].baseline, true);
  assert.equal(oldMissing.unresolved[0].sheet, "M-101A");
  a.rates[0].rate = 2500;
  b.rates[0].unit = "pc";
  const incompatible = reviewTotals(changes(a, b), b, a);
  assert.equal(incompatible.proposed, null);
  assert.match(incompatible.unresolved[0].reason, /Needs remapping/);
  b.rates[0].unit = "m";
  b.rates[0].rate = null;
  const split = reviewTotals(changes(a, b), b, a);
  assert.equal(split.unpriced, 1);
  assert.equal(split.pricedCount, 0);
  assert.equal(split.pricedSubtotal, 0);
  b.rates[0].unit = "m²";
  b.rates[0].rate = 2500;
  b.items[0].width = null;
  const [missingQty] = changes(a, b);
  assert.equal(quantityDifference(missingQty), null);
  b.items[0].width = a.items[0].width;
  b.items[0].review = true;
  assert.equal(reviewTotals(changes(a, b), b, a).proposed, null);
});

test("Fifty-duct revision exports eight resized lines, complete totals and separate calibrated geometry", async () => {
  const { estimateCsv } = await import("../src/books");
  const { default: Papa } = await import("papaparse");
  const p = newProject("Fifty-run tender", "Lahore");
  const a = fixture("A");
  const original = a.items[0];
  a.items = Array.from({ length: 50 }, (_, index) => ({
    ...structuredClone(original),
    id: "SA-" + String(index + 1).padStart(3, "0"),
    pts: [
      [100, 30 + index * 10],
      [340, 30 + index * 10],
    ],
  }));
  a.rates[0].rate = 2700;
  const b = structuredClone(a);
  b.id = "B";
  b.frozen = false;
  b.items.slice(0, 8).forEach((i) => {
    i.width = 800;
  });
  b.measurements = [
    {
      id: "AREA-1",
      sheet: b.sheets[0].id,
      kind: "Polygon",
      points: [
        [0, 0],
        [200, 0],
        [200, 160],
        [0, 160],
      ],
      cutouts: [
        [
          [40, 40],
          [120, 40],
          [120, 80],
          [40, 80],
        ],
      ],
    },
  ];
  p.revs = [a, b];
  assert.equal(boq(a)[0].quantity, 600);
  assert.equal(boq(b)[0].quantity, 619.2);
  assert.equal(totals(a), 1620000);
  assert.equal(totals(b), 1671840);
  const revised = changes(a, b);
  assert.equal(revised.length, 8);
  assert.equal(
    revised.reduce((n, c) => n + c.delta!, 0),
    51840,
  );
  assert.throws(
    () => estimateCsv(p, b, a, false, "Estimate"),
    /awaiting confirmation/,
  );
  b.approved = revised.map((c) => c.key);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await estimateBook(p, b, a, false));
  assert.equal(
    workbook.getWorksheet("Variation summary")!.getCell("B7").value,
    51840,
  );
  assert.deepEqual(
    (
      workbook.getWorksheet("Drawing measurements")!.getRow(3)
        .values as unknown[]
    ).slice(4),
    [20, 2, 18, "m²"],
  );
  const parsed = (table: Parameters<typeof estimateCsv>[4]) =>
    Papa.parse<Record<string, string>>(estimateCsv(p, b, a, false, table), {
      header: true,
    }).data;
  assert.deepEqual(
    [parsed("Estimate").length, parsed("Detailed changes").length],
    [50, 8],
  );
  assert.equal(
    parsed("Estimate").reduce((sum, row) => sum + Number(row["Amount PKR"]), 0),
    1671840,
  );
  assert.deepEqual(
    parsed("Drawing measurements").map((row) => [
      row.Issue,
      row.Gross,
      row.Deducted,
      row.Net,
      row.Unit,
    ]),
    [["FINAL", "20", "2", "18", "m²"]],
  );
  assert.equal(
    parsed("Variation summary").find(
      (row) => row.Metric === "Total proposed variation",
    )?.Value,
    "51840",
  );
});
