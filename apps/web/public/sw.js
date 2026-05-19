const CACHE_NAME = "taller-app-shell-v2";
const APP_SHELL = [
  "/",
  "/inicio",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Never cache API/auth requests.
  if (url.pathname.startsWith("/api/")) return;
  const isStaticAsset =
    url.pathname.startsWith("/_next/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".webp") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname === "/manifest.webmanifest";

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached && isStaticAsset) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!isStaticAsset || !response.ok) return response;
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/inicio"));
    }),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Talleres MALU", body: "Tienes una notificación", url: "/avisos" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // ignore invalid payload
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url ?? "/avisos" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url ?? "/avisos";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const same = windows.find((w) => "focus" in w);
      if (same) {
        same.focus();
        if ("navigate" in same) return same.navigate(target);
        return undefined;
      }
      return clients.openWindow(target);
    }),
  );
});
