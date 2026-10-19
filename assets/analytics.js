// DriftLine usage analytics through Google Analytics for Firebase.
// Pages call window.dlTrack(name, params). Events queue until Firebase loads,
// and are dropped silently if analytics is off or blocked.
//
// Privacy rule for every event: never send financial figures, file contents,
// file names, line-item names, chat text, names or email addresses.

import { FIREBASE_CONFIG } from "/assets/firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";
const queue = (window.__dlq = window.__dlq || []);

async function start() {
  if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.measurementId) return;
  try {
    const { initializeApp } = await import(SDK + "firebase-app.js");
    const { getAnalytics, logEvent, isSupported } = await import(SDK + "firebase-analytics.js");
    if (!(await isSupported())) return;
    const analytics = getAnalytics(initializeApp(FIREBASE_CONFIG));
    window.dlTrack = (name, params) => {
      try { logEvent(analytics, name, params || {}); } catch (_) { /* ignore */ }
    };
    queue.splice(0).forEach(([n, p]) => window.dlTrack(n, p));
  } catch (e) {
    console.warn("DriftLine analytics is off:", e && e.message);
  }
}

// Clicks on anything marked data-track="event_name" with optional data-track-* params.
document.addEventListener("click", (e) => {
  const el = e.target.closest && e.target.closest("[data-track]");
  if (!el) return;
  const params = {};
  for (const [k, v] of Object.entries(el.dataset)) {
    if (k.startsWith("track") && k !== "track") params[k.slice(5).toLowerCase()] = v;
  }
  window.dlTrack(el.dataset.track, params);
});

start();
