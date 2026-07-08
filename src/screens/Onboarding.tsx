import { useState } from "react";
import { t } from "../lib/i18n";
import { updateUser } from "../lib/store";
import { isValidILPhone } from "../lib/validate";
import { CityPicker, isValidCity } from "../components/CityPicker";
import { VersionTag } from "../components/common";
import { OmixMark } from "../components/Brand";
import { Toaster, toast } from "../components/Toast";
import { IcCheck } from "../components/icons";
import type { Gender, HealthForm as HF, User } from "../lib/types";

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

const QS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7"] as const;
type QKey = (typeof QS)[number];

async function signOut() {
  const { signOutUser } = await import("../lib/firebase");
  await signOutUser();
}

// Post-registration gate. A fresh sign-up first signs the health declaration +
// terms, then waits here until staff approves (the live Firestore listener flips
// this to the app the moment approval lands). Rendered by <App /> when the
// current user is pending/rejected.
export function Onboarding({ user }: { user: User }) {
  if (user.approvalStatus === "rejected") return <Rejected />;
  if (!user.healthForm) return <HealthDeclaration user={user} />;
  return <Pending />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="onboard">
      <div className="onboard-card">
        <span className="brand-emblem">
          <OmixMark size={52} />
        </span>
        {children}
        <button className="link-btn onboard-signout" onClick={signOut}>
          {t.signOut}
        </button>
        <VersionTag className="login-version" />
      </div>
      <Toaster />
    </div>
  );
}

function Pending() {
  return (
    <Shell>
      <span className="onboard-badge">{t.pending.badge}</span>
      <h1>{t.pending.title}</h1>
      <p className="login-sub">{t.pending.body(t.appName)}</p>
      <p className="login-note">{t.pending.hint}</p>
    </Shell>
  );
}

function Rejected() {
  return (
    <Shell>
      <h1>{t.rejected.title}</h1>
      <p className="login-sub">{t.rejected.body}</p>
    </Shell>
  );
}

// Shown to a fresh, not-yet-approved member until they click the verification
// link Firebase e-mailed them — so a made-up address can't reach the app.
export function VerifyEmail({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const { refreshEmailVerified } = await import("../lib/firebase");
      if (await refreshEmailVerified()) {
        toast(t.verify.done, "ok");
        onVerified();
      } else {
        toast(t.verify.notYet, "info");
      }
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    try {
      const { resendVerification } = await import("../lib/firebase");
      await resendVerification();
      toast(t.verify.resent, "ok");
    } catch {
      toast(t.verify.resendErr, "err");
    }
  }
  return (
    <Shell>
      <span className="onboard-badge">{t.verify.badge}</span>
      <h1>{t.verify.title}</h1>
      <p className="login-sub">{t.verify.body(email)}</p>
      <p className="login-note">{t.verify.hint}</p>
      <button className="btn btn-lime" style={{ marginTop: 16, width: "100%" }} onClick={check} disabled={busy}>
        {busy ? t.verify.checking : t.verify.cta}
      </button>
      <button className="link-btn" style={{ marginTop: 10 }} onClick={resend}>
        {t.verify.resend}
      </button>
      <p className="login-note" style={{ marginTop: 14 }}>
        {t.support.prompt}{" "}
        <a href={`mailto:${t.support.email}`}>{t.support.email}</a>
      </p>
    </Shell>
  );
}

