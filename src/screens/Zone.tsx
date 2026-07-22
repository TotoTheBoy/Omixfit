import { useState } from "react";
import { CATEGORY_META, t } from "../lib/i18n";
import type { ClassSession } from "../lib/types";
import { classTypeOf, dashboardStats, useStore } from "../lib/store";
import { fmtTime } from "../lib/date";
import { Planner } from "../components/Planner";
import { IntervalTimer } from "../components/IntervalTimer";
import { SessionDetail } from "../components/SessionDetail";
import { Sheet } from "../components/Sheet";
import { toast } from "../components/Toast";

const PIN_KEY = "omix:zonePin";

/** Omix Zone — the live-workout workspace: an interval timer, the tagged
 *  lesson-plan archive, and today's attendance. A passcode-protected
 *  "presentation mode" hides all admin numbers so a trainer can safely hand the
 *  device to a client; exiting back to admin requires the code (#1). */
export function Zone({
  presenting,
  onSetPresenting,
}: {
  presenting: boolean;
  onSetPresenting: (v: boolean) => void;
}) {
  const data = useStore((s) => s);
  const s = dashboardStats(data);
  const [timerOpen, setTimerOpen] = useState(false);
  const [detail, setDetail] = useState<ClassSession | null>(null);
  const [pinModal, setPinModal] = useState<null | "set" | "exit">(null);
  const [pin, setPin] = useState("");

  function requestPresent() {
    if (localStorage.getItem(PIN_KEY)) onSetPresenting(true);
    else { setPin(""); setPinModal("set"); } // first time → choose a code
  }
  function saveAndStart() {
    if (pin.trim().length < 4) { toast(t.zone.pinTooShort, "err"); return; }
    localStorage.setItem(PIN_KEY, pin.trim());
    setPinModal(null);
    onSetPresenting(true);
  }
  function tryExit() {
    if (pin.trim() === localStorage.getItem(PIN_KEY)) {
      setPinModal(null);
      onSetPresenting(false);
    } else {
      toast(t.zone.pinWrong, "err");
      setPin("");
    }
  }

  return (
    <div className="page zone">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.zone}</h1>
          <div className="sub">{presenting ? t.zone.presentingBanner : t.zone.sub}</div>
        </div>
        {presenting ? (
          <button className="btn btn-ink" onClick={() => { setPin(""); setPinModal("exit"); }}>
            {t.zone.exit}
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={requestPresent} title={t.zone.presentHint}>
            {t.zone.present}
          </button>
        )}
      </div>

      {/* The timer is the workspace's primary tool → a hero card, not a plain button. */}
      <button className="zone-hero" onClick={() => setTimerOpen(true)}>
        <span className="zone-hero-ico" aria-hidden="true">⏱</span>
        <span className="zone-hero-txt">
          <b>{t.timer.launch}</b>
          <small>{t.zone.timerSub}</small>
        </span>
        <span className="zone-hero-go" aria-hidden="true">▶</span>
      </button>

      {/* Today's attendance carries admin numbers — hidden in presentation mode. */}
      {!presenting && (
        <section className="zone-panel">
          <h2 className="h2" style={{ marginBottom: 10 }}>{t.zone.attendance}</h2>
          {s.classesToday.length === 0 ? (
            <p className="muted">{t.dash.noClassesToday}</p>
          ) : (
            <div className="dash-today">
              {s.classesToday.map(({ session, booked }) => {
                const type = classTypeOf(session, data);
                const full = booked >= session.capacity;
                return (
                  <button key={session.id} className="today-row zone-cls" onClick={() => setDetail(session)}>
                    <span className="tr-time">{fmtTime(session.startMin)}</span>
                    <span className="tr-name">{CATEGORY_META[type.category].emoji} {type.name}</span>
                    <span className={`tr-fill ${full ? "full" : ""}`}>{booked}/{session.capacity}</span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Lesson plans are client-safe; private task reminders are hidden while presenting. */}
      <Planner hideReminders={presenting} />

      {timerOpen && <IntervalTimer onClose={() => setTimerOpen(false)} />}
      {detail && !presenting && <SessionDetail session={detail} onClose={() => setDetail(null)} />}

      {pinModal && (
        <Sheet
          title={pinModal === "set" ? t.zone.setPinTitle : t.zone.enterPinTitle}
          onClose={() => setPinModal(null)}
          footer={
            <button
              className="btn btn-lime grow"
              onClick={pinModal === "set" ? saveAndStart : tryExit}
            >
              {pinModal === "set" ? t.zone.startPresent : t.zone.unlock}
            </button>
          }
        >
          {pinModal === "set" && <p className="muted" style={{ margin: "0 0 12px" }}>{t.zone.setPinHint}</p>}
          <input
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            style={{ textAlign: "center", fontSize: "1.4rem", letterSpacing: ".3em" }}
            placeholder={t.zone.pinPlaceholder}
            value={pin}
            maxLength={8}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") (pinModal === "set" ? saveAndStart : tryExit)(); }}
            autoFocus
          />
        </Sheet>
      )}
    </div>
  );
}
