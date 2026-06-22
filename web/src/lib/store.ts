/** Postgres-backed store for call records (Prisma + Neon).
 *
 * The ENTIRE CallRecord JSON is AES-encrypted into the `data` column — name,
 * DOB, callback, reason, notes, insurance, chosen slot, transcript summary, all
 * of it (it's all sensitive for a medical scheduler). Only non-PHI denormalized
 * columns (id, requestId, vapiCallId, status, userId) are stored in the clear,
 * for lookups. Works on serverless (unlike the old JSON file).
 */
import { decryptField, encryptField } from "./crypto";
import { prisma } from "./db";
import { CallRecord } from "./types";

/** Return a copy with insurance fields transformed — kept only for backward
 *  compat with LEGACY rows where the blob was plaintext but insurance was
 *  field-encrypted. New rows encrypt the whole blob, so these are already
 *  plaintext and decryptField is a no-op. */
function mapInsurance(
  rec: CallRecord,
  fn: <T extends string | null | undefined>(v: T) => T,
): CallRecord {
  const p = rec.request.patient;
  return {
    ...rec,
    request: {
      ...rec.request,
      patient: {
        ...p,
        insuranceProvider: fn(p.insuranceProvider),
        insuranceMemberId: fn(p.insuranceMemberId),
      },
    },
  };
}

/** Decode a stored row into a plaintext CallRecord. Decrypts the whole blob
 *  (new format); the trailing mapInsurance handles legacy field-encrypted rows. */
function fromRow(data: string): CallRecord {
  const json = decryptField(data);
  return mapInsurance(CallRecord.parse(JSON.parse(json)), decryptField);
}

/** Save a call. `userId` (the owning Clerk user) is required when CREATING a
 *  record (i.e. from /api/requests). On later updates (e.g. the webhook, which
 *  has no user session) omit it — the existing owner is preserved. */
export async function save(record: CallRecord, userId?: string): Promise<void> {
  record.updatedAt = new Date().toISOString();
  // Encrypt the entire record JSON at rest (all PHI, not just insurance).
  const data = encryptField(JSON.stringify(record));
  const fields = {
    requestId: record.request.id,
    vapiCallId: record.vapiCallId ?? null,
    status: record.status,
    data,
  };
  await prisma.call.upsert({
    where: { id: record.id },
    // userId only set on create; updates never change ownership.
    create: { id: record.id, userId: userId ?? "", ...fields },
    update: fields,
  });
}

/** How many calls a user has created since `since` (for rate limiting). */
export async function countCallsSince(userId: string, since: Date): Promise<number> {
  return prisma.call.count({ where: { userId, createdAt: { gte: since } } });
}

/** The Clerk user who owns a call (or null). Used for ownership checks. */
export async function ownerOf(callId: string): Promise<string | null> {
  const row = await prisma.call.findUnique({
    where: { id: callId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export async function get(callId: string): Promise<CallRecord | null> {
  const row = await prisma.call.findUnique({ where: { id: callId } });
  return row ? fromRow(row.data) : null;
}

export async function getByVapiId(vapiCallId: string): Promise<CallRecord | null> {
  const row = await prisma.call.findUnique({ where: { vapiCallId } });
  return row ? fromRow(row.data) : null;
}

export async function getByRequestId(requestId: string): Promise<CallRecord | null> {
  const row = await prisma.call.findUnique({ where: { requestId } });
  return row ? fromRow(row.data) : null;
}

/** Records owned by a specific Clerk user, newest first. */
export async function all(userId: string): Promise<CallRecord[]> {
  const rows = await prisma.call.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((r) => fromRow(r.data));
}

/** Display-only view of a call for the dashboard. Deliberately omits DOB,
 *  insurance, callback number, and notes — the UI never renders them, so they
 *  stay server-side and never travel over the wire. */
export type CallDTO = {
  id: string;
  status: string;
  providerName: string;
  reason: string;
  chosenSlot: { startsAt: string } | null;
  transcriptSummary: string | null;
  updatedAt: string;
};

export function toDTO(rec: CallRecord): CallDTO {
  return {
    id: rec.id,
    status: rec.status,
    providerName: rec.request.providerName,
    reason: rec.request.reason,
    chosenSlot: rec.chosenSlot ? { startsAt: rec.chosenSlot.startsAt } : null,
    transcriptSummary: rec.transcriptSummary ?? null,
    updatedAt: rec.updatedAt,
  };
}

/** DTOs for a user's calls — the only shape the dashboard endpoint should return. */
export async function allDTO(userId: string): Promise<CallDTO[]> {
  return (await all(userId)).map(toDTO);
}
