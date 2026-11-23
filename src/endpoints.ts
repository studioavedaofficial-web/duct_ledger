import { OPS } from "pdfjs-dist";
import { pdf } from "./io";
import type { Pt, Sheet } from "./model";

// PDF.js render paths contain move, line, cubic, quadratic and close commands.
// Resolve their endpoints in the same unrotated viewport used by SheetImage.
export async function drawingEndpoints(
  data: string,
  sheet: Sheet,
): Promise<Pt[]> {
  const page = await (await pdf(data)).getPage(sheet.page);
  const viewport = page.getViewport({ scale: 1, rotation: 0 });
  const list = await page.getOperatorList({ intent: "print" });
  const stack: DOMMatrix[] = [];
  let matrix = new DOMMatrix(viewport.transform);
  const points: Pt[] = [];
  for (let i = 0; i < list.fnArray.length && points.length < 80000; i++) {
    const op = list.fnArray[i],
      args = list.argsArray[i];
    if (op === OPS.save || op === OPS.paintFormXObjectBegin) {
      stack.push(matrix);
      if (op === OPS.paintFormXObjectBegin && args?.[0])
        matrix = matrix.multiply(new DOMMatrix(args[0]));
    } else if (op === OPS.restore || op === OPS.paintFormXObjectEnd) {
      matrix = stack.pop() ?? new DOMMatrix(viewport.transform);
    } else if (op === OPS.transform)
      matrix = matrix.multiply(new DOMMatrix(args));
    else if (op === OPS.constructPath) {
      const path = args?.[1]?.[0];
      if (!ArrayBuffer.isView(path) && !Array.isArray(path)) continue;
      const commands = path as unknown as ArrayLike<number>;
      for (let n = 0; n < commands.length && points.length < 80000;) {
        const cmd = commands[n++];
        if (cmd === 4) continue;
        const size = [2, 2, 6, 4][cmd];
        if (!size || n + size > commands.length) break;
        n += size;
        const pt = matrix.transformPoint(
          new DOMPoint(commands[n - 2], commands[n - 1]),
        );
        if (pt.x >= 0 && pt.y >= 0 && pt.x <= sheet.w && pt.y <= sheet.h)
          points.push([pt.x, pt.y]);
      }
    }
  }
  return points;
}
