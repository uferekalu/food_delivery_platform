"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useGetPushPublicKeyQuery,
  useSubscribeToPushMutation,
  useUnsubscribeFromPushMutation,
} from "@/lib/redux/services/notifications-api";

export type PushErrorReason = "unsupported" | "permission-denied" | "failed";

// A VAPID public key arrives base64url-encoded (browser-safe base64, `-`/`_` instead of `+`/`/`,
// no padding) but `pushManager.subscribe()`'s `applicationServerKey` needs a raw `Uint8Array`.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

/**
 * Web push (docs/ROADMAP.md FDP-100) — mirrors `useGeolocation()`'s on-demand-only shape: the
 * service worker is registered and permission is requested only from `subscribe()`, an explicit
 * user action (a "Enable push notifications" toggle), never automatically on mount. Firing a
 * permission prompt before the visitor has context is a well-documented way to get it reflexively
 * denied, and per this codebase's own precedent (§7 of docs/ARCHITECTURE.md), silent background
 * registration is exactly what to avoid (same reasoning as `useGeolocation()`, docs/ROADMAP.md
 * FDP-96).
 */
export function usePushNotifications() {
  const supported =
    typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof window !== "undefined" && "PushManager" in window;

  const { data: keyData } = useGetPushPublicKeyQuery(undefined, { skip: !supported });
  const [subscribeMutation, { isLoading: subscribing }] = useSubscribeToPushMutation();
  const [unsubscribeMutation, { isLoading: unsubscribing }] = useUnsubscribeFromPushMutation();

  const [isSubscribed, setIsSubscribed] = useState(false);
  // Lazily seeded to `true` when unsupported, rather than set from inside the effect below —
  // there's nothing to check asynchronously in that case, so it needs no effect at all (avoids
  // a synchronous setState-in-effect, which the React Compiler's `set-state-in-effect` rule
  // flags — see frontend/CLAUDE.md).
  const [checked, setChecked] = useState(() => !supported);
  const [error, setError] = useState<PushErrorReason | null>(null);

  const configured = !!keyData?.publicKey;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) {
          setIsSubscribed(!!subscription);
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported) {
      setError("unsupported");
      return;
    }
    if (!keyData?.publicKey) return;

    setError(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("permission-denied");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's DOM lib types `Uint8Array` generically over `ArrayBufferLike` (which includes
        // `SharedArrayBuffer`), while `applicationServerKey` narrowly wants one backed by a real
        // `ArrayBuffer` — a real mismatch in the lib types, not in what the browser actually
        // accepts at runtime, hence the cast.
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        setError("failed");
        return;
      }

      await subscribeMutation({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }).unwrap();
      setIsSubscribed(true);
    } catch {
      setError("failed");
    }
  }, [supported, keyData, subscribeMutation]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    setError(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await unsubscribeMutation({ endpoint: subscription.endpoint }).unwrap();
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } catch {
      setError("failed");
    }
  }, [supported, unsubscribeMutation]);

  return {
    supported,
    configured,
    checked,
    isSubscribed,
    isBusy: subscribing || unsubscribing,
    error,
    subscribe,
    unsubscribe,
  };
}
