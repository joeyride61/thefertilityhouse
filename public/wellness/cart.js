/* The Wellness House cart: shared by the shop page and checkout.
   Stacking discount: every item takes 10% off for each additional item, up to 30%.
   The server recalculates every price at checkout; this is only for display. */
(function () {
  const CATALOG = [
    { id: 'sema', name: 'Semaglutide', img: 'sema', price: 249, kind: 'GLP-1 · weekly vial' },
    { id: 'tirz', name: 'Tirzepatide', img: 'tirz', price: 399, kind: 'GLP-1 / GIP · weekly vial' },
    { id: 'pen-sema', name: 'Semaglutide pen', img: 'pen-sema', price: 329, kind: 'Pre-filled pen' },
    { id: 'pen-tirz', name: 'Tirzepatide pen', img: 'pen-tirz', price: 479, kind: 'Pre-filled pen' },
    { id: 'lipo', name: 'Lipo-MIC + B12', img: 'lipo', price: 79, kind: 'Metabolic support' },
    { id: 'nad', name: 'NAD+', img: 'nad', price: 149, kind: 'Cellular energy' },
    { id: 'gsh', name: 'Glutathione', img: 'gsh', price: 99, kind: 'Antioxidant' },
    { id: 'serm', name: 'Sermorelin', img: 'serm', price: 179, kind: 'Growth hormone support' },
    { id: 'tesa', name: 'Tesamorelin', img: 'tesa', price: 299, kind: 'GHRH analog' },
    { id: 'pt141', name: 'PT-141', img: 'pt141', price: 129, kind: 'Bremelanotide' },
  ];
  const STEP = 10, MAX = 30, KEY = 'wh-cart-v1';
  const byId = () => Object.fromEntries(CATALOG.map((p) => [p.id, p]));
  const money = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const pctFor = (count) => Math.min(Math.max(count - 1, 0) * STEP, MAX);

  let items = [];
  try { items = JSON.parse(localStorage.getItem(KEY) || '[]').filter((i) => byId()[i.id]); } catch (e) { items = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} emit(); };
  const listeners = [];
  const emit = () => listeners.forEach((fn) => fn(api.totals()));

  const api = {
    catalog: CATALOG, money, pctFor, STEP, MAX,
    items: () => items.slice(),
    count: () => items.reduce((s, i) => s + i.qty, 0),
    has: (id) => items.some((i) => i.id === id),
    add(id, quiet) { const it = items.find((i) => i.id === id); if (it) it.qty = Math.min(it.qty + 1, 6); else items.push({ id, qty: 1 }); save(); if (!quiet) toast(id); },
    addMany(ids, label) { ids.forEach((id) => { if (!api.has(id)) items.push({ id, qty: 1 }); }); save(); toast(null, label); },
    setQty(id, qty) { const it = items.find((i) => i.id === id); if (!it) return; it.qty = Math.max(0, Math.min(qty, 6)); if (!it.qty) items = items.filter((i) => i.id !== id); save(); },
    clear() { items = []; save(); },
    totals() {
      const map = byId();
      const lines = items.map((i) => ({ ...map[i.id], qty: i.qty, gross: map[i.id].price * i.qty }));
      const count = lines.reduce((s, l) => s + l.qty, 0), pct = pctFor(count);
      const subtotal = lines.reduce((s, l) => s + l.gross, 0), discount = Math.round(subtotal * pct) / 100;
      return { lines, count, pct, subtotal, discount, total: subtotal - discount, nextPct: pctFor(count + 1) };
    },
    on(fn) { listeners.push(fn); fn(api.totals()); },
    async refreshPrices() {
      try {
        const r = await fetch('/api/catalog'); if (!r.ok) return null;
        const data = await r.json();
        data.products.forEach((p) => { const c = byId()[p.id]; if (c) c.price = p.price_cents / 100; });
        emit(); return data;
      } catch (e) { return null; }
    },
  };
  window.WHCart = api;

  /* ---------- UI: header button, drawer, toast ---------- */
  const css = `
  .cart-btn{position:relative;display:inline-flex;align-items:center;gap:8px;background:transparent;border:1px solid var(--line);border-radius:999px;padding:9px 16px;font:400 14px var(--ui);color:var(--ink);cursor:pointer}
  .cart-btn:hover{border-color:var(--ink)}
  .cart-btn .n{min-width:20px;height:20px;border-radius:999px;background:var(--coral-deep);color:#fff;font-size:11px;display:inline-grid;place-items:center;padding:0 6px}
  .cart-btn .n[data-zero]{background:var(--line);color:var(--ink-2)}
  .cart{position:fixed;top:0;right:0;bottom:0;width:min(460px,100%);background:var(--paper);z-index:95;transform:translateX(100%);transition:transform .5s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;box-shadow:-30px 0 60px -30px rgba(43,37,35,.3)}
  .cart.on{transform:none}
  .cart-head{display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 22px) max(24px,env(safe-area-inset-right,0px)) 18px 24px;border-bottom:1px solid var(--line)}
  .cart-head h2{font-size:30px}
  .cart-x{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--paper);cursor:pointer;font-size:20px}
  .cart-body{flex:1;overflow-y:auto;padding:18px 24px}
  .tier{background:var(--blush);border-radius:6px;padding:14px 16px;margin-bottom:16px}
  .tier p{margin:0 0 10px;font-size:14px}
  .tier b{color:var(--coral-deep);font-weight:600}
  .steps4{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
  .steps4 span{height:6px;border-radius:3px;background:rgba(43,37,35,.12)}
  .steps4 span.on{background:var(--coral-deep)}
  .steps4l{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:6px;font-size:11px;color:var(--ink-2);text-align:center}
  .cl{display:grid;grid-template-columns:64px 1fr auto;gap:14px;align-items:center;padding:14px 0;border-bottom:1px solid var(--line)}
  .cl img{width:64px;height:76px;object-fit:cover;border-radius:4px;background:var(--blush)}
  .cl h4{margin:0;font:500 20px var(--display)}
  .cl small{color:var(--ink-2);font-size:12px}
  .qty{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;margin-top:6px}
  .qty button{width:28px;height:28px;border:0;background:none;cursor:pointer;font-size:15px;color:var(--ink)}
  .qty span{min-width:18px;text-align:center;font-size:13px}
  .cl .pr{text-align:right;font-variant-numeric:tabular-nums}
  .cl .pr s{display:block;font-size:12px;color:#9d918c}
  .cl .pr b{font:500 20px var(--display)}
  .cart-empty{text-align:center;padding:50px 10px;color:var(--ink-2)}
  .cart-foot{border-top:1px solid var(--line);padding:18px 24px calc(env(safe-area-inset-bottom,0px) + 20px)}
  .sumrow{display:flex;justify-content:space-between;font-size:15px;margin-bottom:6px;font-variant-numeric:tabular-nums}
  .sumrow.disc{color:var(--sage)} .sumrow.total{font:500 26px var(--display);margin:10px 0 14px}
  .cart-foot .btn{width:100%;justify-content:center}
  .cart-foot small{display:block;margin-top:10px;font-size:12px;color:var(--ink-2);text-align:center}
  .toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 24px);transform:translate(-50%,30px);opacity:0;background:var(--ink);color:#fff;padding:12px 18px;border-radius:999px;font-size:14px;z-index:120;transition:all .35s;display:flex;gap:14px;align-items:center;max-width:calc(100% - 32px)}
  .toast.on{opacity:1;transform:translate(-50%,0)}
  .toast button{background:#fff;color:var(--ink);border:0;border-radius:999px;padding:6px 12px;font:500 13px var(--ui);cursor:pointer;white-space:nowrap}
  .cart-scrim{position:fixed;inset:0;background:rgba(43,37,35,.4);opacity:0;pointer-events:none;transition:opacity .35s;z-index:94}
  .cart-scrim.on{opacity:1;pointer-events:auto}`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="cart-scrim" id="cartScrim"></div>
  <div class="cart" id="cart" role="dialog" aria-modal="true" aria-labelledby="cartTitle" tabindex="-1">
    <div class="cart-head"><h2 id="cartTitle">Your plan</h2><button class="cart-x" data-cart-close aria-label="Close">×</button></div>
    <div class="cart-body" id="cartBody"></div>
    <div class="cart-foot" id="cartFoot"></div>
  </div>
  <div class="toast" id="toast" role="status" aria-live="polite"><span id="toastText"></span><button type="button" data-cart-open>View plan</button></div>`;
  document.body.appendChild(wrap);
  const $ = (id) => document.getElementById(id);

  function tierHTML(t) {
    const steps = [0, 10, 20, 30].map((p, i) => `<span class="${t.count >= i + 1 && t.count > 0 ? 'on' : ''}"></span>`).join('');
    const msg = t.count === 0 ? 'Add a program to start your plan.'
      : t.pct >= MAX ? `<b>${MAX}% off every item</b>, the most you can save. Nice.`
      : `<b>${t.pct}% off every item</b> right now. Add one more to get <b>${t.nextPct}% off</b> everything.`;
    return `<div class="tier"><p>${msg}</p><div class="steps4">${steps}</div><div class="steps4l"><span>1 item</span><span>2 · 10%</span><span>3 · 20%</span><span>4+ · 30%</span></div></div>`;
  }
  function render(t) {
    document.querySelectorAll('[data-cart-count]').forEach((n) => { n.textContent = t.count; n.toggleAttribute('data-zero', !t.count); });
    if (!$('cartBody')) return;
    $('cartBody').innerHTML = tierHTML(t) + (t.lines.length ? t.lines.map((l) => {
      const net = l.gross * (1 - t.pct / 100);
      return `<div class="cl"><img src="/wellness/img/${l.img}.webp" alt=""><div><h4>${l.name}</h4><small>${l.kind} · ${money(l.price)}/mo</small><br>
        <span class="qty"><button type="button" data-q="${l.id}" data-d="-1" aria-label="Remove one ${l.name}">−</button><span>${l.qty}</span><button type="button" data-q="${l.id}" data-d="1" aria-label="Add one ${l.name}">+</button></span></div>
        <div class="pr">${t.pct ? `<s>${money(l.gross)}</s>` : ''}<b>${money(net)}</b></div></div>`;
    }).join('') : `<div class="cart-empty">Your plan is empty.<br>Every program you add takes 10% more off everything, up to 30%.</div>`);
    $('cartFoot').innerHTML = t.lines.length ? `
      <div class="sumrow"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
      ${t.pct ? `<div class="sumrow disc"><span>Stacking discount (${t.pct}% off ${t.count} items)</span><span>−${money(t.discount)}</span></div>` : ''}
      <div class="sumrow"><span>Cold-chain shipping</span><span>Free</span></div>
      <div class="sumrow total"><span>Monthly total</span><span>${money(t.total)}</span></div>
      <a class="btn" href="/wellness/checkout.html">Continue to checkout</a>
      <small>You're not charged until Jamie approves your prescription. Free tracker app included.</small>` : '';
  }
  api.on(render);

  let tTimer;
  function toast(id, label) {
    const t = api.totals(); const name = label || byId()[id].name;
    $('toastText').textContent = `${name} added · ${t.count} item${t.count > 1 ? 's' : ''}${t.pct ? `, ${t.pct}% off each` : ''}`;
    $('toast').classList.add('on'); clearTimeout(tTimer); tTimer = setTimeout(() => $('toast').classList.remove('on'), 3200);
  }
  let lastFocus;
  api.open = () => { lastFocus = document.activeElement; $('cart').classList.add('on'); $('cartScrim').classList.add('on'); document.body.style.overflow = 'hidden'; $('cart').focus(); $('toast').classList.remove('on'); };
  api.close = () => { if (!$('cart').classList.contains('on')) return; $('cart').classList.remove('on'); $('cartScrim').classList.remove('on'); document.body.style.overflow = ''; lastFocus && lastFocus.focus(); };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-cart-open]')) { e.preventDefault(); api.open(); }
    if (e.target.closest('[data-cart-close]') || e.target.id === 'cartScrim') api.close();
    const q = e.target.closest('[data-q]'); if (q) { const it = items.find((i) => i.id === q.dataset.q); api.setQty(q.dataset.q, (it ? it.qty : 0) + +q.dataset.d); }
    const a = e.target.closest('[data-add]'); if (a) { e.preventDefault(); e.stopPropagation(); api.add(a.dataset.add); }
    const b = e.target.closest('[data-add-bundle]'); if (b) { e.preventDefault(); api.addMany(b.dataset.addBundle.split(','), b.dataset.label); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.close(); });
  api.refreshPrices();
})();
