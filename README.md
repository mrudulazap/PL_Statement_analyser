# DriftLine

DriftLine is a free cost diagnostic for Indian MSMEs. A company uploads its P&L and balance sheet, and DriftLine shows which cost lines have drifted against revenue, what bringing them back to their best year is worth, and how much cash is tied up in working capital. **Plop**, the built-in analyst, answers questions about the loaded figures using Google Gemini.

Live: https://driftline-amber.vercel.app · Built by [Mrudula Kavuri](https://mrudula-portfolio-theta.vercel.app/)

## Pages

| URL | File | What it is |
|---|---|---|
| `/` | `index.html` | Landing page: value, how it works, free for everyone, what's next with an updates sign-up, FAQ |
| `/app` | `app.html` | The free diagnostic. Starts empty; shows a report only from the visitor's own statements. Analysis runs in the browser |
| `/case-study` | `case-study.html` | Partner-style critique, MSME market sizing and 18-month roadmap |

Server functions:

| File | What it does |
|---|---|
| `api/_gemini.js` | Shared Gemini caller: retries when overloaded, finds a replacement model if one is retired, drops settings a model rejects |
| `api/plop.js` | Plop chat. Holds Plop's instructions and calls Gemini with your key |
| `api/extract.js` | PDF import. Receives the text of the statement pages (extracted in the browser by pdf.js) and asks Gemini for the full-year P&L and balance sheet as CSV |
| `api/waitlist.js` | "Get updates" form. Forwards each sign-up to a webhook, such as a Google Sheet |

Analytics: `assets/analytics.js` loads Google Analytics for Firebase using `assets/firebase-config.js`.

pdf.js 3.11.174 is self-hosted in `assets/vendor` (Apache 2.0) and only loads when someone adds a PDF.

Inter is self-hosted in `assets/fonts` (SIL Open Font License).

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Needed for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Plop's live answers and PDF import | From Google AI Studio. Without it, Plop gives basic lookups and PDFs show a "not switched on" message |
| `GEMINI_CHAT_MODEL` | Optional | Model for Plop. Defaults to the newest stable Flash Lite model on your key, for fast answers |
| `GEMINI_EXTRACT_MODEL` | Optional | Model for AI PDF reading. Defaults to the newest stable Flash Lite model on your key |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-3.8-flash`. If Google retires the model, DriftLine switches to the newest available stable Flash model automatically (see `api/_gemini.js`) |
| `WAITLIST_WEBHOOK_URL` | "Get updates" sign-ups | Without it, the form tells visitors sign-ups open shortly |

Redeploy after adding or changing a variable.

### Collect sign-ups in a Google Sheet (5 minutes)

1. Create a Google Sheet with headers in row 1: `at, name, email, role, size, plan`.
2. In the sheet, open **Extensions → Apps Script**, replace the code with the snippet below, and save.
3. Click **Deploy → New deployment → Web app**. Set *Execute as* **Me** and *Who has access* **Anyone**. Deploy and copy the web app URL.
4. Add that URL in Vercel as `WAITLIST_WEBHOOK_URL`, then redeploy.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    .appendRow([d.at, d.name, d.email, d.role, d.size, d.plan]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Analytics (Google Analytics for Firebase)

1. In the [Firebase console](https://console.firebase.google.com/), create a project (or open an existing one) and turn on **Google Analytics** for it.
2. Go to **Project settings → General → Your apps**, add a **Web app**, and copy the `firebaseConfig` values.
3. Paste them into `assets/firebase-config.js`. The `measurementId` starts with `G-`.
4. Commit and push. Vercel redeploys, and events appear under **Analytics → Realtime** within a minute, and in reports within a day.

While `measurementId` is empty, analytics stays off and nothing is sent. The web config is not a secret, so it's fine in a public repo.

Events recorded (besides automatic page views):

| Event | When | Parameters |
|---|---|---|
| `cta_click` | A tracked button is clicked | `location`, `target` |
| `diagnostic_run` | A report is produced | `source` (always own), `years`, `has_balance_sheet` |
| `own_diagnostic` | A report is produced from the visitor's own statements | `years` |
| `diagnostic_error` | Statements can't be read | `reason` (DriftLine's own error message) |
| `file_upload` | A statement file is added | `statement` (pl or bs), `format` |
| `pdf_extract` | A PDF import finishes or is declined | `result` (ok, declined, scanned, not_found, off, failed…), `years`, `has_balance_sheet` |
| `template_download` | Template downloaded | none |
| `plop_open` | The Plop chat window is opened | none |
| `plop_question` | A question is asked | `suggested` (yes or no) |
| `report_clear` | The Clear button empties the report and inputs | none |
| `capture_change` | Capture slider moved | `percent` |
| `faq_open` | An FAQ is opened | `question` (number) |
| `updates_signup` | Updates form submitted | `role`, `company_size` |

No event carries financial figures, file names or contents, line-item names, chat text, names or email addresses.

`own_diagnostic` fires only when someone runs the report on their own statements (`years`). Mark it as a **key event** in Firebase (Admin → Events) to track it as DriftLine's main conversion.

## Cost controls

Both functions limit requests per visitor, but serverless copies don't share memory, so the limits slow abuse rather than cap it. Set a quota or budget alert on the Gemini key in Google Cloud.

## PDF import

1. The visitor adds a PDF. pdf.js extracts the text in the browser.
2. **In-browser reader first.** DriftLine finds the profit and loss page (consolidated if present), reads the column headers, keeps only full-year columns (quarters ignored), drops note numbers, and reads the balance sheet the same way. No AI is used and nothing leaves the device.
3. **AI only if needed.** If the layout can't be read locally, DriftLine asks first, then sends only the statement lines (up to 30,000 characters) to `api/extract.js`, which uses a fast Gemini Lite model when available (`GEMINI_EXTRACT_MODEL` overrides it) with a 110-second budget.
4. Both statements are filled in, the units are set, and a banner asks the visitor to check the numbers. The raw figures open for editing.

Scanned (image-only) PDFs and password-protected PDFs get a clear message instead.

## Input format

PDF (see above), or one row per line item and one column per financial year, oldest to newest (newest-first is detected and flipped). CSV, tab-separated text, or the first sheet of an Excel file. The app offers a template download.

```
Line item,FY22,FY23,FY24,FY25
Revenue from operations,820,905,960,1010
Cost of materials consumed,492,552,595,631
Employee benefits expense,74,80,88,97
```

## Known limits

- Savings are sized against the company's own best year, not peers.
- Annual statements cannot separate price, volume and mix, so every insight lists the data needed to confirm it.
- Working-capital days use year-end balances, not averages.
- Features under "What's next" are planned, not built; the site says so.
