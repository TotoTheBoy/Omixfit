// Shared "move a class" flow for the calendar drag. Moves ONLY the session
// (date/time) - bookings and client personal data are never touched. Then, and
// only if there are registered members, asks the staffer how to update them.
import type { AppData, ClassSession } from "./types";
import {
  classTypeOf,
  newAnnouncementId,
  notifyScheduleChange,
  upsertAnnouncement,
  upsertSession,
} from "./store";
import { fmtTime } from "./date";
import { choose } from "../components/Confirm";
import { toast } from "../components/Toast";

export async function moveSession(
  s: ClassSession,
  newDateKey: string,
  newStartMin: number,
  data: AppData,
): Promise<void> {
  if (s.date === newDateKey && s.startMin === newStartMin) return;
  try {
    await upsertSession({ ...s, date: newDateKey, startMin: newStartMin });
  } catch {
    toast("העברת השיעור נכשלה - נסו שוב", "err");
    return;
  }

  // Notify ONLY people registered for this class. Nobody registered → nobody
  // is bothered.
  const registered = data.bookings
    .filter((b) => b.sessionId === s.id && (b.state === "confirmed" || b.state === "waitlisted"))
    .map((b) => b.userId);

  if (registered.length === 0) {
    toast("השיעור הועבר", "ok");
    return;
  }

  const how = await choose({
    title: "השיעור הועבר",
    body: `${registered.length} מתאמנים רשומים לשיעור. איך לעדכן אותם?`,
    options: [
      { id: "email", label: "✉️ מייל אישי לכל נרשם", primary: true },
      { id: "feed", label: "🏠 הודעה בעמוד הבית שלהם" },
      { id: "none", label: "לא לעדכן כרגע" },
    ],
  });

  if (how === "email") {
    notifyScheduleChange(s.id)
      .then((n) => toast(`נשלח מייל ל-${n} נרשמים`, "ok"))
      .catch(() => toast("שליחת המייל נכשלה", "err"));
  } else if (how === "feed") {
    const type = classTypeOf(s, data);
    try {
      await upsertAnnouncement({
        id: newAnnouncementId(),
        userIds: registered,
        title: `עדכון מועד: ${type.name}`,
        body: `השיעור עודכן ועבר ל-${newDateKey} בשעה ${fmtTime(newStartMin)}. נתראה!`,
        tone: "important",
        createdAt: Date.now(),
      });
      toast("הודעה פורסמה בעמוד הבית של הנרשמים", "ok");
    } catch {
      toast("פרסום ההודעה נכשל", "err");
    }
  }
  // "none" → silently moved, no update.
}
