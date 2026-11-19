import './style.css';
import { configured, auth, db } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, writeBatch, orderBy, deleteDoc } from 'firebase/firestore';
import { MILLS as DEFAULT_MILLS, DISTRICTS, STATUS, DEF_CFG, ugx, fdate, millis, km, toEmail, phoneDigits, esc } from './data.js';
import { pickerMap, routeMap, overviewMap } from './map.js';
import { attachSearch, reverse } from './geo.js';

const app = document.getElementById('app');
const S = { user: null, me: null, bookings: [], open: [], intake: [], users: [], disputes: [], cfg: { ...DEF_CFG }, cfgExists: false, unsubs: [], cleanup: [], subKey: '', millList: [], deliveries: [], notes: [], lock: null, myLoc: null, dirty: false, watch: null, trackBid: null, millPick: null };
const allMills = () => { const o = { ...DEFAULT_MILLS }; S.millList.forEach(({ id, ...m }) => { o[id] = { ...o[id], ...m }; }); return o; };
const activeMills = () => Object.fromEntries(Object.entries(allMills()).filter(([, m]) => m.active !== false && (m.status ?? 'approved') === 'approved'));
const closeModal = () => document.getElementById('modal')?.remove();
const modal = (html) => { closeModal(); const m = document.createElement('div'); m.id = 'modal'; m.innerHTML = `<div class="mback" data-close></div><div class="mbox card">${html}</div>`; document.body.appendChild(m); m.querySelector('input:not([type=hidden])')?.focus(); };
const note = (batch, userId, title, body, link = '', bookingId = '') => batch.set(doc(collection(db, 'notifications')), { userId, fromId: S.user.uid, title, body, link, bookingId, read: false, createdAt: serverTimestamp() });
// Every booking change goes through here so the mill's delivery record, the transporter's job lock and the alerts stay in one atomic write.
async function moveBooking(id, patch, o = {}) {
  const b = [...S.bookings, ...S.open].find((x) => x.id === id) || {}, batch = writeBatch(db);
  batch.update(doc(db, 'bookings', id), { ...patch, updatedAt: serverTimestamp(), ...(patch.status ? { timeline: arrayUnion({ s: patch.status, at: Date.now(), by: S.me.name }) } : {}) });
  if (o.delivery && b.hasDelivery) batch.update(doc(db, 'deliveries', id), { ...o.delivery, updatedAt: serverTimestamp() });
  o.fn?.(batch, b);
  await batch.commit();
}
const run = async (p, ok) => { try { await p; if (ok) toast(ok); } catch (e) { console.error(e); toast(errMsg(e)); } };
const dcard = (x) => `<a class="bcard" href="#/d/${x.id}"><div class="top"><b>${esc(x.pickupLabel)}</b>${pill(x.status)}</div><div class="to">${ic('arrow')} ${esc(x.farmerName)}${x.transporterName ? ` · truck: ${esc(x.transporterName)}` : ''}</div><div class="meta"><span>${x.tons} t</span><span>${fdate(x.date)}</span>${x.receipt ? `<span class="near">Received ${x.receipt.tons} t</span>` : ''}<small>#${short(x.id)}</small></div></a>`;
const stopTrack = () => { if (S.watch != null) { navigator.geolocation.clearWatch(S.watch); S.watch = null; S.trackBid = null; } };
const millPopup = (id, m) => `<b>${esc(m.name)}</b><br><small>${esc(m.area || '')}</small><br>${S.me?.role === 'farmer' ? `<a href="#/new?mill=${id}">Plan transport here →</a>` : `<a href="#/market?mill=${id}">Intake notices →</a>`}`;
const jobPopup = (b) => { const m = S.me?.role === 'mill'; return `<b>${esc(b.pickupLabel)}</b><br>${b.tons} t → ${esc(b.millName)}${m ? '' : `<br>${ugx(b.price)}`}<br><a href="#/${m ? 'd' : 'b'}/${b.id}">Open ${m ? 'delivery' : 'booking'} →</a>`; };
const legend = () => '<div class="legend"><span><i style="background:#e9a820"></i>Mill</span><span><i style="background:#e4572e"></i>Awaiting transporter</span><span><i style="background:#2563eb"></i>Booked</span><span><i style="background:#7c3aed"></i>In transit</span></div>';
const chips = (items, cur, base) => `<div class="chips">${items.map(([k, t, c]) => `<a class="chip ${cur === k ? 'on' : ''}" href="${base}?f=${k}">${t}${c != null ? `<b>${c}</b>` : ''}</a>`).join('')}</div>`;
const gpsError = (e) => toast(e.code === 1 ? 'Location is blocked. Allow it in your browser settings, or search / tap the map.' : 'Could not get your location. Move to open sky or search / tap the map.');

let post = [];

const P = { home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', file: 'M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6', plus: 'M12 5v14M5 12h14', truck: 'M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 18a2 2 0 1 0 0 .1M18 18a2 2 0 1 0 0 .1', chart: 'M4 19V5M4 19h17M8 16v-3M12 16V9M16 16V6M20 16v-5', chat: 'M4 5h16v11H9l-5 4z', users: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2-5 6-5s6 2 6 5M17 11a3 3 0 0 0 0-6M18 15c2 1 3 2 3 5', shield: 'M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM8 12l3 3 5-6', cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5', out: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9', pin: 'M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4', alert: 'M12 4l9 16H3zM12 10v4M12 17v.5', arrow: 'M5 12h14M13 6l6 6-6 6', check: 'M5 12l5 5 9-10', bell: 'M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0', leaf: 'M4 20c0-9 6-15 16-15 0 10-6 16-15 16M4 20l8-8', factory: 'M3 20V9l6 4V9l6 4V5h4v15zM3 20h18', alertc: 'M12 8v5M12 16v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18' };
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
  ['cane.jpg', 'Grown in Busoga, delivered on time.', '50% 30%'], ['phone.jpg', 'Book transport from your phone.'], ['field1.jpg', 'Every harvest starts with a plan.', '50% 30%'],
  ['loading.jpg', 'Load, book, deliver.'], ['weigh.jpg', 'Weighed and recorded at the mill.'], ['field2.jpg', 'Smiles from the Busoga cane fields.', '50% 26%'],
  ['whitetruck.jpg', 'Verified transporters on every route.'], ['talk.jpg', 'Farmers and buyers, talking directly.'], ['field3.jpg', 'Fresh cane, ready for the mill.', '50% 42%'],
  ['road.jpg', 'Moving cane across Busoga.'], ['greentrucks.jpg', 'Every tonne accounted for.'], ['field4.jpg', 'Hard work that deserves a fair market.', '50% 36%'],
  ['queue.jpg', 'Less waiting at the gate. More cane delivered.']
];
const POLAS = [['cane.jpg', 'Busoga cane fields'], ['field2.jpg', 'Smiles from the field'], ['field1.jpg', 'Harvest season'], ['field4.jpg', 'Grown with care'], ['field3.jpg', 'Ready for the mill']];
// Keyframes are generated from the number of photos so adding or removing a photo never breaks the timing.
const authKeyframes = (N, M) => {
  const r = (x) => x.toFixed(2), f = 25 / N, p = 100 / N, g = 24 / M, q = 100 / M;
  return `@keyframes kbx{0%{opacity:0;transform:scale(1.02)}${r(f)}%{opacity:1}${r(p)}%{opacity:1}${r(p + f)}%{opacity:0;transform:scale(1.14) translate(var(--dx),-.8%)}100%{opacity:0;transform:scale(1.02)}}
@keyframes capx{0%{opacity:0;transform:translateY(12px)}${r(f * 1.1)}%{opacity:1;transform:none}${r(p - f * 0.25)}%{opacity:1;transform:none}${r(p + f * 0.5)}%{opacity:0;transform:translateY(-10px)}100%{opacity:0}}
@keyframes dotx{0%{width:7px;background:rgba(255,255,255,.4)}${r(f * 1.1)}%,${r(p - f * 0.1)}%{width:26px;background:#e9a820}${r(p + f * 0.7)}%,100%{width:7px;background:rgba(255,255,255,.4)}}
@keyframes polax{0%{opacity:0;transform:rotate(var(--r)) translateY(34px) scale(.92)}${r(g)}%{opacity:1;transform:rotate(var(--r)) scale(1)}${r(q)}%{opacity:1;transform:rotate(var(--r)) scale(1)}${r(q + g)}%{opacity:0;transform:rotate(calc(var(--r) * -1.4)) translateY(-26px) scale(.96)}100%{opacity:0;transform:rotate(var(--r)) translateY(34px) scale(.92)}}`;
};
const ROLES = [['farmer', 'Farmer', 'I grow cane', 'leaf'], ['transporter', 'Transporter', 'I own a truck', 'truck'], ['mill', 'Mill / buyer', 'I receive cane', 'factory']];
const pwField = (auto) => `<label>Password<div class="pw"><input name="pw" type="password" minlength="6" required autocomplete="${auto}"><button type="button" class="eye" data-act="togglepw">Show</button></div></label>`;
const authForm = (up) => up ? `<form data-form="signup">
  <label>Full name<input name="name" required autocomplete="name" placeholder="e.g. Namukasa Grace"></label>
  <div class="roles">${ROLES.map(([v, t, s, i], n) => `<label class="role"><input type="radio" name="role" value="${v}" ${n ? '' : 'checked'}><span>${ic(i)}<b>${t}</b><small>${s}</small></span></label>`).join('')}</div>
  <p class="hint h-farmer">Posting requests is free. Farmers pay no platform fee.</p><p class="hint h-transporter">Our team verifies you before you can see jobs. You hold one job at a time. After a farmer approves you, a flat fee unlocks their contact details and chat.</p><p class="hint h-mill">Register your mill below. Our team reviews it, and once approved your mill is pinned on the map for farmers to deliver to.</p>
  <div class="mill-only"><label>Mill / company name<input name="mill_name" autocomplete="organization" placeholder="e.g. Kamuli Sugar Works"></label>
  <label>Mill location (search, then drag the pin)<div class="sugwrap"><input name="mq" autocomplete="off" placeholder="Search your mill's town or address"><div id="ssug" class="sug"></div></div></label>
  <div id="smap" class="map mini"></div><p id="spin" class="note">Search, paste a Google Maps link or coordinates, or tap the map. Use the Satellite view (top right of the map) to spot your mill.</p></div>
  <div class="two"><label>Phone number<input name="phone" type="tel" placeholder="0772 000 000" required autocomplete="tel"></label><label>District<select name="district">${DISTRICTS.map((d) => `<option>${d}</option>`).join('')}</select></label></div>
  ${pwField('new-password')}<button class="btn primary wide">Create my account</button><small class="muted">Your phone number is your login. It is only shared with a transporter once they unlock your booking.</small></form>`
  : `<form data-form="signin"><label>Phone number or email<input name="id" required autocomplete="username" placeholder="0772 000 000"></label>${pwField('current-password')}<button class="btn primary wide">Sign in</button><small class="muted">New here? <button type="button" class="lnk" data-act="authmode" data-m="up">Create an account</button></small></form>`;

