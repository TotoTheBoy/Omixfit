import { useState } from "react";
import { t } from "../lib/i18n";
import { firebaseConfigured } from "../lib/firebaseConfig";
import { VersionTag } from "../components/common";
import { OmixMark } from "../components/Brand";
import { Toaster, toast } from "../components/Toast";
import { IcChevR } from "../components/icons";

type Mode = "signin" | "signup" | "reset";

// Email/password sign-in (Firebase). Rendered by <App /> in the logged-out state
// after the marketing landing page; `onBack` returns to it. On success the auth
// listener in <App /> resolves the session and swaps in the app shell.
export function Login({ onBack }: { onBack?: () => void }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";
  const isReset = mode === "reset";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !firebaseConfigured) return;
    setBusy(true);
    // Code-split: pull the firebase SDK in only when the user actually submits.
    const { signIn, signUp, resetPassword, authErrorMessage } = await import("../lib/firebase");
    try {
      if (isReset) {
        await resetPassword(email);
        toast(t.resetSent, "ok");
        setMode("signin");
        setBusy(false);
        return;
      }
      if (isSignup) await signUp(email, password, name);
      else await signIn(email, password);
      // Success → <App />'s auth listener takes it from here.
    } catch (err) {
      // Never reveal whether an email is registered on password reset.
      if (isReset && String((err as { code?: unknown })?.code) === "auth/user-not-found") {
        toast(t.resetSent, "ok");
        setMode("signin");
      } else {
        toast(authErrorMessage(err), "err");
      }
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        {onBack && (
          <button className="login-back" onClick={onBack}>
            <IcChevR width={16} height={16} />
            {t.back}
          </button>
        )}
        <span className="brand-emblem">
          <OmixMark size={56} />
        </span>
        <h1>{isReset ? t.resetTitle : t.loginTitle}</h1>
        <p className="login-sub">{isReset ? t.resetSub : t.loginSubtitle}</p>

        {!firebaseConfigured && (
          <p className="login-error" role="alert">
            {t.authNotConfigured}
          </p>
        )}

        {!isReset && (
          <div className="auth-tabs" role="tablist" aria-label={t.loginTitle}>
            <button
              type="button"
              role="tab"
              aria-selected={!isSignup}
              className={!isSignup ? "active" : ""}
              onClick={() => setMode("signin")}
            >
              {t.signInTab}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignup}
              className={isSignup ? "active" : ""}
              onClick={() => setMode("signup")}
            >
              {t.signUpTab}
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={onSubmit}>
          {isSignup && (
            <div className="field">
              <label htmlFor="auth-name">{t.nameLabel}</label>
              <input
                id="auth-name"
                className="input"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="auth-email">{t.emailLabel}</label>
            <input
              id="auth-email"
              className="input"
              type="email"
              inputMode="email"
              dir="ltr"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          {!isReset && (
            <div className="field">
              <label htmlFor="auth-password">{t.passwordLabel}</label>
              <input
                id="auth-password"
                className="input"
                type="password"
                dir="ltr"
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isSignup ? 8 : 6}
              />
            </div>
          )}
          <button
            type="submit"
            className="btn btn-lime btn-block btn-lg"
            disabled={busy || !firebaseConfigured}
          >
            {busy ? t.authWorking : isReset ? t.resetCta : isSignup ? t.signUpCta : t.signInCta}
          </button>
        </form>

        {isReset ? (
          <p className="login-note">
            <button type="button" className="link-btn" onClick={() => setMode("signin")}>
              ← {t.backToSignIn}
            </button>
          </p>
        ) : (
          <>
            {!isSignup && (
              <p className="login-note">
                <button type="button" className="link-btn" onClick={() => setMode("reset")}>
                  {t.forgotPassword}
                </button>
              </p>
            )}
            <p className="login-note">
              {isSignup ? t.haveAccountPrompt : t.noAccountPrompt}{" "}
              <button
                type="button"
                className="link-btn"
                onClick={() => setMode(isSignup ? "signin" : "signup")}
              >
                {isSignup ? t.signInTab : t.signUpTab}
              </button>
            </p>
            {!isSignup && <p className="login-note login-demo">{t.loginDemoNote}</p>}
          </>
        )}
        <VersionTag className="login-version" />
      </div>
      <Toaster />
    </div>
  );
}
