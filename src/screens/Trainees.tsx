import { useState } from "react";
import { t } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Members } from "../components/Members";
import { Coaching } from "../components/Coaching";

/** מתאמנים pillar: the trainee directory + pending approvals (Members) and the
 *  monthly 1-on-1 accompaniment (ליווי), for managers. */
export function Trainees() {
  const data = useStore((s) => s);
  const me = data.users.find((u) => u.id === data.currentUserId);
  const canFinance = me?.role === "admin" || me?.role === "manager";
  const [tab, setTab] = useState<"directory" | "coaching">("directory");
  const active = canFinance ? tab : "directory";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">{t.nav.trainees}</h1>
          <div className="sub">{data.locations[0]?.name}</div>
        </div>
      </div>

      {canFinance && (
        <div className="seg" style={{ marginBottom: 18 }}>
          <button className={active === "directory" ? "on" : ""} onClick={() => setTab("directory")}>
            {t.trainees.directory}
          </button>
          <button className={active === "coaching" ? "on" : ""} onClick={() => setTab("coaching")}>
            {t.coaching.tab}
          </button>
        </div>
      )}

      {active === "coaching" ? <Coaching /> : <Members />}
    </div>
  );
}
