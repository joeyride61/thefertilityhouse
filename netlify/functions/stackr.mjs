import { db, json, handle, HttpError, priceCart } from "../lib/shared.mjs";
import { ensureWill, resetWill, PRODUCT_DEFAULTS } from "../lib/stackr.mjs";

const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw new HttpError(400, "Please check the numbers."); return n; };
const isoDay = (v) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) throw new HttpError(400, "Invalid date."); return v; };

export default handle(async (req) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/stackr\/?/, "").split("/").filter(Boolean);
  const sql = db().sql;
  // Demo: everyone sees Will Hainlen. Real per-person accounts come with login later.
  const userId = await ensureWill(sql);
  const [user] = await sql`SELECT u.id, u.name, u.member_id, m.email FROM stackr_users u LEFT JOIN members m ON m.id = u.member_id WHERE u.id = ${userId}`;
  const ownItem = async (id) => {
    const [it] = await sql`SELECT * FROM stackr_items WHERE id = ${parseInt(id, 10)} AND user_id = ${user.id}`;
    if (!it) throw new HttpError(404, "Item not found.");
    return it;
  };

  if (parts[0] === "state" && req.method === "GET") {
    const items = await sql`SELECT * FROM stackr_items WHERE user_id = ${user.id} AND active ORDER BY id`;
    const ids = items.map((i) => i.id);
    const batches = ids.length ? await sql`SELECT b.*, o.number AS order_number FROM stackr_batches b LEFT JOIN orders o ON o.id = b.order_id WHERE b.item_id = ANY(${ids}) ORDER BY b.added_on` : [];
    const doses = ids.length ? await sql`SELECT id, item_id, to_char(day, 'YYYY-MM-DD') AS day, status, dose_mg, site FROM stackr_doses WHERE item_id = ANY(${ids}) AND day > CURRENT_DATE - 120 ORDER BY day` : [];
    const orders = user.member_id ? await sql`
      SELECT o.id, o.number, o.status, o.total_cents, o.discount_pct, o.created_at, o.approved_at, o.shipped_at, o.notes,
        COALESCE(json_agg(json_build_object('product_id', oi.product_id, 'name', oi.name, 'qty', oi.qty)) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items,
        EXISTS (SELECT 1 FROM stackr_batches b WHERE b.order_id = o.id) AS linked
      FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.member_id = ${user.member_id} GROUP BY o.id ORDER BY o.created_at DESC` : [];
    const products = await sql`SELECT id, name, price_cents FROM products WHERE active ORDER BY sort`;
    return json({
      user: { name: user.name, email: user.email },
      items: items.map((i) => ({ ...i, vial_mg: +i.vial_mg, water_ml: +i.water_ml, dose_mg: +i.dose_mg, mixed_on: i.mixed_on ? new Date(i.mixed_on).toISOString().slice(0, 10) : null,
        batches: batches.filter((b) => b.item_id === i.id).map((b) => ({ ...b, mg_per_vial: +b.mg_per_vial, added_on: new Date(b.added_on).toISOString().slice(0, 10) })),
        doses: doses.filter((d) => d.item_id === i.id).map((d) => ({ ...d, dose_mg: +d.dose_mg })) })),
      orders, products, defaults: PRODUCT_DEFAULTS,
    });
  }

  if (parts[0] === "items" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const days = Array.isArray(b.days) ? [...new Set(b.days.map((d) => parseInt(d, 10)).filter((d) => d >= 0 && d <= 6))].sort() : [];
    if (!days.length) throw new HttpError(400, "Pick at least one day of the week.");
    const name = String(b.name || "").trim().slice(0, 60);
    if (!name) throw new HttpError(400, "Give this peptide a name.");
    const vial = num(b.vial_mg, 0.01, 100000), water = num(b.water_ml ?? 0, 0, 100), dose = num(b.dose_mg, 0.001, 100000);
    const time = /^\d{2}:\d{2}$/.test(b.dose_time || "") ? b.dose_time : "08:00";
    const color = /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "#c9796a";
    const mixed = b.mixed_on ? isoDay(b.mixed_on) : null;
    if (b.id) {
      const it = await ownItem(b.id);
      await sql`UPDATE stackr_items SET name = ${name}, color = ${color}, vial_mg = ${vial}, water_ml = ${water}, dose_mg = ${dose}, days = ${days}::smallint[], dose_time = ${time}, mixed_on = ${mixed} WHERE id = ${it.id}`;
      return json({ ok: true, id: it.id });
    }
    const [it] = await sql`
      INSERT INTO stackr_items (user_id, name, source, color, format, vial_mg, water_ml, dose_mg, days, dose_time, mixed_on)
      VALUES (${user.id}, ${name}, 'manual', ${color}, ${water > 0 ? "vial" : "solution"}, ${vial}, ${water}, ${dose}, ${days}::smallint[], ${time}, ${mixed}) RETURNING id`;
    const vials = Math.max(1, Math.min(20, parseInt(b.vials, 10) || 1));
    await sql`INSERT INTO stackr_batches (item_id, vials, mg_per_vial, added_on) VALUES (${it.id}, ${vials}, ${vial}, ${mixed || new Date().toISOString().slice(0, 10)})`;
    return json({ ok: true, id: it.id });
  }

  if (parts[0] === "items" && parts[1] && req.method === "DELETE") {
    const it = await ownItem(parts[1]);
    await sql`UPDATE stackr_items SET active = FALSE WHERE id = ${it.id}`;
    return json({ ok: true });
  }

  if (parts[0] === "doses" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const it = await ownItem(b.item_id);
    const day = isoDay(b.day);
    if (b.status === "clear") await sql`DELETE FROM stackr_doses WHERE item_id = ${it.id} AND day = ${day}`;
    else {
      const status = b.status === "skipped" ? "skipped" : "taken";
      const site = status === "taken" ? String(b.site || "").slice(0, 40) || null : null;
      await sql`INSERT INTO stackr_doses (item_id, day, status, dose_mg, site) VALUES (${it.id}, ${day}, ${status}, ${it.dose_mg}, ${site})
        ON CONFLICT (item_id, day) DO UPDATE SET status = EXCLUDED.status, site = EXCLUDED.site, dose_mg = EXCLUDED.dose_mg`;
    }
    return json({ ok: true });
  }

  if (parts[0] === "mix" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const it = await ownItem(b.item_id);
    await sql`UPDATE stackr_items SET mixed_on = CURRENT_DATE WHERE id = ${it.id}`;
    return json({ ok: true });
  }

  if (parts[0] === "reorder" && req.method === "POST") {
    if (!user.member_id) throw new HttpError(400, "Link a Wellness House account to reorder.");
    const b = await req.json().catch(() => ({}));
    const pids = [...new Set((b.product_ids || []).map(String))].slice(0, 10);
    const products = await sql`SELECT id, name, kind, format, price_cents, cost_cents, active FROM products`;
    const priced = priceCart(pids.map((id) => ({ id, qty: 1 })), products);
    const [last] = await sql`SELECT ship_address, safety FROM orders WHERE member_id = ${user.member_id} ORDER BY created_at DESC LIMIT 1`;
    const [order] = await sql`
      INSERT INTO orders (number, member_id, status, payment_status, item_count, discount_pct, subtotal_cents, discount_cents, total_cents, cost_cents, ship_address, safety, notes)
      VALUES ('WH-' || nextval('order_number_seq'), ${user.member_id}, 'pending_review', 'demo', ${priced.count}, ${priced.pct}, ${priced.subtotal}, ${priced.discount}, ${priced.total}, ${priced.cost},
        ${JSON.stringify(last?.ship_address || {})}::jsonb, ${JSON.stringify(last?.safety || {})}::jsonb, 'Refill reordered from Stackr')
      RETURNING id, number`;
    for (const l of priced.lines) {
      await sql`INSERT INTO order_items (order_id, product_id, name, qty, unit_price_cents, unit_cost_cents, discount_cents, line_total_cents)
        VALUES (${order.id}, ${l.product_id}, ${l.name}, ${l.qty}, ${l.unit_price_cents}, ${l.unit_cost_cents}, ${l.discount_cents}, ${l.line_total_cents})`;
    }
    return json({ ok: true, number: order.number, total: priced.total, pct: priced.pct });
  }

  if (parts[0] === "link" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const [o] = await sql`SELECT id, status FROM orders WHERE id = ${parseInt(b.order_id, 10)} AND member_id = ${user.member_id}`;
    if (!o) throw new HttpError(404, "Order not found.");
    if (o.status !== "delivered" && o.status !== "shipped") throw new HttpError(409, "This order hasn't shipped yet.");
    const [done] = await sql`SELECT 1 AS x FROM stackr_batches WHERE order_id = ${o.id} LIMIT 1`;
    if (done) return json({ ok: true, already: true });
    const lines = await sql`SELECT product_id, name, qty FROM order_items WHERE order_id = ${o.id}`;
    for (const l of lines) {
      const d = PRODUCT_DEFAULTS[l.product_id] || { vial_mg: 1, water_ml: 0, dose_mg: 1, days: [1], color: "#c9796a", format: "vial" };
      let [it] = await sql`SELECT id, vial_mg FROM stackr_items WHERE user_id = ${user.id} AND product_id = ${l.product_id} AND active`;
      if (!it) {
        [it] = await sql`INSERT INTO stackr_items (user_id, name, product_id, source, color, format, vial_mg, water_ml, dose_mg, days)
          VALUES (${user.id}, ${l.name}, ${l.product_id}, 'wellness', ${d.color}, ${d.format}, ${d.vial_mg}, ${d.water_ml}, ${d.dose_mg}, ${d.days}::smallint[]) RETURNING id, vial_mg`;
      }
      await sql`INSERT INTO stackr_batches (item_id, order_id, vials, mg_per_vial) VALUES (${it.id}, ${o.id}, ${l.qty}, ${it.vial_mg})`;
    }
    return json({ ok: true });
  }

  // Demo helpers so the walkthrough can be shown without waiting on shipping.
  if (parts[0] === "demo" && parts[1] === "advance" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const [o] = await sql`SELECT id, status FROM orders WHERE id = ${parseInt(b.order_id, 10)} AND member_id = ${user.member_id}`;
    if (!o) throw new HttpError(404, "Order not found.");
    const next = { pending_review: "approved", approved: "shipped", shipped: "delivered" }[o.status];
    if (!next) return json({ ok: true, status: o.status });
    if (next === "approved") await sql`UPDATE orders SET status = 'approved', payment_status = 'paid', approved_at = NOW() WHERE id = ${o.id}`;
    else if (next === "shipped") await sql`UPDATE orders SET status = 'shipped', shipped_at = NOW() WHERE id = ${o.id}`;
    else await sql`UPDATE orders SET status = 'delivered' WHERE id = ${o.id}`;
    return json({ ok: true, status: next });
  }
  if (parts[0] === "demo" && parts[1] === "reset" && req.method === "POST") {
    await resetWill(sql);
    return json({ ok: true });
  }

  throw new HttpError(404, "Not found.");
});

export const config = { path: "/api/stackr/*" };
