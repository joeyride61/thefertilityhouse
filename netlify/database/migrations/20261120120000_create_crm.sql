CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'vial',
  price_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  market_low_cents INTEGER,
  market_high_cents INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  state TEXT,
  dob DATE,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  status TEXT NOT NULL DEFAULT 'pending_review',
  payment_status TEXT NOT NULL DEFAULT 'demo',
  stripe_payment_intent TEXT,
  item_count INTEGER NOT NULL,
  discount_pct INTEGER NOT NULL DEFAULT 0,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  cost_cents INTEGER NOT NULL,
  ship_address JSONB,
  safety JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ
);

CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL
);

CREATE INDEX orders_member_idx ON orders(member_id);
CREATE INDEX orders_created_idx ON orders(created_at DESC);
CREATE INDEX order_items_order_idx ON order_items(order_id);
CREATE SEQUENCE order_number_seq START 10001;
