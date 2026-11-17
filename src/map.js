import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const dot = (color) => L.divIcon({ className: '', html: `<i class="pin" style="background:${color}"></i>`, iconSize: [20, 20], iconAnchor: [10, 10] });
const GREEN = '#1f9d6b', GOLD = '#e9a820', BLUE = '#2563eb';

function base(el, center = [0.48, 33.2], zoom = 9) {
  const map = L.map(el, { scrollWheelZoom: false }).setView(center, zoom);
  // Free OpenStreetMap tiles are fine for a pilot. Switch to a paid tile provider before heavy traffic.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

export function pickerMap(el, { onPick, mill }) {
  const map = base(el);
  let pin;
  const place = (ll, fly) => { pin ? pin.setLatLng(ll) : (pin = L.marker(ll, { icon: dot(GREEN) }).addTo(map)); if (fly) map.setView(ll, 13); onPick({ lat: ll.lat, lng: ll.lng }); };
  map.on('click', (e) => place(e.latlng));
  let millPin;
  return {
    map, place: (lat, lng) => place(L.latLng(lat, lng), true),
    setMill(m) { millPin?.remove(); if (m) millPin = L.marker([m.lat, m.lng], { icon: dot(GOLD) }).bindTooltip(m.name).addTo(map); },
    destroy: () => map.remove()
  };
}

export function routeMap(el, { pickup, mill, live }) {
  const map = base(el);
  const pts = [];
  if (pickup) { L.marker([pickup.lat, pickup.lng], { icon: dot(GREEN) }).bindTooltip('Pickup').addTo(map); pts.push([pickup.lat, pickup.lng]); }
  if (mill) { L.marker([mill.lat, mill.lng], { icon: dot(GOLD) }).bindTooltip(mill.name).addTo(map); pts.push([mill.lat, mill.lng]); }
  if (pickup && mill) L.polyline(pts, { color: '#12684a', weight: 3, dashArray: '6 8' }).addTo(map);
  if (live) { L.marker([live.lat, live.lng], { icon: dot(BLUE) }).bindTooltip('Truck (last shared location)').addTo(map); pts.push([live.lat, live.lng]); }
  if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] }); else if (pts.length) map.setView(pts[0], 12);
  return () => map.remove();
}

export function millsMap(el, mills, onSelect) {
  const map = base(el, [0.45, 33.1], 9);
  Object.entries(mills).forEach(([id, m]) => L.marker([m.lat, m.lng], { icon: dot(GOLD) }).bindTooltip(m.name).on('click', () => onSelect?.(id)).addTo(map));
  return () => map.remove();
}
