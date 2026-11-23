// @vitest-environment happy-dom
import React from "react";
import { test, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { DrawingRate } from "../src/DrawingRate";
import { ItemForm } from "../src/Inspector";
import {
  makeSampleItems,
  makeSampleSheets,
  makeSampleRates,
} from "../src/sampleLayout";
import {
  calculate,
  changes,
  presetSettings,
  type Rev,
  type Preset,
} from "../src/model";
afterEach(cleanup);
const fixture = (): Rev => ({
  id: "B",
  date: "2026-11-23",
  frozen: false,
  approved: [],
  queries: [],
  sheets: makeSampleSheets("B"),
  items: makeSampleItems("B"),
  rates: makeSampleRates("B"),
});
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
test("Inspector rate transaction previews shared changes, accepts zero and never mutates on cancel", () => {
  const r = fixture();
  const i = r.items[0];
  const other = { ...i, id: "SA-QA", sheet: r.sheets[1].id };
  r.items.push(other);
  const save = vi.fn(),
    close = vi.fn();
  const prior = structuredClone(r);
  render(<DrawingRate item={i} rev={r} mode="add" save={save} close={close} />);
  change("Unit price (PKR)", "0");
  expect(screen.getByText(/SA-QA · M-102/).textContent).toContain(
    "PKR 64,800 → PKR 0",
  );
  button("Cancel");
  expect(save).not.toHaveBeenCalled();
  expect(r).toEqual(prior);
  button("Update shared rate & apply");
  const [rate, mapped] = save.mock.calls[0];
  expect(rate.rate).toBe(0);
  expect(calculate(mapped, { ...r, rates: [rate] }).amount).toBe(0);
  expect(r).toEqual(prior);
});
test("Presets store only settings, charge labour on net quantity, and keep old approvals immutable", () => {
  const r = fixture(),
    baseline = structuredClone(r),
    i = r.items[0];
  baseline.frozen = true;
  baseline.approved = [i.id];
  const frozen = structuredClone(baseline);
  const saved = vi.fn(),
    submitted = vi.fn(),
    close = vi.fn();
  const preset: Preset = {
    name: "Heavy supply",
    settings: { ...presetSettings(i, r), waste: 10, labourRate: 125 },
  };
  render(
    <ItemForm
      item={i}
      r={r}
      presets={[preset]}
      savePreset={saved}
      submit={submitted}
      close={close}
      remove={close}
      redraw={close}
    />,
  );
  change("Apply preset", preset.name);
  change("Preset name", "Modified supply");
  button("Save preset");
  expect(saved.mock.calls[0][0].settings).not.toHaveProperty("pts");
  expect(saved.mock.calls[0][0].settings).not.toHaveProperty("id");
  button("Save item");
  const applied = submitted.mock.calls[0][0];
  const q = calculate(applied, r);
  expect(q.net).toBe(24);
  expect(q.quantity).toBe(26.4);
  expect(q.baseAmount).toBe(71280);
  expect(q.labourAmount).toBe(3000);
  expect(q.amount).toBe(74280);
  const onlyLabour = { ...i, labourRate: 125 };
  expect(
    changes(baseline, {
      ...r,
      items: r.items.map((v) => (v.id === i.id ? onlyLabour : v)),
    })[0],
  ).toMatchObject({ delta: 3000, scope: 0, rate: 3000 });
  expect(baseline).toEqual(frozen);
});
