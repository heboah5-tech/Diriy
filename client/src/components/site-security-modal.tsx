import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";

interface SiteSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: "ar" | "en";
}

export function SiteSecurityModal({ isOpen, onClose, lang }: SiteSecurityModalProps) {
  const isAr = lang === "ar";

  const content = {
    ar: {
      title: "أمان الموقع",
      subtitle: "موقعك محمي بمقاييس أمان مدمجة تتوافق مع أعلى معايير الأمان العالمية.",
      learnMore: "تعرف على المزيد",
      items: [
        {
          title: "شهادة SSL",
          desc: "تتحقق من هوية موقعك وتمكن اتصالاً مشفراً، ليعرف الزوار (والمتصفحات) أنه يمكنهم الوثوق بموقعك.",
        },
        {
          title: "تشفير TLS 1.3",
          desc: "يشفّر بياناتك باستخدام أحدث البروتوكولات القياسية لحفظ معلومات زوارك بأمان.",
        },
        {
          title: "الحماية من هجمات DDoS",
          desc: "في هجمات DDoS، يتم إغراق المواقع بحركة مرور غير مرغوب فيها وتصبح غير متاحة. يقوم النظام بإعادة توجيه حركة المرور الضارة للحفاظ على إمكانية الوصول لموقعك طوال الوقت.",
        },
        {
          title: "التوافق مع المستوى الأول لمعيار PCI",
          desc: "يتوافق موقعك مع أعلى المعايير العالمية لعمليات الدفع الآمنة عبر الإنترنت، بغض النظر عن مزود بوابة الدفع المستخدم.",
        },
      ],
    },
    en: {
      title: "Site security",
      subtitle: "Your site is protected by built-in security measures that comply with the highest industry standards. Learn more",
      learnMore: "Learn more",
      items: [
        {
          title: "SSL Certificate",
          desc: "Authenticates your site’s identity and enables an encrypted connection, so that visitors (and browsers) know they can trust your site.",
        },
        {
          title: "TLS 1.3 Encryption",
          desc: "Encrypts your data using the latest industry-standard protocols to keep your visitors’ information safe.",
        },
        {
          title: "DDoS Protection",
          desc: "In a DDoS attack, sites are flooded with unwanted traffic and become unavailable. Wix reroutes this malicious traffic to keep your site accessible at all times.",
        },
        {
          title: "Level 1 PCI Compliance",
          desc: "Your site complies with the highest global standard for secure online payments, regardless of the payment provider used.",
        },
      ],
    },
  };

  const t = isAr ? content.ar : content.en;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            dir={isAr ? "rtl" : "ltr"}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden text-slate-800 z-10"
            style={{ fontFamily: isAr ? "'Tajawal', sans-serif" : "inherit" }}
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className={`absolute top-4 ${isAr ? "left-4" : "right-4"} p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer`}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header Block */}
            <div className="p-6 pb-5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-2">
                {t.title}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-[90%]">
                {t.subtitle}
              </p>
            </div>

            {/* Content List */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {t.items.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  {/* Status Indicator */}
                  <div className="flex-shrink-0 mt-0.5">
                    <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 p-1 text-emerald-600">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  </div>

                  {/* Text Details */}
                  <div className="flex-col">
                    <h3 className="font-bold text-sm text-slate-900 mb-1 flex items-center gap-1.5">
                      {item.title}
                    </h3>
                    <p className="text-[12px] text-slate-500 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {isAr ? "إغلاق" : "Close"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
