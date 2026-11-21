import { useState,useEffect } from "react";
import {
FileSpreadsheet,
FileText,
Download,
Check,
Layers,
ScanLine,ChevronDown,ClipboardList
} from "lucide-react";
import {
quantityExplanation,
calculate,
changes,
exceptions,
round,
fmt,
boq,
totals,
type Project,
type Rev,type Pt
} from "./model";
import { Modal,Choice,Field,Empty } from "./ui";
import { download,thumbnail } from "./io";
import { estimateBook } from "./books";
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
        <Metric title="BOQ lines" value={String(boq(r).length)} />
        <Metric title="Drawing items" value={String(r.items.length)} />
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Item code / description</th>
              <th>Items</th>
              <th>Priced quantity</th>
              <th>Unit rate (PKR)</th>
              <th>Amount (PKR)</th>
            </tr>
          </thead>
          {boq(r).map((b) => (
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
                  {fmt(b.quantity)} {b.rate?.unit}
                </td>
                <td>{fmt(b.rate?.rate)}</td>
                <td>{fmt(b.amount)}</td>
              </tr>
              {open === b.code &&
                b.rows.map((i) => (
                  <tr className="subrow" key={i.id} onClick={() => go(i.id)}>
                    <td>
                      <button className="textlink">{i.id}</button> · {i.kind}
                    </td>
                    <td>{r.sheets.find((s) => s.id === i.sheet)?.number}</td>
                    <td>
                      {fmt(calculate(i, r).quantity)} {b.rate?.unit}
                    </td>
                    <td>{fmt(b.rate?.rate)}</td>
                    <td>{fmt(calculate(i, r).amount)}</td>
                  </tr>
                ))}
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
  go,
  confirm,
}: {
  r: Rev;
  old?: Rev;
  go: (id: string, old?: boolean) => void;
  confirm: (id: string) => void;
}) {
  const rows = changes(old, r);
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Drawing item</th>
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
          {rows.map((c) => (
            <tr
              key={c.key}
              onClick={() => go(c.id, c.side === "old")}
              className="clickrow"
            >
              <td>
                <button className="textlink">{c.id}</button>
              </td>
              <td>
                {c.description}
                {(!c.old || !c.next || c.old.unit === c.next.unit) && (
                  <small>
                    Δ {fmt((c.next?.quantity ?? 0) - (c.old?.quantity ?? 0))}{" "}
                    {c.next?.unit ?? c.old?.unit}
                  </small>
                )}
              </td>
              {[c.old, c.next].map((v, n) => (
                <td key={n}>
                  {v ? (
                    <>
                      {fmt(v.quantity)} {v.unit}
                      <small>
                        PKR {fmt(v.rate)}/{v.unit}
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
                {r.approved.includes(c.id) ? (
                  <span className="readystatus">
                    <Check size={13} />
                    Confirmed
                  </span>
                ) : (
                  <button
                    className="secondary small"
                    disabled={r.frozen}
                    onClick={(e) => {
                      e.stopPropagation();
                      confirm(c.id);
                    }}
                  >
                    Confirm
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="quiet">No changes recorded for this revision.</p>
      )}
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
export async function printReport(
  p: Project,
  r: Rev,
  old: Rev | undefined,
  draft: boolean,
) {
  const rows = changes(old, r),
    issues = [
      ...exceptions(r),
      ...rows
        .filter((x) => !r.approved.includes(x.id))
        .map((x) => x.id + " · Change awaiting confirmation"),
    ];
  if (!draft && issues.length)
    throw Error("Resolve exceptions and confirm changes before issue");
  const excerpts = await Promise.all(
    rows.map(async (c) => {
      const rr = c.side === "old" ? old! : r,
        i = rr.items.find((x) => x.id === c.id)!,
        s = rr.sheets.find((s) => s.id === i.sheet)!;
      const src = await thumbnail(p, s, i);
      return (
        "<article><h3>" +
        escape(c.id + " · " + c.description) +
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
              escape(v ? fmt(v.quantity) + " " + v.unit : "—") +
              "</td><td>" +
              escape(v ? "PKR " + fmt(v.rate) + "/" + v.unit : "—") +
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
        fmt((c.next?.quantity ?? 0) - (c.old?.quantity ?? 0)) +
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
  const total = round(rows.reduce((a, c) => a + (c.delta ?? 0), 0)),
    add = rows.reduce((a, c) => a + Math.max(0, c.delta ?? 0), 0);
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;bottom:0;left:0;border:0";
  document.body.append(frame);
  const d = frame.contentDocument!;
  d.open();
  d.write(
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
      "</p><p>Additions PKR " +
      fmt(add) +
      " · Credits PKR " +
      fmt(total - add) +
      "</p><h2>Net priced variation · PKR " +
      fmt(total) +
      "</h2><p>Priced estimate subtotal · PKR " +
      fmt(totals(r)) +
      "</p>" +
      excerpts.join("") +
      "<h3>Outstanding queries and assumptions</h3><p>" +
      (issues.length
        ? issues.map(escape).join("<br>")
        : "All checks resolved.") +
      "</p><p>Material waste is applied once to the material quantity. Fittings are priced per piece. Money is rounded per line to two decimal places.</p></body></html>",
  );
  d.close();
  await Promise.all([...d.images].map((img) => img.decode().catch(() => {})));
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
}: {
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
  const problems = [
    ...exceptions(r),
    ...changes(old, r)
      .filter((x) => !r.approved.includes(x.id))
      .map((x) => x.id + " · Confirm change"),
  ];
  async function run(print: boolean) {
    setBusy(true);
    try {
      if (print) await printReport(p, r, old, draft);
      else
        download(
          (await estimateBook(p, r, old, draft)) as ArrayBuffer,
          "DuctLedger-Rev-" +
            r.id +
            "-" +
            (draft ? "draft" : "final") +
            ".xlsx",
        );
      notify(print ? "Print dialog ready" : "Excel report exported");
      close();
    } catch (e) {
      error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Export report" close={close}>
      <p className="intro">
        {p.name} · Revision {r.id} · {r.date}
      </p>
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
        <button disabled={busy} onClick={() => run(false)}>
          <FileSpreadsheet />
          <div>
            <b>Excel variation workbook</b>
            <small>Estimate, BOQ, detailed changes and queries</small>
          </div>
          <Download />
        </button>
        <button disabled={busy} onClick={() => run(true)}>
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
      {busy && <p>Preparing report…</p>}
      {err && <p className="issue">{err}</p>}
    </Modal>
  );
}
export function Compare({
  p,
  r,
  old,
  saveAlign,
}: {
  p: Project;
  r: Rev;
  old: Rev;
  saveAlign: (sheet: string, m: number[]) => void;
}) {
  const [sel, ss] = useState(r.sheets[0]?.id ?? ""),
    [overlay, ov] = useState(false),
    [alpha, sa] = useState(0.55),
    [collect, setCollect] = useState<Pt[] | null>(null),
    [imgs, setImgs] = useState<string[]>([]);
  const b = r.sheets.find((s) => s.id === sel) ?? r.sheets[0],
    a = old.sheets.find((s) => s.id === b?.id);
  useEffect(() => {
    let live = true;
    setImgs([]);
    if (a && b)
      Promise.all([thumbnail(p, a), thumbnail(p, b)]).then(
        (v) => live && setImgs(v),
      );
    return () => {
      live = false;
    };
  }, [a?.doc, a?.page, b?.doc, b?.page]);
  if (!b) return null;
  function click(e: React.MouseEvent<SVGSVGElement>, i: number) {
    if (!collect || !a || i !== (collect.length < 2 ? 0 : 1)) return;
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
        <Choice
          value={b.id}
          onChange={(e) => {
            ss(e.target.value);
            setCollect(null);
          }}
        >
          {r.sheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.number} · {s.name}
            </option>
          ))}
        </Choice>
        <button
          className="secondary small"
          onClick={() => {
            ov(!overlay);
            setCollect(null);
          }}
        >
          <Layers size={15} />
          {overlay ? "Side by side" : "Overlay"}
        </button>
        <button
          disabled={r.frozen || !a}
          className="secondary small"
          onClick={() => {
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
      {!a ? (
        <p>This sheet has no paired baseline.</p>
      ) : (
        <>
          {collect && (
            <p className="issue">
              Click reference {(collect.length % 2) + 1} on Revision{" "}
              {collect.length < 2 ? old.id : r.id}.
            </p>
          )}
          <div className="comparegrid">
            {(overlay ? [b] : [a, b]).map((s, i) => (
              <div key={i}>
                <b>
                  {overlay
                    ? "Aligned overlay"
                    : "Revision " + (i ? r.id : old.id)}
                </b>
                <svg viewBox={`0 0 ${s.w} ${s.h}`} onClick={(e) => click(e, i)}>
                  <image
                    href={imgs[overlay ? 1 : i]}
                    width={s.w}
                    height={s.h}
                  />
                  {overlay && (
                    <image
                      href={imgs[0]}
                      width={a.w}
                      height={a.h}
                      opacity={alpha}
                      transform={
                        "matrix(" +
                        (r.alignment?.[b.id] ?? [1, 0, 0, 1, 0, 0]).join(" ") +
                        ")"
                      }
                    />
                  )}
                  {collect?.slice(i * 2, i * 2 + 2).map(([x, y], n) => (
                    <circle key={n} cx={x} cy={y} r="7" fill="#e89521" />
                  ))}
                </svg>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
