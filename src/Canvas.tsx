import { useEffect,useState,useRef } from "react";
import {
MousePointer2,
Hand,
Ruler,
MessageSquarePlus,
Plus,
Minus,
Maximize,
RotateCw,
Undo2,
Redo2,
Layers,
ChevronDown,Focus,ChevronLeft,
ChevronRight
} from "lucide-react";
import { drawPage } from "./io";
import {
piece,
type Sheet,
type Rev,
type Item,
type Pt,
type Project,
} from "./model";
import { IconButton } from "./ui";
export type Tool =
  "Select" | "Pan" | "Measure" | "Calibrate" | "Verify" | "Query" | "Redraw";
export function SheetImage({
  data,
  sheet,
  onError,
}: {
  data: string;
  sheet: Sheet;
  onError?: (s: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    const canvas = document.createElement("canvas");
    drawPage(canvas, data, sheet, Math.min(2.4, 2400 / sheet.w))
      .then(() => {
        if (live) ref.current?.replaceChildren(canvas);
      })
      .catch((e) => {
        if (live) onError?.(e.message);
      });
    return () => {
      live = false;
    };
  }, [data, sheet.doc, sheet.page, sheet.w]);
  return <div ref={ref} className="pdfimage" />;
}
type Props = {
  p: Project;
  r: Rev;
  s: Sheet;
  selected?: Item;
  select: (id: string) => void;
  tool: Tool;
  setTool: (v: Tool) => void;
  complete: (pts: Pt[]) => void;
  onePoint: boolean;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  notify: (s: string) => void;
  openQuery: (id: string) => void;
  prev: () => void;
  next: () => void;
  wide: () => void;
  finishName: string;
};
export function DrawingCanvas({
  p,
  r,
  s,
  selected,
  select,
  tool,
  setTool,
  complete,
  onePoint,
  undo,
  redo,
  canUndo,
  canRedo,
  notify,
  openQuery,
  prev,
  next,
  wide,
  finishName,
}: Props) {
  const [zoom, z] = useState(1),
    [pan, setPan] = useState<Pt>([0, 0]),
    [rotation, rotate] = useState(0),
    [start, setStart] = useState<Pt | null>(null),
    [hover, setHover] = useState<Pt | null>(null),
    [layers, showLayers] = useState(false),
    [show, setShow] = useState(true),
    [view, setView] = useState({ w: 900, h: 540 });
  const stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    drag = useRef<{ x: number; y: number; p: Pt } | null>(null);
  useEffect(() => {
    const el = stage.current!;
    const ob = new ResizeObserver(([v]) =>
      setView({ w: v.contentRect.width, h: v.contentRect.height }),
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    z(1);
    rotate(0);
    setPan([0, 0]);
    setStart(null);
  }, [s.id, s.doc]);
  useEffect(() => {
    setStart(null);
    setHover(null);
  }, [tool, finishName]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStart(null);
        setTool("Select");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setTool]);
  const fit = Math.max(
    0.04,
    Math.min(
      (view.w - 44) / (rotation % 180 ? s.h : s.w),
      (view.h - 80) / (rotation % 180 ? s.w : s.h),
    ),
  );
  const scale = fit * zoom;
  function pt(e: React.PointerEvent<SVGSVGElement>): Pt {
    const m = svg.current!.getScreenCTM()!,
      p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.min(s.w, Math.max(0, p.x)), Math.min(s.h, Math.max(0, p.y))];
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "Pan") return;
    if (tool === "Select") return;
    const point = pt(e);
    if (
      tool === "Query" ||
      ((tool === "Measure" || tool === "Redraw") && onePoint)
    ) {
      complete([point]);
      return;
    }
    if (!start) setStart(point);
    else if (Math.hypot(start[0] - point[0], start[1] - point[1]) > 0.1) {
      complete([start, point]);
      setStart(null);
    }
  }
  const items = r.items.filter((i) => i.sheet === s.id);
  const position = r.sheets.indexOf(s);
  return (
    <section className="drawingview">
      <div className="drawingheading">
        <div>
          <span className="drawing-symbol">
            <Layers size={16} />
          </span>
          <strong>{s.number}</strong>
          <span className="slash">/</span>
          <span>{s.name}</span>
        </div>
        <IconButton title="Expand drawing workspace" onClick={wide}>
          <Maximize />
        </IconButton>
      </div>
      <div
        ref={stage}
        className={"stage tool-" + tool.toLowerCase()}
        onPointerDown={(e) => {
          if (tool === "Pan") {
            drag.current = { x: e.clientX, y: e.clientY, p: pan };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setPan([
              drag.current.p[0] + e.clientX - drag.current.x,
              drag.current.p[1] + e.clientY - drag.current.y,
            ]);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div className="canvas-meta">
          <span>
            <i className={"dot " + (!s.scale || s.mixed ? "amber" : "")} />
            {s.mixed ? "Mixed scales" : s.scale ? "Calibrated" : "Uncalibrated"}
          </span>
          <button onClick={() => showLayers(!layers)}>
            <Layers size={14} /> Layers <ChevronDown size={12} />
          </button>
        </div>
        {layers && (
          <div className="layerpop">
            <label>
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
              />{" "}
              Takeoff markup
            </label>
          </div>
        )}
        <div
          className="sheetpaper"
          style={{
            width: s.w * scale,
            height: s.h * scale,
            transform:
              "translate(calc(-50% + " +
              pan[0] +
              "px),calc(-50% + " +
              pan[1] +
              "px)) rotate(" +
              rotation +
              "deg)",
          }}
        >
          <SheetImage data={p.documents[s.doc]} sheet={s} onError={notify} />
          <svg
            ref={svg}
            className="measurement"
            viewBox={`0 0 ${s.w} ${s.h}`}
            onPointerDown={down}
            onPointerMove={(e) => start && setHover(pt(e))}
            aria-label="Drawing measurement layer"
          >
            {show &&
              items.map((i) => {
                const sel = selected?.id === i.id,
                  color =
                    i.system === "Return air"
                      ? "#c68c35"
                      : piece(i.kind)
                        ? "#478597"
                        : "#318c6b",
                  single = i.pts.length === 1;
                return (
                  <g
                    key={i.id}
                    data-item={i.id}
                    role="button"
                    aria-label={"Select " + i.id}
                    className={sel ? "selected-mark" : ""}
                    style={{
                      cursor: tool === "Select" ? "pointer" : undefined,
                    }}
                    onPointerDown={(e) => {
                      if (tool === "Select") {
                        e.stopPropagation();
                        select(i.id);
                      }
                    }}
                  >
                    <title>
                      {i.id} · {i.kind}
                    </title>
                    {single ? (
                      <>
                        <circle
                          cx={i.pts[0][0]}
                          cy={i.pts[0][1]}
                          r={sel ? 10 : 6}
                          fill={color}
                          fillOpacity={0.35}
                          stroke={color}
                        />
                        <circle
                          cx={i.pts[0][0]}
                          cy={i.pts[0][1]}
                          r={11}
                          fill="transparent"
                        />
                      </>
                    ) : (
                      <>
                        <polyline
                          points={i.pts.map((p) => p.join(",")).join(" ")}
                          fill="none"
                          stroke={color}
                          strokeWidth={sel ? 18 : 8}
                          opacity={sel ? 0.45 : 0.34}
                        />
                        <polyline
                          points={i.pts.map((p) => p.join(",")).join(" ")}
                          fill="none"
                          stroke={color}
                          strokeWidth={sel ? 2.5 : 1.2}
                          strokeDasharray={sel ? "none" : "5 3"}
                        />
                        <polyline
                          points={i.pts.map((p) => p.join(",")).join(" ")}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                        />
                      </>
                    )}
                    {sel &&
                      i.pts.map(([x, y], n) => (
                        <rect
                          key={n}
                          x={x - 4}
                          y={y - 4}
                          width="8"
                          height="8"
                          fill="white"
                          stroke="#197352"
                          strokeWidth="2"
                        />
                      ))}
                    {sel && (
                      <g
                        transform={`translate(${i.pts[0][0] + 4},${i.pts[0][1] - 18})`}
                      >
                        <rect
                          y="-19"
                          width="82"
                          height="24"
                          rx="3"
                          fill="#185e45"
                        />
                        <text
                          x="41"
                          y="-2"
                          textAnchor="middle"
                          fill="white"
                          fontFamily="monospace"
                          fontSize="15"
                          fontWeight="bold"
                        >
                          {i.id}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            {show &&
              r.queries
                .filter((q) => q.sheet === s.id)
                .map((q) => (
                  <g
                    key={q.id}
                    transform={"translate(" + q.pt.join(" ") + ")"}
                    onPointerDown={(e) => {
                      if (tool === "Select") {
                        e.stopPropagation();
                        openQuery(q.id);
                      }
                    }}
                  >
                    <circle r="11" fill="#e3a731" />
                    <text y="5" textAnchor="middle" fontSize="16">
                      ?
                    </text>
                  </g>
                ))}
            {start && (
              <g stroke="#176a4f">
                <circle cx={start[0]} cy={start[1]} r="5" fill="#b9dd52" />
                {hover && (
                  <line
                    x1={start[0]}
                    y1={start[1]}
                    x2={hover[0]}
                    y2={hover[1]}
                    strokeWidth="3"
                    strokeDasharray="6 3"
                  />
                )}
              </g>
            )}
          </svg>
        </div>
        <div className="stagebottom">
          <div className="zoomset">
            <IconButton
              title="Zoom out"
              disabled={zoom <= 0.4}
              onClick={() => z(Math.max(0.4, zoom - 0.25))}
            >
              <Minus />
            </IconButton>
            <span>{Math.round(zoom * 100)}%</span>
            <IconButton
              title="Zoom in"
              onClick={() => z(Math.min(5, zoom + 0.25))}
            >
              <Plus />
            </IconButton>
            <i />
            <IconButton
              title="Fit drawing"
              onClick={() => {
                z(1);
                setPan([0, 0]);
              }}
            >
              <Focus />
            </IconButton>
          </div>
          <div className="pagestep">
            <IconButton
              title="Previous sheet"
              disabled={!position}
              onClick={prev}
            >
              <ChevronLeft />
            </IconButton>
            <span>
              {position + 1} / {r.sheets.length}
            </span>
            <IconButton
              title="Next sheet"
              disabled={position === r.sheets.length - 1}
              onClick={next}
            >
              <ChevronRight />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="drawingtools">
        <div className="toolgroup">
          {(
            [
              ["Select", MousePointer2],
              ["Pan", Hand],
              ["Measure", Ruler],
              ["Query", MessageSquarePlus],
            ] as const
          ).map(([t, Icon]) => (
            <button
              key={t}
              className={tool === t ? "on" : ""}
              disabled={r.frozen && ["Measure", "Query"].includes(t)}
              onClick={() => setTool(t)}
              title={t}
            >
              <Icon size={17} />
              <span>{t}</span>
            </button>
          ))}
        </div>
        <span className="toolbaraside">
          <IconButton
            title="Rotate view"
            onClick={() => rotate((rotation + 90) % 360)}
          >
            <RotateCw />
          </IconButton>
          <IconButton title="Undo" disabled={!canUndo} onClick={undo}>
            <Undo2 />
          </IconButton>
          <IconButton title="Redo" disabled={!canRedo} onClick={redo}>
            <Redo2 />
          </IconButton>
        </span>
      </div>
      <div className="drawhint">
        <MousePointer2 size={13} />
        {tool === "Select"
          ? "Select an item on the drawing to inspect its quantities."
          : tool === "Pan"
            ? "Drag the drawing to pan."
            : tool === "Query"
              ? "Click the drawing to pin a tender query."
              : (tool === "Measure" || tool === "Redraw") && onePoint
                ? "Click to place " + finishName.toLowerCase() + "."
                : start
                  ? "Click the end point. Esc cancels."
                  : "Click the first point on the drawing."}
      </div>
    </section>
  );
}
