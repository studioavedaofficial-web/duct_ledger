// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { expect, test } from "vitest";
import { findRectangles, type Rectangle } from "../src/rectangles";
import { allProjects, deleteProject, getProject, save } from "../src/io";
import { newProject } from "../src/model";

test("Finds equal rectangles with shared edges, internal marks and quarter turns", () => {
  const width = 150,
    height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  function ink(x: number, y: number) {
    pixels.fill(10, 4 * (y * width + x), 4 * (y * width + x) + 3);
  }
  function outline({ x, y, w, h }: Rectangle) {
    for (let i = x; i <= x + w; i++) {
      ink(i, y);
      ink(i, y + h);
    }
    for (let j = y; j <= y + h; j++) {
      ink(x, j);
      ink(x + w, j);
    }
  }
  const target = { x: 5, y: 5, w: 30, h: 20 };
  const expected = [
    target,
    { ...target, x: 35 },
    { x: 85, y: 10, w: 20, h: 30 },
  ];
  expected.forEach(outline);
  outline({ x: 60, y: 55, w: 42, h: 18 });
  for (let i = 10; i < 23; i++) ink(i, 12);
  expect(findRectangles(pixels, width, height, target)).toEqual(expected);
});

test("Deleting one local project preserves the other and rejects stale edits", async () => {
  const first = newProject("Practice", ""),
    second = newProject("Keep", "");
  await save(first);
  await save(second);
  await deleteProject(first.id);
  await expect(save(first, true)).rejects.toThrow(/deleted/);
  expect(await getProject(first.id)).toBeUndefined();
  expect(await getProject(second.id)).toEqual(second);
  expect((await allProjects()).some((p) => p.id === first.id)).toBe(false);
});
