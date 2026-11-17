import './style.css';
import { configured, auth, db } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, writeBatch } from 'firebase/firestore';
import { MILLS, DISTRICTS, STATUS, DEF_CFG, ugx, fdate, millis, km, toEmail, phoneDigits, esc } from './data.js';
import { pickerMap, routeMap, millsMap } from './map.js';

const app = document.getElementById('app');
const S = { user: null, me: null, bookings: [], open: [], intake: [], users: [], disputes: [], cfg: { ...DEF_CFG }, cfgExists: false, unsubs: [], cleanup: [], subKey: '' };
let post = [];

const P = { home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', file: 'M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6', plus: 'M12 5v14M5 12h14', truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 18a2 2 0 1 0 0 .1M18 18a2 2 0 1 0 0 .1', chart: 'M4 19V5M4 19h17M8 16v-3M12 16V9M16 16V6M20 16v-5', chat: 'M4 5h16v11H9l-5 4z', users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2-5 6-5s6 2 6 5M17 11a3 3 0 0 0 0-6M18 15c2 1 3 2 3 5', shield: 'M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8 12l3 3 5-6', cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9', pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4', alert: 'M12 4l9 16H3zM12 10v4M12 17v.5', arrow: 'M5 12h14M13 6l6 6-6 6', leaf: 'M4 20c0-9 6-15 16-15 0 10-6 16-15 16M4 20l8-8', factory: 'M3 20V9l6 4V9l6 4V5h4v15zM3 20h18', alertc: 'M12 8v5M12 16v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18' };
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n]}"/></svg>`;
const logo = (light) => `<div class="brand ${light ? 'light' : ''}"><span class="mark"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M0 25c6-3 11-3 16-1s11 1 16-2v10H0z" fill="#12684a"/><g stroke-linecap="round" fill="none"><path d="M5 27V19M27 27V19" stroke="#5fbf8f" stroke-width="2.4"/><path d="M10 26 9 11M16 27V8M22 26l1-15" stroke="#9be3bd" stroke-width="3.2"/><path d="M8.6 15h2.8M8.9 20h2.8M14.6 13h2.8M14.6 19h2.8M21.6 15h2.8M21.4 20h2.8" stroke="#0b3d2e" stroke-width=".9"/></g><g fill="#e9a820"><path d="M16 8c-1-3-4-4-7-4 1 3 4 4 7 4zM16 8c1-3 4-4 7-4-1 3-4 4-7 4zM9 11c-1-2-3-3-5-3 1 2 3 3 5 3zM23 11c1-2 3-3 5-3-1 2-3 3-5 3z"/></g></svg></span><b>Cane<i>Connect</i></b></div>`;
const short = (id) => id.slice(0, 6).toUpperCase();
const pill = (s) => `<span class="pill ${STATUS[s]?.[1] || 'grey'}">${STATUS[s]?.[0] || s}</span>`;
const byNew = (a, b) => millis(b.createdAt) - millis(a.createdAt);
const sum = (list, f) => list.reduce((t, x) => t + (Number(f(x)) || 0), 0);
const errMsg = (e) => ({ 'auth/invalid-credential': 'Wrong phone/email or password.', 'auth/email-already-in-use': 'This phone or email already has an account. Sign in instead.', 'auth/weak-password': 'Use a password of at least 6 characters.', 'permission-denied': 'You are not allowed to do that. If you are a transporter or mill, your account may still be awaiting verification.' }[e.code] || e.message || 'Something went wrong.');
function toast(msg) { let t = document.getElementById('toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.className = 'show'; clearTimeout(t._t); t._t = setTimeout(() => (t.className = ''), 3500); }

/* ---------- Setup + auth ---------- */
function renderSetup() {
  app.innerHTML = `<div class="center-card"><div class="card">${logo()}<h2>Connect Firebase</h2><p>Copy <code>.env.example</code> to <code>.env</code>, fill in your Firebase web app keys, then restart <code>npm run dev</code>. Full steps are in the README.</p></div></div>`;
}

const SLIDES = [
  ['cane.jpg', 'Grown in Busoga, delivered on time.', '50% 36%'], ['phone.jpg', 'Book transport from your phone.'], ['loading.jpg', 'Load, book, deliver.'],
  ['weigh.jpg', 'Weighed and recorded at the mill.'], ['whitetruck.jpg', 'Verified transporters on every route.'], ['talk.jpg', 'Farmers and buyers, talking directly.'],
  ['road.jpg', 'Moving cane across Busoga.'], ['greentrucks.jpg', 'Every tonne accounted for.'], ['queue.jpg', 'Less waiting at the gate. More cane delivered.']
];
const ROLES = [['farmer', 'Farmer', 'I grow cane', 'leaf'], ['transporter', 'Transporter', 'I own a truck', 'truck'], ['mill', 'Mill / buyer', 'I receive cane', 'factory']];
const pwField = (auto) => `<label>Password<div class="pw"><input name="pw" type="password" minlength="6" required autocomplete="${auto}"><button type="button" class="eye" data-act="togglepw">Show</button></div></label>`;
const authForm = (up) => up ? `<form data-form="signup">
  <label>Full name<input name="name" required autocomplete="name" placeholder="e.g. Namukasa Grace"></label>
  <div class="roles">${ROLES.map(([v, t, s, i], n) => `<label class="role"><input type="radio" name="role" value="${v}" ${n ? '' : 'checked'}><span>${ic(i)}<b>${t}</b><small>${s}</small></span></label>`).join('')}</div>
  <p class="hint h-farmer">Posting requests is free. Farmers pay no platform fee.</p><p class="hint h-transporter">Our team verifies you before you can see jobs. A flat fee applies per completed job and is shown before you accept.</p><p class="hint h-mill">Our team verifies and links your mill before you can post intake notices.</p>
  <div class="two"><label>Phone number<input name="phone" type="tel" placeholder="0772 000 000" required autocomplete="tel"></label><label>District<select name="district">${DISTRICTS.map((d) => `<option>${d}</option>`).join('')}</select></label></div>
  ${pwField('new-password')}<button class="btn primary wide">Create my account</button><small class="muted">Your phone number is your login. It is only shared with a transporter once they accept your booking.</small></form>`
  : `<form data-form="signin"><label>Phone number or email<input name="id" required autocomplete="username" placeholder="0772 000 000"></label>${pwField('current-password')}<button class="btn primary wide">Sign in</button><small class="muted">New here? <button type="button" class="lnk" data-act="authmode" data-m="up">Create an account</button></small></form>`;

function renderAuth(mode = 'in') {
  const up = mode === 'up';
  if (!document.getElementById('authcard')) {
    app.innerHTML = `<div class="auth"><div class="slides">${SLIDES.map(([f, , p], i) => `<div class="slide" style="--i:${i};--pos:${p || 'center'};--dx:${i % 2 ? '1.2%' : '-1.2%'};background-image:url(/slides/${f})"></div>`).join('')}</div><div class="veil"></div>
    <div class="sparks">${[...Array(14)].map((_, i) => `<i style="--x:${(i * 37 + 8) % 100}%;--s:${3 + (i % 4) * 2}px;--d:${9 + (i % 5) * 3}s;--t:${(i * 1.7) % 9}s"></i>`).join('')}</div>
    <div class="auth-in"><section class="auth-hero">${logo(true)}<span class="eyebrow">Busoga sugarcane logistics</span><h1>From farm to mill, <em>one connected chain.</em></h1><p>Book verified transport, see where your cane is going and deliver on a confirmed plan across Busoga.</p><ul><li>${ic('pin')} Pin your pickup on the map</li><li>${ic('shield')} Verified transporters and mills</li><li>${ic('cash')} Fees shown before you confirm</li></ul><small class="areas">Serving Jinja · Luuka · Kamuli · Mayuge · Buikwe</small></section>
    <section class="auth-card glass" id="authcard"><div class="tabs"><i></i><button data-act="authmode" data-m="in">Sign in</button><button data-act="authmode" data-m="up">Create account</button></div><div id="authform"></div></section></div>
    <div class="caps">${SLIDES.map(([, c], i) => `<span style="--i:${i}">${c}</span>`).join('')}<div class="dots">${SLIDES.map((_, i) => `<b style="--i:${i}"></b>`).join('')}</div></div></div>`;
  }
  const tabs = document.querySelector('.auth .tabs');
  tabs.classList.toggle('up', up);
  tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 1) === up));
  document.getElementById('authcard').classList.toggle('wide', up);
  document.getElementById('authform').innerHTML = authForm(up);
}
const busy = (f, on) => { const b = f.querySelector('button.btn'); if (b) b.disabled = on; };