function initSignupMap() {
  const f = document.querySelector('[data-form=signup]');
  S.signupPin = null; let picker;
  const ensure = () => {
    if (picker) { picker.map.invalidateSize(); return; }
    picker = S.signupMap = pickerMap(document.getElementById('smap'), { mills: activeMills(), onPick: (ll) => { S.signupPin = ll; document.getElementById('spin').textContent = `Pin set (${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}). Drag it to fine-tune.`; } });
    const pick = (it) => { picker.clearSuggest(); picker.place(it.lat, it.lng, { fly: true, zoom: it.coords ? 17 : 15, source: 'search' }); if (!it.coords && !f.mill_name.value) f.mill_name.value = it.title; };
    attachSearch(f.mq, document.getElementById('ssug'), { onResults: (l) => picker.suggest(l, pick), onPick: pick });
  };
  f.querySelectorAll('input[name=role]').forEach((r) => r.addEventListener('change', () => { if (r.value === 'mill' && r.checked) setTimeout(ensure, 80); }));
}

function renderAuth(mode = 'in') {
  const up = mode === 'up';
  if (!document.getElementById('authcard')) {
    app.innerHTML = `<div class="auth" style="--n:${SLIDES.length};--m:${POLAS.length}"><style>${authKeyframes(SLIDES.length, POLAS.length)}</style><div class="slides">${SLIDES.map(([f, , p], i) => `<div class="slide" style="--i:${i};--pos:${p || 'center'};--dx:${i % 2 ? '1.2%' : '-1.2%'}${i < 2 ? `;background-image:url(/slides/${f})` : ''}" ${i < 2 ? '' : `data-bg="/slides/${f}"`}></div>`).join('')}</div><div class="veil"></div>
    <div class="field" aria-hidden="true">${[...Array(30)].map((_, i) => `<i style="--h:${70 + ((i * 53) % 70)}px;--d:${3 + (i % 5) * 0.6}s;--dl:-${((i * 0.7) % 4).toFixed(1)}s"></i>`).join('')}</div>
    <div class="sparks">${[...Array(14)].map((_, i) => `<i style="--x:${(i * 37 + 8) % 100}%;--s:${3 + (i % 4) * 2}px;--d:${9 + (i % 5) * 3}s;--t:${(i * 1.7) % 9}s"></i>`).join('')}</div>
    <div class="auth-in"><section class="auth-hero">${logo(true)}<span class="eyebrow">Busoga sugarcane logistics</span><h1>From farm to mill, <em>one connected chain.</em></h1><p>Book verified transport, see where your cane is going and deliver on a confirmed plan across Busoga.</p><ul><li>${ic('pin')} Pin your pickup on the map</li><li>${ic('shield')} Verified transporters and mills</li><li>${ic('cash')} Fees shown before you confirm</li></ul><small class="areas">Serving Jinja · Luuka · Kamuli · Mayuge · Buikwe</small></section>
    <div class="polas" aria-hidden="true">${POLAS.map(([f, c], i) => `<figure class="pola" style="--i:${i};--r:${[-5, 4, -3, 5, -4][i]}deg"><img src="/slides/${f}" alt=""><figcaption>${c}</figcaption></figure>`).join('')}</div>
    <section class="auth-card glass" id="authcard"><div class="tabs"><i></i><button data-act="authmode" data-m="in">Sign in</button><button data-act="authmode" data-m="up">Create account</button></div><div id="authform"></div></section></div>
    <div class="caps">${SLIDES.map(([, c], i) => `<span style="--i:${i}">${c}</span>`).join('')}<div class="dots">${SLIDES.map((_, i) => `<b style="--i:${i}"></b>`).join('')}</div></div></div>`;
    setTimeout(() => document.querySelectorAll('.slide[data-bg]').forEach((s) => { s.style.backgroundImage = `url(${s.dataset.bg})`; }), 1500);
  }
  S.signupMap?.destroy(); S.signupMap = null;
  const tabs = document.querySelector('.auth .tabs');
  tabs.classList.toggle('up', up);
  tabs.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (i === 1) === up));
  document.getElementById('authcard').classList.toggle('wide', up);
  document.getElementById('authform').innerHTML = authForm(up);
  if (up) initSignupMap();
}
const busy = (f, on) => { const b = f.querySelector('button.btn'); if (b) b.disabled = on; };

