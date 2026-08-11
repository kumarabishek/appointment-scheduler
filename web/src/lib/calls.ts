// Mirrors the CallDTO returned by /api/calls (display-only, no PHI like DOB,
// insurance, callback, or notes).
export type Call = {
  id: string;
  status: string;
  providerName: string;
  reason: string;
  chosenSlot: { startsAt: string } | null;
  transcriptSummary: string | null;
  updatedAt: string;
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Calling",
  awaiting_confirmation: "Needs you",
  confirmed: "Booking",
  booked: "Booked",
  no_slots: "No slots",
  failed: "Failed",
  escalated: "Needs you",
};

export const LIVE = new Set(["pending", "confirmed"]);
export const BAD = new Set(["failed", "no_slots", "escalated"]);
