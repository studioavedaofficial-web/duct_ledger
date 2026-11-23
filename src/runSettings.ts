import { type Item, type Project } from "./model";

export function runSettings(i: Item) {
  const {
    kind,
    width,
    height,
    diameter,
    system,
    zone,
    spec,
    waste,
    pricingUnit,
    code,
    groupCode,
    pricingBasis,
    labourRate,
  } = i;
  return {
    kind,
    width,
    height,
    diameter,
    system,
    zone,
    spec,
    waste,
    pricingUnit,
    code,
    groupCode,
    pricingBasis,
    labourRate,
  };
}

export function allocateIds(p: Project, count: number, prefix: string) {
  const used = new Set(p.revs.flatMap((rev) => rev.items.map((i) => i.id)));
  const ids: string[] = [];
  for (let n = 1; ids.length < count; n++) {
    const id = prefix + "-" + String(n).padStart(3, "0");
    if (!used.has(id)) ids.push(id);
  }
  return ids;
}
