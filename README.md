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
2. Enable **Authentication → Email/Password** and **Google**. For Google to work on a hosted URL, add that domain under Authentication → Settings → Authorized domains (`localhost` is allowed by default; Google sign-in does not work from a `file://` path).
3. Create a **Firestore Database**, then publish these rules (set the owner email to your own):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       function owner()  { return request.auth != null && request.auth.token.email.lower() == 'tayyabnaem26102001@gmail.com'; }
       function mem()    { return get(/databases/$(database)/documents/app/members).data; }
       function hasMembers() { return exists(/databases/$(database)/documents/app/members); }
       function isAdmin()  { return owner() || (request.auth != null && hasMembers() && request.auth.token.email.lower() in mem().admins); }
       function isViewer() { return request.auth != null && hasMembers() && request.auth.token.email.lower() in mem().viewers; }

       match /app/data    { allow read: if isAdmin() || isViewer(); allow write: if isAdmin(); }
       match /app/members { allow read: if request.auth != null; allow write: if owner(); }
       // new sign-ups register an access request here; only the owner can read/approve
       match /requests/{uid} {
         allow create: if request.auth != null && request.auth.uid == uid;
         allow read, delete: if owner();
       }
       // legacy per-user docs, kept only for one-time migration of old data
       match /dashboards/{uid} { allow read, write: if request.auth != null && request.auth.uid == uid; }
     }
   }
   ```

### Roles & accounts
- **Owner** (hard-coded email in `index.html` `OWNER_EMAIL` and in the rules): full control, manages users, edits the company profile (name + logo). Can never be locked out.
- **Admin**: can manage all payments (add/edit/delete) and download the profit-share report.
- **Viewer**: read-only.

There is **no public sign-up**. The owner creates each login (name, email, password, role) from the avatar menu → **Manage users → Create login**. Sign-in only works for the owner and emails the owner has added — any other authenticated email is signed out with a "not authorised" message. Users can change their own name/password from the profile menu, and reset a forgotten password via **Forgot password?** (or the owner can send them a reset link). Everyone shares one dataset stored at `app/data`; the company name and logo are stored there too.

4. Paste your `firebaseConfig` into the `firebaseConfig` object near the bottom of `index.html` (see the `SETUP` comment).

## Run

Just open `index.html` in a browser — it's a single self-contained file. No build step.

> The Firebase web API key in `index.html` is a public client identifier, not a secret; Firestore security rules are what protect the data.
