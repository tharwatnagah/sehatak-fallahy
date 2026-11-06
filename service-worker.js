const CACHE_NAME = "sehatak-fallahy-v4";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});
// استقبال الإشعارات
self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "صحتك فلاحي";

  const options = {
    body: data.body || "يوجد تحديث جديد في التطبيق.",
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: {
      url: data.url || "./"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// عند الضغط على الإشعار
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "./";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      return clients.openWindow(url);
    })
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);

      return cached || (
        request.mode === "navigate"
          ? caches.match("./index.html")
          : Response.error()
      );
    })
  );
});
