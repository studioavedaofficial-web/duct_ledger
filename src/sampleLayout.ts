import { newItem } from "./model";
import type { Item,Kind,Pt,Rate,Sheet } from "./model";

export const samplePdfFiles = {
  A: "/samples/ductledger-rev-a.pdf",
  B: "/samples/ductledger-rev-b.pdf",
};
export const sampleThumbnails = {
  "M-101": "/samples/m-101.png",
  "M-102": "/samples/m-102.png",
};

export const sampleRates: Rate[] = [
  {
    code: "GI-MAIN",
    description: "Galvanized rectangular supply main",
    unit: "m²",
    rate: 2500,
  },
  {
    code: "GI-BRANCH",
    description: "Galvanized supply air branches",
    unit: "m²",
    rate: 2200,
  },
  {
    code: "GI-RA",
    description: "Galvanized return air duct",
    unit: "m²",
    rate: 2150,
  },
  { code: "FT-EL", description: "Rectangular elbow", unit: "pc", rate: 2400 },
  {
    code: "FT-TR",
    description: "Rectangular transition",
    unit: "pc",
    rate: 1800,
  },
  {
    code: "FT-TE",
    description: "Rectangular branch tee",
    unit: "pc",
    rate: 3200,
  },
  {
    code: "SD-4W",
    description: "Four-way supply diffuser",
    unit: "pc",
    rate: 4800,
  },
];

export function makeSampleRates(rev: "A" | "B"): Rate[] {
  return sampleRates.map((r) => ({
    ...r,
    rate: rev === "B" && r.code === "GI-MAIN" ? 2700 : r.rate,
    date: rev === "B" ? "2026-10-19" : "2026-10-05",
  }));
}

/** Coordinates use the unrotated, top-left PDF.js viewport at scale 1. */
export function makeSampleSheets(doc: string): Sheet[] {
  return ["Ground Floor", "First Floor"].map((name, i) => ({
    id: "M-" + (101 + i),
    number: "M-" + (101 + i),
    name: name + " HVAC Plan",
    doc,
    page: i + 1,
    w: 1000,
    h: 650,
    scale: 0.025,
    verified: true,
    log: [
      "Calibrated using the 10,000 mm dimension from (270,270) to (670,270).",
      "Verified against the 5,100 mm grid dimension from (102,480) to (306,480).",
    ],
  }));
}

export function makeSampleItems(rev: "A" | "B"): Item[] {
  return makeSampleSheets("").flatMap((sheet, index) => {
    const zone = index === 0 ? "Ground Floor" : "First Floor";
    const seq = (n: number) => String(index * 100 + n).padStart(3, "0");
    const item = (
      id: string,
      kind: Kind,
      pts: Pt[],
      code: string,
      details: Partial<Item> = {},
    ): Item => ({
      ...newItem(id, sheet, kind, pts),
      width: null,
      height: null,
      diameter: null,
      code,
      zone,
      spec: "Galvanized steel",
      ...details,
    });
    const supply = (
      n: number,
      points: Pt[],
      width: number,
      height: number,
      code = "GI-BRANCH",
    ) =>
      item("SA-" + seq(n), "Rectangular duct", points, code, { width, height });
    const returnDuct = (n: number, points: Pt[]) =>
      item("RA-" + seq(n), "Rectangular duct", points, "GI-RA", {
        system: "Return air",
        width: 450,
        height: 250,
      });
    return [
      supply(
        1,
        [
          [270, 292],
          [670, 292],
        ],
        index === 0 && rev === "B" ? 800 : 600,
        400,
        index === 0 ? "GI-MAIN" : "GI-BRANCH",
      ),
      supply(
        2,
        [
          [696, 292],
          [800, 292],
        ],
        350,
        250,
      ),
      supply(
        3,
        [
          [812, 192],
          [812, 281],
        ],
        300,
        200,
      ),
      supply(
        4,
        [
          [812, 303],
          [812, 393],
        ],
        300,
        200,
      ),
      returnDuct(1, [
        [233.5, 314],
        [727.5, 314],
      ]),
      returnDuct(2, [
        [732, 318.5],
        [732, 381],
      ]),
      item("TR-" + seq(1), "Reducer", [[683, 292]], "FT-TR"),
      item("TE-" + seq(1), "Tee", [[812, 292]], "FT-TE"),
      item("EL-" + seq(1), "Elbow", [[246, 199]], "FT-EL"),
      item("EL-" + seq(2), "Elbow", [[246, 292]], "FT-EL"),
      item("SD-" + seq(1), "Diffuser", [[812, 181]], "SD-4W", {
        spec: "Powder-coated aluminium",
      }),
      item("SD-" + seq(2), "Diffuser", [[812, 404]], "SD-4W", {
        spec: "Powder-coated aluminium",
      }),
    ];
  });
}
