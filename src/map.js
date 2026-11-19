import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const C = { green: '#1f9d6b', gold: '#e9a820', blue: '#2563eb', violet: '#7c3aed', red: '#e4572e', grey: '#64748b' };
const JOB = { awaiting: C.red, requested: C.violet, accepted: C.blue, confirmed: C.blue, 'in-progress': C.violet, completed: C.green };
const dot = (c, s = 20) => L.divIcon({ className: '', html: `<i class="pin" style="background:${c};width:${s}px;height:${s}px"></i>`, iconSize: [s, s], iconAnchor: [s / 2, s / 2] });
const you = L.divIcon({ className: '', html: '<i class="you"></i>', iconSize: [16, 16], iconAnchor: [8, 8] });

function base(el, center = [0.48, 33.2], zoom = 9) {
  const map = L.map(el, { scrollWheelZoom: false }).setView(center, zoom);
  // Free OpenStreetMap tiles are fine for a pilot. Switch to a paid tile provider before heavy traffic.
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  // Satellite view helps people spot a mill or farm that is not in the search data. Use a keyed provider before heavy traffic.
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery © Esri' });
  L.control.layers({ Map: street, Satellite: sat }, null, { position: 'topright' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

// Pin picker: tap the map, drag the pin, search results or GPS all call place().
export function pickerMap(el, { onPick, mills = {}, start }) {
  const map = base(el, start ? [start.lat, start.lng] : undefined, start ? 14 : 9);
  Object.values(mills).forEach((m) => L.marker([m.lat, m.lng], { icon: dot(C.gold, 18) }).bindTooltip(m.name).addTo(map));
  let pin, ring, line, target, hits = [];
  const redraw = () => { line?.remove(); line = pin && target ? L.polyline([pin.getLatLng(), [target.lat, target.lng]], { color: '#12684a', weight: 3, dashArray: '6 8' }).addTo(map) : null; };
  const place = (lat, lng, o = {}) => {
    const ll = L.latLng(lat, lng);
    if (pin) pin.setLatLng(ll);
    else {
      pin = L.marker(ll, { icon: dot(C.green, 26), draggable: true, zIndexOffset: 1000 }).addTo(map);
      pin.on('drag', redraw);
      pin.on('dragend', () => { const p = pin.getLatLng(); onPick({ lat: p.lat, lng: p.lng }, 'drag'); });
    }
    ring?.remove(); ring = o.accuracy ? L.circle(ll, { radius: o.accuracy, color: C.green, weight: 1, fillOpacity: 0.12 }).addTo(map) : null;
    if (o.fly) map.flyTo(ll, o.zoom || 15, { duration: 0.8 });
    redraw();
    onPick({ lat, lng }, o.source || 'tap');
  };
  map.on('click', (e) => place(e.latlng.lat, e.latlng.lng));
  if (start) place(start.lat, start.lng, { source: 'init' });
  return {
    map, place,
    setMill(m) { target = m; redraw(); },
    suggest(list, onSelect) {
      hits.forEach((h) => h.remove());
      hits = list.map((it) => L.marker([it.lat, it.lng], { icon: dot(C.grey, 14) }).bindTooltip(it.title).on('click', () => onSelect(it)).addTo(map));
      if (list.length) map.fitBounds(list.map((i) => [i.lat, i.lng]), { padding: [40, 40], maxZoom: 13 });
    },
    clearSuggest() { hits.forEach((h) => h.remove()); hits = []; },
    destroy: () => map.remove()
  };
}

export function routeMap(el, { pickup, mill, live }) {
  const map = base(el), pts = [];
  let pm, line;
  const draw = () => { line?.remove(); line = pm && mill ? L.polyline([pm.getLatLng(), [mill.lat, mill.lng]], { color: '#12684a', weight: 3, dashArray: '6 8' }).addTo(map) : null; };
  const setPickup = (p) => { pm?.remove(); pm = L.marker([p.lat, p.lng], { icon: dot(C.green, 22) }).bindTooltip('Pickup').addTo(map); draw(); };
  if (pickup) { setPickup(pickup); pts.push([pickup.lat, pickup.lng]); }
  if (mill) { L.marker([mill.lat, mill.lng], { icon: dot(C.gold, 22) }).bindTooltip(mill.name).addTo(map); pts.push([mill.lat, mill.lng]); }
  if (live) { L.marker([live.lat, live.lng], { icon: dot(C.blue, 24), zIndexOffset: 900 }).bindTooltip('Truck (last shared location)').addTo(map); pts.push([live.lat, live.lng]); }
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] }); else if (pts.length) map.setView(pts[0], 12);
  const cleanup = () => map.remove();
  cleanup.setPickup = (p) => { setPickup(p); map.fitBounds([[p.lat, p.lng], ...(mill ? [[mill.lat, mill.lng]] : [])], { padding: [40, 40], maxZoom: 14 }); };
  return cleanup;
}

// Overview: mills (gold) plus job pickups coloured by status. Popups link straight to the right page.
export function overviewMap(el, { mills = {}, jobs = [], me, millPopup, jobPopup }) {
  const map = base(el, [0.45, 33.1], 9), pts = [];
  Object.entries(mills).forEach(([id, m]) => { L.marker([m.lat, m.lng], { icon: dot(C.gold, 22) }).bindTooltip(m.name).bindPopup(millPopup ? millPopup(id, m) : m.name).addTo(map); pts.push([m.lat, m.lng]); });
  jobs.forEach((j) => { if (!j.pickup) return; L.marker([j.pickup.lat, j.pickup.lng], { icon: dot(JOB[j.status] || C.grey, 18) }).bindTooltip(j.pickupLabel).bindPopup(jobPopup(j)).addTo(map); pts.push([j.pickup.lat, j.pickup.lng]); });
  if (me) { L.marker([me.lat, me.lng], { icon: you, zIndexOffset: 800 }).bindTooltip('You are here').addTo(map); pts.push([me.lat, me.lng]); }
  if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 12 }); else if (pts.length) map.setView(pts[0], 11);
  return () => map.remove();
}
