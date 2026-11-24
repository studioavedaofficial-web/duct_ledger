import { regionPreset, type RegionalSettings, type Region } from "./region";
export function RegionalFields({
  value,
  onChange,
}: {
  value: RegionalSettings;
  onChange: (v: RegionalSettings) => void;
}) {
  return (
    <fieldset className="regional-fields">
      <legend>Regional settings</legend>
      <label>
        Region{" "}
        <select
          aria-label="Region"
          value={value.region}
          onChange={(e) => onChange(regionPreset(e.target.value as Region))}
        >
          {Object.entries({
            PK: "Pakistan",
            UK: "United Kingdom",
            US: "United States",
            EU: "Europe (EUR)",
          }).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {(["currency", "units", "terminology"] as const).map((key) => (
        <label key={key}>
          {key}{" "}
          <select
            aria-label={key}
            value={value[key]}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          >
            {{
              currency: ["GBP", "USD", "EUR", "PKR"],
              units: ["metric", "imperial"],
              terminology: ["variation", "change-order"],
            }[key].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
