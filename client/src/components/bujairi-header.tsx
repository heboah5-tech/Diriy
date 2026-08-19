import { useState } from "react";
import { Link } from "wouter";

const MAROON = "#3a0f1d";
const MAROON_LIGHT = "#4a1525";
const YELLOW = "#e6b54a";

const BUJAIRI_LOGO = "https://s3.ticketmx.com/bujairi/images/bujairi-ar.svg";

export function RestaurantNav({ active }: { active?: string } = {}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const itemClass = (label: string) =>
    `text-sm hover:text-[#c9a96e] ${
      active === label ? "text-[#c9a96e] font-medium" : "text-[#4a1525]"
    }`;

  return (
    <nav className="bg-[#ebddd0] relative" data-testid="nav-restaurant">
      <div className="flex items-center justify-center py-6 px-4 relative">
        <Link
          href="/"
          className="hidden lg:block absolute right-8 text-[#4a1525] text-sm hover:text-[#c9a96e]"
          data-testid="link-contact"
        >
          اتصل بنا
        </Link>
        <Link href="/" className="block" data-testid="link-logo">
          <img
            src={BUJAIRI_LOGO}
            alt="Bujairi Logo"
            className="w-[124px] lg:w-[239px]"
            data-testid="img-bujairi-logo"
          />
        </Link>
        <Link
          href="/"
          className="hidden lg:block absolute left-8 text-[#4a1525] text-sm hover:text-[#c9a96e]"
          data-testid="link-english"
        >
          English
        </Link>
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 lg:hidden p-0 w-6 h-6"
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-menu-toggle"
          aria-label="القائمة"
        >
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#4a1525"
            strokeWidth="2"
          >
            {menuOpen ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="6" y1="18" x2="18" y2="6" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      <div className="h-[1px] bg-[#c9a96e] w-full" />

      {menuOpen && (
        <div
          className="lg:hidden px-4 py-4 space-y-4"
          data-testid="nav-mobile-menu"
        >
          <Link
            href="/"
            onClick={() => setMenuOpen(false)}
            className={`block ${itemClass("home")}`}
          >
            الرئيسية
          </Link>
          <a
            href="/#booking"
            onClick={() => setMenuOpen(false)}
            className={`block ${itemClass("booking-options")}`}
          >
            خيارات الحجز
          </a>
          <Link
            href="/restaurants"
            onClick={() => setMenuOpen(false)}
            className={`block ${itemClass("restaurants")}`}
          >
            المطاعم
          </Link>
          <Link
            href="/registration"
            onClick={() => setMenuOpen(false)}
            className={`block ${itemClass("new-account")}`}
          >
            حساب جديد
          </Link>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className={`block ${itemClass("login")}`}
          >
            تسجيل دخول
          </a>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
          >
            اتصل بنا
          </a>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e] font-sans"
          >
            English
          </a>
        </div>
      )}

      <div className="hidden lg:block">
        <div className="flex justify-center gap-12 py-4">
          <Link href="/" className={itemClass("home")}>
            الرئيسية
          </Link>
          <a href="/#booking" className={itemClass("booking-options")}>
            خيارات الحجز
          </a>
          <Link href="/restaurants" className={itemClass("restaurants")}>
            المطاعم
          </Link>
          <Link href="/registration" className={itemClass("new-account")}>
            حساب جديد
          </Link>
          <a href="#" className={itemClass("login")}>
            تسجيل دخول
          </a>
        </div>
        <div className="h-[1px] bg-[#c9a96e] w-full" />
      </div>
    </nav>
  );
}

export function ProgressBar({
  current,
  steps,
}: {
  current: number;
  steps?: { n: number; label: string }[];
}) {
  const resolvedSteps = steps ?? [
    { n: 1, label: "تسجيل" },
    { n: 2, label: "الحجز" },
    { n: 3, label: "الدفع" },
  ];
  return (
    <div
      className="px-6 py-5"
      style={{ backgroundColor: MAROON }}
      data-testid="progress-bar"
    >
      <div className="max-w-md mx-auto flex items-center justify-between">
        {resolvedSteps.map((step, i) => {
          const active = step.n === current;
          const done = step.n < current;
          return (
            <div
              key={step.label}
              className="flex items-center flex-1 last:flex-none"
            >
              <div
                className="flex flex-col items-center"
                data-testid={`step-${step.n}`}
              >
                <div
                  className="w-3 h-3 rounded-full mb-2"
                  style={{
                    backgroundColor: active || done ? YELLOW : "#fff",
                    boxShadow: active ? `0 0 0 3px ${YELLOW}40` : "none",
                  }}
                />
                <span
                  className="text-xs font-medium whitespace-nowrap"
                  style={{ color: active ? YELLOW : "#fff" }}
                >
                  {step.label}
                </span>
              </div>
              {i < resolvedSteps.length - 1 && (
                <div
                  className="flex-1 h-px mx-2 mb-6"
                  style={{ backgroundColor: YELLOW }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PageBanner({ title }: { title: string }) {
  return (
    <div
      className="py-7 text-center"
      style={{ backgroundColor: MAROON_LIGHT }}
      data-testid="page-banner"
    >
      <h1 className="text-white text-2xl md:text-3xl font-bold">{title}</h1>
    </div>
  );
}

export function BujairiFooter() {
  return (
    <footer
      className="py-6 px-4 text-center text-sm"
      style={{ backgroundColor: "#ebddd0", color: MAROON_LIGHT }}
      data-testid="footer-bujairi"
    >
      <div className="border-t border-[#c9a96e]/40 pt-5 max-w-md mx-auto space-y-1">
        <p>Copyright 2024 DGCL. All Rights Reserved</p>
        <p dir="ltr" className="opacity-90">
          +966 92 0021 727
        </p>
      </div>
    </footer>
  );
}
