// Trainee "add to my calendar" - OPT-IN, per single session. Generates a local
// .ics download and a Google-Calendar link for ONE class the member chose. Never
// touches the member's calendar automatically and never writes any data.
import type { ClassSession } from "./types";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local floating timestamp "YYYYMMDDTHHMMSS" (interpreted in the viewer's tz). */
function stamp(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function startEnd(session: ClassSession): { start: Date; end: Date } {
  const [y, m, dd] = session.date.split("-").map(Number);
  const start = new Date(y, m - 1, dd, Math.floor(session.startMin / 60), session.startMin % 60);
  const end = new Date(start.getTime() + session.durationMin * 60000);
  return { start, end };
}

export interface CalendarEventInfo {
  title: string;
  location?: string;
  description?: string;
}

/** A Google-Calendar "add event" link for a single session. */
export function googleCalendarUrl(session: ClassSession, info: CalendarEventInfo): string {
  const { start, end } = startEnd(session);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: info.title,
    dates: `${stamp(start)}/${stamp(end)}`,
  });
  if (info.location) params.set("location", info.location);
  if (info.description) params.set("details", info.description);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build a minimal, valid single-event .ics file body. */
export function buildIcs(session: ClassSession, info: CalendarEventInfo): string {
  const { start, end } = startEnd(session);
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Omixfit//Schedule//HE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${session.id}@omixfit.com`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(info.title)}`,
    info.location ? `LOCATION:${esc(info.location)}` : "",
    info.description ? `DESCRIPTION:${esc(info.description)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/** Trigger a local .ics download for the chosen session (opt-in). */
export function downloadIcs(session: ClassSession, info: CalendarEventInfo): void {
  const blob = new Blob([buildIcs(session, info)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `omix-${session.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
