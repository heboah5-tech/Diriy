import { Link } from "wouter";
import { CheckCircle, Home, Ticket, Calendar, Clock, Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { handleCurrentPage } from "@/lib/firebase";

export default function ConfirmationPage() {
  useEffect(() => {
    handleCurrentPage("confirmation");
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5efe6] to-[#ebddd0] flex flex-col" dir="rtl">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <SuccessMessage />
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="bg-[#4a1525] text-white">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center">
          <img
            src="/logo-white.svg"
            alt="الدرعية"
            className="h-12"
            data-testid="img-confirmation-logo"
          />
        </div>
      </div>
    </header>
  );
}

function SuccessMessage() {
  const bookingNumber = `DIR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  return (
    <div className="max-w-md mx-auto text-center animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="relative">
          <div className="w-24 h-24 bg-gradient-to-br from-[#c9a96e] to-[#b8935a] rounded-full flex items-center justify-center mx-auto shadow-lg animate-scale-in">
            <CheckCircle className="w-14 h-14 text-white" />
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#f5efe6] text-[#4a1525] text-xs font-bold px-4 py-1 rounded-full">
            تم بنجاح
          </div>
        </div>
        
        <div className="space-y-2 pt-4">
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-success-title">
            تم الحجز بنجاح!
          </h1>
          <p className="text-muted-foreground">
            شكراً لك، تم تأكيد حجزك. سيتم إرسال تفاصيل الحجز إلى بريدك الإلكتروني.
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#f5efe6] to-[#ebddd0] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            <p className="text-sm text-muted-foreground">رقم الحجز</p>
          </div>
          <p className="text-3xl font-bold text-primary tracking-wider" data-testid="text-booking-number">
            {bookingNumber}
          </p>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-primary/20">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Calendar className="w-4 h-4" />
                <span className="text-xs">التاريخ</span>
              </div>
              <p className="font-semibold text-foreground text-sm">
                {new Date().toLocaleDateString('ar-SA')}
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">الوقت</span>
              </div>
              <p className="font-semibold text-foreground text-sm">09:00</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 py-5 rounded-xl gap-2"
            data-testid="button-download"
          >
            <Download className="w-4 h-4" />
            تحميل
          </Button>
          <Button
            variant="outline"
            className="flex-1 py-5 rounded-xl gap-2"
            data-testid="button-share"
          >
            <Share2 className="w-4 h-4" />
            مشاركة
          </Button>
        </div>

        <Link href="/">
          <Button
            size="lg"
            className="w-full bg-primary text-white shadow-lg gap-2"
            data-testid="button-back-home"
          >
            <Home className="w-5 h-5" />
            العودة للصفحة الرئيسية
          </Button>
        </Link>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm text-muted-foreground">
          نتطلع لزيارتك
        </p>
        <p className="text-xs text-muted-foreground/60">
          للاستفسارات: +966 92 002 1727
        </p>
      </div>
    </div>
  );
}
