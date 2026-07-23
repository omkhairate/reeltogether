const CACHE = "reeltogether-v3";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      } catch {
        return cached ?? Response.error();
      }
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "ReelTogether", body: "Your shared list has an update.", url: "/reeltogether/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    // Keep the friendly fallback notification.
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "reeltogether-pair-update",
    data: { url: data.url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/reeltogether/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if ("focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
