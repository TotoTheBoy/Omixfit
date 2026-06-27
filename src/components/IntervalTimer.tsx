import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { IcClose } from "./icons";

// ---------------------------------------------------------------------------
// Live interval / circuit training timer for the trainer. Configurable
// stations × (work / rest), big countdown, a progress ring, and spoken Hebrew
// cues (work / rest / halfway / last station / done) via the browser's built-in
// SpeechSynthesis, plus a 3-2-1 beep. Everything is derived from a single
// `elapsed` counter so it never drifts. Self-contained — no store, no Firebase.
// ---------------------------------------------------------------------------

type Phase = "prep" | "work" | "rest";
interface Seg { kind: Phase; sec: number; station: number; round: number; }
interface Cfg { stations: number; work: number; rest: number; prep: number; rounds: number; }

const DEFAULT: Cfg = { stations: 8, work: 50, rest: 20, prep: 10, rounds: 1 };

function buildSegs(c: Cfg): Seg[] {
  const segs: Seg[] = [];
  if (c.prep > 0) segs.push({ kind: "prep", sec: c.prep, station: 0, round: 0 });
  for (let r = 1; r <= c.rounds; r++) {
    for (let s = 1; s <= c.stations; s++) {
      segs.push({ kind: "work", sec: c.work, station: s, round: r });
      const isVeryLast = r === c.rounds && s === c.stations;
      if (!isVeryLast && c.rest > 0)
        segs.push({ kind: "rest", sec: c.rest, station: s, round: r });
    }
  }
  return segs;
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
}

