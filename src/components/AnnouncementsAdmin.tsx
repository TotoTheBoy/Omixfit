import { useState } from "react";
import { t } from "../lib/i18n";
import {
  deleteAnnouncement,
  newAnnouncementId,
  upsertAnnouncement,
  useStore,
} from "../lib/store";
import { toast } from "./Toast";
import type { Announcement } from "../lib/types";

const TONES: Announcement["tone"][] = ["news", "event", "important"];

/** Staff composer for studio announcements. Posting adds a card to every
 *  trainee's home feed instantly (live Firestore listener). */
export function AnnouncementsAdmin() {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const list = [...data.announcements].sort((a, b) => b.createdAt - a.createdAt);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tone, setTone] = useState<Announcement["tone"]>("news");
  const canPost = title.trim().length > 1 && body.trim().length > 1;

  async function post() {
    if (!canPost) return;
    const a: Announcement = {
      id: newAnnouncementId(),
      title: title.trim(),
      body: body.trim(),
      tone,
      createdAt: Date.now(),
      authorId: me?.id,
    };
    await upsertAnnouncement(a);
    setTitle("");
    setBody("");
    setTone("news");
    toast(t.ann.posted);
  }

  async function remove(id: string) {
    await deleteAnnouncement(id);
    toast(t.ann.removed);
  }

  return (
    <section className="dash-sec ann-admin">
      <div className="row gap-2" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h3 className="h2">{t.ann.adminTitle}</h3>
        <span className="chip" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>{list.length}</span>
      </div>
      <p className="muted" style={{ margin: "0 0 12px" }}>{t.ann.adminSub}</p>

      <div className="ann-compose card">
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.ann.titlePh}
          maxLength={80}
        />
        <textarea
          className="input ann-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.ann.bodyPh}
          rows={3}
          maxLength={600}
        />
        <div className="ann-compose-foot">
          <div className="ann-tones" role="group" aria-label={t.ann.toneLabel}>
            {TONES.map((tn) => (
              <button
                key={tn}
                type="button"
                className={`ann-tone ann-tone-${tn} ${tone === tn ? "on" : ""}`}
                aria-pressed={tone === tn}
                onClick={() => setTone(tn)}
              >
                {t.ann.tones[tn!]}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={post} disabled={!canPost}>{t.ann.postCta}</button>
        </div>
      </div>

      {list.length > 0 && (
        <ul className="ann-admin-list">
          {list.map((a) => (
            <li key={a.id} className={`ann-row ann-tone-${a.tone ?? "news"}`}>
              <div className="ann-row-main">
                <b>{a.title}</b>
                <span>{a.body}</span>
                <small className="muted">{new Date(a.createdAt).toLocaleDateString("he-IL")}</small>
              </div>
              <button className="iconbtn danger" onClick={() => remove(a.id)} aria-label={t.ann.remove}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
