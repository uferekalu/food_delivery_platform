"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { semantic, neutral } from "@/styles/tokens";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LiveDeliveryMapProps {
  /** Updates on every `order:riderLocation` socket event; null until the rider's first ping
   * arrives after the customer opens the tracking page (docs/ROADMAP.md FDP-17 — location is
   * relayed live, not persisted, so there's no historical position to seed with). */
  riderLocation: LatLng | null;
  /** The delivery address's geocoded position, if the customer supplied one (FDP-15's "use my
   * current location" at checkout). Shown as a fixed pin; omitted if unavailable. */
  destination?: LatLng | null;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * Self-contained live map — degrades to rendering nothing when `NEXT_PUBLIC_MAPBOX_TOKEN` isn't
 * configured (docs/ARCHITECTURE.md §10), so the caller can unconditionally render this next to
 * the status Stepper without checking the token itself; the Stepper alone covers tracking when
 * this returns null.
 */
export function LiveDeliveryMap({ riderLocation, destination }: LiveDeliveryMapProps) {
  const t = useTranslations("LiveDeliveryMap");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const riderMarkerRef = useRef<mapboxgl.Marker | null>(null);

  // Map init only depends on the destination's identity (a genuinely new order to display) —
  // rider position updates move the existing marker in the effect below instead of tearing
  // down and recreating the whole map on every GPS ping.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const center = destination ?? riderLocation ?? { lat: 6.5244, lng: 3.3792 };
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [center.lng, center.lat],
      zoom: 13,
    });
    mapRef.current = map;

    if (destination) {
      new mapboxgl.Marker({ color: neutral[600] }).setLngLat([destination.lng, destination.lat]).addTo(map);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      riderMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above: only re-init on destination change
  }, [destination?.lat, destination?.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !riderLocation) return;

    if (!riderMarkerRef.current) {
      riderMarkerRef.current = new mapboxgl.Marker({ color: semantic.primary })
        .setLngLat([riderLocation.lng, riderLocation.lat])
        .addTo(map);
    } else {
      riderMarkerRef.current.setLngLat([riderLocation.lng, riderLocation.lat]);
    }
    map.panTo([riderLocation.lng, riderLocation.lat]);
  }, [riderLocation]);

  if (!MAPBOX_TOKEN) return null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-lg border border-border" />
      {!riderLocation && <p className="text-sm text-text-muted">{t("waitingForLocation")}</p>}
    </div>
  );
}
