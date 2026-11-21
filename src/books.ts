import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";
import {
quantityExplanation,
boq,
calculate,
changes,
exceptions,
round,
totals,
type Project,
type Rev,
type Unit,
} from "./model";
export function normalizeUnit(v: string): Unit | null {
  const text = v.trim().toLowerCase();
  return ["m²", "m2", "sqm", "m^2"].includes(text)
    ? "m²"
    : ["m", "metre", "meter", "rm"].includes(text)
      ? "m"
      : ["pc", "pcs", "piece", "ea", "no", "nos"].includes(text)
        ? "pc"
        : null;
}
export async function readRateRows(file: File): Promise<string[][]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const result = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: "greedy",
    });
    if (result.errors.some((e) => e.code === "MissingQuotes"))
      throw new Error("Invalid CSV quotes");
    return result.data;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const s = wb.worksheets[0];
  if (!s) throw new Error("Workbook has no worksheets");
  const rows: string[][] = [];
  s.eachRow((row) =>
    rows.push(
      Array.from({ length: s.columnCount }, (_, c) => row.getCell(c + 1).text),
    ),
  );
  return rows;
}
export async function readClient(file: File) {
  const bytes = await file.arrayBuffer(),
    z = await JSZip.loadAsync(bytes);
  if (
    Object.keys(z.files).some((k) =>
      /vbaProject|pivot|slicer|drawing|externalLinks|ctrlProps|embeddings|activeX|connections|threadedComment|tables\/|customXml|calcChain|charts\//i.test(
        k,
      ),
    )
  )
    throw new Error(
      "This workbook contains unsupported features. Use the generated workbook export.",
    );
  for (const name of Object.keys(z.files).filter((k) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(k),
  )) {
    if (
      /<(?:\w+:)?(?:sheetProtection|extLst|dataValidations|conditionalFormatting)\b/.test(
        await z.file(name)!.async("string"),
      )
    )
      throw new Error(
        "Advanced or protected worksheet detected. Use the generated workbook export.",
      );
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook;
}
export function targetCells(
  sheet: ExcelJS.Worksheet,
  rev: Rev,
  codeCol: number,
  qtyCol: number,
) {
  const groups = boq(rev),
    rows: {
      address: string;
      code: string;
      quantity: number | null;
      error: string;
    }[] = [];
  let seen = new Set<string>();
  if (codeCol === qtyCol) throw new Error("Choose two different columns");
  sheet.eachRow((row) => {
    const code = row.getCell(codeCol).text.trim(),
      group = groups.find((g) => g.code === code);
    if (!group) return;
    const cell = row.getCell(qtyCol);
    rows.push({
      address: cell.address,
      code,
      quantity: group.quantity,
      error:
        cell.type === ExcelJS.ValueType.Formula
          ? "Target contains a formula"
          : cell.isMerged
            ? "Merged target cell"
            : seen.has(code)
              ? "Duplicate destination code"
              : group.quantity === null
                ? "Unresolved quantity"
                : "",
    });
    seen.add(code);
  });
  for (const g of groups)
    if (!seen.has(g.code))
      rows.push({
        address: "—",
        code: g.code,
        quantity: g.quantity,
        error: "No matching BOQ row",
      });
  return rows;
}
export async function populate(
  wb: ExcelJS.Workbook,
  s: ExcelJS.Worksheet,
  r: Rev,
  c: number,
  q: number,
) {
  const cells = targetCells(s, r, c, q);
  if (!cells.length || cells.some((x) => x.error))
    throw new Error("Resolve destination exceptions first");
  for (const x of cells) s.getCell(x.address).value = x.quantity;
  return wb.xlsx.writeBuffer();
}
export async function estimateBook(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  const wb = new ExcelJS.Workbook(),
    issue = draft ? "DRAFT" : "FINAL",
    rows = changes(old, r),
    open = exceptions(r);
  if (!draft && (open.length || rows.some((x) => !r.approved.includes(x.id))))
    throw new Error("Resolve exceptions and confirm changes before issue");
  function add(
    name: string,
    cols: string[],
    data: (string | number | null | undefined)[][],
  ) {
    const s = wb.addWorksheet(name);
    s.addRow([p.name, issue, "Revision " + r.id, r.date]);
    s.addRow(cols);
    data.forEach((x) => s.addRow(x));
    s.views = [{ state: "frozen", ySplit: 2 }];
    s.columns.forEach((c) => (c.width = 23));
    s.getRow(2).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF20483E" },
      };
    });
    return s;
  }
  add(
    "Estimate",
    [
      "Item",
      "Sheet",
      "Page",
      "Type",
      "System",
      "Zone",
      "Material",
      "BOQ code",
      "Length m",
      "Width mm",
      "Height mm",
      "Diameter mm",
      "Net quantity",
      "Waste %",
      "Priced quantity",
      "Unit",
      "Rate PKR",
      "Amount PKR",
      "Exceptions",
      "Quantity calculation",
    ],
    r.items.map((i) => {
      const c = calculate(i, r),
        s = r.sheets.find((x) => x.id === i.sheet)!;
      return [
        i.id,
        s.number,
        s.page,
        i.kind,
        i.system,
        i.zone,
        i.spec,
        i.code,
        c.length,
        i.width,
        i.height,
        i.diameter,
        c.net,
        i.waste,
        c.quantity,
        c.unit,
        c.rate,
        c.amount,
        c.errors.join(", "),
        quantityExplanation(i, r),
      ];
    }),
  );
  add(
    "BOQ",
    ["Code", "Description", "Quantity", "Unit", "Amount PKR"],
    boq(r).map((g) => [
      g.code,
      g.rate?.description,
      g.quantity,
      g.rate?.unit,
      g.amount,
    ]),
  );
  add(
    "Variation summary",
    ["Metric", "PKR"],
    [
      ["Baseline priced subtotal", old ? totals(old) : 0],
      ["New priced subtotal", totals(r)],
      [
        "Additions",
        round(rows.reduce((a, x) => a + Math.max(0, x.delta ?? 0), 0)),
      ],
      [
        "Credits",
        round(rows.reduce((a, x) => a + Math.min(0, x.delta ?? 0), 0)),
      ],
      [
        "Net priced variation",
        round(rows.reduce((a, x) => a + (x.delta ?? 0), 0)),
      ],
    ],
  );
  add(
    "Detailed changes",
    [
      "ID",
      "Change",
      "Baseline sheet",
      "Revised sheet",
      "Old quantity",
      "Old unit",
      "Old rate PKR",
      "Old amount PKR",
      "New quantity",
      "New unit",
      "New rate PKR",
      "New amount PKR",
      "Scope PKR",
      "Rate effect PKR",
      "Net PKR",
      "Review",
      "Revision dates",
      "Quantity difference",
      "Old calculation",
      "New calculation",
    ],
    rows.map((x) => [
      x.id,
      x.description,
      old?.sheets.find(
        (s) => s.id === old.items.find((i) => i.id === x.id)?.sheet,
      )?.number,
      r.sheets.find((s) => s.id === r.items.find((i) => i.id === x.id)?.sheet)
        ?.number,
      x.old?.quantity,
      x.old?.unit,
      x.old?.rate,
      x.old?.amount,
      x.next?.quantity,
      x.next?.unit,
      x.next?.rate,
      x.next?.amount,
      x.scope,
      x.rate,
      x.delta,
      r.approved.includes(x.id) ? "Confirmed" : "Review",
      [old?.date, r.date].join(" / "),
      (x.next?.quantity ?? 0) - (x.old?.quantity ?? 0),
      x.old && old
        ? quantityExplanation(
            old.items.find((i) => i.id === x.id)!,
            old,
          )
        : "",
      x.next
        ? quantityExplanation(
            r.items.find((i) => i.id === x.id)!,
            r,
          )
        : "",
    ]),
  );
  add(
    "Outstanding queries",
    ["ID", "Sheet", "Query or exception", "Response"],
    [
      ...r.queries.map((q) => [
        q.id,
        r.sheets.find((s) => s.id === q.sheet)?.number,
        q.text,
        q.response,
      ]),
      ...open.map((e) => ["", "", "", e]),
      ...rows
        .filter((x) => !r.approved.includes(x.id))
        .map((x) => [x.id, "", "Change awaiting confirmation", ""]),
    ],
  );
  if (typeof window !== "undefined") {
    function link(sheet: string, row: number, id: string, revision: string) {
      const url = new URL(window.location.pathname, window.location.origin);
      url.search = new URLSearchParams({
        project: p.id,
        revision,
        item: id,
      }).toString();
      const cell = wb.getWorksheet(sheet)!.getCell(row, 1);
      cell.value = {
        text: id,
        hyperlink: url.href,
        tooltip: "Open this measured item in DuctLedger",
      };
      cell.font = { underline: true, color: { argb: "FF266144" } };
    }
    r.items.forEach((i, n) => link("Estimate", n + 3, i.id, r.id));
    rows.forEach((c, n) =>
      link("Detailed changes", n + 3, c.id, c.side === "old" ? old!.id : r.id),
    );
  }
  return wb.xlsx.writeBuffer();
}
