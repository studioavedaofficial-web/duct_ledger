import { validMeasurement } from "./geometry";
import { openDB } from "idb";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  normalizeUnit,
  kinds,
  piece,
  uid,
  type Project,
  type Sheet,
  type Rev,
} from "./model";
GlobalWorkerOptions.workerSrc = worker;
const db = openDB("ductledger-local-v1", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});
export async function save(p: Project) {
  const tx = (await db).transaction("projects", "readwrite"),
    stored = (await tx.store.get(p.id)) as Project | undefined;
  for (const baseline of stored?.revs.filter((v) => v.frozen) ?? []) {
    const candidate = p.revs.find((v) => v.id === baseline.id);
    if (JSON.stringify(candidate) !== JSON.stringify(baseline)) {
      throw Error(
        "The approved revision on this device has changed. Reopen the saved project before editing.",
      );
    }
  }
  await tx.store.put(p);
  await tx.done;
}
export const getProject = async (id: string): Promise<Project | undefined> =>
  (await db).get("projects", id);
export const allProjects = async (): Promise<Project[]> =>
  (await db).getAll("projects");
export function download(
  data: Blob | ArrayBuffer | string,
  name: string,
  type = "application/octet-stream",
) {
  const url = URL.createObjectURL(
    data instanceof Blob ? data : new Blob([data], { type }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function encode(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onerror = () => rej(new Error("Unable to read file"));
    reader.onload = () => res(String(reader.result).split(",")[1]);
    reader.readAsDataURL(blob);
  });
}
const cache = new Map<string, ReturnType<typeof getDocument>["promise"]>();
export function pdf(data: string) {
  if (!cache.has(data)) {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    cache.set(
      data,
      getDocument({
        data: bytes,
        useSystemFonts: true,
        cMapUrl: "/pdf-assets/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/pdf-assets/standard_fonts/",
        wasmUrl: "/pdf-assets/wasm/",
      }).promise,
    );
  }
  return cache.get(data)!;
}
export async function importPDF(file: Blob, name: string) {
  const data = await encode(file),
    doc = await pdf(data),
    id = uid(),
    sheets: Sheet[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i),
      vp = page.getViewport({ scale: 1, rotation: 0 });
    sheets.push({
      id: uid(),
      number: "M-" + (100 + i),
      name: doc.numPages === 1 ? name.replace(/\.pdf$/i, "") : "Sheet " + i,
      doc: id,
      page: i,
      w: vp.width,
      h: vp.height,
      scale: null,
      log: [],
    });
  }
  return { id, data, sheets };
}
export async function drawPage(
  canvas: HTMLCanvasElement,
  data: string,
  sheet: Sheet,
  scale: number,
) {
  const pg = await (await pdf(data)).getPage(sheet.page),
    vp = pg.getViewport({ scale, rotation: 0 });
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  await pg.render({ canvas, viewport: vp }).promise;
}
export async function thumbnail(
  p: Project,
  s: Sheet,
  item?: Rev["items"][number],
) {
  const c = document.createElement("canvas");
  await drawPage(c, p.documents[s.doc], s, Math.min(2, 1200 / s.w));
  if (!item) return c.toDataURL();
  const scale = c.width / s.w,
    ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#159a6b";
  ctx.fillStyle = "#18986855";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  ctx.beginPath();
  item.pts.forEach(([x, y], i) =>
    i ? ctx.lineTo(x * scale, y * scale) : ctx.moveTo(x * scale, y * scale),
  );
  if (item.pts.length === 1)
    ctx.arc(item.pts[0][0] * scale, item.pts[0][1] * scale, 10, 0, Math.PI * 2);
  ctx.stroke();
  const xs = item.pts.map((p) => p[0] * scale),
    ys = item.pts.map((p) => p[1] * scale),
    left = Math.max(0, Math.min(...xs) - 100),
    top = Math.max(0, Math.min(...ys) - 90),
    w = Math.min(c.width - left, Math.max(...xs) - left + 100),
    h = Math.min(c.height - top, Math.max(...ys) - top + 90);
  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;
  crop.getContext("2d")!.drawImage(c, left, top, w, h, 0, 0, w, h);
  return crop.toDataURL();
}
export async function validateProject(raw: unknown): Promise<Project> {
  const p = raw as Project;
  const fail = () => {
    throw new Error("Invalid backup. Check the DuctLedger file and try again.");
  };
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    typeof p.id !== "string" ||
    typeof p.location !== "string" ||
    !p.documents ||
    !Array.isArray(p.revs) ||
    !p.revs.length
  )
    fail();
  const unique = (ids: string[]) =>
    ids.every((x) => typeof x === "string" && x.length) &&
    new Set(ids).size === ids.length;
  const validOptionalCosts = (v: {
    labourRate?: number;
    pricingBasis?: string;
  }) =>
    (v.labourRate === undefined ||
      (Number.isFinite(v.labourRate) && v.labourRate >= 0)) &&
    (v.pricingBasis === undefined ||
      ["material", "labour"].includes(v.pricingBasis));
  if (p.presets !== undefined) {
    if (
      !Array.isArray(p.presets) ||
      !p.presets.every((preset) => {
        const v = preset?.settings;
        return (
          typeof preset?.name === "string" &&
          preset.name.trim() &&
          v &&
          kinds.includes(v.kind) &&
          [v.system, v.spec, v.code].every(
            (field) => typeof field === "string",
          ) &&
          (v.groupCode === undefined || typeof v.groupCode === "string") &&
          (v.pricingUnit === undefined || !!normalizeUnit(v.pricingUnit)) &&
          Number.isFinite(v.waste) &&
          v.waste >= 0 &&
          validOptionalCosts(v) &&
          [v.width, v.height, v.diameter].every(
            (n) => n === null || (Number.isFinite(n) && n >= 0),
          )
        );
      }) ||
      !unique(p.presets.map((v) => v.name))
    )
      fail();
  }
  if (!unique(p.revs.map((r) => r.id))) fail();
  for (const r of p.revs) {
    if (
      !Array.isArray(r.items) ||
      !Array.isArray(r.rates) ||
      !Array.isArray(r.sheets) ||
      !Array.isArray(r.queries) ||
      !Array.isArray(r.approved) ||
      typeof r.frozen !== "boolean" ||
      typeof r.date !== "string" ||
      !r.approved.every((v) => typeof v === "string") ||
      !unique(r.items.map((i) => i.id)) ||
      !unique(r.sheets.map((s) => s.id)) ||
      !unique(r.rates.map((v) => v.code))
    )
      fail();
    for (const s of r.sheets) {
      if (
        typeof p.documents[s.doc] !== "string" ||
        !p.documents[s.doc] ||
        (s.scale !== null && !(Number.isFinite(s.scale) && s.scale > 0)) ||
        !Array.isArray(s.log) ||
        typeof s.name !== "string" ||
        typeof s.number !== "string"
      )
        fail();
      const doc = await pdf(p.documents[s.doc]);
      if (!Number.isInteger(s.page) || s.page < 1 || s.page > doc.numPages)
        fail();
      const vp = (await doc.getPage(s.page)).getViewport({
        scale: 1,
        rotation: 0,
      });
      if (Math.abs(vp.width - s.w) > 0.01 || Math.abs(vp.height - s.h) > 0.01)
        fail();
    }
    if (
      r.measurements !== undefined &&
      (!Array.isArray(r.measurements) ||
        !unique(r.measurements.map((m) => m?.id)) ||
        !r.measurements.every((m) => {
          const sheet = r.sheets.find((s) => s.id === m?.sheet);
          return sheet && validMeasurement(m, sheet);
        }))
    )
      fail();
    for (const i of r.items) {
      if (
        !r.sheets.some((s) => s.id === i.sheet) ||
        !kinds.includes(i.kind) ||
        !validOptionalCosts(i) ||
        (i.pricingUnit !== undefined && !normalizeUnit(i.pricingUnit)) ||
        (i.groupCode !== undefined && typeof i.groupCode !== "string") ||
        !Array.isArray(i.pts) ||
        i.pts.length < (piece(i.kind) || i.kind === "Vertical riser" ? 1 : 2) ||
        !i.pts.every(
          (pt) =>
            Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite),
        ) ||
        ![i.spec, i.code, i.zone, i.system].every(
          (v) => typeof v === "string",
        ) ||
        ![i.waste, i.count].every((v) => Number.isFinite(v) && v >= 0) ||
        ![i.width, i.height, i.diameter, i.rise].every(
          (v) => v === null || (Number.isFinite(v) && v >= 0),
        )
      )
        fail();
    }
    for (const v of r.rates)
      if (
        typeof v.code !== "string" ||
        !normalizeUnit(v.unit) ||
        typeof v.description !== "string" ||
        (v.rate !== null && (!Number.isFinite(v.rate) || v.rate < 0))
      )
        fail();
    for (const q of r.queries)
      if (
        !r.sheets.some((s) => s.id === q.sheet) ||
        !Array.isArray(q.pt) ||
        q.pt.length !== 2 ||
        !q.pt.every(Number.isFinite) ||
        typeof q.text !== "string" ||
        typeof q.response !== "string"
      )
        fail();
    for (const matrix of Object.values(r.alignment ?? {}))
      if (
        !Array.isArray(matrix) ||
        matrix.length !== 6 ||
        !matrix.every(Number.isFinite)
      )
        fail();
  }
  return p;
}
