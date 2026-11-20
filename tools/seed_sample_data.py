"""Generate a deterministic sample-data migration for the Wellness House CRM."""
import random, json, datetime as dt, sys

random.seed(20261120)
OUT = sys.argv[1]

# id, name, kind, format, price, cost, market_low, market_high
PRODUCTS = [
    ('sema', 'Semaglutide', 'GLP-1 · weekly', 'vial', 249, 85, 199, 399),
    ('tirz', 'Tirzepatide', 'GLP-1 / GIP · weekly', 'vial', 399, 140, 299, 549),
    ('pen-sema', 'Semaglutide pen', 'GLP-1 · pre-filled pen', 'pen', 329, 150, 299, 499),
    ('pen-tirz', 'Tirzepatide pen', 'GLP-1 / GIP · pre-filled pen', 'pen', 479, 210, 399, 649),
    ('lipo', 'Lipo-MIC + B12', 'Metabolic support', 'vial', 79, 28, 60, 120),
    ('nad', 'NAD+', 'Cellular energy', 'vial', 149, 45, 120, 250),
    ('gsh', 'Glutathione', 'Antioxidant', 'vial', 99, 22, 80, 150),
    ('serm', 'Sermorelin', 'Growth hormone support', 'vial', 179, 60, 150, 250),
    ('tesa', 'Tesamorelin', 'GHRH analog', 'vial', 299, 110, 250, 450),
    ('pt141', 'PT-141', 'Bremelanotide', 'vial', 129, 38, 100, 200),
]
P = {p[0]: p for p in PRODUCTS}

FIRST = ['Sarah', 'Emily', 'Jessica', 'Ashley', 'Megan', 'Lauren', 'Rachel', 'Amanda', 'Nicole', 'Brittany', 'Kayla', 'Danielle',
         'Michael', 'David', 'Chris', 'Ryan', 'Jason', 'Kristen', 'Alyssa', 'Taylor', 'Vanessa', 'Monica', 'Hannah', 'Olivia', 'Brian', 'Natalie']
LAST = ['Martinez', 'Nguyen', 'Johnson', 'Patel', 'Garcia', 'Kim', 'Thompson', 'Rivera', 'Lee', 'Anderson', 'Lopez', 'Walker',
        'Hernandez', 'Clark', 'Lewis', 'Young', 'Allen', 'Wright', 'Scott', 'Torres', 'Hill', 'Flores', 'Green', 'Adams', 'Baker', 'Nelson']
STATES = ['California'] * 7 + ['Arizona'] * 2 + ['Nevada'] * 2 + ['Texas']
CITIES = {'California': [('Long Beach', '90803'), ('Irvine', '92618'), ('Newport Beach', '92660'), ('San Diego', '92109'), ('Huntington Beach', '92648')],
          'Arizona': [('Scottsdale', '85251'), ('Phoenix', '85016')], 'Nevada': [('Henderson', '89052'), ('Las Vegas', '89135')], 'Texas': [('Austin', '78704')]}
SOURCES = ['Instagram', 'Friend or family', 'The Fertility House', 'Google', 'Instagram', 'Friend or family']
STREETS = ['Ocean Blvd', 'Harbor Dr', 'Sunset Ave', 'Palm St', 'Main St', 'Bayside Ln', 'Coral Way', 'Seabreeze Ct']

PLANS = [  # typical carts
    ['sema'], ['sema', 'lipo'], ['tirz'], ['tirz', 'lipo', 'nad'], ['tirz', 'lipo'], ['pen-sema'], ['pen-tirz'], ['pen-tirz', 'nad'],
    ['nad', 'gsh'], ['serm', 'pt141'], ['nad'], ['tesa'], ['serm'], ['pt141'], ['sema', 'nad'], ['tirz', 'nad', 'gsh', 'lipo'],
]
WEIGHTS = [10, 9, 10, 8, 6, 4, 4, 3, 5, 4, 3, 2, 2, 3, 3, 2]

def q(s):
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"

TODAY = dt.datetime(2026, 11, 20, 17, 0, tzinfo=dt.timezone.utc)
lines = ["-- Sample data for the demo CRM. All people, orders and amounts are fictional.\n"]
for i, p in enumerate(PRODUCTS):
    lines.append(f"INSERT INTO products (id, name, kind, format, price_cents, cost_cents, market_low_cents, market_high_cents, sort) VALUES "
                 f"({q(p[0])}, {q(p[1])}, {q(p[2])}, {q(p[3])}, {p[4]*100}, {p[5]*100}, {p[6]*100}, {p[7]*100}, {i});")

