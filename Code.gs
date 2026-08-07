/**
 * =====================================================================
 * MALARIKKAL WATER LILY BOAT TOURS — Backend API
 * Google Apps Script Web App (free serverless backend)
 *
 * Responsibilities:
 *   1. Receive booking data via HTTP POST (doPost) → Bookings sheet
 *   2. Receive guest reviews via HTTP POST (doPost) → Reviews sheet
 *   3. Serve published reviews via HTTP GET (doGet ?action=reviews)
 *   4. Send an instant Telegram alert to the boat owner for both
 *   5. Respond with JSON (success/error)
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURATION — edit these three values after setup
// ---------------------------------------------------------------------
const SHEET_NAME = 'Bookings';
const REVIEWS_SHEET_NAME = 'Reviews';
const BUGS_SHEET_NAME = 'BugReports';

// Get this from @BotFather on Telegram (see SETUP_GUIDE.md)
const TELEGRAM_BOT_TOKEN = '8664862882:AAFldEQNJAQvSaX69Oe6M2WA5ZmYX6KRwo0';

// Get this from @userinfobot or the getUpdates trick (see SETUP_GUIDE.md)
const TELEGRAM_CHAT_ID = '-1004441390207';

// Where bug reports go — this should be the DEVELOPER's own Telegram chat ID,
// not the business owners' group above (they can't fix code bugs).
// Easiest way: message the SAME bot privately from the developer's own
// Telegram account, then read the chat ID from getUpdates same as before.
// Leave blank ('') to just send bug reports to TELEGRAM_CHAT_ID instead.
const DEVELOPER_TELEGRAM_CHAT_ID = '8552156658';

// ---- WhatsApp alerts via CallMeBot (free API, personal use only) ----
// Setup (one-time):
//   1. Save the CallMeBot bot's WhatsApp number to your phone contacts.
//      The number can change over time — get the current one from
//      https://www.callmebot.com/blog/free-api-whatsapp-messages/
//   2. From WhatsApp, message that contact: "I allow callmebot to send me messages"
//   3. The bot replies with your API key within ~2 minutes — paste it below.
const WHATSAPP_PHONE = 'PASTE_YOUR_WHATSAPP_NUMBER_HERE';       // number that RECEIVES alerts, e.g. '91XXXXXXXXXX' (country code, no +)
const CALLMEBOT_API_KEY = 'PASTE_YOUR_CALLMEBOT_API_KEY_HERE';  // the key the CallMeBot bot sent you

// ---- Admin dashboard (admin.html) ----
// The main site's index.html is public, so anyone can view its source and
// see this Apps Script's URL. Without this key, ?action=bookings would let
// ANYONE fetch every guest's name and phone number just by knowing the URL.
// Set this to a long random string and put the exact same value in
// admin.html's DASHBOARD_ACCESS_KEY. This isn't bank-grade security (anyone
// who gets admin.html's source can also read the key) but it stops casual/
// accidental exposure, which is the right level for this use case.
const DASHBOARD_ACCESS_KEY = 'PASTE_A_LONG_RANDOM_SECRET_HERE';

// Sheet column order — keep this in sync with the header row below
const COLUMNS = [
  'Booking ID', 'Name', 'Phone', 'Date', 'Time Slot',
  'Adults', 'Kids', 'Total Price', 'Timestamp', 'Status'
];

// Reviews sheet columns. "Status" defaults to Published — change a row's
// Status to "Hidden" in the sheet manually to remove a review from the site.
const REVIEW_COLUMNS = [
  'Name', 'Place', 'Rating', 'Review', 'Timestamp', 'Status'
];

// Bug reports sheet columns.
const BUG_COLUMNS = [
  'Timestamp', 'Type', 'Message', 'Page URL', 'User Agent', 'Status'
];

// ---------------------------------------------------------------------
// ENTRY POINTS
// ---------------------------------------------------------------------

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (action === 'reviews') {
    try {
      return jsonResponse({ success: true, reviews: getPublishedReviews() });
    } catch (err) {
      Logger.log('doGet reviews error: ' + err);
      return jsonResponse({ success: false, error: err.message || String(err), reviews: [] });
    }
  }

  if (action === 'bookings') {
    const key = e && e.parameter && e.parameter.key;
    if (!key || key !== DASHBOARD_ACCESS_KEY) {
      return jsonResponse({ success: false, error: 'Unauthorized' });
    }
    try {
      return jsonResponse({ success: true, bookings: getAllBookings() });
    } catch (err) {
      Logger.log('doGet bookings error: ' + err);
      return jsonResponse({ success: false, error: err.message || String(err), bookings: [] });
    }
  }

  return jsonResponse({
    status: 'ok',
    message: 'Malarikkal Water Lily Boat Tours API is running.'
  });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: 'No data received.' });
    }

    const data = JSON.parse(e.postData.contents);

    if (data.type === 'review') {
      return handleReviewSubmission(data);
    }
    if (data.type === 'bug') {
      return handleBugReportSubmission(data);
    }
    return handleBookingSubmission(data);

  } catch (err) {
    Logger.log('doPost error: ' + err);
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
}

// ---------------------------------------------------------------------
// BOOKINGS
// ---------------------------------------------------------------------

function handleBookingSubmission(data) {
  // ---- Validate required fields ----
  const required = [
    'bookingId', 'name', 'phone', 'date',
    'timeSlot', 'adults', 'kids', 'totalPrice'
  ];
  for (let i = 0; i < required.length; i++) {
    const field = required[i];
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return jsonResponse({ success: false, error: 'Missing field: ' + field });
    }
  }

  // ---- Basic sanity checks ----
  const phoneDigits = String(data.phone).replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return jsonResponse({ success: false, error: 'Invalid phone number.' });
  }

  // ---- Save to Google Sheet ----
  appendBookingRow(data);

  // ---- Notify owner on Telegram (non-blocking failure) ----
  try {
    sendTelegramNotification(data);
  } catch (telegramErr) {
    // Booking is already saved — a Telegram failure should not fail the booking.
    Logger.log('Telegram notification failed: ' + telegramErr);
  }

  // ---- Notify owner on WhatsApp via CallMeBot (non-blocking failure) ----
  try {
    sendWhatsAppNotification(buildBookingWhatsAppText(data));
  } catch (whatsappErr) {
    Logger.log('WhatsApp notification failed: ' + whatsappErr);
  }

  return jsonResponse({
    success: true,
    bookingId: data.bookingId,
    message: 'Booking confirmed and saved.'
  });
}

// ---------------------------------------------------------------------
// REVIEWS
// ---------------------------------------------------------------------

function handleReviewSubmission(data) {
  const required = ['name', 'rating', 'text'];
  for (let i = 0; i < required.length; i++) {
    const field = required[i];
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      return jsonResponse({ success: false, error: 'Missing field: ' + field });
    }
  }

  const rating = Number(data.rating);
  if (!rating || rating < 1 || rating > 5) {
    return jsonResponse({ success: false, error: 'Rating must be between 1 and 5.' });
  }

  const review = {
    name: String(data.name).slice(0, 60),
    place: String(data.place || '').slice(0, 60),
    rating: rating,
    text: String(data.text).slice(0, 500),
    timestamp: data.timestamp || new Date().toISOString()
  };

  appendReviewRow(review);

  try {
    sendReviewTelegramNotification(review);
  } catch (telegramErr) {
    Logger.log('Telegram review notification failed: ' + telegramErr);
  }

  try {
    sendWhatsAppNotification(buildReviewWhatsAppText(review));
  } catch (whatsappErr) {
    Logger.log('WhatsApp review notification failed: ' + whatsappErr);
  }

  return jsonResponse({ success: true, message: 'Review submitted. Thank you!' });
}

function appendReviewRow(review) {
  const sheet = getOrCreateReviewsSheet();
  sheet.appendRow([
    review.name,
    review.place,
    review.rating,
    review.text,
    review.timestamp,
    'Published'
  ]);
}

function getOrCreateReviewsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(REVIEWS_SHEET_NAME);
    sheet.appendRow(REVIEW_COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, REVIEW_COLUMNS.length).setFontWeight('bold').setBackground('#EC4899').setFontColor('#FFFFFF');
    sheet.autoResizeColumns(1, REVIEW_COLUMNS.length);
  }
  return sheet;
}

/**
 * Reads the Reviews sheet and returns only rows marked "Published",
 * newest first. Change a row's Status column to "Hidden" in the sheet
 * to remove a review from the live site without deleting it.
 */
