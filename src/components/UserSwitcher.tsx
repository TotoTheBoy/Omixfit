import { t } from "../lib/i18n";
import { resetData, useStore } from "../lib/store";
import { Sheet } from "./Sheet";
import { Avatar, VersionTag } from "./common";
import { toast } from "./Toast";

// Account sheet. With real Firebase auth there's no user-switching — to see a
// different role you sign out and sign in with that account. Kept the same
// entry point (the app-bar avatar) so the rest of the app is unchanged.
export function UserSwitcher({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.users.find((u) => u.id === s.currentUserId));
  if (!me) return null;

  async function onSignOut() {
    onClose();
    const { signOutUser } = await import("../lib/firebase");
    await signOutUser(); // auth listener clears the session → Login screen
    toast(t.loggedOutToast, "info");
  }

  return (
    <Sheet title={t.account} onClose={onClose}>
      <div className="account-id">
        <Avatar user={me} size={52} />
        <div className="account-meta">
          <strong>{me.name}</strong>
          <span className="chip account-role">{t.roles[me.role]}</span>
          {me.email && <small dir="ltr">{me.email}</small>}
        </div>
      </div>

      <div className="divider" />
      <div className="row gap-3 wrap">
        <button className="btn btn-danger btn-sm" onClick={onSignOut}>
          {t.signOut}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            resetData();
            toast("הנתונים אופסו", "info");
            onClose();
          }}
        >
          איפוס נתוני הדגמה
        </button>
      </div>
      <VersionTag className="switcher-version" />
    </Sheet>
  );
}
