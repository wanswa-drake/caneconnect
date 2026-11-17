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

## 4. Deploy
`npm run build && firebase deploy --only hosting`

## Before real money and real users
- Check mill coordinates in `src/data.js` (approximate).
- Replace free OSM tiles with a paid tile provider if traffic grows.
- Register the business (URSB/URA) and publish a privacy notice (Data Protection and Privacy Act, 2019).
- Fee collection, SMS/USSD alerts and automatic status notifications need Cloud Functions (Blaze plan).
