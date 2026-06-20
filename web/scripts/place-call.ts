/** Place a scheduler call from a request JSON file, against the running server.
 *
 *   npm run place-call -- scripts/test-ivr/test-request.json
 *
 * The dev server (npm run dev / dev:tunnel) must be running on port 8000.
 */
import { promises as fs } from "fs";
import path from "path";

const PORT = 8000;

async function main() {
  const file = process.argv[2] ?? "scripts/test-ivr/test-request.json";
  const body = await fs.readFile(path.resolve(file), "utf8");

  const res = await fetch(`http://localhost:${PORT}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ ${res.status} ${res.statusText}\n${text}`);
    process.exit(1);
  }
  const data = JSON.parse(text);
  console.log("✓ Call placed.");
  console.log(`  record:   ${data.record?.id}`);
  console.log(`  vapiCall: ${data.record?.vapiCallId}`);
  console.log("  Watch it in the Vapi dashboard → Logs (needs HIPAA_MODE=false).");
}

main().catch((e) => {
  console.error("Failed to place call:", e.message);
  console.error("Is the dev server running on port 8000?");
  process.exit(1);
});
