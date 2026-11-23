import { SheetImage } from "./Canvas";
import { useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Download,
  Layers,
  ScanLine,
  ChevronDown,
  ClipboardList,
} from "lucide-react";
import {
  sheetLabel,
  confirmed,
  reviewTotals,
  pricedSubtotalText,
  variationHeadline,
  type VariationSummary,
  finalChecks,
  moneyPolicy,
  type Change,
  type Sheet,
  type Item,
  quantityExplanation,
  quantityDifference,
  calculate,
  changes,
  fmt,
  boq,
  totals,
  type Project,
  type Rev,
  type Pt,
} from "./model";
import { Modal, Choice, Field, Empty } from "./ui";
import { download, thumbnail } from "./io";
import {
  estimateBook,
  estimateCsv,
  csvTables,
  type CsvTable,
  drawingMeasurementHeaders,
  drawingMeasurementRows,
} from "./books";
export function BOQ({
  r,
  go,
  importRates,
  client,
  initial,
}: {
  r: Rev;
  go: (id: string) => void;
  importRates: () => void;
  client: () => void;
  initial: string;
}) {
  const [open, setOpen] = useState(initial);
  const groups = boq(r),
    excluded = groups.reduce((n, g) => n + g.excluded, 0);
  return (
    <section className="data-area">
      <div className="datahead">
        <div>
          <span className="eyebrow">ESTIMATE</span>
          <h2>Bill of quantities</h2>
        </div>
        <div className="actionrow">
          <button
            className="secondary"
            disabled={r.frozen}
            onClick={importRates}
          >
            <FileSpreadsheet />
            Import rates
          </button>
          <button className="primary" onClick={client}>
            Populate client BOQ
          </button>
        </div>
      </div>
      <div className="metrics">
        <Metric title="Priced subtotal" value={"PKR " + fmt(totals(r))} />
        <Metric title="BOQ lines" value={String(groups.length)} />
        <Metric title="Drawing items" value={String(r.items.length)} />
      </div>
      {excluded > 0 && (
        <p className="issue">
          {excluded} unresolved item(s) excluded from priced subtotals.
        </p>
      )}
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Item code / description</th>
              <th>Items</th>
              <th>Priced quantity (rounded)</th>
              <th>Unit rate (PKR)</th>
              <th>Amount (PKR)</th>
            </tr>
          </thead>
          {groups.map((b) => (
            <tbody key={b.code}>
              <tr
                className="clickrow"
                onClick={() =>
                  b.rows.length === 1
                    ? go(b.rows[0].id)
                    : setOpen(open === b.code ? "#" : b.code)
                }
              >
                <td>
                  <button className="rowtoggle">
                    <ChevronDown size={15} />
                    <b>{b.code || "Unmapped"}</b>
                  </button>
                  <small>{b.rate?.description || "BOQ match unresolved"}</small>
                </td>
                <td>{b.rows.length}</td>
                <td>
                  {fmt(b.quantity)} {b.unit}
                </td>
                <td>{b.mixedRates ? "Mixed rates" : fmt(b.unitRate, 12)}</td>
                <td>
                  {fmt(b.amount)}
                  {b.excluded > 0 && <small>{b.excluded} excluded</small>}
                  <button
                    className="textlink"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(open === b.code ? "#" : b.code);
                    }}
                  >
                    Calculation details
                  </button>
                </td>
              </tr>
              {open === b.code &&
                b.lines.map(({ item: i, calc }) => (
                  <tr className="subrow" key={i.id} onClick={() => go(i.id)}>
                    <td>
                      <button className="textlink">{i.id}</button> · {i.kind}
                    </td>
                    <td>{r.sheets.find((s) => s.id === i.sheet)?.number}</td>
                    <td>
                      {fmt(calc.quantity, 6)} {calc.unit}
                    </td>
                    <td>{calc.rate ?? "—"}</td>
                    <td>
                      {fmt(calc.amount)}
                      {calc.errors.map((e) => (
                        <small key={e}>{e}</small>
                      ))}
                    </td>
                  </tr>
                ))}
              {open === b.code && (
                <tr>
                  <td colSpan={5}>
                    <strong>Calculation details</strong>
                    <p>{moneyPolicy}</p>
                    <p>
                      Priced item amounts (PKR) ·{" "}
                      {b.lines
                        .filter((l) => l.calc.amount !== null)
                        .map((l) => fmt(l.calc.amount))
                        .join(" + ") || "—"}{" "}
                      = {fmt(b.amount)}
                    </p>
                    Exact group quantity · {fmt(b.quantity, 6)} {b.unit}
                  </td>
                </tr>
              )}
            </tbody>
          ))}
        </table>
      </div>
      {!r.items.length && (
        <Empty
          title="No measured items"
          text="Mark ductwork on a sheet to build the estimate."
        />
      )}
    </section>
  );
}
export function VariationOverview({
  money,
  go,
}: {
  money: VariationSummary;
  go: (id: string, baseline?: boolean) => void;
}) {
  return (
    <section className="variation-overview" aria-label="Variation summary">
      <div className={money.unpriced ? "issue" : "variation-total"}>
        <h3>{variationHeadline(money)}</h3>
        {money.reason && <p>{money.reason}</p>}
        {money.unresolved.map((item) => (
          <p key={item.id + item.baseline}>
            <button
              className="textlink"
              onClick={() => go(item.id, item.baseline)}
            >
              {item.id} · {item.sheet}
              {item.baseline ? " (baseline)" : ""}
            </button>
            {" · "}
            {item.reason}
          </p>
        ))}
      </div>
      <p>
        Pricing status: <strong>{money.status}</strong>
      </p>
      <div className="metrics">
        <Metric
          title="Priced changes subtotal"
          value={pricedSubtotalText(money)}
        />
        <Metric
          title="Confirmed priced subtotal"
          value={"PKR " + fmt(money.confirmed)}
        />
        <Metric
          title="Pending priced subtotal"
          value={"PKR " + fmt(money.pending)}
        />
      </div>
      <p className="quiet">
        Priced additions · PKR {fmt(money.additions)}　 Credits · PKR{" "}
        {fmt(money.credits)}
      </p>
    </section>
  );
}
export function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
export function ReviewTable({
  r,
  old,
  rows,
  go,
  review,
  empty,
  evidenceOnly,
}: {
  evidenceOnly: boolean;
  r: Rev;
  old?: Rev;
  rows: Change[];
  go: (id: string, baseline?: boolean) => void;
  review: (c: Change) => void;
  empty: string;
}) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Drawing item / sheet</th>
            <th>Change</th>
            <th>Old quantity / rate / amount</th>
            <th>New quantity / rate / amount</th>
            <th>Scope (PKR)</th>
            <th>Rate effect (PKR)</th>
            <th>Variation (PKR)</th>
            <th>Review</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const sheet = (c.side === "old" ? old : r)?.sheets.find(
              (s) => s.id === c.sheetId,
            );
            return (
              <tr className="clickrow" key={c.key} onClick={() => review(c)}>
                <td>
                  <button
                    className="textlink"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (evidenceOnly) review(c);
                      else go(c.id, c.side === "old");
                    }}
                  >
                    {c.id}
                  </button>
                  <small>
                    {c.oldSheetId &&
                    c.newSheetId &&
                    c.oldSheetId !== c.newSheetId
                      ? sheetLabel(
                          old?.sheets.find((s) => s.id === c.oldSheetId),
                        ) + " → "
                      : ""}
                    {sheetLabel(sheet)}
                  </small>
                </td>
                <td>
                  {c.description}
                  <small>
                    Δ {fmt(quantityDifference(c), 6)}{" "}
                    {c.next?.unit ?? c.old?.unit}
                  </small>
                </td>
                {[c.old, c.next].map((v, n) => (
                  <td key={n}>
                    {v ? (
                      <>
                        {fmt(v.quantity, 6)} {v.unit}
                        <small>
                          PKR {v.rate ?? "—"}/{v.unit}
                        </small>
                        <small>PKR {fmt(v.amount)}</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
                <td>{fmt(c.scope)}</td>
                <td>{fmt(c.rate)}</td>
                <td className="money">{fmt(c.delta)}</td>
                <td>
                  <small>{confirmed(r, c) ? "Confirmed" : "Pending"}</small>
                  <button className="secondary small">Review evidence</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="quiet">{empty}</p>}
    </div>
  );
}
function escape(v: unknown) {
  return String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export async function printReportHtml(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  const rows = changes(old, r),
    issues = finalChecks(r, rows);
  if (!draft && issues.length) throw Error(issues.join(" · "));
  const excerpts = await Promise.all(
    rows.map(async (c) => {
      const rr = c.side === "old" ? old! : r,
        i = rr.items.find((x) => x.id === c.id)!,
        s = rr.sheets.find((s) => s.id === i.sheet)!;
      const src = await thumbnail(p, s, i);
      return (
        "<article><h3>" +
        escape(
          c.id +
            " · " +
            c.description +
            " · " +
            (confirmed(r, c) ? "Confirmed" : "Pending"),
        ) +
        "</h3><p>" +
        escape(s.number + " · " + s.name + " · " + i.spec + " · " + i.zone) +
        '</p><img src="' +
        src +
        '"/><table><tr><th>Revision</th><th>Priced quantity</th><th>Unit rate</th><th>Amount</th></tr>' +
        [c.old, c.next]
          .map(
            (v, n) =>
              "<tr><td>" +
              escape(n ? r.id : old?.id) +
              "</td><td>" +
              escape(v ? fmt(v.quantity, 6) + " " + v.unit : "—") +
              "</td><td>" +
              escape(v ? "PKR " + (v.rate ?? "—") + "/" + v.unit : "—") +
              "</td><td>PKR " +
              fmt(v?.amount) +
              "</td></tr>",
          )
          .join("") +
        "</table>" +
        [
          [old, c.old],
          [r, c.next],
        ]
          .map(([rr, line]) => {
            if (!rr || !line) return "";
            const rev = rr as Rev,
              it = rev.items.find((it) => it.id === c.id)!;
            return (
              "<p><strong>Revision " +
              escape(rev.id) +
              "</strong> · " +
              escape(quantityExplanation(it, rev)) +
              "</p>"
            );
          })
          .join("") +
        "<p>Quantity difference " +
        fmt(quantityDifference(c), 6) +
        " " +
        escape(c.next?.unit ?? c.old?.unit) +
        "</p><p>Scope effect PKR " +
        fmt(c.scope) +
        " · Rate effect PKR " +
        fmt(c.rate) +
        " · Net PKR " +
        fmt(c.delta) +
        "</p></article>"
      );
    }),
  );
  const measurements = drawingMeasurementRows(r);
  const measurementHtml = measurements.length
    ? "<h3>Drawing measurements</h3><table><thead><tr>" +
      drawingMeasurementHeaders
        .map((label) => "<th>" + label + "</th>")
        .join("") +
      "</tr></thead><tbody>" +
      measurements
        .map(
          (row) =>
            "<tr>" +
            row
              .map(
                (value) =>
                  "<td>" +
                  escape(
                    typeof value === "number" ? fmt(value, 6) : (value ?? "—"),
                  ) +
                  "</td>",
              )
              .join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table>"
    : "";
  const money = reviewTotals(rows, r, old);
  const unresolvedEstimates = r.items.filter(
    (i) => calculate(i, r).amount === null,
  ).length;
  return (
    "<html><head><title>" +
    escape(p.name) +
    " – variation report</title><style>@page{size:A4;margin:17mm}body{font:14px Arial;color:#19372e}h1{font-size:28px}article{break-inside:avoid;border-top:1px solid #aaa;padding:12px 0}img{max-width:100%;max-height:160px}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px;border-bottom:1px solid #ccc}small{letter-spacing:2px}</style></head><body><small>DUCTLEDGER · " +
    (draft ? "DRAFT" : "FINAL") +
    "</small><h1>Variation report</h1><h2>" +
    escape(p.name) +
    "</h2><p>" +
    escape(
      [
        p.location,
        old ? "Revision " + old.id + " · " + old.date : "Baseline estimate",
        "Revision " + r.id + " · " + r.date,
      ].join(" | "),
    ) +
    "</p><h2>" +
    variationHeadline(money) +
    "</h2>" +
    (money.reason ? "<p>" + money.reason + "</p>" : "") +
    money.unresolved
      .map(
        (item) =>
          "<p>" +
          escape(
            item.id +
              " · " +
              item.sheet +
              (item.baseline ? " (baseline)" : "") +
              " · " +
              item.reason,
          ) +
          "</p>",
      )
      .join("") +
    "<p>Pricing status: " +
    money.status +
    "</p><p>Priced changes subtotal: " +
    pricedSubtotalText(money) +
    "</p><p>Confirmed priced subtotal · PKR " +
    fmt(money.confirmed) +
    "</p><p>Pending priced subtotal · PKR " +
    fmt(money.pending) +
    "</p><p>Priced additions PKR " +
    fmt(money.additions) +
    " · Credits PKR " +
    fmt(money.credits) +
    "</p><p>Priced estimate subtotal · PKR " +
    fmt(totals(r)) +
    "</p><p>" +
    unresolvedEstimates +
    " unresolved estimate " +
    (unresolvedEstimates === 1 ? "item" : "items") +
    ".</p>" +
    measurementHtml +
    excerpts.join("") +
    "<h3>Outstanding queries and assumptions</h3><p>" +
    (issues.length ? issues.map(escape).join("<br>") : "All checks resolved.") +
    "</p><p>Material waste is applied once to the material quantity. Fittings are priced per piece. " +
    escape(moneyPolicy) +
    "</p></body></html>"
  );
}
export async function printReport(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  const html = await printReportHtml(p, r, old, draft);
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;bottom:0;left:0;border:0";
  document.body.append(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(html);
  d.close();
  await Promise.all(
    Array.from(d.querySelectorAll("img")).map((img) =>
      img.decode().catch(() => {}),
    ),
  );
  frame.contentWindow?.focus();
  frame.contentWindow?.print();
  setTimeout(() => frame.remove(), 120000);
}
export function ExportDialog({
  p,
  r,
  old,
  close,
  notify,
  client,
  go,
}: {
  go: (id: string, baseline?: boolean) => void;
  p: Project;
  r: Rev;
  old?: Rev;
  close: () => void;
  notify: (v: string) => void;
  client: () => void;
}) {
  const [draft, setDraft] = useState(true),
    [busy, setBusy] = useState(false),
    [err, error] = useState("");
  const rows = changes(old, r);
  const problems = finalChecks(r, rows);
  const [csvTable, setCsvTable] = useState<CsvTable>("Estimate");
  async function run(format: "xlsx" | "pdf" | "csv") {
    setBusy(true);
    try {
      if (format === "pdf") await printReport(p, r, old, draft);
      else if (format === "csv") {
        download(
          estimateCsv(p, r, old, draft, csvTable),
          "DuctLedger-Rev-" +
            r.id +
            "-" +
            (draft ? "draft" : "final") +
            "-" +
            csvTable +
            ".csv",
          "text/csv;charset=utf-8",
        );
      } else
        download(
          (await estimateBook(p, r, old, draft)) as ArrayBuffer,
          "DuctLedger-Rev-" +
            r.id +
            "-" +
            (draft ? "draft" : "final") +
            ".xlsx",
        );
      notify(
        format === "pdf"
          ? "Print dialog ready"
          : format.toUpperCase() + " report exported",
      );
      close();
    } catch (e) {
      error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Export report" wide close={close}>
      <p className="intro">
        {p.name} · Revision {r.id} · {r.date}
      </p>
      <VariationOverview money={reviewTotals(rows, r, old)} go={go} />
      <Field label="Issue status">
        <Choice
          value={draft ? "Draft" : "Final"}
          onChange={(e) => setDraft(e.target.value === "Draft")}
        >
          <option>Draft</option>
          <option disabled={!!problems.length}>Final</option>
        </Choice>
      </Field>
      {problems.length > 0 && (
        <div className="issue">
          {problems.length} outstanding check{problems.length !== 1 ? "s" : ""}{" "}
          before final issue.
          <details>
            <summary>View checks</summary>
            {problems.map((v, n) => (
              <p key={n}>{v}</p>
            ))}
          </details>
        </div>
      )}
      <div className="exportopts">
        <button disabled={busy} onClick={() => run("xlsx")}>
          <FileSpreadsheet />
          <div>
            <b>Excel variation workbook</b>
            <small>Estimate, BOQ, detailed changes and queries</small>
          </div>
          <Download />
        </button>
        <button disabled={busy} onClick={() => run("pdf")}>
          <FileText />
          <div>
            <b>Printable client PDF</b>
            <small>Cost breakdowns and marked drawing excerpts</small>
          </div>
          <Download />
        </button>
        <button disabled={busy} onClick={client}>
          <ClipboardList />
          <div>
            <b>Populate a client BOQ</b>
            <small>Map quantities into a copy of your workbook</small>
          </div>
        </button>
      </div>
      <Field label="CSV table">
        <Choice
          value={csvTable}
          onChange={(e) => setCsvTable(e.target.value as CsvTable)}
        >
          {csvTables
            .filter(
              (table) =>
                table !== "Drawing measurements" || r.measurements?.length,
            )
            .map((table) => (
              <option key={table}>{table}</option>
            ))}
        </Choice>
      </Field>
      <button className="secondary" disabled={busy} onClick={() => run("csv")}>
        <Download size={15} /> Download CSV
      </button>
      {busy && <p>Preparing report…</p>}
      {err && <p className="issue">{err}</p>}
    </Modal>
  );
}
type EvidenceProps = {
  p: Project;
  r: Rev;
  old: Rev;
  a?: Sheet;
  b?: Sheet;
  change?: Change;
  confirm: (key: string) => void;
  saveAlign: (sheet: string, m: number[]) => void;
};
function Highlight({ item, color }: { item?: Item; color: string }) {
  if (!item) return null;
  return (
    <g
      aria-label={"Highlighted " + item.id}
      data-item={item.id}
      fill="none"
      stroke={color}
      strokeWidth="5"
    >
      <polyline points={item.pts.map((pt) => pt.join(",")).join(" ")} />
      {item.pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={item.pts.length === 1 ? 10 : 5} />
      ))}
    </g>
  );
}
export function Compare({
  p,
  r,
  old,
  a,
  b,
  change,
  confirm,
  saveAlign,
}: EvidenceProps) {
  const [overlay, ov] = useState(false),
    [alpha, sa] = useState(0.55),
    [collect, setCollect] = useState<Pt[] | null>(null),
    [loaded, setLoaded] = useState<boolean[]>([false, false]),
    [error, setError] = useState("");
  const sheets = [a, b],
    revisions = [old, r];
  const items = [
    change?.old
      ? old.items.find((i) => i.id === change.id && i.sheet === a?.id)
      : undefined,
    change?.next
      ? r.items.find((i) => i.id === change.id && i.sheet === b?.id)
      : undefined,
  ];
  const ready =
    !!change &&
    !error &&
    !overlay &&
    !collect &&
    sheets.every((s, n) => !s || loaded[n]) &&
    (!change.old || !!items[0]) &&
    (!change.next || !!items[1]);
  function layer(n: number) {
    const s = sheets[n];
    if (!s) return null;
    return (
      <g>
        <foreignObject width={s.w} height={s.h}>
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <SheetImage
              sheet={s}
              data={p.documents[s.doc]}
              onReady={() =>
                setLoaded((prev) => prev.map((x, i) => (i === n ? true : x)))
              }
              onError={setError}
            />
          </div>
        </foreignObject>
        <Highlight item={items[n]} color={n ? "#167547" : "#b66826"} />
      </g>
    );
  }
  function click(e: React.MouseEvent<SVGSVGElement>, i: number) {
    if (!collect || !a || !b || i !== (collect.length < 2 ? 0 : 1)) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(
        e.currentTarget.getScreenCTM()!.inverse(),
      ),
      v = [...collect, [pt.x, pt.y] as Pt];
    if (v.length === 4) {
      const [a1, a2, b1, b2] = v,
        dx = a2[0] - a1[0],
        dy = a2[1] - a1[1],
        ex = b2[0] - b1[0],
        ey = b2[1] - b1[1],
        l = dx * dx + dy * dy;
      if (l < 1 || ex * ex + ey * ey < 1) {
        setCollect([]);
        return;
      }
      const u = (ex * dx + ey * dy) / l,
        w = (ey * dx - ex * dy) / l;
      saveAlign(b.id, [
        u,
        w,
        -w,
        u,
        b1[0] - u * a1[0] + w * a1[1],
        b1[1] - w * a1[0] - u * a1[1],
      ]);
      setCollect(null);
      ov(true);
    } else setCollect(v);
  }

  return (
    <div className="compare">
      <div className="actionrow wrap">
        <button
          disabled={!a || !b}
          className="secondary small"
          onClick={() => {
            setLoaded([false, false]);
            ov(!overlay);
            setCollect(null);
          }}
        >
          <Layers size={15} />
          {overlay ? "Side by side" : "Overlay"}
        </button>
        <button
          disabled={!a || !b || r.frozen}
          className="secondary small"
          onClick={() => {
            if (overlay) setLoaded([false, false]);
            setCollect([]);
            ov(false);
          }}
        >
          <ScanLine size={15} />
          Align points
        </button>
        {overlay && (
          <label>
            Opacity{" "}
            <input
              aria-label="Overlay opacity"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={alpha}
              onChange={(e) => sa(+e.target.value)}
            />
          </label>
        )}
      </div>
      {collect && (
        <p>
          Click reference {(collect.length % 2) + 1} on Revision{" "}
          {collect.length < 2 ? old.id : r.id}.
        </p>
      )}
      <div className="comparegrid" key={overlay ? "overlay" : "pair"}>
        {overlay && a && b ? (
          <div>
            <b>Aligned overlay · {sheetLabel(b)}</b>
            <svg viewBox={`0 0 ${b.w} ${b.h}`}>
              {layer(1)}
              <g
                opacity={alpha}
                transform={
                  "matrix(" +
                  (r.alignment?.[b.id] ?? [1, 0, 0, 1, 0, 0]).join(" ") +
                  ")"
                }
              >
                {layer(0)}
              </g>
            </svg>
          </div>
        ) : (
          sheets.map((s, n) => (
            <div key={n}>
              <b>
                Revision {revisions[n].id}
                {s ? " · " + sheetLabel(s) : " · No paired sheet"}
              </b>
              {s && (
                <svg
                  aria-label={
                    "Revision " + revisions[n].id + " drawing " + s.number
                  }
                  viewBox={`0 0 ${s.w} ${s.h}`}
                  onClick={(e) => click(e, n)}
                >
                  {layer(n)}
                  {collect?.slice(n * 2, n * 2 + 2).map(([x, y], j) => (
                    <circle key={j} cx={x} cy={y} r="7" fill="#e89521" />
                  ))}
                </svg>
              )}
              {change && (
                <small>
                  {items[n]
                    ? change.id + " highlighted"
                    : "No " +
                      (n ? "revised" : "baseline") +
                      " line for " +
                      change.id}
                </small>
              )}
            </div>
          ))
        )}
      </div>
      {error && <p className="issue">Drawing evidence unavailable · {error}</p>}
      {change && (
        <div className="tablewrap">
          <table aria-label="Selected change pricing evidence">
            <thead>
              <tr>
                <th>Revision</th>
                <th>Dimensions / count</th>
                <th>Priced quantity</th>
                <th>Mapped unit rate</th>
                <th>Amount (PKR)</th>
              </tr>
            </thead>
            <tbody>
              {[change.old, change.next].map((line, n) => {
                const i = items[n];
                if (!i || !line) return null;
                const dimensions =
                  line.unit === "pc"
                    ? fmt(i.count) + " pc"
                    : i.kind === "Circular duct"
                      ? "Ø " + fmt(i.diameter) + " mm"
                      : fmt(i.width) + " × " + fmt(i.height) + " mm";
                return (
                  <tr key={n}>
                    <th>{revisions[n].id}</th>
                    <td>{dimensions}</td>
                    <td>
                      {fmt(line.quantity, 6)} {line.unit}
                    </td>
                    <td>
                      PKR {fmt(line.rate, 6)}/{line.unit}
                    </td>
                    <td>{fmt(line.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p>
            Scope effect PKR {fmt(change.scope)} · Rate effect PKR{" "}
            {fmt(change.rate)} · Net variation PKR {fmt(change.delta)}
          </p>
        </div>
      )}
      {change && (
        <div className="actionrow">
          <b>
            {change.id} · {change.description}
          </b>
          {confirmed(r, change) ? (
            <span className="readystatus">Confirmed</span>
          ) : (
            <button
              className="primary small"
              disabled={!ready || r.frozen || change.delta === null}
              onClick={() => {
                if (ready && !r.frozen && change.delta !== null)
                  confirm(change.key);
              }}
            >
              Confirm
            </button>
          )}
          {(change.old === null || change.next === null) && (
            <small>
              {change.old
                ? "Baseline line in Revision " + old.id
                : "Revised line in Revision " + r.id}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