function getPublishedReviews() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REVIEWS_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, REVIEW_COLUMNS.length).getValues();
  const reviews = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const status = row[5];
    if (status === 'Hidden') continue;
    reviews.push({
      name: row[0],
      place: row[1],
      rating: row[2],
      text: row[3],
      timestamp: row[4] instanceof Date ? row[4].toISOString() : String(row[4])
    });
  }
  return reviews.reverse(); // newest first
}

// ---------------------------------------------------------------------
// BUG REPORTS — sent to the DEVELOPER, not the business owners
// ---------------------------------------------------------------------

function handleBugReportSubmission(data) {
  if (!data.message || String(data.message).trim() === '') {
    return jsonResponse({ success: false, error: 'Missing field: message' });
  }

  const report = {
    message: String(data.message).slice(0, 800),
    pageUrl: String(data.pageUrl || '').slice(0, 300),
    userAgent: String(data.userAgent || '').slice(0, 300),
    source: data.auto ? 'Auto-detected error' : 'User report',
    timestamp: data.timestamp || new Date().toISOString()
  };

  appendBugReportRow(report);

  try {
    sendBugReportTelegramNotification(report);
  } catch (telegramErr) {
    Logger.log('Bug report Telegram notification failed: ' + telegramErr);
  }

  return jsonResponse({ success: true, message: 'Bug report received. Thank you!' });
}

