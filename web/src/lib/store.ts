/** Postgres-backed store for call records (Prisma + Neon).
 *
 * The full CallRecord is JSON-encoded into the `data` column with insurance
 * (PHI) fields AES-encrypted; denormalized columns (id, requestId, vapiCallId,
 * status) back the lookups. Works on serverless (unlike the old JSON file).
 */
import { decryptField, encryptField } from "./crypto";
import { prisma } from "./db";
import { CallRecord } from "./types";

/** Return a copy of the record with insurance fields transformed (encrypt on
 *  the way to the DB, decrypt on the way back). Never mutates the input — callers
 *  keep the in-memory plaintext they need to place the call. */
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

/** Decode a stored row's JSON into a plaintext CallRecord. */
function fromRow(data: string): CallRecord {
  return mapInsurance(CallRecord.parse(JSON.parse(data)), decryptField);
}

export async function save(record: CallRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();
  // Persist with insurance encrypted; the caller's object stays plaintext.
  const data = JSON.stringify(mapInsurance(record, encryptField));
  const fields = {
    requestId: record.request.id,
    vapiCallId: record.vapiCallId ?? null,
    status: record.status,
    data,
  };
  await prisma.call.upsert({
    where: { id: record.id },
    create: { id: record.id, ...fields },
    update: fields,
  });
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

export async function all(): Promise<CallRecord[]> {
  const rows = await prisma.call.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map((r) => fromRow(r.data));
}
