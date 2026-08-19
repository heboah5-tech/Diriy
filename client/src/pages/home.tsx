import { useState } from "react";
import { Menu, X, MapPin, Clock } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

import seasonImage from "@assets/8ae74984605c4076bfde52a6a35b8bca_1772291393428.webp";
import restaurantImage from "@assets/50241d7ddb7a4537801bdee04bd13d27_1772291393426.webp";
import exploreImage from "@assets/a49e06e53a5946eca35727c91bc458c8.webp";
import heroImage from "@assets/bab0035fd04a490390b62d59736704f0_(1)_1778246846845.webp";

const LOGO_URL =
  "https://assets-diriyah.diriyah.me/4388214a05a84e7c910b39d5b9067ef3?width=750&quality=80&transform=true&format=webp";

const HERO_IMAGE_URL = heroImage;

// Brand palette (Diriyah Wix reference)
// ORANGE darkened from #C26C48 → #A85734 so white CTA text passes WCAG AA (≥ 4.5:1).
const ORANGE = "#A85734";
const ORANGE_DEEP = "#8E4729";
const GOLD = "#D4B080";
const BEIGE = "#F0EDE4";

type BookingCardProps = {
  image: string;
  title: string;
  subTitle?: string;
  price?: string;
  description: string;
  buttonText: string;
  href: string;
  testId: string;
};

