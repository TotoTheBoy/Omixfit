import { useMemo, useState } from "react";
import { SETTLEMENTS } from "../lib/settlements";
import { t } from "../lib/i18n";

export const CITY_SET = new Set(SETTLEMENTS);
export const isValidCity = (v: string) => CITY_SET.has(v);

/** Searchable combobox over the bundled settlement dictionary. No free text and
 *  no "אחר" — `onChange("")` fires until a real settlement is picked. */
export function CityPicker({
  value, onChange, id,
}: { value: string; onChange: (v: string) => void; id?: string }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const needle = q.trim();
    if (!needle) return SETTLEMENTS.slice(0, 20);
    return SETTLEMENTS.filter((c) => c.includes(needle)).slice(0, 40);
  }, [q]);

  return (
    <div className="city-combo">
      <input
        id={id}
        className="input"
        value={q}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={t.health.cityPlaceholder}
        aria-invalid={q.length > 0 && !isValidCity(q)}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setOpen(true);
          onChange(isValidCity(v) ? v : "");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <ul className="city-list" role="listbox">
          {matches.map((c) => (
            <li key={c} role="option" aria-selected={c === value}>
              <button
                type="button"
                className="city-opt"
                onMouseDown={() => { setQ(c); onChange(c); setOpen(false); }}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