function appendBugReportRow(report) {
  const sheet = getOrCreateBugReportsSheet();
  sheet.appendRow([
    report.timestamp,
    report.source,
    report.message,
    report.pageUrl,
    report.userAgent,
    'New'
  ]);
}

function getOrCreateBugReportsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BUGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BUGS_SHEET_NAME);
    sheet.appendRow(BUG_COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, BUG_COLUMNS.length).setFontWeight('bold').setBackground('#DC2626').setFontColor('#FFFFFF');
    sheet.autoResizeColumns(1, BUG_COLUMNS.length);
  }
  return sheet;
}

function sendBugReportTelegramNotification(report) {
  const chatId = DEVELOPER_TELEGRAM_CHAT_ID && DEVELOPER_TELEGRAM_CHAT_ID.indexOf('PASTE_') !== 0
    ? DEVELOPER_TELEGRAM_CHAT_ID
    : TELEGRAM_CHAT_ID;

  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  const message =
    '🐞 <b>' + escapeHtml(report.source) + '!</b>\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '💬 <b>Message:</b> ' + escapeHtml(report.message) + '\n' +
    (report.pageUrl ? '🔗 <b>Page:</b> ' + escapeHtml(report.pageUrl) + '\n' : '') +
    (report.userAgent ? '📱 <b>Device:</b> ' + escapeHtml(report.userAgent) + '\n' : '') +
    '🕒 <b>Time:</b> ' + escapeHtml(report.timestamp) + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    'Logged in the BugReports sheet.';

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

// ---------------------------------------------------------------------
// GOOGLE SHEET
// ---------------------------------------------------------------------

function appendBookingRow(data) {
  const sheet = getOrCreateSheet();
  sheet.appendRow([
    data.bookingId,
    data.name,
    data.phone,
    data.date,
    data.timeSlotLabel,
    data.adults,
    data.kids,
    data.totalPrice,
    data.timestamp || new Date().toISOString(),
    'New'
  ]);
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#0B4F6C').setFontColor('#FFFFFF');
    sheet.autoResizeColumns(1, COLUMNS.length);
  }
  return sheet;
}

/**
 * Reads every booking row for the admin dashboard, newest first.
 * Google Sheets sometimes auto-converts a "2026-08-15"-style string into
 * a real Date cell, so date/timestamp values are normalized back to plain
 * strings here regardless of how the cell ended up being stored.
 */
function getAllBookings() {
  const sheet = getOrCreateSheet();
  if (sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues();
  const bookings = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    bookings.push({
      bookingId: row[0],
      name: row[1],
      phone: row[2],
      date: normalizeSheetDate(row[3]),
      timeSlotLabel: row[4],
      adults: row[5],
      kids: row[6],
      totalPrice: row[7],
      timestamp: row[8] instanceof Date ? row[8].toISOString() : String(row[8]),
      status: row[9]
    });
  }
  return bookings.reverse(); // newest first
}

function normalizeSheetDate(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return String(value);
}

// ---------------------------------------------------------------------
// TELEGRAM NOTIFICATION
// ---------------------------------------------------------------------

function sendTelegramNotification(data) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';

  const message =
    '🌸 <b>New Boat Booking — Malarikkal!</b>\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🆔 <b>Booking ID:</b> ' + escapeHtml(data.bookingId) + '\n' +
    '👤 <b>Name:</b> ' + escapeHtml(data.name) + '\n' +
    '📞 <b>Phone:</b> <a href="tel:' + escapeHtml(data.phone) + '">' + escapeHtml(data.phone) + '</a>\n' +
    '📅 <b>Date:</b> ' + escapeHtml(data.date) + '\n' +
    '⏰ <b>Slot:</b> ' + escapeHtml(data.timeSlotLabel) + '\n' +
    '👨‍👩‍👧 <b>Adults:</b> ' + data.adults + '  |  <b>Kids:</b> ' + data.kids + '\n' +
    '💰 <b>Total:</b> ₹' + data.totalPrice + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '👉 Tap the phone number above to call the guest directly.';

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  Logger.log('Telegram response: ' + response.getContentText());
}

