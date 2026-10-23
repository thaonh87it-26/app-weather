// Service worker: giúp app mở được nhanh và có "vỏ" khi mạng yếu (dữ liệu thời tiết vẫn cần mạng)
const C = "thoitiet-v26";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
// Thiếu một file trong danh sách cũng không làm hỏng việc cài service worker (cần cho thông báo)
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {}))))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) {
    // Thư viện đọc mã QR (jsQR) tải từ CDN: lưu lại sau lần đầu để lần sau dùng được khi mất mạng
    if (/^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)$/.test(u.hostname) && /jsqr/i.test(u.pathname)) {
      e.respondWith(caches.match(e.request).then(m => m || fetch(e.request).then(r => {
        if (r && (r.ok || r.type === "opaque")) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); }
        return r;
      })));
    }
    return;
  }
  // Ưu tiên bản mới từ mạng; mất mạng thì dùng bản đã lưu
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, {ignoreSearch:true})));
});
// Bấm vào thông báo: mở lại ứng dụng
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(l => {
    for(const c of l){ if("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