const forms = {
  async signin(f) {
    const d = Object.fromEntries(new FormData(f));
    busy(f, true);
    try { await signInWithEmailAndPassword(auth, toEmail(d.id), d.pw); } catch (e) { toast(errMsg(e)); busy(f, false); }
  },
  async signup(f) {
    const d = Object.fromEntries(new FormData(f)), isMill = d.role === 'mill', pin = S.signupPin;
    if (isMill && (!d.mill_name?.trim() || !pin)) return toast('Enter your mill name and pin its location on the map.');
    busy(f, true);
    try {
      const c = await createUserWithEmailAndPassword(auth, toEmail(d.phone), d.pw), uid = c.user.uid, b = writeBatch(db);
      b.set(doc(db, 'users', uid), { name: d.name.trim(), phone: phoneDigits(d.phone), role: d.role, district: d.district, verified: false, createdAt: serverTimestamp(), ...(isMill ? { millId: uid } : {}) });
      if (isMill) b.set(doc(db, 'mills', uid), { name: d.mill_name.trim(), area: d.district, ownerId: uid, status: 'pending', active: true, lat: pin.lat, lng: pin.lng, createdAt: serverTimestamp() });
      await b.commit();
    } catch (e) { toast(errMsg(e)); busy(f, false); }
  },
  async unlock(f) {
    const d = Object.fromEntries(new FormData(f)), btn = f.querySelector('button.btn'), label = btn.textContent;
    const say = (t) => { let e = f.querySelector('.ferr'); if (!e) { e = document.createElement('p'); e.className = 'ferr'; f.appendChild(e); } e.textContent = t; };
    f.querySelector('.ferr')?.remove(); busy(f, true); btn.textContent = 'Submitting…';
    const slow = setTimeout(() => say('Still working… please check your internet connection.'), 12000);
    try {
      const me = S.me, bref = doc(db, 'bookings', d.id), batch = writeBatch(db);
      batch.update(bref, { fee: S.cfg.feeUgx, feeStatus: 'pending', feeRef: d.ref.trim(), updatedAt: serverTimestamp() });
      batch.set(doc(bref, 'private', 'tcontact'), { phone: me.phone || '' });
      await batch.commit(); clearTimeout(slow); closeModal(); toast('Payment submitted. We will confirm it shortly.');
    } catch (e) {
      clearTimeout(slow); console.error('unlock failed', e); busy(f, false); btn.textContent = label;
      say(e.code === 'permission-denied' ? 'The database refused this. Ask the admin to publish the latest Firestore rules and make sure Revenue → platform settings exist, then try again.' : errMsg(e));
    }
  },
  async agree(f) {
    const d = Object.fromEntries(new FormData(f)), price = Number(d.price);
    if (!price || price < 0) return toast('Enter the agreed price in UGX.');
    closeModal();
    run(moveBooking(d.id, { status: 'confirmed', price, hasDelivery: true }, { fn: (bt, b) => {
      // The mill gets its own copy of the booking with no price, fee or phone numbers.
      bt.set(doc(db, 'deliveries', d.id), { millId: b.millId, millName: b.millName, farmerId: b.farmerId, transporterId: b.transporterId, farmerName: b.farmerName, transporterName: b.transporterName, pickupLabel: b.pickupLabel, pickup: b.pickup, tons: b.tons, date: b.date, status: 'confirmed', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      note(bt, b.transporterId, 'Job confirmed', `${b.farmerName} confirmed the price for ${b.pickupLabel}. Start the trip on the pickup date.`, `#/b/${d.id}`, d.id);
    } }), 'Confirmed. The mill can now see this delivery, without the price.');
  },
  async receipt(f) {
    const d = Object.fromEntries(new FormData(f)), tons = Number(d.tons);
    if (!tons || tons <= 0) return toast('Enter the tonnes received at the weighbridge.');
    try { await updateDoc(doc(db, 'deliveries', d.id), { receipt: { tons, note: d.note.trim(), at: Date.now(), by: S.me.name }, updatedAt: serverTimestamp() }); S.dirty = false; toast('Receipt recorded. The farmer and transporter can see it.'); } catch (e) { toast(errMsg(e)); }
  },
  async chat(f) {
    const d = Object.fromEntries(new FormData(f)), text = d.text.trim();
    if (!text) return; f.reset();
    try { await addDoc(collection(db, 'bookings', d.id, 'messages'), { senderId: S.user.uid, senderName: S.me.name, text, at: serverTimestamp() }); } catch (e) { toast(errMsg(e)); }
  },
  async request(f) {
    const d = Object.fromEntries(new FormData(f)), pk = S.pick;
    if (!pk) return toast('Tap the map to mark your pickup point.');
    const mill = allMills()[d.mill], tons = Number(d.tons), me = S.me;
    const ref = doc(collection(db, 'bookings')), b = writeBatch(db);
    b.set(ref, { farmerId: S.user.uid, farmerName: me.name, pickupLabel: d.label.trim(), pickup: { lat: Math.round(pk.lat * 100) / 100, lng: Math.round(pk.lng * 100) / 100 }, millId: d.mill, millName: mill.name, tons, date: d.date, price: Number(d.price), distanceKm: Math.round(km(pk, mill)), notes: d.notes.trim(), status: 'awaiting', createdAt: serverTimestamp(), timeline: [{ s: 'awaiting', at: Date.now(), by: me.name }] });
    b.set(doc(ref, 'private', 'contact'), { phone: me.phone });
    try { await b.commit(); toast('Request posted. Verified transporters can now see it.'); location.hash = `#/b/${ref.id}`; } catch (e) { toast(errMsg(e)); }
  },
  async notice(f) {
    const d = Object.fromEntries(new FormData(f)), m = allMills()[S.me.millId];
    try {
      await addDoc(collection(db, 'intake'), { millId: S.me.millId, millName: m.name, from: d.from, to: d.to, tons: Number(d.tons), priceLow: Number(d.low) || 0, priceHigh: Number(d.high) || 0, note: d.note.trim(), createdAt: serverTimestamp() });
      f.reset(); S.dirty = false; toast('Notice published to farmers.');
    } catch (e) { toast(errMsg(e)); }
  },
  async dispute(f) {
    const d = Object.fromEntries(new FormData(f));
    try {
      await addDoc(collection(db, 'disputes'), { bookingId: d.bid, reporterId: S.user.uid, reporterName: S.me.name, subject: d.subject.trim(), status: 'open', createdAt: serverTimestamp() });
      if (d.bid) await setBooking(d.bid, { status: 'disputed' });
      f.reset(); S.dirty = false; toast('Issue reported. We will respond within one working day.');
    } catch (e) { toast(errMsg(e)); }
  },
  async mill(f) {
    const d = Object.fromEntries(new FormData(f)), pk = S.millPick;
    if (!pk) return toast("Search for the mill or tap the map to drop its pin.");
    const id = d.id || `${d.mname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
    const prev = allMills()[d.id] || {};
    try {
      await setDoc(doc(db, 'mills', id), { ...prev, name: d.mname.trim(), area: d.area.trim(), lat: pk.lat, lng: pk.lng, active: prev.active !== false, status: prev.status || 'approved', ...(d.id ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
      toast('Mill saved. It now shows on every map.'); S.dirty = false; location.hash = '#/mills'; render(true);
    } catch (e) { toast(errMsg(e)); }
  },
  async settings(f) {
    const d = Object.fromEntries(new FormData(f));
    try { await setDoc(doc(db, 'config', 'platform'), { ...S.cfg, feeUgx: Number(d.fee), ratePerTonKm: Number(d.rate), payNumber: d.pay.trim(), supportPhone: d.support.trim() }); S.dirty = false; toast('Settings saved.'); } catch (e) { toast(errMsg(e)); }
  }
};

async function setBooking(id, patch, quiet) {
  const extra = patch.status ? { timeline: arrayUnion({ s: patch.status, at: Date.now(), by: S.me.name }) } : {};
  try { await updateDoc(doc(db, 'bookings', id), { ...patch, ...extra, updatedAt: serverTimestamp() }); if (!quiet) toast('Updated.'); } catch (e) { toast(errMsg(e)); }
}

const acts = {
  authmode: (d) => renderAuth(d.m),
  logout: () => signOut(auth),
  request: (d) => {
    if (S.lock) return toast('You already hold a job. Finish it, or wait for the farmer to decide, before taking another.');
    const uid = S.user.uid, me = S.me;
    run(moveBooking(d.id, { status: 'requested', transporterId: uid, transporterName: me.name }, { fn: (bt, b) => {
      bt.set(doc(db, 'locks', uid), { bookingId: d.id, createdAt: serverTimestamp() });
      note(bt, b.farmerId, 'New transporter request', `${me.name} wants to carry your cane from ${b.pickupLabel}. Open the request to approve or decline.`, `#/b/${d.id}`, d.id);
    } }), 'Request sent. The farmer has been notified.');
  },
  approve: (d) => run(moveBooking(d.id, { status: 'accepted' }, { fn: (bt, b) => note(bt, b.transporterId, 'Request approved', `The farmer approved you for ${b.pickupLabel}. Pay the unlock fee to open contact details and chat.`, `#/b/${d.id}`, d.id) }), 'Transporter approved. They have been notified.'),
  decline: (d) => confirm('Decline this transporter? The job reopens for others and they are notified.') && run(moveBooking(d.id, { status: 'awaiting', transporterId: null, transporterName: null }, { fn: (bt, b) => { bt.delete(doc(db, 'locks', b.transporterId)); note(bt, b.transporterId, 'Request declined', `The farmer declined your request for ${b.pickupLabel}. You are free to take another job.`, '#/board', d.id); } }), 'Transporter declined. The job is open again.'),
  withdraw: (d) => confirm('Withdraw from this job?') && run(moveBooking(d.id, { status: 'awaiting', transporterId: null, transporterName: null }, { fn: (bt, b) => { bt.delete(doc(db, 'locks', S.user.uid)); note(bt, b.farmerId, 'Transporter withdrew', `${S.me.name} withdrew from ${b.pickupLabel}. Your job is open again.`, `#/b/${d.id}`, d.id); } }), 'You withdrew from the job.'),
  unlock: (d) => {
    if (!S.cfg.payNumber) return toast('Payments are not set up yet. Please contact support.');
    modal(`<h3>Unlock this job</h3><p>The farmer approved you. Pay a flat <b>${ugx(S.cfg.feeUgx)}</b> to see their phone number and exact pickup pin, and to open the chat.</p><ol class="steps"><li>Send ${ugx(S.cfg.feeUgx)} by MTN MoMo or Airtel Money to <b>${esc(S.cfg.payNumber)}</b>.</li><li>Type the transaction ID from the confirmation SMS below.</li></ol><form class="form" data-form="unlock"><input type="hidden" name="id" value="${d.id}"><label>Transaction ID<input name="ref" required minlength="6" autocomplete="off" placeholder="e.g. 4812345678"></label><div class="btns"><button class="btn primary">I have paid</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form><small class="muted">An admin confirms your payment, usually within minutes. The job stays held for you meanwhile.</small>`);
  },
  agree: (d) => {
    const b = S.bookings.find((x) => x.id === d.id);
    modal(`<h3>Confirm transporter & price</h3><p>Enter the price you and ${esc(b?.transporterName || 'the transporter')} agreed in the chat. Freight is paid directly between you. The mill will not see this price.</p><form class="form" data-form="agree"><input type="hidden" name="id" value="${d.id}"><label>Agreed price (UGX)<input name="price" type="number" min="0" step="1000" value="${b?.price || ''}" required></label><div class="btns"><button class="btn primary">Confirm</button><button type="button" class="btn ghost" data-close>Cancel</button></div></form>`);
  },
  confirmpay: (d) => run(moveBooking(d.id, { feeStatus: 'paid', paidAt: Date.now() }, { fn: (bt, b) => { note(bt, b.transporterId, 'Payment confirmed', 'Contact details and chat are now open.', `#/b/${d.id}`, d.id); note(bt, b.farmerId, 'Chat is open', `${b.transporterName} unlocked your job. Agree the price in the chat, then confirm.`, `#/b/${d.id}`, d.id); } }), 'Payment confirmed.'),
  refund: (d) => confirm('Mark this fee as refunded? Send the money back by mobile money first.') && run(moveBooking(d.id, { feeStatus: 'refunded' }, { fn: (bt, b) => note(bt, b.transporterId, 'Fee refunded', 'Your unlock fee was refunded by mobile money.', '#/earnings', d.id) }), 'Marked as refunded.'),
  cancel: (d) => confirm('Cancel this request?') && run(moveBooking(d.id, { status: 'cancelled' }, { delivery: { status: 'cancelled' }, fn: (bt, b) => { if (b.transporterId) { bt.delete(doc(db, 'locks', b.transporterId)); note(bt, b.transporterId, 'Job cancelled', `The farmer cancelled ${b.pickupLabel}.${b.feeStatus ? ' If you paid the unlock fee, contact support for a refund.' : ''} You are free to take another job.`, '#/board', d.id); } } }), 'Request cancelled.'),
  start: (d) => run(moveBooking(d.id, { status: 'in-progress' }, { delivery: { status: 'in-progress' }, fn: (bt, b) => note(bt, b.farmerId, 'Trip started', `${S.me.name} is on the way to collect your cane.`, `#/b/${d.id}`, d.id) }), 'Trip started.'),
  complete: (d) => confirm('Mark this delivery as completed?') && (stopTrack(), run(moveBooking(d.id, { status: 'completed' }, { delivery: { status: 'completed' }, fn: (bt, b) => { bt.delete(doc(db, 'locks', S.user.uid)); note(bt, b.farmerId, 'Cane delivered', `${S.me.name} marked your delivery to ${b.millName} as completed.`, `#/b/${d.id}`, d.id); } }), 'Delivery completed. You can now take another job.')),
  track: (d) => {
    if (S.watch != null) { stopTrack(); toast('Stopped sharing your location.'); return render(true); }
    if (!navigator.geolocation) return toast('Location is not available on this device.');
    let last = 0; S.trackBid = d.id;
    S.watch = navigator.geolocation.watchPosition((p) => { const now = Date.now(); if (now - last < 15000) return; last = now; const loc = { lat: p.coords.latitude, lng: p.coords.longitude, at: now }; moveBooking(d.id, { liveLoc: loc }, { delivery: { liveLoc: loc } }).catch(() => {}); }, (e) => { stopTrack(); gpsError(e); render(true); }, { enableHighAccuracy: true, maximumAge: 5000 });
    toast('Sharing your live location with the farmer and the mill while this page stays open.'); render(true);
  },
  resolve: async (d) => {
    try {
      const b = S.bookings.find((x) => x.id === d.bid), batch = writeBatch(db);
      batch.update(doc(db, 'disputes', d.id), { status: 'resolved' });
      if (b) {
        batch.update(doc(db, 'bookings', b.id), { status: d.to, updatedAt: serverTimestamp(), timeline: arrayUnion({ s: d.to, at: Date.now(), by: S.me.name }) });
        if (b.hasDelivery) batch.update(doc(db, 'deliveries', b.id), { status: d.to, updatedAt: serverTimestamp() });
        if (b.transporterId) batch.delete(doc(db, 'locks', b.transporterId));
      }
      await batch.commit(); toast('Dispute resolved.');
    } catch (e) { toast(errMsg(e)); }
  },
  readalert: (d) => { updateDoc(doc(db, 'notifications', d.id), { read: true }).catch(() => {}); },
  readall: () => { const b = writeBatch(db); S.notes.filter((n) => !n.read).forEach((n) => b.update(doc(db, 'notifications', n.id), { read: true })); b.commit().catch(() => {}); },
  verify: async (d) => {
    const u = S.users.find((x) => x.id === d.id), m = u?.role === 'mill' ? allMills()[u.millId] : null;
    try { const b = writeBatch(db); b.update(doc(db, 'users', d.id), { verified: true }); note(b, d.id, 'Account verified', u?.role === 'mill' ? 'Your mill is approved and pinned on the map.' : 'Your account is verified. You can now use the job board.'); if (m?.ownerId === d.id) b.set(doc(db, 'mills', u.millId), { status: 'approved', active: true }, { merge: true }); await b.commit(); toast(m?.ownerId === d.id ? 'Mill approved and pinned on the map.' : 'Verified.'); } catch (e) { toast(errMsg(e)); }
  },
  unverify: async (d) => {
    const u = S.users.find((x) => x.id === d.id), m = u?.role === 'mill' ? allMills()[u.millId] : null;
    try { const b = writeBatch(db); b.update(doc(db, 'users', d.id), { verified: false }); if (m?.ownerId === d.id) b.set(doc(db, 'mills', u.millId), { status: 'pending' }, { merge: true }); await b.commit(); } catch (e) { toast(errMsg(e)); }
  },
  millapprove: async (d) => {
    const m = allMills()[d.id];
    try { const b = writeBatch(db); b.set(doc(db, 'mills', d.id), { status: 'approved', active: true }, { merge: true }); if (m?.ownerId) { b.update(doc(db, 'users', m.ownerId), { verified: true }); note(b, m.ownerId, 'Mill approved', `${m.name} is now pinned on the map. Farmers can deliver to you.`); } await b.commit(); toast('Mill approved and pinned on the map.'); } catch (e) { toast(errMsg(e)); }
  },
  useloc: (d, el) => {
    if (!navigator.geolocation) return toast('Location is not available on this device. Search or tap the map instead.');
    const html = el.innerHTML; el.disabled = true; el.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition((p) => { el.disabled = false; el.innerHTML = html; S.picker?.place(p.coords.latitude, p.coords.longitude, { fly: true, zoom: 16, accuracy: p.coords.accuracy, source: 'gps' }); },
      (e) => { el.disabled = false; el.innerHTML = html; gpsError(e); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  },
  nearme: () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((p) => { S.myLoc = { lat: p.coords.latitude, lng: p.coords.longitude }; render(true); }, gpsError, { enableHighAccuracy: true, timeout: 15000 }) : toast('Location is not available on this device.'),
  millactive: (d) => { const m = allMills()[d.id]; setDoc(doc(db, 'mills', d.id), { ...m, active: m.active === false }, { merge: true }).then(() => toast(m.active === false ? 'Mill is visible again.' : 'Mill hidden from new requests.')).catch((e) => toast(errMsg(e))); },
  togglepw: (d, el) => { const i = el.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Show' : 'Hide'; },
  delnotice: async (d) => { const { deleteDoc } = await import('firebase/firestore'); deleteDoc(doc(db, 'intake', d.id)); },
  defaults: () => setDoc(doc(db, 'config', 'platform'), DEF_CFG).then(() => toast('Default settings created.')).catch((e) => toast(errMsg(e))),
};
document.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) return closeModal(); const t = e.target.closest('[data-act]'); if (t) acts[t.dataset.act]?.(t.dataset, t); });
app.addEventListener('input', (e) => { if (e.target.closest('#view form:not([data-chat])')) S.dirty = true; });
document.addEventListener('submit', (e) => { e.preventDefault(); forms[e.target.dataset.form]?.(e.target); });
window.addEventListener('hashchange', () => render(true));

