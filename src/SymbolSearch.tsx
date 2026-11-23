import { useEffect, useRef, useState, type PointerEvent } from "react";
import { drawPage } from "./io";
import {
  normalizeUnit,
  type Project,
  type Pt,
  type Rev,
  type Sheet,
} from "./model";
import { Modal, Field, Choice } from "./ui";
import type { SymbolCandidate } from "./symbolMatching";

type SymbolKind = "Diffuser" | "Grille";
type Props = {
  p: Project;
  r: Rev;
  s: Sheet;
  close: () => void;
  accept: (kind: SymbolKind, points: Pt[], code: string) => void;
};
type Candidate = { pt: Pt; selected: boolean };
const distance = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function SymbolSearch({ p, r, s, close, accept }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    worker = useRef<Worker | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<SymbolKind>("Diffuser"),
    [code, setCode] = useState("");
  const [corner, setCorner] = useState<Pt | null>(null),
    [end, setEnd] = useState<Pt | null>(null);
  const [box, setBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [points, setPoints] = useState<Candidate[]>([]),
    [manual, setManual] = useState(false);
  const [status, message] = useState(
    "Select two opposite corners of one symbol, or drag a box around it.",
  );
  const source = p.documents[s.doc];
  useEffect(() => {
    let live = true;
    const rendered = document.createElement("canvas");
    drawPage(rendered, source, s, Math.min(2, 1800 / Math.max(s.w, s.h)))
      .then(() => {
        if (!live || !canvas.current) return;
        const dest = canvas.current;
        dest.width = rendered.width;
        dest.height = rendered.height;
        dest.getContext("2d")!.drawImage(rendered, 0, 0);
        setReady(true);
      })
      .catch((e) => {
        if (live) message("Drawing could not be rendered: " + e.message);
      });
    return () => {
      live = false;
      worker.current?.terminate();
    };
  }, [source, s.doc, s.page, s.w, s.h]);

  const known = r.items
    .filter((i) => i.sheet === s.id && i.kind.toString() === kind)
    .map((i) => i.pts[0]);
  const tolerance = Math.max(2, Math.min(box?.w ?? 10, box?.h ?? 10) * 0.45);
  const near = (pt: Pt, other: Pt[]) =>
    other.some((v) => distance(v, pt) <= tolerance);
  function point(e: PointerEvent<SVGSVGElement>): Pt {
    const pos = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      e.currentTarget.getScreenCTM()!.inverse(),
    );
    return [
      Math.max(0, Math.min(s.w, pos.x)),
      Math.max(0, Math.min(s.h, pos.y)),
    ];
  }
  function finishBox(a: Pt, b: Pt) {
    setBox({
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      w: Math.abs(a[0] - b[0]),
      h: Math.abs(a[1] - b[1]),
    });
    setCorner(null);
    setEnd(null);
    setPoints([]);
    message("Template selected. Search this sheet for matching symbols.");
  }
  function picked(pt: Pt) {
    if (near(pt, known)) {
      message("This location is already counted.");
      return;
    }
    const match = points.findIndex((v) => distance(v.pt, pt) <= tolerance);
    if (match >= 0)
      setPoints(
        points.map((v, i) =>
          i === match ? { ...v, selected: !v.selected } : v,
        ),
      );
    else if (manual) setPoints([...points, { pt, selected: true }]);
  }
  function scan() {
    if (!canvas.current || !box || busy) return;
    const { width, height } = canvas.current;
    const sx = width / s.w,
      sy = height / s.h;
    const x = Math.round(box.x * sx),
      y = Math.round(box.y * sy);
    try {
      const pixels = canvas.current
        .getContext("2d")!
        .getImageData(0, 0, width, height).data;
      const job = new Worker(new URL("./symbol.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = job;
      function stop() {
        job.terminate();
        worker.current = null;
        setBusy(false);
      }
      job.onerror = () => {
        stop();
        message(
          "Search failed. Reselect the symbol or add missed symbols manually.",
        );
      };
      job.onmessage = ({
        data,
      }: {
        data: { error?: string; points?: SymbolCandidate[] };
      }) => {
        stop();
        if (data.error) {
          message(data.error);
          return;
        }
        const found = (data.points ?? []).map(
          (v) => [v.x / sx, v.y / sy] as Pt,
        );
        const fresh = found.filter((pt) => !near(pt, known));
        setPoints(fresh.map((pt) => ({ pt, selected: true })));
        message(
          fresh.length
            ? fresh.length +
                " new candidates. Click a marker to reject or reselect it."
            : "No new matches. Try a tighter template or add missed symbols manually.",
        );
      };
      setPoints([]);
      setManual(false);
      setBusy(true);
      message("Searching this sheet…");
      job.postMessage(
        {
          pixels,
          width,
          height,
          box: {
            x,
            y,
            w: Math.round((box.x + box.w) * sx) - x,
            h: Math.round((box.y + box.h) * sy) - y,
          },
        },
        [pixels.buffer],
      );
    } catch (e) {
      worker.current?.terminate();
      worker.current = null;
      setBusy(false);
      message(String(e));
    }
  }
  const selected = points.filter((v) => v.selected);
  const frame =
    corner && end
      ? {
          x: Math.min(corner[0], end[0]),
          y: Math.min(corner[1], end[1]),
          w: Math.abs(corner[0] - end[0]),
          h: Math.abs(corner[1] - end[1]),
        }
      : box;
  return (
    <Modal title="Reviewed AutoCount" close={close} wide>
      <p>
        {s.number} · {s.name}
      </p>
      <div className="fieldgrid">
        <Field label="Symbol type">
          <Choice
            disabled={busy}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as SymbolKind);
              setPoints([]);
              setManual(false);
            }}
          >
            <option>Diffuser</option>
            <option>Grille</option>
          </Choice>
        </Field>
        <Field label="Piece rate">
          <Choice value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">Unmapped</option>
            {r.rates
              .filter((v) => normalizeUnit(v.unit) === "pc")
              .map((v) => (
                <option key={v.code} value={v.code}>
                  {v.code} · {v.description}
                </option>
              ))}
          </Choice>
        </Field>
      </div>
      <p role="status">{status}</p>
      <div
        style={{
          position: "relative",
          lineHeight: 0,
          border: "1px solid #a2afa4",
          background: "white",
        }}
      >
        <canvas
          ref={canvas}
          style={{
            width: "100%",
            height: "auto",
            aspectRatio: s.w + "/" + s.h,
          }}
        />
        <svg
          aria-label="AutoCount drawing"
          viewBox={`0 0 ${s.w} ${s.h}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            touchAction: "none",
            cursor: "crosshair",
          }}
          onPointerDown={(e) => {
            if (!ready || busy || e.button !== 0) return;
            const pt = point(e);
            if (manual || points.length) {
              picked(pt);
              return;
            }
            if (corner) {
              finishBox(corner, pt);
              return;
            }
            e.currentTarget.setPointerCapture(e.pointerId);
            setCorner(pt);
            setEnd(pt);
            setBox(null);
          }}
          onPointerMove={(e) => {
            if (corner) setEnd(point(e));
          }}
          onPointerUp={(e) => {
            if (corner && distance(corner, point(e)) > 3)
              finishBox(corner, point(e));
          }}
          onPointerCancel={() => {
            setCorner(null);
            setEnd(null);
          }}
        >
          {frame && (
            <rect
              x={frame.x}
              y={frame.y}
              width={frame.w}
              height={frame.h}
              stroke="#14419e"
              fill="#4d8def25"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {known.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="#6a7280" />
          ))}
          {points.map((v, i) => (
            <circle
              key={i}
              cx={v.pt[0]}
              cy={v.pt[1]}
              r={Math.max(4, tolerance)}
              fill={v.selected ? "#26b67355" : "#c4453955"}
              stroke={v.selected ? "#046838" : "#a02b26"}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {kind} {i + 1} · {v.selected ? "selected" : "rejected"}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div className="formactions" style={{ flexWrap: "wrap" }}>
        <button
          className="secondary"
          disabled={!ready || busy}
          onClick={() => {
            setPoints([]);
            setBox(null);
            setCorner(null);
            setEnd(null);
            setManual(false);
            message("Select opposite corners of one symbol.");
          }}
        >
          Select template
        </button>
        <button
          className="secondary"
          disabled={!ready || busy || !box}
          onClick={scan}
        >
          Search sheet
        </button>
        <button
          className="secondary"
          aria-pressed={manual}
          disabled={!ready || busy}
          onClick={() => {
            setManual(!manual);
            setCorner(null);
            message(
              manual
                ? "Review the highlighted candidates."
                : "Click the centre of each missed symbol.",
            );
          }}
        >
          Add missed symbol
        </button>
        <button
          className="primary"
          disabled={r.frozen || !selected.length || busy}
          onClick={() =>
            accept(
              kind,
              selected.map((v) => v.pt),
              code,
            )
          }
        >
          Accept selected ({selected.length})
        </button>
      </div>
      {points.length > 0 && (
        <details>
          <summary>Review candidates ({points.length})</summary>
          {points.map((v, i) => (
            <label
              key={i}
              style={{ display: "inline-flex", gap: 4, marginRight: 12 }}
            >
              <input
                type="checkbox"
                checked={v.selected}
                onChange={() => picked(v.pt)}
              />
              {kind} {i + 1}
            </label>
          ))}
        </details>
      )}
    </Modal>
  );
}
