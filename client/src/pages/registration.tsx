import { useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { addData, handleCurrentPage } from "@/lib/firebase";
import { setupOnlineStatus } from "@/lib/utils";
import emailjs from "@emailjs/browser";
import {
  RestaurantNav,
  ProgressBar,
  PageBanner,
  BujairiFooter,
} from "@/components/bujairi-header";
import { CountryPhoneInput } from "@/components/country-phone-input";

const EMAILJS_SERVICE_ID = "service_5b9ehgd";
const EMAILJS_TEMPLATE_ID = "template_8y82zc7";
const EMAILJS_PUBLIC_KEY = "ROVj9RXGGeBR7U8iG";

// Initialize EmailJS once at module load so subsequent send() calls
// don't have to re-pass the public key and any auth/init errors surface
// immediately in the console.
emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });

const MAROON = "#3a0f1d";
const MAROON_LIGHT = "#4a1525";
const GOLD = "#c9a96e";
const YELLOW = "#e6b54a";
const BEIGE = "#ebddd0";

export default function RegistrationPage() {
  useEffect(() => {
    void handleCurrentPage("registration");
  }, []);
  return (
    <div
      className="min-h-screen flex flex-col text-right"
      style={{ backgroundColor: BEIGE }}
      dir="rtl"
      data-testid="page-registration"
    >
      <RestaurantNav active="new-account" />
      <ProgressBar current={1} />
      <PageBanner title="تسجيل" />
      <main className="flex-1 px-4 py-6">
        <RegistrationForm />
      </main>
      <BujairiFooter />
    </div>
  );
}


type FieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  dir?: "rtl" | "ltr";
  maxLength?: number;
  inputMode?: "text" | "tel" | "email" | "numeric";
  testId: string;
};

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  dir: fieldDir,
  maxLength,
  inputMode,
  testId,
}: FieldProps) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={fieldDir}
        maxLength={maxLength}
        inputMode={inputMode}
        className={`w-full h-11 px-4 rounded-md border bg-white text-gray-800 text-sm outline-none transition-colors focus:border-[#c9a96e] focus:ring-2 focus:ring-[#c9a96e]/30 ${
          error ? "border-red-400" : "border-gray-300"
        }`}
        style={{
          textAlign: fieldDir === "ltr" ? "left" : "right",
        }}
        data-testid={testId}
      />
      {error && (
        <p
          className="text-red-500 text-xs"
          data-testid={`${testId}-error`}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function RegistrationForm() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
    bot?: string;
  }>({});

  const formLoadTime = useRef(Date.now());
  const interactionCount = useRef(0);
  const hasMouseMoved = useRef(false);

  useEffect(() => {
    const handleScroll = () => {};
    const handleMouseMove = () => {
      hasMouseMoved.current = true;
    };
    const handleKeyPress = () => {
      interactionCount.current++;
    };

    window.addEventListener("scroll", handleScroll);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("keypress", handleKeyPress);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("keypress", handleKeyPress);
    };
  }, []);

  const isBotDetected = (): boolean => {
    if (honeypot) return true;
    const timeSpent = Date.now() - formLoadTime.current;
    if (timeSpent < 800) return true;
    return false;
  };

  const validatePhone = (phoneNum: string): boolean => {
    // Phone is now stored with the country dial-code prefix (e.g. "+9665…").
    // Accept any +<dial><7-14 digits> shape so users from any supported
    // country can register, but still reject obvious garbage.
    const cleanPhone = phoneNum.replace(/\s/g, "");
    if (/^\+\d{8,16}$/.test(cleanPhone)) return true;
    // Backward compatibility for existing local-format Saudi numbers.
    return /^(05|5)\d{8}$/.test(cleanPhone);
  };

  const validateEmail = (emailStr: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    const newErrors: typeof errors = {};

    if (!name.trim()) newErrors.name = "الاسم مطلوب";
    if (!email.trim()) {
      newErrors.email = "البريد الإلكتروني مطلوب";
    } else if (!validateEmail(email)) {
      newErrors.email = "البريد الإلكتروني غير صحيح";
    }
    if (!phone.trim()) {
      newErrors.phone = "رقم الجوال مطلوب";
    } else if (!validatePhone(phone)) {
      newErrors.phone = "رقم الجوال غير صحيح";
    }

    if (isBotDetected()) {
      newErrors.bot = "تعذر إكمال الطلب، يرجى المحاولة مرة أخرى";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setIsSubmitting(true);
      const visitorId = `visitor_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      const added = await addData({
        id: visitorId,
        name,
        email,
        phone,
        currentPage: "registration",
      });
      if (!added) {
        setErrors((prev) => ({
          ...prev,
          bot: "تعذر إكمال الطلب، يرجى المحاولة مرة أخرى",
        }));
        setIsSubmitting(false);
        return;
      }
      setupOnlineStatus(visitorId);
      localStorage.removeItem("otpHistory");

      // Fire-and-forget: don't block registration on email delivery and
      // skip on failure so the user always proceeds to /booking. We still
      // log the failure so EmailJS template/service misconfigurations are
      // visible in the browser console for debugging.
      emailjs
        .send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
          to_email: email,
          email: email,
          user_email: email,
          to_name: name,
          user_name: name,
          name: name,
          from_name: "الدرعية - Diriyah",
          reply_to: email,
          message: `مرحباً ${name}، شكراً لتسجيلك في موقع الدرعية.`,
        })
        .then((res) => {
          console.log("EmailJS sent:", res.status, res.text);
        })
        .catch((err) => {
          console.warn("EmailJS send failed (skipping):", err?.text || err?.message || err);
        });

      setLocation("/booking");
      return;
    }
    setIsSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-md mx-auto"
    >
      <div
        className="bg-white rounded-2xl overflow-hidden shadow-sm"
        data-testid="card-form"
      >
        <div
          className="px-6 py-4 text-white text-lg font-bold text-center"
          style={{ backgroundColor: MAROON_LIGHT }}
        >
          تسجيل
        </div>

        <div className="p-6">
          <input
            type="text"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            className="absolute opacity-0 pointer-events-none h-0 w-0"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
          />

          {errors.bot && (
            <div
              className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-600 text-sm text-center"
              data-testid="error-bot"
            >
              {errors.bot}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <Field
              id="name"
              label="الاسم الكامل"
              value={name}
              onChange={(v) => setName(v.slice(0, 80))}
              maxLength={80}
              error={errors.name}
              testId="input-name"
            />

            <Field
              id="email"
              label="البريد الإلكتروني"
              value={email}
              onChange={(v) => setEmail(v.slice(0, 120))}
              maxLength={120}
              type="email"
              dir="ltr"
              inputMode="email"
              error={errors.email}
              testId="input-email"
            />

            <div className="space-y-2">
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700"
              >
                رقم الجوال
              </label>
              <CountryPhoneInput
                value={phone}
                onChange={setPhone}
                hasError={!!errors.phone}
                className="h-11"
                testId="input-phone"
              />
              {errors.phone && (
                <p className="text-red-500 text-xs" data-testid="input-phone-error">
                  {errors.phone}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-12 mt-4 rounded-md font-bold text-base transition-transform hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: YELLOW, color: MAROON }}
              data-testid="button-continue"
            >
              {isSubmitting ? "جاري الإرسال..." : "التالي"}
            </button>
          </form>

        </div>
      </div>
    </motion.div>
  );
}
