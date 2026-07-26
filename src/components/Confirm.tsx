// Module-level confirm/choose bus (mirrors Toast) so any handler can `await` a
// decision before acting. Renders a single modal via <ConfirmHost/>.
import { useEffect, useState } from "react";

export interface ConfirmOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
export interface ChoiceOption {
  id: string;
  label: string;
  danger?: boolean;
  primary?: boolean;
}

interface State {
  id: number;
  title: string;
  body?: string;
  // Yes/no confirm:
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Multi-choice:
  options?: ChoiceOption[];
  resolve: (v: unknown) => void;
}

let seq = 1;
const listeners = new Set<(s: State | null) => void>();
let current: State | null = null;

function emit() {
  listeners.forEach((l) => l(current));
}

/** Yes/no confirm. Resolves true if confirmed, false otherwise. */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  if (current) current.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...opts, id: seq++, resolve: resolve as (v: unknown) => void };
    emit();
  });
}

/** Multiple-choice. Resolves the chosen option id, or null on cancel/backdrop. */
export function choose(opts: {
  title: string;
  body?: string;
  options: ChoiceOption[];
  cancelLabel?: string;
}): Promise<string | null> {
  if (current) current.resolve(null);
  return new Promise<string | null>((resolve) => {
    current = { ...opts, id: seq++, resolve: resolve as (v: unknown) => void };
    emit();
  });
}

export function ConfirmHost() {
  const [state, setState] = useState<State | null>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(state.options ? null : false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function done(v: unknown) {
    if (current) current.resolve(v);
    current = null;
    emit();
  }

  if (!state) return null;
  const isChoice = !!state.options;
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={state.title} onClick={() => done(isChoice ? null : false)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{state.title}</h3>
        {state.body && <p className="confirm-body">{state.body}</p>}
        {isChoice ? (
          <div className="confirm-choices">
            {state.options!.map((o) => (
              <button
                key={o.id}
                className={`btn ${o.primary ? "btn-lime" : o.danger ? "btn-danger" : "btn-ghost"} btn-block`}
                onClick={() => done(o.id)}
              >
                {o.label}
              </button>
            ))}
            <button className="btn btn-ghost btn-block confirm-cancel" onClick={() => done(null)}>
              {state.cancelLabel ?? "ביטול"}
            </button>
          </div>
        ) : (
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => done(false)}>
              {state.cancelLabel ?? "ביטול"}
            </button>
            <button className={`btn ${state.danger ? "btn-danger" : "btn-lime"}`} onClick={() => done(true)} autoFocus>
              {state.confirmLabel ?? "אישור"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
