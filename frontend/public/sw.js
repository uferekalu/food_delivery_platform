// Web push notifications (docs/ROADMAP.md FDP-100) — a minimal service worker for push only, no
// manifest/installability (PWA installability was explicitly scoped out, see docs/ROADMAP.md).
// This is only ever registered on-demand, from an explicit "enable push notifications" action
// (see frontend/src/lib/push-notifications.ts) — never automatically on page load.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // A malformed/non-JSON payload shouldn't crash the service worker — fall back to a generic
    // notification rather than dropping it silently.
  }

  const title = data.title || "New notification";
  const options = {
    body: data.body || "",
    icon: "/icon.svg",
    data: { url: data.url || "/notifications" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
      return undefined;
    }),
  );
});
