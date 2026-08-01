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
   | `images/host-subhash.jpg` | "Our Hosts" section — Subhash's photo |
   | `images/host-akash.jpg` | "Our Hosts" section — Akash's photo |

3. That's it — no code changes needed. If a file is missing or still uploading, that tile automatically shows a gradient placeholder instead of breaking.

## 7. How the Reviews section works now

- The **Reviews** section on the site loads real reviews live from a new `Reviews` tab in your Google Sheet (created automatically the first time someone submits one).
- If there are no reviews yet, the site shows *"No reviews found yet — be the first to share your experience!"* with an **Add Your Review** button.
- Tapping that button opens a form (name, place, star rating, review text) that POSTs to the same Apps Script URL, saves a row in the `Reviews` sheet, and sends you a Telegram alert — same pattern as bookings.
- To remove a review from the site without deleting it, open the `Reviews` sheet and change that row's **Status** column from `Published` to `Hidden`.
- No extra setup needed — this uses the same `APPS_SCRIPT_URL` already in `index.html`. Just re-deploy the Apps Script (Step 3, "Manage deployments → New version") after pasting in the updated `Code.gs`.

## Optional next steps
- Add a "Bookings" filter/status workflow in the Sheet (the `Status` column already defaults to `New` — change it to `Confirmed`/`Cancelled` manually).
- If you outgrow the Play CDN Tailwind script, migrate `index.html` into a small Vite/React project later — the component logic will carry over as-is.