function sendReviewTelegramNotification(review) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const stars = '⭐'.repeat(review.rating);

  const message =
    '📝 <b>New Review — Malarikkal!</b>\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '👤 <b>Name:</b> ' + escapeHtml(review.name) + '\n' +
    (review.place ? '📍 <b>Place:</b> ' + escapeHtml(review.place) + '\n' : '') +
    '⭐ <b>Rating:</b> ' + stars + ' (' + review.rating + '/5)\n' +
    '💬 <b>Review:</b> ' + escapeHtml(review.text) + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '✅ Now live on the website. Change Status to "Hidden" in the Reviews sheet to remove it.';

  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  UrlFetchApp.fetch(url, options);
}

// ---------------------------------------------------------------------
// WHATSAPP NOTIFICATION (via CallMeBot)
// ---------------------------------------------------------------------
// NOTE: WhatsApp doesn't understand Telegram's <b>HTML tags</b> — it uses
// its own *bold* / _italic_ syntax — so these messages are built separately
// rather than reusing the Telegram HTML strings above.

function sendWhatsAppNotification(message) {
  const url = 'https://api.callmebot.com/whatsapp.php'
    + '?phone=' + encodeURIComponent(WHATSAPP_PHONE)
    + '&text=' + encodeURIComponent(message)
    + '&apikey=' + encodeURIComponent(CALLMEBOT_API_KEY);

  const options = { method: 'get', muteHttpExceptions: true };
  const response = UrlFetchApp.fetch(url, options);
  Logger.log('CallMeBot response: ' + response.getContentText());
}

function buildBookingWhatsAppText(data) {
  return '🌸 *New Boat Booking — Malarikkal!*\n' +
    '———————————————\n' +
    '🆔 *Booking ID:* ' + data.bookingId + '\n' +
    '👤 *Name:* ' + data.name + '\n' +
    '📞 *Phone:* ' + data.phone + '\n' +
    '📅 *Date:* ' + data.date + '\n' +
    '⏰ *Slot:* ' + data.timeSlotLabel + '\n' +
    '👨‍👩‍👧 *Adults:* ' + data.adults + '  |  *Kids:* ' + data.kids + '\n' +
    '💰 *Total:* ₹' + data.totalPrice + '\n' +
    '———————————————\n' +
    '👉 Call the guest to confirm.';
}

function buildReviewWhatsAppText(review) {
  const stars = '⭐'.repeat(review.rating);
  return '📝 *New Review — Malarikkal!*\n' +
    '———————————————\n' +
    '👤 *Name:* ' + review.name + '\n' +
    (review.place ? '📍 *Place:* ' + review.place + '\n' : '') +
    '⭐ *Rating:* ' + stars + ' (' + review.rating + '/5)\n' +
    '💬 *Review:* ' + review.text + '\n' +
    '———————————————\n' +
    '✅ Now live on the website.';
}

// ---------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonResponse(obj) {
  // NOTE: Apps Script automatically attaches Access-Control-Allow-Origin: *
  // to ContentService responses for web apps deployed with "Anyone" access,
  // so no manual CORS header code is needed (and ContentService does not
  // expose a setHeader API). See SETUP_GUIDE.md for the matching frontend
  // fetch() configuration required to avoid CORS preflight issues.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Optional: run this once manually from the Apps Script editor to verify
 * your Telegram bot token + chat ID are correct before going live.
 */
function testTelegram() {
  sendTelegramNotification({
    bookingId: 'TEST-0001',
    name: 'Test User',
    phone: '9999999999',
    date: '2026-08-15',
    timeSlotLabel: '6:00 – 7:00 AM',
    adults: 2,
    kids: 1,
    totalPrice: 1000
  });
}

/**
 * Optional: run this once manually from the Apps Script editor to verify
 * your WhatsApp number + CallMeBot API key are correct before going live.
 */
function testWhatsApp() {
  sendWhatsAppNotification(buildBookingWhatsAppText({
    bookingId: 'TEST-0001',
    name: 'Test User',
    phone: '9999999999',
    date: '2026-08-15',
    timeSlotLabel: '6:00 – 7:00 AM',
    adults: 2,
    kids: 1,
    totalPrice: 1000
  }));
}

/**
 * Optional: run this once manually from the Apps Script editor to verify
 * bug reports reach DEVELOPER_TELEGRAM_CHAT_ID (or TELEGRAM_CHAT_ID as
 * fallback) correctly before going live.
 */
function testBugReport() {
  sendBugReportTelegramNotification({
    source: 'Test bug report',
    message: 'This is a test — everything is wired correctly.',
    pageUrl: 'https://example.github.io/',
    userAgent: 'Test Script',
    timestamp: new Date().toISOString()
  });
}
