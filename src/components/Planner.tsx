import { useMemo, useState } from "react";
import { t } from "../lib/i18n";
import type { LessonPlan } from "../lib/types";
import {
  useStore,
  upsertLessonPlan,
  deleteLessonPlan,
  newLessonPlanId,
  upsertReminder,
  deleteReminder,
  newReminderId,
} from "../lib/store";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";
import { IcPlus, IcTrash, IcCheck } from "./icons";

/** #11 Coach workspace: operational task reminders + a tagged, reusable archive
 *  of lesson plans (מערכי שיעור). Both persist live in Firestore. */
export function Planner({ hideReminders = false }: { hideReminders?: boolean }) {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const [reminderText, setReminderText] = useState("");
  const [editing, setEditing] = useState<LessonPlan | null>(null);
  const [viewing, setViewing] = useState<LessonPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [tagFilter, setTagFilter] = useState("");

  const reminders = useMemo(
    () =>
      [...data.taskReminders].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1; // open first
        const ak = `${a.date ?? "9999"} ${a.hour ?? "99"}`;
        const bk = `${b.date ?? "9999"} ${b.hour ?? "99"}`;
        return ak.localeCompare(bk) || b.createdAt - a.createdAt;
      }),
    [data.taskReminders],
  );

  const tags = useMemo(() => {
    const set = new Set<string>();
    for (const p of data.lessonPlans) if (p.tag) set.add(p.tag);
    return [...set].sort();
  }, [data.lessonPlans]);

  const plans = useMemo(
    () =>
      [...data.lessonPlans]
        .filter((p) => !tagFilter || p.tag === tagFilter)
        .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)),
    [data.lessonPlans, tagFilter],
  );

  function addReminder() {
    const text = reminderText.trim();
    if (!text) return;
    upsertReminder({ id: newReminderId(), text, done: false, createdAt: Date.now() });
    setReminderText("");
  }

  return (
    <div className="planner">
      {!hideReminders && (
      <section className="planner-sec">
        <h2 className="h2" style={{ marginBottom: 10 }}>{t.planner.remindersTitle}</h2>
        <div className="row gap-2" style={{ marginBottom: 12 }}>
          <input
            className="input"
            value={reminderText}
            placeholder={t.planner.reminderPlaceholder}
            onChange={(e) => setReminderText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addReminder(); }}
          />
          <button className="btn btn-lime" onClick={addReminder}>{t.planner.addReminder}</button>
        </div>
        {reminders.length === 0 ? (
          <p className="muted">{t.planner.noReminders}</p>
        ) : (
          <ul className="reminder-list">
            {reminders.map((r) => (
              <li key={r.id} className={r.done ? "done" : ""}>
                <button
                  className="rem-check"
                  aria-label={t.planner.done}
                  aria-pressed={r.done}
                  onClick={() => upsertReminder({ ...r, done: !r.done })}
                >
                  {r.done ? <IcCheck width={15} height={15} /> : <span className="rem-box" />}
                </button>
                <span className="rem-text">{r.text}</span>
                {(r.date || r.hour) && <span className="rem-when">{r.date} {r.hour}</span>}
                <button
                  className="iconbtn rem-del"
                  aria-label={t.planner.delete}
                  onClick={() => deleteReminder(r.id)}
                >
                  <IcTrash width={16} height={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      <section className="planner-sec">
        <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <h2 className="h2">{t.planner.plansTitle}</h2>
          <button className="btn btn-lime" onClick={() => setCreating(true)}>
            <IcPlus width={18} height={18} /> {t.planner.newPlan}
          </button>
        </div>
        <p className="muted" style={{ margin: "0 0 12px", fontSize: ".85rem" }}>{t.planner.plansSub}</p>

        {tags.length > 0 && (
          <div className="filterbar" style={{ marginBottom: 12 }}>
            <button className={`filter-chip ${!tagFilter ? "on" : ""}`} onClick={() => setTagFilter("")}>
              {t.planner.allTags}
            </button>
            {tags.map((tg) => (
              <button key={tg} className={`filter-chip ${tagFilter === tg ? "on" : ""}`} onClick={() => setTagFilter(tg)}>
                {tg}
              </button>
            ))}
          </div>
        )}

        {plans.length === 0 ? (
          <p className="muted">{t.planner.noPlans}</p>
        ) : (
          <div className="plan-grid">
            {plans.map((p) => (
              <button key={p.id} className="plan-card" onClick={() => setViewing(p)}>
                {p.tag && <span className="plan-tag">{p.tag}</span>}
                <b className="plan-title">{p.title}</b>
                <span className="plan-snip">{p.content.slice(0, 90)}</span>
                <span className="plan-date">{new Date(p.updatedAt ?? p.createdAt).toLocaleDateString("he-IL")}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {viewing && (
        <PlanViewer
          plan={viewing}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
          onClose={() => setViewing(null)}
        />
      )}
      {(creating || editing) && (
        <PlanEditor plan={editing} authorId={me?.id} onClose={() => { setCreating(false); setEditing(null); }} />
      )}
    </div>
  );
}

/** Large, readable view of a lesson plan — opens when the card is tapped so the
 *  coach can read the workout during a session; "edit" is one tap away (#2). */
function PlanViewer({
  plan,
  onEdit,
  onClose,
}: {
  plan: LessonPlan;
  onEdit: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={plan.title}
      onClose={onClose}
      footer={<button className="btn btn-lime grow" onClick={onEdit}>✎ {t.planner.editPlan}</button>}
    >
      {plan.tag && <span className="plan-tag" style={{ display: "inline-block", marginBottom: 14 }}>{plan.tag}</span>}
      <div className="plan-read">{plan.content || "—"}</div>
    </Sheet>
  );
}

function PlanEditor({
  plan,
  authorId,
  onClose,
}: {
  plan: LessonPlan | null;
  authorId?: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(plan?.title ?? "");
  const [tag, setTag] = useState(plan?.tag ?? "");
  const [content, setContent] = useState(plan?.content ?? "");

  function save() {
    if (!title.trim()) { toast(t.planner.needTitle, "err"); return; }
    const now = Date.now();
    upsertLessonPlan({
      id: plan?.id ?? newLessonPlanId(),
      title: title.trim(),
      tag: tag.trim(),
      content: content.trim(),
      createdAt: plan?.createdAt ?? now,
      updatedAt: now,
      authorId: plan?.authorId ?? authorId,
    });
    toast(t.planner.savedPlanToast, "ok");
    onClose();
  }

  function duplicate() {
    const now = Date.now();
    upsertLessonPlan({
      id: newLessonPlanId(),
      title: `${title.trim()} (עותק)`,
      tag: tag.trim(),
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
      authorId,
    });
    toast(t.planner.duplicatedToast, "ok");
    onClose();
  }

  return (
    <Sheet
      title={plan ? t.planner.editPlan : t.planner.newPlan}
      onClose={onClose}
      footer={<button className="btn btn-lime grow" onClick={save}>{t.planner.save}</button>}
    >
      <div className="field">
        <label>{t.planner.planTitle}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>{t.planner.planTag}</label>
        <input className="input" value={tag} placeholder="CrossFit / HIIT / Spinning" onChange={(e) => setTag(e.target.value)} />
        <div className="filterbar" style={{ marginTop: 6, flexWrap: "wrap", gap: 6 }}>
          {t.planner.tagSuggestions.map((s) => (
            <button key={s} type="button" className="filter-chip" onClick={() => setTag(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>{t.planner.planContent}</label>
        <textarea className="input" rows={8} value={content} onChange={(e) => setContent(e.target.value)} />
      </div>
      {plan && (
        <div className="row gap-2" style={{ marginTop: 10 }}>
          <button className="btn btn-ghost grow" onClick={duplicate}>{t.planner.duplicate}</button>
          <button
            className="btn btn-danger"
            onClick={() => { deleteLessonPlan(plan.id); toast(t.planner.deletedToast, "info"); onClose(); }}
          >
            {t.planner.delete}
          </button>
        </div>
      )}
    </Sheet>
  );
}