const forms = {
  async signin(f) {
    const d = Object.fromEntries(new FormData(f));
    busy(f, true);
    try { await signInWithEmailAndPassword(auth, toEmail(d.id), d.pw); } catch (e) { toast(errMsg(e)); busy(f, false); }
  },
  async signup(f) {
    const d = Object.fromEntries(new FormData(f));
    busy(f, true);
    try {
      const c = await createUserWithEmailAndPassword(auth, toEmail(d.phone), d.pw);
      await setDoc(doc(db, 'users', c.user.uid), { name: d.name.trim(), phone: phoneDigits(d.phone), role: d.role, district: d.district, verified: false, createdAt: serverTimestamp() });
    } catch (e) { toast(errMsg(e)); busy(f, false); }
  },
  async request(f) {
    const d = Object.fromEntries(new FormData(f)), pk = S.pick;
    if (!pk) return toast('Tap the map to mark your pickup point.');
    const mill = MILLS[d.mill], tons = Number(d.tons), me = S.me;
    const ref = doc(collection(db, 'bookings')), b = writeBatch(db);
    b.set(ref, { farmerId: S.user.uid, farmerName: me.name, pickupLabel: d.label.trim(), pickup: pk, millId: d.mill, millName: mill.name, tons, date: d.date, price: Number(d.price), distanceKm: Math.round(km(pk, mill)), notes: d.notes.trim(), status: 'awaiting', createdAt: serverTimestamp(), timeline: [{ s: 'awaiting', at: Date.now(), by: me.name }] });
    b.set(doc(ref, 'private', 'contact'), { phone: me.phone });
    try { await b.commit(); toast('Request posted. Verified transporters can now see it.'); location.hash = `#/b/${ref.id}`; } catch (e) { toast(errMsg(e)); }
  },
  async notice(f) {
    const d = Object.fromEntries(new FormData(f)), m = MILLS[S.me.millId];
    try {
      await addDoc(collection(db, 'intake'), { millId: S.me.millId, millName: m.name, from: d.from, to: d.to, tons: Number(d.tons), priceLow: Number(d.low) || 0, priceHigh: Number(d.high) || 0, note: d.note.trim(), createdAt: serverTimestamp() });
      f.reset(); toast('Notice published to farmers.');
    } catch (e) { toast(errMsg(e)); }
  },
  async dispute(f) {
    const d = Object.fromEntries(new FormData(f));
    try {
      await addDoc(collection(db, 'disputes'), { bookingId: d.bid, reporterId: S.user.uid, reporterName: S.me.name, subject: d.subject.trim(), status: 'open', createdAt: serverTimestamp() });
      if (d.bid) await setBooking(d.bid, { status: 'disputed' });
      f.reset(); toast('Issue reported. We will respond within one working day.');
    } catch (e) { toast(errMsg(e)); }
  },
  async settings(f) {
    const d = Object.fromEntries(new FormData(f));
    try { await setDoc(doc(db, 'config', 'platform'), { ...S.cfg, feeUgx: Number(d.fee), ratePerTonKm: Number(d.rate), payNumber: d.pay.trim(), supportPhone: d.support.trim() }); toast('Settings saved.'); } catch (e) { toast(errMsg(e)); }
  }
};

