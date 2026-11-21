// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import React from "react";
import { afterEach, test, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import { PDFDocument, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
// Use the real PDF.js Node renderer for the DOM emulator's missing native canvas.
// Parsing, viewport coordinates, calibration, storage and workbook I/O use app code.
vi.mock("pdfjs-dist", async () => {
  const native = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return {
    GlobalWorkerOptions: {},
    getDocument: ({ data }: { data: Uint8Array }) => ({
      promise: native
        .getDocument({
          data,
          standardFontDataUrl:
            process.cwd() + "/public/pdf-assets/standard_fonts/",
        })
        .promise.then((doc) => ({
          numPages: doc.numPages,
          getPage: async (n: number) => {
            const pg = await doc.getPage(n);
            return {
              getViewport: (o: any) => pg.getViewport(o),
              render: ({ canvas, viewport }: any) => {
                const bitmap = createCanvas(canvas.width, canvas.height);
                const job = pg.render({
                  canvas: bitmap as any,
                  canvasContext: bitmap.getContext("2d") as any,
                  viewport,
                });
                return {
                  promise: job.promise.then(() => {
                    canvas.dataset.renderedPage = String(n);
                    canvas.nativeBitmap = bitmap;
                    canvas.toDataURL = () => bitmap.toDataURL("image/png");
                    canvas.dataset.renderedPdfBytes = String(
                      bitmap.toBuffer("image/png").length,
                    );
                  }),
                };
              },
            };
          },
        })),
    }),
  };
});
import App from "../src/App";

afterEach(cleanup);
import { save, getProject } from "../src/io";
import { newProject, calculate, totals } from "../src/model";
test("Independent survey PDF → calibrate and verify → measure → client XLSX copy → backup and restore", async () => {
  const plan = await PDFDocument.create(),
    page = plan.addPage([600, 400]);
  page.drawText("Tenant C - Workshop Ventilation", { x: 45, y: 360, size: 17 });
  for (const [y, start, end, label] of [
    [100, 50, 250, "5 m calibration"],
    [160, 50, 130, "2 m verification"],
    [220, 70, 230, "600 x 400 mm supply duct"],
  ] as const) {
    page.drawLine({
      start: { x: start, y: 400 - y },
      end: { x: end, y: 400 - y },
      thickness: 2,
      color: rgb(0.1, 0.3, 0.2),
    });
    page.drawText(label, { x: start, y: 407 - y, size: 9 });
  }
  const bytes = await plan.save(),
    pdfFile = new File([bytes], "Tenant C workshop.pdf", {
      type: "application/pdf",
    });
  const input = new ExcelJS.Workbook(),
    s = input.addWorksheet("Schedule");
  s.addRow(["Code", "Description", "Quantity", "Unit"]);
  s.addRow(["W-01", "Main supply", null, "m²"]);
  s.getCell("F10").value = { formula: "SUM(11,18)", result: 29 };
  s.getCell("B10").value = "Owner reference 37";
  s.getCell("B10").font = { bold: true, color: { argb: "FF336699" } };
  const original = await input.xlsx.writeBuffer();
  const project = newProject("Non-demo workshop tender", "Lahore");
  await save(project);
  localStorage.setItem("dl-active", project.id);
  const downloads = new Map<string, Blob>(),
    byUrl = new Map<string, Blob>();
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: any) => {
    const url = "blob:fixture/" + byUrl.size;
    byUrl.set(url, blob);
    return url;
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (this.download) downloads.set(this.download, byUrl.get(this.href)!);
  });
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  const click = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
  const dialog = () => within(screen.getByRole("dialog"));
  const sub = (name: string) =>
    fireEvent.click(dialog().getByRole("button", { name, exact: true }));
  const pick = (x: number, y: number) => {
    const svg = app.container.querySelector(".measurement") as SVGSVGElement;
    svg.getScreenCTM = () => new DOMMatrix();
    fireEvent.pointerDown(svg, { clientX: x, clientY: y });
  };
  fireEvent.change(
    app.container.querySelector('input[accept="application/pdf,.pdf"]')!,
    { target: { files: [pdfFile] } },
  );
  await waitFor(() =>
    expect(
      Number(
        app.container
          .querySelector(".sheetpaper canvas")
          ?.getAttribute("data-rendered-pdf-bytes"),
      ),
    ).toBeGreaterThan(1000),
  );
  click("Calibrate sheet");
  sub("Calibrate sheet");
  pick(50, 100);
  pick(250, 100);
  fireEvent.change(dialog().getByLabelText("Known length"), {
    target: { value: "5" },
  });
  sub("Save calibration");
  click("Sheet calibrated");
  sub("Verify dimension");
  pick(50, 160);
  pick(130, 160);
  fireEvent.change(dialog().getByLabelText("Known length"), {
    target: { value: "2" },
  });
  sub("Save verification");
  click("Measure");
  sub("Start measuring");
  pick(70, 220);
  pick(230, 220);
  sub("Save item");
  click("BOQ");
  click("Import rates");
  fireEvent.change(dialog().getByLabelText(/Choose a rate sheet/), {
    target: {
      files: [
        new File(
          ["Code,Description,Unit,Rate\nW-01,Workshop main,m2,1250\n"],
          "workshop.csv",
        ),
      ],
    },
  });
  await waitFor(() =>
    expect(
      dialog()
        .getByRole("button", { name: "Apply rates" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  sub("Apply rates");
  click("Takeoff");
  click("Edit item");
  fireEvent.change(dialog().getByLabelText("BOQ mapping"), {
    target: { value: "W-01" },
  });
  sub("Save item");
  await waitFor(async () =>
    expect(totals((await getProject(project.id))!.revs[0])).toBe(10000),
  );
  click("BOQ");
  click("Populate client BOQ");
  fireEvent.change(dialog().getByLabelText(/Choose client workbook/), {
    target: {
      files: [new File([original as ArrayBuffer], "Tenant C bill.xlsx")],
    },
  });
  await waitFor(() => expect(dialog().getByText("Schedule!C2")).toBeTruthy());
  sub("Confirm & export copy");
  await waitFor(() =>
    expect(downloads.has("Client-BOQ-populated.xlsx")).toBe(true),
  );
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(
    await downloads.get("Client-BOQ-populated.xlsx")!.arrayBuffer(),
  );
  const sheet = reopened.getWorksheet("Schedule")!;
  expect(sheet.getCell("C2").value).toBe(8);
  expect(sheet.getCell("F10").formula).toBe("SUM(11,18)");
  expect(sheet.getCell("B10").value).toBe("Owner reference 37");
  expect(sheet.getCell("B10").font).toEqual(s.getCell("B10").font);
  const untouched = new ExcelJS.Workbook();
  await untouched.xlsx.load(original);
  expect(untouched.worksheets[0].getCell("C2").value).toBeNull();
  click("Projects");
  click("Back up project");
  const backup = downloads.get(project.name + ".ductledger")!;
  expect(backup).toBeTruthy();
  fireEvent.change(
    app.container.querySelector('input[accept=".json,.ductledger"]')!,
    { target: { files: [new File([backup], "workshop.ductledger")] } },
  );
  await waitFor(() =>
    expect(localStorage.getItem("dl-active")).not.toBe(project.id),
  );
  const restoredId = localStorage.getItem("dl-active")!;
  await waitFor(async () => expect(await getProject(restoredId)).toBeTruthy());
  const restored = (await getProject(restoredId))!,
    saved = (await getProject(project.id))!;
  expect(restored.revs).toEqual(saved.revs);
  expect(restored.documents).toEqual(saved.documents);
  const revision = restored.revs[0],
    item = revision.items[0],
    drawing = revision.sheets.find((s) => s.id === item.sheet)!;
  expect(drawing.page).toBe(1);
  expect(drawing.verified).toBe(true);
  expect(drawing.scale).toBe(0.025);
  expect(calculate(item, revision)).toMatchObject({
    length: 4,
    quantity: 8,
    amount: 10000,
  });
  expect(restored.documents[drawing.doc]).toBe(
    Buffer.from(bytes).toString("base64"),
  );
  expect(
    app.container.querySelector(".selected-mark")?.getAttribute("data-item"),
  ).toBe(item.id);
  cleanup();
  vi.restoreAllMocks();
});

import {
  makeSampleItems,
  makeSampleRates,
  makeSampleSheets,
} from "../src/sampleLayout";
import { estimateBook } from "../src/books";
import { printReportHtml } from "../src/Reports";
import { writeFileSync } from "node:fs";
function enableNativeDrawingCrops() {
  // Crop and mark the DOM canvas with a native 2D backing store.
  const nativeFor = (el: any) =>
    el.nativeBitmap ?? (el.nativeBitmap = createCanvas(el.width, el.height));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const ctx = nativeFor(this).getContext("2d");
      return new Proxy(ctx, {
        set(target, key, value) {
          return Reflect.set(target, key, value, target);
        },
        get(target, key) {
          if (key === "drawImage")
            return (source: any, ...args: any[]) =>
              target.drawImage(nativeFor(source), ...args);
          const val = target[key];
          return typeof val === "function" ? val.bind(target) : val;
        },
      });
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
    function (this: HTMLCanvasElement) {
      return nativeFor(this).toDataURL("image/png");
    },
  );
}
test("Same draft breakdown in numeric XLSX and printable report with actual marked PDF excerpt", async () => {
  const p = newProject("Disposable Crescent Business Centre", "Lahore");
  p.revs = (["A", "B"] as const).map((id) => ({
    id,
    date: "2026-10-19",
    frozen: id === "A",
    sheets: makeSampleSheets(id),
    items: makeSampleItems(id),
    rates: makeSampleRates(id),
    queries: [],
    approved: [],
  }));
  for (const id of ["A", "B"])
    p.documents[id] = readFileSync(
      "public/samples/ductledger-rev-" + id.toLowerCase() + ".pdf",
    ).toString("base64");
  const [a, b] = p.revs;
  enableNativeDrawingCrops();
  for (const status of ["Pending", "Confirmed"]) {
    b.approved = status === "Pending" ? [] : ["SA-001"];
    const confirmed = b.approved.length ? 14800 : 0,
      pending = 14800 - confirmed;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await estimateBook(p, b, a, true));
    const summary = new Map<string, unknown>();
    wb.getWorksheet("Variation summary")!.eachRow((row) =>
      summary.set(row.getCell(1).text, row.getCell(2).value),
    );
    expect(summary.get("Confirmed priced subtotal")).toBe(confirmed);
    expect(summary.get("Pending priced subtotal")).toBe(pending);
    expect(summary.get("Total proposed variation")).toBe(14800);
    expect(wb.worksheets.every((s) => s.getCell("B1").text === "DRAFT")).toBe(
      true,
    );
    expect(wb.getWorksheet("Detailed changes")!.getCell("P3").text).toBe(
      status === "Pending" ? "Pending" : "Confirmed",
    );
    const html = await printReportHtml(p, b, a, true);
    const doc = new DOMParser().parseFromString(html, "text/html"),
      text = doc.body.textContent!;
    expect(text).toContain("DRAFT");
    expect(text).toContain(
      "Confirmed priced subtotal · PKR " + confirmed.toLocaleString("en-US"),
    );
    expect(text).toContain(
      "Pending priced subtotal · PKR " + pending.toLocaleString("en-US"),
    );
    expect(text).toContain("Total proposed variation: PKR 14,800");
    expect(text).toContain("SA-001 · Resized · " + status);
    expect(doc.querySelector("img")!.src.length).toBeGreaterThan(1000);
    if (process.env.DUCTLEDGER_QA_OUTPUT)
      writeFileSync(
        process.env.DUCTLEDGER_QA_OUTPUT + "/draft-" + status + ".html",
        html,
      );
    if (status === "Pending")
      await expect(printReportHtml(p, b, a, false)).rejects.toThrow(
        /awaiting confirmation/,
      );
  }
  vi.restoreAllMocks();
});
test("Evidence on a physically reordered revised PDF renders the paired old and new page", async () => {
  const p = newProject("Disposable Crescent with reordered PDF", "Lahore");
  p.documents.A = readFileSync("public/samples/ductledger-rev-a.pdf").toString(
    "base64",
  );
  const source = await PDFDocument.load(
      readFileSync("public/samples/ductledger-rev-b.pdf"),
    ),
    reordered = await PDFDocument.create();
  for (const pg of await reordered.copyPages(source, [1, 0]))
    reordered.addPage(pg);
  p.documents.B = Buffer.from(await reordered.save()).toString("base64");
  p.revs = (["A", "B"] as const).map((id) => ({
    id,
    date: "2026-10-19",
    frozen: id === "A",
    sheets:
      id === "A"
        ? makeSampleSheets(id)
        : makeSampleSheets(id)
            .reverse()
            .map((s, i) => ({ ...s, page: i + 1 })),
    items: makeSampleItems(id),
    rates: makeSampleRates(id),
    queries: [],
    approved: [],
  }));
  await save(p);
  localStorage.setItem("dl-active", p.id);
  localStorage.setItem("dl-rev", "B");
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  fireEvent.click(
    screen.getByRole("button", { name: "Revisions", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Comparison sheet"), {
    target: { value: "*" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review evidence" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled"),
    ).toBe(false),
    { timeout: 6000 },
  );
  for (const [rev, n] of [
    ["A", 1],
    ["B", 2],
  ]) {
    const svg = screen.getByLabelText("Revision " + rev + " drawing M-101");
    expect(svg.querySelector("canvas")!.dataset.renderedPage).toBe(String(n));
    expect(svg.querySelector('[data-item="SA-001"]')).toBeTruthy();
    expect(svg.querySelector("canvas")!.dataset.renderedPdfBytes).toBeTruthy();
  }
  cleanup();
});

import { sampleTender } from "../src/sample";
async function openSampleCopy() {
  const fetchSample = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async (url) =>
        new Response(readFileSync("public" + url), {
          headers: { "Content-Type": "application/pdf" },
        }),
    );
  const project = await sampleTender();
  fetchSample.mockRestore();
  project.name += " (disposable QA)";
  await save(project);
  localStorage.setItem("dl-active", project.id);
  localStorage.setItem("dl-rev", "B");
  localStorage.setItem("dl-sheet", "M-101");
  localStorage.setItem("dl-item", "SA-001");
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  return { project, app };
}
const press = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
function editField(label: string, value: string) {
  press("Edit item");
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  press("Save item");
}
function editMainRate(value: string) {
  press("BOQ");
  press("Import rates");
  press("Edit current rates");
  const code = screen.getByDisplayValue("GI-MAIN");
  const rate = within(code.closest("tr")!).getByLabelText("Rate in PKR");
  fireEvent.change(rate, { target: { value } });
  press("Apply rates");
}
function overview() {
  return within(screen.getByRole("region", { name: "Variation summary" }));
}
function assertOverview(
  status: string,
  headline: string,
  subtotal: string,
  pending: string,
  confirmed: string,
) {
  const report = overview();
  expect(
    report.getByRole("heading", {
      name: "Total proposed variation: " + headline,
    }),
  ).toBeTruthy();
  expect(report.getByText(status, { selector: "strong" })).toBeTruthy();
  for (const [label, value] of [
    ["Priced changes subtotal", subtotal],
    ["Pending priced subtotal", pending],
    ["Confirmed priced subtotal", confirmed],
  ]) {
    expect(
      report.getByText(label).parentElement!.querySelector("strong")!
        .textContent,
    ).toBe(value);
  }
}
function captureWorkbooks() {
  let file: Blob | undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob: Blob) => {
    file = blob;
    return "blob:qa-export";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  return async function downloadWorkbook() {
    file = undefined;
    press(/Excel variation workbook/);
    await waitFor(() => expect(file).toBeDefined());
    const bytes = await file!.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    return { bytes, workbook };
  };
}
test("Sample A/D: unmapped, exported, reopened, repaired, confirmed and reloaded", async () => {
  const { project, app } = await openSampleCopy();
  enableNativeDrawingCrops();
  // Supply the native print boundary missing from the DOM test environment.
  const settings = (window as any).happyDOM.settings;
  const priorFrameSetting = settings.enableIframePageLoading;
  settings.enableIframePageLoading = true;
  const print = vi.fn();
  const frameDoc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentDocument",
  )!.get!;
  vi.spyOn(
    HTMLIFrameElement.prototype,
    "contentDocument",
    "get",
  ).mockImplementation(function (this: HTMLIFrameElement) {
    const doc = frameDoc.call(this);
    if (doc) doc.defaultView.HTMLImageElement.prototype.decode = async () => {};
    return doc;
  });
  const frameWindow = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow",
  )!.get!;
  vi.spyOn(
    HTMLIFrameElement.prototype,
    "contentWindow",
    "get",
  ).mockImplementation(function (this: HTMLIFrameElement) {
    const child = frameWindow.call(this);
    if (child) child.print = print;
    return child;
  });
  const downloadWorkbook = captureWorkbooks();
  async function exportAndInspect(complete: boolean) {
    const status = complete ? "Complete" : "Incomplete";
    const headline = complete ? "PKR 14,800" : "Incomplete";
    const subtotal = complete ? "PKR 14,800" : "No priced changes yet";
    press("Export report");
    const preview = within(screen.getByRole("dialog"));
    expect(
      preview.getByRole("heading", {
        name: "Total proposed variation: " + headline,
      }),
    ).toBeTruthy();
    expect(
      preview
        .getByText("Priced changes subtotal")
        .parentElement!.querySelector("strong")!.textContent,
    ).toBe(subtotal);
    expect(
      preview.getByRole("option", { name: "Final" }).hasAttribute("disabled"),
    ).toBe(!complete);
    const { bytes, workbook } = await downloadWorkbook();
    const summary = new Map<string, unknown>();
    workbook
      .getWorksheet("Variation summary")!
      .eachRow((row) => summary.set(row.getCell(1).text, row.getCell(2).value));
    expect(summary.get("Pricing status")).toBe(status);
    expect(summary.get("Total proposed variation")).toBe(
      complete ? 14800 : null,
    );
    expect(summary.get("Priced changes subtotal")).toBe(complete ? 14800 : 0);
    expect(summary.get("Pending priced subtotal")).toBe(0);
    expect(summary.get("Confirmed priced subtotal")).toBe(complete ? 14800 : 0);
    if (!complete) {
      expect(summary.get("Priced changes")).toBe("No priced changes yet");
      const issue = workbook.getWorksheet("Outstanding queries")!.getRow(3);
      expect([issue.getCell(1).text, issue.getCell(2).text]).toEqual([
        "SA-001",
        "M-101",
      ]);
      expect(issue.getCell(3).text).toContain("Rate missing");
    }
    press("Export report");
    press(/Printable client PDF/);
    await waitFor(() =>
      expect(
        document.querySelector("iframe")?.contentDocument?.body.textContent,
      ).toContain("Total proposed variation: " + headline),
    );
    const frame = document.querySelector("iframe")!;
    const doc = frame.contentDocument!;
    expect(doc.body.textContent).toContain("Pricing status: " + status);
    expect(doc.body.textContent).toContain(
      "Priced changes subtotal: " + subtotal,
    );
    if (!complete) {
      expect(doc.body.textContent).toContain("1 changed item needs a rate.");
      expect(doc.body.textContent).toMatch(/SA-001 · M-101 · .*Rate missing/);
    }
    expect(doc.querySelector("img")!.src.length).toBeGreaterThan(1000);
    if (process.env.DUCTLEDGER_QA_OUTPUT) {
      const path = process.env.DUCTLEDGER_QA_OUTPUT + "/" + status;
      writeFileSync(path + ".html", doc.documentElement.outerHTML);
      writeFileSync(path + ".xlsx", Buffer.from(bytes));
    }
    await waitFor(() => expect(print).toHaveBeenCalled());
    print.mockClear();
    frame.remove();
  }
  try {
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Select SA-001" }),
    );
    editField("BOQ mapping", "");
    press("Reports");
    assertOverview(
      "Incomplete",
      "Incomplete",
      "No priced changes yet",
      "PKR 0",
      "PKR 0",
    );
    expect(overview().getByText("1 changed item needs a rate.")).toBeTruthy();
    await exportAndInspect(false);
    press("SA-001 · M-101");
    expect(
      app.container.querySelector(".selected-mark")?.getAttribute("data-item"),
    ).toBe("SA-001");
    editField("BOQ mapping", "GI-MAIN");
    press("Reports");
    assertOverview(
      "Complete",
      "PKR 14,800",
      "PKR 14,800",
      "PKR 14,800",
      "PKR 0",
    );
    expect(screen.queryByText("1 changed item needs a rate.")).toBeNull();
    press("Review evidence");
    const confirm = await screen.findByRole("button", {
      name: "Confirm",
      exact: true,
    });
    await waitFor(() => expect(confirm.hasAttribute("disabled")).toBe(false));
    fireEvent.click(confirm);
    await waitFor(async () =>
      expect((await getProject(project.id))!.revs[1].approved).toEqual([
        "SA-001",
      ]),
    );
    cleanup();
    render(<App />);
    await screen.findByRole("heading", { name: "Drawing takeoff" });
    press("Reports");
    assertOverview(
      "Complete",
      "PKR 14,800",
      "PKR 14,800",
      "PKR 0",
      "PKR 14,800",
    );
    await exportAndInspect(true);
    expect((await getProject(project.id))!.revs[0]).toEqual(project.revs[0]);
  } finally {
    settings.enableIframePageLoading = priorFrameSetting;
    cleanup();
    vi.restoreAllMocks();
  }
});

