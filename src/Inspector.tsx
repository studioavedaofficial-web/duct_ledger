import {
  currencySymbol,
  formatMoney,
  currentRegion,
  canonicalQuantity,
  shown,
  unitLabel,
} from "./region";
import { useEffect, useRef, useState } from "react";
import {
  SlidersHorizontal,
  Box,
  Pencil,
  Ruler,
  Calculator,
  ChevronDown,
  Table2,
  Trash2,
  Focus,
} from "lucide-react";
import {
  calculate,
  pricingUnit,
  mappingIssue,
  quantityExplanation,
  normalizeUnit,
  presetSettings,
  type Preset,
  type Rate,
  type Unit,
  fmt,
  kinds,
  piece,
  type Item,
  type Rev,
  type Kind,
} from "./model";
import { Field, Choice, Modal, IconButton, Empty } from "./ui";
import { DrawingRate } from "./DrawingRate";
export function Inspector({
  r,
  item,
  edit,
  openBoq,
  saveRate,
  priceRequest = 0,
}: {
  r: Rev;
  item?: Item;
  edit: () => void;
  openBoq: () => void;
  priceRequest?: number;
  saveRate?: (rate: Rate, item: Item) => void;
}) {
  const [rateMode, setRateMode] = useState<"choose" | "add" | null>(null);
  const [detail, setDetail] = useState(false);
  const lastRequest = useRef(priceRequest);
  useEffect(() => {
    if (priceRequest === lastRequest.current) return;
    lastRequest.current = priceRequest;
    if (item && !r.frozen) {
      const unit = pricingUnit(item, r);
      setRateMode(
        r.rates.some((rate) => !mappingIssue(unit, rate) && rate.rate !== null)
          ? "choose"
          : "add",
      );
    }
  }, [priceRequest, item, r]);
  if (!item)
    return (
      <aside className="inspector">
        <div className="panelhead">
          <SlidersHorizontal />
          Item inspector
        </div>
        <Empty
          title="No item selected"
          text="Select a drawing item or measure a new run."
        />
      </aside>
    );
  const c = calculate(item, r),
    f = piece(item.kind);
  return (
    <aside className="inspector">
      <div className="panelhead">
        <SlidersHorizontal size={17} />
        Item inspector
      </div>
      <div className="inspectscroll">
        <section className="inspect-section itemtop">
          <div className="itemicon">
            <Box size={25} />
          </div>
          <div className="itemtitle">
            <div>
              <span className="idtag">{item.id}</span>
              <h3>{item.kind}</h3>
            </div>
            {!r.frozen && (
              <IconButton title="Edit item" onClick={edit}>
                <Pencil size={15} />
              </IconButton>
            )}
          </div>
          <div className="keyrow">
            <span>System</span>
            <b className="systemtag">
              <i
                className={
                  "dot " + (item.system === "Return air" ? "amber" : "")
                }
              />
              {item.system}
            </b>
          </div>
          <div className="keyrow">
            <span>Zone</span>
            <b>{item.zone}</b>
          </div>
          <div className="keyrow">
            <span>Material</span>
            <b>{item.spec || "Unresolved"}</b>
          </div>
        </section>
        <section className="inspect-section">
          <h4>
            <Ruler size={16} /> Dimensions
          </h4>
          <div className="dimgrid">
            {f ? (
              <Dim label="Count" value={item.count} unit="pc" />
            ) : item.kind === "Circular duct" ? (
              <Dim
                label="Diameter"
                value={shown(item.diameter, "size")}
                unit={unitLabel("size")}
              />
            ) : (
              <>
                <Dim
                  label="Width"
                  value={shown(item.width, "size")}
                  unit={unitLabel("size")}
                />
                <Dim
                  label="Height"
                  value={shown(item.height, "size")}
                  unit={unitLabel("size")}
                />
              </>
            )}
          </div>
          {!f && (
            <div className="keyrow length">
              <span>
                {item.kind === "Vertical riser"
                  ? "Vertical length"
                  : "Measured length"}
              </span>
              <b>
                {fmt(shown(c.length, "length"))} {unitLabel("length")}
              </b>
            </div>
          )}
        </section>
        <section className="inspect-section">
          <h4>
            <Calculator size={16} /> Quantity & cost
          </h4>
          <div className="keyrow">
            <span>Net quantity</span>
            <b>
              {fmt(c.net)} {c.unit}
            </b>
          </div>
          <div className="keyrow">
            <span>Material waste</span>
            <b>{fmt(item.waste)}%</b>
          </div>
          <div className="keyrow">
            <span>Priced quantity</span>
            <b>
              {fmt(c.quantity, 6)} {c.unit}
            </b>
          </div>
          <div className="keyrow">
            <span>Unit rate</span>
            <b>
              {formatMoney(c.rate, undefined, 12)} <small>/{c.unit}</small>
            </b>
          </div>
          {c.labourRate > 0 && (
            <>
              <div className="keyrow">
                <span>Mapped cost</span>
                <b>{formatMoney(c.baseAmount)}</b>
              </div>
              <div className="keyrow">
                <span>Additional labour</span>
                <b>
                  {fmt(c.labourQuantity, 6)} {c.unit} × {fmt(c.labourRate)}
                  {" = "}
                  {formatMoney(c.labourAmount)}
                </b>
              </div>
            </>
          )}
          <div className="amountbox">
            <span>Item amount</span>
            <strong>{formatMoney(c.amount)}</strong>
          </div>
          <button className="calc-toggle" onClick={() => setDetail(!detail)}>
            <ChevronDown size={14} />
            {detail ? "Hide" : "Show"} calculation
          </button>
          {detail && <p className="formula">{quantityExplanation(item, r)}</p>}
          {c.errors.map((e) => (
            <div key={e} className="issue">
              {e}
            </div>
          ))}
          {!r.frozen && saveRate && (
            <div className="formactions">
              <button
                className="secondary small"
                onClick={() => setRateMode("choose")}
              >
                Choose existing rate
              </button>
              <button
                className="secondary small"
                onClick={() => setRateMode("add")}
              >
                Add rate
              </button>
            </div>
          )}
          {rateMode && saveRate && !r.frozen && (
            <DrawingRate
              key={item.id + rateMode}
              item={item}
              rev={r}
              mode={rateMode}
              save={saveRate}
              close={() => setRateMode(null)}
            />
          )}
        </section>
        <button className="boqlink" onClick={openBoq}>
          <Table2 size={16} /> View BOQ mapping{" "}
          <span>{item.code || "Unmapped"}</span>
        </button>
      </div>
    </aside>
  );
}
function Dim({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null;
  unit: string;
}) {
  return (
    <div className="dim">
      <span>{label}</span>
      <b>
        {fmt(value)} <small>{unit}</small>
      </b>
    </div>
  );
}
export function ItemForm({
  item,
  r,
  close,
  submit,
  remove,
  redraw,
  presets = [],
  savePreset,
  allowNext = false,
  settingsOnly = false,
}: {
  item: Item;
  r: Rev;
  close: () => void;
  submit: (i: Item, next?: boolean) => void;
  presets?: Preset[];
  savePreset?: (preset: Preset) => void;
  allowNext?: boolean;
  settingsOnly?: boolean;
  remove: () => void;
  redraw: () => void;
}) {
  const [x, set] = useState<Item>({
    ...structuredClone(item),
    pricingUnit: pricingUnit(item, r),
  });
  const [presetName, setPresetName] = useState("");
  const [savedName, setSavedName] = useState("");
  const matchesFamily = (k: Kind) =>
    piece(k) === piece(item.kind) &&
    (k === "Vertical riser") === (item.kind === "Vertical riser");
  function f<K extends keyof Item>(k: K, v: Item[K]) {
    set({ ...x, [k]: v });
  }
  const [attempted, setAttempted] = useState(false);
  const invalidCount =
    piece(x.kind) && (!Number.isInteger(x.count) || x.count < 1);
  const showCountError = attempted && invalidCount;
  const unit = pricingUnit(x, r);
  const invalid = (code: string) =>
    code
      ? mappingIssue(
          unit,
          r.rates.find((v) => v.code === code),
        )
      : "";
  const issue = invalid(x.code) || invalid(x.groupCode ?? "");
  const numeric = (
    k: "width" | "height" | "diameter" | "rise" | "count" | "waste",
    label: string,
  ) => (
    <Field
      label={label
        .replace("(mm)", "(" + unitLabel("size") + ")")
        .replace("(m)", "(" + unitLabel("length") + ")")}
    >
      <input
        type="number"
        min={k === "count" ? 1 : k === "waste" ? 0 : 0.00001}
        required={k === "count"}
        aria-invalid={(k === "count" && showCountError) || undefined}
        aria-describedby={
          k === "count" && showCountError ? "piece-count-error" : undefined
        }
        onInvalid={
          k === "count"
            ? (e) => {
                e.preventDefault();
                setAttempted(true);
                e.currentTarget.focus();
              }
            : undefined
        }
        step={k === "count" ? 1 : "any"}
        value={
          (k === "rise"
            ? shown(x[k], "length")
            : ["width", "height", "diameter"].includes(k)
              ? shown(x[k], "size")
              : x[k]) ?? ""
        }
        onChange={(e) =>
          f(
            k,
            e.target.value === ""
              ? null
              : canonicalQuantity(
                  Number(e.target.value),
                  k === "rise" ? "length" : "size",
                  ["count", "waste"].includes(k)
                    ? "metric"
                    : currentRegion.units,
                ),
          )
        }
      />
    </Field>
  );
  return (
    <Modal
      title={settingsOnly ? "Change run settings" : "Edit " + x.id}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAttempted(true);
          if (invalidCount || issue) return;
          const action = (e.nativeEvent as SubmitEvent)
            .submitter as HTMLButtonElement | null;
          submit(
            { ...x, review: false },
            allowNext && action?.value === "next",
          );
        }}
      >
        {savePreset && (
          <details className="preset-tools">
            <summary>Reusable presets</summary>
            <Field label="Apply preset">
              <Choice
                value=""
                onChange={(e) => {
                  const preset = presets.find(
                    (v) =>
                      v.name === e.target.value &&
                      matchesFamily(v.settings.kind),
                  );
                  if (preset) {
                    set({
                      ...x,
                      ...presetSettings({ ...x, ...preset.settings }, r),
                    });
                    setPresetName(preset.name);
                    setSavedName("");
                  }
                }}
              >
                <option value="">Select settings</option>
                {presets
                  .filter((v) => matchesFamily(v.settings.kind))
                  .map((v) => (
                    <option key={v.name}>{v.name}</option>
                  ))}
              </Choice>
            </Field>
            <Field label="Preset name">
              <input
                value={presetName}
                onChange={(e) => {
                  setPresetName(e.target.value);
                  setSavedName("");
                }}
              />
            </Field>
            <button
              className="secondary small"
              type="button"
              disabled={!presetName.trim() || !!issue || invalidCount}
              onClick={() => {
                const name = presetName.trim();
                savePreset({ name, settings: presetSettings(x, r) });
                setSavedName(name);
              }}
            >
              {presets.some((v) => v.name === presetName.trim())
                ? "Update preset"
                : "Save preset"}
            </button>
            {savedName && <p role="status">Saved preset · {savedName}</p>}
          </details>
        )}
        <div className="fieldgrid">
          <Field label="Item type">
            <Choice
              value={x.kind}
              onChange={(e) => f("kind", e.target.value as Kind)}
            >
              {kinds
                .filter(
                  (k) =>
                    piece(k) === piece(item.kind) &&
                    (k === "Vertical riser") ===
                      (item.kind === "Vertical riser"),
                )
                .map((k) => (
                  <option key={k}>{k}</option>
                ))}
            </Choice>
          </Field>
          <Field label="System">
            <Choice
              value={x.system}
              onChange={(e) => f("system", e.target.value)}
            >
              {["Supply air", "Return air", "Exhaust air", "Fresh air"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </Choice>
          </Field>
          <Field label="Floor / zone">
            <input value={x.zone} onChange={(e) => f("zone", e.target.value)} />
          </Field>
          <Field label="Material specification">
            <input value={x.spec} onChange={(e) => f("spec", e.target.value)} />
          </Field>
          {piece(x.kind) ? (
            <div>
              {numeric("count", "Quantity (pc)")}
              {showCountError && (
                <p id="piece-count-error" className="issue" role="alert">
                  Enter a whole number of 1 or more.
                </p>
              )}
            </div>
          ) : x.kind === "Circular duct" ? (
            numeric("diameter", "Diameter (mm)")
          ) : (
            <>
              {numeric("width", "Width (mm)")}
              {numeric("height", "Height (mm)")}
            </>
          )}
          {x.kind === "Vertical riser" &&
            numeric("rise", "Vertical length (m)")}
          {!piece(x.kind) && numeric("waste", "Material waste (%)")}
          <Field label="Pricing basis">
            <Choice
              value={x.pricingBasis ?? ""}
              onChange={(e) =>
                f(
                  "pricingBasis",
                  e.target.value === ""
                    ? undefined
                    : (e.target.value as Item["pricingBasis"]),
                )
              }
            >
              <option value="">Use mapped rate basis</option>
              <option value="material">Material</option>
              <option value="labour">Labour</option>
            </Choice>
          </Field>
          <Field label={`Additional labour (${currencySymbol()}/` + unit + ")"}>
            <input
              type="number"
              min="0"
              step="any"
              value={x.labourRate ?? ""}
              onChange={(e) =>
                f(
                  "labourRate",
                  e.target.value === "" ? undefined : +e.target.value,
                )
              }
            />
          </Field>
          <Field label="Pricing unit">
            <Choice
              value={unit}
              onChange={(e) => f("pricingUnit", e.target.value as Unit)}
            >
              {(piece(x.kind) ? ["pc"] : ["m²", "m", "ft²", "ft"]).map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Choice>
          </Field>
          <Field label="BOQ mapping">
            <Choice value={x.code} onChange={(e) => f("code", e.target.value)}>
              <option value="">Unmapped</option>
              {x.code && !r.rates.some((v) => v.code === x.code) && (
                <option value={x.code}>{x.code} · missing</option>
              )}
              {r.rates.map((v) => (
                <option
                  key={v.code}
                  value={v.code}
                  disabled={!!mappingIssue(unit, v)}
                >
                  {v.code} · {normalizeUnit(v.unit) ?? v.unit}
                </option>
              ))}
            </Choice>
          </Field>
          <p
            className={issue ? "issue" : "quiet"}
            style={{ gridColumn: "1 / -1" }}
          >
            {issue ||
              "Only " +
                unit +
                " rates match this item. Rates in " +
                ["m", "m²", "pc"].filter((u) => u !== unit).join(" and ") +
                " are unavailable."}
          </p>
          <Field label="BOQ roll-up">
            <Choice
              value={x.groupCode ?? ""}
              onChange={(e) => f("groupCode", e.target.value || undefined)}
            >
              <option value="">Use mapped rate code</option>
              {r.rates.map((v) => (
                <option
                  key={v.code}
                  value={v.code}
                  disabled={!!mappingIssue(unit, v)}
                >
                  {v.code} · {v.unit}
                </option>
              ))}
            </Choice>
          </Field>
          <Field label="Change classification">
            <Choice
              value={x.decision ?? ""}
              onChange={(e) => f("decision", e.target.value)}
            >
              {[
                "",
                "Retained",
                "Added",
                "Resized",
                "Rerouted",
                "Specification changed",
              ].map((v) => (
                <option key={v} value={v}>
                  {v || "Detect from edits"}
                </option>
              ))}
            </Choice>
          </Field>
        </div>
        <div className="formactions">
          {!settingsOnly && (
            <>
              <button type="button" className="danger" onClick={remove}>
                <Trash2 size={15} />
                Remove
              </button>
              <button type="button" className="secondary" onClick={redraw}>
                <Focus size={15} />
                Redraw
              </button>
            </>
          )}
          <button className="primary" disabled={!!issue}>
            {settingsOnly ? "Apply settings" : "Save item"}
          </button>
          {allowNext && !piece(x.kind) && x.kind !== "Vertical riser" && (
            <button
              className="secondary"
              type="submit"
              value="next"
              disabled={!!issue}
            >
              Save &amp; measure next
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
