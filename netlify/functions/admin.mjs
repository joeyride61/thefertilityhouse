import Stripe from "stripe";
import { ensureWill } from "../lib/stackr.mjs";
import { db, json, handle, HttpError, requireAdmin, isAdmin, loginRequired, makeSession, sessionCookie, checkPassword, stripeKeys } from "../lib/shared.mjs";

const NEXT = {
  approve: { from: ["pending_review"], to: "approved", stamp: "approved_at" },
  ship: { from: ["approved"], to: "shipped", stamp: "shipped_at" },
  deliver: { from: ["shipped"], to: "delivered" },
  cancel: { from: ["pending_review", "approved"], to: "cancelled" },
};

export default handle(async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/admin\/?/, "");
  const parts = path.split("/").filter(Boolean);
  const sql = db().sql;

  if (parts[0] === "login" && req.method === "POST") {
    const { password } = await req.json().catch(() => ({}));
    if (!checkPassword(password)) {
      await new Promise((r) => setTimeout(r, 600));
      throw new HttpError(401, "That password isn't right.");
    }
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(makeSession(), 12 * 3600) });
  }
  if (parts[0] === "logout" && req.method === "POST") return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  if (parts[0] === "me") return json({ signedIn: isAdmin(req), login: loginRequired(), stripe: !!stripeKeys().secret });

  requireAdmin(req);
  await ensureWill(sql);

  if (parts[0] === "dashboard") {
    const [k] = await sql`
      SELECT
        COALESCE(SUM(total_cents) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status <> 'cancelled'), 0)::int AS revenue30,
        COALESCE(SUM(total_cents - cost_cents) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status <> 'cancelled'), 0)::int AS profit30,
        COALESCE(SUM(discount_cents) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status <> 'cancelled'), 0)::int AS discounts30,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND status <> 'cancelled')::int AS orders30,
        COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'approved')::int AS to_ship,
        COUNT(DISTINCT member_id) FILTER (WHERE created_at > NOW() - INTERVAL '40 days' AND status <> 'cancelled')::int AS active_members
      FROM orders`;
    const [m] = await sql`SELECT COUNT(*)::int AS members FROM members`;
    const weekly = await sql`
      SELECT to_char(date_trunc('week', created_at), 'Mon DD') AS week, date_trunc('week', created_at) AS w,
        SUM(total_cents)::int AS revenue, SUM(total_cents - cost_cents)::int AS profit, COUNT(*)::int AS orders
      FROM orders WHERE status <> 'cancelled' AND created_at > NOW() - INTERVAL '12 weeks'
      GROUP BY 1, 2 ORDER BY 2`;
    const top = await sql`
      SELECT oi.product_id, oi.name, SUM(oi.qty)::int AS units, SUM(oi.line_total_cents)::int AS revenue,
        SUM(oi.line_total_cents - oi.unit_cost_cents * oi.qty)::int AS profit
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'cancelled' AND o.created_at > NOW() - INTERVAL '30 days'
      GROUP BY 1, 2 ORDER BY revenue DESC`;
    const queue = await sql`
      SELECT o.id, o.number, o.status, o.total_cents, o.created_at, o.notes, m.first_name, m.last_name
      FROM orders o JOIN members m ON m.id = o.member_id
      WHERE o.status IN ('pending_review', 'approved') ORDER BY o.created_at`;
    return json({ kpis: { ...k, members: m.members }, weekly, top, queue });
  }

  if (parts[0] === "orders" && !parts[1]) {
    const status = url.searchParams.get("status") || "";
    const q = `%${(url.searchParams.get("q") || "").toLowerCase()}%`;
    const rows = await sql`
      SELECT o.id, o.number, o.status, o.payment_status, o.item_count, o.discount_pct, o.total_cents, o.cost_cents, o.created_at,
        m.id AS member_id, m.first_name, m.last_name, m.state,
        (SELECT string_agg(name, ', ' ORDER BY id) FROM order_items WHERE order_id = o.id) AS items
      FROM orders o JOIN members m ON m.id = o.member_id
      WHERE (${status} = '' OR o.status = ${status})
        AND (lower(m.first_name || ' ' || m.last_name || ' ' || m.email || ' ' || o.number) LIKE ${q})
      ORDER BY o.created_at DESC LIMIT 300`;
    return json({ orders: rows });
  }

  if (parts[0] === "orders" && parts[1] && !parts[2]) {
    const [order] = await sql`
      SELECT o.*, m.first_name, m.last_name, m.email, m.phone, m.state AS member_state
      FROM orders o JOIN members m ON m.id = o.member_id WHERE o.id = ${parseInt(parts[1], 10)}`;
    if (!order) throw new HttpError(404, "Order not found.");
    const items = await sql`SELECT * FROM order_items WHERE order_id = ${order.id} ORDER BY id`;
    return json({ order, items });
  }

  if (parts[0] === "orders" && parts[2] && req.method === "POST") {
    const step = NEXT[parts[2]];
    if (!step) throw new HttpError(400, "Unknown action.");
    const id = parseInt(parts[1], 10);
    const [order] = await sql`SELECT id, status, payment_status, stripe_payment_intent FROM orders WHERE id = ${id}`;
    if (!order) throw new HttpError(404, "Order not found.");
    if (!step.from.includes(order.status)) throw new HttpError(409, `Can't ${parts[2]} an order that is ${order.status.replace("_", " ")}.`);

    let payment = order.payment_status;
    const keys = stripeKeys();
    if (order.stripe_payment_intent && keys.secret) {
      const stripe = new Stripe(keys.secret);
      if (parts[2] === "approve") {
        const pi = await stripe.paymentIntents.capture(order.stripe_payment_intent).catch((e) => { throw new HttpError(402, `Stripe couldn't capture the payment: ${e.message}`); });
        payment = pi.status === "succeeded" ? "paid" : pi.status;
      }
      if (parts[2] === "cancel") {
        if (order.payment_status === "paid") { await stripe.refunds.create({ payment_intent: order.stripe_payment_intent }); payment = "refunded"; }
        else { await stripe.paymentIntents.cancel(order.stripe_payment_intent).catch(() => null); payment = "voided"; }
      }
    } else if (parts[2] === "approve") payment = "paid";
    else if (parts[2] === "cancel") payment = order.payment_status === "paid" ? "refunded" : "voided";

    if (step.stamp === "approved_at") await sql`UPDATE orders SET status = ${step.to}, payment_status = ${payment}, approved_at = NOW() WHERE id = ${id}`;
    else if (step.stamp === "shipped_at") await sql`UPDATE orders SET status = ${step.to}, payment_status = ${payment}, shipped_at = NOW() WHERE id = ${id}`;
    else await sql`UPDATE orders SET status = ${step.to}, payment_status = ${payment} WHERE id = ${id}`;
    return json({ ok: true, status: step.to, payment_status: payment });
  }

  if (parts[0] === "members" && !parts[1]) {
    const q = `%${(url.searchParams.get("q") || "").toLowerCase()}%`;
    const rows = await sql`
      SELECT m.id, m.first_name, m.last_name, m.email, m.phone, m.state, m.source, m.created_at,
        COUNT(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders,
        COALESCE(SUM(o.total_cents) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS ltv,
        COALESCE(SUM(o.total_cents - o.cost_cents) FILTER (WHERE o.status <> 'cancelled'), 0)::int AS profit,
        MAX(o.created_at) AS last_order,
        (SELECT string_agg(DISTINCT oi.name, ', ') FROM order_items oi JOIN orders o2 ON o2.id = oi.order_id
           WHERE o2.member_id = m.id AND o2.created_at > NOW() - INTERVAL '45 days' AND o2.status <> 'cancelled') AS current_plan
      FROM members m LEFT JOIN orders o ON o.member_id = m.id
      WHERE lower(m.first_name || ' ' || m.last_name || ' ' || m.email) LIKE ${q}
      GROUP BY m.id ORDER BY last_order DESC NULLS LAST`;
    return json({ members: rows });
  }

  if (parts[0] === "members" && parts[1]) {
    const id = parseInt(parts[1], 10);
    if (req.method === "PUT") {
      const { notes } = await req.json().catch(() => ({}));
      await sql`UPDATE members SET notes = ${String(notes || "").slice(0, 4000)} WHERE id = ${id}`;
      return json({ ok: true });
    }
    const [member] = await sql`SELECT * FROM members WHERE id = ${id}`;
    if (!member) throw new HttpError(404, "Member not found.");
    const orders = await sql`
      SELECT o.id, o.number, o.status, o.payment_status, o.total_cents, o.cost_cents, o.discount_pct, o.created_at,
        (SELECT string_agg(name, ', ' ORDER BY id) FROM order_items WHERE order_id = o.id) AS items
      FROM orders o WHERE o.member_id = ${id} ORDER BY o.created_at DESC`;
    return json({ member, orders });
  }

  if (parts[0] === "products" && !parts[1]) {
    const rows = await sql`
      SELECT p.*, COALESCE(s.units, 0)::int AS units30, COALESCE(s.revenue, 0)::int AS revenue30
      FROM products p LEFT JOIN (
        SELECT oi.product_id, SUM(oi.qty) AS units, SUM(oi.line_total_cents) AS revenue
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.status <> 'cancelled' AND o.created_at > NOW() - INTERVAL '30 days' GROUP BY 1
      ) s ON s.product_id = p.id ORDER BY p.sort`;
    return json({ products: rows });
  }

  if (parts[0] === "products" && parts[1] && req.method === "PUT") {
    const b = await req.json().catch(() => ({}));
    const price = Math.round(Number(b.price_cents)), cost = Math.round(Number(b.cost_cents));
    if (!(price > 0 && price < 1e7 && cost >= 0 && cost < 1e7)) throw new HttpError(400, "Enter a valid price and cost.");
    const [p] = await sql`UPDATE products SET price_cents = ${price}, cost_cents = ${cost}, active = ${b.active !== false} WHERE id = ${parts[1]} RETURNING *`;
    if (!p) throw new HttpError(404, "Product not found.");
    return json({ product: p });
  }

  throw new HttpError(404, "Not found.");
});

export const config = {
  path: ["/api/admin/*"],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
