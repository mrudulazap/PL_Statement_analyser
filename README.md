# DriftLine

DriftLine is a cost diagnostic for Indian MSMEs. A company uploads its P&L and balance sheet, and DriftLine shows which cost lines have drifted against revenue, what bringing them back to their best year is worth, and how much cash is tied up in working capital. **Plop**, the built-in analyst, answers questions about the loaded figures using Google Gemini.

Live: https://driftline-amber.vercel.app · Built by [Mrudula Kavuri](https://mrudula-portfolio-theta.vercel.app/)

## Pages

| URL | File | What it is |
|---|---|---|
| `/` | `index.html` | Product landing page: value, how it works, pricing, early-access sign-up, FAQ |
| `/app` | `app.html` | The free diagnostic. Analysis runs entirely in the browser |
| `/case-study` | `case-study.html` | Partner-style critique, MSME market sizing and 18-month roadmap |

Server functions:

| File | What it does |
|---|---|
| `api/plop.js` | Plop chat. Holds Plop's instructions and calls Gemini with your key |
| `api/waitlist.js` | Early-access form. Forwards each sign-up to a webhook, such as a Google Sheet |

Fonts are self-hosted in `assets/fonts` (Bricolage Grotesque and IBM Plex, both under the SIL Open Font License).

## Environment variables (Vercel → Settings → Environment Variables)

| Name | Needed for | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Plop's live answers | From Google AI Studio. Without it, Plop gives basic lookups |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash` |
| `WAITLIST_WEBHOOK_URL` | Early-access sign-ups | Without it, the form tells visitors sign-ups open shortly |

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

## Cost controls

Both functions limit requests per visitor, but serverless copies don't share memory, so the limits slow abuse rather than cap it. Set a quota or budget alert on the Gemini key in Google Cloud.

## Input format

One row per line item, one column per financial year, oldest to newest (newest-first is detected and flipped). CSV, tab-separated text, or the first sheet of an Excel file. The app offers a template download.

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
- Pro and CA Partner features are in early access and not built yet; the site marks them as coming soon.
