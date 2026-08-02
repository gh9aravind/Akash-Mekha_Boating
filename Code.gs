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

// Get this from @BotFather on Telegram (see SETUP_GUIDE.md)
const TELEGRAM_BOT_TOKEN = 'PASTE_YOUR_BOT_TOKEN_HERE';

// Get this from @userinfobot or the getUpdates trick (see SETUP_GUIDE.md)
const TELEGRAM_CHAT_ID = 'PASTE_YOUR_CHAT_ID_HERE';

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