async function setBooking(id, patch, quiet) {
  const extra = patch.status ? { timeline: arrayUnion({ s: patch.status, at: Date.now(), by: S.me.name }) } : {};
  try { await updateDoc(doc(db, 'bookings', id), { ...patch, ...extra, updatedAt: serverTimestamp() }); if (!quiet) toast('Updated.'); } catch (e) { toast(errMsg(e)); }
}

const acts = {
  authmode: (d) => renderAuth(d.m),
  logout: () => signOut(auth),
  togglepw: (d, el) => { const i = el.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; },
  cancel: (d) => confirm('Cancel this request?') && setBooking(d.id, { status: 'cancelled' }),
  confirm: (d) => setBooking(d.id, { status: 'confirmed' }),
  start: (d) => setBooking(d.id, { status: 'in-progress' }),
  complete: (d) => confirm('Mark this delivery as completed? Your platform fee becomes due.') && setBooking(d.id, { status: 'completed' }),
  accept: (d) => confirm(`Accept this job? A platform fee of ${ugx(S.cfg.feeUgx)} becomes due when the delivery is completed.`) && setBooking(d.id, { status: 'accepted', transporterId: S.user.uid, transporterName: S.me.name, fee: S.cfg.feeUgx, feeStatus: 'due' }),
  share: (d) => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => setBooking(d.id, { liveLoc: { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() } }, true).then(() => toast('Location shared with the farmer.')), () => toast('Allow location access to share your position.')) : toast('Location is not available on this device.'),
  verify: (d, el) => { const mill = el.closest('.row').querySelector('select')?.value; const patch = { verified: true, ...(mill ? { millId: mill } : {}) }; updateDoc(doc(db, 'users', d.id), patch).then(() => toast('Verified.')).catch((e) => toast(errMsg(e))); },
  unverify: (d) => updateDoc(doc(db, 'users', d.id), { verified: false }),
  paid: (d) => setBooking(d.id, { feeStatus: 'paid' }),
  resolve: async (d) => { try { await updateDoc(doc(db, 'disputes', d.id), { status: 'resolved' }); if (d.bid) await setBooking(d.bid, { status: d.to }, true); toast('Dispute resolved.'); } catch (e) { toast(errMsg(e)); } },
  delnotice: async (d) => { const { deleteDoc } = await import('firebase/firestore'); deleteDoc(doc(db, 'intake', d.id)); },
  defaults: () => setDoc(doc(db, 'config', 'platform'), DEF_CFG).then(() => toast('Default settings created.')).catch((e) => toast(errMsg(e))),
  useloc: () => navigator.geolocation?.getCurrentPosition((p) => S.picker?.place(p.coords.latitude, p.coords.longitude), () => toast('Allow location access, or tap the map instead.'))
};
app.addEventListener('click', (e) => { const t = e.target.closest('[data-act]'); if (t) acts[t.dataset.act]?.(t.dataset, t); });
app.addEventListener('submit', (e) => { e.preventDefault(); forms[e.target.dataset.form]?.(e.target); });
window.addEventListener('hashchange', () => render(true));

