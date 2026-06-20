/** A fake doctor's-office IVR for testing the agent's phone-tree navigation.
 *
 * Point a Twilio number's "A call comes in" webhook at:
 *   https://<your-ngrok>/api/test-ivr
 * Then place a scheduler call with providerPhone = that Twilio number. Twilio
 * fetches this TwiML (the top-level menu); each keypress is resolved by
 * /api/test-ivr/handle-key, which walks the nested menus in src/lib/testIvr.ts.
 *
 * Returns TwiML (XML), not JSON.
 */
import { renderMenu, twimlResponse } from "@/lib/testIvr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const menu = () => twimlResponse(renderMenu("main"));

export const GET = () => menu();
export const POST = () => menu();
