// ---------------------------------------------------------------------------
// Client-side health-declaration PDF. Built from a styled HTML table rendered by
// the real browser (perfect Hebrew / RTL / spacing) → html2canvas → jsPDF. The
// data URL is handed to the notify function, which just attaches it to Omer's
// e-mail. (Server-side pdfkit couldn't render Hebrew reliably.)
// ---------------------------------------------------------------------------
import { HEALTH_GROUPS } from "./health";
import type { HealthForm, User } from "./types";

const GENDER: Record<string, string> = { female: "אישה", male: "גבר", other: "אחר" };

function esc(s: unknown): string {
  return String(s == null || s === "" ? "—" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function detailRows(user: User): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "";
  const rows: [string, unknown][] = [
    ["שם מלא", name],
    ["תעודת זהות", user.idNumber],
    ["תאריך לידה", user.dob],
    ["גיל", user.age != null ? user.age : ""],
    ["מין", GENDER[user.gender ?? ""] ?? ""],
    ["טלפון", user.phone],
    ["אימייל", user.email],
    ["כתובת", user.address],
  ];
  return rows
    .map(([k, v], i) => `<tr style="background:${i % 2 ? "#faf7f0" : "#fff"}">
      <td style="padding:5px 11px;border:1px solid #e6dcc4;color:#6b5d47;width:38%">${esc(k)}</td>
      <td style="padding:5px 11px;border:1px solid #e6dcc4;color:#241c12;font-weight:600">${esc(v)}</td></tr>`)
    .join("");
}

function medicalRows(form: HealthForm): string {
  const items = HEALTH_GROUPS.flatMap((g) => g.items);
  return items
    .map((it, i) => {
      const yes = (form as unknown as Record<string, boolean>)[it.key] === true;
      const bg = yes ? "#fbe9e7" : i % 2 ? "#faf7f0" : "#fff";
      const col = yes ? "#b0402f" : "#241c12";
      return `<tr style="background:${bg}">
        <td style="padding:4px 11px;border:1px solid #e6dcc4;color:${col};width:78%">${esc(it.label)}</td>
        <td style="padding:4px 11px;border:1px solid #e6dcc4;color:${col};font-weight:800;text-align:center">${yes ? "כן" : "לא"}</td></tr>`;
    })
    .join("");
}

function summaryBlock(form: HealthForm): string {
  const items = HEALTH_GROUPS.flatMap((g) => g.items);
  const flagged = items.filter((it) => (form as unknown as Record<string, boolean>)[it.key] === true);
  const ok = flagged.length === 0;
  const border = ok ? "#2f6b3b" : "#b0402f";
  const bg = ok ? "#eef5ef" : "#fbe9e7";
  const head = ok ? "✓ תקין לחלוטין — אין דגלים רפואיים" : `⚠️ לתשומת לב — סומן ‏"כן"‏ ל-${flagged.length} סעיפים`;
  const body = ok
    ? "המתאמן/ת ענה/תה ‏\"לא\"‏ על כל שאלות השאלון. אין צורך בתעודה רפואית לפי ההצהרה."
    : `סומן ‏"כן"‏ ל: ${flagged.map((f) => f.label).join(" · ")}.<br>לפי תקנות מכוני כושר נדרשת תעודה רפואית מרופא לפני תחילת האימונים. ${
        form.hasMedicalCert ? "צורפה תעודה רפואית (מצורפת למייל)." : "טרם צורפה תעודה — יש לוודא שתומצא."
      }`;
  return `<div style="margin:4px 0 0;padding:10px 14px;border-radius:9px;background:${bg};border-inline-start:5px solid ${border}">
    <div style="font-weight:800;color:${border};font-size:14px;margin-bottom:3px">${head}</div>
    <div style="color:#241c12;font-size:12.5px;line-height:1.5">${body}</div></div>`;
}

function buildHtml(user: User, form: HealthForm): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || "";
  const when = new Date(form.submittedAt || Date.now()).toLocaleDateString("he-IL");
  const H2 = 'style="color:#a9842f;font-size:14px;font-weight:800;margin:12px 0 5px"';
  const TBL = 'style="width:100%;border-collapse:collapse;font-size:12px"';
  return `<div style="font-family:Rubik,Arial,sans-serif;color:#241c12;padding:16px 22px 18px">
    <div style="background:#1a1a1a;border-radius:11px;padding:11px 18px;margin-bottom:4px">
      <div style="color:#c5a059;font-size:19px;font-weight:800">הצהרת בריאות · Omix</div>
      <div style="color:#c2b591;font-size:10.5px;margin-top:2px">טופס הצהרת בריאות למבקש/ת להתאמן — תקנות מכוני כושר 2015</div>
    </div>
    <div ${H2}>פרטים אישיים</div>
    <table ${TBL}>${detailRows(user)}</table>
    <div ${H2}>שאלון רפואי</div>
    <table ${TBL}>${medicalRows(form)}</table>
    <div ${H2}>סיכום</div>
    ${summaryBlock(form)}
    ${form.notes ? `<div ${H2}>הערות המתאמן/ת</div><div style="font-size:12px;line-height:1.5">${esc(form.notes)}</div>` : ""}
    <div style="margin-top:12px;padding-top:8px;border-top:1px solid #e6dcc4;color:#6b5d47;font-size:11.5px">
      חתימת המתאמן/ת: <b style="color:#241c12">${esc(form.signedName || name)}</b> &nbsp;·&nbsp; תאריך הגשה: ${esc(when)}
    </div>
  </div>`;
}

/** Render the declaration to a PDF and return a "data:application/pdf;base64,…" URL. */
export async function buildHealthPdfDataUrl(user: User, form: HealthForm): Promise<string> {
  const holder = document.createElement("div");
  holder.setAttribute("dir", "rtl");
  holder.style.cssText = "position:fixed;left:-99999px;top:0;width:794px;background:#fff;z-index:-1";
  holder.innerHTML = buildHtml(user, form);
  document.body.appendChild(holder);
  try {
    const [{ default: html2canvas }, jspdfMod] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const jsPDF = jspdfMod.jsPDF;
    const canvas = await html2canvas(holder, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (imgH <= ph) {
      pdf.addImage(img, "JPEG", 0, 0, pw, imgH);
    } else {
      let pos = 0;
      let remaining = imgH;
      while (remaining > 0) {
        pdf.addImage(img, "JPEG", 0, pos, pw, imgH);
        remaining -= ph;
        if (remaining > 0) { pdf.addPage(); pos -= ph; }
      }
    }
    return pdf.output("datauristring");
  } finally {
    document.body.removeChild(holder);
  }
}
