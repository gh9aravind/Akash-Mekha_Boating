/**
 * =====================================================================
 * MALARIKKAL WATER LILY BOAT TOURS — Backend API
 * Google Apps Script Web App (free serverless backend)
 *
 * Responsibilities:
 *   1. Receive booking data via HTTP POST (doPost)
 *   2. Validate + append the booking as a new row in Google Sheets
 *   3. Send an instant Telegram alert to the boat owner
 *   4. Respond with JSON (success/error)
 * =====================================================================
 */

// ---------------------------------------------------------------------
// CONFIGURATION — edit these three values after setup
// ---------------------------------------------------------------------
const SHEET_NAME = 'Bookings';

// Get this from @BotFather on Telegram (see SETUP_GUIDE.md)
const TELEGRAM_BOT_TOKEN = 'PASTE_YOUR_BOT_TOKEN_HERE';

// Get this from @userinfobot or the getUpdates trick (see SETUP_GUIDE.md)
const TELEGRAM_CHAT_ID = 'PASTE_YOUR_CHAT_ID_HERE';

// Sheet column order — keep this in sync with the header row below
const COLUMNS = [
  'Booking ID', 'Name', 'Phone', 'Date', 'Time Slot',
  'Adults', 'Kids', 'Total Price', 'Timestamp', 'Status'
];

// ---------------------------------------------------------------------
// ENTRY POINTS
// ---------------------------------------------------------------------

function doGet(e) {
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

  } catch (err) {
    Logger.log('doPost error: ' + err);
    return jsonResponse({ success: false, error: err.message || String(err) });
  }
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
    data.timeSlot,
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
    '⏰ <b>Slot:</b> ' + escapeHtml(data.timeSlot) + '\n' +
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
    timeSlot: 'Sunrise (6:00 AM - 8:00 AM)',
    adults: 2,
    kids: 1,
    totalPrice: 1500
  });
}
