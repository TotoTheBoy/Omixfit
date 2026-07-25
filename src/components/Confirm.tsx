// Module-level confirm bus (mirrors Toast) so any handler can `await confirm(...)`
// before a destructive action. Renders a single modal via <ConfirmHost/>.
import { useEffect, useState } from "react";

export interface ConfirmOpts {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOpts {
  id: number;
  resolve: (ok: boolean) => void;
}

let seq = 1;
const listeners = new Set<(s: ConfirmState | null) => void>();
let current: ConfirmState | null = null;

function emit() {
  listeners.forEach((l) => l(current));
}

/** Show a confirm dialog. Resolves true if the user confirms, false otherwise. */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  // If one is already open, resolve it false first (avoid stacking).
  if (current) current.resolve(false);
  return new Promise<boolean>((resolve) => {
    current = { ...opts, id: seq++, resolve };
    emit();
  });
}

export function ConfirmHost() {
  const [state, setState] = useState<ConfirmState | null>(current);
  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") done(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function done(ok: boolean) {
    if (current) current.resolve(ok);
    current = null;
    emit();
  }

  if (!state) return null;
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label={state.title} onClick={() => done(false)}>
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{state.title}</h3>
        {state.body && <p className="confirm-body">{state.body}</p>}
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={() => done(false)}>
            {state.cancelLabel ?? "ביטול"}
          </button>
          <button
            className={`btn ${state.danger ? "btn-danger" : "btn-lime"}`}
            onClick={() => done(true)}
            autoFocus
          >
            {state.confirmLabel ?? "אישור"}
          </button>
        </div>
      </div>
    </div>
  );
}