export function IntervalTimer({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<Cfg>(DEFAULT);
  const [segs, setSegs] = useState<Seg[]>(() => buildSegs(DEFAULT));
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [sound, setSound] = useState(true);
  const [started, setStarted] = useState(false);

  const audioRef = useRef<AudioContext | null>(null);
  const wakeRef = useRef<{ release: () => void } | null>(null);
  const halfRef = useRef(false);
  const lastIdxRef = useRef(-1);

  const { cum, total } = useMemo(() => {
    const cum: number[] = [];
    let acc = 0;
    for (const s of segs) { acc += s.sec; cum.push(acc); }
    return { cum, total: acc };
  }, [segs]);

  const idx = cum.findIndex((c) => elapsed < c);
  const finished = started && idx === -1;
  const seg = idx >= 0 ? segs[idx] : null;
  const segStart = idx > 0 ? cum[idx - 1] : 0;
  const remaining = seg ? cum[idx] - elapsed : 0;
  const segLen = seg ? seg.sec : 1;
  const segProgress = seg ? (elapsed - segStart) / segLen : 1;

  // ---- speech + beep ----
  function say(text: string) {
    if (!sound || typeof window === "undefined" || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "he-IL";
    u.pitch = 1.25; // a touch playful
    u.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function beep(freq = 660, dur = 0.12) {
    if (!sound) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = (audioRef.current ||= new Ctx());
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = freq;
      o.type = "sine";
      o.connect(g);
      g.connect(ac.destination);
      g.gain.setValueAtTime(0.18, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      o.start();
      o.stop(ac.currentTime + dur);
    } catch { /* no audio */ }
  }

  // ---- the 1-second clock ----
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // ---- cue on segment change ----
  useEffect(() => {
    if (!started || finished) return;
    if (idx === lastIdxRef.current) return;
    lastIdxRef.current = idx;
    if (!seg) return;
    if (seg.kind === "prep") say(t.timer.sayReady);
    else if (seg.kind === "rest") say(t.timer.sayRest);
    else {
      const isLastStation = seg.round === cfg.rounds && seg.station === cfg.stations;
      say(isLastStation ? t.timer.sayLast : t.timer.sayWork);
    }
    beep(880, 0.18);
  }, [idx, started, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- halfway cue + 3-2-1 beeps + finish ----
  useEffect(() => {
    if (!started || !running) return;
    if (!halfRef.current && total > 0 && elapsed >= Math.floor(total / 2) && elapsed < total) {
      halfRef.current = true;
      say(t.timer.sayHalfway);
    }
    if (seg && remaining <= 3 && remaining >= 1) beep(remaining === 1 ? 520 : 700, 0.1);
  }, [elapsed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (finished && running) {
      setRunning(false);
      say(t.timer.sayDone);
      beep(990, 0.3);
    }
  }, [finished, running]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keep the screen awake during a live session ----
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } };
    if (running && nav.wakeLock) {
      nav.wakeLock.request("screen").then((w) => (wakeRef.current = w)).catch(() => {});
    } else {
      wakeRef.current?.release();
      wakeRef.current = null;
    }
    return () => { wakeRef.current?.release(); wakeRef.current = null; };
  }, [running]);

  function start() {
    setSegs(buildSegs(cfg));
    setElapsed(0);
    halfRef.current = false;
    lastIdxRef.current = -1;
    setStarted(true);
    setRunning(true);
    say(t.timer.sayGo);
  }
  function reset() {
    setRunning(false);
    setStarted(false);
    setElapsed(0);
    halfRef.current = false;
    lastIdxRef.current = -1;
    window.speechSynthesis?.cancel();
  }

  const phaseClass = finished ? "done" : seg ? seg.kind : "prep";
  const phaseLabel = finished
    ? t.timer.finished
    : !seg
      ? ""
      : seg.kind === "prep"
        ? t.timer.getReady
        : seg.kind === "work"
          ? t.timer.work
          : t.timer.rest;

  const R = 130;
  const C = 2 * Math.PI * R;

  return (
    <div className={`timer-screen phase-${phaseClass}`} role="dialog" aria-label={t.timer.title}>
      <header className="timer-top">
        <strong>{t.timer.title}</strong>
        <div className="timer-top-actions">
          <button
            className="iconbtn"
            onClick={() => setSound((s) => !s)}
            aria-label={sound ? t.timer.soundOff : t.timer.soundOn}
            aria-pressed={sound}
          >
            {sound ? "🔊" : "🔇"}
          </button>
          <button className="iconbtn" onClick={onClose} aria-label={t.close}>
            <IcClose />
          </button>
        </div>
      </header>

      {!started ? (
        <div className="timer-config">
          <p className="timer-config-sub">
            {cfg.stations} {t.timer.stations} · {cfg.work}s {t.timer.work} / {cfg.rest}s {t.timer.rest}
            {cfg.rounds > 1 ? ` · ${cfg.rounds} ${t.timer.rounds}` : ""}
          </p>
          <div className="timer-fields">
            <NumField label={t.timer.stations} v={cfg.stations} min={1} max={30} on={(n) => setCfg({ ...cfg, stations: n })} />
            <NumField label={t.timer.workSec} v={cfg.work} min={5} max={600} step={5} on={(n) => setCfg({ ...cfg, work: n })} />
            <NumField label={t.timer.restSec} v={cfg.rest} min={0} max={600} step={5} on={(n) => setCfg({ ...cfg, rest: n })} />
            <NumField label={t.timer.prepSec} v={cfg.prep} min={0} max={120} step={5} on={(n) => setCfg({ ...cfg, prep: n })} />
            <NumField label={t.timer.rounds} v={cfg.rounds} min={1} max={20} on={(n) => setCfg({ ...cfg, rounds: n })} />
          </div>
          <p className="timer-total">
            {t.timer.totalLabel}: <b>{fmt(buildSegs(cfg).reduce((a, s) => a + s.sec, 0))}</b>
          </p>
          <button className="btn btn-lime btn-lg btn-block" onClick={start}>{t.timer.start}</button>
        </div>
      ) : (
        <div className="timer-run">
          <div className="timer-meta">
            {seg && seg.kind !== "prep" && (
              <span className="timer-station">{t.timer.station(seg.station, cfg.stations)}</span>
            )}
            {cfg.rounds > 1 && seg && seg.kind !== "prep" && (
              <span className="timer-round">{t.timer.round(seg.round, cfg.rounds)}</span>
            )}
          </div>

          <div className="timer-ring-wrap">
            <svg viewBox="0 0 300 300" className="timer-ring" aria-hidden="true">
              <circle cx="150" cy="150" r={R} className="ring-bg" />
              <circle
                cx="150" cy="150" r={R}
                className="ring-fg"
                style={{ strokeDasharray: C, strokeDashoffset: C * (finished ? 0 : 1 - segProgress) }}
              />
            </svg>
            <div className="timer-center">
              <span className="timer-phase">{phaseLabel}</span>
              {!finished && <span className="timer-count" aria-live="off">{fmt(remaining)}</span>}
              {finished && <span className="timer-done">🏁</span>}
            </div>
          </div>

          <div className="timer-totals">
            <span>{t.timer.elapsed} {fmt(elapsed)}</span>
            <span>{t.timer.remaining} {fmt(Math.max(0, total - elapsed))}</span>
          </div>

          <div className="timer-controls">
            {!finished &&
              (running ? (
                <button className="btn btn-ink btn-lg grow" onClick={() => setRunning(false)}>{t.timer.pause}</button>
              ) : (
                <button className="btn btn-lime btn-lg grow" onClick={() => setRunning(true)}>{t.timer.resume}</button>
              ))}
            <button className="btn btn-ghost-ink btn-lg" onClick={reset}>{t.timer.reset}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NumField({ label, v, on, min, max, step = 1 }: {
  label: string; v: number; on: (n: number) => void; min: number; max: number; step?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="timer-num">
      <label>{label}</label>
      <div className="timer-stepper">
        <button type="button" onClick={() => on(clamp(v - step))} aria-label="−">−</button>
        <input
          type="number"
          value={v}
          min={min}
          max={max}
          onChange={(e) => on(clamp(Number(e.target.value) || min))}
        />
        <button type="button" onClick={() => on(clamp(v + step))} aria-label="+">+</button>
      </div>
    </div>
  );
}
