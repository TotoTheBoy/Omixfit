import { useState } from "react";
import { t } from "../lib/i18n";
import { updateUser } from "../lib/store";
import { isValidILPhone, isValidIsraeliID } from "../lib/validate";
import { CityPicker, isValidCity } from "../components/CityPicker";
import { VersionTag } from "../components/common";
import { OmixMark } from "../components/Brand";
import { Toaster, toast } from "../components/Toast";
import { IcCheck } from "../components/icons";
import { HEALTH_GROUPS, HEALTH_KEYS, type HealthQKey } from "../lib/health";
import type { Gender, HealthAnswers, HealthForm as HF, User } from "../lib/types";

function initialsOf(name: string): string {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Read a File to a base64 data URL (to hand a certificate to the email fn). */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Age in whole years from a YYYY-MM-DD date of birth. */
function ageFromDob(dob: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return undefined;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : undefined;
}

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
      <div className="verify-actions">
        <button className="btn btn-lime btn-lg btn-block" onClick={check} disabled={busy}>
          {busy ? t.verify.checking : t.verify.cta}
        </button>
        <button className="btn btn-ghost btn-block" onClick={resend} disabled={busy}>
          ✉️ {t.verify.resend}
        </button>
      </div>
      <p className="login-note" style={{ marginTop: 16 }}>
        {t.support.prompt}{" "}
        <a href={`mailto:${t.support.email}`}>{t.support.email}</a>
      </p>
    </Shell>
  );
}

