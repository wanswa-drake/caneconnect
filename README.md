# CaneConnect Uganda

Marketplace connecting sugarcane **farmers**, **transporters** and **mills** in Busoga. Vite + Firebase (Auth, Firestore, Hosting) + Leaflet/OpenStreetMap maps.

## 1. Firebase setup (about 10 minutes)
1. Create a project at console.firebase.google.com, add a **Web app**, copy the config values into `.env` (see `.env.example`).
2. **Authentication** → Sign-in method → enable **Email/Password**. (Phone numbers are converted to a private email-style ID, so users sign in with just their phone number and avoid SMS costs.)
3. **Firestore Database** → create in production mode, then deploy rules: `npm i -g firebase-tools && firebase login && firebase init` (choose existing files) then `firebase deploy --only firestore:rules`.
4. Run `npm install` then `npm run dev`.

## 2. Make yourself the admin
Sign up in the app, then in Firestore open `users/<your uid>` and change `role` to `admin`. Refresh. Open **Revenue** and press *Create default settings*. Admins verify transporters and mills (and link each mill user to their mill) under **Users**.

## 3. How the team earns
- Transporters pay a flat **platform fee per completed job** (default UGX 5,000, as in the proposal). It is locked at acceptance, shown before they accept, and enforced by Firestore rules.
- Admin **Revenue** page shows fees collected, outstanding fees, a fee ledger and each member's share (edit `config/platform.team`).
- Collection is manual for the pilot: transporters send mobile money to the number you set, and admin presses *Mark collected*. When volume grows, connect Flutterwave, Pesapal or MTN MoMo/Airtel APIs with a Cloud Function that flips `feeStatus` to `paid` automatically.
- Next revenue lines from the proposal: transporter subscription and mill logistics reporting.

## Roles, one job at a time and alerts
- **Mills** do not see transport prices, fees or phone numbers. They read a price-free `deliveries` copy that is created when the farmer confirms. They publish intake notices, follow confirmed deliveries on a map, and record the tonnes received at the gate (the farmer and transporter see the receipt).
- **Request, approve, then pay.** A transporter requests an open job for free. The farmer approves or declines. A declined transporter gets an alert and is free to take another job. Only after approval does the transporter pay the unlock fee.
- **One job at a time** is enforced in Firestore rules through a `locks/{transporterUid}` document. It is created on request and removed when the job completes, is declined, withdrawn or cancelled. An admin can delete a stuck lock in the console.
- **Alerts** appear in-app (bell badge and toast). Push, SMS or WhatsApp alerts need Cloud Functions and a messaging provider.

## Mill registration, unlock fee and chat
- **Mills register themselves.** A user who signs up as Mill enters the mill name and pins its location. The mill stays hidden until an admin approves the owner under **Users** (or the mill under **Mills**), then it is pinned on every map.
- **Transporters pay the flat unlock fee** (default UGX 5,000) to see the farmer's phone number and exact pickup pin and to open a private chat. Before paying they see only an approximate area (about 1 km).
- **Flow:** transporter taps *Accept & unlock*, sends the fee by MTN MoMo or Airtel Money to the number set under Revenue, and enters the transaction ID. The job is held for them. Admin checks the payment and presses *Confirm payment*. Chat and contact open. Farmer agrees the price in chat and confirms. Farmers can release a transporter whose payment is still unconfirmed.
- **Freight money** is paid directly by the farmer to the transporter. CaneConnect does not hold it, so no payment-service licence is needed for the pilot.
- Confirmation is manual for now. To make it instant, add a Cloud Function that receives a Flutterwave, Pesapal or MTN MoMo webhook and sets `feeStatus` to `paid`. Nothing else in the app changes.
- Redeploy the rules in `firestore.rules` after updating.

## When a place is not found
Search uses OpenStreetMap data, which misses many Ugandan businesses (Google's business data is richer but costs money). Three fallbacks are built in: paste coordinates or a long Google Maps link into the search box, switch the map to **Satellite** (top right) and tap the exact spot, or drag the pin. In Google Maps, right-click a spot (or long-press on a phone) and copy the coordinates. Short `maps.app.goo.gl` links cannot be read, so open the link first and copy the long address from the browser bar.

## Mills, maps and location search
- Admin → **Mills**: search for a town or address, drop or drag the pin, and save. The mill appears on every map and in the farmer's "Deliver to" list. Hide a mill to stop new requests to it.
- Farmers can type a place, tap the map, drag the pin or press **Use my current location** (needs HTTPS, which Firebase Hosting provides).
- Place search uses the free Photon geocoder (OpenStreetMap data). Small villages may be missing, so tapping the map always works. Move to a paid geocoder when traffic grows.
- Drivers can share live location while a trip is in transit and open Google Maps directions to the pickup and the mill.
- After updating, redeploy rules: `firebase deploy --only firestore:rules` (a new `mills` collection rule was added).

## 4. Deploy
`npm run build && firebase deploy --only hosting`

## Before real money and real users
- Check mill coordinates in `src/data.js` (approximate).
- Replace free OSM tiles with a paid tile provider if traffic grows.
- Register the business (URSB/URA) and publish a privacy notice (Data Protection and Privacy Act, 2019).
- Fee collection, SMS/USSD alerts and automatic status notifications need Cloud Functions (Blaze plan).
