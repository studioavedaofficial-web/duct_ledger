import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
test("Both original two-page PDFs render with PDF.js and retain revision sizes", async () => {
  for (const rev of ["a", "b"]) {
    const data = new Uint8Array(
      await readFile("public/samples/ductledger-rev-" + rev + ".pdf"),
    );
    const doc = await getDocument({
      data,
      standardFontDataUrl: process.cwd() + "/public/pdf-assets/standard_fonts/",
    }).promise;
    assert.equal(doc.numPages, 2);
    for (let n = 1; n <= 2; n++) {
      const page = await doc.getPage(n),
        vp = page.getViewport({ scale: 1, rotation: 0 });
      assert.equal(vp.width, 1000);
      assert.equal(vp.height, 650);
      const canvas = createCanvas(vp.width, vp.height);
      await page.render({
        canvas,
        canvasContext: canvas.getContext("2d"),
        viewport: vp,
      }).promise;
      assert.ok(canvas.toBuffer("image/png").length > 10000);
      const text = (await page.getTextContent()).items
        .map((t) => t.str)
        .join(" ");
      assert.match(text, n === 1 ? /M-101/ : /M-102/);
      if (n === 1)
        assert.match(text, rev === "a" ? /600 [x×] 400/i : /800 [x×] 400/i);
    }
    await doc.destroy();
  }
});