/* ---------- Data subscriptions ---------- */
function teardown() { stopTrack(); S.unsubs.forEach((u) => u()); S.unsubs = []; S.subKey = ''; Object.assign(S, { bookings: [], open: [], intake: [], users: [], disputes: [], millList: [], deliveries: [], notes: [], lock: null }); }
function subscribe() {
  const me = S.me, key = `${me.role}|${me.verified}|${me.millId}`;
  if (key === S.subKey) return;
  S.unsubs.forEach((u) => u()); S.unsubs = []; S.subKey = key;
  const on = (q, slot) => S.unsubs.push(onSnapshot(q, (s) => { S[slot] = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNew); render(); }, (e) => console.warn(slot, e.code)));
  const bk = collection(db, 'bookings'), uid = S.user.uid;
  on(collection(db, 'intake'), 'intake');
  on(collection(db, 'mills'), 'millList');
  S.unsubs.push(onSnapshot(doc(db, 'config', 'platform'), (s) => { S.cfgExists = s.exists(); S.cfg = { ...DEF_CFG, ...(s.data() || {}) }; render(); }, () => {}));
  if (me.role === 'farmer') on(query(bk, where('farmerId', '==', uid)), 'bookings');
  if (me.role === 'transporter') {
    on(query(bk, where('transporterId', '==', uid)), 'bookings'); if (me.verified) on(query(bk, where('status', '==', 'awaiting')), 'open');
    S.unsubs.push(onSnapshot(doc(db, 'locks', uid), (s) => { S.lock = s.exists() ? s.data() : null; render(); }, () => {}));
  }
  if (me.role === 'mill' && me.verified && me.millId) on(query(collection(db, 'deliveries'), where('millId', '==', me.millId)), 'deliveries');
  let first = true;
  S.unsubs.push(onSnapshot(query(collection(db, 'notifications'), where('userId', '==', uid)), (s) => {
    S.notes = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNew);
    if (!first) s.docChanges().forEach((c) => { if (c.type === 'added' && !c.doc.metadata.hasPendingWrites) toast(`New alert: ${c.doc.data().title}`); });
    first = false; render();
  }, () => {}));
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
  const home = ['home', 'Home', 'home'], alerts = ['alerts', 'Alerts', 'bell'], help = ['help', 'Support', 'chat'];
  return { farmer: [home, ['bookings', 'My requests', 'file'], ['new', 'Request', 'plus'], ['market', 'Market', 'chart'], alerts, help],
    transporter: [home, ['board', 'Job board', 'truck'], ['bookings', 'My jobs', 'file'], ['earnings', 'Fees', 'cash'], alerts, help],
    mill: [home, ['market', 'Intake', 'chart'], ['bookings', 'Deliveries', 'truck'], alerts, help],
    admin: [home, ['bookings', 'Bookings', 'file'], ['users', 'Users', 'users'], ['mills', 'Mills', 'factory'], ['disputes', 'Disputes', 'alert'], ['revenue', 'Revenue', 'cash'], alerts] }[role] || [home];
}
function render(force) {
  if (!S.user || !S.me) return;
  if (force) S.dirty = false; else if (S.dirty || document.activeElement?.matches?.('#view input,#view select,#view textarea')) return;
  S.cleanup.forEach((c) => c()); S.cleanup = []; S.picker = null; post = [];
  const r = route(), views = { home, bookings, new: newReq, board, market, earnings, users, mills: millsPage, disputes, revenue, help, alerts, b: detail, d: ddetail };
  const nav = navFor(S.me.role), body = (views[r.name] || home)(r), cur = r.name === 'b' || r.name === 'd' ? 'bookings' : r.name, unread = S.notes.filter((n) => !n.read).length;
  const link = ([k, l, i]) => `<a href="#/${k}" class="${cur === k ? 'on' : ''}">${ic(i)}<span>${l}</span>${k === 'alerts' && unread ? `<b class="badge">${unread}</b>` : ''}</a>`;
  app.innerHTML = `<div class="shell"><aside class="side">${logo(true)}<nav>${nav.map(link).join('')}</nav><div class="me"><b>${esc(S.me.name)}</b><small>${S.me.role}${S.me.verified ? ' · verified' : ''}</small><button data-act="logout" class="link">${ic('out')} Sign out</button></div></aside>
  <main id="view">${gate()}${body}</main>
  <nav class="tabbar">${nav.map(link).join('')}</nav></div>`;
  post.forEach((fn) => fn());
}
const gate = () => (['transporter', 'mill'].includes(S.me.role) && !S.me.verified ? `<div class="banner">${ic('shield')}<div><b>${S.me.role === 'mill' ? 'Mill registration under review' : 'Verification pending'}</b><p>${S.me.role === 'mill' ? `Our team is reviewing ${esc(allMills()[S.me.millId]?.name || 'your mill')}. Once approved it is pinned on the map and farmers can deliver to you.` : 'Our team is reviewing your account. You will see the job board as soon as you are verified.'}</p></div></div>` : '');
const head = (t, sub, action = '') => `<header class="head"><div><h1>${t}</h1><p>${sub}</p></div>${action}</header>`;
const empty = (t, s = '') => `<div class="empty"><b>${t}</b><p>${s}</p></div>`;
const bcard = (b, extra = '') => `<a class="bcard" href="#/b/${b.id}"><div class="top"><b>${esc(b.pickupLabel)}</b>${pill(b.status)}</div><div class="to">${ic('arrow')} ${esc(b.millName)}</div><div class="meta"><span>${b.tons} t</span><span>${fdate(b.date)}</span><span>${ugx(b.price)}</span><span>${b.distanceKm} km</span>${extra ? `<span class="near">${esc(extra)}</span>` : ''}<small>#${short(b.id)}</small></div></a>`;
const stats = (l) => `<div class="stats">${l.map(([t, v, h]) => (h ? `<a class="stat link" href="${h}"><span>${t}</span><b>${v}</b><i>${ic('arrow')}</i></a>` : `<div class="stat"><span>${t}</span><b>${v}</b></div>`)).join('')}</div>`;

