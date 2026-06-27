import { useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassCategory, ClassType } from "../lib/types";
import {
  deleteClassType,
  newTypeId,
  upsertClassType,
  useStore,
} from "../lib/store";
import { Sheet } from "./Sheet";
import { toast } from "./Toast";

export function TypeEditor({
  type,
  onClose,
}: {
  type: ClassType | null;
  onClose: () => void;
}) {
  const data = useStore((s) => s);
  const editing = !!type;
  const [name, setName] = useState(type?.name ?? "");
  const [desc, setDesc] = useState(type?.description ?? "");
  const [category, setCategory] = useState<ClassCategory>(type?.category ?? "hiit");
  const [cap, setCap] = useState(type?.defaultCapacity ?? 16);
  const [dur, setDur] = useState(type?.defaultDurationMin ?? 45);

  const inUse = type
    ? data.sessions.filter((s) => s.classTypeId === type.id).length
    : 0;

  function save() {
    if (!name.trim()) {
      toast("יש להזין שם שיעור", "err");
      return;
    }
    upsertClassType({
      id: type?.id ?? newTypeId(),
      name: name.trim(),
      description: desc.trim(),
      category,
      defaultCapacity: cap,
      defaultDurationMin: dur,
    });
    toast(editing ? "סוג השיעור עודכן" : "סוג השיעור נוסף", "ok");
    onClose();
  }

  async function remove() {
    if (type && (await deleteClassType(type.id))) {
      toast("סוג השיעור נמחק", "info");
      onClose();
    } else {
      toast(t.typeInUse, "err");
    }
  }

  return (
    <Sheet
      title={editing ? t.editTypeTitle : t.newTypeTitle}
      onClose={onClose}
      footer={
        <button className="btn btn-lime grow" onClick={save}>
          {t.save}
        </button>
      }
    >
      <div className="field">
        <label htmlFor="te-name">{t.typeName}</label>
        <input
          id="te-name"
          aria-label={t.typeName}
          className="input"
          value={name}
          placeholder="לדוגמה: ספינינג אקספרס"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{t.typeCategory}</label>
        <div className="filterbar" style={{ margin: 0 }}>
          {(Object.keys(CATEGORY_META) as ClassCategory[]).map((c) => (
            <button
              key={c}
              className={`filter-chip ${category === c ? "on" : ""}`}
              onClick={() => setCategory(c)}
            >
              {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="te-desc">{t.typeDesc}</label>
        <textarea
          id="te-desc"
          aria-label={t.typeDesc}
          className="input"
          rows={3}
          value={desc}
          placeholder="מה מייחד את השיעור?"
          onChange={(e) => setDesc(e.target.value)}
          style={{ resize: "vertical" }}
        />
      </div>

      <div className="row gap-3 wrap">
        <div className="field grow" style={{ minWidth: 120 }}>
          <label htmlFor="te-cap">{t.defaultCap}</label>
          <input
            id="te-cap"
            aria-label={t.defaultCap}
            className="input tnum"
            type="number"
            min={1}
            value={cap}
            onChange={(e) => setCap(+e.target.value)}
          />
        </div>
        <div className="field grow" style={{ minWidth: 120 }}>
          <label htmlFor="te-dur">{t.defaultDur}</label>
          <input
            id="te-dur"
            aria-label={t.defaultDur}
            className="input tnum"
            type="number"
            min={15}
            step={5}
            value={dur}
            onChange={(e) => setDur(+e.target.value)}
          />
        </div>
      </div>

      {editing && (
        <>
          <div className="divider" />
          {inUse > 0 ? (
            <div className="note warn">
              <span className="ni">⚠️</span>
              {t.typeSessions(inUse)} — לא ניתן למחוק עד שכל השיעורים יוסרו.
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: "flex-start", color: "var(--danger)" }}
              onClick={remove}
            >
              {t.remove}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
