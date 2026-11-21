import ExcelJS from "exceljs";
import { writeFile } from "node:fs/promises";
import { sampleRates } from "../src/sampleLayout";
const folder = "public/samples/";
const head = [
  "Item code",
  "Description",
  "Unit",
  "Rate (PKR/unit)",
  "Effective date",
];
const rateBook = new ExcelJS.Workbook(),
  rs = rateBook.addWorksheet("Contractor rates");
rs.addRow(head);
const rows = sampleRates.map((r) => [
  r.code,
  r.description,
  r.unit,
  r.rate,
  "2026-10-05",
]);
rows.forEach((x) => rs.addRow(x));
function style(s: ExcelJS.Worksheet) {
  s.columns.forEach((c, i) => (c.width = i === 1 ? 45 : 22));
  s.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF294F37" },
    };
  });
  s.views = [{ state: "frozen", ySplit: 1 }];
}
style(rs);
await rateBook.xlsx.writeFile(folder + "contractor-rates.xlsx");
await writeFile(
  folder + "contractor-rates.csv",
  [head, ...rows].map((r) => r.join(",")).join("\n") + "\n",
);
const client = new ExcelJS.Workbook(),
  s = client.addWorksheet("Mechanical BOQ");
s.addRow([
  "Item code",
  "Description",
  "Quantity",
  "Unit",
  "Reference rate (PKR)",
  "Amount (PKR)",
]);
sampleRates.forEach((r, i) =>
  s.addRow([
    r.code,
    r.description,
    null,
    r.unit,
    r.rate,
    { formula: "C" + (i + 2) + "*E" + (i + 2), result: 0 },
  ]),
);
style(s);
s.getCell("A12").value = "Client tender reference";
s.getCell("B12").value = "CBC-MEP-26";
s.getCell("B12").font = { bold: true, color: { argb: "FF367B48" } };
s.getCell("F12").value = { formula: "SUM(F2:F8)", result: 0 };
client.calcProperties.fullCalcOnLoad = true;
await client.xlsx.writeFile(folder + "client-boq.xlsx");
