// Early-access sign-ups. Forwards each sign-up to WAITLIST_WEBHOOK_URL
// (for example a Google Apps Script web app that appends a row to a Google Sheet).
// See README for the five-minute setup.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > MAX_PER_WINDOW;
}

const ROLES = ["Owner or promoter", "Finance head", "CA or advisor", "Other"];
const SIZES = ["Under ₹10 Cr", "₹10–100 Cr", "₹100–500 Cr", "Over ₹500 Cr", "Not applicable"];
const PLANS = ["Pro", "CA Partner", "Not sure yet"];
const pick = (v, list) => (list.includes(v) ? v : "Other");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  const hook = process.env.WAITLIST_WEBHOOK_URL;
  if (!hook) return res.status(503).json({ error: "Early-access sign-ups open shortly. Please try again soon." });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = null; } }
  if (!b || typeof b !== "object") return res.status(400).json({ error: "Bad request." });

  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  if (!name) return res.status(400).json({ error: "Add your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });

  const entry = {
    name, email,
    role: pick(String(b.role || ""), ROLES),
    size: pick(String(b.size || ""), SIZES),
    plan: pick(String(b.plan || ""), PLANS),
    at: new Date().toISOString(),
  };

  try {
    const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry), redirect: "follow" });
    if (!r.ok) throw new Error("webhook " + r.status);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Waitlist webhook failed", e.message);
    return res.status(502).json({ error: "We couldn't save that just now. Please try again in a minute." });
  }
}
