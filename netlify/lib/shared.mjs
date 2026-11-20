import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

export const db = () => getDatabase();

/* ---------- Stacking bundle discount ----------
   Every item in the cart takes 10% off for each additional item, capped.
   1 item: 0%, 2 items: 10% off each, 3 items: 20% off each, 4+ items: 30% off each. */
export const STEP_PCT = 10;
export const MAX_PCT = 30;
export const discountPct = (count) => Math.min(Math.max(count - 1, 0) * STEP_PCT, MAX_PCT);

export function priceCart(items, products) {
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  const lines = [];
  for (const it of items) {
    const p = byId[it.id];
    const qty = Math.max(1, Math.min(6, parseInt(it.qty, 10) || 1));
    if (!p || !p.active) throw new HttpError(400, `Unknown or unavailable product: ${it.id}`);
    lines.push({ product: p, qty });
  }
  if (!lines.length) throw new HttpError(400, "Your plan is empty.");
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const pct = discountPct(count);
  let subtotal = 0, discount = 0, cost = 0;
  const out = lines.map(({ product: p, qty }) => {
    const gross = p.price_cents * qty;
    const d = Math.round((gross * pct) / 100);
    subtotal += gross; discount += d; cost += p.cost_cents * qty;
    return { product_id: p.id, name: p.name, qty, unit_price_cents: p.price_cents, unit_cost_cents: p.cost_cents, discount_cents: d, line_total_cents: gross - d };
  });
  return { lines: out, count, pct, subtotal, discount, total: subtotal - discount, cost };
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export function handle(fn) {
  return async (req, context) => {
    try { return await fn(req, context); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on our side. Please try again." }, 500);
    }
  };
}

/* ---------- Admin session (signed cookie) ---------- */
const COOKIE = "wh_admin";
const TTL_MS = 12 * 60 * 60 * 1000;
const secret = () => {
  const s = Netlify.env.get("ADMIN_SECRET");
  if (!s) throw new HttpError(500, "Admin login is not configured (ADMIN_SECRET missing).");
  return s;
};
const sign = (payload) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function sessionCookie(value, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSec}`;
}
/* Demo mode: the admin is open to anyone with the link until ADMIN_LOGIN is set to "on" in Netlify. */
export const loginRequired = () => Netlify.env.get("ADMIN_LOGIN") === "on";

export function isAdmin(req) {
  if (!loginRequired()) return true;
  const raw = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(COOKIE + "="));
  if (!raw) return false;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now(); } catch { return false; }
}
export function requireAdmin(req) {
  if (!isAdmin(req)) throw new HttpError(401, "Please sign in.");
}
export function checkPassword(given) {
  const real = Netlify.env.get("ADMIN_PASSWORD");
  if (!real) throw new HttpError(500, "Admin login is not configured (ADMIN_PASSWORD missing).");
  const a = crypto.createHash("sha256").update(String(given || "")).digest();
  const b = crypto.createHash("sha256").update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

export const stripeKeys = () => ({
  secret: Netlify.env.get("STRIPE_SECRET_KEY") || null,
  publishable: Netlify.env.get("STRIPE_PUBLISHABLE_KEY") || null,
  webhook: Netlify.env.get("STRIPE_WEBHOOK_SECRET") || null,
});
