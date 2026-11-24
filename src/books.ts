import {
  currencySymbol,
  shown,
  unitLabel,
  setProjectRegion,
  regionalText,
} from "./region";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import Papa from "papaparse";
import { measurementValues } from "./geometry";
import {
  finalChecks,
  confirmed,
  reviewTotals,
  variationHeadline,
  moneyPolicy,
  sheetLabel,
  quantityExplanation,
  quantityDifference,
  boq,
  calculate,
  changes,
  totals,
  type Project,
  type Rev,
} from "./model";
export { normalizeUnit } from "./model";
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
export const csvTables = [
  "Estimate",
  "BOQ",
  "Variation summary",
  "Detailed changes",
  "Outstanding queries",
  "Drawing measurements",
] as const;
export type CsvTable = (typeof csvTables)[number];

export function drawingMeasurementRows(r: Rev) {
  return (r.measurements ?? []).map((m) => {
    const sheet = r.sheets.find((s) => s.id === m.sheet);
    const values = measurementValues(
      m,
      sheet && !sheet.mixed ? sheet.scale : null,
    );
    return [
      m.id,
      sheet?.number,
      m.kind,
      values.gross,
      values.deducted,
      values.net,
      values.unit,
    ];
  });
}
export const drawingMeasurementHeaders = [
  "ID",
  "Sheet",
  "Geometry",
  "Gross",
  "Deducted",
  "Net",
  "Unit",
];