/* ---------- Data subscriptions ---------- */
function teardown() { S.unsubs.forEach((u) => u()); S.unsubs = []; S.subKey = ''; Object.assign(S, { bookings: [], open: [], intake: [], users: [], disputes: [] }); }
function subscribe() {
  const me = S.me, key = `${me.role}|${me.verified}|${me.millId}`;
  if (key === S.subKey) return;
  S.unsubs.forEach((u) => u()); S.unsubs = []; S.subKey = key;
  const on = (q, slot) => S.unsubs.push(onSnapshot(q, (s) => { S[slot] = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNew); render(); }, (e) => console.warn(slot, e.code)));
  const bk = collection(db, 'bookings'), uid = S.user.uid;
  on(collection(db, 'intake'), 'intake');
  S.unsubs.push(onSnapshot(doc(db, 'config', 'platform'), (s) => { S.cfgExists = s.exists(); S.cfg = { ...DEF_CFG, ...(s.data() || {}) }; render(); }, () => {}));
  if (me.role === 'farmer') on(query(bk, where('farmerId', '==', uid)), 'bookings');
  if (me.role === 'transporter') { on(query(bk, where('transporterId', '==', uid)), 'bookings'); if (me.verified) on(query(bk, where('status', '==', 'awaiting')), 'open'); }
  if (me.role === 'mill' && me.verified && me.millId) on(query(bk, where('millId', '==', me.millId)), 'bookings');
  if (me.role === 'admin') { on(bk, 'bookings'); on(collection(db, 'users'), 'users'); on(collection(db, 'disputes'), 'disputes'); }
}

if (!configured) renderSetup();
else onAuthStateChanged(auth, (u) => {
  teardown(); S.userUnsub?.(); S.user = u; S.me = null;
  if (!u) return renderAuth();
  S.userUnsub = onSnapshot(doc(db, 'users', u.uid), (s) => { S.me = s.exists() ? { id: s.id, ...s.data() } : null; if (S.me) { subscribe(); render(true); } });
});

/* ---------- Shell + routing ---------- */
const route = () => { const [p, q] = (location.hash.slice(2) || 'home').split('?'); const [name, id] = p.split('/'); return { name, id, q: new URLSearchParams(q || '') }; };
function navFor(role) {
  const home = ['home', 'Home', 'home'], help = ['help', 'Support', 'chat'];
  return { farmer: [home, ['bookings', 'My requests', 'file'], ['new', 'Request', 'plus'], ['market', 'Market', 'chart'], help],
    transporter: [home, ['board', 'Job board', 'truck'], ['bookings', 'My jobs', 'file'], ['earnings', 'Fees', 'cash'], help],
    mill: [home, ['market', 'Intake', 'chart'], ['bookings', 'Deliveries', 'truck'], help],
    admin: [home, ['bookings', 'Bookings', 'file'], ['users', 'Users', 'users'], ['disputes', 'Disputes', 'alert'], ['revenue', 'Revenue', 'cash']] }[role] || [home];
}
function render(force) {
  if (!S.user || !S.me) return;
  if (!force && document.activeElement?.matches?.('#view input,#view select,#view textarea')) return;
  S.cleanup.forEach((c) => c()); S.cleanup = []; S.picker = null; post = [];
  const r = route(), views = { home, bookings, new: newReq, board, market, earnings, users, disputes, revenue, help, b: detail };
  const nav = navFor(S.me.role), body = (views[r.name] || home)(r), cur = r.name === 'b' ? 'bookings' : r.name;
  app.innerHTML = `<div class="shell"><aside class="side">${logo(true)}<nav>${nav.map(([k, l, i]) => `<a href="#/${k}" class="${cur === k ? 'on' : ''}">${ic(i)}<span>${l}</span></a>`).join('')}</nav><div class="me"><b>${esc(S.me.name)}</b><small>${S.me.role}${S.me.verified ? ' · verified' : ''}</small><button data-act="logout" class="link">${ic('out')} Sign out</button></div></aside>
  <main id="view">${gate()}${body}</main>
  <nav class="tabbar">${nav.map(([k, l, i]) => `<a href="#/${k}" class="${cur === k ? 'on' : ''}">${ic(i)}<span>${l}</span></a>`).join('')}</nav></div>`;
  post.forEach((fn) => fn());
}
const gate = () => (['transporter', 'mill'].includes(S.me.role) && !S.me.verified ? `<div class="banner">${ic('shield')}<div><b>Verification pending</b><p>Our team is reviewing your account. ${S.me.role === 'transporter' ? 'You will see the job board' : 'You will be able to post intake notices and see deliveries'} as soon as you are verified.</p></div></div>` : S.me.role === 'mill' && S.me.verified && !S.me.millId ? '<div class="banner"><div><b>Mill not linked yet</b><p>Ask the CaneConnect team to link your account to your mill.</p></div></div>' : '');
const head = (t, sub, action = '') => `<header class="head"><div><h1>${t}</h1><p>${sub}</p></div>${action}</header>`;
const empty = (t, s = '') => `<div class="empty"><b>${t}</b><p>${s}</p></div>`;
const bcard = (b) => `<a class="bcard" href="#/b/${b.id}"><div class="top"><b>${esc(b.pickupLabel)}</b>${pill(b.status)}</div><div class="to">${ic('arrow')} ${esc(b.millName)}</div><div class="meta"><span>${b.tons} t</span><span>${fdate(b.date)}</span><span>${ugx(b.price)}</span><span>${b.distanceKm} km</span><small>#${short(b.id)}</small></div></a>`;
const stats = (l) => `<div class="stats">${l.map(([t, v]) => `<div class="stat"><span>${t}</span><b>${v}</b></div>`).join('')}</div>`;

