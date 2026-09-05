"use client";

import { useCallback, useState } from "react";

export interface Coordinates {
  lat: number;
  lng: number;
}

export type GeolocationErrorReason = "unsupported" | "denied" | "unavailable" | "timeout";

interface GeolocationState {
  status: "idle" | "loading" | "success" | "error";
  coords: Coordinates | null;
  errorReason: GeolocationErrorReason | null;
}

/**
 * "Restaurants/stores near me" (docs/ROADMAP.md FDP-96) — a thin wrapper around the browser's
 * Geolocation API. Deliberately request-on-demand (`request()`), never called automatically on
 * mount: `getCurrentPosition` triggers a real browser permission prompt, and firing that the
 * instant a page loads (before the visitor has any context for why a site wants their location)
 * is a well-documented way to get it reflexively denied — the calling page decides when asking
 * makes sense (e.g. a visible "Use my location" button).
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    status: "idle",
    coords: null,
    errorReason: null,
  });

  const request = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "error", coords: null, errorReason: "unsupported" });
      return;
    }

    setState((prev) => ({ ...prev, status: "loading", errorReason: null }));
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: "success",
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          errorReason: null,
        });
      },
      (error) => {
        // GeolocationPositionError codes are stable across browsers: 1 = PERMISSION_DENIED,
        // 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        const reason: GeolocationErrorReason =
          error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable";
        setState({ status: "error", coords: null, errorReason: reason });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }, []);

  return { ...state, request };
}
