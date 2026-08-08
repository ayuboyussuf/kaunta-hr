/**
 * Place search, so nobody has to know their own latitude.
 *
 *   GET /api/geo/search?q=westlands  (owner)
 *
 * Backed by OpenStreetMap's Nominatim: free, no key, no billing account to
 * set up before someone can add their second shop. It is proxied rather than
 * called from the browser for three reasons that all matter:
 *
 *   - Nominatim's usage policy requires a real identifying User-Agent. A
 *     browser cannot set one; a server can, and we do.
 *   - Their rate limit is one request a second per client. Coming from our
 *     server we can hold that centrally instead of hoping every open tab
 *     behaves.
 *   - Results get cached here, so ten owners searching "Westlands" is one
 *     request rather than ten.
 *
 * Results are biased to Kenya because that is where the businesses are, and a
 * search for "Ngong Road" should not offer a road in Ohio first.
 */
import { Router } from "express";
import { z } from "zod";
import { requireOwner } from "../../lib/auth";
import { env } from "../../lib/env";

const router = Router();

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const UA = `AproksiHR/1.0 (${env.appUrl})`;

interface Place {
  label: string;
  lat: number;
  lng: number;
}

/* ── Cache ────────────────────────────────────────────────────────────── */
const cache = new Map<string, { at: number; places: Place[] }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // places do not move
const CACHE_MAX = 500;

function cached(key: string): Place[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.places;
}

function remember(key: string, places: Place[]): void {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), places });
}

/* ── One request a second, process-wide ───────────────────────────────── */
let nextSlot = 0;
async function politeWait(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const searchQuery = z.object({
  q: z.string().trim().min(2).max(120),
  /** ISO country code to bias towards. Defaults to Kenya. */
  country: z.string().length(2).optional(),
});

router.get("/search", requireOwner, async (req, res) => {
  const parsed = searchQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "type at least two letters" });

  const country = (parsed.data.country ?? "ke").toLowerCase();
  const key = `${country}:${parsed.data.q.toLowerCase()}`;

  const hit = cached(key);
  if (hit) return res.json({ places: hit, cached: true });

  try {
    await politeWait();
    const url = `${ENDPOINT}?${new URLSearchParams({
      q: parsed.data.q,
      format: "jsonv2",
      addressdetails: "0",
      limit: "6",
      countrycodes: country,
    })}`;

    const upstream = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "place search is unavailable right now", places: [] });
    }

    const raw = (await upstream.json()) as { display_name?: string; lat?: string; lon?: string }[];
    const places: Place[] = raw
      .filter((r) => r.lat && r.lon)
      .map((r) => ({
        label: String(r.display_name ?? "").split(",").slice(0, 3).join(", "),
        lat: Number(r.lat),
        lng: Number(r.lon),
      }));

    remember(key, places);
    res.json({ places, cached: false });
  } catch (err) {
    // Search being down must not stop anyone adding a workplace — the map and
    // "use my location" both still work without it.
    console.warn("[geo] search failed:", (err as Error).message);
    res.status(502).json({ error: "place search is unavailable right now", places: [] });
  }
});

export default { basePath: "/api/geo", router };
