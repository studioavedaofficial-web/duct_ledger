import { useState } from "react";
import type ExcelJS from "exceljs";
import { FileUp } from "lucide-react";
import { Field, Choice, Modal } from "./ui";
import {
  normalizeUnit,
  pricingUnit,
  mappingIssue,
  fmt,
  type Rev,
  type Rate,
  type Project,
} from "./model";
import {
  readRateRows,
  readClient,
  targetCells,
  populate,
  estimateBook,
} from "./books";
import { download } from "./io";
export function RatesDialog({
  r,
  close,
  apply,
}: {
  r: Rev;
  close: () => void;
  apply: (v: Rate[]) => void;
}) {
  const [rows, setRows] = useState<string[][]>([]),
    [mapping, map] = useState([0, 1, 2, 3, -1]),
    [editing, setEdit] = useState<Rate[] | null>(null),
    [err, error] = useState(""),
    [name, setName] = useState("");
  const labels = [
    "Item code",
    "Description",
    "Unit",
    "Rate (PKR/unit)",
    "Effective date",
  ];
  const mapped =
    editing ??
    rows
      .slice(1)
      .filter((row) => row.some(Boolean))
      .map(
        (row) =>
          ({
            code: (row[mapping[0]] ?? "").trim(),
            description: row[mapping[1]] ?? "",
            unit: normalizeUnit(row[mapping[2]] ?? "") ?? row[mapping[2]] ?? "",
            rate: row[mapping[3]]?.trim()
              ? Number(row[mapping[3]].replaceAll(",", ""))
              : null,
            date: row[mapping[4]] ?? "",
          }) as Rate,
      );
  function errors(i: number) {
    const v = mapped[i];
    return [
      !v.code ? "Missing code" : "",
      mapped.some((o, j) => j !== i && o.code === v.code)
        ? "Duplicate code"
        : "",
      !normalizeUnit(v.unit) ? "Unsupported unit" : "",
      ...r.items
        .filter((it) => it.code === v.code || it.groupCode === v.code)
        .map((it) => {
          const issue = mappingIssue(pricingUnit(it, r), v);
          return issue ? it.id + " · " + issue : "";
        })
        .filter(Boolean)
        .slice(0, 1),
      v.rate == null || !Number.isFinite(v.rate) || v.rate < 0
        ? "Missing or invalid rate"
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const field = (i: number, k: keyof Rate, v: unknown) =>
    setEdit(mapped.map((row, n) => (n === i ? { ...row, [k]: v } : row)));
  return (
    <Modal title="Contractor rate sheet" close={close} wide>
      <p className="intro">
        Map your rate sheet columns and review prices before applying them to
        Revision {r.id}.
      </p>
      <label className="dropzone">
        <FileUp />
        <b>{name || "Choose a rate sheet"}</b>
        <span>Excel workbook (.xlsx) or CSV</span>
        <input
          type="file"
          accept=".xlsx,.csv"
          onChange={async (e) => {
            try {
              const f = e.target.files?.[0];
              if (!f) return;
              const rr = await readRateRows(f);
              if (rr.length < 2)
                throw Error("Include a header and at least one rate");
              setRows(rr);
              setEdit(null);
              setName(f.name);
              error("");
              map(
                labels.map((_, i) => {
                  const re = [
                    /code/i,
                    /desc/i,
                    /^unit$/i,
                    /rate|price/i,
                    /date/i,
                  ][i];
                  const n = rr[0].findIndex((h) => re.test(h));
                  return n < 0 ? (i === 4 ? -1 : i) : n;
                }),
              );
            } catch (e) {
              error(String(e));
            }
          }}
        />
      </label>
      {rows.length > 0 && (
        <div className="mapfields">
          {labels.map((l, i) => (
            <Field label={l} key={l}>
              <Choice
                value={mapping[i]}
                onChange={(e) => {
                  map(mapping.map((v, j) => (j === i ? +e.target.value : v)));
                  setEdit(null);
                }}
              >
                <option value="-1">{i === 4 ? "None" : "Select column"}</option>
                {rows[0].map((c, n) => (
                  <option value={n} key={n}>
                    {c || "Column " + (n + 1)}
                  </option>
                ))}
              </Choice>
            </Field>
          ))}
        </div>
      )}
      {(rows.length > 0 || editing) && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {[
                  "Code",
                  "Description",
                  "Unit",
                  "PKR / unit",
                  "Basis",
                  "Review",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mapped.map((v, i) => (
                <tr key={i}>
                  <td>
                    <input
                      aria-label="Item code"
                      value={v.code}
                      onChange={(e) => field(i, "code", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Description"
                      value={v.description}
                      onChange={(e) => field(i, "description", e.target.value)}
                    />
                  </td>
                  <td>
                    <Choice
                      value={normalizeUnit(v.unit) ?? v.unit}
                      onChange={(e) => field(i, "unit", e.target.value)}
                    >
                      {!normalizeUnit(v.unit) && <option>{v.unit}</option>}
                      {["m²", "m", "pc"].map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </Choice>
                  </td>
                  <td>
                    <input
                      aria-label="Rate in PKR"
                      type="number"
                      min="0"
                      value={v.rate ?? ""}
                      onChange={(e) =>
                        field(
                          i,
                          "rate",
                          e.target.value === "" ? null : +e.target.value,
                        )
                      }
                    />
                  </td>
                  <td>
                    <Choice
                      value={v.basis ?? "material"}
                      onChange={(e) => field(i, "basis", e.target.value)}
                    >
                      <option>material</option>
                      <option>labour</option>
                    </Choice>
                  </td>
                  <td>{errors(i) || "Ready"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {err && <p className="issue">{err}</p>}
      <div className="formactions">
        <a className="textlink" href="/samples/contractor-rates.xlsx" download>
          Sample rate sheet
        </a>
        {r.rates.length > 0 && !mapped.length && (
          <button
            className="secondary"
            onClick={() => setEdit(structuredClone(r.rates))}
          >
            Edit current rates
          </button>
        )}
        <button
          className="primary"
          disabled={!mapped.length || mapped.some((_, i) => !!errors(i))}
          onClick={() =>
            apply([
              ...r.rates.filter((x) => !mapped.some((v) => v.code === x.code)),
              ...mapped,
            ])
          }
        >
          Apply rates
        </button>
      </div>
    </Modal>
  );
}
export function ClientDialog({
  p,
  r,
  close,
  notify,
}: {
  p: Project;
  r: Rev;
  close: () => void;
  notify: (s: string) => void;
}) {
  const [wb, setW] = useState<ExcelJS.Workbook | null>(null),
    [sheet, setS] = useState(""),
    [code, setC] = useState(1),
    [qty, setQ] = useState(3),
    [err, error] = useState("");
  const s = wb?.getWorksheet(sheet),
    cells = s && code !== qty ? targetCells(s, r, code, qty) : [];
  return (
    <Modal title="Populate client BOQ" wide close={close}>
      <p className="intro">
        Write measured quantities to a copy of your client’s workbook. Review
        the destination cells before exporting.
      </p>
      <label className="dropzone">
        <FileUp />
        <b>Choose client workbook</b>
        <span>Simple Excel workbook (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx"
          onChange={async (e) => {
            try {
              const file = e.target.files?.[0];
              if (!file) return;
              setW(null);
              const w = await readClient(file);
              setW(w);
              setS(w.worksheets[0].name);
              error("");
            } catch (e) {
              error(String(e));
            }
          }}
        />
      </label>
      {wb && s && (
        <>
          <div className="mapfields">
            <Field label="Worksheet">
              <Choice value={sheet} onChange={(e) => setS(e.target.value)}>
                {wb.worksheets.map((v) => (
                  <option key={v.id}>{v.name}</option>
                ))}
              </Choice>
            </Field>
            {[
              [code, setC, "Item code column"],
              [qty, setQ, "Quantity column"],
            ].map(([v, set, l]) => (
              <Field key={String(l)} label={String(l)}>
                <Choice
                  value={Number(v)}
                  onChange={(e) =>
                    (set as (n: number) => void)(+e.target.value)
                  }
                >
                  {Array.from(
                    { length: Math.max(3, s.columnCount) },
                    (_, i) => (
                      <option value={i + 1} key={i}>
                        {s.getColumn(i + 1).letter} · {s.getCell(1, i + 1).text}
                      </option>
                    ),
                  )}
                </Choice>
              </Field>
            ))}
          </div>
          {code === qty && (
            <p className="issue">
              Choose different columns for code and quantity.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>BOQ code</th>
                <th>Destination</th>
                <th>Quantity</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody>
              {cells.map((c, i) => (
                <tr key={i}>
                  <td>{c.code}</td>
                  <td>
                    {s.name}!{c.address}
                  </td>
                  <td>
                    {fmt(c.quantity, 6)}{" "}
                    {r.rates.find((t) => t.code === c.code)?.unit}
                  </td>
                  <td>{c.error || "Ready"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {err && <p className="issue">{err}</p>}
      <div className="formactions">
        <a className="textlink" href="/samples/client-boq.xlsx" download>
          Sample client BOQ
        </a>
        <button
          className="secondary"
          onClick={async () => {
            try {
              download(
                (await estimateBook(
                  p,
                  r,
                  p.revs[p.revs.indexOf(r) - 1],
                  true,
                )) as ArrayBuffer,
                "DuctLedger-draft.xlsx",
              );
            } catch (e) {
              error(String(e));
            }
          }}
        >
          Generated workbook
        </button>
        <button
          className="primary"
          disabled={!wb || !cells.length || cells.some((c) => c.error)}
          onClick={async () => {
            try {
              download(
                (await populate(wb!, s!, r, code, qty)) as ArrayBuffer,
                "Client-BOQ-populated.xlsx",
              );
              notify("Client BOQ copy exported");
              close();
            } catch (e) {
              error(String(e));
            }
          }}
        >
          Confirm & export copy
        </button>
      </div>
    </Modal>
  );
}
