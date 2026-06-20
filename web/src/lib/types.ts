import { z } from "zod";
import { randomBytes } from "crypto";

export function id(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

/** Who the appointment is for. Keep sensitive fields minimal. */
export const Patient = z.object({
  name: z.string().min(1),
  dateOfBirth: z.string(), // YYYY-MM-DD
  // Relationship of the *caller* (you) to the patient, e.g. "self", "son".
  callerRelationship: z.string().default("self"),
  insuranceProvider: z.string().nullish(),
  insuranceMemberId: z.string().nullish(),
  callbackNumber: z.string().nullish(),
});
export type Patient = z.infer<typeof Patient>;

/** An acceptable range. Days are lowercase short names; times are HH:MM 24h. */
export const TimeWindow = z.object({
  days: z.array(z.string()).default([]), // e.g. ["mon","tue"]
  earliest: z.string().default("08:00"),
  latest: z.string().default("18:00"),
  notBeforeDate: z.string().nullish(), // YYYY-MM-DD
  notAfterDate: z.string().nullish(),
});
export type TimeWindow = z.infer<typeof TimeWindow>;

export const AppointmentRequest = z.object({
  id: z.string().default(() => id("req")),
  patient: Patient,
  providerName: z.string().min(1),
  providerPhone: z.string().min(1), // E.164, e.g. +14155550123
  reason: z.string().min(1),
  // IANA zone the office's spoken times are in (= where the clinic is).
  // Auto-detected from the booker's browser; editable for out-of-zone bookings.
  timezone: z.string().nullish(),
  visitType: z.string().default("new or existing — let office decide"),
  preferredProvider: z.string().nullish(),
  acceptableWindows: z.array(TimeWindow).default([]),
  urgency: z.enum(["routine", "soon", "urgent"]).default("routine"),
  extraNotes: z.string().nullish(),
  createdAt: z.string().default(() => new Date().toISOString()),
});
export type AppointmentRequest = z.infer<typeof AppointmentRequest>;

/** A slot the office offered during the call. */
export const OfferedSlot = z.object({
  startsAt: z.string(), // human/ISO string as spoken by the office
  provider: z.string().nullish(),
  location: z.string().nullish(),
  notes: z.string().nullish(),
});
export type OfferedSlot = z.infer<typeof OfferedSlot>;

export const CallStatus = z.enum([
  "pending", // call placed, in progress
  "awaiting_confirmation", // edge case: pushed to you, holding the line
  "confirmed", // a slot is approved to book
  "booked", // office confirmed the booking
  "no_slots",
  "failed",
  "escalated", // needs a human to take the live call
]);
export type CallStatus = z.infer<typeof CallStatus>;

export const CallRecord = z.object({
  id: z.string().default(() => id("call")),
  request: AppointmentRequest,
  vapiCallId: z.string().nullish(),
  status: CallStatus.default("pending"),
  offeredSlots: z.array(OfferedSlot).default([]),
  chosenSlot: OfferedSlot.nullish(),
  transcriptSummary: z.string().nullish(),
  updatedAt: z.string().default(() => new Date().toISOString()),
});
export type CallRecord = z.infer<typeof CallRecord>;
