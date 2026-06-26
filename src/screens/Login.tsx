import { t } from "../lib/i18n";
import { setCurrentUser, useStore } from "../lib/store";
import { Avatar, VersionTag } from "../components/common";
import { Toaster, toast } from "../components/Toast";
import { IcBolt, IcChevL, IcChevR } from "../components/icons";

// Sign-in picker. Real auth (plan.md §4.1) is phone + SMS OTP; for the demo we
// let the visitor pick a seeded user to sign in as. Rendered by <App /> in the
// logged-out state, so the rest of the app never sees a null session. `onBack`
// returns to the marketing landing page.
export function Login({ onBack }: { onBack?: () => void }) {
  const users = useStore((s) => s.users);
  const order = { manager: 0, admin: 1, instructor: 2, member: 3 } as const;
  const sorted = [...users].sort((a, b) => order[a.role] - order[b.role]);

  return (
    <div className="login-screen">
      <div className="login-card">
        {onBack && (
          <button className="login-back" onClick={onBack}>
            <IcChevR width={16} height={16} />
            {t.back}
          </button>
        )}
        <span className="login-logo">
          <IcBolt width={30} height={30} style={{ color: "var(--ink-900)" }} />
        </span>
        <h1>{t.loginTitle}</h1>
        <p className="login-sub">{t.loginSubtitle}</p>

        <div className="login-users">
          {sorted.map((u) => (
            <button
              key={u.id}
              className="login-user"
              onClick={() => {
                setCurrentUser(u.id);
                toast(`${t.loginAs} ${u.name}`, "ok");
              }}
            >
              <Avatar user={u} size={40} />
              <span className="lu-name">
                {u.name}
                <small>{t.roles[u.role]}</small>
              </span>
              <IcChevL width={18} height={18} style={{ opacity: 0.5 }} />
            </button>
          ))}
        </div>

        <p className="login-note">{t.loginDemoNote}</p>
        <VersionTag className="login-version" />
      </div>
      <Toaster />
    </div>
  );
}