members = []
used = set()
for mid in range(1, 27):
    while True:
        fn, ln = random.choice(FIRST), random.choice(LAST)
        if (fn, ln) not in used: used.add((fn, ln)); break
    st = random.choice(STATES)
    created = TODAY - dt.timedelta(days=random.randint(20, 160), hours=random.randint(0, 20))
    dob = dt.date(random.randint(1972, 1998), random.randint(1, 12), random.randint(1, 28))
    email = f"{fn.lower()}.{ln.lower()}@example.com"
    phone = f"(562) 555-{random.randint(1000, 9999)}"
    members.append(dict(id=mid, fn=fn, ln=ln, st=st, created=created, email=email))
    status = 'active'
    lines.append(f"INSERT INTO members (id, first_name, last_name, email, phone, state, dob, source, status, created_at) VALUES "
                 f"({mid}, {q(fn)}, {q(ln)}, {q(email)}, {q(phone)}, {q(st)}, {q(dob.isoformat())}, {q(random.choice(SOURCES))}, {q(status)}, {q(created.isoformat())});")

oid = 0
item_id = 0
orders = []
for m in members:
    plan = random.choices(PLANS, WEIGHTS)[0]
    t = m['created'] + dt.timedelta(hours=random.randint(1, 30))
    months = 0
    while t < TODAY:
        orders.append((m, list(plan), t))
        months += 1
        t = t + dt.timedelta(days=random.randint(27, 33))
        if random.random() < 0.12: break  # churned
        if months == 1 and random.random() < 0.25 and 'lipo' not in plan: plan = plan + ['lipo']  # upsell
orders.sort(key=lambda o: o[2])

for (m, plan, t) in orders:
    oid += 1
    n = len(plan)
    pct = min(10 * (n - 1), 30)
    sub = sum(P[x][4] * 100 for x in plan)
    cost = sum(P[x][5] * 100 for x in plan)
    disc_items = [round(P[x][4] * 100 * pct / 100) for x in plan]
    disc = sum(disc_items)
    total = sub - disc
    age = (TODAY - t).days
    if age <= 1: status, pay = 'pending_review', 'authorized'
    elif age <= 3: status, pay = random.choice([('approved', 'paid'), ('pending_review', 'authorized')])
    elif age <= 6: status, pay = 'shipped', 'paid'
    else: status, pay = 'delivered', 'paid'
    if random.random() < 0.03 and age > 3: status, pay = 'cancelled', 'refunded'
    approved = t + dt.timedelta(hours=random.randint(2, 20)) if status in ('approved', 'shipped', 'delivered') else None
    shipped = approved + dt.timedelta(hours=random.randint(10, 30)) if status in ('shipped', 'delivered') else None
    city, zipc = random.choice(CITIES[m['st']])
    addr = dict(line1=f"{random.randint(100, 9999)} {random.choice(STREETS)}", city=city, state=m['st'], zip=zipc)
    safety = dict(ttc=False, thyroid=False, pancreatitis=False)
    lines.append(f"INSERT INTO orders (id, number, member_id, status, payment_status, item_count, discount_pct, subtotal_cents, discount_cents, total_cents, cost_cents, ship_address, safety, created_at, approved_at, shipped_at) VALUES "
                 f"({oid}, 'WH-{10000 + oid}', {m['id']}, {q(status)}, {q(pay)}, {n}, {pct}, {sub}, {disc}, {total}, {cost}, {q(json.dumps(addr))}, {q(json.dumps(safety))}, {q(t.isoformat())}, {q(approved.isoformat() if approved else None)}, {q(shipped.isoformat() if shipped else None)});")
    for x, d in zip(plan, disc_items):
        item_id += 1
        price = P[x][4] * 100
        lines.append(f"INSERT INTO order_items (id, order_id, product_id, name, qty, unit_price_cents, unit_cost_cents, discount_cents, line_total_cents) VALUES "
                     f"({item_id}, {oid}, {q(x)}, {q(P[x][1])}, 1, {price}, {P[x][5]*100}, {d}, {price - d});")

lines.append(f"SELECT setval('members_id_seq', {len(members)});")
lines.append(f"SELECT setval('orders_id_seq', {oid});")
lines.append(f"SELECT setval('order_items_id_seq', {item_id});")
lines.append(f"SELECT setval('order_number_seq', {10000 + oid});")
open(OUT, 'w').write("\n".join(lines) + "\n")
print(len(members), 'members', oid, 'orders', item_id, 'items')