function estimateWorkbook(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  setProjectRegion(p.regionalSettings);
  const wb = new ExcelJS.Workbook(),
    issue = draft ? "DRAFT" : "FINAL",
    rows = changes(old, r);
  const checks = finalChecks(r, rows),
    money = reviewTotals(rows, r, old);
  if (!draft && checks.length) throw Error(checks.join(" · "));
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
      "Length " + unitLabel("length"),
      "Width " + unitLabel("size"),
      "Height " + unitLabel("size"),
      "Diameter " + unitLabel("size"),
      "Net quantity",
      "Waste %",
      "Priced quantity",
      "Unit",
      `Rate ${currencySymbol()}`,
      `Amount ${currencySymbol()}`,
      "Exceptions",
      "Quantity calculation",
      "BOQ roll-up",
      `Mapped amount ${currencySymbol()}`,
      "Additional labour quantity",
      `Additional labour rate ${currencySymbol()}`,
      `Additional labour amount ${currencySymbol()}`,
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
        shown(c.length, "length"),
        shown(i.width, "size"),
        shown(i.height, "size"),
        shown(i.diameter, "size"),
        c.net,
        i.waste,
        c.quantity,
        c.unit,
        c.rate,
        c.amount,
        c.errors.join(", "),
        quantityExplanation(i, r),
        i.groupCode || i.code,
        c.baseAmount,
        c.labourQuantity,
        c.labourRate,
        c.labourAmount,
      ];
    }),
  );
  add(
    "BOQ",
    [
      "Code",
      "Description",
      "Exact priced quantity",
      "Unit",
      `Priced subtotal ${currencySymbol()}`,
      `Unit rate ${currencySymbol()}`,
      "Excluded items",
      "Calculation policy",
    ],
    boq(r).map((g) => [
      g.code,
      g.rate?.description,
      g.quantity,
      g.unit,
      g.amount,
      g.mixedRates ? "Mixed rates" : g.unitRate,
      g.excluded,
      moneyPolicy,
    ]),
  );
  const summarySheet = add(
    regionalText("Variation summary"),
    ["Metric", "Value", "Unit"],
    [
      ["Baseline priced subtotal", old ? totals(old) : 0, currencySymbol()],
      ["New priced subtotal", totals(r), currencySymbol()],
      ["Additions", money.additions, currencySymbol()],
      ["Credits", money.credits, currencySymbol()],
      [
        regionalText("Total proposed variation"),
        money.proposed,
        currencySymbol(),
      ],
      ["Confirmed priced subtotal", money.confirmed, currencySymbol()],
      ["Pending priced subtotal", money.pending, currencySymbol()],
      ["Pricing status", money.status],
      ["Priced changes subtotal", money.pricedSubtotal, currencySymbol()],
      ["Unresolved changed items", money.unpriced, "items"],
      ...(money.reason ? [["Pricing check", money.reason]] : []),
      ...(money.unpriced && !money.pricedCount
        ? [["Priced changes", "No priced changes yet"]]
        : []),
      [
        "Unresolved estimate items excluded (count)",
        r.items.filter((i) => calculate(i, r).amount === null).length,
        "items",
      ],
    ],
  );
  for (const row of [3, 4, 5, 6, 7, 8, 9, 11])
    summarySheet.getCell(row, 2).numFmt = "#,##0.00";
  summarySheet.getCell("D3").value = variationHeadline(money);
  for (const row of [3, 4, 5, 6, 7, 8, 9, 11])
    summarySheet.getCell(row, 2).numFmt = "#,##0.00";
  summarySheet.getCell("D3").font = { bold: true };
  if (money.reason) summarySheet.getCell("D4").value = money.reason;
  summarySheet.getColumn(4).width = 48;
  summarySheet.getColumn(1).width = 43;
  summarySheet.getColumn(2).width = 36;
  add(
    "Detailed changes",
    [
      "ID",
      "Change",
      "Baseline sheet",
      "Revised sheet",
      "Old quantity",
      "Old unit",
      `Old rate ${currencySymbol()}`,
      `Old amount ${currencySymbol()}`,
      "New quantity",
      "New unit",
      `New rate ${currencySymbol()}`,
      `New amount ${currencySymbol()}`,
      `Scope ${currencySymbol()}`,
      `Rate effect ${currencySymbol()}`,
      `Net ${currencySymbol()}`,
      "Review",
      "Revision dates",
      "Quantity difference",
      "Old calculation",
      "New calculation",
    ],
    rows.map((x) => [
      x.id,
      x.description,
      x.oldSheetId
        ? sheetLabel(old?.sheets.find((s) => s.id === x.oldSheetId))
        : "",
      x.newSheetId
        ? sheetLabel(r.sheets.find((s) => s.id === x.newSheetId))
        : "",
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
      confirmed(r, x) ? "Confirmed" : "Pending",
      [old?.date, r.date].join(" / "),
      quantityDifference(x),
      x.old && old
        ? quantityExplanation(old.items.find((i) => i.id === x.id)!, old)
        : "",
      x.next ? quantityExplanation(r.items.find((i) => i.id === x.id)!, r) : "",
    ]),
  );
  add(
    "Outstanding queries",
    ["ID", "Sheet", "Query or exception", "Response"],
    [
      ...money.unresolved.map((item) => [
        item.id,
        item.sheet,
        item.reason,
        item.baseline ? "Baseline" : "Revised",
      ]),
      ...r.queries.map((q) => [
        q.id,
        r.sheets.find((s) => s.id === q.sheet)?.number,
        q.text,
        q.response,
      ]),
      ...checks
        .filter((e) => !r.queries.some((q) => e === q.id + " · " + q.text))
        .map((e) => ["", "", "Exception", e]),
    ],
  );
  if (r.measurements?.length)
    add(
      "Drawing measurements",
      drawingMeasurementHeaders,
      drawingMeasurementRows(r),
    );
  for (const [name, cols, format] of [
    ["Estimate", [13, 15], "0.######"],
    ["Estimate", [18], "#,##0.00"],
    ["BOQ", [3], "0.######"],
    ["BOQ", [5], "#,##0.00"],
    ["Detailed changes", [5, 9], "0.######"],
    ["Detailed changes", [8, 12, 13, 14, 15], "#,##0.00"],
  ] as const) {
    const ws = wb.getWorksheet(name)!;
    ws.eachRow((row, n) => {
      if (n > 2) for (const col of cols) row.getCell(col).numFmt = format;
    });
  }
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
  return wb;
}

export async function estimateBook(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  return estimateWorkbook(p, r, old, draft).xlsx.writeBuffer();
}

export function estimateCsv(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
  table: CsvTable,
) {
  const workbook = estimateWorkbook(p, r, old, draft);
  const sheet = workbook.getWorksheet(regionalText(table));
  if (!sheet) throw Error("No records for this table.");
  const count = sheet.getRow(2).actualCellCount;
  const rowCells = (n: number) =>
    Array.from({ length: count }, (_, col) => {
      const cell = sheet.getRow(n).getCell(col + 1);
      return typeof cell.value === "number" ? cell.value : cell.text;
    });
  const prefix = [p.name, r.id, r.date, draft ? "DRAFT" : "FINAL"];
  const records = [["Project", "Revision", "Date", "Issue", ...rowCells(2)]];
  for (let n = 3; n <= sheet.rowCount; n++)
    records.push([...prefix, ...rowCells(n)]);
  return Papa.unparse(records, { escapeFormulae: true });
}
