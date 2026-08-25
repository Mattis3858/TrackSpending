/**
 * Web Push 共用工具 — 見 SPEC 8.9
 *
 * 客戶端與伺服器端都會用到的純函式放這裡，方便離線測試。
 */

/**
 * VAPID 公鑰是 base64url 字串，但 pushManager.subscribe() 要 Uint8Array。
 * 這段轉換是 Web Push 的標準樣板，寫錯會得到很難懂的 InvalidAccessError。
 */
export function urlBase64ToUint8Array(
  base64String: string,
): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);

  // 明確從 ArrayBuffer 建立：pushManager.subscribe 的 applicationServerKey
  // 要的是 BufferSource，而 new Uint8Array(number) 的型別是 ArrayBufferLike，
  // TypeScript 5.7 之後兩者不相容。
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** 從 User-Agent 粗略判斷裝置，讓使用者辨認要取消哪一台 */
export function describeDevice(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("android")) return "Android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iOS";
  if (ua.includes("windows")) return "Windows";
  if (ua.includes("mac")) return "Mac";
  return "其他裝置";
}

/** 推播服務商回這些狀態碼代表訂閱已失效，應該從資料庫刪掉 */
export function isGoneStatus(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