function HealthDeclaration({ user }: { user: User }) {
  const H = t.health;
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [gender, setGender] = useState<Gender | "">("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState(user.phone || "");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [ans, setAns] = useState<Partial<Record<QKey, boolean>>>({});
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);

  const flagged = QS.some((q) => ans[q] === true);
  const allAnswered = QS.every((q) => ans[q] !== undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!firstName.trim() || !lastName.trim() || !gender || !age || !phone.trim() || !city || !address.trim())
      return toast(H.needDetails, "err");
    if (!isValidILPhone(phone)) return toast(H.invalidPhone, "err");
    if (!isValidCity(city)) return toast(H.invalidCity, "err");
    if (!allAnswered) return toast(H.qIntro, "err");
    if (!terms) return toast(H.needTerms, "err");
    if (!signed) return toast(H.needSign, "err");
    setBusy(true);
    const form: HF = {
      q1: !!ans.q1, q2: !!ans.q2, q3: !!ans.q3, q4: !!ans.q4,
      q5: !!ans.q5, q6: !!ans.q6, q7: !!ans.q7,
      notes: notes.trim(),
      termsAccepted: true,
      signedName: fullName,
      submittedAt: Date.now(),
    };
    try {
      // Save the full registration in one write; healthForm present →
      // <App /> re-renders this to <Pending /> (awaiting approval).
      await updateUser(user.id, {
        name: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        initials: initialsOf(fullName),
        phone: phone.trim(),
        gender: gender as Gender,
        age: Number(age) || undefined,
        address: `${address.trim()}, ${city}`,
        healthForm: form,
      });
      toast(H.sentToast, "ok");
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="onboard onboard-form">
      <div className="onboard-card onboard-wide">
        <span className="brand-emblem">
          <OmixMark size={52} />
        </span>
        <h1>{H.title}</h1>
        <p className="login-sub">{H.subtitle}</p>

        <form onSubmit={submit}>
          <h2 className="onboard-h2">{H.sectionDetails}</h2>
          <div className="row gap-3 wrap">
            <div className="field grow" style={{ minWidth: 130 }}>
              <label htmlFor="rg-first">{H.firstNameLabel}</label>
              <input id="rg-first" className="input" value={firstName} onChange={(e) => { setFirstName(e.target.value); setSigned(false); }} autoComplete="given-name" required />
            </div>
            <div className="field grow" style={{ minWidth: 130 }}>
              <label htmlFor="rg-last">{H.lastNameLabel}</label>
              <input id="rg-last" className="input" value={lastName} onChange={(e) => { setLastName(e.target.value); setSigned(false); }} autoComplete="family-name" required />
            </div>
          </div>
          <div className="row gap-3 wrap">
            <div className="field grow" style={{ minWidth: 130 }}>
              <label htmlFor="rg-gender">{H.genderLabel}</label>
              <select id="rg-gender" className="select" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="">{H.selectGender}</option>
                <option value="female">{H.genders.female}</option>
                <option value="male">{H.genders.male}</option>
                <option value="other">{H.genders.other}</option>
              </select>
            </div>
            <div className="field grow" style={{ minWidth: 90 }}>
              <label htmlFor="rg-age">{H.ageLabel}</label>
              <input id="rg-age" className="input" type="number" min={1} max={120} value={age} onChange={(e) => setAge(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="rg-phone">{H.phoneLabel}</label>
            <input id="rg-phone" className="input" type="tel" inputMode="tel" dir="ltr" maxLength={15}
              placeholder="050-1234567" value={phone}
              onChange={(e) => setPhone(e.target.value)} autoComplete="tel"
              aria-invalid={phone.length > 0 && !isValidILPhone(phone)} />
            {phone.length > 0 && !isValidILPhone(phone) && (
              <small className="field-err">{H.invalidPhone}</small>
            )}
          </div>
          <div className="row gap-3 wrap">
            <div className="field grow" style={{ minWidth: 140 }}>
              <label htmlFor="rg-city">{H.cityLabel}</label>
              <CityPicker id="rg-city" value={city} onChange={setCity} />
            </div>
            <div className="field grow" style={{ minWidth: 140 }}>
              <label htmlFor="rg-address">{H.streetLabel}</label>
              <input id="rg-address" className="input" value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="רחוב ומספר" />
            </div>
          </div>

          <h2 className="onboard-h2">{H.sectionQ}</h2>
          <p className="onboard-qintro">{H.qIntro}</p>
          <div className="health-qs">
            {QS.map((q) => (
              <div className="health-q" key={q}>
                <span className="hq-text">{H[q]}</span>
                <div className="hq-toggle" role="group">
                  <button
                    type="button"
                    className={ans[q] === true ? "on yes" : ""}
                    aria-pressed={ans[q] === true}
                    onClick={() => setAns((a) => ({ ...a, [q]: true }))}
                  >
                    {H.yes}
                  </button>
                  <button
                    type="button"
                    className={ans[q] === false ? "on no" : ""}
                    aria-pressed={ans[q] === false}
                    onClick={() => setAns((a) => ({ ...a, [q]: false }))}
                  >
                    {H.no}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {flagged && <p className="health-flag" role="alert">{H.flagged}</p>}

          <div className="field">
            <label htmlFor="hf-notes">{H.notesLabel}</label>
            <textarea
              id="hf-notes"
              className="input"
              rows={2}
              placeholder={H.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <h2 className="onboard-h2">{H.sectionTerms}</h2>
          <p className="health-terms">{H.termsText}</p>
          <label className="health-check">
            <input
              type="checkbox"
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            <span className="hc-box" aria-hidden="true">
              {terms && <IcCheck width={15} height={15} />}
            </span>
            <span>{H.termsCheckbox}</span>
          </label>

          <div className="field">
            <label>{H.signLabel}</label>
            {fullName ? (
              <div className={`signature-panel ${signed ? "signed" : ""}`}>
                <span className="signature-name">{fullName}</span>
                {signed ? (
                  <span className="signature-done">✓ {H.signConfirmed}</span>
                ) : (
                  <button type="button" className="btn btn-ink btn-sm" onClick={() => setSigned(true)}>
                    {H.signConfirm}
                  </button>
                )}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: ".85rem" }}>{H.signNeedName}</p>
            )}
          </div>

          <button type="submit" className="btn btn-lime btn-block btn-lg" disabled={busy}>
            {busy ? H.submitting : H.submit}
          </button>
        </form>

        <button className="link-btn onboard-signout" onClick={signOut}>
          {t.signOut}
        </button>
      </div>
      <Toaster />
    </div>
  );
}
