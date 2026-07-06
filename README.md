# TECH CLUB — Revenue & Profit Dashboard

A single-file, dark-theme dashboard for managing a training institute's batches, student fees, and profit distribution. Built with vanilla JS, Tailwind (CDN), and Firebase (Auth + Firestore cloud sync).

## Features

- **Login** — Email/Password and Google sign-in via Firebase Auth.
- **Cloud sync** — All data saved to Firestore, synced across every device you log in from.
- **Students** — per-batch records: name, contact, bundle type (single / double / triple), course selection, fee paid, fee pending, refunded, with payment-progress bars.
- **Installments** — every student across all batches with an outstanding balance, plus a one-click "Record payment" that moves money from pending to paid.
- **Bundles & Courses** — per-batch breakdown auto-calculated from student records (single / double bundle / triple bundle).
- **Summary** — all-batch overview chart, grand totals, batch summary table, and total received per training program.
- **Profit Share** — configurable profit distribution: Owner 40%, Future fund 36%, team pool 24% (service lead earns 12%).

## Setup

1. Create a free [Firebase](https://console.firebase.google.com) project.
2. Enable **Authentication → Email/Password** (and Google).
3. Create a **Firestore Database**, then publish these rules:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /dashboards/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

4. Paste your `firebaseConfig` into the `firebaseConfig` object near the bottom of `index.html` (see the `SETUP` comment).

## Run

Just open `index.html` in a browser — it's a single self-contained file. No build step.

> The Firebase web API key in `index.html` is a public client identifier, not a secret; Firestore security rules are what protect the data.
