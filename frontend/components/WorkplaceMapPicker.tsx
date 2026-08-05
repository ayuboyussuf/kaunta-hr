"use client";

/**
 * Placing a workplace on a map, instead of typing its coordinates.
 *
 * The form this replaces asked for latitude and longitude in two number boxes.
 * Nobody knows their own latitude. The realistic outcomes were: leave both
 * blank, in which case the geofence silently does nothing and a photographed QR
 * works from anywhere; or paste something wrong, in which case every scan is
 * flagged for being 4,000 km from work. Neither failure announces itself.
 *
 * So: search for the place, drag the pin onto the actual door, and see the
 * circle you are drawing. Coordinates are an output here, shown small, not
 * something anyone is asked for.
 *
 * The radius needs the same treatment. "100" is meaningless as a number and
 * obvious as a circle over a building, and the two things that decide whether a
 * radius is right — is my whole compound inside it, and could someone clock in
 * from the road outside — are visual questions. The warnings underneath are the
 * two mistakes that actually get made: too tight, so honest staff get flagged
 * by ordinary GPS drift; too loose, so the geofence stops meaning anything.
 *
 * OpenStreetMap tiles, no API key, no billing account between an owner and
 * their second shop.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";
import { api } from "@/lib/api";
import { LocateFixed, Search, Loader2 } from "lucide-react";

interface Place {
  label: string;
  lat: number;
  lng: number;
}

interface Props {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  onChange: (v: { lat: number; lng: number }) => void;
  onRadiusChange: (m: number) => void;
  token: string;
}

/** Nairobi, as a starting view when there is nothing else to go on. */
const DEFAULT_CENTRE: [number, number] = [-1.2921, 36.8219];

/**
 * What a radius means in things people can see.
 *
 * A number in metres is not something most people can picture; a comparison is.
 */
function radiusFeel(m: number): string {
  if (m <= 30) return "about a shop front";
  if (m <= 75) return "a forecourt or a small compound";
  if (m <= 150) return "a large compound — roughly a football pitch";
  if (m <= 400) return "a whole block";
  return "several blocks";
}

/**
 * The two ways a geofence goes wrong, both of which are silent.
 *
 * Phone GPS in a town is accurate to roughly 10–50 m, worse between tall
 * buildings and under cover. A radius tighter than that flags people who are
 * standing exactly where they should be.
 */
function radiusWarning(m: number): { tone: "warn" | "info"; text: string } | null {
  if (m < 50) {
    return {
      tone: "warn",
      text: "Tight. Phone GPS is usually accurate to 10–50 m, so staff standing in the right place may still be flagged.",
    };
  }
  if (m > 500) {
    return {
      tone: "warn",
      text: "Wide. Someone could clock in from well outside the premises without ever coming in.",
    };
  }
  if (m > 250) {
    return {
      tone: "info",
      text: "Generous — fine for a large yard, worth tightening for a single building.",
    };
  }
  return null;
}

