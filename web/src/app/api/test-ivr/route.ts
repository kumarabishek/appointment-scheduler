/** A fake doctor's-office IVR for testing the agent's phone-tree navigation.
 *
 * Point a Twilio number's "A call comes in" webhook at:
 *   https://<your-ngrok>/api/test-ivr
 * Then place a scheduler call with providerPhone = that Twilio number. Twilio
 * fetches this TwiML (the top-level menu); each keypress is resolved by
 * /api/test-ivr/handle-key, which walks the nested menus in src/lib/testIvr.ts.
 *
 * To rehearse a failure mode instead of the happy path, answer on a different
 * menu: set TEST_IVR_START_MENU=records|account|machine, or append ?menu=... to
 * the webhook URL. Unknown names fall back to "main".
 *
 * Returns TwiML (XML), not JSON.
 */
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { renderMenu, twimlResponse } from "@/lib/testIvr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which menu to answer on: ?menu= wins (handy for a one-off rehearsal without
// restarting), else TEST_IVR_START_MENU, else the normal top-level menu.
// renderMenu falls back to "main" on an unknown name, so a typo can't 500.
function startMenu(req: NextRequest): string {
  return req.nextUrl.searchParams.get("menu") || config.testIvrStartMenu || "main";
}

// Off unless explicitly enabled — this route is public and would otherwise leak
// the operator number / act as a bridge to ring it.
const menu = (req: NextRequest) =>
  config.testIvrEnabled
    ? twimlResponse(renderMenu(startMenu(req)))
    : NextResponse.json({ error: "not found" }, { status: 404 });

export const GET = (req: NextRequest) => menu(req);
export const POST = (req: NextRequest) => menu(req);
