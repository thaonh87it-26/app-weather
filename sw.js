// Service worker: mở app ngay từ bộ nhớ đệm (không chờ mạng), cập nhật ngầm cho lần mở sau.
// Dữ liệu thời tiết vẫn cần mạng.
const C = "thoitiet-v28";
const LOGC = "tplog";      // nhật ký của service worker (xem trong app: Cài đặt › Nhật ký khởi động)
let slogQ = Promise.resolve();   // xếp hàng để các lần ghi không đè lên nhau
function slog(msg){        // ghi tối đa 40 dòng gần nhất vào Cache API
  slogQ = slogQ.then(() => caches.open(LOGC).then(c => c.match("/__log").then(r => r ? r.json() : []).then(a => {
    a.push([Date.now(), msg]); if (a.length > 40) a.splice(0, a.length - 40);
    return c.put("/__log", new Response(JSON.stringify(a)));
  }))).catch(() => {});
  return slogQ;
}
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => {
  // Thiếu một file trong danh sách cũng không làm hỏng việc cài service worker
  e.waitUntil(caches.open(C).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => slog("install " + C)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C && x !== LOGC).map(x => caches.delete(x)))));
  self.clients.claim();
  e.waitUntil(slog("activate " + C));
});
const dau = r => [r.headers.get("etag"), r.headers.get("last-modified"), r.headers.get("content-length")].join("|");
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
  e.respondWith((async () => {
    const cache = await caches.open(C), nav = e.request.mode === "navigate", t0 = Date.now();
    const hit = await cache.match(e.request, {ignoreSearch: true});
    if (nav) e.waitUntil(slog("mở trang: " + (hit ? "có sẵn trong cache" : "chưa có cache") + " " + u.pathname.slice(-24)));
    const net = fetch(e.request).then(r => {
      if (nav) e.waitUntil(slog("mạng trả " + r.status + " sau " + (Date.now() - t0) + "ms"));
      if (r && r.ok) {
        cache.put(e.request, r.clone());
        if (hit && dau(hit) !== dau(r) && e.request.mode === "navigate")      // có bản mới: báo cho app
          self.clients.matchAll().then(l => l.forEach(c => c.postMessage("upd")));
      }
      return r;
    }, err => { if (nav) e.waitUntil(slog("mạng LỖI sau " + (Date.now() - t0) + "ms")); throw err; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }                 // có sẵn: mở ngay, cập nhật ngầm
    try { return await Promise.race([net, new Promise((_, j) => setTimeout(j, 8000))]); }   // chưa có: chờ mạng tối đa 8 giây
    catch (_) { if (nav) e.waitUntil(slog("hết 8s/lỗi mạng, dùng cache dự phòng")); return (await cache.match("./index.html")) || new Response("Offline", {status: 503}); }
  })());
});
// Bấm vào thông báo: mở lại ứng dụng
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(l => {
    for(const c of l){ if("focus" in c) return c.focus(); }
    return self.clients.openWindow("./");
  }));
});
