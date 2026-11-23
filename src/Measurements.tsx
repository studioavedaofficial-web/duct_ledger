import { useRef, useState } from "react";
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
    if (kind === "Length" && points.length === 2) return;
    const matrix = group.current.getScreenCTM();
    if (!matrix) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    if (at.x < 0 || at.y < 0 || at.x > s.w || at.y > s.h) return;
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
        {writable && (
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
          {cutouts.length
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
          </g>
        </svg>
      </div>
      {writable && (
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
            <caption>Saved measurements on {s.number}</caption>
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