/* ---------- Views ---------- */
function home() {
  const me = S.me, B = S.bookings, D = S.deliveries, n = (s) => B.filter((b) => s.includes(b.status)).length, active = ['requested', 'accepted', 'confirmed', 'in-progress'];
  const done = B.filter((b) => b.status === 'completed'), L = (f) => `#/bookings?f=${f}`;
  let s, act = '', jobs = [], millSet = activeMills(), extra = '', recent = B.slice(0, 5).map((b) => bcard(b));
  if (me.role === 'farmer') { s = [['Open requests', n(['awaiting']), L('awaiting')], ['In progress', n(active), L('active')], ['Delivered', done.length, L('completed')], ['Tonnes delivered', sum(done, (b) => b.tons), L('completed')]]; act = '<a class="btn primary" href="#/new">New transport request</a>'; jobs = B.filter((b) => !['completed', 'cancelled'].includes(b.status)); }
  else if (me.role === 'transporter') {
    s = [['Jobs on the board', S.open.length, '#/board'], ['Job in hand', S.lock ? 1 : 0, L('active')], ['Delivered', done.length, L('completed')], ['Payments awaiting confirmation', B.filter((b) => b.feeStatus === 'pending').length, '#/earnings']]; act = '<a class="btn primary" href="#/board">Browse jobs</a>';
    jobs = [...S.open, ...B.filter((b) => active.includes(b.status))];
    const cur = S.lock && B.find((b) => b.id === S.lock.bookingId);
    extra = cur ? `<h2 class="sec">Your current job</h2><div class="grid">${bcard(cur)}</div><p class="note">You hold one job at a time. Complete it, or wait for the farmer's decision, to take another.</p>` : '';
  } else if (me.role === 'mill') {
    const dAct = D.filter((x) => ['confirmed', 'in-progress'].includes(x.status));
    s = [['Deliveries expected', dAct.length, L('active')], ['Tonnes expected', sum(dAct, (x) => x.tons), L('active')], ['Receipts recorded', D.filter((x) => x.receipt).length, L('completed')], ['Live notices', S.intake.filter((i) => i.millId === me.millId).length, '#/market']];
    jobs = dAct; const m = allMills()[me.millId]; millSet = m ? { [me.millId]: m } : {}; recent = D.slice(0, 5).map(dcard);
  } else { const acc = B.filter((b) => b.transporterId).length; s = [['Bookings', B.length, L('all')], ['Completion rate', acc ? `${Math.round((done.length / acc) * 100)}%` : '–', L('completed')], ['Awaiting verification', S.users.filter((u) => u.role !== 'admin' && !u.verified).length, '#/users?f=pending'], ['Open disputes', S.disputes.filter((d) => d.status === 'open').length, '#/disputes'], ['Payments to confirm', B.filter((b) => b.feeStatus === 'pending').length, '#/revenue']]; act = '<a class="btn primary" href="#/mills">Manage mills</a>'; jobs = B.filter((b) => b.status === 'awaiting' || active.includes(b.status)); }
  post.push(() => S.cleanup.push(overviewMap(document.getElementById('hmap'), { mills: millSet, jobs, millPopup, jobPopup })));
  return `${head(`Hello, ${esc(me.name.split(' ')[0])}`, me.role === 'admin' ? 'Pilot health at a glance. Tap any card to dig in.' : 'Your cane logistics at a glance. Tap any card to open it.', act)}${stats(s)}${extra}<h2 class="sec">${me.role === 'admin' ? 'Network map' : 'Live map'}</h2><div id="hmap" class="map short"></div>${legend()}<h2 class="sec">Recent activity</h2>${recent.length ? `<div class="grid">${recent.join('')}</div>` : empty('Nothing here yet', me.role === 'farmer' ? 'Post your first transport request to get started.' : me.role === 'transporter' ? 'Jobs you request will appear here.' : me.role === 'mill' ? 'Confirmed deliveries to your mill will appear here.' : 'Bookings will appear here.')}`;
}