function HealthDeclaration({ user }: { user: User }) {
  const H = t.health;
  // Prefill everything already known (fill-once) — address is stored "street, city".
  const savedAddr = user.address ?? "";
  const savedCity = savedAddr.includes(",") ? savedAddr.split(",").pop()!.trim() : "";
  const savedStreet = savedAddr.includes(",") ? savedAddr.slice(0, savedAddr.lastIndexOf(",")).trim() : savedAddr;
  const [firstName, setFirstName] = useState(user.firstName ?? "");
  const [lastName, setLastName] = useState(user.lastName ?? "");
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
  const [idNumber, setIdNumber] = useState(user.idNumber ?? "");
  const [gender, setGender] = useState<Gender | "">(user.gender ?? "");
  const [dob, setDob] = useState(user.dob ?? "");
  const age = ageFromDob(dob);
  const [phone, setPhone] = useState(user.phone || "");
  const [city, setCity] = useState(savedCity);
  const [street, setStreet] = useState(savedStreet);
  const [houseNum, setHouseNum] = useState("");
  const [ans, setAns] = useState<Partial<Record<HealthQKey, boolean>>>({});
  const [notes, setNotes] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [terms, setTerms] = useState(false);
  const [signed, setSigned] = useState(false);
  const [busy, setBusy] = useState(false);

  const flagged = HEALTH_KEYS.some((k) => ans[k] === true);
  const allAnswered = HEALTH_KEYS.every((k) => ans[k] !== undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!firstName.trim() || !lastName.trim() || !idNumber.trim() || !gender || !dob || !phone.trim() || !city || !street.trim())
      return toast(H.needDetails, "err");
    if (!isValidIsraeliID(idNumber)) return toast(H.invalidId, "err");
    if (!isValidILPhone(phone)) return toast(H.invalidPhone, "err");
    if (!isValidCity(city)) return toast(H.invalidCity, "err");
    if (!allAnswered) return toast(H.qIntro, "err");
    if (!terms) return toast(H.needTerms, "err");
    if (!signed) return toast(H.needSign, "err");
    setBusy(true);
    const answers = Object.fromEntries(HEALTH_KEYS.map((k) => [k, !!ans[k]])) as HealthAnswers;
    const form: HF = {
      ...answers,
      notes: notes.trim(),
      termsAccepted: true,
      signedName: fullName,
      submittedAt: Date.now(),
      ...(certFile ? { hasMedicalCert: true, medicalCertName: certFile.name } : {}),
    };
    const address = `${street.trim()}${houseNum.trim() ? ` ${houseNum.trim()}` : ""}, ${city}`;
    try {
      // Save the full registration in one write; healthForm present →
      // <App /> re-renders this to <Pending /> (awaiting approval).
      const patch: Partial<User> = {
        name: fullName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        initials: initialsOf(fullName),
        idNumber: idNumber.trim(),
        phone: phone.trim(),
        gender: gender as Gender,
        dob,
        address,
        healthForm: form,
      };
      if (age !== undefined) patch.age = age;
      await updateUser(user.id, patch);
      // Notify Omer with the PDF + smart summary (and the certificate if attached).
      const { notifyHealthSubmission } = await import("../lib/store");
      const certData = certFile ? await fileToDataUrl(certFile) : undefined;
      void notifyHealthSubmission(user.id, certData, certFile?.name).catch(() => {});
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
              <label htmlFor="rg-id">{H.idLabel}</label>
              <input id="rg-id" className="input" inputMode="numeric" dir="ltr" maxLength={9} value={idNumber}
                onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ""))}
                aria-invalid={idNumber.length > 0 && !isValidIsraeliID(idNumber)} required />
              {idNumber.length > 0 && !isValidIsraeliID(idNumber) && (
                <small className="field-err">{H.invalidId}</small>
              )}
            </div>
            <div className="field grow" style={{ minWidth: 130 }}>
              <label htmlFor="rg-gender">{H.genderLabel}</label>
              <select id="rg-gender" className="select" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
                <option value="">{H.selectGender}</option>
                <option value="female">{H.genders.female}</option>
                <option value="male">{H.genders.male}</option>
                <option value="other">{H.genders.other}</option>
              </select>
            </div>
          </div>
          <div className="row gap-3 wrap">
            <div className="field grow" style={{ minWidth: 150 }}>
              <label htmlFor="rg-dob">{H.dobLabel}</label>
              <input id="rg-dob" className="input" type="date" dir="ltr" value={dob} onChange={(e) => setDob(e.target.value)} required />
            </div>
            <div className="field" style={{ minWidth: 90, maxWidth: 120 }}>
              <label htmlFor="rg-age">{H.ageLabel}</label>
              <input id="rg-age" className="input" value={age !== undefined ? String(age) : ""} readOnly disabled placeholder="—" />
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
            <div className="field grow" style={{ minWidth: 130 }}>
              <label htmlFor="rg-city">{H.cityLabel}</label>
              <CityPicker id="rg-city" value={city} onChange={setCity} />
            </div>
            <div className="field grow" style={{ minWidth: 120 }}>
              <label htmlFor="rg-street">{H.streetLabel}</label>
              <input id="rg-street" className="input" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" />
            </div>
            <div className="field" style={{ minWidth: 78, maxWidth: 100 }}>
              <label htmlFor="rg-house">{H.houseLabel}</label>
              <input id="rg-house" className="input" inputMode="numeric" value={houseNum} onChange={(e) => setHouseNum(e.target.value)} />
            </div>
          </div>

          <h2 className="onboard-h2">{H.sectionQ}</h2>
          <p className="onboard-qintro">{H.qIntro}</p>
          <div className="health-groups">
            {HEALTH_GROUPS.map((g) => {
              const single = g.items.length === 1;
              return (
                <div className="health-group" key={g.heading}>
                  {!single && <p className="hg-heading">{g.heading}</p>}
                  {g.items.map((it) => (
                    <div className="health-q" key={it.key}>
                      <span className="hq-text">
                        {single ? g.heading : it.label}
                        {it.hint && <small className="hq-hint">{it.hint}</small>}
                      </span>
                      <div className="hq-toggle" role="group" aria-label={single ? g.heading : it.label}>
                        <button
                          type="button"
                          className={ans[it.key] === true ? "on yes" : ""}
                          aria-pressed={ans[it.key] === true}
                          onClick={() => setAns((a) => ({ ...a, [it.key]: true }))}
                        >
                          {H.yes}
                        </button>
                        <button
                          type="button"
                          className={ans[it.key] === false ? "on no" : ""}
                          aria-pressed={ans[it.key] === false}
                          onClick={() => setAns((a) => ({ ...a, [it.key]: false }))}
                        >
                          {H.no}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {flagged && (
            <div className="health-flag" role="alert">
              <p>{H.flagged}</p>
              <label htmlFor="rg-cert" className="cert-upload">
                <span>📎 {certFile ? certFile.name : H.certUpload}</span>
                <input
                  id="rg-cert"
                  type="file"
                  accept="image/*,application/pdf"
                  hidden
                  onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <small className="cert-later">{H.certLater}</small>
            </div>
          )}

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
