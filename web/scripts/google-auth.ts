/** One-time helper: mint a Google Calendar refresh token.
 *
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... npm run google-auth
 *
 * Opens a consent URL, catches the redirect on http://localhost:5858, and
 * prints the refresh token to paste into .env.local as GOOGLE_REFRESH_TOKEN.
 *
 * Setup in Google Cloud Console first:
 *  - Enable the Google Calendar API
 *  - Create an OAuth 2.0 Client ID (type: Web application)
 *  - Add http://localhost:5858/oauth2callback as an authorized redirect URI
 */
import http from "http";
import { google } from "googleapis";

const PORT = 5858;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the environment.");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT);
const authUrl = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // force a refresh_token every time
  scope: ["https://www.googleapis.com/auth/calendar.events"],
});

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith("/oauth2callback")) {
    res.writeHead(404).end();
    return;
  }
  const code = new URL(req.url, REDIRECT).searchParams.get("code");
  if (!code) {
    res.writeHead(400).end("Missing code");
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Got it. You can close this tab and return to the terminal.");
    console.log("\n✅ Add this to .env.local:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (e) {
    res.writeHead(500).end("Token exchange failed");
    console.error(e);
  } finally {
    server.close();
  }
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser to authorize:\n");
  console.log(authUrl + "\n");
});
