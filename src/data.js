// Mill coordinates are approximate. Verify them on the ground before launch and edit here.
export const MILLS = {
  kakira: { name: 'Kakira Sugar Limited', area: 'Jinja', lat: 0.5136, lng: 33.2589 },
  mayuge: { name: 'Mayuge Sugar Industries', area: 'Mayuge', lat: 0.459, lng: 33.475 },
  scoul: { name: 'Sugar Corporation of Uganda, Lugazi', area: 'Buikwe', lat: 0.3714, lng: 32.9217 }
};
export const DISTRICTS = ['Jinja', 'Luuka', 'Kamuli', 'Mayuge', 'Iganga', 'Buikwe', 'Other'];
export const STATUS = {
  awaiting: ['Awaiting transporter', 'amber'], accepted: ['Transporter accepted', 'blue'], confirmed: ['Confirmed', 'teal'],
  'in-progress': ['In transit', 'indigo'], completed: ['Completed', 'green'], cancelled: ['Cancelled', 'grey'], disputed: ['Disputed', 'red']
};
// Defaults used until an admin saves platform settings (config/platform in Firestore).
export const DEF_CFG = {
  feeUgx: 5000, ratePerTonKm: 700, payNumber: '', supportPhone: '',
  team: [
    { name: 'Weredwong Joseph Precious', share: 20 }, { name: 'Atwijukire Anna Prudence', share: 20 },
    { name: 'Wanswa Drake', share: 20 }, { name: 'Muligo Trevor', share: 20 }, { name: 'Mwanje Shafic', share: 20 }
  ]
};
export const ugx = (n) => `UGX ${Math.round(Number(n) || 0).toLocaleString('en-UG')}`;
export const fdate = (v) => {
  const d = v?.toDate ? v.toDate() : v ? new Date(v.length === 10 ? `${v}T00:00:00` : v) : new Date();
  return d.toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' });
};
export const millis = (v) => v?.toMillis?.() ?? Date.now();
export function km(a, b) {
  const r = (x) => (x * Math.PI) / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)) * 1.3; // x1.3 approximates road distance
}
export const phoneDigits = (p) => { const d = String(p).replace(/\D/g, ''); return d.startsWith('256') ? d : `256${d.replace(/^0/, '')}`; };
// Farmers and drivers can sign in with a phone number; Firebase stores it as a private email-style ID.
export const toEmail = (id) => (id.includes('@') ? id.trim().toLowerCase() : `${phoneDigits(id)}@users.caneconnect.app`);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
