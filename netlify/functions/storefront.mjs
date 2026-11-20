import Stripe from "stripe";
import { db, priceCart, json, handle, HttpError, stripeKeys, STEP_PCT, MAX_PCT } from "../lib/shared.mjs";

const clean = (v, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function loadProducts() {
  return db().sql`SELECT id, name, kind, format, price_cents, cost_cents, active FROM products ORDER BY sort`;
}

export default handle(async (req, context) => {
  const url = new URL(req.url);

  // GET /api/catalog: public prices + checkout config (never exposes cost)
  if (url.pathname === "/api/catalog" && req.method === "GET") {
    const products = await loadProducts();
    return json({
      products: products.filter((p) => p.active).map(({ cost_cents, ...p }) => p),
      discount: { stepPct: STEP_PCT, maxPct: MAX_PCT },
      stripePublishableKey: stripeKeys().publishable,
    });
  }

  // POST /api/checkout: create member + order; authorize payment with Stripe when configured
  if (url.pathname === "/api/checkout" && req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) throw new HttpError(400, "Invalid request.");
    const c = body.customer || {}, a = body.address || {}, s = body.safety || {};
    const customer = {
      first: clean(c.first_name, 60), last: clean(c.last_name, 60), email: clean(c.email, 120).toLowerCase(),
      phone: clean(c.phone, 30), state: clean(a.state, 40), dob: /^\d{4}-\d{2}-\d{2}$/.test(c.dob || "") ? c.dob : null,
      source: clean(c.source, 60),
    };
    if (!customer.first || !customer.last) throw new HttpError(400, "Please enter your first and last name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new HttpError(400, "Please enter a valid email address.");
    const address = { line1: clean(a.line1), line2: clean(a.line2), city: clean(a.city, 80), state: customer.state, zip: clean(a.zip, 12) };
    if (!address.line1 || !address.city || !address.state || !/^\d{5}(-\d{4})?$/.test(address.zip)) throw new HttpError(400, "Please complete your shipping address.");
    const safety = { ttc: !!s.ttc, thyroid: !!s.thyroid, pancreatitis: !!s.pancreatitis, medications: clean(s.medications, 1000) };
    if (!body.consent) throw new HttpError(400, "Please agree to the terms to continue.");

    const priced = priceCart(Array.isArray(body.items) ? body.items.slice(0, 20) : [], await loadProducts());
    const sql = db().sql;

    const [member] = await sql`
      INSERT INTO members (first_name, last_name, email, phone, state, dob, source)
      VALUES (${customer.first}, ${customer.last}, ${customer.email}, ${customer.phone}, ${customer.state}, ${customer.dob}, ${customer.source})
      ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
        phone = COALESCE(NULLIF(EXCLUDED.phone, ''), members.phone), state = EXCLUDED.state, dob = COALESCE(EXCLUDED.dob, members.dob)
      RETURNING id`;

    const keys = stripeKeys();
    const flagged = safety.ttc || safety.thyroid || safety.pancreatitis;
    const [order] = await sql`
      INSERT INTO orders (number, member_id, status, payment_status, item_count, discount_pct, subtotal_cents, discount_cents, total_cents, cost_cents, ship_address, safety, notes)
      VALUES ('WH-' || nextval('order_number_seq'), ${member.id}, 'pending_review', ${keys.secret ? "awaiting_payment" : "demo"},
        ${priced.count}, ${priced.pct}, ${priced.subtotal}, ${priced.discount}, ${priced.total}, ${priced.cost},
        ${JSON.stringify(address)}::jsonb, ${JSON.stringify(safety)}::jsonb, ${flagged ? "Safety screen flagged: review before approving." : null})
      RETURNING id, number`;
    for (const l of priced.lines) {
      await sql`INSERT INTO order_items (order_id, product_id, name, qty, unit_price_cents, unit_cost_cents, discount_cents, line_total_cents)
        VALUES (${order.id}, ${l.product_id}, ${l.name}, ${l.qty}, ${l.unit_price_cents}, ${l.unit_cost_cents}, ${l.discount_cents}, ${l.line_total_cents})`;
    }

    let clientSecret = null;
    if (keys.secret) {
      const stripe = new Stripe(keys.secret);
      const pi = await stripe.paymentIntents.create({
        amount: priced.total,
        currency: "usd",
        capture_method: "manual", // hold funds; captured when Jamie approves the prescription
        receipt_email: customer.email,
        description: `The Wellness House order ${order.number}`,
        metadata: { order_id: String(order.id), order_number: order.number },
        automatic_payment_methods: { enabled: true },
      }, { idempotencyKey: `order-${order.id}` });
      await sql`UPDATE orders SET stripe_payment_intent = ${pi.id} WHERE id = ${order.id}`;
      clientSecret = pi.client_secret;
    }

    return json({ orderNumber: order.number, total: priced.total, pct: priced.pct, clientSecret, demo: !keys.secret });
  }

  // POST /api/stripe/webhook: keep order payment status in sync with Stripe
  if (url.pathname === "/api/stripe/webhook" && req.method === "POST") {
    const keys = stripeKeys();
    if (!keys.secret || !keys.webhook) return json({ error: "Stripe is not configured." }, 400);
    const stripe = new Stripe(keys.secret);
    let event;
    try { event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature"), keys.webhook); }
    catch { return json({ error: "Invalid signature." }, 400); }
    const pi = event.data.object;
    const map = {
      "payment_intent.amount_capturable_updated": "authorized",
      "payment_intent.succeeded": "paid",
      "payment_intent.payment_failed": "failed",
      "payment_intent.canceled": "voided",
    };
    if (map[event.type] && pi?.id) await db().sql`UPDATE orders SET payment_status = ${map[event.type]} WHERE stripe_payment_intent = ${pi.id}`;
    return json({ received: true });
  }

  return json({ error: "Not found." }, 404);
});

export const config = { path: ["/api/catalog", "/api/checkout", "/api/stripe/webhook"] };
