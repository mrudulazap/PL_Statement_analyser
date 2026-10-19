// Shared Gemini caller for DriftLine's server functions.
// Files starting with "_" in /api are helpers, not endpoints.
//
// Resilience, because Google retires and changes models:
// - 500/503 (briefly overloaded): wait and retry once.
// - 404 (model retired or unavailable to this key): look up the newest
//   available Flash model with ListModels, remember it, and retry.
// - 400 (a setting the model rejects): retry once without optional settings.

export const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const BASE = "https://generativelanguage.googleapis.com/v1beta";
let discovered = null; // model found via ListModels after a 404, reused by later calls

async function post(model, key, payload) {
  let r, j;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });
    j = await r.json().catch(() => ({}));
    if (r.ok || (r.status !== 500 && r.status !== 503)) break;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  return { r, j };
}

function version(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

async function newestFlash(key) {
  try {
    const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key } });
    const j = await r.json().catch(() => ({}));
    const names = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter((n) => /^gemini-[\d.]+-flash/.test(n) && !/lite|image|tts|live|audio|embed|thinking-exp/i.test(n));
    // Prefer stable over preview/experimental, then the highest version.
    names.sort((a, b) => (/preview|exp/.test(a) - /preview|exp/.test(b)) || version(b) - version(a) || a.length - b.length);
    return names[0] || null;
  } catch {
    return null;
  }
}

function stripOptional(payload) {
  const p = JSON.parse(JSON.stringify(payload));
  if (p.generationConfig) {
    delete p.generationConfig.thinkingConfig;
    delete p.generationConfig.temperature;
    delete p.generationConfig.responseSchema;
  }
  return p;
}

export async function gemini(key, payload) {
  key = String(key || "").trim();
  let model = discovered || DEFAULT_MODEL;
  let { r, j } = await post(model, key, payload);

  if (r.status === 404) {
    const alt = await newestFlash(key);
    if (alt && alt !== model) {
      console.warn(`Gemini model ${model} unavailable; using ${alt}. Set GEMINI_MODEL to choose one.`);
      discovered = model = alt;
      ({ r, j } = await post(model, key, payload));
    }
  }
  if (r.status === 400 && !/api key/i.test(String(j?.error?.message))) {
    ({ r, j } = await post(model, key, stripOptional(payload)));
  }
  return { r, j, model };
}

// Short, safe description of a failure for the site owner (never includes the key).
export function why(r, j) {
  const m = String(j?.error?.message || "").replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 180);
  return `Gemini ${r.status}${j?.error?.status ? " " + j.error.status : ""}${m ? ": " + m : ""}`;
}
