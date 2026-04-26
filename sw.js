const CACHE_VERSION = "cashier-offline-v1.0.3";
const RUNTIME_CACHE = "cashier-runtime-v1.0.3";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./firebase-config.js",

  "https://cdn.tailwindcss.com",
  "https://unpkg.com/@zxing/library@latest",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        return Promise.allSettled(
          APP_SHELL.map(url =>
            fetch(url, { cache: "reload" })
              .then(res => {
                if (!res || !res.ok) {
                  throw new Error("Bad response: " + url);
                }
                return cache.put(url, res);
              })
              .catch(err => {
                console.warn("Cache failed:", url, err);
              })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  const isFirebaseRequest =
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("firebasedatabase.app") ||
    url.hostname.includes("googleapis.com") ||
    (url.hostname.includes("gstatic.com") && url.pathname.includes("firebase"));

  if (isFirebaseRequest) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({
          offline: true,
          message: "Firebase غير متاح بدون إنترنت، البيانات محفوظة محليًا"
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json;charset=utf-8"
          }
        });
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();

          caches.open(CACHE_VERSION)
            .then(cache => {
              cache.put("./index.html", copy).catch(() => {});
            })
            .catch(() => {});

          return res;
        })
        .catch(async () => {
          const cachedIndex =
            await caches.match("./index.html") ||
            await caches.match("./") ||
            await caches.match(req);

          return cachedIndex || new Response(
            `
            <!doctype html>
            <html lang="ar" dir="rtl">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width,initial-scale=1">
              <title>التطبيق غير محفوظ</title>
              <style>
                body{
                  margin:0;
                  min-height:100vh;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  font-family:Arial,sans-serif;
                  background:#eef3f9;
                  color:#0f172a;
                  text-align:center;
                  padding:24px;
                }
                .box{
                  background:white;
                  border-radius:24px;
                  padding:24px;
                  box-shadow:0 20px 50px rgba(15,23,42,.12);
                  max-width:420px;
                }
                h2{margin:0 0 10px}
                p{color:#64748b;line-height:1.8}
              </style>
            </head>
            <body>
              <div class="box">
                <h2>التطبيق غير محفوظ بعد</h2>
                <p>افتح التطبيق مرة واحدة مع الإنترنت، ثم سيعمل بدون نت حتى عند تحديث الصفحة.</p>
              </div>
            </body>
            </html>
            `,
            {
              status: 200,
              headers: {
                "Content-Type": "text/html;charset=utf-8"
              }
            }
          );
        })
    );
    return;
  }

  if (
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "font" ||
    req.destination === "image" ||
    req.destination === "manifest"
  ) {
    event.respondWith(
      caches.match(req).then(cached => {
        const networkFetch = fetch(req)
          .then(res => {
            if (res && res.ok) {
              const copy = res.clone();

              caches.open(RUNTIME_CACHE)
                .then(cache => {
                  cache.put(req, copy).catch(() => {});
                })
                .catch(() => {});
            }

            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();

          caches.open(RUNTIME_CACHE)
            .then(cache => {
              cache.put(req, copy).catch(() => {});
            })
            .catch(() => {});
        }

        return res;
      })
      .catch(() => caches.match(req))
  );
});