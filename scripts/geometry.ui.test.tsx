// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { makeSampleSheets } from "../src/sampleLayout";
import { Measurements } from "../src/Measurements";
import { newProject, type Pt } from "../src/model";
import {
  geometryIssue,
  measurementValues,
  validMeasurement,
  type GenericMeasurement,
} from "../src/geometry";

vi.mock("../src/Canvas", () => ({ SheetImage: () => null }));
afterEach(cleanup);
const sheet = { ...makeSampleSheets("QA")[0], scale: 0.02 };
const boundary: Pt[] = [
  [20, 20],
  [270, 20],
  [270, 220],
  [20, 220],
];
const opening: Pt[] = [
  [60, 60],
  [160, 60],
  [160, 110],
  [60, 110],
];
const polygon: GenericMeasurement = {
  id: "area1",
  sheet: sheet.id,
  kind: "Polygon",
  points: boundary,
  cutouts: [opening],
};

test("A polygon can deduct only valid, contained and disjoint holes", () => {
  expect(validMeasurement(polygon, sheet)).toBe(true);
  expect(measurementValues(polygon, 0.02)).toEqual({
    gross: 20,
    deducted: 2,
    net: 18,
    unit: "m²",
  });
  for (const cutouts of [
    [boundary],
    [opening, opening],
    [
      [
        [0, 0],
        [900, 0],
        [900, 450],
        [0, 450],
      ],
    ],
    [
      [
        [60, 60],
        [160, 110],
        [60, 110],
        [160, 60],
      ],
    ],
  ] as Pt[][][]) {
    const invalid = { ...polygon, cutouts };
    expect(geometryIssue(invalid)).toBeTruthy();
    expect(validMeasurement(invalid, sheet)).toBe(false);
    expect(measurementValues(invalid, 0.02).net).toBeNull();
  }
  expect(measurementValues(polygon, null).net).toBeNull();
});
test("Length and polyline accumulate calibrated segments without closing the path", () => {
  const m: GenericMeasurement = {
    ...polygon,
    kind: "Length",
    points: boundary.slice(0, 2),
    cutouts: [],
  };
  expect(measurementValues(m, 0.02).net).toBe(5);
  expect(
    measurementValues(
      { ...m, kind: "Polyline", points: boundary.slice(0, 3) },
      0.02,
    ).net,
  ).toBe(9);
  expect(measurementValues(m, 0.01).net).toBe(2.5);
});

test("Area editor stores gross geometry and cutout vertices and leaves priced items alone", () => {
  const p = newProject("Geometry fixture", "QA");
  const saved = vi.fn();
  function Editor() {
    const [records, setRecords] = useState<GenericMeasurement[]>([]);
    const r = { ...p.revs[0], sheets: [sheet], measurements: records };
    return (
      <Measurements
        p={p}
        r={r}
        s={sheet}
        close={() => {}}
        save={(v) => {
          saved(v);
          setRecords(v);
        }}
      />
    );
  }
  render(<Editor />);
  fireEvent.change(screen.getByLabelText("Geometry type"), {
    target: { value: "Polygon" },
  });
  const svg = screen.getByLabelText("Calibrated geometry drawing");
  const group = svg.querySelector("g")! as unknown as SVGGElement;
  group.getScreenCTM = () => new DOMMatrix();
  const clickAt = ([x, y]: Pt) =>
    fireEvent.pointerDown(svg, { button: 0, clientX: x, clientY: y });
  boundary.forEach(clickAt);
  fireEvent.click(screen.getByRole("button", { name: "Add cutout" }));
  opening.forEach(clickAt);
  expect(
    screen.getByText("Gross 20 m² − deducted 2 m² = net 18 m²"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save geometry" }));
  expect(saved).toHaveBeenCalledOnce();
  expect(saved.mock.calls[0][0][0]).toMatchObject({
    ...polygon,
    id: expect.any(String),
  });
  expect(
    screen.getByRole("row", { name: /Polygon 1.*20 m².*2 m².*18 m²/ }),
  ).toBeTruthy();
  expect(p.revs[0].items).toEqual([]);
});
