# Malarikkal Water Lily Boat Tours — Setup & Deployment Guide

Three files, zero server cost:
- `Code.gs` → Google Apps Script backend
- `index.html` → the whole website (React + Tailwind, no build step)
- This guide

---

## 1. Create the Telegram Bot

1. Open Telegram, search for **@BotFather**, tap **Start**.
2. Send `/newbot`. Give it a name (e.g. `Malarikkal Boat Alerts`) and a username ending in `bot` (e.g. `malarikkal_boat_bot`).
3. BotFather replies with a **token** like `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxx`. Copy it — this is your `TELEGRAM_BOT_TOKEN`.
4. Open a chat with your new bot and send it any message (e.g. "hi"). This step is required — Telegram only lets a bot message users who have messaged it first.
5. Get your **Chat ID**:
   - Search for **@userinfobot** on Telegram, tap Start — it instantly replies with your numeric Chat ID. *(Easiest method.)*
   - Or visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser after step 4, and look for `"chat":{"id":...}` in the response.
6. Save this Chat ID — it's your `TELEGRAM_CHAT_ID`.

---

## 2. Create the Google Sheet + paste the backend

1. Go to [sheets.google.com](https://sheets.google.com) → create a **Blank spreadsheet**. Name it e.g. `Malarikkal Bookings`.
2. Menu: **Extensions → Apps Script**. A new tab opens with a default `Code.gs` file.
3. Delete the placeholder code and paste in the entire contents of the `Code.gs` file provided.
4. Near the top, fill in your real values:
   ```js
   const TELEGRAM_BOT_TOKEN = 'PASTE_YOUR_BOT_TOKEN_HERE';
   const TELEGRAM_CHAT_ID   = 'PASTE_YOUR_CHAT_ID_HERE';
   ```
5. **Save** (Ctrl+S / Cmd+S). Name the project e.g. `Malarikkal Backend`.
6. Optional but recommended: select the function dropdown at the top → choose `testTelegram` → click **Run**. The first run asks you to authorize the script (choose your Google account → "Advanced" → "Go to Malarikkal Backend (unsafe)" → Allow — this warning is normal for your own scripts). If Telegram sends you a test message, everything is wired correctly.

---

## 3. Deploy as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → choose **Web app**.
3. Fill in:
   - **Description**: `Booking API v1`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Click **Deploy**, authorize again if asked.
5. Copy the **Web app URL** shown — it looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`
   This is your `APPS_SCRIPT_URL`.

> **Re-deploying later:** if you ever edit `Code.gs` again, changes won't go live until you do **Deploy → Manage deployments → ✏️ Edit → New version → Deploy**. Editing the code alone is not enough.

---

## 4. Link the Web App URL into the frontend

1. Open `index.html` (via GitHub's mobile editor, as usual).
2. Near the top of the `<script type="text/babel">` block, find the config section:
   ```js
   const APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";
   const OWNER_PHONE = "+919999999999";
   const WHATSAPP_NUMBER = "919999999999";
   ```
3. Replace:
   - `APPS_SCRIPT_URL` → the `/exec` URL from Step 3.5
   - `OWNER_PHONE` → the boatman's number in `+91XXXXXXXXXX` format
   - `WHATSAPP_NUMBER` → the same number, digits only, no `+` (e.g. `919876543210`)
4. Commit the change directly on GitHub's mobile editor.

### Important CORS note
Google Apps Script automatically allows cross-origin requests for web apps deployed with "Anyone" access — but only if the request doesn't trigger a CORS *preflight*. That's why the fetch call in `index.html` sends `Content-Type: text/plain` instead of `application/json`. **Don't change that header** — Apps Script still parses the JSON body correctly either way, but `application/json` as a request header would cause the browser to block the response.

### Important CDN version-pinning note
`index.html` loads React, Babel, and jsPDF from CDN URLs that are pinned to specific versions (e.g. `@babel/standalone@7`, `react@18`, `jspdf/2.5.1`). **Never remove the version number from a CDN `<script src>` on this site.** An unpinned URL resolves to whatever the library's latest release is at that moment — if the library ships a breaking major version later, the site can go completely blank with no visible error (this happened once already: an unpinned Babel URL silently jumped to Babel 8, which changed how JSX compiles, and crashed the page before React ever rendered). If you ever add a new CDN library, always include an explicit version in the URL.

---

## 5. Publish on GitHub Pages

1. Create (or reuse) a GitHub repo, add `index.html` to the root (or a `/docs` folder).
2. Repo **Settings → Pages** → set source to the branch/folder containing `index.html`.
3. Your site goes live at `https://<username>.github.io/<repo>/`.
4. Every booking will now: save a row in your Google Sheet **and** send you a Telegram alert with a tap-to-call link, within a second or two.

---

## 6. Adding your real photos

1. In your GitHub repo, create a folder named `images` (GitHub mobile: **Add file → Create new file**, type `images/hero.jpg` as the filename to auto-create the folder — then delete that placeholder and use **Add file → Upload files** to add the real ones).
2. Upload your photos using these exact filenames so the code picks them up automatically:

   | Filename | Use it for |
   |---|---|
   | `images/hero.jpg` | Hero background (top of the page) |
   | `images/gallery-1.jpg` | Gallery photo 1 (featured, larger tile) |
   | `images/gallery-2.jpg` | Gallery photo 2 |
   | `images/gallery-3.jpg` | Gallery photo 3 |
   | `images/gallery-4.jpg` | Gallery photo 4 |
   | `images/gallery-5.jpg` | Gallery photo 5 |
   | `images/gallery-6.jpg` | Gallery photo 6 |
   | `images/gallery-7.jpg` | Gallery photo 7 |
   | `images/host-subash.jpg` | "Our Hosts" section — Subash's photo |
   | `images/host-akash.jpg` | "Our Hosts" section — Akash's photo |
   | `images/developer.jpg` | "About the Developer" modal — your photo |
   | `images/cover.jpg` | Link preview image (WhatsApp, etc.) — ideally 1200×630px |

3. That's it — no code changes needed. If a file is missing or still uploading, that tile automatically shows a gradient placeholder instead of breaking.

**Link preview note:** WhatsApp, Instagram, etc. cache a site's preview card (title/description/image) the first time a link is shared, and don't re-check it often. If you update `images/cover.jpg` later and the old blank preview still shows, that's caching — not a bug. To force a refresh, use Facebook's Sharing Debugger (developers.facebook.com/tools/debug) on your site URL and click "Scrape Again"; WhatsApp shares the same cache in most cases.

## 7. How the Reviews section works now

- The **Reviews** section on the site loads real reviews live from a new `Reviews` tab in your Google Sheet (created automatically the first time someone submits one).
- If there are no reviews yet, the site shows *"No reviews found yet — be the first to share your experience!"* with an **Add Your Review** button.
- Tapping that button opens a form (name, place, star rating, review text) that POSTs to the same Apps Script URL, saves a row in the `Reviews` sheet, and sends you a Telegram alert — same pattern as bookings.
- To remove a review from the site without deleting it, open the `Reviews` sheet and change that row's **Status** column from `Published` to `Hidden`.
- No extra setup needed — this uses the same `APPS_SCRIPT_URL` already in `index.html`. Just re-deploy the Apps Script (Step 3, "Manage deployments → New version") after pasting in the updated `Code.gs`.

## 8. Bug reporting — sent to you (the developer), not the boat owners

The site now catches errors automatically and lets visitors report problems:

- **Automatic:** if a JavaScript error happens anywhere on the page (even if the whole app crashes), a popup appears offering to report it — this works independently of React, so it fires even in a worst-case white-screen scenario.
- **Manual:** a small "🐞 Report a Bug" link sits at the very bottom of the footer, always visible, opening a simple form.

Both send to `Code.gs`, which saves the report in a new **BugReports** sheet tab and sends a Telegram alert — but to **your own chat**, not the Akash/Subhash booking group, since they can't fix code issues.

**Setup:**
1. Message your existing Telegram bot **privately from your own Telegram account** (same bot as `TELEGRAM_BOT_TOKEN`, just a different chat — your 1-on-1 chat with it, not the group).
2. Get your personal chat ID the same way as before (`https://api.telegram.org/bot<TOKEN>/getUpdates`, or @userinfobot for your own numeric ID).
3. In `Code.gs`, set:
   ```js
   const DEVELOPER_TELEGRAM_CHAT_ID = 'your chat ID here';
   ```
   (Leave it as the placeholder and bug reports will just go to `TELEGRAM_CHAT_ID` instead — not ideal long-term, but won't break anything.)
4. Test with the `testBugReport` function in the Apps Script editor, same way as `testTelegram`.
5. Redeploy (`Deploy → Manage deployments → ✏️ → New version → Deploy`).

## 9. Admin Dashboard (`admin.html`) — check bookings from your phone

A separate, PIN-protected page for Akash/Subhash to check bookings as easy-to-read cards, with one-tap Call/WhatsApp buttons per guest.

**⚠️ Security note first:** `index.html` is public, so anyone can view its page source and see your Apps Script URL. Without a secret key, that would let anyone fetch every guest's name and phone number just by guessing `?action=bookings` on that URL. `DASHBOARD_ACCESS_KEY` closes that gap — the dashboard sends it with every request, and `Code.gs` rejects requests without the right key. The PIN in `admin.html` is a *separate*, lighter layer — just enough to stop someone picking up the phone and casually opening the dashboard.

**Setup:**

1. **Pick a secret key** — any long random string works, e.g. type random letters/numbers (20+ characters). This is not something guests ever see.
2. In `Code.gs`, set:
   ```js
   const DASHBOARD_ACCESS_KEY = 'your-long-random-string-here';
   ```
3. In `admin.html`, set the **exact same** value:
   ```js
   const DASHBOARD_ACCESS_KEY = 'your-long-random-string-here';
   ```
4. Also in `admin.html`, set the same Apps Script URL as `index.html`:
   ```js
   const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.../exec";
   ```
5. Pick a PIN only Akash/Subhash will know:
   ```js
   const DASHBOARD_PIN = "1234"; // change this
   ```
6. Redeploy `Code.gs` (**Deploy → Manage deployments → ✏️ → New version → Deploy**) so the new `DASHBOARD_ACCESS_KEY` check goes live.
7. Upload `admin.html` to the same GitHub repo as `index.html` (same folder, root level).
8. It'll be live at:
   `https://gh9aravind.github.io/Akash-Mekha_Boating/admin.html`
   Bookmark this on Akash/Subhash's phones — it's not linked from the main site anywhere, so guests won't stumble onto it.

**Using it:** enter the PIN once (it stays logged in on that phone after that — there's a logout button if needed), then see "Today's Bookings" front and center, or switch to "All Bookings". Tap Call or WhatsApp on any card to reach that guest directly. Pull down the refresh button any time new bookings might have come in.

## Optional next steps
- Add a "Bookings" filter/status workflow in the Sheet (the `Status` column already defaults to `New` — change it to `Confirmed`/`Cancelled` manually).
- If you outgrow the Play CDN Tailwind script, migrate `index.html` into a small Vite/React project later — the component logic will carry over as-is.
