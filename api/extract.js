// PDF import: turns text extracted from a financial-results PDF into the CSV
// layout DriftLine reads. The browser extracts the text (pdf.js); this function
// asks Gemini to find the full-year P&L and balance sheet in it.
// Needs GEMINI_API_KEY. Nothing is stored.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_TEXT = 90000;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

const INSTRUCTIONS = `You extract financial statements from text that was pulled out of a company's results PDF or annual report.
Table columns in the text may be separated by " | ". Return JSON only, matching the schema.

pl_csv: the Statement of Profit and Loss as CSV.
- Header row: Line item, then one column per FULL financial year, oldest year first (e.g. "Line item,FY24,FY25"). Name years FYxx where xx is the year the financial year ends (year ended 31 March 2025 = FY25).
- Use only full-year (twelve-month / "year ended") columns. Ignore quarter, "three months ended", half-year and nine-month columns.
- If both standalone and consolidated statements are present, use consolidated and say so in basis.
- One row per income or expense line as named in the document: revenue from operations, other income, cost of materials consumed, purchases of stock-in-trade, changes in inventories, employee benefits expense, finance costs, depreciation and amortisation, other expenses, excise duty, tax expense, and any other expense lines shown.
- Leave out subtotals and totals (total income, total expenses, profit before tax, profit for the year), other comprehensive income, earnings per share and ratios.
- Numbers as plain digits with a decimal point: no thousands separators, no currency symbols. Write negatives with a leading minus sign. Use 0 for "-" or blank. Quote any line item containing a comma.
- Copy numbers exactly as printed. Never estimate, calculate or invent a value.

bs_csv: the balance sheet (or "Statement of Assets and Liabilities") as CSV in the same format, using the same year naming, with these lines where present: Property, plant and equipment; Inventories; Trade receivables; Cash and cash equivalents; Total assets; Total equity; Borrowings (add current and non-current borrowings into one Borrowings line only if both are shown separately, and say so in notes); Trade payables (likewise). Empty string if no balance sheet is in the text.

unit: the unit the figures are in, written short: "₹ Cr", "₹ lakh", "₹ million", "₹ thousand" or "₹" (or the matching currency if not rupees).
basis: "Consolidated", "Standalone" or "Not stated".
found: false if no profit and loss statement with at least one full-year column is in the text.
notes: one or two short sentences on anything the user should check (for example only one full year was available, or columns were ambiguous). Empty string if nothing.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    found: { type: "BOOLEAN" },
    pl_csv: { type: "STRING" },
    bs_csv: { type: "STRING" },
    unit: { type: "STRING" },
    basis: { type: "STRING" },
    notes: { type: "STRING" },
  },
  required: ["found", "pl_csv", "bs_csv", "unit", "basis", "notes"],
};

// Calls Gemini once, and once more after a short pause if it is briefly overloaded (500/503).
async function gemini(model, key, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let r, j;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key.trim() }, body: JSON.stringify(payload) });
    j = await r.json().catch(() => ({}));
    if (r.ok || (r.status !== 500 && r.status !== 503)) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return { r, j };
}
// Short, safe description of a Gemini failure to show the site owner (never includes the key).
function why(r, j) {
  const m = String(j?.error?.message || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 180);
  return `Gemini ${r.status}${j?.error?.status ? " " + j.error.status : ""}${m ? ": " + m : ""}`;
}

function yearColumns(csv) {
  const first = String(csv || "").split(/\r?\n/).find((l) => l.trim()) || "";
  return Math.max(0, first.split(",").length - 1);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "PDF reading isn't switched on for this site yet. Copy the table into Excel or CSV instead." });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "Too many PDFs in a short time. Try again in a few minutes." });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  const text = b && typeof b.text === "string" ? b.text.slice(0, MAX_TEXT) : "";
  if (text.replace(/\s/g, "").length < 200) {
    return res.status(422).json({ error: "This PDF has almost no readable text. It may be a scanned image, which DriftLine can't read yet." });
  }

  const payload = {
    systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: "PDF TEXT:\n\n" + text }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 6000,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      thinkingConfig: { thinkingBudget: 1024 },
    },
  };

  try {
    const { r, j } = await gemini(MODEL, key, payload);
    if (!r.ok) {
      console.error("Gemini extract error", why(r, j));
      if (r.status === 429) return res.status(429).json({ error: "PDF reading is busy right now. Try again in a minute.", detail: why(r, j) });
      return res.status(502).json({ error: "Couldn't read that PDF just now. Try again, or copy the table into Excel.", detail: why(r, j) });
    }
    const raw = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    let out;
    try { out = JSON.parse(raw); } catch { out = null; }
    if (!out) console.error("Extract: unparseable reply", j.candidates?.[0]?.finishReason, raw.slice(0, 200));
    if (!out || !out.found || yearColumns(out.pl_csv) < 1) {
      return res.status(422).json({ error: "Couldn't find a full-year profit and loss statement in this PDF." });
    }
    return res.status(200).json({
      pl: String(out.pl_csv).slice(0, 20000),
      bs: yearColumns(out.bs_csv) >= 1 ? String(out.bs_csv).slice(0, 20000) : "",
      unit: String(out.unit || "").slice(0, 20),
      basis: String(out.basis || "").slice(0, 20),
      notes: String(out.notes || "").slice(0, 400),
    });
  } catch (e) {
    console.error("Extract failure", e);
    return res.status(502).json({ error: "Couldn't read that PDF just now. Try again, or copy the table into Excel.", detail: "Server: " + String(e && e.message).slice(0, 160) });
  }
}
