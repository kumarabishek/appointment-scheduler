/** Owner decisions for edge cases — DB-backed so it survives serverless.
 *
 * When the agent hits a slot outside your green zone, the webhook (one
 * invocation) polls the DB while you tap a choice in the push notification. Your
 * tap (the /decide route — a SEPARATE invocation) writes the choice to the
 * call's `decision` column; the webhook's poll picks it up and books it.
 *
 * The old in-memory Map only worked in a single Node process; this works across
 * instances (Vercel/serverless), at the cost of ~1 DB read/sec while holding.
 */
import { prisma } from "./db";

export type Decision = { choice: string };

const POLL_MS = 1000;

/** True while the call is still awaiting the owner's tap (no decision yet). */
export async function isPending(key: string): Promise<boolean> {
  const row = await prisma.call.findUnique({
    where: { id: key },
    select: { status: true, decision: true },
  });
  return !!row && row.status === "awaiting_confirmation" && !row.decision;
}

/** Record the owner's tap. Returns false if the window already closed. */
export async function resolveDecision(key: string, decision: Decision): Promise<boolean> {
  if (!(await isPending(key))) return false;
  await prisma.call.update({
    where: { id: key },
    data: { decision: JSON.stringify(decision) },
  });
  return true;
}

/** Webhook side: poll until the owner taps or we time out. Consumes the
 *  decision (clears the column) so it can't be read twice. */
export async function waitForDecision(
  key: string,
  timeoutMs: number,
): Promise<Decision | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.call.findUnique({
      where: { id: key },
      select: { decision: true },
    });
    if (row?.decision) {
      await prisma.call.update({ where: { id: key }, data: { decision: null } });
      try {
        return JSON.parse(row.decision) as Decision;
      } catch {
        return null;
      }
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
