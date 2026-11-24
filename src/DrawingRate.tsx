import { currencySymbol, formatMoney } from "./region";
import { useState } from "react";
import {
  calculate,
  mappingIssue,
  pricingUnit,
  type Item,
  type Rate,
  type Rev,
} from "./model";
import { Choice, Field, Modal } from "./ui";

export function DrawingRate({
  item,
  rev,
  mode,
  save,
  close,
}: {
  item: Item;
  rev: Rev;
  mode: "choose" | "add";
  save: (rate: Rate, item: Item) => void;
  close: () => void;
}) {
  const unit = pricingUnit(item, rev);
  const compatible = rev.rates.filter(
    (v) => !mappingIssue(unit, v) && v.rate !== null,
  );
  const current = rev.rates.find((v) => v.code === item.code);
  const [code, setCode] = useState(
    mode === "choose"
      ? (compatible[0]?.code ?? "")
      : current && !mappingIssue(unit, current)
        ? current.code
        : "",
  );
  const [description, setDescription] = useState(
    mode === "add" && current?.code === code ? current.description : "",
  );
  const [price, setPrice] = useState(
    mode === "add" && current?.code === code ? String(current.rate ?? "") : "",
  );
  const key = code.trim();
  const existing = rev.rates.find((v) => v.code === key);
  const numeric = price.trim() === "" ? null : Number(price);
  const nextRate: Rate | undefined =
    mode === "choose"
      ? existing
      : {
          ...existing,
          code: key,
          description: description.trim(),
          unit,
          rate: numeric,
        };
  const incompatible = !!existing && !!mappingIssue(unit, existing);
  const valid =
    !!nextRate &&
    !!key &&
    (mode === "choose" || !!nextRate.description) &&
    nextRate.rate !== null &&
    Number.isFinite(nextRate.rate) &&
    nextRate.rate >= 0 &&
    !incompatible;
  const changed =
    !!existing &&
    mode === "add" &&
    (existing.rate !== numeric || existing.description !== description.trim());
  const affected = changed
    ? rev.items.filter(
        (i) => i.id !== item.id && (i.code === key || i.groupCode === key),
      )
    : [];
  const rollup = rev.rates.find((v) => v.code === item.groupCode);
  const mapped = {
    ...item,
    pricingUnit: unit,
    code: key,
    groupCode: rollup && !mappingIssue(unit, rollup) ? rollup.code : undefined,
  };
  const after = nextRate
    ? { ...rev, rates: [...rev.rates.filter((v) => v.code !== key), nextRate] }
    : rev;
  return (
    <Modal
      title={mode === "choose" ? "Choose existing rate" : "Add rate"}
      close={close}
    >
      <p>
        {item.id} · {unit} · Revision {rev.id}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid || !nextRate || rev.frozen) return;
          save(nextRate, mapped);
          close();
        }}
      >
        {mode === "choose" ? (
          <Field label="Compatible rate">
            <Choice value={code} onChange={(e) => setCode(e.target.value)}>
              {!compatible.length && (
                <option value="">No compatible priced rates</option>
              )}
              {compatible.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.code} · {v.description}
                  {" · "}
                  {formatMoney(v.rate, undefined, 12)}/{unit}
                </option>
              ))}
            </Choice>
          </Field>
        ) : (
          <div className="fieldgrid">
            <Field label="Rate code">
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </Field>
            <Field label="Description">
              <input
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
            <Field label="Compatible unit">
              <input value={unit} readOnly />
            </Field>
            <Field label={`Unit price (${currencySymbol()})`}>
              <input
                required
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </Field>
          </div>
        )}
        {incompatible && (
          <p className="issue">
            This code uses {existing!.unit}. Enter a different code for {unit}.
          </p>
        )}
        {changed && (
          <div className="issue">
            {key}
            {" · "}
            {formatMoney(existing!.rate, undefined, 12)}
            {" → "}
            {formatMoney(numeric, undefined, 12)}/{unit}.
            <p>
              {affected.length
                ? "Other affected items in this revision:"
                : "No other items use this code in this revision."}
            </p>
            {affected.map((i) => (
              <p key={i.id}>
                {i.id} · {rev.sheets.find((s) => s.id === i.sheet)?.number}
                {" · "}
                {formatMoney(calculate(i, rev).amount)}
                {" → "}
                {formatMoney(calculate(i, after).amount)}
              </p>
            ))}
          </div>
        )}
        {valid && (
          <p>
            {"Item amount after saving · "}
            {formatMoney(calculate(mapped, after).amount)}
          </p>
        )}
        <div className="formactions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={!valid}>
            {changed ? "Update shared rate & apply" : "Apply rate"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