/* ---------- Views ---------- */
function home() {
  const me = S.me, B = S.bookings, n = (s) => B.filter((b) => s.includes(b.status)).length, active = ['accepted', 'confirmed', 'in-progress'];
  const done = B.filter((b) => b.status === 'completed');
  let s, act = '', list = B.slice(0, 5);
  if (me.role === 'farmer') { s = [['Open requests', n(['awaiting'])], ['In progress', n(active)], ['Delivered', done.length], ['Tonnes delivered', sum(done, (b) => b.tons)]]; act = '<a class="btn primary" href="#/new">New transport request</a>'; }
  else if (me.role === 'transporter') { s = [['Jobs on the board', S.open.length], ['My active jobs', n(active)], ['Delivered', done.length], ['Fees due', ugx(sum(done.filter((b) => b.feeStatus === 'due'), (b) => b.fee))]]; act = '<a class="btn primary" href="#/board">Browse jobs</a>'; }
  else if (me.role === 'mill') { s = [['Deliveries expected', n(active)], ['Tonnes expected', sum(B.filter((b) => active.includes(b.status)), (b) => b.tons)], ['Delivered', done.length], ['Live notices', S.intake.filter((i) => i.millId === me.millId).length]]; }
  else { const acc = B.filter((b) => b.transporterId).length; s = [['Bookings', B.length], ['Completion rate', acc ? `${Math.round((done.length / acc) * 100)}%` : '–'], ['Awaiting verification', S.users.filter((u) => u.role !== 'admin' && !u.verified).length], ['Open disputes', S.disputes.filter((d) => d.status === 'open').length]]; }
  return `${head(`Hello, ${esc(me.name.split(' ')[0])}`, me.role === 'admin' ? 'Pilot health at a glance.' : 'Your cane logistics at a glance.', act)}${stats(s)}<h2 class="sec">Recent activity</h2>${list.length ? `<div class="grid">${list.map(bcard).join('')}</div>` : empty('Nothing here yet', me.role === 'farmer' ? 'Post your first transport request to get started.' : me.role === 'transporter' ? 'Accepted jobs will appear here.' : 'Deliveries to your mill will appear here.')}`;
}

function bookings() {
  return `${head(S.me.role === 'transporter' ? 'My jobs' : S.me.role === 'mill' ? 'Deliveries' : S.me.role === 'admin' ? 'All bookings' : 'My requests', 'Every booking and its current status.')}${S.bookings.length ? `<div class="grid">${S.bookings.map(bcard).join('')}</div>` : empty('No bookings yet')}`;
}

