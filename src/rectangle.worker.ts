import { findRectangles, type Rectangle } from "./rectangles";
self.onmessage = ({
  data,
}: MessageEvent<{
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  template: Rectangle;
}>) => {
  try {
    self.postMessage({
      matches: findRectangles(
        data.pixels,
        data.width,
        data.height,
        data.template,
      ),
    });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : String(e) });
  }
};
