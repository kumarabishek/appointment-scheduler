/** One-command dev: start ngrok, capture its URL into .env.local, run the app.
 *
 *   npm run dev:tunnel
 *
 * Avoids paying for a static domain — we just read the fresh ephemeral URL from
 * ngrok's local API (http://127.0.0.1:4040) each run and write it to
 * PUBLIC_BASE_URL before Next boots, so there's nothing to copy by hand.
 *
 * Prereqs (free, one-time):
 *   brew install ngrok
 *   ngrok config add-authtoken <token from dashboard.ngrok.com>
 */
import { spawn, spawnSync } from "child_process";
import { promises as fs } from "fs";
import path from "path";

const PORT = 8000;
const ENV_FILE = path.join(process.cwd(), ".env.local");

function haveNgrok(): boolean {
  return spawnSync("ngrok", ["version"], { stdio: "ignore" }).status === 0;
}

async function fetchPublicUrl(): Promise<string> {
  // ngrok exposes its tunnels on a local API once it's up.
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      const data = (await res.json()) as { tunnels: Array<{ public_url: string }> };
      const https = data.tunnels.find((t) => t.public_url.startsWith("https://"));
      if (https) return https.public_url;
    } catch {
      /* ngrok not ready yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timed out waiting for ngrok. Is it installed and authed?");
}

async function setEnv(url: string): Promise<void> {
  let text = "";
  try {
    text = await fs.readFile(ENV_FILE, "utf8");
  } catch {
    /* no .env.local yet */
  }
  const line = `PUBLIC_BASE_URL=${url}`;
  text = /^PUBLIC_BASE_URL=.*$/m.test(text)
    ? text.replace(/^PUBLIC_BASE_URL=.*$/m, line)
    : `${text.trimEnd()}\n${line}\n`;
  await fs.writeFile(ENV_FILE, text);
}

async function main() {
  if (!haveNgrok()) {
    console.error(
      "ngrok not found. Install it:\n  brew install ngrok\n" +
        "  ngrok config add-authtoken <token from dashboard.ngrok.com>",
    );
    process.exit(1);
  }

  const ngrok = spawn("ngrok", ["http", String(PORT)], { stdio: "ignore" });

  let next: ReturnType<typeof spawn> | null = null;
  const shutdown = () => {
    next?.kill();
    ngrok.kill();
    process.exit();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    const url = await fetchPublicUrl();
    await setEnv(url);
    console.log(`\n🔗 Public URL: ${url}`);
    console.log("   (written to .env.local as PUBLIC_BASE_URL)\n");
    console.log("   Vapi webhook: " + url + "/api/webhooks/vapi\n");

    next = spawn("npx", ["next", "dev", "-p", String(PORT)], { stdio: "inherit" });
    next.on("exit", shutdown);
  } catch (e) {
    console.error(String(e));
    shutdown();
  }
}

main();
