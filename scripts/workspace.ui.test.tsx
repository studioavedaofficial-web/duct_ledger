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
async function reviewAndConfirm() {
  fireEvent.click(
    screen.getByRole("button", { name: "Review evidence", exact: true }),
  );
  const btn = await screen.findByRole("button", {
    name: "Confirm",
    exact: true,
  });
  await waitFor(() => expect(btn.hasAttribute("disabled")).toBe(false));
  fireEvent.click(btn);
}
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
  await reviewAndConfirm();
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
  await reviewAndConfirm();
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

async function openDisposable(edit?: (proj: typeof p) => void) {
  const copy = structuredClone(p);
  copy.id = crypto.randomUUID();
  copy.name = "Disposable Crescent Business Centre";
  edit?.(copy);
  await save(copy);
  localStorage.setItem("dl-active", copy.id);
  localStorage.setItem("dl-rev", "B");
  localStorage.setItem("dl-item", "SA-001");
  localStorage.setItem("dl-sheet", "M-101");
  const app = render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  return { copy, app };
}
const clickButton = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
function checkMetric(label: string, amount: string) {
  expect(screen.getByText(label).parentElement!.textContent).toContain(
    "PKR " + amount,
  );
}
test("Sheet filtering, two matching highlights, one confirmation, refresh and edit invalidation", async () => {
  const { copy, app } = await openDisposable(),
    frozen = JSON.stringify(copy.revs[0]);
  clickButton("Reports");
  checkMetric("Confirmed net variation", "0");
  checkMetric("Pending net variation", "14,800");
  checkMetric("Total proposed variation", "14,800");
  clickButton("Revisions");
  const choose = (v: string) =>
    fireEvent.change(screen.getByLabelText("Comparison sheet"), {
      target: { value: v },
    });
  choose("M-102");
  expect(screen.getByText("No changes on M-102 · First Floor.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "SA-001" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  choose("*");
  expect(screen.getByRole("row", { name: /SA-001/ }).textContent).toContain(
    "M-101 · Ground Floor",
  );
  clickButton("Review evidence");
  expect(
    (screen.getByLabelText("Comparison sheet") as HTMLSelectElement).value,
  ).toBe("M-101");
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  for (const id of ["A", "B"])
    expect(
      screen
        .getByLabelText("Revision " + id + " drawing M-101")
        .querySelector('[data-item="SA-001"]'),
    ).toBeTruthy();
  clickButton("Confirm");
  clickButton("Reports");
  checkMetric("Confirmed net variation", "14,800");
  checkMetric("Pending net variation", "0");
  checkMetric("Total proposed variation", "14,800");
  await waitFor(async () =>
    expect((await getProject(copy.id))!.revs[1].approved).toEqual(["SA-001"]),
  );
  cleanup();
  render(<App />);
  await screen.findByRole("heading", { name: "Drawing takeoff" });
  clickButton("Reports");
  checkMetric("Confirmed net variation", "14,800");
  expect(screen.getAllByRole("row", { name: /SA-001/ })).toHaveLength(1);
  clickButton("Takeoff");
  clickButton("Edit item");
  fireEvent.change(screen.getByLabelText("Width (mm)"), {
    target: { value: "850" },
  });
  clickButton("Save item");
  clickButton("Reports");
  checkMetric("Confirmed net variation", "0");
  checkMetric("Pending net variation", "17,500");
  await waitFor(async () =>
    expect((await getProject(copy.id))!.revs[1].approved).toEqual([]),
  );
  expect(JSON.stringify((await getProject(copy.id))!.revs[0])).toBe(frozen);
  cleanup();
});
test("Invalid mapping cannot be saved; a loaded legacy mismatch can be repaired", async () => {
  const { copy } = await openDisposable((pr) => {
    pr.revs[1].items[0].code = "FT-EL";
    pr.revs[1].rates.find((v) => v.code === "FT-EL")!.unit = "pcs" as any;
  });
  await validateProject(structuredClone(copy));
  expect(screen.getByText(/Needs remapping/)).toBeTruthy();
  clickButton("Export report");
  expect(
    screen.getByRole("option", { name: "Final" }).hasAttribute("disabled"),
  ).toBe(true);
  clickButton("Close dialog");
  clickButton("Edit item");
  const form = within(screen.getByRole("dialog")),
    mapping = form.getByLabelText("BOQ mapping") as HTMLSelectElement;
  expect(mapping.value).toBe("FT-EL");
  expect(mapping.selectedOptions[0].disabled).toBe(true);
  expect(form.getByText(/Needs remapping.*m².*pcs/)).toBeTruthy();
  expect(
    form.getByRole("button", { name: "Save item" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(mapping, { target: { value: "GI-MAIN" } });
  expect(
    form.getByRole("button", { name: "Save item" }).hasAttribute("disabled"),
  ).toBe(false);
  fireEvent.change(mapping, { target: { value: "FT-EL" } });
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.change(mapping, { target: { value: "GI-MAIN" } });
  clickButton("Save item");
  await waitFor(async () =>
    expect(totals((await getProject(copy.id))!.revs[1])).toBe(264771.26),
  );
  cleanup();
});
test("Added and removed lines show the available revision, including an unpaired sheet", async () => {
  const { copy } = await openDisposable((pr) => {
    const b = pr.revs[1],
      sheet = b.sheets[1];
    b.items = b.items.filter((i) => i.sheet !== sheet.id);
    b.sheets.pop();
    b.items.push({ ...structuredClone(b.items[0]), id: "SA-NEW" });
  });
  clickButton("Revisions");
  fireEvent.change(screen.getByLabelText("Comparison sheet"), {
    target: { value: "M-102" },
  });
  clickButton("SA-101");
  expect(
    screen
      .getByLabelText("Revision A drawing M-102")
      .querySelector('[data-item="SA-101"]'),
  ).toBeTruthy();
  expect(screen.getByText("Revision B · No paired sheet")).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled"),
    ).toBe(false),
  );
  clickButton("Confirm");
  fireEvent.change(screen.getByLabelText("Comparison sheet"), {
    target: { value: "*" },
  });
  clickButton("SA-NEW");
  expect(screen.getByText("Revised line in Revision B")).toBeTruthy();
  expect(
    screen
      .getByLabelText("Revision B drawing M-101")
      .querySelector('[data-item="SA-NEW"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByLabelText("Revision A drawing M-101")
      .querySelector("[data-item]"),
  ).toBeNull();
  cleanup();
});
test("BOQ calculation details expose all four priced quantities and amounts", async () => {
  await openDisposable();
  clickButton("BOQ");
  const row = screen.getByRole("row", { name: /GI-RA/ });
  expect(row.textContent).toContain("38.96");
  expect(row.textContent).toContain("83,753.26");
  fireEvent.click(
    within(row).getByRole("button", { name: "Calculation details" }),
  );
  expect(screen.getAllByText("2.1875 m²")).toHaveLength(2);
  expect(screen.getAllByText("4,703.13")).toHaveLength(2);
  expect(
    screen.getByText(
      /37,173.5 \+ 4,703.13 \+ 37,173.5 \+ 4,703.13 = 83,753.26/,
    ),
  ).toBeTruthy();
  cleanup();
});
test("Confirmation waits for the matching PDF render, and a failed render cannot authorize review", async () => {
  const { copy } = await openDisposable();
  const io = await import("../src/io");
  const original = io.drawPage;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const draw = vi.spyOn(io, "drawPage").mockImplementation(async (...args) => {
    await gate;
    return original(...args);
  });
  clickButton("Revisions");
  clickButton("SA-001");
  expect(
    screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Comparison sheet"), {
    target: { value: "M-102" },
  });
  release();
  expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  draw.mockRejectedValue(new Error("Fixture page unavailable"));
  fireEvent.change(screen.getByLabelText("Comparison sheet"), {
    target: { value: "*" },
  });
  clickButton("Review evidence");
  await screen.findByText(/Drawing evidence unavailable/);
  expect(
    screen.getByRole("button", { name: "Confirm" }).hasAttribute("disabled"),
  ).toBe(true);
  expect((await getProject(copy.id))!.revs[1].approved).toEqual([]);
  draw.mockRestore();
  cleanup();
});
test("Rate import rejects length or count rates for the mapped sheet area; blank and zero differ", async () => {
  await openDisposable();
  clickButton("BOQ");
  clickButton("Import rates");
  const d = within(screen.getByRole("dialog"));
  const input = d.getByLabelText(/Choose a rate sheet/);
  async function load(unit: string, rate: string) {
    fireEvent.change(input, {
      target: {
        files: [
          new File(
            [
              "Code,Description,Unit,Rate\nGI-MAIN,Main duct," +
                unit +
                "," +
                rate +
                "\n",
            ],
            unit + "-" + rate + ".csv",
          ),
        ],
      },
    });
    await d.findByText(unit + "-" + rate + ".csv");
  }
  for (const unit of ["m", "pcs"]) {
    await load(unit, "2000");
    expect(
      d.getByRole("button", { name: "Apply rates" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(d.getByText(/Needs remapping/)).toBeTruthy();
  }
  await load("m2", "");
  expect(
    d.getByRole("button", { name: "Apply rates" }).hasAttribute("disabled"),
  ).toBe(true);
  await load("m2", "0");
  expect(
    d.getByRole("button", { name: "Apply rates" }).hasAttribute("disabled"),
  ).toBe(false);
  cleanup();
});
test("Mixed BOQ rates and partial priced subtotal are visible on screen", async () => {
  const { copy } = await openDisposable((pr) => {
    const b = pr.revs[1],
      it = b.items.find((i) => i.id === "RA-002")!;
    it.groupCode = "GI-RA";
    it.code = "ALT";
    b.rates.push({
      code: "ALT",
      description: "Alternative material",
      unit: "m²",
      rate: 2600,
    });
    b.items.find((i) => i.id === "RA-102")!.review = true;
  });
  clickButton("BOQ");
  const row = screen.getByRole("row", { name: /GI-RA/ });
  expect(row.textContent).toContain("Mixed rates");
  expect(row.textContent).toContain("1 excluded");
  expect(screen.getByText(/1 unresolved item\(s\) excluded/)).toBeTruthy();
  fireEvent.click(
    within(row).getByRole("button", { name: "Calculation details" }),
  );
  expect(screen.getByRole("row", { name: /RA-002/ }).textContent).toContain(
    "2600",
  );
  expect(screen.getByRole("row", { name: /RA-102/ }).textContent).toContain(
    "Measurement requires review",
  );
  cleanup();
});
