export type Region = "PK" | "UK" | "US" | "EU";
export type Currency = "PKR" | "GBP" | "USD" | "EUR";
export type UnitSystem = "metric" | "imperial";
export type Terminology = "variation" | "change-order";
export interface RegionalSettings {
  region: Region;
  currency: Currency;
  units: UnitSystem;
  terminology: Terminology;
}

const currencies: Record<Region, Currency> = {
  PK: "PKR",
  UK: "GBP",
  US: "USD",
  EU: "EUR",
};

export function regionPreset(region: Region): RegionalSettings {
  return {
    region,
    currency: currencies[region],
    units: region === "US" ? "imperial" : "metric",
    terminology: region === "US" ? "change-order" : "variation",
  };
}

const symbols = { GBP: "£", USD: "$", EUR: "€", PKR: "PKR" };
export function moneyNumber(
  amount: number | null | undefined,
  currency: Currency = currentRegion.currency,
  decimals = 2,
): string {
  if (amount == null) return "—";
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: currency === "PKR" ? 0 : 2,
    maximumFractionDigits: decimals,
  });
}
export function formatMoney(
  amount: number | null | undefined,
  currency: Currency = currentRegion.currency,
  decimals = 2,
): string {
  if (amount == null) return "—";
  if (currency === "PKR")
    return "PKR " + moneyNumber(amount, currency, decimals);
  return (
    (amount < 0 ? "−" : "") +
    symbols[currency] +
    moneyNumber(Math.abs(amount), currency, decimals)
  );
}
export function suggestedRegion(locale: string): Region {
  const code = new Intl.Locale(locale).region;
  if (code === "GB") return "UK";
  if (code === "US") return "US";
  return code &&
    "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE"
      .split(" ")
      .includes(code)
    ? "EU"
    : "PK";
}
export type Dimension = "size" | "length" | "area";
const imperialScale: Record<Dimension, number> = {
  size: 25.4,
  length: 0.3048,
  area: 0.092903,
};

export function displayQuantity(
  value: number,
  dimension: Dimension,
  units: UnitSystem,
) {
  return units === "metric" ? value : value / imperialScale[dimension];
}

export function canonicalQuantity(
  value: number,
  dimension: Dimension,
  units: UnitSystem,
) {
  return units === "metric" ? value : value * imperialScale[dimension];
}

export let accountRegion = regionPreset("PK");
export let currentRegion = regionPreset("PK");
export function setAccountRegion(value: RegionalSettings) {
  accountRegion = value;
}
export function setProjectRegion(value?: RegionalSettings) {
  currentRegion = value ?? regionPreset("PK");
}
export function validSettings(value: unknown): value is RegionalSettings {
  if (!value || typeof value !== "object") return false;
  const v = value as RegionalSettings;
  return (
    Object.hasOwn(currencies, v.region) &&
    Object.values(currencies).includes(v.currency) &&
    ["metric", "imperial"].includes(v.units) &&
    ["variation", "change-order"].includes(v.terminology)
  );
}
export function currencySymbol() {
  return symbols[currentRegion.currency];
}
export function regionalText(s: string) {
  let label = s;
  if (currentRegion.terminology === "change-order")
    label = label
      .replace(/Total proposed variation/gi, "Total proposed change")
      .replace(/Bill of quantities/g, "Estimate")
      .replace(/Variation/g, "Change order")
      .replace(/variation/g, "change order");
  return label;
}
export function unitLabel(d: Dimension) {
  return (
    currentRegion.units === "imperial"
      ? { size: "in", length: "ft", area: "ft²" }
      : { size: "mm", length: "m", area: "m²" }
  )[d];
}
export function shown(n: number | null | undefined, d: Dimension) {
  return n == null ? null : displayQuantity(n, d, currentRegion.units);
}

export function rateConversion(unit: string, units: UnitSystem) {
  const pairs = [
    ["m", "ft", imperialScale.length],
    ["m²", "ft²", imperialScale.area],
  ] as const;
  for (const [metric, imperial, factor] of pairs) {
    if (units === "imperial" && unit === metric)
      return { unit: imperial, factor };
    if (units === "metric" && unit === imperial)
      return { unit: metric, factor: 1 / factor };
  }
  return null;
}