function BookingCard({
  image,
  title,
  subTitle,
  price,
  description,
  buttonText,
  href,
  testId,
}: BookingCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="flex flex-col mb-16 bg-white overflow-hidden"
      data-testid={`card-${testId}`}
    >
      <div className="relative aspect-[4/3] w-full mb-6 overflow-hidden">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover"
         
        />
      </div>
      <div className="flex flex-col items-center text-center px-4">
        <h3
          className="text-2xl font-bold mb-4 text-[#222]"
          data-testid={`text-${testId}-title`}
        >
          {title}
        </h3>
        {subTitle && (
          <p className="text-gray-600 mb-2 text-sm leading-relaxed">
            {subTitle}
          </p>
        )}
        {price && <p className="font-bold text-lg mb-4">{price}</p>}
        <p className="text-gray-500 mb-8 max-w-md leading-relaxed whitespace-pre-line text-sm">
          {description}
        </p>
        <Link
          href={href}
          data-testid={`button-${testId}`}
          className="text-white px-12 py-3 rounded-md font-bold transition-transform hover:scale-105 active:scale-95"
          style={{ backgroundColor: ORANGE }}
        >
          {buttonText}
        </Link>
      </div>
    </motion.div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="absolute top-0 left-0 right-0 z-50 flex justify-between items-center px-6 py-6">
        <img
          src={LOGO_URL}
          alt="الدرعية"
          className="h-10 object-contain"
          data-testid="img-logo"
        />
        <button
          onClick={() => setOpen(!open)}
          className="text-white p-1"
          data-testid="button-menu"
          aria-label="القائمة"
        >
          {open ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
        </button>
      </header>

      {open && (
        <nav
          className="fixed top-[72px] left-0 right-0 z-50 bg-black/85 backdrop-blur px-6 py-4 space-y-2"
          data-testid="nav-mobile-menu"
        >
          {[
            { href: "#booking", label: "خيارات الحجز" },
            { href: "#parking", label: "المواقف" },
            { href: "#hours", label: "ساعات العمل" },
          ].map((it) => (
            <a
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className="block text-white text-base py-2 border-b border-white/10 last:border-b-0"
            >
              {it.label}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}

function Hero() {
  return (
    <section
      className="relative h-[85vh] w-full overflow-hidden"
      data-testid="section-hero"
    >
      <Header />
      <div className="absolute inset-0">
        <img
          src={HERO_IMAGE_URL}
          alt="الدرعية"
          className="w-full h-full object-cover"
         
        />
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <div className="relative h-full flex flex-col justify-end pb-20 px-8 max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p
            className="font-medium mb-4 text-sm tracking-widest"
            style={{ color: GOLD }}
            data-testid="text-hero-eyebrow"
          >
            خطط لزيارتك
          </p>
          <h1
            className="text-white text-4xl md:text-6xl font-bold leading-tight mb-6"
            data-testid="text-hero-title"
          >
            تعرّف على مطل البجيري قبل زيارتك
          </h1>
          <p
            className="text-white text-base md:text-xl leading-relaxed font-light opacity-90 max-w-xl"
            data-testid="text-hero-subtitle"
          >
            حيّاكم في مطل البجيري خطّط لزيارتك وعش تجربة جديدة.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function VerticalNav() {
  const items = [
    { href: "#booking", label: "خيارات الحجز" },
    { href: "#parking", label: "المواقف" },
    { href: "#hours", label: "ساعات العمل" },
  ];
  return (
    <nav
      className="py-12 px-8 flex flex-col items-start space-y-4 font-medium text-lg border-b border-gray-100"
      style={{ color: ORANGE }}
      data-testid="nav-vertical"
    >
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          className="hover:opacity-70 transition-opacity"
          data-testid={`link-vnav-${it.href.slice(1)}`}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}

function BookingSection() {
  return (
    <section id="booking" className="pt-20" data-testid="section-booking">
      <div
        className="text-3xl mb-12 px-2"
        style={{ color: GOLD }}
        data-testid="text-booking-heading"
      >
        خيارات الحجز
      </div>

      <BookingCard
        testId="season"
        image={seasonImage}
        title="موسم الدرعية 26"
        description={
          "بدأ موسم الدرعية بفعاليات وتجارب ثرية من #أرض_ترويك.\n" +
          "تقويم يتضمن الفنون والثقافة، والعروض الحية وغيرها من الفعاليات.\n\n" +
          "استكشف فعاليات وتجارب الدرعية، لحجز تذكرتك"
        }
        buttonText="احجز تذكرتك"
        href="/registration"
      />

      <BookingCard
        testId="dining"
        image={restaurantImage}
        title="جرّب مطاعم مطل البجيري"
        subTitle="سعر التذكرة: 50 ريال للشخص (يومياً بعد الساعة 5 مساءً)"
        description={
          "احجز طاولتك الآن واحصل على تذكرة دخول لمطل البجيري وحي الطريف التاريخي.\n" +
          "رسوم الحجز قابلة للاسترداد في جميع مطاعم ومقاهي مطل البجيري."
        }
        buttonText="احجز طاولتك"
        href="/restaurants"
      />

      <BookingCard
        testId="discovery"
        image={exploreImage}
        title="استكشف الدرعية - تذكرة دخول"
        price="سعر التذكرة: 50 ريال للشخص (يومياً بعد الساعة 5 مساءً)"
        description={
          "لزيارة مطل البجيري وحي الطريف التاريخي، يرجى حجز تذكرة دخول.\n\n" +
          "رسوم الحجز قابلة للاسترداد في جميع مطاعم ومقاهي مطل البجيري."
        }
        buttonText="احجز تذكرة الدخول"
        href="/registration"
      />
    </section>
  );
}

function ParkingSection() {
  return (
    <section id="parking" className="mt-24" data-testid="section-parking">
      <div
        className="flex items-center gap-3 text-3xl mb-8"
        style={{ color: ORANGE }}
      >
        <MapPin />
        <span className="font-light">المواقف</span>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-50 p-6 rounded-lg" data-testid="card-parking-self">
          <h4 className="font-bold text-lg mb-2 text-right">الوقوف الذاتي</h4>
          <p className="text-gray-600 text-sm">3 ساعات بـ 30 ريال</p>
          <p className="text-gray-600 text-sm">تضاف 10 ريال على كل ساعة*</p>
        </div>

        <div
          className="bg-gray-50 p-6 rounded-lg flex justify-between items-center"
          data-testid="card-parking-valet"
        >
          <span className="text-gray-600 text-sm">100 ريال</span>
          <h4 className="font-bold text-lg text-right">خدمة صف السيارات</h4>
        </div>
      </div>
    </section>
  );
}

function HoursSection() {
  return (
    <section id="hours" className="mt-24" data-testid="section-hours">
      <div
        className="flex items-center gap-3 text-3xl mb-8"
        style={{ color: ORANGE }}
      >
        <Clock />
        <span className="font-light">ساعات العمل</span>
      </div>

      <div className="space-y-8">
        <div data-testid="hours-bujairi">
          <h4 className="font-bold text-xl mb-4">مطل البجيري</h4>
          <p className="text-gray-700 text-sm">الأحد - الأربعاء</p>
          <p className="text-gray-600 text-sm mb-3">
            من 10 صباحاً حتى 12 منتصف الليل
          </p>
          <p className="text-gray-700 text-sm">الخميس - السبت</p>
          <p className="text-gray-600 text-sm">من 10 صباحاً حتى 1 صباحاً</p>
        </div>

        <div data-testid="hours-turaif">
          <h4 className="font-bold text-xl mb-4">حي الطريف</h4>
          <p className="text-gray-700 text-sm">السبت - الخميس</p>
          <p className="text-gray-600 text-sm mb-3">
            من 10 صباحاً حتى 12 منتصف الليل
          </p>
          <p className="text-gray-700 text-sm">الجمعة</p>
          <p className="text-gray-600 text-sm">من 2 ظهراً حتى 12 منتصف الليل</p>
        </div>
      </div>
    </section>
  );
}

function MapSection() {
  return (
    <section
      className="py-20 px-6 flex flex-col items-center"
      style={{ backgroundColor: BEIGE }}
      data-testid="section-map"
    >
      <div className="max-w-2xl w-full relative">
        <div
          className="w-full aspect-square rounded-md overflow-hidden bg-white/40"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(0,0,0,0.06) 23px, rgba(0,0,0,0.06) 24px),
              repeating-linear-gradient(90deg, transparent, transparent 23px, rgba(0,0,0,0.06) 23px, rgba(0,0,0,0.06) 24px)
            `,
          }}
        >
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: ORANGE }}
            >
              <MapPin className="w-6 h-6 text-white" fill="white" />
            </div>
          </div>
        </div>
        <div className="mt-8 flex justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-8 h-8 border-4 rounded-full"
            style={{
              borderColor: "rgba(0,0,0,0.12)",
              borderTopColor: ORANGE,
            }}
          />
        </div>
        <p className="text-center mt-12 text-sm text-gray-500">
          جميع الحقوق محفوظة © 2024
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer
      className="py-12 flex flex-col items-center justify-center"
      style={{ backgroundColor: ORANGE_DEEP }}
      data-testid="section-footer"
    >
      <div className="flex gap-4 items-center">
        <img
          src={LOGO_URL}
          alt="الدرعية"
          className="h-10 object-contain"
        />
        <div className="border-l border-white/40 h-8" />
        <div className="flex flex-col text-white">
          <span className="text-xs tracking-[0.2em] font-bold">DIRIYAH</span>
          <span className="text-[10px] opacity-80 tracking-widest">
            SEASON 23/24
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div
      className="min-h-screen bg-white text-right"
      dir="rtl"
      data-testid="page-home"
    >
      <Hero />
      <VerticalNav />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <BookingSection />
        <ParkingSection />
        <HoursSection />
      </main>

      <MapSection />
      <Footer />
    </div>
  );
}
