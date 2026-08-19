import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

export type Country = {
  code: string; // ISO-2
  dial: string; // +966
  flag: string; // emoji
  name: string; // Arabic display
};

// Curated list — Saudi first, then GCC + MENA + popular international.
export const COUNTRIES: Country[] = [
  { code: "SA", dial: "+966", flag: "🇸🇦", name: "السعودية" },
  { code: "AE", dial: "+971", flag: "🇦🇪", name: "الإمارات" },
  { code: "KW", dial: "+965", flag: "🇰🇼", name: "الكويت" },
  { code: "BH", dial: "+973", flag: "🇧🇭", name: "البحرين" },
  { code: "QA", dial: "+974", flag: "🇶🇦", name: "قطر" },
  { code: "OM", dial: "+968", flag: "🇴🇲", name: "عُمان" },
  { code: "EG", dial: "+20", flag: "🇪🇬", name: "مصر" },
  { code: "JO", dial: "+962", flag: "🇯🇴", name: "الأردن" },
  { code: "LB", dial: "+961", flag: "🇱🇧", name: "لبنان" },
  { code: "IQ", dial: "+964", flag: "🇮🇶", name: "العراق" },
  { code: "SY", dial: "+963", flag: "🇸🇾", name: "سوريا" },
  { code: "YE", dial: "+967", flag: "🇾🇪", name: "اليمن" },
  { code: "PS", dial: "+970", flag: "🇵🇸", name: "فلسطين" },
  { code: "MA", dial: "+212", flag: "🇲🇦", name: "المغرب" },
  { code: "DZ", dial: "+213", flag: "🇩🇿", name: "الجزائر" },
  { code: "TN", dial: "+216", flag: "🇹🇳", name: "تونس" },
  { code: "LY", dial: "+218", flag: "🇱🇾", name: "ليبيا" },
  { code: "SD", dial: "+249", flag: "🇸🇩", name: "السودان" },
  { code: "TR", dial: "+90", flag: "🇹🇷", name: "تركيا" },
  { code: "GB", dial: "+44", flag: "🇬🇧", name: "بريطانيا" },
  { code: "US", dial: "+1", flag: "🇺🇸", name: "أمريكا" },
];

const DEFAULT_COUNTRY = COUNTRIES[0];

/**
 * Split a stored phone value into (country, localDigits). Picks the country
 * whose dial code is the longest matching prefix; falls back to default.
 */
function splitValue(value: string): { country: Country; local: string } {
  const v = (value || "").replace(/\s+/g, "");
  if (!v) return { country: DEFAULT_COUNTRY, local: "" };
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (v.startsWith(c.dial)) {
      return { country: c, local: v.slice(c.dial.length) };
    }
  }
  // Saudi local format like "05..." — keep as local under default country.
  return { country: DEFAULT_COUNTRY, local: v.replace(/^\+/, "") };
}

type Props = {
  value: string;
  onChange: (fullValue: string) => void;
  hasError?: boolean;
  placeholder?: string;
  testId?: string;
  /** Tailwind classes applied to the wrapping border container. */
  className?: string;
  /** Tailwind classes applied to the inner input element. */
  inputClassName?: string;
};

/**
 * Phone input with a country-code selector. Stores the value as a single
 * string in `+<dial><digits>` form so callers don't need to track two
 * fields. The dropdown is filterable by name or dial code.
 */
export function CountryPhoneInput({
  value,
  onChange,
  hasError,
  placeholder = "5XXXXXXXX",
  testId = "input-phone",
  className = "",
  inputClassName = "",
}: Props) {
  const { country, local } = useMemo(() => splitValue(value), [value]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [filter]);

  const setCountry = (c: Country) => {
    setOpen(false);
    setFilter("");
    onChange(`${c.dial}${local}`);
  };

  const setLocal = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 14);
    onChange(`${country.dial}${digits}`);
  };

  return (
    <div ref={wrapRef} className="relative" dir="ltr">
      <div
        className={`flex items-stretch rounded-md border bg-white overflow-hidden transition-colors ${
          hasError ? "border-red-400" : "border-gray-300"
        } ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex items-center gap-1 px-2.5 bg-gray-50 hover:bg-gray-100 border-r border-gray-200 text-sm shrink-0"
          data-testid={`${testId}-country`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-base leading-none">{country.flag}</span>
          <span className="font-mono text-gray-700">{country.dial}</span>
          <ChevronDown className="w-3 h-3 text-gray-500" />
        </button>
        <input
          type="tel"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={placeholder}
          inputMode="tel"
          className={`flex-1 min-w-0 px-3 text-sm outline-none bg-white text-gray-800 text-left ${inputClassName}`}
          data-testid={testId}
        />
      </div>

      {open && (
        <div
          className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-hidden bg-white border border-gray-200 rounded-md shadow-lg"
          data-testid={`${testId}-country-list`}
        >
          <div className="flex items-center gap-2 px-2 py-2 border-b border-gray-100">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="ابحث..."
              autoFocus
              className="flex-1 text-sm outline-none bg-transparent"
              data-testid={`${testId}-country-search`}
            />
          </div>
          <div className="overflow-y-auto max-h-56">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">
                لا توجد نتائج
              </div>
            )}
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCountry(c)}
                className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${
                  c.code === country.code ? "bg-amber-50" : ""
                }`}
                data-testid={`${testId}-country-${c.code}`}
              >
                <span className="text-base">{c.flag}</span>
                <span className="flex-1 text-gray-800">{c.name}</span>
                <span className="font-mono text-xs text-gray-500">
                  {c.dial}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
