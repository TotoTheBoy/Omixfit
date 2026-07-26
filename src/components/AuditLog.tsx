import { t } from "../lib/i18n";
import type { AuditAction } from "../lib/types";
import { useStore } from "../lib/store";
import { fmtRelative } from "../lib/date";

const ICONS: Record<AuditAction, { cls: string; glyph: string }> = {
  session_created: { cls: "create", glyph: "＋" },
  session_updated: { cls: "update", glyph: "✎" },
  session_cancelled: { cls: "cancel", glyph: "⊘" },
  session_deleted: { cls: "cancel", glyph: "🗑" },
  type_created: { cls: "create", glyph: "＋" },
  type_updated: { cls: "update", glyph: "✎" },
  type_deleted: { cls: "cancel", glyph: "🗑" },
  role_changed: { cls: "people", glyph: "★" },
  membership_changed: { cls: "people", glyph: "✓" },
  member_approved: { cls: "create", glyph: "✓" },
  member_rejected: { cls: "cancel", glyph: "✕" },
};

export function AuditLog({ limit = 20 }: { limit?: number }) {
  const data = useStore((s) => s);
  const entries = [...data.audit].sort((a, b) => b.ts - a.ts).slice(0, limit);

  return (
    <div className="report-section">
      <h2>{t.auditLog}</h2>
      {entries.length === 0 ? (
        <p className="muted">{t.auditEmpty}</p>
      ) : (
        <div className="audit">
          {entries.map((en) => {
            const ico = ICONS[en.action];
            const actor = data.users.find((u) => u.id === en.actorId);
            return (
              <div className="audit-row" key={en.id}>
                <span className={`ai ${ico.cls}`} aria-hidden="true">{ico.glyph}</span>
                <span className="ab">
                  <span className="at">{t.auditActions[en.action]}</span>
                  {en.summary && <span className="asum">{en.summary}</span>}
                  <span className="actor">{t.auditBy} {actor?.name ?? t.auditSystem}</span>
                </span>
                <span className="awhen">{fmtRelative(en.ts)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
