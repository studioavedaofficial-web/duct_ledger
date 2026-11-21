// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import React from "react";
import { beforeAll, test, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import {
  makeSampleItems,
  makeSampleRates,
  makeSampleSheets,
} from "../src/sampleLayout";
import { newProject, totals } from "../src/model";
// The DOM test exercises the real application and storage layer. PDF rasterization
// is tested separately with the actual two-page sample files and PDF.js.
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 2,
      getPage: async () => ({
        getViewport: ({ scale }: { scale: number }) => ({
          width: 1000 * scale,
          height: 650 * scale,
        }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));
import App from "../src/App";
import { getProject, save, validateProject } from "../src/io";
const p = newProject("UI verification project", "Lahore");
p.revs = (["A", "B"] as const).map((id) => ({
  id,
  date: "2026-11-21",
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
beforeAll(async () => {
  await save(p);
  localStorage.setItem("dl-active", p.id);
});
test("B/F · report link highlights its duct, zoom and rotation preserve length, remount reloads IndexedDB, validated backup restores into fresh storage", async () => {
  const first = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  fireEvent.click(screen.getByRole("button", { name: "Reports", exact: true }));
  fireEvent.click(
    await screen.findByRole("button", { name: "SA-001", exact: true }),
  );
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  expect(
    first.container.querySelector(".selected-mark")?.getAttribute("data-item"),
  ).toBe("SA-001");
  fireEvent.click(screen.getByRole("button", { name: "Zoom in", exact: true }));
  expect(screen.getByText("125%")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Rotate view", exact: true }),
  );
  expect(screen.getByText("10 m", { exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next sheet" }));
  expect(
    first.container.querySelector(".selected-mark")?.getAttribute("data-item"),
  ).toBe("SA-101");
  await waitFor(() => expect(localStorage.getItem("dl-sheet")).toBe("M-102"));
  cleanup();
  const reloaded = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  expect(
    reloaded.container
      .querySelector(".selected-mark")
      ?.getAttribute("data-item"),
  ).toBe("SA-101");
  cleanup();
  const backup = JSON.stringify(await getProject(p.id)),
    restored = await validateProject(JSON.parse(backup));
  const original = globalThis.indexedDB;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: new IDBFactory(),
  });
  try {
    const db = await openDB("restored-workspace", 1, {
      upgrade(db) {
        db.createObjectStore("projects", { keyPath: "id" });
      },
    });
    expect(await db.get("projects", p.id)).toBeUndefined();
    await db.put("projects", restored);
    const roundtrip = await db.get("projects", p.id);
    expect(totals(roundtrip.revs[1])).toBe(totals(p.revs[1]));
    expect(roundtrip.documents).toEqual(p.documents);
    db.close();
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: original,
    });
  }
  const bad = JSON.parse(backup);
  bad.revs[1].items[0].sheet = "absent";
  await expect(validateProject(bad)).rejects.toThrow("Invalid backup");
  expect((await getProject(p.id))?.revs[1].items[0].sheet).toBe("M-101");
});

test("Rate editing updates only the working revision and confirmed changes unlock final export", async () => {
  localStorage.setItem("dl-active", p.id);
  localStorage.setItem("dl-rev", "B");
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  fireEvent.click(screen.getByRole("button", { name: "BOQ", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Import rates", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Edit current rates" }));
  const rate = screen.getAllByLabelText("Rate in PKR")[0];
  fireEvent.change(rate, { target: { value: "2800" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply rates" }));
  await waitFor(async () =>
    expect((await getProject(p.id))!.revs[1].rates[0].rate).toBe(2800),
  );
  expect((await getProject(p.id))!.revs[0].rates[0].rate).toBe(2500);
  fireEvent.click(screen.getByRole("button", { name: "Reports", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Export report", exact: true }),
  );
  expect(
    screen.getByRole("option", { name: "Final" }).hasAttribute("disabled"),
  ).toBe(false);
  cleanup();
});
test("Complete tender from user PDF and Excel files through approved baseline and revised final report", async () => {
  localStorage.setItem("dl-active", p.id);
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  const click = (name: string) =>
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
  const dialog = () => within(screen.getByRole("dialog"));
  const submit = (name: string) =>
    fireEvent.click(dialog().getByRole("button", { name, exact: true }));
  const file = (name: string) =>
    new File([readFileSync("public/samples/" + name)], name);
  click("Projects");
  click("Create project");
  fireEvent.change(dialog().getByLabelText("Project name"), {
    target: { value: "Acceptance commercial tender" },
  });
  submit("Create project");
  await screen.findByText("Import your first drawing");
  fireEvent.change(
    app.container.querySelector('input[accept="application/pdf,.pdf"]')!,
    { target: { files: [file("ductledger-rev-a.pdf")] } },
  );
  await waitFor(() =>
    expect(app.container.querySelector(".measurement")).toBeTruthy(),
  );
  function pick(x: number, y: number) {
    const svg = app.container.querySelector(".measurement") as SVGSVGElement;
    svg.getScreenCTM = () => new DOMMatrix();
    fireEvent.pointerDown(svg, { clientX: x, clientY: y });
  }
  function calibrate() {
    click("Calibrate sheet");
    submit("Calibrate sheet");
    pick(270, 292);
    pick(670, 292);
    fireEvent.change(dialog().getByLabelText("Known length"), {
      target: { value: "10" },
    });
    submit("Save calibration");
  }
  calibrate();
  click("Next sheet");
  calibrate();
  click("Previous sheet");
  click("Measure");
  submit("Start measuring");
  pick(270, 292);
  pick(670, 292);
  submit("Save item");
  click("BOQ");
  click("Import rates");
  fireEvent.change(dialog().getByLabelText(/Choose a rate sheet/), {
    target: { files: [file("contractor-rates.xlsx")] },
  });
  await waitFor(() =>
    expect(
      dialog()
        .getByRole("button", { name: "Apply rates" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  submit("Apply rates");
  click("Takeoff");
  click("Edit item");
  fireEvent.change(dialog().getByLabelText("BOQ mapping"), {
    target: { value: "GI-MAIN" },
  });
  submit("Save item");
  expect(screen.getByText("50,000", { exact: false })).toBeTruthy();
  click("Revisions");
  click("Approve & freeze");
  submit("Approve & freeze");
  click("Create revision");
  fireEvent.change(dialog().getByLabelText("Choose revised PDF"), {
    target: { files: [file("ductledger-rev-b.pdf")] },
  });
  await screen.findByRole("heading", { name: "Pair revised sheets" });
  for (const [n, c] of dialog().getAllByRole("combobox").entries()) {
    const opt = c.querySelectorAll("option")[n + 1];
    fireEvent.change(c, { target: { value: opt.value } });
  }
  submit("Create revision");
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  calibrate();
  click("Next sheet");
  calibrate();
  click("Previous sheet");
  click("Edit item");
  fireEvent.change(dialog().getByLabelText("Width (mm)"), {
    target: { value: "800" },
  });
  submit("Save item");
  click("Reports");
  click("Confirm");
  click("Export report");
  expect(
    dialog().getByRole("option", { name: "Final" }).hasAttribute("disabled"),
  ).toBe(false);
  await waitFor(async () =>
    expect(
      totals((await getProject(localStorage.getItem("dl-active")!))!.revs[1]),
    ).toBe(60000),
  );
  const stored = await getProject(localStorage.getItem("dl-active")!);
  expect(stored!.revs[0].frozen).toBe(true);
  expect(totals(stored!.revs[0])).toBe(50000);
  expect(totals(stored!.revs[1])).toBe(60000);
  cleanup();
});