function newReq(r) {
  if (S.me.role !== 'farmer') return empty('Only farmers can create requests');
  const pre = MILLS[r.q.get('mill')] ? r.q.get('mill') : 'kakira', tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  S.pick = null;
  post.push(() => {
    const f = document.querySelector('[data-form=request]'), sel = f.mill, out = document.getElementById('est');
    const upd = () => { const m = MILLS[sel.value]; S.picker.setMill(m); if (!S.pick) return out.textContent = 'Tap the map to mark your pickup.'; const d = Math.round(km(S.pick, m)), tons = Number(f.tons.value) || 0, g = Math.round(d * tons * S.cfg.ratePerTonKm / 1000) * 1000; out.innerHTML = `Approx. road distance <b>${d} km</b>. Guide price <b>${ugx(g)}</b> (you can set your own offer).`; if (!f.price.dataset.touched) f.price.value = g; };
    S.picker = pickerMap(document.getElementById('pickmap'), { onPick: (ll) => { S.pick = ll; upd(); } });
    S.cleanup.push(S.picker.destroy); f.price.addEventListener('input', () => (f.price.dataset.touched = 1)); [sel, f.tons].forEach((x) => x.addEventListener('input', upd)); upd();
  });
  return `${head('Request transport', 'Tell us where the cane is and where it is going.')}<form class="card form" data-form="request"><div class="two"><div><div id="pickmap" class="map"></div><button type="button" class="btn ghost" data-act="useloc">${ic('pin')} Use my location</button></div><div class="stack">
  <label>Pickup village / parish<input name="label" required placeholder="e.g. Buwenge, Jinja"></label>
  <label>Deliver to<select name="mill">${Object.entries(MILLS).map(([k, m]) => `<option value="${k}" ${k === pre ? 'selected' : ''}>${m.name}</option>`).join('')}</select></label>
  <div class="two"><label>Load (tonnes)<input name="tons" type="number" min="1" step="0.5" value="10" required></label><label>Pickup date<input name="date" type="date" min="${tomorrow}" value="${tomorrow}" required></label></div>
  <label>Your offer (UGX)<input name="price" type="number" min="0" step="1000" required></label><p id="est" class="note"></p>
  <label>Notes for the driver<textarea name="notes" rows="2" placeholder="Access road, loading help, contact at the farm"></textarea></label>
  <button class="btn primary wide">Post request</button><small class="muted">Your phone number is shared only with the transporter who accepts. Do not cut cane until a mill intake slot is confirmed.</small></div></div></form>`;
}

function board() {
  if (S.me.role !== 'transporter') return empty('Job board is for transporters');
  if (!S.me.verified) return empty('Waiting for verification', 'The job board opens when your account is verified.');
  post.push(() => { if (S.open.length) { const el = document.getElementById('boardmap'); S.cleanup.push(millsMap(el, MILLS)); } });
  return `${head('Job board', 'Open requests from farmers. Accept one to see contact details.')}${S.open.length ? `<div id="boardmap" class="map short"></div><div class="grid">${S.open.map(bcard).join('')}</div>` : empty('No open jobs right now', 'New requests appear here live.')}`;
}

function market() {
  const me = S.me, mine = me.role === 'mill' && me.verified && me.millId;
  post.push(() => S.cleanup.push(millsMap(document.getElementById('mmap'), MILLS)));
  const list = S.intake.filter((i) => !mine || i.millId === me.millId);
  return `${head('Market & intake', 'Where mills are receiving cane. Always confirm price and slot before you harvest.')}<div id="mmap" class="map short"></div>
  ${mine ? `<form class="card form" data-form="notice"><h3>Publish an intake notice</h3><div class="two"><label>From<input name="from" type="date" required></label><label>To<input name="to" type="date" required></label></div><div class="two"><label>Tonnes wanted<input name="tons" type="number" min="1" required></label><label>Note<input name="note" placeholder="Quality or delivery rules"></label></div><div class="two"><label>Indicative price low (UGX/t)<input name="low" type="number"></label><label>Indicative price high (UGX/t)<input name="high" type="number"></label></div><button class="btn primary">Publish notice</button></form>` : ''}
  <h2 class="sec">Intake notices</h2>${list.length ? `<div class="grid">${list.map((i) => `<div class="bcard"><div class="top"><b>${esc(i.millName)}</b><span class="pill green">${i.tons} t wanted</span></div><div class="meta"><span>${fdate(i.from)} – ${fdate(i.to)}</span>${i.priceHigh ? `<span>${ugx(i.priceLow)}–${ugx(i.priceHigh)} /t</span>` : ''}</div><p class="note">${esc(i.note)}</p>${me.role === 'farmer' ? `<a class="btn small primary" href="#/new?mill=${i.millId}">Plan transport</a>` : ''}${mine ? `<button class="btn small ghost" data-act="delnotice" data-id="${i.id}">Remove</button>` : ''}<p class="note">Indicative only. Final price depends on quality, deductions and the buyer agreement.</p></div>`).join('')}</div>` : empty('No notices yet', 'Mills publish their intake needs here.')}`;
}

function earnings() {
  const done = S.bookings.filter((b) => b.status === 'completed'), due = done.filter((b) => b.feeStatus === 'due');
  return `${head('Platform fees', `A flat ${ugx(S.cfg.feeUgx)} applies to each completed job and is shown before you accept.`)}${stats([['Jobs completed', done.length], ['Fees due', ugx(sum(due, (b) => b.fee))], ['Fees paid', ugx(sum(done.filter((b) => b.feeStatus === 'paid'), (b) => b.fee))]])}
  <div class="card">${S.cfg.payNumber ? `<p>Pay fees by mobile money to <b>${esc(S.cfg.payNumber)}</b> and quote the booking number. We mark it paid once received.</p>` : '<p>Payment details will be shown here soon.</p>'}</div>
  ${done.length ? `<div class="list">${done.map((b) => `<div class="row"><span><b>#${short(b.id)}</b> ${esc(b.pickupLabel)} → ${esc(b.millName)}</span><span>${ugx(b.price)} job</span><span class="pill ${b.feeStatus === 'paid' ? 'green' : 'amber'}">Fee ${b.feeStatus} · ${ugx(b.fee)}</span></div>`).join('')}</div>` : empty('No completed jobs yet')}`;
}

