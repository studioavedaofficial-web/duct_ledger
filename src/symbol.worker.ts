import { matchSymbols, type PixelBox } from "./symbolMatching";

self.onmessage = ({
  data,
}: MessageEvent<{
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  box: PixelBox;
}>) => {
  try {
    self.postMessage({
      points: matchSymbols(data.pixels, data.width, data.height, data.box),
    });
  } catch (error) {
    self.postMessage({
      error: String(error instanceof Error ? error.message : error),
    });
  }
};
