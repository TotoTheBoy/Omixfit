import { useEffect, useRef, type ReactNode } from "react";
import { IcClose } from "./icons";
import { t } from "../lib/i18n";

interface SheetProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Custom header replaces the default title bar (e.g. a colored hero). */
  hero?: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ title, onClose, children, footer, hero }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Dialog focus management (WCAG 2.4.3 / dialog pattern): move focus into the
  // sheet on open, trap Tab inside it, and restore focus to the trigger on
  // close. Without this, keyboard/SR users stay stuck behind the modal.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;

    // Focus the first focusable control, or the dialog itself.
    const focusables = sheet
      ? Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
      : [];
    (focusables[0] ?? sheet)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheet) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null, // visible only
      );
      if (items.length === 0) {
        e.preventDefault();
        sheet.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === sheet)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      // Restore focus to whatever opened the sheet.
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div
        className="sheet"
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {hero ?? (
          <div className="sheet-head">
            <span className="grip" />
            <h2 className="h2">{title}</h2>
            <button className="iconbtn" onClick={onClose} aria-label={t.close}>
              <IcClose />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