function bookings(r) {
  const mill = S.me.role === 'mill', src = mill ? S.deliveries : S.bookings, f = r.q.get('f') || 'all';
  const G = mill ? { active: ['confirmed', 'in-progress'], completed: ['completed'], cancelled: ['cancelled', 'disputed'] } : { awaiting: ['awaiting'], active: ['requested', 'accepted', 'confirmed', 'in-progress'], completed: ['completed'], cancelled: ['cancelled', 'disputed'] };
  const tabs = mill ? [['all', 'All'], ['active', 'Expected'], ['completed', 'Completed'], ['cancelled', 'Cancelled']] : [['all', 'All'], ['awaiting', 'Awaiting'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled / disputed']];
  const cnt = (k) => (k === 'all' ? src.length : src.filter((b) => G[k].includes(b.status)).length);
  const list = f === 'all' || !G[f] ? src : src.filter((b) => G[f].includes(b.status));
  return `${head(S.me.role === 'transporter' ? 'My jobs' : mill ? 'Deliveries' : S.me.role === 'admin' ? 'All bookings' : 'My requests', mill ? 'Confirmed deliveries to your mill. Transport prices are private to the farmer and transporter.' : 'Every booking and its current status.')}${chips(tabs.map(([k, t]) => [k, t, cnt(k)]), f, '#/bookings')}${list.length ? `<div class="grid">${list.map((x) => (mill ? dcard(x) : bcard(x))).join('')}</div>` : empty('Nothing in this view yet')}`;
}

function newReq(r) {
  if (S.me.role !== 'farmer') return empty('Only farmers can create requests');
  const M = activeMills(), pre = M[r.q.get('mill')] ? r.q.get('mill') : Object.keys(M)[0], tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  S.pick = null;
  post.push(() => {
    const f = document.querySelector('[data-form=request]'), lab = f.label, out = document.getElementById('est'), st = document.getElementById('pinst');
    const upd = () => {
      const m = allMills()[f.mill.value]; picker.setMill(m);
      if (!S.pick || !m) { out.textContent = ''; return; }
      const d = Math.round(km(S.pick, m)), tons = Number(f.tons.value) || 0, g = Math.round((d * tons * S.cfg.ratePerTonKm) / 1000) * 1000;
      out.innerHTML = `Approx. road distance <b>${d} km</b>. Guide price <b>${ugx(g)}</b> (you can set your own offer).`;
      if (!f.price.dataset.touched) f.price.value = g;
    };
    const picker = (S.picker = pickerMap(document.getElementById('pickmap'), { mills: M, onPick: async (ll, src) => {
      S.pick = ll; S.dirty = true; st.innerHTML = `${ic('check')} Pin set (${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}). Drag the pin to fine-tune it.`; upd();
      if (src !== 'search' && (!lab.value || lab.dataset.auto)) { const t = await reverse(ll.lat, ll.lng); if (t && (!lab.value || lab.dataset.auto)) { lab.value = t; lab.dataset.auto = '1'; } }
    } }));
    S.cleanup.push(picker.destroy);
    function pick(it) { lab.value = it.coords ? '' : it.sub ? `${it.title}, ${it.sub}` : it.title; lab.dataset.auto = it.coords ? '1' : ''; picker.clearSuggest(); picker.place(it.lat, it.lng, { fly: true, zoom: it.coords ? 17 : 15, source: it.coords ? 'coords' : 'search' }); }
    attachSearch(lab, document.getElementById('sug'), { onResults: (l) => picker.suggest(l, pick), onPick: pick });
    f.price.addEventListener('input', () => (f.price.dataset.touched = 1)); [f.mill, f.tons].forEach((x) => x.addEventListener('input', upd)); upd();
  });
  return `${head('Request transport', 'Search or pin your pickup so the driver can find you.')}<form class="card form" data-form="request"><div class="two"><div><div id="pickmap" class="map"></div><button type="button" class="btn ghost wide" data-act="useloc">${ic('pin')} Use my current location</button><p id="pinst" class="note">No pin yet. Search on the right, paste a Google Maps link or coordinates, tap the map, or use your current location.</p></div><div class="stack">
  <label>Pickup place (type to search)<div class="sugwrap"><input name="label" required autocomplete="off" placeholder="Village, trading centre or landmark"><div id="sug" class="sug"></div></div></label>
  <label>Deliver to<select name="mill">${Object.entries(M).map(([k, m]) => `<option value="${k}" ${k === pre ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
  <div class="two"><label>Load (tonnes)<input name="tons" type="number" min="1" step="0.5" value="10" required></label><label>Pickup date<input name="date" type="date" min="${tomorrow}" value="${tomorrow}" required></label></div>
  <label>Your offer (UGX)<input name="price" type="number" min="0" step="1000" required></label><p id="est" class="note"></p>
  <label>Notes for the driver<textarea name="notes" rows="2" placeholder="Access road, loading help, contact at the farm"></textarea></label>
  <button class="btn primary wide">Post request</button><small class="muted">Your phone number is shared only with the transporter who accepts. Do not cut cane until a mill intake slot is confirmed.</small></div></div></form>`;
}

function board() {
  if (S.me.role !== 'transporter') return empty('Job board is for transporters');
  if (!S.me.verified) return empty('Waiting for verification', 'The job board opens when your account is verified.');
  const me = S.myLoc, jobs = [...S.open], cur = S.lock ? S.bookings.find((b) => b.id === S.lock.bookingId) : null;
  if (me) jobs.sort((a, b) => km(me, a.pickup) - km(me, b.pickup));
  post.push(() => S.cleanup.push(overviewMap(document.getElementById('boardmap'), { mills: activeMills(), jobs, me, millPopup, jobPopup })));
  const hold = S.lock ? `<div class="banner">${ic('shield')}<div><b>You are holding a job</b><p>${cur ? `${esc(cur.pickupLabel)} · ${STATUS[cur.status]?.[0] || cur.status}. ` : ''}You can take another once you complete it, or the farmer declines or cancels it.</p>${cur ? `<a class="btn small primary" href="#/b/${cur.id}">Open my job</a>` : ''}</div></div>` : '';
  return `${head('Job board', 'Open requests pinned on the map. You can hold one job at a time.', `<button class="btn ghost" data-act="nearme">${ic('pin')} ${me ? 'Refresh my location' : 'Jobs near me'}</button>`)}${hold}<div id="boardmap" class="map"></div>${legend()}${jobs.length ? `<div class="grid">${jobs.map((b) => bcard(b, me ? `${Math.round(km(me, b.pickup))} km from you` : '')).join('')}</div>` : empty('No open jobs right now', 'New requests appear here live.')}`;
}

function market(r) {
  const me = S.me, mine = me.role === 'mill' && me.verified && me.millId, sel = r.q.get('mill'), all = allMills();
  const mset = mine ? (all[me.millId] ? { [me.millId]: all[me.millId] } : {}) : activeMills();
  post.push(() => S.cleanup.push(overviewMap(document.getElementById('mmap'), { mills: mset, millPopup })));
  const list = S.intake.filter((i) => (!mine || i.millId === me.millId) && (!sel || i.millId === sel));
  return `${head('Market & intake', 'Where mills are receiving cane. Always confirm price and slot before you harvest.')}<div id="mmap" class="map short"></div>${sel && all[sel] ? `<div class="chips"><a class="chip on" href="#/market">Showing ${esc(all[sel].name)} · show all</a></div>` : ''}
  ${mine ? `<form class="card form" data-form="notice"><h3>Publish an intake notice</h3><div class="two"><label>From<input name="from" type="date" required></label><label>To<input name="to" type="date" required></label></div><div class="two"><label>Tonnes wanted<input name="tons" type="number" min="1" required></label><label>Note<input name="note" placeholder="Quality or delivery rules"></label></div><div class="two"><label>Indicative price low (UGX/t)<input name="low" type="number"></label><label>Indicative price high (UGX/t)<input name="high" type="number"></label></div><button class="btn primary">Publish notice</button></form>` : ''}
  <h2 class="sec">Intake notices</h2>${list.length ? `<div class="grid">${list.map((i) => `<div class="bcard"><div class="top"><b>${esc(i.millName)}</b><span class="pill green">${i.tons} t wanted</span></div><div class="meta"><span>${fdate(i.from)} – ${fdate(i.to)}</span>${i.priceHigh ? `<span>${ugx(i.priceLow)}–${ugx(i.priceHigh)} /t</span>` : ''}</div><p class="note">${esc(i.note)}</p>${me.role === 'farmer' ? `<a class="btn small primary" href="#/new?mill=${i.millId}">Plan transport</a>` : ''}${mine ? `<button class="btn small ghost" data-act="delnotice" data-id="${i.id}">Remove</button>` : ''}<p class="note">Indicative only. Final price depends on quality, deductions and the buyer agreement.</p></div>`).join('')}</div>` : empty('No notices yet', 'Mills publish their intake needs here.')}`;
}

function earnings() {
  const L = S.bookings.filter((b) => b.fee && b.feeStatus), ok = L.filter((b) => b.feeStatus === 'paid'), wait = L.filter((b) => b.feeStatus === 'pending');
  const tag = { paid: ['Confirmed', 'green'], pending: ['Awaiting confirmation', 'amber'], refunded: ['Refunded', 'grey'] };
  return `${head('Fees & payments', `A flat ${ugx(S.cfg.feeUgx)} unlocks each job's contact details and chat. It is shown before you accept.`)}${stats([['Jobs unlocked', ok.length], ['Awaiting confirmation', ugx(sum(wait, (b) => b.fee))], ['Fees paid', ugx(sum(ok, (b) => b.fee))]])}
  <div class="card">${S.cfg.payNumber ? `<p>Pay by MTN MoMo or Airtel Money to <b>${esc(S.cfg.payNumber)}</b>, then enter the transaction ID when you accept a job. Freight is agreed in the chat and paid directly by the farmer.</p>` : '<p>Payment details will be shown here soon.</p>'}</div>
  ${L.length ? `<div class="list">${L.map((b) => `<div class="row"><span><b>#${short(b.id)}</b> ${esc(b.pickupLabel)} → ${esc(b.millName)}<small>Ref ${esc(b.feeRef || '')}</small></span><span>${ugx(b.fee)}</span><span class="pill ${tag[b.feeStatus]?.[1] || 'grey'}">${tag[b.feeStatus]?.[0] || b.feeStatus}</span></div>`).join('')}</div>` : empty('No unlocked jobs yet', 'Accept a job from the board to get started.')}`;
}

function users(r) {
  if (S.me.role !== 'admin') return empty('Admins only');
  const f = r.q.get('f') || 'all', all = S.users.filter((u) => u.role !== 'admin');
  const l = f === 'pending' ? all.filter((u) => !u.verified) : f === 'verified' ? all.filter((u) => u.verified) : all;
  return `${head('Users & verification', 'Confirm phone ownership, role and operating area. Approving a mill owner also pins their mill on the map.')}${chips([['all', 'All', all.length], ['pending', 'Awaiting verification', all.filter((u) => !u.verified).length], ['verified', 'Verified', all.filter((u) => u.verified).length]], f, '#/users')}<div class="list">${l.map((u) => { const m = u.role === 'mill' ? allMills()[u.millId] : null; return `<div class="row"><span><b>${esc(u.name)}</b><small>${u.role} · ${esc(u.district)} · ${esc(u.phone)}</small>${m ? `<small>Mill: <b>${esc(m.name)}</b> · <a class="lnk2" href="#/mills?edit=${u.millId}">View pin</a></small>` : ''}</span>${u.verified ? `<button class="btn small ghost" data-act="unverify" data-id="${u.id}">Verified ✓ Revoke</button>` : `<button class="btn small primary" data-act="verify" data-id="${u.id}">${m ? 'Approve mill' : 'Verify'}</button>`}</div>`; }).join('') || empty('Nobody here yet')}</div>`;
}

function millsPage(r) {
  if (S.me.role !== 'admin') return empty('Admins only');
  const all = allMills(), eid = r.q.get('edit'), em = eid ? all[eid] : null;
  S.millPick = em ? { lat: em.lat, lng: em.lng } : null;
  post.push(() => {
    const f = document.querySelector('[data-form=mill]'), st = document.getElementById('mpin');
    const picker = pickerMap(document.getElementById('millmap'), { mills: Object.fromEntries(Object.entries(all).filter(([k]) => k !== eid)), start: em, onPick: (ll, src) => { S.millPick = ll; if (src !== 'init') S.dirty = true; st.textContent = `Pin at ${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)}. Drag it to fine-tune.`; } });
    S.cleanup.push(picker.destroy);
    function pick(it) { picker.clearSuggest(); picker.place(it.lat, it.lng, { fly: true, zoom: it.coords ? 17 : 15, source: 'search' }); if (!it.coords && !f.mname.value) f.mname.value = it.title; }
    attachSearch(f.q, document.getElementById('msug'), { onResults: (l) => picker.suggest(l, pick), onPick: pick });
  });
  const pend = Object.values(all).filter((m) => m.status === 'pending').length;
  return `${head('Mills', 'Mill owners register their own mills when they sign up. Approve them here or from Users. Approved mills are pinned on every map.')}${pend ? `<div class="banner">${ic('shield')}<div><b>${pend} mill${pend > 1 ? 's' : ''} awaiting approval</b><p>Check the pin, then press Approve.</p></div></div>` : ''}<div class="two"><form class="card form" data-form="mill"><h3>${em ? 'Edit mill' : 'Add a mill manually'}</h3><input type="hidden" name="id" value="${esc(eid || '')}">
  <label>Mill name<input name="mname" required value="${esc(em?.name)}" placeholder="e.g. Kamuli Sugar Works"></label><label>District / area<input name="area" required value="${esc(em?.area)}"></label>
  <label>Find the location<div class="sugwrap"><input name="q" autocomplete="off" placeholder="Search for the mill's town or address"><div id="msug" class="sug"></div></div></label>
  <div id="millmap" class="map"></div><p id="mpin" class="note">Search, paste a Google Maps link or coordinates, or tap the map. Use the Satellite view (top right of the map) to spot the mill.</p>
  <div class="btns"><button class="btn primary">${em ? 'Save changes' : 'Add mill'}</button>${em ? '<a class="btn ghost" href="#/mills">Cancel</a>' : ''}</div></form>
  <div class="list">${Object.entries(all).map(([id, m]) => `<div class="row"><span><b>${esc(m.name)}</b><small>${esc(m.area || '')} · ${m.lat.toFixed(3)}, ${m.lng.toFixed(3)}${m.ownerId ? ' · registered by owner' : ''}</small></span>${m.status === 'pending' ? '<span class="pill amber">Pending</span>' : m.active === false ? '<span class="pill grey">Hidden</span>' : '<span class="pill green">Active</span>'}<span class="btns">${m.status === 'pending' ? `<button class="btn small primary" data-act="millapprove" data-id="${id}">Approve</button>` : ''}<a class="btn small ghost" href="#/mills?edit=${id}">Edit</a><button class="btn small ghost" data-act="millactive" data-id="${id}">${m.active === false ? 'Show' : 'Hide'}</button></span></div>`).join('')}</div></div>`;
}

function disputes() {
  const mine = S.me.role === 'admin';
  return `${head(mine ? 'Disputes' : 'Support', mine ? 'Decide using the booking record and hear both sides.' : 'Tell us what went wrong. We reply within one working day.')}
  <form class="card form" data-form="dispute"><h3>Report an issue</h3><div class="two"><label>Booking number (optional)<select name="bid"><option value="">General issue</option>${S.bookings.map((b) => `<option value="${b.id}">#${short(b.id)} · ${esc(b.pickupLabel)}</option>`).join('')}</select></label><label>What happened?<input name="subject" required placeholder="e.g. Truck arrived 5 hours late"></label></div><button class="btn primary">Send report</button></form>
  ${mine ? `<h2 class="sec">Cases</h2><div class="list">${S.disputes.map((d) => `<div class="row"><span><b>${esc(d.subject)}</b><small>${esc(d.reporterName)} · ${d.bookingId ? '#' + short(d.bookingId) : 'general'}</small></span><span class="pill ${d.status === 'open' ? 'red' : 'green'}">${d.status}</span>${d.status === 'open' ? `<span class="btns"><button class="btn small ghost" data-act="resolve" data-id="${d.id}" data-bid="${d.bookingId || ''}" data-to="completed">Resolve: completed</button><button class="btn small ghost" data-act="resolve" data-id="${d.id}" data-bid="${d.bookingId || ''}" data-to="cancelled">Resolve: cancelled</button></span>` : ''}</div>`).join('') || empty('No cases')}</div>` : ''}`;
}

function revenue() {
  if (S.me.role !== 'admin') return empty('Admins only');
  const L = S.bookings.filter((b) => b.fee && b.feeStatus), ok = L.filter((b) => b.feeStatus === 'paid'), wait = L.filter((b) => b.feeStatus === 'pending'), paid = sum(ok, (b) => b.fee);
  const tag = { paid: ['Collected', 'green'], refunded: ['Refunded', 'grey'] };
  return `${head('Revenue & team share', 'Unlock fees from transporters. Confirm each mobile-money payment once it arrives in your account.')}${S.cfgExists ? '' : `<div class="banner"><div><b>Platform settings not created</b><p>Transporters cannot accept jobs until they exist.</p><button class="btn small primary" data-act="defaults">Create default settings</button></div></div>`}
  ${stats([['Fees collected', ugx(paid)], ['Awaiting confirmation', ugx(sum(wait, (b) => b.fee))], ['Jobs unlocked', ok.length], ['Avg. fee', ugx(ok.length ? paid / ok.length : S.cfg.feeUgx)]])}
  ${wait.length ? `<h2 class="sec">Payments to confirm</h2><div class="list">${wait.map((b) => `<div class="row"><span><b>#${short(b.id)}</b><small>${esc(b.transporterName)} · transaction ID <b>${esc(b.feeRef)}</b></small></span><span>${ugx(b.fee)}</span>${['cancelled', 'disputed'].includes(b.status) ? `<span class="pill red">Booking ${b.status}</span><button class="btn small ghost" data-act="refund" data-id="${b.id}">Mark refunded</button>` : `<button class="btn small primary" data-act="confirmpay" data-id="${b.id}">Confirm payment</button>`}</div>`).join('')}</div>` : ''}
  <div class="two"><div class="card"><h3>Team share of collected fees</h3>${S.cfg.team.map((t) => `<div class="kv"><span>${esc(t.name)} · ${t.share}%</span><b>${ugx((paid * t.share) / 100)}</b></div>`).join('')}<p class="note">Edit names and shares in the config/platform document. Set aside mobile-money charges, SMS and hosting costs, and tax before dividing income.</p></div>
  <form class="card form" data-form="settings"><h3>Pricing & payment</h3><label>Unlock fee per job (UGX)<input name="fee" type="number" min="0" value="${S.cfg.feeUgx}"></label><label>Guide rate (UGX per tonne-km)<input name="rate" type="number" min="0" value="${S.cfg.ratePerTonKm}"></label><label>Mobile money number that receives fees<input name="pay" value="${esc(S.cfg.payNumber)}" placeholder="0772 000 000 (registered name)"></label><label>Support phone<input name="support" value="${esc(S.cfg.supportPhone)}"></label><button class="btn primary">Save</button></form></div>
  <h2 class="sec">Fee ledger</h2><div class="list">${L.filter((b) => b.feeStatus !== 'pending').map((b) => `<div class="row"><span><b>#${short(b.id)}</b><small>${esc(b.transporterName)} · ${esc(b.millName)} · ref ${esc(b.feeRef || '')}</small></span><span>${ugx(b.fee)}</span><span class="pill ${tag[b.feeStatus]?.[1] || 'grey'}">${tag[b.feeStatus]?.[0] || b.feeStatus}</span>${b.feeStatus === 'paid' && ['cancelled', 'disputed'].includes(b.status) ? `<button class="btn small ghost" data-act="refund" data-id="${b.id}">Mark refunded</button>` : ''}</div>`).join('') || empty('No confirmed payments yet')}</div>`;
}

function help() {
  return `${head('Support & terms', 'Plain-language rules for everyone on CaneConnect.')}<div class="card prose">${S.cfg.supportPhone ? `<p>Call support: <b>${esc(S.cfg.supportPhone)}</b></p>` : ''}<h3>How it works</h3><p>A farmer posts a request. A verified transporter asks to take it, and the farmer approves or declines. A declined transporter is notified and can take another job. Transporters hold one job at a time. After approval, the transporter pays a flat ${ugx(S.cfg.feeUgx)} unlock fee, which opens the farmer's phone number, exact pickup pin and a private chat for price and directions. The farmer then confirms the price. Mills see confirmed deliveries (tonnes, date, truck and progress) but never the freight price, and they record the tonnes received at the gate. CaneConnect coordinates bookings. It is not the buyer of cane or the transport company, and it cannot guarantee mill acceptance or prices.</p><h3>Fees and freight money</h3><p>Only transporters pay, and only the unlock fee, which is shown before accepting. Freight is agreed in the chat and paid directly between farmer and transporter. CaneConnect does not hold freight money.</p><h3>Refunds</h3><p>If the farmer cancels or the job is disputed after you unlock it, report it here. Confirmed cases are refunded by mobile money.</p><h3>Mills</h3><p>Mill owners register their mill when they sign up. It is pinned on the map after our team approves it. Mills publish intake notices, see confirmed deliveries and record what they receive. They never see freight prices or phone numbers.</p><h3>Your data</h3><p>We collect only what is needed to arrange bookings. Phone numbers and exact pickup pins are shared only between the farmer and the transporter after the unlock fee is confirmed.</p></div>${disputes().replace(/^[\s\S]*?(<form)/, '$1')}`;
}

function alerts() {
  const N = S.notes, unread = N.filter((n) => !n.read).length;
  return `${head('Alerts', 'Updates about requests, approvals, payments and deliveries.', unread ? '<button class="btn ghost" data-act="readall">Mark all as read</button>' : '')}${N.length ? `<div class="list">${N.map((n) => `<a class="row alert ${n.read ? '' : 'new'}" href="${esc(n.link || '#/alerts')}" data-act="readalert" data-id="${n.id}"><span><b>${esc(n.title)}</b><small>${esc(n.body)}</small></span><small>${n.createdAt ? fdate(n.createdAt) : ''}</small></a>`).join('')}</div>` : empty('No alerts yet', 'You will be told here when something needs your attention.')}`;
}

function ddetail(r) {
  const x = S.deliveries.find((y) => y.id === r.id);
  if (!x) return empty('Delivery not found', 'It may not exist or you may not have access.');
  const mill = allMills()[x.millId], can = ['in-progress', 'completed'].includes(x.status);
  post.push(() => S.cleanup.push(routeMap(document.getElementById('rmap'), { pickup: x.pickup, mill, live: x.liveLoc })));
  return `<a class="back" href="#/bookings">← Back</a>${head(`${esc(x.pickupLabel)} → ${esc(x.millName)}`, `Delivery #${short(x.id)}`, pill(x.status))}
  <div class="two"><div><div id="rmap" class="map"></div><p class="note">The pickup area is approximate. The truck shows once the driver shares their location.</p></div><div class="stack"><div class="card"><div class="kv"><span>Cane expected</span><b>${x.tons} tonnes</b></div><div class="kv"><span>Pickup date</span><b>${fdate(x.date)}</b></div><div class="kv"><span>Farmer</span><b>${esc(x.farmerName)}</b></div><div class="kv"><span>Transporter</span><b>${esc(x.transporterName || '–')}</b></div>${x.liveLoc ? `<p class="note">Truck last seen ${new Date(x.liveLoc.at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}</div>
  ${can ? `<form class="card form" data-form="receipt"><h3>${x.receipt ? 'Update receipt' : 'Record receipt at the gate'}</h3><input type="hidden" name="id" value="${x.id}"><label>Tonnes received (weighbridge)<input name="tons" type="number" min="0" step="0.01" required value="${x.receipt?.tons ?? x.tons}"></label><label>Note (quality, deductions, delays)<input name="note" value="${esc(x.receipt?.note)}" placeholder="Optional"></label><button class="btn primary">${x.receipt ? 'Save changes' : 'Record receipt'}</button>${x.receipt ? `<small class="muted">Last recorded ${new Date(x.receipt.at).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} by ${esc(x.receipt.by)}.</small>` : ''}</form>` : `<div class="card lockcard">${ic('shield')}<span>You can record the receipt once the truck is on its way.</span></div>`}</div></div>`;
}

function detail(r) {
  const b = [...S.bookings, ...S.open].find((x) => x.id === r.id);
  if (!b) return empty('Booking not found', 'It may not exist or you may not have access.');
  const me = S.me, uid = S.user.uid, mill = allMills()[b.millId], isF = b.farmerId === uid, isT = b.transporterId === uid, isA = me.role === 'admin';
  const paid = b.feeStatus === 'paid', unpaid = !b.feeStatus, unlocked = paid && (isF || isT || isA);
  const canRequest = me.role === 'transporter' && me.verified && b.status === 'awaiting' && !isT && !S.lock;
  const btn = (a, t, c = 'primary') => `<button class="btn ${c}" data-act="${a}" data-id="${b.id}">${t}</button>`;
  const gmaps = (ll) => `https://www.google.com/maps/dir/?api=1&destination=${ll.lat},${ll.lng}`;
  const actions = [
    isF && b.status === 'requested' ? btn('approve', 'Approve transporter') + btn('decline', 'Decline', 'ghost') : '',
    isF && b.status === 'accepted' && unpaid ? btn('decline', 'Withdraw approval', 'ghost') : '',
    isF && b.status === 'accepted' && paid ? btn('agree', 'Confirm price') : '',
    isF && ['awaiting', 'requested', 'accepted', 'confirmed'].includes(b.status) ? btn('cancel', 'Cancel request', 'ghost') : '',
    canRequest ? btn('request', 'Request this job') : '',
    isT && b.status === 'accepted' && unpaid ? btn('unlock', `Pay ${ugx(S.cfg.feeUgx)} & unlock`) : '',
    isT && ['requested', 'accepted'].includes(b.status) && unpaid ? btn('withdraw', 'Withdraw', 'ghost') : '',
    isT && b.status === 'confirmed' ? btn('start', 'Start trip') : '',
    isT && b.status === 'in-progress' ? btn('track', S.watch != null && S.trackBid === b.id ? 'Stop sharing location' : 'Share live location', 'ghost') + btn('complete', 'Mark delivered') : '',
    isT && paid ? `<a id="navp" class="btn ghost" target="_blank" rel="noopener" style="display:none">${ic('pin')} Navigate to pickup</a>${mill ? `<a class="btn ghost" target="_blank" rel="noopener" href="${gmaps(mill)}">${ic('truck')} Navigate to mill</a>` : ''}` : ''
  ].join('');
  const msg = isF && b.status === 'requested' ? `${esc(b.transporterName)} wants to carry this cane. Approve or decline. Declining reopens the job and notifies them.`
    : isT && b.status === 'requested' ? 'Request sent. You hold this job until the farmer approves or declines, or until you withdraw.'
    : isF && b.status === 'accepted' && unpaid ? `You approved ${esc(b.transporterName)}. Waiting for them to pay the unlock fee, which opens contact details and chat. You can withdraw approval if it takes too long.`
    : isT && b.status === 'accepted' && unpaid ? `The farmer approved you. Pay the flat ${ugx(S.cfg.feeUgx)} fee to unlock their phone number, exact pickup pin and chat.`
    : (isF || isT) && b.status === 'accepted' && b.feeStatus === 'pending' ? 'Unlock payment submitted. We are confirming it, usually within minutes.'
    : isF && b.status === 'accepted' && paid ? 'The chat is open. Agree the price and pickup details with the transporter, then confirm.'
    : canRequest ? `Requesting is free. If the farmer approves you, a flat ${ugx(S.cfg.feeUgx)} fee unlocks their phone number, exact pickup pin and chat. You can hold one job at a time.`
    : me.role === 'transporter' && b.status === 'awaiting' && S.lock && !isT ? 'You are already holding a job. Complete it, or wait for the farmer to decline, before taking another.' : '';
  const chat = unlocked ? `<div class="card chat"><h3>Chat</h3><div id="msgs" class="msgs"><p class="note">No messages yet. Say hello and agree the price and pickup details.</p></div>${isA || b.status === 'cancelled' ? '' : `<form class="chatform" data-chat data-form="chat"><input type="hidden" name="id" value="${b.id}"><input name="text" autocomplete="off" maxlength="1000" placeholder="Type a message" required><button class="btn primary">Send</button></form>`}</div>`
    : (isF || isT) && b.status === 'accepted' && !paid ? `<div class="card lockcard">${ic('shield')}<span>Contact details and chat unlock once the transporter's fee is confirmed.</span></div>` : '';
  post.push(() => {
    const rm = routeMap(document.getElementById('rmap'), { pickup: b.pickup, mill, live: b.liveLoc }); S.cleanup.push(rm);
    if (b.hasDelivery && (isF || isT || isA)) S.cleanup.push(onSnapshot(doc(db, 'deliveries', b.id), (s) => { const rc = s.data()?.receipt, row = document.getElementById('rcrow'); if (row) { row.style.display = rc ? '' : 'none'; document.getElementById('rcv').textContent = rc ? `${rc.tons} t${rc.note ? ` · ${rc.note}` : ''}` : ''; } }, () => {}));
    if (!unlocked) return;
    const load = (n) => getDoc(doc(db, 'bookings', b.id, 'private', n)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
    Promise.all([load('contact'), load('tcontact')]).then(([c, t]) => {
      const ph = isF ? t?.phone : c?.phone, el = document.getElementById('contact');
      if (el) el.innerHTML = ph ? `<a href="tel:+${esc(ph)}">+${esc(ph)}</a>` : 'Not available';
      if (c?.exact) { rm.setPickup(c.exact); const np = document.getElementById('navp'); if (np) { np.href = gmaps(c.exact); np.style.display = ''; } }
    });
    const box = document.getElementById('msgs');
    S.cleanup.push(onSnapshot(query(collection(db, 'bookings', b.id, 'messages'), orderBy('at')), (s) => {
      if (!box || !s.size) return;
      box.innerHTML = s.docs.map((d) => { const m = d.data(); return `<div class="msg ${m.senderId === uid ? 'me' : ''}"><small>${esc(m.senderName)} · ${m.at?.toDate ? m.at.toDate().toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' }) : 'sending…'}</small><p>${esc(m.text)}</p></div>`; }).join('');
      box.scrollTop = box.scrollHeight;
    }, () => {}));
  });
  const tl = (b.timeline || []).map((t) => `<li><i></i><div><b>${STATUS[t.s]?.[0] || t.s}</b><small>${new Date(t.at).toLocaleString('en-UG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(t.by)}</small></div></li>`).join('');
  return `<a class="back" href="#/bookings">← Back</a>${head(`${esc(b.pickupLabel)} → ${esc(b.millName)}`, `Booking #${short(b.id)}`, pill(b.status))}${msg ? `<div class="banner">${ic('shield')}<div><p>${msg}</p></div></div>` : ''}
  <div class="two"><div><div id="rmap" class="map"></div>${isT && !paid ? '<p class="note">Showing the approximate pickup area (within about 1 km). The exact pin unlocks after payment.</p>' : ''}</div><div class="stack"><div class="card"><div class="kv"><span>Load</span><b>${b.tons} tonnes</b></div><div class="kv"><span>Pickup date</span><b>${fdate(b.date)}</b></div><div class="kv"><span>${['confirmed', 'in-progress', 'completed'].includes(b.status) ? 'Agreed price' : 'Offered price'}</span><b>${ugx(b.price)}</b></div><div class="kv"><span>Distance (approx.)</span><b>${b.distanceKm} km</b></div><div class="kv"><span>Farmer</span><b>${esc(b.farmerName)}</b></div><div class="kv"><span>Transporter</span><b>${esc(b.transporterName || 'Not assigned')}</b></div><div class="kv"><span>Contact</span><b id="contact">${unlocked ? 'Loading…' : 'Unlocks after the fee is paid'}</b></div><div class="kv" id="rcrow" style="display:none"><span>Received at mill</span><b id="rcv"></b></div>${b.notes ? `<p class="note">${esc(b.notes)}</p>` : ''}${b.liveLoc ? `<p class="note">Truck location last shared ${new Date(b.liveLoc.at).toLocaleTimeString('en-UG', { hour: '2-digit', minute: '2-digit' })}.</p>` : ''}</div>${actions ? `<div class="btns">${actions}</div>` : ''}${chat}<div class="card"><h3>Progress</h3><ul class="tl">${tl}</ul></div></div></div>`;
}