function users() {
  if (S.me.role !== 'admin') return empty('Admins only');
  const l = S.users.filter((u) => u.role !== 'admin');
  return `${head('Users & verification', 'Confirm phone ownership, role and operating area before verifying.')}<div class="list">${l.map((u) => `<div class="row"><span><b>${esc(u.name)}</b><small>${u.role} · ${esc(u.district)} · ${esc(u.phone)}</small></span>${u.role === 'mill' ? `<select>${Object.entries(MILLS).map(([k, m]) => `<option value="${k}" ${u.millId === k ? 'selected' : ''}>${m.name}</option>`).join('')}</select>` : '<span></span>'}${u.verified ? `<button class="btn small ghost" data-act="unverify" data-id="${u.id}">Verified ✓ Revoke</button>` : `<button class="btn small primary" data-act="verify" data-id="${u.id}">Verify</button>`}</div>`).join('') || empty('No users yet')}</div>`;
}

function disputes() {
  const mine = S.me.role === 'admin';
  return `${head(mine ? 'Disputes' : 'Support', mine ? 'Decide using the booking record and hear both sides.' : 'Tell us what went wrong. We reply within one working day.')}
  <form class="card form" data-form="dispute"><h3>Report an issue</h3><div class="two"><label>Booking number (optional)<select name="bid"><option value="">General issue</option>${S.bookings.map((b) => `<option value="${b.id}">#${short(b.id)} · ${esc(b.pickupLabel)}</option>`).join('')}</select></label><label>What happened?<input name="subject" required placeholder="e.g. Truck arrived 5 hours late"></label></div><button class="btn primary">Send report</button></form>
  ${mine ? `<h2 class="sec">Cases</h2><div class="list">${S.disputes.map((d) => `<div class="row"><span><b>${esc(d.subject)}</b><small>${esc(d.reporterName)} · ${d.bookingId ? '#' + short(d.bookingId) : 'general'}</small></span><span class="pill ${d.status === 'open' ? 'red' : 'green'}">${d.status}</span>${d.status === 'open' ? `<span class="btns"><button class="btn small ghost" data-act="resolve" data-id="${d.id}" data-bid="${d.bookingId || ''}" data-to="completed">Resolve: completed</button><button class="btn small ghost" data-act="resolve" data-id="${d.id}" data-bid="${d.bookingId || ''}" data-to="cancelled">Resolve: cancelled</button></span>` : ''}</div>`).join('') || empty('No cases')}</div>` : ''}`;
}

function revenue() {
  if (S.me.role !== 'admin') return empty('Admins only');
  const done = S.bookings.filter((b) => b.status === 'completed' && b.fee), paid = sum(done.filter((b) => b.feeStatus === 'paid'), (b) => b.fee), due = sum(done.filter((b) => b.feeStatus === 'due'), (b) => b.fee);
  return `${head('Revenue & team share', 'Platform fees from completed bookings. Mark a fee collected once the mobile-money payment arrives.')}${S.cfgExists ? '' : `<div class="banner"><div><b>Platform settings not created</b><p>Transporters cannot accept jobs until they exist.</p><button class="btn small primary" data-act="defaults">Create default settings</button></div></div>`}
  ${stats([['Fees collected', ugx(paid)], ['Fees outstanding', ugx(due)], ['Completed paid jobs', done.length], ['Avg. fee', ugx(done.length ? sum(done, (b) => b.fee) / done.length : S.cfg.feeUgx)]])}
  <div class="two"><div class="card"><h3>Team share of collected fees</h3>${S.cfg.team.map((t) => `<div class="kv"><span>${esc(t.name)} · ${t.share}%</span><b>${ugx((paid * t.share) / 100)}</b></div>`).join('')}<p class="note">Edit names and shares in the config/platform document. Before dividing income, set aside mobile-money charges, SMS and hosting costs, and tax obligations.</p></div>
  <form class="card form" data-form="settings"><h3>Pricing & payment</h3><label>Platform fee per completed job (UGX)<input name="fee" type="number" min="0" value="${S.cfg.feeUgx}"></label><label>Guide rate (UGX per tonne-km)<input name="rate" type="number" min="0" value="${S.cfg.ratePerTonKm}"></label><label>Mobile money number for fees<input name="pay" value="${esc(S.cfg.payNumber)}"></label><label>Support phone<input name="support" value="${esc(S.cfg.supportPhone)}"></label><button class="btn primary">Save</button></form></div>
  <h2 class="sec">Fee ledger</h2><div class="list">${done.map((b) => `<div class="row"><span><b>#${short(b.id)}</b><small>${esc(b.transporterName)} · ${esc(b.millName)}</small></span><span>${ugx(b.fee)}</span>${b.feeStatus === 'paid' ? '<span class="pill green">Collected</span>' : `<button class="btn small primary" data-act="paid" data-id="${b.id}">Mark collected</button>`}</div>`).join('') || empty('No completed jobs yet')}</div>`;
}

function help() {
  return `${head('Support & terms', 'Plain-language rules for everyone on CaneConnect.')}<div class="card prose">${S.cfg.supportPhone ? `<p>Call support: <b>${esc(S.cfg.supportPhone)}</b></p>` : ''}<h3>How it works</h3><p>A request is not confirmed until a verified transporter accepts it and the farmer confirms. CaneConnect coordinates bookings. It is not the buyer of cane or the transport company, and it cannot guarantee mill acceptance or prices.</p><h3>Fees</h3><p>Transporters pay a flat ${ugx(S.cfg.feeUgx)} per completed job. The fee is shown before a job is accepted. Farmers pay no platform fee.</p><h3>Cancellations & disputes</h3><p>Farmers can cancel before transit starts. If something goes wrong, report it from the Support page and we review the booking record.</p><h3>Your data</h3><p>We collect only what is needed to arrange bookings. Phone numbers are shared only between the farmer and the accepted transporter.</p></div>${disputes().replace(/^[\s\S]*?(<form)/, '$1')}`;
}

function detail(r) {
  const b = [...S.bookings, ...S.open].find((x) => x.id === r.id);
  if (!b) return empty('Booking not found', 'It may not exist or you may not have access.');
  const me = S.me, uid = S.user.uid, mill = MILLS[b.millId], isF = b.farmerId === uid, isT = b.transporterId === uid;
  const canAccept = me.role === 'transporter' && me.verified && b.status === 'awaiting' && !isT;
  const btn = (a, t, c = 'primary') => `<button class="btn ${c}" data-act="${a}" data-id="${b.id}">${t}</button>`;
  const actions = [isF && b.status === 'accepted' ? btn('confirm', 'Confirm transporter & price') : '', isF && ['awaiting', 'accepted', 'confirmed'].includes(b.status) ? btn('cancel', 'Cancel request', 'ghost') : '', canAccept ? btn('accept', `Accept job (fee ${ugx(S.cfg.feeUgx)})`) : '', isT && b.status === 'confirmed' ? btn('start', 'Start trip') : '', isT && b.status === 'in-progress' ? btn('share', 'Share my location', 'ghost') + btn('complete', 'Mark delivered') : ''].join('');
  post.push(() => {
    S.cleanup.push(routeMap(document.getElementById('rmap'), { pickup: b.pickup, mill, live: b.liveLoc }));
    if (isF || isT || me.role === 'admin') getDoc(doc(db, 'bookings', b.id, 'private', 'contact')).then((s) => { const el = document.getElementById('contact'); if (el && s.exists()) el.innerHTML = `<a href="tel:+${esc(s.data().phone)}">+${esc(s.data().phone)}</a>`; }).catch(() => {});
  });
  const tl = (b.timeline || []).map((t) => `<li><i></i><div><b>${STATUS[t.s]?.[0] || t.s}</b><small>${new Date(t.at).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(t.by)}</small></div></li>`).join('');
  return `<a class="back" href="#/bookings">← Back</a>${head(`${esc(b.pickupLabel)} → ${esc(b.millName)}`, `Booking #${short(b.id)}`, pill(b.status))}
  <div class="two"><div><div id="rmap" class="map"></div></div><div class="stack"><div class="card"><div class="kv"><span>Load</span><b>${b.tons} tonnes</b></div><div class="kv"><span>Pickup date</span><b>${fdate(b.date)}</b></div><div class="kv"><span>Agreed offer</span><b>${ugx(b.price)}</b></div><div class="kv"><span>Distance (approx.)</span><b>${b.distanceKm} km</b></div><div class="kv"><span>Farmer</span><b>${esc(b.farmerName)}</b></div><div class="kv"><span>Transporter</span><b>${esc(b.transporterName || 'Not assigned')}</b></div><div class="kv"><span>Contact</span><b id="contact">${isF || isT ? 'Loading…' : 'Shared after acceptance'}</b></div>${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ''}${b.liveLoc ? `<p class="note">Truck location last shared ${new Date(b.liveLoc.at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}</div>${actions ? `<div class="btns">${actions}</div>` : ''}<div class="card"><h3>Progress</h3><ul class="tl">${tl}</ul></div></div></div>`;
}
