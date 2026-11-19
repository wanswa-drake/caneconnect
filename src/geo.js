import { esc } from './data.js';
// Photon is a free, OpenStreetMap-based geocoder built for search-as-you-type.
// It is fine for a pilot. Move to a paid geocoder (Geoapify, LocationIQ, Google Places) when traffic grows.
const BASE = 'https://photon.komoot.io';
const BBOX = '29.5,-1.5,35.1,4.3'; // Uganda
const part = (p) => {
  const title = p.name || p.street || p.city || p.county || 'Unnamed place';
  const sub = [...new Set([p.district, p.city, p.county, p.state].filter((x) => x && x !== title))].slice(0, 2).join(', ');
  return { title, sub };
};
export async function searchPlaces(q, signal) {
  const r = await fetch(`${BASE}/api/?q=${encodeURIComponent(q)}&limit=6&lang=en&lat=0.5&lon=33.2&bbox=${BBOX}`, { signal });
  if (!r.ok) throw new Error('search failed');
  const j = await r.json();
  return (j.features || []).map((f) => ({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], ...part(f.properties || {}) }));
}
export async function reverse(lat, lng) {
  try {
    const r = await fetch(`${BASE}/reverse?lat=${lat}&lon=${lng}&lang=en`);
    const f = (await r.json()).features?.[0];
    if (!f) return '';
    const { title, sub } = part(f.properties || {});
    return sub ? `${title}, ${sub}` : title;
  } catch { return ''; }
}
// Paste coordinates ("0.5136, 33.2589") or a Google Maps link and get a pin without any search.
export function parseCoords(text) {
  let s = String(text || '');
  try { s = decodeURIComponent(s); } catch { /* keep raw text */ }
  const res = [/@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/, /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/, /[?&](?:q|ll|query|destination|center)=(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)/, /^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/];
  for (const re of res) {
    const m = s.match(re);
    if (m) { const lat = Number(m[1]), lng = Number(m[2]); if (lat > -1.6 && lat < 4.4 && lng > 29.4 && lng < 35.2) return { lat, lng }; }
  }
  return null;
}

// Wires a text input to a suggestions dropdown. Results are also sent to the map so matches show as pins.
export function attachSearch(input, box, { onResults, onPick }) {
  let timer, ctl, items = [];
  const close = () => { box.innerHTML = ''; box.classList.remove('open'); };
  const draw = (html) => { box.innerHTML = html; box.classList.add('open'); };
  const coordPick = (c) => { ctl?.abort(); clearTimeout(timer); close(); onPick({ ...c, title: '', sub: '', coords: true }); };
  const run = async (q) => {
    ctl?.abort(); ctl = new AbortController();
    draw('<div class="sug-note">Searching…</div>');
    let note = '';
    try {
      items = await searchPlaces(q, ctl.signal);
      const first = q.split(/\s+/)[0];
      if (!items.length && q.includes(' ') && first.length >= 3) {
        items = await searchPlaces(first, ctl.signal);
        if (items.length) note = `<div class="sug-note">No exact match for “${esc(q)}”. Showing “${esc(first)}”. Pick one, then zoom in (try Satellite) and drag the pin to the exact spot.</div>`;
      }
    } catch (e) { if (e.name !== 'AbortError') draw('<div class="sug-note">Search is unavailable right now. Tap the map to drop your pin instead.</div>'); return; }
    onResults?.(items);
    draw(items.length ? note + items.map((it, i) => `<button type="button" data-i="${i}"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></button>`).join('') : '<div class="sug-note">Not found in our map data. Paste coordinates or a Google Maps link here, or switch the map to Satellite and tap the exact spot.</div>');
  };
  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    if (e.isTrusted) input.dataset.auto = '';
    const q = input.value.trim();
    if (q.length < 3) { ctl?.abort(); close(); return; }
    timer = setTimeout(() => run(q), 450);
  });
  input.addEventListener('paste', (e) => { const c = parseCoords(e.clipboardData?.getData('text')); if (c) { e.preventDefault(); coordPick(c); } });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') { const c = parseCoords(input.value); if (c) { e.preventDefault(); coordPick(c); } }
  });
  box.addEventListener('pointerdown', (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; e.preventDefault(); const it = items[b.dataset.i]; close(); onPick(it); });
  input.addEventListener('blur', () => setTimeout(close, 200));
}
