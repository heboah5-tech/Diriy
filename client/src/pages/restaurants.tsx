import { useState } from "react";
import { Link } from "wouter";
import { RESTAURANTS } from "@/lib/restaurant-data";
import type { Restaurant } from "@/lib/restaurant-data";

const BUJAIRI_LOGO = "https://s3.ticketmx.com/bujairi/images/bujairi-ar.svg";

function RestaurantNav() {
  const [menuOpen, setMenuOpen] = useState(false);

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
        <a href="#" className="block">
          <img
            src={BUJAIRI_LOGO}
            alt="Bujairi Logo"
            className="w-[124px] lg:w-[239px]"
            data-testid="img-bujairi-logo"
          />
        </a>
        <Link
          href="/"
          className="hidden lg:block absolute left-8 text-[#4a1525] text-sm hover:text-[#c9a96e]"
          data-testid="link-english"
        >
          English
        </Link>
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 lg:hidden p-0"
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-menu-toggle"
        >
          <img
            src="/images/restaurants/bujairi-logo.svg"
            alt="menu"
            className="w-5 h-5 opacity-0"
          />
          <svg
            className="w-6 h-6 absolute inset-0 m-auto"
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
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
            data-testid="link-home"
          >
            الرئيسية
          </Link>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
            data-testid="link-booking"
          >
            خيارات الحجز
          </a>
          <Link
            href="/restaurants"
            onClick={() => setMenuOpen(false)}
            className="block text-[#c9a96e] text-sm font-medium"
            data-testid="link-restaurants-active"
          >
            المطاعم
          </Link>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
            data-testid="link-new-account"
          >
            حساب جديد
          </a>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
            data-testid="link-login"
          >
            تسجيل دخول
          </a>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e]"
            data-testid="link-contact-mobile"
          >
            اتصل بنا
          </a>
          <a
            href="#"
            onClick={() => setMenuOpen(false)}
            className="block text-[#4a1525] text-sm hover:text-[#c9a96e] font-sans"
            data-testid="link-english-mobile"
          >
            English
          </a>
        </div>
      )}

      <div className="hidden lg:block">
        <div className="flex justify-center gap-12 py-4">
          <Link
            href="/"
            className="text-[#4a1525] text-sm hover:text-[#c9a96e]"
          >
            الرئيسية
          </Link>
          <a href="#" className="text-[#4a1525] text-sm hover:text-[#c9a96e]">
            خيارات الحجز
          </a>
          <Link href="/restaurants" className="text-[#c9a96e] text-sm">
            المطاعم
          </Link>
          <a href="#" className="text-[#4a1525] text-sm hover:text-[#c9a96e]">
            حساب جديد
          </a>
          <a href="#" className="text-[#4a1525] text-sm hover:text-[#c9a96e]">
            تسجيل دخول
          </a>
        </div>
      </div>

      <div className="h-[1px] bg-[#c9a96e] w-full" />
    </nav>
  );
}

function HeroBanner() {
  return (
    <div className="relative" dir="rtl" data-testid="section-hero-banner">
      <img
        src="/987e8ebff86625a6eb1880e853d69bc6684e07a0.jpg"
        alt="الدرعية"
        className="w-full h-auto object-cover max-h-[300px] md:max-h-[500px]"
        data-testid="img-hero-banner"
      />
    </div>
  );
}

function RestaurantCard({ restaurant }: { restaurant: Restaurant }) {
  return (
    <Link href={`/restaurant/${restaurant.id}`}>
      <div
        className="restaurant-card bg-white rounded-lg overflow-hidden shadow-md mb-0 cursor-pointer hover:shadow-lg transition-shadow duration-300"
        data-testid={`card-restaurant-${restaurant.id}`}
      >
        <div className="restaurant-card-bg">
          <img
            src={restaurant.bgImage}
            alt={restaurant.nameEn}
            className="w-full h-[114px] object-cover object-center rounded-t-lg"
          />
        </div>
        <div className="flex items-end p-3 gap-2">
          <div className="restaurant-card-logo -mt-10 shrink-0">
            <img
              src={restaurant.logo}
              alt=""
              className="w-[76px] h-[76px] object-cover rounded-lg shadow-md"
            />
          </div>
          <div className="flex flex-col items-start pb-1 min-w-0">
            <div
              className="text-[#4a1525] text-base font-medium leading-tight truncate w-full"
              data-testid={`text-name-${restaurant.id}`}
            >
              {restaurant.name}
            </div>
            {restaurant.cuisine && (
              <div
                className="text-[#4a1525] text-sm mt-1 opacity-70"
                data-testid={`text-cuisine-${restaurant.id}`}
              >
                {restaurant.cuisine}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function RestaurantsSection() {
  return (
    <section className="bg-[#ebddd0] py-6" data-testid="section-restaurants">
      <div className="px-4 max-w-7xl mx-auto">
        <h2
          className="text-[#4a1525] text-xl font-medium mb-4"
          data-testid="text-restaurants-heading"
        >
          مطاعم البجيري
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {RESTAURANTS.map((restaurant) => (
            <RestaurantCard key={restaurant.id} restaurant={restaurant} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#ebddd0] py-0" data-testid="section-footer">
      <div className="flex flex-col md:flex-row md:justify-between items-start px-6 py-6 max-w-7xl mx-auto gap-4">
        <span className="text-[#000] text-sm" data-testid="text-copyright">
          Copyright 2024 DGCL. All Rights Reserved
        </span>
        <a
          href="tel:00966920021727"
          className="flex items-center gap-3 text-[#000] text-sm hover:text-[#c9a96e]"
          data-testid="link-phone"
        >
          <img
            src="/images/restaurants/phone.svg"
            alt="phone"
            className="w-5 h-5"
          />
          <span style={{ direction: "ltr" } as any}>+966 92 0021 727</span>
        </a>
      </div>
    </footer>
  );
}

export default function Restaurants() {
  return (
    <div className="min-h-screen bg-[#ebddd0]" dir="rtl">
      <RestaurantNav />
      <HeroBanner />
      <RestaurantsSection />
      <Footer />
    </div>
  );
}
