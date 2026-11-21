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
  assert.ok(calculate(i, r).errors.includes("Incompatible rate unit"));
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
