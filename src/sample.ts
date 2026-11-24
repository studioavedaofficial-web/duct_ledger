import { regionPreset } from "./region";
import { newProject } from "./model";
import { encode } from "./io";
import {
  samplePdfFiles,
  makeSampleSheets,
  makeSampleItems,
  makeSampleRates,
} from "./sampleLayout";
export async function sampleTender() {
  const p = newProject("Crescent Business Centre", "Lahore, Pakistan");
  p.sample = true;
  p.regionalSettings = regionPreset("PK");
  p.revs = await Promise.all(
    (["A", "B"] as const).map(async (id) => {
      const resp = await fetch(samplePdfFiles[id]);
      if (!resp.ok) throw new Error("Sample drawing unavailable");
      p.documents[id] = await encode(await resp.blob());
      return {
        id,
        date: id === "A" ? "2026-10-05" : "2026-10-19",
        frozen: id === "A",
        sheets: makeSampleSheets(id),
        items: makeSampleItems(id),
        rates: makeSampleRates(id),
        queries: [],
        approved: [],
      };
    }),
  );
  return p;
}
