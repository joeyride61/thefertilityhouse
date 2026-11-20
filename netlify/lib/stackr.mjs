/* Stackr demo data and product defaults.
   Will Hainlen is a fictional demo member. His data is generated relative to today,
   so the demo always shows a realistic "running low, time to reorder" moment. */

export const PRODUCT_DEFAULTS = {
  sema: { vial_mg: 5, water_ml: 2, dose_mg: 0.25, days: [1], color: "#c9796a", format: "vial" },
  tirz: { vial_mg: 30, water_ml: 3, dose_mg: 2.5, days: [1], color: "#8c4b40", format: "vial" },
  "pen-sema": { vial_mg: 4, water_ml: 0, dose_mg: 1, days: [1], color: "#d98b7c", format: "pen" },
  "pen-tirz": { vial_mg: 20, water_ml: 0, dose_mg: 5, days: [1], color: "#93503f", format: "pen" },
  lipo: { vial_mg: 30, water_ml: 0, dose_mg: 1, days: [3], color: "#7c9a78", format: "solution" },
  nad: { vial_mg: 500, water_ml: 5, dose_mg: 100, days: [1, 3, 5], color: "#b8955a", format: "vial" },
  gsh: { vial_mg: 1000, water_ml: 5, dose_mg: 200, days: [2, 4], color: "#b98aa0", format: "vial" },
  serm: { vial_mg: 9, water_ml: 3, dose_mg: 0.3, days: [0, 1, 2, 3, 4], color: "#6f7fa6", format: "vial" },
  tesa: { vial_mg: 2, water_ml: 2, dose_mg: 1, days: [0, 1, 2, 3, 4, 5, 6], color: "#4f6650", format: "vial" },
  pt141: { vial_mg: 10, water_ml: 2, dose_mg: 1.75, days: [5], color: "#c45b78", format: "vial" },
};

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); };
const SITES = ["Left abdomen", "Right abdomen", "Left thigh", "Right thigh"];

export async function ensureWill(sql) {
  const [u] = await sql`SELECT u.id, (SELECT COUNT(*)::int FROM stackr_items WHERE user_id = u.id) AS n FROM stackr_users u WHERE slug = 'will'`;
  if (u && u.n > 0) return u.id;
  return resetWill(sql);
}

export async function resetWill(sql) {
  const T = today();
  const [member] = await sql`
    INSERT INTO members (first_name, last_name, email, phone, state, dob, source, created_at, notes)
    VALUES ('Will', 'Hainlen', 'will.hainlen@example.com', '(562) 555-0142', 'California', '1986-04-12', 'The Fertility House', ${addDays(T, -62).toISOString()},
      'Demo member for the Stackr app walkthrough.')
    ON CONFLICT (email) DO UPDATE SET created_at = EXCLUDED.created_at
    RETURNING id`;

  // Clear previous demo state
  await sql`DELETE FROM stackr_users WHERE slug = 'will'`;
  await sql`DELETE FROM orders WHERE member_id = ${member.id}`;

  const [tirz] = await sql`SELECT price_cents, cost_cents FROM products WHERE id = 'tirz'`;
  const addr = JSON.stringify({ line1: "2140 E Ocean Blvd", city: "Long Beach", state: "California", zip: "90803" });
  const safety = JSON.stringify({ ttc: false, thyroid: false, pancreatitis: false, medications: "" });
  const mkOrder = async (daysAgo) => {
    const created = addDays(T, -daysAgo);
    const [o] = await sql`
      INSERT INTO orders (number, member_id, status, payment_status, item_count, discount_pct, subtotal_cents, discount_cents, total_cents, cost_cents,
        ship_address, safety, created_at, approved_at, shipped_at)
      VALUES ('WH-' || nextval('order_number_seq'), ${member.id}, 'delivered', 'paid', 1, 0, ${tirz.price_cents}, 0, ${tirz.price_cents}, ${tirz.cost_cents},
        ${addr}::jsonb, ${safety}::jsonb, ${created.toISOString()}, ${new Date(created.getTime() + 6 * 3600e3).toISOString()}, ${addDays(created, 1).toISOString()})
      RETURNING id`;
    await sql`INSERT INTO order_items (order_id, product_id, name, qty, unit_price_cents, unit_cost_cents, discount_cents, line_total_cents)
      VALUES (${o.id}, 'tirz', 'Tirzepatide', 1, ${tirz.price_cents}, ${tirz.cost_cents}, 0, ${tirz.price_cents})`;
    return o.id;
  };
  const orderA = await mkOrder(56);
  const orderB = await mkOrder(25);

  const [user] = await sql`INSERT INTO stackr_users (slug, member_id, name) VALUES ('will', ${member.id}, 'Will Hainlen') RETURNING id`;

  // Tirzepatide: linked to his Wellness House orders. Weekly on the weekday he mixed the vial.
  const tMix = addDays(T, -18);
  const [ti] = await sql`
    INSERT INTO stackr_items (user_id, name, product_id, source, color, format, vial_mg, water_ml, dose_mg, days, dose_time, mixed_on)
    VALUES (${user.id}, 'Tirzepatide', 'tirz', 'wellness', '#8c4b40', 'vial', 30, 3, 7.5, ${[tMix.getUTCDay()]}::smallint[], '07:30', ${iso(tMix)})
    RETURNING id`;
  await sql`INSERT INTO stackr_batches (item_id, order_id, vials, mg_per_vial, added_on, finished) VALUES (${ti.id}, ${orderA}, 1, 30, ${iso(addDays(T, -54))}, TRUE)`;
  await sql`INSERT INTO stackr_batches (item_id, order_id, vials, mg_per_vial, added_on) VALUES (${ti.id}, ${orderB}, 1, 30, ${iso(addDays(T, -22))})`;
  for (const [i, ago] of [18, 11, 4].entries()) {
    await sql`INSERT INTO stackr_doses (item_id, day, status, dose_mg, site) VALUES (${ti.id}, ${iso(addDays(T, -ago))}, 'taken', 7.5, ${SITES[i]})`;
  }

  // BPC-157: added by Will himself (not sold by The Wellness House). Mon, Wed, Fri.
  const bMix = addDays(T, -17);
  const [bi] = await sql`
    INSERT INTO stackr_items (user_id, name, product_id, source, color, format, vial_mg, water_ml, dose_mg, days, dose_time, mixed_on)
    VALUES (${user.id}, 'BPC-157', NULL, 'manual', '#5f8a7a', 'vial', 5, 2, 0.25, ${[1, 3, 5]}::smallint[], '20:00', ${iso(bMix)})
    RETURNING id`;
  await sql`INSERT INTO stackr_batches (item_id, vials, mg_per_vial, added_on) VALUES (${bi.id}, 1, 5, ${iso(bMix)})`;
  let n = 0;
  const bDays = [];
  for (let d = new Date(bMix); d < T; d = addDays(d, 1)) if ([1, 3, 5].includes(d.getUTCDay())) bDays.push(new Date(d));
  for (const [i, d] of bDays.entries()) {
    const skipped = i === bDays.length - 3;
    await sql`INSERT INTO stackr_doses (item_id, day, status, dose_mg, site)
      VALUES (${bi.id}, ${iso(d)}, ${skipped ? "skipped" : "taken"}, 0.25, ${skipped ? null : SITES[(n++ + 2) % 4]})`;
  }
  return user.id;
}
