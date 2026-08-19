import { Link, useParams } from "wouter";
import { ArrowRight, Clock, MapPin, DollarSign, UtensilsCrossed } from "lucide-react";
import { getRestaurantById } from "@/lib/restaurant-data";

export default function RestaurantDetail() {
  const params = useParams<{ id: string }>();
  const restaurant = getRestaurantById(Number(params.id));

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

  return (
    <div className="min-h-screen bg-[#ebddd0]" dir="rtl">
      <div className="relative h-[280px] md:h-[400px] overflow-hidden">
        <img
          src={restaurant.bgImage}
          alt={restaurant.nameEn}
          className="w-full h-full object-cover"
          data-testid="img-restaurant-hero"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

        <div className="absolute top-4 right-4">
          <Link
            href="/restaurants"
            className="flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-full text-sm hover:bg-white/30 transition-colors"
            data-testid="link-back"
          >
            <ArrowRight className="w-4 h-4" />
            العودة
          </Link>
        </div>

        <div className="absolute bottom-6 right-6 left-6 flex items-end gap-4">
          <img
            src={restaurant.logo}
            alt={restaurant.nameEn}
            className="w-20 h-20 rounded-xl shadow-lg object-cover border-2 border-white/30"
            data-testid="img-restaurant-logo"
          />
          <div className="flex-1">
            <h1 className="text-white text-2xl md:text-3xl font-bold drop-shadow-lg" data-testid="text-restaurant-name">
              {restaurant.name}
            </h1>
            <p className="text-white/80 text-sm mt-1" data-testid="text-restaurant-name-en">
              {restaurant.nameEn}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {restaurant.cuisine && (
          <div className="inline-block bg-[#4a1525] text-white text-xs px-3 py-1.5 rounded-full" data-testid="badge-cuisine">
            {restaurant.cuisine}
          </div>
        )}

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h2 className="text-[#4a1525] font-bold text-lg mb-3" data-testid="text-about-heading">عن المطعم</h2>
          <p className="text-[#7a6b5f] text-sm leading-relaxed" data-testid="text-restaurant-description">
            {restaurant.description}
          </p>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="text-[#4a1525] font-bold text-lg" data-testid="text-info-heading">معلومات</h2>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#f5efe6] rounded-full flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-[#4a1525]" />
            </div>
            <div>
              <p className="text-[#4a1525] text-sm font-medium">ساعات العمل</p>
              <p className="text-[#7a6b5f] text-xs" data-testid="text-hours">{restaurant.hours}</p>
            </div>
          </div>

          <div className="h-[1px] bg-[#f5efe6]" />

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#f5efe6] rounded-full flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-[#4a1525]" />
            </div>
            <div>
              <p className="text-[#4a1525] text-sm font-medium">متوسط الأسعار</p>
              <p className="text-[#7a6b5f] text-xs" data-testid="text-price-range">{restaurant.priceRange}</p>
            </div>
          </div>

          <div className="h-[1px] bg-[#f5efe6]" />

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#f5efe6] rounded-full flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-[#4a1525]" />
            </div>
            <div>
              <p className="text-[#4a1525] text-sm font-medium">الموقع</p>
              <p className="text-[#7a6b5f] text-xs" data-testid="text-location">{restaurant.location}</p>
            </div>
          </div>

          {restaurant.cuisine && (
            <>
              <div className="h-[1px] bg-[#f5efe6]" />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-[#f5efe6] rounded-full flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-4 h-4 text-[#4a1525]" />
                </div>
                <div>
                  <p className="text-[#4a1525] text-sm font-medium">نوع المطبخ</p>
                  <p className="text-[#7a6b5f] text-xs" data-testid="text-cuisine-type">{restaurant.cuisine}</p>
                </div>
              </div>
            </>
          )}
        </div>

        <Link
          href={`/reserve/${restaurant.id}`}
          className="block w-full bg-[#4a1525] text-white text-center py-4 rounded-xl font-bold text-base hover:bg-[#3a0f1d] transition-colors shadow-md"
          data-testid="button-reserve"
        >
          احجز طاولة
        </Link>

        <Link
          href="/restaurants"
          className="block w-full border border-[#4a1525] text-[#4a1525] text-center py-3 rounded-xl font-medium text-sm hover:bg-[#4a1525]/5 transition-colors"
          data-testid="button-back-restaurants"
        >
          العودة لقائمة المطاعم
        </Link>
      </div>

      <footer className="bg-[#ebddd0] py-0">
        <div className="flex flex-col md:flex-row md:justify-between items-start px-6 py-6 max-w-7xl mx-auto gap-4">
          <span className="text-[#000] text-sm">Copyright 2024 DGCL. All Rights Reserved</span>
          <a href="tel:00966920021727" className="flex items-center gap-3 text-[#000] text-sm hover:text-[#c9a96e]">
            <img src="/images/restaurants/phone.svg" alt="phone" className="w-5 h-5" />
            <span style={{ direction: "ltr" } as any}>+966 92 0021 727</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
