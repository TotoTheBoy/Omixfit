import { useState } from "react";
import { t } from "../lib/i18n";
import { firebaseConfigured } from "../lib/firebaseConfig";
import { VersionTag } from "../components/common";
import { Toaster, toast } from "../components/Toast";
import { IcBolt } from "../components/icons";

type Mode = "signin" | "signup";

// Logged-out landing. Real email + password auth via Firebase (plan.md §4.1).
// On success the auth listener in <App /> resolves the session and swaps in the
// app shell, so this screen never has to set the current user itself.
export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !firebaseConfigured) return;
    setBusy(true);
    // Code-split: pull the firebase SDK in only when the user actually submits.
    const { signIn, signUp, authErrorMessage } = await import("../lib/firebase");
    try {
      if (isSignup) await signUp(email, password, name);
      else await signIn(email, password);
      // Success → <App />'s auth listener takes it from here.
    } catch (err) {
      toast(authErrorMessage(err), "err");
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <span className="login-logo">
          <IcBolt width={30} height={30} style={{ color: "var(--ink-900)" }} />
        </span>
        <h1>{t.loginTitle}</h1>
        <p className="login-sub">{t.loginSubtitle}</p>

        {!firebaseConfigured && (
          <p className="login-error" role="alert">
            {t.authNotConfigured}
          </p>
        )}

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
              minLength={6}
            />
          </div>
          <button
            type="submit"
            className="btn btn-lime btn-block btn-lg"
            disabled={busy || !firebaseConfigured}
          >
            {busy ? t.authWorking : isSignup ? t.signUpCta : t.signInCta}
          </button>
        </form>

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
        <VersionTag className="login-version" />
      </div>
      <Toaster />
    </div>
  );
}
