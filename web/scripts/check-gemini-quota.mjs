/** Probe the Gemini API to see if you're rate-limited, and if so, which quota.
 *
 *   GEMINI_API_KEY=your_key node scripts/check-gemini-quota.mjs
 *   (optional) GEMINI_MODEL=gemini-2.5-flash-lite to check a different model
 *
 * Get the key from AI Studio (aistudio.google.com -> Get API key) or your Vapi
 * dashboard (Providers -> Google). The key is NOT read from .env here on purpose
 * — pass it inline so it isn't stored.
 */
const key = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
if (!key) {
  console.error("Set GEMINI_API_KEY. e.g. GEMINI_API_KEY=xxx node scripts/check-gemini-quota.mjs");
  process.exit(1);
}

const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
});

const body = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status} for ${model}\n`);

if (res.ok) {
  console.log("✅ Not rate-limited right now — the per-minute limits have reset.");
  console.log("   (If calls still 429 immediately, you're hitting the DAILY cap (RPD).)");
} else if (res.status === 429) {
  console.log("⛔ Rate-limited (429). Which quota:");
  const details = body?.error?.details || [];
  for (const d of details) {
    for (const v of d.violations || []) {
      console.log(`   quotaId: ${v.quotaId}   metric: ${v.quotaMetric || ""}`);
    }
    if (d.retryDelay) console.log(`   retry after: ${d.retryDelay}`);
  }
  const id = JSON.stringify(details);
  console.log(
    "\n   → " +
      (/PerDay/i.test(id) ? "DAILY request cap (RPD) — resets ~midnight Pacific." :
       /InputToken/i.test(id) ? "input TOKENS-per-minute (TPM) — resets each minute." :
       /PerMinute/i.test(id) ? "requests-per-minute (RPM) — resets each minute." :
       "see quotaId above."),
  );
  console.log("   Message:", body?.error?.message || "(none)");
} else {
  console.log("Unexpected response:\n", JSON.stringify(body, null, 2).slice(0, 800));
}
