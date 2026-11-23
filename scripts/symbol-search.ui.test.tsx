import { expect, test } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { writeFileSync } from "node:fs";
import { matchSymbols } from "../src/symbolMatching";

test("Local raster matcher on six diffusers, a marked diffuser alternate and an empty grille", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage([400, 240]);
  const good = [
    [50, 50],
    [150, 50],
    [250, 50],
    [50, 150],
    [150, 150],
    [250, 150],
  ];
  const alternate = [350, 50],
    grille = [350, 150];
  function square(x: number, y: number) {
    page.drawRectangle({
      x: x - 8,
      y: 240 - y - 8,
      width: 16,
      height: 16,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1.5,
    });
  }
  function line(x: number, y: number, dx: number, dy: number) {
    page.drawLine({
      start: { x, y: 240 - y },
      end: { x: x + dx, y: 240 - y - dy },
      thickness: 1.5,
      color: rgb(0, 0, 0),
    });
  }
  for (const [x, y] of [...good, alternate]) {
    square(x, y);
    line(x - 8, y - 8, 16, 16);
    line(x - 8, y + 8, 16, -16);
  }
  line(alternate[0] - 4, alternate[1], 8, 0);
  square(grille[0], grille[1]);
  line(grille[0] - 8, grille[1], 16, 0);
  const bytes = await pdf.save();
  if (process.env.DUCTLEDGER_QA_OUTPUT)
    writeFileSync(process.env.DUCTLEDGER_QA_OUTPUT + "/symbols.pdf", bytes);
  const doc = await getDocument({ data: bytes }).promise;
  try {
    const pg = await doc.getPage(1),
      viewport = pg.getViewport({ scale: 2 });
    const canvas = createCanvas(viewport.width, viewport.height);
    await pg.render({ canvas: canvas as any, viewport }).promise;
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const hits = matchSymbols(data, canvas.width, canvas.height, {
      x: 80,
      y: 80,
      w: 40,
      h: 40,
    });
    const pts = hits.map((v) => [v.x / 2, v.y / 2]);
    expect(
      good.every(([x, y]) =>
        pts.some(([a, b]) => Math.hypot(a - x, b - y) < 1),
      ),
    ).toBe(true);
    expect(pts).toContainEqual(alternate);
    expect(pts).not.toContainEqual(grille);
    expect(pts.length).toBe(7);
    expect(() =>
      matchSymbols(data, canvas.width, canvas.height, {
        x: 10,
        y: 10,
        w: 40,
        h: 40,
      }),
    ).toThrow(/too little detail/);
  } finally {
    await doc.destroy();
  }
});
