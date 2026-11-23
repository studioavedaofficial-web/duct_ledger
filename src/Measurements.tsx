import { drawPage } from "./io";
import { drawingEndpoints } from "./endpoints";
import { bounds, corners, samePlace, type Rectangle } from "./rectangles";
import { useEffect, useRef, useState } from "react";
import { SheetImage } from "./Canvas";
import { Choice, Field, Modal } from "./ui";
import { fmt, type Project, type Pt, type Rev, type Sheet } from "./model";
import {
  geometryIssue,
  measurementValues,
  type GenericMeasurement,
} from "./geometry";
import "./measurements.css";

type Props = {
  p: Project;
  r: Rev;
  s: Sheet;
  close: () => void;
  save: (records: GenericMeasurement[]) => void;
};
const svgBox = (b: Rectangle) => ({ x: b.x, y: b.y, width: b.w, height: b.h });
const coords = (pts: Pt[]) => pts.map((p) => p.join(",")).join(" ");
function Trace({
  kind,
  points,
  cutouts,
  active = false,
}: {
  kind: GenericMeasurement["kind"];
  points: Pt[];
  cutouts: Pt[][];
  active?: boolean;
}) {
  const line = active ? "#a04412" : "#185b45";
  const boundary = (ring: Pt[]) =>
    ring.length ? "M" + ring.map((p) => p.join(",")).join(" L") + " Z" : "";
  return (
    <g pointerEvents="none" stroke={line} strokeWidth="2">
      {kind === "Polygon" ? (
        <path
          d={[points, ...cutouts].map(boundary).join(" ")}
          fill={line}
          fillOpacity=".17"
          fillRule="evenodd"
          vectorEffect="non-scaling-stroke"
        />
      ) : (
        <polyline
          points={coords(points)}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {active &&
        [points, ...cutouts].flatMap((path, n) =>
          path.map(([x, y], i) => (
            <circle key={n + "-" + i} cx={x} cy={y} r="3" fill="white" />
          )),
        )}
    </g>
  );
}
export function Measurements({ p, r, s, close, save }: Props) {
  const [kind, setKind] = useState<GenericMeasurement["kind"]>("Length");
  const [points, setPoints] = useState<Pt[]>([]),
    [cutouts, setCutouts] = useState<Pt[][]>([]);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0);
  const group = useRef<SVGGElement>(null);
  const records = r.measurements ?? [],
    selected = records.filter((m) => m.sheet === s.id);
  const calibrated = !!s.scale && !s.mixed;
  const writable = calibrated && !r.frozen;
  const draft = { id: "", sheet: s.id, kind, points, cutouts };
  const activePath = cutouts.length ? cutouts[cutouts.length - 1] : points;
  const metrics = measurementValues(draft, calibrated ? s.scale : null);
  const [matching, setMatching] = useState(false);
  const [template, setTemplate] = useState<Pt[]>([]);
  const [matches, setMatches] = useState<
    { rect: Rectangle; checked: boolean }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const job = useRef<Worker | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      job.current?.terminate();
    },
    [],
  );
  const chosen = matches.filter((m) => m.checked);
  const polygons = selected.filter((m) => m.kind === "Polygon");
  const existing = polygons
    .filter((m) => m.points.length === 4)
    .map((m) => {
      const xs = m.points.map((p) => p[0]),
        ys = m.points.map((p) => p[1]);
      const box = bounds(
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      );
      return corners(box).every((c) =>
        m.points.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 0.01),
      )
        ? box
        : null;
    })
    .filter((b): b is Rectangle => b !== null);
  function asMeasurement(rect: Rectangle): GenericMeasurement {
    return {
      id: "",
      sheet: s.id,
      kind: "Polygon",
      points: corners(rect),
      cutouts: [],
    };
  }
  async function searchRectangles() {
    if (template.length !== 2 || searching) return;
    const current = ++generation.current;
    setSearching(true);
    setError("");
    setNotice("");
    setMatches([]);
    try {
      const canvas = document.createElement("canvas");
      const data = p.documents[s.doc];
      const [, anchors] = await Promise.all([
        drawPage(canvas, data, s, Math.min(3, 2000 / Math.max(s.w, s.h))),
        drawingEndpoints(data, s).catch(() => [] as Pt[]),
      ]);
      if (current !== generation.current) return;
      const sx = canvas.width / s.w,
        sy = canvas.height / s.h;
      const box = bounds(template[0], template[1]);
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      const worker = new Worker(
        new URL("./rectangle.worker.ts", import.meta.url),
        { type: "module" },
      );
      job.current = worker;
      function done() {
        worker.terminate();
        job.current = null;
        setSearching(false);
      }
      worker.onerror = () => {
        done();
        setError("Rectangle search failed. Select the outline again.");
      };
      worker.onmessage = ({
        data,
      }: {
        data: { matches?: Rectangle[]; error?: string };
      }) => {
        done();
        if (data.error) {
          setError(data.error);
          return;
        }
        function snap(c: Pt): Pt {
          let best = c,
            limit = 2.1;
          for (const a of anchors) {
            const d = Math.hypot((a[0] - c[0]) * sx, (a[1] - c[1]) * sy);
            if (d < limit) {
              best = a;
              limit = d;
            }
          }
          return best;
        }
        const fresh: Rectangle[] = [];
        for (const found of data.matches ?? []) {
          const rect = bounds(
            snap([found.x / sx, found.y / sy]),
            snap([(found.x + found.w) / sx, (found.y + found.h) / sy]),
          );
          if (![...existing, ...fresh].some((v) => samePlace(v, rect)))
            fresh.push(rect);
        }
        setMatches(fresh.map((rect) => ({ rect, checked: true })));
        setNotice(
          fresh.length
            ? "Click a highlighted rectangle to exclude or include it."
            : "No new matching outlines. Saved rectangles are excluded.",
        );
      };
      worker.postMessage(
        {
          pixels,
          width: canvas.width,
          height: canvas.height,
          template: { ...box, w: box.w * sx, h: box.h * sy },
        },
        [pixels.buffer],
      );
    } catch (e) {
      if (current === generation.current) {
        setError(String(e));
        setSearching(false);
      }
    }
  }
  function replacePath(next: Pt[]) {
    if (cutouts.length) setCutouts([...cutouts.slice(0, -1), next]);
    else setPoints(next);
  }
  function reset() {
    setPoints([]);
    setCutouts([]);
    setError("");
    setNotice("");
  }
  function add(e: React.PointerEvent<SVGSVGElement>) {
    if (!writable || e.button !== 0 || e.detail > 1 || !group.current) return;
    if (!matching && kind === "Length" && points.length === 2) return;
    const matrix = group.current.getScreenCTM();
    if (!matrix) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (at.x < 0 || at.y < 0 || at.x > s.w || at.y > s.h) return;
    if (matching) {
      if (searching) return;
      if (matches.length) {
        const i = matches.findIndex(
          ({ rect: b }) =>
            at.x >= b.x &&
            at.y >= b.y &&
            at.x <= b.x + b.w &&
            at.y <= b.y + b.h,
        );
        if (i >= 0)
          setMatches(
            matches.map((m, j) =>
              i === j ? { ...m, checked: !m.checked } : m,
            ),
          );
      } else {
        setTemplate(
          template.length === 1 ? [template[0], [at.x, at.y]] : [[at.x, at.y]],
        );
        setError("");
        setNotice("");
      }
      return;
    }
    const last = activePath.at(-1);
    if (last && Math.hypot(last[0] - at.x, last[1] - at.y) < 0.1) return;
    replacePath([...activePath, [at.x, at.y]]);
    setError("");
    setNotice("");
  }
  function addCutout() {
    const issue = geometryIssue(draft);
    if (issue) {
      setError(issue);
      return;
    }
    setCutouts([...cutouts, []]);
    setError("");
  }
  function submit() {
    const issue = geometryIssue(draft);
    if (issue || !writable) {
      setError(issue || "A calibrated working sheet is required.");
      return;
    }
    save([...records, { ...draft, id: crypto.randomUUID() }]);
    reset();
    setNotice(kind + " saved.");
  }
  const swapped = rotation % 180 !== 0;
  const width = swapped ? s.h : s.w,
    height = swapped ? s.w : s.h;
  return (
    <Modal title="Sheet measurements" wide close={close}>
      <p>
        {s.number} · {s.name}. These dimensions are separate from priced duct
        quantities.
      </p>
      {!calibrated && (
        <p className="issue">
          Calibrate this single-scale sheet before measuring.
        </p>
      )}
      <div className="gmbar">
        {writable && !matching && (
          <Field label="Geometry type">
            <Choice
              value={kind}
              disabled={points.length > 0}
              onChange={(e) => {
                reset();
                setKind(e.target.value as GenericMeasurement["kind"]);
              }}
            >
              <option>Length</option>
              <option>Polyline</option>
              <option>Polygon</option>
            </Choice>
          </Field>
        )}
        {writable && (
          <button
            className="secondary small"
            disabled={!!points.length || searching}
            onClick={() => {
              setMatching(!matching);
              setMatches([]);
              setTemplate([]);
              setNotice("");
              setError("");
            }}
          >
            {matching
              ? "Back to manual measurement"
              : "Find similar rectangles"}
          </button>
        )}
        <button
          className="secondary small"
          disabled={zoom <= 1}
          onClick={() => setZoom(zoom - 0.25)}
        >
          Zoom out
        </button>
        <button
          className="secondary small"
          disabled={zoom >= 3}
          onClick={() => setZoom(zoom + 0.25)}
        >
          Zoom in
        </button>
        <button
          className="secondary small"
          onClick={() => setRotation((rotation + 90) % 360)}
        >
          Rotate 90°
        </button>
      </div>
      {writable && (
        <p>
          {matching
            ? "Click two opposite corners of one rectangular outline, then search this sheet."
            : cutouts.length
              ? "Click vertices of cutout " + cutouts.length + "."
              : kind === "Polygon"
                ? "Click vertices around the outer boundary."
                : kind === "Polyline"
                  ? "Click each vertex of the path in order."
                  : "Click the two endpoints."}{" "}
          Scroll the zoomed drawing to pan.
        </p>
      )}
      <div className="gmviewport">
        <svg
          aria-label="Calibrated geometry drawing"
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: zoom * 100 + "%" }}
          onPointerDown={add}
        >
          <g
            ref={group}
            transform={`translate(${width / 2} ${height / 2}) rotate(${rotation}) translate(${-s.w / 2} ${-s.h / 2})`}
          >
            <foreignObject width={s.w} height={s.h} pointerEvents="none">
              <div
                style={{ position: "relative", width: "100%", height: "100%" }}
              >
                <SheetImage
                  data={p.documents[s.doc]}
                  sheet={s}
                  onError={setError}
                />
              </div>
            </foreignObject>
            {selected.map((m) => (
              <Trace key={m.id} {...m} />
            ))}
            <Trace {...draft} active />
            {matching && template.length === 1 && (
              <circle
                cx={template[0][0]}
                cy={template[0][1]}
                r="3"
                fill="#14419e"
              />
            )}
            {matching && template.length === 2 && (
              <rect
                {...svgBox(bounds(template[0], template[1]))}
                fill="none"
                stroke="#14419e"
                strokeDasharray="5 3"
              />
            )}
            {matches.map(({ rect, checked }, i) => (
              <rect
                key={i}
                {...svgBox(rect)}
                fill={checked ? "#168550" : "#ad3726"}
                fillOpacity=".24"
                stroke={checked ? "#075b38" : "#ad3726"}
              />
            ))}
          </g>
        </svg>
      </div>
      {matching && (
        <div>
          <p aria-live="polite">
            {chosen.length} selected · Total area{" "}
            {fmt(
              chosen.reduce(
                (n, m) =>
                  n +
                  (measurementValues(asMeasurement(m.rect), s.scale).net ?? 0),
                0,
              ),
              4,
            )}{" "}
            m²
          </p>
          <div className="gmbar">
            <button
              className="secondary"
              disabled={template.length !== 2 || searching}
              onClick={searchRectangles}
            >
              {searching ? "Searching…" : "Search sheet"}
            </button>
            <button
              className="secondary"
              disabled={searching}
              onClick={() => {
                setTemplate([]);
                setMatches([]);
                setNotice("");
                setError("");
              }}
            >
              Select another rectangle
            </button>
            <button
              className="primary"
              disabled={!chosen.length || searching}
              onClick={() => {
                const additions = chosen
                  .filter((m) => !existing.some((b) => samePlace(b, m.rect)))
                  .map((m) => ({
                    ...asMeasurement(m.rect),
                    id: crypto.randomUUID(),
                  }));
                save([...records, ...additions]);
                setNotice(additions.length + " rectangles saved.");
                setMatches([]);
                setTemplate([]);
              }}
            >
              Save selected rectangles
            </button>
          </div>
          {matches.length > 0 && (
            <details>
              <summary>Review rectangles ({matches.length})</summary>
              {matches.map((m, i) => (
                <label key={i} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={m.checked}
                    onChange={() =>
                      setMatches(
                        matches.map((v, j) =>
                          i === j ? { ...v, checked: !v.checked } : v,
                        ),
                      )
                    }
                  />{" "}
                  Rectangle {i + 1} ·{" "}
                  {fmt(
                    measurementValues(asMeasurement(m.rect), s.scale).net,
                    4,
                  )}{" "}
                  m²
                </label>
              ))}
            </details>
          )}
        </div>
      )}
      {writable && !matching && (
        <>
          <p aria-live="polite">
            {metrics.net !== null
              ? kind === "Polygon"
                ? `Gross ${fmt(metrics.gross, 4)} m² − deducted ${fmt(metrics.deducted, 4)} m² = net ${fmt(metrics.net, 4)} m²`
                : `${kind} · ${fmt(metrics.net, 4)} m`
              : activePath.length + " vertices placed"}
          </p>
          <div className="gmbar">
            <button
              className="secondary small"
              disabled={!activePath.length}
              onClick={() => {
                replacePath(activePath.slice(0, -1));
                setError("");
              }}
            >
              Undo vertex
            </button>
            {kind === "Polygon" && (
              <button
                className="secondary small"
                disabled={points.length < 3}
                onClick={addCutout}
              >
                Add cutout
              </button>
            )}
            {!!cutouts.length && (
              <button
                className="secondary small"
                onClick={() => {
                  setCutouts(cutouts.slice(0, -1));
                  setError("");
                }}
              >
                Discard last cutout
              </button>
            )}
            <button
              className="secondary small"
              disabled={!points.length}
              onClick={reset}
            >
              Clear draft
            </button>
            <button
              className="primary small"
              disabled={!points.length}
              onClick={submit}
            >
              Save geometry
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="issue">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!!selected.length && (
        <div className="tablewrap">
          <table>
            <caption>
              Saved measurements on {s.number}
              {calibrated &&
                polygons.length > 0 &&
                " · Total polygon area " +
                  fmt(
                    polygons.reduce(
                      (n, m) => n + (measurementValues(m, s.scale).net ?? 0),
                      0,
                    ),
                    4,
                  ) +
                  " m²"}
            </caption>
            <thead>
              <tr>
                <th>Geometry</th>
                <th>Gross</th>
                <th>Deducted</th>
                <th>Net</th>
                {!r.frozen && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {selected.map((m, i) => {
                const v = measurementValues(m, calibrated ? s.scale : null);
                return (
                  <tr key={m.id}>
                    <th>
                      {m.kind} {i + 1}
                    </th>
                    {[v.gross, v.deducted, v.net].map((n, j) => (
                      <td key={j}>
                        {fmt(n, 4)} {v.unit}
                      </td>
                    ))}
                    {!r.frozen && (
                      <td>
                        <button
                          className="textlink"
                          aria-label={"Remove " + m.kind + " " + (i + 1)}
                          onClick={() =>
                            save(records.filter((x) => x.id !== m.id))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
