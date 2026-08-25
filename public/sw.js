/**
 * Service Worker — 只處理推播通知，刻意不做任何快取。
 *
 * 為什麼不快取：這個 app 的每一頁都是伺服器即時算出來的（報表、資產、報價），
 * 快取住只會讓你看到過期的數字，而且很難察覺。離線也沒有意義——
 * 所有資料都在 Supabase，沒網路時連上個月花多少都看不到。
 *
 * 沒有 fetch handler 不影響安裝：Chrome 現在判斷可安裝性只看 manifest。
 */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 推播內容壞掉也要顯示通知，不然使用者完全不知道發生什麼事
  }

  const title = payload.title || "記帳提醒";
  const options = {
    body: payload.body || "今天還沒記帳，花一分鐘補一下吧",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // 同一個 tag 會取代舊通知，避免累積一堆重複提醒
    tag: payload.tag || "daily-reminder",
    renotify: false,
    data: { url: payload.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        // 已經開著就聚焦過去，不要再開一個分頁
        for (const client of windows) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(target);
      }),
  );
});