export default function WorkplaceMapPicker({
  lat,
  lng,
  radiusM,
  onChange,
  onRadiusChange,
  token,
}: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const circle = useRef<Circle | null>(null);

  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Keep the newest handler without re-running the map setup effect, which
  // would tear down and rebuild the map on every parent render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* ── Build the map once, on the client ──────────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Leaflet touches `window` at import time, so it cannot be imported at
      // module scope in a server-rendered app.
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !holder.current || map.current) return;

      const start: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTRE;
      const m = L.map(holder.current, { attributionControl: true, zoomControl: true }).setView(
        start,
        lat != null ? 18 : 12
      );

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(m);

      // A div icon rather than Leaflet's default PNG: the default resolves its
      // image by relative URL and breaks under a bundler, and this way the pin
      // is the app's own blue.
      const icon = L.divIcon({
        className: "",
        html:
          '<div style="width:22px;height:22px;border-radius:50%;background:#1E3FD8;' +
          'border:3px solid #fff;box-shadow:0 2px 8px rgba(6,9,15,.45)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const mk = L.marker(start, { draggable: true, icon }).addTo(m);
      const ci = L.circle(start, {
        radius: radiusM,
        color: "#1E3FD8",
        weight: 2,
        fillColor: "#1E3FD8",
        fillOpacity: 0.12,
      }).addTo(m);

      const move = (p: { lat: number; lng: number }) => {
        mk.setLatLng(p);
        ci.setLatLng(p);
        onChangeRef.current({
          lat: Number(p.lat.toFixed(6)),
          lng: Number(p.lng.toFixed(6)),
        });
      };

      mk.on("dragend", () => move(mk.getLatLng()));
      // Tapping the map moves the pin too — on a phone, dragging a 22px target
      // is fiddly and tapping where you mean is not.
      m.on("click", (e: { latlng: { lat: number; lng: number } }) => move(e.latlng));

      map.current = m;
      marker.current = mk;
      circle.current = ci;
      setReady(true);

      // Tiles render into a container that may still have been sizing itself.
      setTimeout(() => m.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // Built once. Later coordinate changes are pushed in by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Reflect prop changes onto the map ──────────────────────────────── */
  useEffect(() => {
    if (!ready || lat == null || lng == null) return;
    const at: [number, number] = [lat, lng];
    marker.current?.setLatLng(at);
    circle.current?.setLatLng(at);
  }, [ready, lat, lng]);

  useEffect(() => {
    circle.current?.setRadius(radiusM);
  }, [radiusM]);

  /* ── Finding the place ──────────────────────────────────────────────── */

  const goTo = useCallback((p: { lat: number; lng: number }, zoom = 18) => {
    map.current?.setView([p.lat, p.lng], zoom);
    onChangeRef.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
    setResults(null);
  }, []);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setNote(null);
    try {
      const r = await api<{ places: Place[] }>(
        `/api/geo/search?q=${encodeURIComponent(query.trim())}`,
        { token }
      );
      setResults(r.places ?? []);
      if ((r.places ?? []).length === 0) {
        setNote("Nothing found. Try a nearby landmark, or drag the pin yourself.");
      }
    } catch {
      setNote("Search isn't reachable. You can still drag the pin or use your location.");
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote("This device won't share its location.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        goTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setNote("Couldn't read your location. Search for the place instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const warning = radiusWarning(radiusM);

  return (
    <div className="space-y-3">
      {/* Search + my location */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <form onSubmit={search} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kaunta-slate/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the area — e.g. Kaplong town, Ngong Road"
            className="min-h-[44px] w-full rounded-lg border border-kaunta-mist bg-white pl-9 pr-3 text-sm outline-none focus:border-kaunta-ultra"
          />
        </form>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-kaunta-mist bg-white px-4 text-sm text-kaunta-slate hover:border-kaunta-ultra/40"
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
          I&apos;m here now
        </button>
      </div>

      {searching && <p className="text-xs text-kaunta-slate/60">Searching…</p>}

      {results && results.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-kaunta-mist bg-white">
          {results.map((p, i) => (
            <li key={`${p.lat}-${p.lng}-${i}`}>
              <button
                type="button"
                onClick={() => goTo(p)}
                className="w-full px-3 py-3 text-left text-sm text-kaunta-ink hover:bg-kaunta-stone"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="text-xs text-kaunta-slate/70">{note}</p>}

      {/* The map */}
      <div
        ref={holder}
        className="h-[300px] w-full overflow-hidden rounded-xl border border-kaunta-mist sm:h-[380px]"
      />
      <p className="text-xs text-kaunta-slate/60">
        Drag the pin — or tap the map — onto the spot where the QR code will be
        put up. The circle is how far from it a scan still counts.
      </p>

      {/* Radius */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label htmlFor="radius" className="text-xs font-medium text-kaunta-slate">
            How far from the pin still counts
          </label>
          <span className="text-sm tabular-nums text-kaunta-ink">
            {radiusM} m{" "}
            <span className="text-kaunta-slate/60">· {radiusFeel(radiusM)}</span>
          </span>
        </div>
        <input
          id="radius"
          type="range"
          min={20}
          max={800}
          step={10}
          value={radiusM}
          onChange={(e) => onRadiusChange(Number(e.target.value))}
          className="mt-2 h-11 w-full accent-kaunta-ultra"
        />
        {warning && (
          <p
            className={`mt-1 text-xs ${
              warning.tone === "warn" ? "text-kaunta-amber" : "text-kaunta-slate/70"
            }`}
          >
            {warning.text}
          </p>
        )}
      </div>

      {/* Coordinates as an output, not a question */}
      <p className="font-mono text-[0.6875rem] text-kaunta-slate/50">
        {lat != null && lng != null
          ? `${lat}, ${lng}`
          : "No spot chosen yet — scans here won't be checked against a location."}
      </p>
    </div>
  );
}
