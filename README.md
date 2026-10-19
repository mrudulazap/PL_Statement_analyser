# DriftLine

DriftLine reads a company's P&L and balance sheet across several years and shows where costs have drifted against revenue, what returning each line to its best year would be worth, and how much cash is tied up in working capital. **Plop**, the built-in analyst, answers questions about the loaded figures using Google Gemini.

The page also includes a partner-style critical review of the product concept and an 18-month roadmap.

Prototype by [Mrudula](https://mrudula-portfolio-theta.vercel.app/).

## What's in the repo

| File | What it does |
|---|---|
| `index.html` | The whole app: upload, analysis engine, charts, insights, review and roadmap. Runs in the browser. |
| `api/plop.js` | Vercel server function behind the Plop chat. Holds Plop's instructions and calls Gemini with your key. |
| `package.json` | Tells Vercel to use modern Node. No dependencies to install. |

Uploaded statements are analysed in the visitor's browser. Only when someone asks Plop a question are the summarised figures sent to Gemini.

## Deploy on Vercel

1. **Import the repo.** In Vercel choose *Add New → Project*, pick `PL_Statement_analyser`, leave *Framework Preset* as **Other**, and deploy. No build command is needed.
2. **Add the Gemini key.** In the project go to *Settings → Environment Variables* and add `GEMINI_API_KEY` with a key from Google AI Studio. Optionally add `GEMINI_MODEL` (default `gemini-2.5-flash`).
3. **Redeploy** (*Deployments → ⋯ → Redeploy*) so the key takes effect.
4. **Cap your spend.** The function has a per-visitor limit of 20 questions per 10 minutes, but serverless copies don't share memory, so it is not a hard cap. Set a quota or budget alert on the key in Google Cloud.

Without a key the site still works. Plop then gives basic lookups from the analysis instead of open answers.

## Input format

One row per line item, one column per financial year, oldest to newest (newest-first is detected and flipped). CSV, tab-separated text, or the first sheet of an Excel file. Line items are matched by name, so Schedule III, US GAAP and plain-English labels work.

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