test("Sample B/C: mixed pricing, credit, cancelling changes and an explicit zero rate", async () => {
  const { project } = await openSampleCopy();
  const downloadWorkbook = captureWorkbooks();
  async function checkExport(total: number | null, priced: number) {
    press("Export report");
    const preview = within(screen.getByRole("dialog"));
    expect(
      preview
        .getByText("Priced changes subtotal")
        .parentElement!.querySelector("strong")!.textContent,
    ).toBe("PKR " + priced.toLocaleString("en-US"));
    const { workbook } = await downloadWorkbook();
    const cells = new Map<string, unknown>();
    workbook
      .getWorksheet("Variation summary")!
      .eachRow((row) => cells.set(row.getCell(1).text, row.getCell(2).value));
    expect(cells.get("Total proposed variation")).toBe(total);
    expect(cells.get("Pricing status")).toBe(
      total === null ? "Incomplete" : "Complete",
    );
    expect(cells.get("Priced changes subtotal")).toBe(priced);
  }
  try {
    editMainRate("2500");
    press("Takeoff");
    press("Next sheet");
    editField("BOQ mapping", "");
    press("Reports");
    assertOverview(
      "Incomplete",
      "Incomplete",
      "PKR 10,000",
      "PKR 10,000",
      "PKR 0",
    );
    expect(overview().getByText("1 changed item needs a rate.")).toBeTruthy();
    expect(
      overview().getByRole("button", { name: "SA-101 · M-102" }),
    ).toBeTruthy();
    await checkExport(null, 10000);
    editMainRate("1250");
    press("Reports");
    assertOverview(
      "Incomplete",
      "Incomplete",
      "PKR -20,000",
      "PKR -20,000",
      "PKR 0",
    );

    editMainRate("2500");
    press("Import rates");
    fireEvent.change(screen.getByLabelText(/Choose a rate sheet/), {
      target: {
        files: [
          new File(
            [
              "Code,Description,Unit,Rate\nQA-BRANCH,Branch tender rate,m2,1950\n",
            ],
            "branch.csv",
          ),
        ],
      },
    });
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Apply rates" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    press("Apply rates");
    press("Takeoff");
    editField("BOQ mapping", "QA-BRANCH");
    press("Previous sheet");
    editField("Width (mm)", "700");
    press("Reports");
    assertOverview("Complete", "PKR 0", "PKR 0", "PKR 0", "PKR 0");
    expect(overview().getByText(/Priced additions/).textContent).toMatch(
      /PKR 5,000.*PKR -5,000/,
    );
    await checkExport(0, 0);
    editMainRate("0");
    press("Reports");
    assertOverview(
      "Complete",
      "PKR -55,000",
      "PKR -55,000",
      "PKR -55,000",
      "PKR 0",
    );
    expect((await getProject(project.id))!.revs[0]).toEqual(project.revs[0]);
  } finally {
    cleanup();
    vi.restoreAllMocks();
  }
});
