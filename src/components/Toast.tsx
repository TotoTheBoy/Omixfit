// Module-level toast bus so any code (incl. store callbacks) can fire a toast.
import { useEffect, useState } from "react";
import { IcCheck, IcWarn, IcInfo } from "./icons";

export type ToastKind = "ok" | "err" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  msg: string;
}

let seq = 1;
const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function emit() {
  listeners.forEach((l) => l(items));
}

export function toast(msg: string, kind: ToastKind = "ok") {
  const id = seq++;
  items = [...items, { id, kind, msg }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 2600);
}

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  if (!list.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite" aria-atomic="true">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span className="ic">
            {t.kind === "ok" ? (
              <IcCheck width={18} height={18} />
            ) : t.kind === "info" ? (
              <IcInfo width={18} height={18} />
            ) : (
              <IcWarn width={18} height={18} />
            )}
          </span>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}
