CREATE TABLE stackr_users (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  member_id INTEGER REFERENCES members(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stackr_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES stackr_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  source TEXT NOT NULL DEFAULT 'manual',
  color TEXT NOT NULL DEFAULT '#c9796a',
  format TEXT NOT NULL DEFAULT 'vial',
  vial_mg NUMERIC NOT NULL,
  water_ml NUMERIC NOT NULL DEFAULT 0,
  dose_mg NUMERIC NOT NULL,
  days SMALLINT[] NOT NULL,
  dose_time TEXT NOT NULL DEFAULT '08:00',
  mixed_on DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stackr_batches (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES stackr_items(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  vials INTEGER NOT NULL DEFAULT 1,
  mg_per_vial NUMERIC NOT NULL,
  added_on DATE NOT NULL DEFAULT CURRENT_DATE,
  finished BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE stackr_doses (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES stackr_items(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'taken',
  dose_mg NUMERIC NOT NULL,
  site TEXT,
  UNIQUE (item_id, day)
);

CREATE INDEX stackr_items_user_idx ON stackr_items(user_id);
CREATE INDEX stackr_doses_item_idx ON stackr_doses(item_id, day);
CREATE INDEX stackr_batches_item_idx ON stackr_batches(item_id);
