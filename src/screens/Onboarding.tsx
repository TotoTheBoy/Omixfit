import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { updateUser } from "../lib/store";
import { isValidILPhone, isValidIsraeliID } from "../lib/validate";
import { CityPicker, isValidCity } from "../components/CityPicker";
import { VersionTag } from "../components/common";
import { Legal } from "../components/Legal";
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
// link Firebase e-mailed them - so a made-up address can't reach the app.
export function VerifyEmail({ email, onVerified }: { email: string; onVerified: () => void }) {
  const [busy, setBusy] = useState(false);
  const doneRef = useRef(false);

  // Reload the auth token and, if the address is now verified, advance. `silent`
  // is used by the auto-checks (mount / window-focus / poll) so they don't spam
  // "not yet" toasts or the button spinner - only the explicit button does.
  async function check(silent = false) {
    if (doneRef.current) return true;
    if (!silent) setBusy(true);
    try {
      const { refreshEmailVerified } = await import("../lib/firebase");
      if (await refreshEmailVerified()) {
        doneRef.current = true;
        toast(t.verify.done, "ok");
        onVerified();
        return true;
      }
      if (!silent) toast(t.verify.notYet, "info");
      return false;
    } catch {
      if (!silent) toast(t.verify.notYet, "info");
      return false;
    } finally {
      if (!silent) setBusy(false);
    }
  }

  // Clicking the link in the e-mail verifies server-side and redirects back to
  // the app, but the session's cached token still says unverified. So we detect
  // it ourselves: once on mount, whenever the tab regains focus (they return
  // from their mail app), and a light poll as a fallback. Any of these advances
  // the flow automatically - no manual tap needed.
  useEffect(() => {
    check(true);
    const onFocus = () => check(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    const id = window.setInterval(() => check(true), 3000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function resend() {
    try {
      // Branded resend from office@ (not Firebase's default noreply → spam).
      const { sendMyVerificationEmail } = await import("../lib/store");
      await sendMyVerificationEmail();
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
      <p className="login-note verify-waiting">{t.verify.waiting}</p>
      <p className="login-note">{t.verify.hint}</p>
      <div className="verify-actions">
        <button className="btn btn-lime btn-lg btn-block" onClick={() => check(false)} disabled={busy}>
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

export function HealthDeclaration({ user }: { user: User }) {
  const H = t.health;
  // Prefill everything already known (fill-once) - address is stored "street, city".
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
  // Click-wrap: three SEPARATE required consents (un-pre-ticked) + optional marketing.
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeWaiver, setAgreeWaiver] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [legalDoc, setLegalDoc] = useState<string | null>(null);
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
    if (!agreeTerms || !agreePrivacy || !agreeWaiver) return toast(H.needConsent, "err");
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
        marketingConsent: agreeMarketing,
      };
      if (age !== undefined) patch.age = age;
      await updateUser(user.id, patch);
      // Server stamps the declaration date + medical-clearance gate from the ACTUAL
      // saved form (the member can't self-set these fields → can't bypass the lock).
      try {
        const { finalizeHealthDeclaration } = await import("../lib/store");
        await finalizeHealthDeclaration();
      } catch { /* setApproval also stamps these at approval time */ }
      // Click-wrap evidence: server-stamped timestamp + IP + doc version + which
      // boxes were ticked. Best-effort - never block the registration on it.
      void (async () => {
        try {
          const { recordConsent } = await import("../lib/store");
          const { LEGAL_VERSION } = await import("../lib/legal");
          await recordConsent({
            version: LEGAL_VERSION,
            terms: agreeTerms,
            privacy: agreePrivacy,
            waiver: agreeWaiver,
            marketing: agreeMarketing,
          });
        } catch { /* best-effort */ }
      })();
      toast(H.sentToast, "ok");
      // Background, best-effort: render the declaration PDF in the browser (perfect
      // Hebrew) and e-mail Omer the PDF + smart summary (+ certificate if attached).
      void (async () => {
        try {
          const merged = { ...user, ...patch } as User;
          const [{ buildHealthPdfDataUrl }, { notifyHealthSubmission }] = await Promise.all([
            import("../lib/healthPdf"),
            import("../lib/store"),
          ]);
          const pdfDataUrl = await buildHealthPdfDataUrl(merged, form).catch(() => undefined);
          const certData = certFile ? await fileToDataUrl(certFile) : undefined;
          await notifyHealthSubmission(user.id, pdfDataUrl, certData, certFile?.name);
        } catch { /* best-effort */ }
      })();
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
              <input id="rg-age" className="input" value={age !== undefined ? String(age) : ""} readOnly disabled placeholder="-" />
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
            <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
            <span className="hc-box" aria-hidden="true">{agreeTerms && <IcCheck width={15} height={15} />}</span>
            <span>
              {H.consentTermsPre}
              <button type="button" className="legal-link" onClick={() => setLegalDoc("terms")}>{H.consentTermsLink}</button>
            </span>
          </label>
          <label className="health-check">
            <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
            <span className="hc-box" aria-hidden="true">{agreePrivacy && <IcCheck width={15} height={15} />}</span>
            <span>
              {H.consentPrivacyPre}
              <button type="button" className="legal-link" onClick={() => setLegalDoc("privacy")}>{H.consentPrivacyLink}</button>
            </span>
          </label>
          <label className="health-check">
            <input type="checkbox" checked={agreeWaiver} onChange={(e) => setAgreeWaiver(e.target.checked)} />
            <span className="hc-box" aria-hidden="true">{agreeWaiver && <IcCheck width={15} height={15} />}</span>
            <span>
              {H.consentWaiverPre}
              <button type="button" className="legal-link" onClick={() => setLegalDoc("waiver")}>{H.consentWaiverLink}</button>
            </span>
          </label>
          <label className="health-check health-check-optional">
            <input type="checkbox" checked={agreeMarketing} onChange={(e) => setAgreeMarketing(e.target.checked)} />
            <span className="hc-box" aria-hidden="true">{agreeMarketing && <IcCheck width={15} height={15} />}</span>
            <span>{H.consentMarketing}</span>
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
      {legalDoc && <Legal onClose={() => setLegalDoc(null)} defaultSlug={legalDoc} />}
      <Toaster />
    </div>
  );
}
