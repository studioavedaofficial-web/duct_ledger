import { useEffect,useRef,useState } from "react";
import {
Layers3,Table2,
GitCompareArrows,
FileChartColumn,
FolderOpen,
ChevronDown,
ChevronRight,
Check,
MapPin,
Download,
Plus,
FileStack,HardDrive,Folder,
Box,Ruler,Info,
HelpCircle,LockKeyhole,
FileUp,TriangleAlert,MessageSquare
} from "lucide-react";
import {
allProjects,
getProject,
save,
validateProject,
download,
importPDF,
thumbnail,
} from "./io";
import {
pairSheets,
today,
uid,
newProject,
newItem,
changes,totals,
exceptions,
fmt,
distance,
kinds,
piece,
type Project,
type Rev,
type Sheet,
type Item,
type Pt,
type Kind
} from "./model";
import { sampleTender } from "./sample";
import { sampleThumbnails } from "./sampleLayout";
import { DrawingCanvas,type Tool } from "./Canvas";
import { Modal,Mark,Choice,Field,Empty } from "./ui";
import { Inspector,ItemForm } from "./Inspector";
import { BOQ,Metric,ReviewTable,Compare,ExportDialog } from "./Reports";
import { RatesDialog,ClientDialog } from "./Imports";
import "./style.css";
const tabs = [
  ["Takeoff", Layers3],
  ["BOQ", Table2],
  ["Revisions", GitCompareArrows],
  ["Reports", FileChartColumn],
] as const;
const viewNames = {
  Takeoff: "Drawing takeoff",
  BOQ: "Bill of quantities",
  Revisions: "Revision comparison",
  Reports: "Variation reports",
};
type View = keyof typeof viewNames;
function SheetThumb({ p, s }: { p: Project; s: Sheet }) {
  const [url, setUrl] = useState("");
  const sample =
    p.documents[s.doc] &&
    ["A", "B"].includes(s.doc) &&
    s.id in sampleThumbnails;
  useEffect(() => {
    let live = true;
    if (!sample)
      thumbnail(p, s)
        .then((img) => live && setUrl(img))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [s.doc, s.page, sample]);
  return (
    <div className="thumbimage">
      {(sample || url) && (
        <img
          alt=""
          src={
            sample
              ? sampleThumbnails[s.id as keyof typeof sampleThumbnails]
              : url
          }
        />
      )}
    </div>
  );
}
export default function App() {
  const [p, setP] = useState<Project | null>(null),
    [revId, setR] = useState(""),
    [sheetId, setS] = useState(""),
    [itemId, setI] = useState(""),
    [view, setView] = useState<View>("Takeoff"),
    [dialog, D] = useState(""),
    [tool, toolSet] = useState<Tool>("Select"),
    [kind, K] = useState<Kind>("Rectangular duct"),
    [points, P] = useState<Pt[]>([]),
    [qId, Q] = useState(""),
    [boqCode, BC] = useState(""),
    [wide, W] = useState(false),
    [message, M] = useState(""),
    [loadErr, LE] = useState(""),
    [saved, Saved] = useState("Saved locally"),
    [list, List] = useState<Project[]>([]),
    [v, V] = useState(""),
    [unit, U] = useState("m"),
    [zone, Z] = useState(""),
    [err, E] = useState(""),
    [busy, B] = useState(false),
    [createdItem, CI] = useState<Item | null>(null),
    [pending, Pending] = useState<Awaited<ReturnType<typeof importPDF>> | null>(
      null,
    ),
    [pairs, Pairs] = useState<string[]>([]),
    [listFilter, setFilter] = useState("");
  const undoStack = useRef<Project[]>([]),
    redoStack = useRef<Project[]>([]),
    upload = useRef<HTMLInputElement>(null),
    restoreInput = useRef<HTMLInputElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    saveQueue = useRef(Promise.resolve()),
    serial = useRef(0);
  const r = p?.revs.find((x) => x.id === revId) ?? p?.revs.at(-1),
    s = r?.sheets.find((x) => x.id === sheetId) ?? r?.sheets[0],
    item = r?.items.find((x) => x.id === itemId && x.sheet === s?.id),
    old = p && r ? p.revs[p.revs.indexOf(r) - 1] : undefined;
  function notify(msg: string) {
    M(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => M(""), 3500);
  }
  function close() {
    D("");
    E("");
    CI(null);
  }
  function open(key: string) {
    D(key);
    E("");
    V("");
    Z("");
    if (key === "projects")
      allProjects()
        .then(List)
        .catch((e) => E(String(e)));
  }
  function persist(next: Project) {
    const no = ++serial.current;
    Saved("Saving…");
    setP(next);
    saveQueue.current = saveQueue.current
      .then(async () => {
        await save(next);
        if (no === serial.current) Saved("Saved locally");
      })
      .catch((e) => {
        Saved("Save failed");
        notify(String(e));
      });
    localStorage.setItem("dl-active", next.id);
  }
  function activate(next: Project, stored = false) {
    const rr = stored
      ? (next.revs.find((x) => x.id === localStorage.getItem("dl-rev")) ??
        next.revs.at(-1)!)
      : next.revs.at(-1)!;
    const ss = stored
      ? (rr.sheets.find((x) => x.id === localStorage.getItem("dl-sheet")) ??
        rr.sheets[0])
      : rr.sheets[0];
    setR(rr.id);
    setS(ss?.id ?? "");
    const chosen = stored
      ? rr.items.find(
          (i) => i.sheet === ss?.id && i.id === localStorage.getItem("dl-item"),
        )
      : undefined;
    setI(chosen?.id ?? rr.items.find((i) => i.sheet === ss?.id)?.id ?? "");
    setView("Takeoff");
    toolSet("Select");
    undoStack.current = [];
    redoStack.current = [];
    persist(next);
    close();
  }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const link = new URLSearchParams(location.search),
          id = link.get("project") ?? localStorage.getItem("dl-active");
        const next = (id && (await getProject(id))) || (await sampleTender());
        if (live) {
          activate(next, true);
          if (link.has("item")) {
            const rr = next.revs.find((v) => v.id === link.get("revision")),
              i = rr?.items.find((v) => v.id === link.get("item"));
            if (rr && i && next.id === id) {
              setR(rr.id);
              setS(i.sheet);
              setI(i.id);
            } else
              notify(
                "Drawing reference unavailable in this browser. Restore the matching project backup.",
              );
          }
        }
      } catch (e) {
        if (live) LE(String(e));
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (p) {
      localStorage.setItem("dl-rev", revId);
      localStorage.setItem("dl-sheet", sheetId);
      localStorage.setItem("dl-item", itemId);
    }
  }, [p, revId, sheetId, itemId]);
  function commit(fn: (rr: Rev, np: Project) => void, forget = false) {
    if (!p || !r || r.frozen) return;
    const next = structuredClone(p);
    fn(
      next.revs.find((x) => x.id === r.id)!,
      next,
    );
    if (forget) undoStack.current = [];
    else {
      undoStack.current.push(p);
      if (undoStack.current.length > 40) undoStack.current.shift();
    }
    redoStack.current = [];
    persist(next);
  }
  function mutate(fn: (rr: Rev) => void, changedId?: string) {
    commit((rr) => {
      fn(rr);
      rr.approved = changedId
        ? rr.approved.filter((id) => id !== changedId)
        : [];
    });
  }
  function undo(redo = false) {
    if (!p || r?.frozen) return;
    const stack = redo ? redoStack.current : undoStack.current,
      n = stack.pop();
    if (n) {
      (redo ? undoStack.current : redoStack.current).push(p);
      persist(n);
      notify(redo ? "Edit restored" : "Edit undone");
    }
  }
  function chooseSheet(sheet: Sheet, rr = r!) {
    setS(sheet.id);
    setI(rr.items.find((i) => i.sheet === sheet.id)?.id ?? "");
    toolSet("Select");
  }
  function chooseRev(rr: Rev) {
    setR(rr.id);
    const sh = rr.sheets.find((x) => x.id === s?.id) ?? rr.sheets[0];
    if (sh) chooseSheet(sh, rr);
    undoStack.current = [];
    redoStack.current = [];
    toolSet("Select");
  }
  function go(id: string, baseline = false) {
    const rr = baseline ? old : r;
    if (!rr) return;
    const i = rr.items.find((x) => x.id === id);
    if (!i) return;
    chooseRev(rr);
    setS(i.sheet);
    setI(id);
    setView("Takeoff");
    close();
  }
  function setTool(t: Tool) {
    if (r?.frozen && !["Select", "Pan"].includes(t)) {
      notify("This revision is frozen");
      return;
    }
    if (t === "Measure") {
      if (!s?.scale || s.mixed) {
        notify("Calibrate a single-scale sheet before measuring");
        return;
      }
      open("measure");
      return;
    }
    toolSet(t);
  }
  function done(pts: Pt[]) {
    if (!s || !r || r.frozen) return;
    P(pts);
    if (tool === "Calibrate" || tool === "Verify") {
      U("m");
      open("distance");
      return;
    }
    if (tool === "Query") {
      Q("");
      open("query");
      return;
    }
    if (tool === "Redraw" && item) {
      mutate((rr) => {
        rr.items.find((x) => x.id === item.id)!.pts = pts;
      }, item.id);
      toolSet("Select");
      return;
    }
    const prefix = piece(kind) ? "FT" : kind === "Vertical riser" ? "VR" : "SA";
    let n = 1;
    const ids = new Set(p!.revs.flatMap((rr) => rr.items.map((x) => x.id)));
    while (ids.has(prefix + "-" + String(n).padStart(3, "0"))) n++;
    const i = newItem(prefix + "-" + String(n).padStart(3, "0"), s, kind, pts);
    CI(i);
    open("item");
    toolSet("Select");
  }
  async function handleImport(file: File, revision = false) {
    if (!r || !p) return;
    B(true);
    try {
      const result = await importPDF(file, file.name);
      if (revision) {
        Pending(result);
        Pairs(result.sheets.map(() => ""));
        open("pair");
      } else {
        if (r.frozen) throw Error("Create a revision to import drawings");
        const existing = r.sheets.length;
        result.sheets.forEach(
          (ss, i) => (ss.number = "M-" + (101 + existing + i)),
        );
        commit((rr, np) => {
          np.documents[result.id] = result.data;
          rr.sheets.push(...result.sheets);
        });
        chooseSheet(result.sheets[0]);
        close();
        notify("Drawing imported · calibrate the sheet");
      }
    } catch (e) {
      E(String(e));
      notify(String(e));
    } finally {
      B(false);
    }
  }
  function createRev() {
    if (!p || !r || !r.frozen || !pending) return;
    const np = structuredClone(p),
      nr = structuredClone(r);
    nr.id =
      r.id.length === 1 && r.id < "Z"
        ? String.fromCharCode(r.id.charCodeAt(0) + 1)
        : "R" + (p.revs.length + 1);
    if (np.revs.some((x) => x.id === nr.id)) {
      E("Start from the latest approved revision");
      return;
    }
    nr.date = today();
    nr.frozen = false;
    nr.approved = [];
    nr.alignment = {};
    np.documents[pending.id] = pending.data;
    nr.sheets = pairSheets(pending.sheets, r, pairs);
    nr.items = nr.items
      .filter((i) => nr.sheets.some((s) => s.id === i.sheet))
      .map((i) => ({ ...i, review: true, decision: undefined }));
    nr.queries = nr.queries.filter((q) =>
      nr.sheets.some((s) => s.id === q.sheet),
    );
    np.revs.push(nr);
    Pending(null);
    activate(np);
    notify("Revision created · review carried measurements");
  }
  if (!p || !r)
    return (
      <div className="startup">
        <Mark />
        <h1>DuctLedger</h1>
        <p>{loadErr || "Opening local workspace…"}</p>
        {loadErr && <button onClick={() => location.reload()}>Retry</button>}
      </div>
    );
  const changed = changes(old, r),
    issues = exceptions(r),
    unconfirmed = changed.filter((c) => !r.approved.includes(c.id)),
    confirm = (id: string) =>
      commit((rr) => {
        rr.approved = Array.from(new Set([...rr.approved, id]));
      }),
    query = r.queries.find((q) => q.id === qId),
    editItem = createdItem ?? item;
  const selectView = (v: View) => {
    setView(v);
    W(false);
    toolSet("Select");
  };
  const priceSum = changed.reduce((a, x) => a + (x.delta ?? 0), 0);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span>DuctLedger</span>
        </div>
        <nav aria-label="Workspace views">
          {tabs.map(([name, Icon]) => (
            <button
              key={name}
              className={view === name ? "current" : ""}
              onClick={() => selectView(name)}
            >
              <Icon size={17} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="topright">
          <span className="localbadge">
            <i />
            Local workspace
          </span>
          <button
            className="avatar"
            title="Workspace projects"
            onClick={() => open("projects")}
          >
            DL
          </button>
        </div>
      </header>
      <main>
        <div className="breadcrumb">
          <button onClick={() => open("projects")}>
            <Folder size={14} />
            Projects
          </button>
          <ChevronRight size={12} />
          <button onClick={() => open("projects")}>
            {p.name}
            <ChevronDown size={12} />
          </button>
        </div>
        <div className="workspacehead">
          <div className="headingblock">
            <h1>{viewNames[view]}</h1>
            <div className="projectline">
              <span>{p.name}</span>
              <i /> <MapPin size={13} />
              {p.location || "Local project"}
            </div>
          </div>
          <div className="actionrow">
            <div className="revselect">
              <GitCompareArrows size={16} />
              <Choice
                aria-label="Active revision"
                value={r.id}
                onChange={(e) =>
                  chooseRev(p.revs.find((x) => x.id === e.target.value)!)
                }
              >
                {p.revs.map((v) => (
                  <option value={v.id} key={v.id}>
                    Revision {v.id}
                  </option>
                ))}
              </Choice>
            </div>
            <button className="primary" onClick={() => open("export")}>
              <Download size={16} />
              Export report
            </button>
          </div>
        </div>
        {view === "Takeoff" ? (
          <div className={"workspace " + (wide ? "expanded" : "")}>
            <aside className="sheetside">
              <div className="panelhead">
                <span>
                  <FileStack size={17} />
                  Drawing sheets
                </span>
                <b className="count">
                  {String(r.sheets.length).padStart(2, "0")}
                </b>
              </div>
              <div className="sheetscroll">
                {r.sheets.map((ss) => (
                  <button
                    className={"sheetcard " + (ss.id === s?.id ? "sel" : "")}
                    key={ss.id}
                    onClick={() => chooseSheet(ss)}
                  >
                    <SheetThumb p={p} s={ss} />
                    <div className="sheetnum">
                      <b>{ss.number}</b>
                      {ss.id === s?.id ? (
                        <span className="selcheck">
                          <Check size={10} />
                        </span>
                      ) : (
                        <span className="pageindex">
                          {String(ss.page).padStart(2, "0")}
                        </span>
                      )}
                    </div>
                    <span>{ss.name}</span>
                  </button>
                ))}
                {!r.frozen && (
                  <button
                    className="addsheet"
                    onClick={() => upload.current?.click()}
                  >
                    <Plus size={15} />
                    Add sheets
                  </button>
                )}
              </div>
              <div className="legend">
                <h5>Drawing legend</h5>
                <span>
                  <i className="legendline supply" />
                  Supply air
                </span>
                <span>
                  <i className="legendline return" />
                  Return air
                </span>
                <span>
                  <i className="legendbox" />
                  Fitting / terminal
                </span>
              </div>
            </aside>
            {s ? (
              <DrawingCanvas
                p={p}
                r={r}
                s={s}
                selected={item}
                select={setI}
                tool={tool}
                setTool={setTool}
                complete={done}
                onePoint={
                  piece(tool === "Redraw" && item ? item.kind : kind) ||
                  (tool === "Redraw" && item ? item.kind : kind) ===
                    "Vertical riser"
                }
                finishName={kind}
                undo={() => undo()}
                redo={() => undo(true)}
                canUndo={!!undoStack.current.length && !r.frozen}
                canRedo={!!redoStack.current.length && !r.frozen}
                notify={notify}
                openQuery={(id) => {
                  Q(id);
                  open("query");
                  V(r.queries.find((q) => q.id === id)?.response ?? "");
                }}
                prev={() => chooseSheet(r.sheets[r.sheets.indexOf(s) - 1])}
                next={() => chooseSheet(r.sheets[r.sheets.indexOf(s) + 1])}
                wide={() => W(!wide)}
              />
            ) : (
              <div className="emptycanvas">
                <Empty
                  title="Import your first drawing"
                  text="Add a PDF, then calibrate a known dimension to begin takeoff."
                >
                  <button
                    className="primary"
                    onClick={() => upload.current?.click()}
                  >
                    <FileUp />
                    Import PDF
                  </button>
                </Empty>
              </div>
            )}
            <Inspector
              r={r}
              item={item}
              edit={() => open("item")}
              openBoq={() => {
                BC(item?.code ?? "");
                selectView("BOQ");
              }}
            />
          </div>
        ) : view === "BOQ" ? (
          <BOQ
            r={r}
            initial={boqCode}
            go={go}
            importRates={() => open("rates")}
            client={() => open("client")}
          />
        ) : (
          <section className="data-area">
            <div className="datahead">
              <div>
                <span className="eyebrow">
                  {view === "Revisions"
                    ? "DRAWING CONTROL"
                    : "COMMERCIAL SUMMARY"}
                </span>
                <h2>
                  {view === "Revisions"
                    ? "Revision " +
                      r.id +
                      (r.frozen ? " · Approved" : " · Working revision")
                    : "Variation summary"}
                </h2>
              </div>
              <div className="actionrow">
                {view === "Revisions" ? (
                  <>
                    {!r.frozen ? (
                      <button
                        className="primary"
                        onClick={() => open("freeze")}
                      >
                        <LockKeyhole size={15} />
                        Approve & freeze
                      </button>
                    ) : p.revs.at(-1)?.id === r.id ? (
                      <button
                        className="primary"
                        onClick={() => open("newrevision")}
                      >
                        <Plus />
                        Create revision
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button className="secondary" onClick={() => open("queries")}>
                    <MessageSquare size={15} />
                    Tender queries
                  </button>
                )}
              </div>
            </div>
            <div className="metrics">
              {view === "Revisions" ? (
                <>
                  <Metric
                    title="Baseline revision"
                    value={old ? "Revision " + old.id : "Original tender"}
                  />
                  <Metric
                    title="Changed lines"
                    value={String(changed.length)}
                  />
                  <Metric
                    title="Awaiting confirmation"
                    value={String(unconfirmed.length)}
                  />
                </>
              ) : (
                <>
                  <Metric
                    title="Additions"
                    value={
                      "PKR " +
                      fmt(
                        changed.reduce(
                          (a, x) => a + Math.max(0, x.delta ?? 0),
                          0,
                        ),
                      )
                    }
                  />
                  <Metric
                    title="Credits"
                    value={
                      "PKR " +
                      fmt(
                        changed.reduce(
                          (a, x) => a + Math.min(0, x.delta ?? 0),
                          0,
                        ),
                      )
                    }
                  />
                  <Metric
                    title="Net priced variation"
                    value={"PKR " + fmt(priceSum)}
                  />
                </>
              )}
            </div>
            {view === "Revisions" && old && (
              <Compare
                p={p}
                r={r}
                old={old}
                saveAlign={(id, m) =>
                  commit((rr) => (rr.alignment = { ...rr.alignment, [id]: m }))
                }
              />
            )}
            <h3>Detailed changes</h3>
            <ReviewTable r={r} old={old} go={go} confirm={confirm} />
            <h3>
              Outstanding checks{" "}
              <span className="count">
                {issues.length + unconfirmed.length}
              </span>
            </h3>
            {[
              ...issues,
              ...unconfirmed.map(
                (c) => c.id + " · Awaiting change confirmation",
              ),
            ].map((i, n) => (
              <p key={n} className="checkline">
                <TriangleAlert size={14} />
                {i}
              </p>
            ))}
            {!issues.length && !unconfirmed.length && (
              <p className="readystatus">
                <Check size={15} />
                All checks resolved
              </p>
            )}
          </section>
        )}
        {view === "Takeoff" && (
          <div className="worksummary">
            <button
              onClick={() => {
                setFilter("");
                open("items");
              }}
            >
              <Box />
              <b>{r.items.filter((i) => i.sheet === s?.id).length}</b>sheet
              items
            </button>
            <i />
            <button disabled={!s} onClick={() => open("calibration")}>
              <Ruler />
              {s?.scale ? "Sheet calibrated" : "Calibrate sheet"}
            </button>
            <i />
            <button onClick={() => open("queries")}>
              <MessageSquare />
              <b>{r.queries.filter((q) => !q.response).length}</b>open queries
            </button>
            <div className="summaryright">
              <span className="rev-dot" />
              {r.frozen ? "Frozen baseline" : "Working revision"}
            </div>
          </div>
        )}
      </main>
      <footer>
        <span>
          <HardDrive size={14} />
          {saved}
        </span>
        <span>
          <b>PKR</b>
          <i />
          Metric units
          <i />
          <button onClick={() => open("help")}>
            <HelpCircle size={14} />
            Workspace guide
          </button>
        </span>
      </footer>
      <input
        hidden
        type="file"
        ref={upload}
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = "";
        }}
      />
      <input
        hidden
        type="file"
        ref={restoreInput}
        accept=".json,.ductledger"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            const restored = await validateProject(
              JSON.parse(await file.text()),
            );
            if (await getProject(restored.id)) restored.id = uid();
            activate(restored);
            notify("Project backup restored");
          } catch (e) {
            E(String(e));
            notify(String(e));
          }
        }}
      />
      {dialog === "projects" && (
        <Modal title="Local projects" close={close}>
          <div className="projectlist">
            {list.map((v) => (
              <button key={v.id} onClick={() => activate(v)}>
                <FolderOpen />
                <div>
                  <b>{v.name}</b>
                  <small>
                    {v.location} · {v.revs.length} revision
                    {v.revs.length !== 1 ? "s" : ""}
                  </small>
                </div>
                {v.id === p.id && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="actionrow wrap">
            <button className="primary" onClick={() => open("newproject")}>
              <Plus />
              Create project
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  activate(await sampleTender());
                  notify("Sample tender opened");
                } catch (e) {
                  E(String(e));
                }
              }}
            >
              Open sample tender
            </button>
          </div>
          <hr />
          <div className="actionrow wrap">
            <button
              className="secondary"
              onClick={() =>
                download(
                  JSON.stringify(p),
                  p.name + ".ductledger",
                  "application/json",
                )
              }
            >
              <Download />
              Back up project
            </button>
            <button
              className="secondary"
              onClick={() => restoreInput.current?.click()}
            >
              <FileUp />
              Restore backup
            </button>
          </div>
          {err && <p className="issue">{err}</p>}
        </Modal>
      )}
      {dialog === "newproject" && (
        <Modal title="Create project" close={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (v.trim()) activate(newProject(v.trim(), zone.trim()));
            }}
          >
            <Field label="Project name">
              <input
                required
                autoFocus
                value={v}
                onChange={(e) => V(e.target.value)}
                placeholder="Commercial project name"
              />
            </Field>
            <Field label="Location">
              <input
                value={zone}
                onChange={(e) => Z(e.target.value)}
                placeholder="City, country"
              />
            </Field>
            <div className="formactions">
              <button className="primary">Create project</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "measure" && (
        <Modal title="Measure ductwork" close={close}>
          <Field label="Item type">
            <Choice value={kind} onChange={(e) => K(e.target.value as Kind)}>
              {kinds.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Choice>
          </Field>
          <p className="intro">
            {piece(kind)
              ? "Place the fitting at its drawing location. Enter its piece count in the inspector."
              : kind === "Vertical riser"
                ? "Place the riser on the plan, then enter its vertical length in metres."
                : "Click both ends of a straight run. End the run at fitting boundaries."}
          </p>
          <div className="formactions">
            <button
              className="primary"
              onClick={() => {
                close();
                toolSet("Measure");
              }}
            >
              Start measuring
            </button>
          </div>
        </Modal>
      )}
      {dialog === "item" && editItem && (
        <ItemForm
          item={editItem}
          r={r}
          close={close}
          submit={(i) => {
            mutate((rr) => {
              const n = rr.items.findIndex((o) => o.id === i.id);
              if (n < 0) rr.items.push(i);
              else rr.items[n] = i;
            }, i.id);
            setI(i.id);
            close();
            notify("Item saved");
          }}
          remove={() => {
            if (createdItem) {
              close();
              return;
            }
            open("remove");
          }}
          redraw={() => {
            if (createdItem) {
              close();
              toolSet("Measure");
            } else {
              close();
              toolSet("Redraw");
            }
          }}
        />
      )}
      {dialog === "remove" && item && (
        <Modal title={"Remove " + item.id + "?"} close={close}>
          <p>The item will be removed from this revision’s quantities.</p>
          <div className="formactions">
            <button className="secondary" onClick={close}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() => {
                mutate(
                  (rr) => (rr.items = rr.items.filter((i) => i.id !== item.id)),
                  item.id,
                );
                setI("");
                close();
              }}
            >
              Remove item
            </button>
          </div>
        </Modal>
      )}
      {dialog === "calibration" && (
        <Modal title="Sheet calibration" close={close}>
          {s ? (
            <>
              <p>
                {s.number} · {s.name}
              </p>
              {!r.frozen && (
                <button
                  className="secondary small"
                  onClick={() => {
                    open("sheetinfo");
                    V(s.number);
                    Z(s.name);
                  }}
                >
                  Edit sheet details
                </button>
              )}
              <div className="keyrow">
                <span>Measurement scale</span>
                <b>
                  {s.scale
                    ? fmt(s.scale, 6) + " m / PDF point"
                    : "Uncalibrated"}
                </b>
              </div>
              <div className="keyrow">
                <span>Second dimension</span>
                <b>{s.verified ? "Verified" : "Unverified"}</b>
              </div>
              <label className="checklabel">
                <input
                  type="checkbox"
                  checked={!!s.mixed}
                  disabled={r.frozen}
                  onChange={(e) =>
                    mutate((rr) => {
                      const sh = rr.sheets.find((t) => t.id === s.id)!;
                      sh.mixed = e.target.checked;
                      sh.scale = null;
                      sh.verified = false;
                      sh.log.push(
                        today() + " · Sheet scale classification changed",
                      );
                      rr.items
                        .filter((i) => i.sheet === s.id)
                        .forEach((i) => (i.review = true));
                    })
                  }
                />
                Sheet contains multiple scales
              </label>
              {s.mixed && (
                <p className="issue">
                  Measurement is blocked. Import each scaled region as a
                  separate cropped PDF sheet and calibrate it independently.
                </p>
              )}
              <h4>Calibration history</h4>
              {s.log.map((l, i) => (
                <p className="quiet" key={i}>
                  {l}
                </p>
              ))}
              <div className="formactions">
                <button
                  disabled={r.frozen || !s.scale || s.mixed}
                  className="secondary"
                  onClick={() => {
                    close();
                    toolSet("Verify");
                  }}
                >
                  Verify dimension
                </button>
                <button
                  className="primary"
                  disabled={r.frozen || s.mixed}
                  onClick={() => {
                    close();
                    toolSet("Calibrate");
                  }}
                >
                  Calibrate sheet
                </button>
              </div>
            </>
          ) : (
            <p>Import a drawing first.</p>
          )}
        </Modal>
      )}
      {dialog === "sheetinfo" && s && (
        <Modal title="Edit sheet details" close={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!v.trim() || !zone.trim()) return;
              commit((rr) => {
                const sh = rr.sheets.find((x) => x.id === s.id)!;
                sh.number = v.trim();
                sh.name = zone.trim();
              });
              close();
            }}
          >
            <Field label="Drawing number">
              <input required value={v} onChange={(e) => V(e.target.value)} />
            </Field>
            <Field label="Sheet title">
              <input
                required
                value={zone}
                onChange={(e) => Z(e.target.value)}
              />
            </Field>
            <div className="formactions">
              <button className="primary">Save details</button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "distance" && s && (
        <Modal
          title={
            tool === "Verify" ? "Verify known dimension" : "Set drawing scale"
          }
          close={close}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const len = Number(v) / (unit === "mm" ? 1000 : 1),
                d = distance(points[0], points[1]);
              if (!Number.isFinite(len) || len <= 0 || d <= 0) return;
              const ver = tool === "Verify",
                measured = d * (s.scale ?? 0),
                pass = Math.abs(measured - len) / len <= 0.01;
              mutate((rr) => {
                const ss = rr.sheets.find((x) => x.id === s.id)!;
                ss.verified = ver && pass;
                if (!ver || !pass) {
                  if (!ver) ss.scale = len / d;
                  rr.items
                    .filter((i) => i.sheet === s.id)
                    .forEach((i) => (i.review = true));
                }
                ss.log.push(
                  today() +
                    " · " +
                    (ver
                      ? "Verification " +
                        (pass ? "passed" : "failed") +
                        " · measured " +
                        fmt(measured) +
                        " m"
                      : "Calibrated") +
                    " against " +
                    fmt(len) +
                    " m at " +
                    points
                      .map((pt) => pt.map((v) => fmt(v, 2)).join(","))
                      .join(" to "),
                );
              });
              close();
              toolSet("Select");
              notify(
                ver
                  ? "Verification " + (pass ? "passed" : "failed")
                  : "Calibration saved. Review affected items.",
              );
            }}
          >
            <div className="fieldgrid">
              <Field label="Known length">
                <input
                  autoFocus
                  required
                  type="number"
                  min=".000001"
                  step="any"
                  value={v}
                  onChange={(e) => V(e.target.value)}
                />
              </Field>
              <Field label="Length unit">
                <Choice value={unit} onChange={(e) => U(e.target.value)}>
                  <option>m</option>
                  <option>mm</option>
                </Choice>
              </Field>
            </div>
            {tool === "Verify" && (
              <p>
                Measured length{" "}
                {fmt(distance(points[0], points[1]) * (s.scale ?? 0))} m ·
                tolerance 1%
              </p>
            )}
            <div className="formactions">
              <button className="primary">
                Save {tool === "Verify" ? "verification" : "calibration"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "items" && (
        <Modal title="Drawing items" close={close}>
          <input
            className="searchinput"
            placeholder="Find an item by ID, type or system"
            value={listFilter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="projectlist">
            {r.items
              .filter(
                (i) =>
                  i.sheet === s?.id &&
                  (i.id + i.kind + i.system)
                    .toLowerCase()
                    .includes(listFilter.toLowerCase()),
              )
              .map((i) => (
                <button onClick={() => go(i.id)} key={i.id}>
                  <Box />
                  <div>
                    <b>{i.id}</b>
                    <small>
                      {i.kind} · {i.system}
                    </small>
                  </div>
                  <ChevronRight size={15} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {dialog === "queries" && (
        <Modal title="Tender query register" close={close}>
          {r.queries.length ? (
            r.queries.map((q) => (
              <button
                className="queryline"
                key={q.id}
                onClick={() => {
                  Q(q.id);
                  setS(q.sheet);
                  open("query");
                  V(q.response);
                }}
              >
                <b>{q.id}</b> {q.text}
                <small>{q.response ? "Answered" : "Open"}</small>
              </button>
            ))
          ) : (
            <Empty
              title="No tender queries"
              text="Pin a question to the drawing and record the response here."
            />
          )}
          <div className="formactions">
            <button
              className="primary"
              disabled={!s || r.frozen}
              onClick={() => {
                close();
                selectView("Takeoff");
                toolSet("Query");
              }}
            >
              <MapPin />
              Pin query
            </button>
          </div>
        </Modal>
      )}
      {dialog === "query" && (
        <Modal title={query ? query.id : "Pin tender query"} close={close}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!s || r.frozen) return;
              commit((rr) => {
                if (query) {
                  rr.queries.find((q) => q.id === query.id)!.response =
                    v.trim();
                } else
                  rr.queries.push({
                    id: "TQ-" + String(rr.queries.length + 1).padStart(3, "0"),
                    sheet: s.id,
                    pt: points[0],
                    text: v.trim(),
                    response: "",
                  });
              });
              close();
              toolSet("Select");
            }}
          >
            {query && <p>{query.text}</p>}
            <Field label={query ? "Recorded response" : "Question"}>
              <textarea
                key={query?.id}
                autoFocus
                required={!query}
                readOnly={r.frozen}
                defaultValue={query?.response ?? ""}
                onChange={(e) => V(e.target.value)}
                placeholder={
                  query
                    ? "Enter the contractor or client response"
                    : "Duct size missing after reducer"
                }
              />
            </Field>
            <div className="formactions">
              {!r.frozen && (
                <button className="primary">
                  Save {query ? "response" : "query"}
                </button>
              )}
            </div>
          </form>
        </Modal>
      )}
      {dialog === "rates" && (
        <RatesDialog
          r={r}
          close={close}
          apply={(rates) => {
            mutate((rr) => (rr.rates = rates));
            close();
            notify("Rates applied to Revision " + r.id);
          }}
        />
      )}
      {dialog === "client" && (
        <ClientDialog p={p} r={r} close={close} notify={notify} />
      )}
      {dialog === "export" && (
        <ExportDialog
          p={p}
          r={r}
          old={old}
          close={close}
          notify={notify}
          client={() => open("client")}
        />
      )}
      {dialog === "freeze" && (
        <Modal title={"Approve Revision " + r.id} close={close}>
          <p>
            Freeze this revision’s drawings, rates, assumptions and priced
            quantities at PKR {fmt(totals(r))}.
          </p>
          {(!r.items.length || issues.length > 0 || unconfirmed.length > 0) && (
            <div className="issue">
              Complete takeoff, resolve exceptions and confirm each change
              before approval.
            </div>
          )}
          <div className="formactions">
            <button className="secondary" onClick={close}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={
                !r.items.length || !!issues.length || !!unconfirmed.length
              }
              onClick={() => {
                commit((rr) => (rr.frozen = true), true);
                close();
                notify("Revision approved and frozen");
              }}
            >
              Approve & freeze
            </button>
          </div>
        </Modal>
      )}
      {dialog === "newrevision" && (
        <Modal title="Create revised drawing set" close={close}>
          <p className="intro">
            Attach the revised PDF. Pair its pages with the frozen baseline to
            carry item references forward.
          </p>
          <label className="dropzone">
            <FileUp />
            <b>Choose revised PDF</b>
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) handleImport(e.target.files[0], true);
              }}
            />
          </label>
          {err && <p className="issue">{err}</p>}
        </Modal>
      )}
      {dialog === "pair" && pending && (
        <Modal title="Pair revised sheets" close={close}>
          <p className="intro">
            Match each new page to its baseline sheet. Items on unpaired
            baseline sheets will appear as removals.
          </p>
          {pending.sheets.map((ss, n) => (
            <Field key={ss.id} label={"Revised PDF page " + ss.page}>
              <Choice
                value={pairs[n]}
                onChange={(e) =>
                  Pairs(pairs.map((x, i) => (i === n ? e.target.value : x)))
                }
              >
                <option value="">New sheet</option>
                {r.sheets.map((os) => (
                  <option
                    key={os.id}
                    value={os.id}
                    disabled={pairs.includes(os.id) && pairs[n] !== os.id}
                  >
                    {os.number} · {os.name}
                  </option>
                ))}
              </Choice>
            </Field>
          ))}
          {err && <p className="issue">{err}</p>}
          <div className="formactions">
            <button className="primary" onClick={createRev}>
              Create revision
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal title="Workspace guide" close={close}>
          <ol className="guide">
            <li>Create a project from the Projects menu and add a PDF.</li>
            <li>
              Open sheet calibration below the canvas. Pick two points, enter
              their known length, then verify a second dimension.
            </li>
            <li>
              Use Measure to trace a run or place a fitting. Edit its dimensions
              and material in the inspector.
            </li>
            <li>
              Import contractor rates in BOQ and map each item to its rate code.
            </li>
            <li>
              Approve the baseline in Revisions. Attach the revised PDF, pair
              pages and confirm changed items.
            </li>
            <li>
              Export a variation workbook or print a marked client report. Back
              up the project from the Projects menu.
            </li>
          </ol>
          <h4>Sample files</h4>
          <div className="samplelinks">
            {[
              ["Revision A drawing", "ductledger-rev-a.pdf"],
              ["Revision B drawing", "ductledger-rev-b.pdf"],
              ["Contractor rates", "contractor-rates.xlsx"],
              ["Client BOQ", "client-boq.xlsx"],
            ].map(([a, b]) => (
              <a href={"/samples/" + b} download key={a}>
                <Download size={14} />
                {a}
              </a>
            ))}
          </div>
        </Modal>
      )}
      {busy && <div className="toast">Reading drawing…</div>}
      {message && (
        <div className="toast" role="status">
          <Info size={16} />
          {message}
        </div>
      )}
    </div>
  );
}
