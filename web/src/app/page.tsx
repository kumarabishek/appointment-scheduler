"use client";

import { useEffect, useState } from "react";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type Slot = { startsAt: string; provider?: string | null };
type Call = {
  id: string;
  status: string;
  request: { patient: { name: string }; providerName: string; reason: string };
  chosenSlot?: Slot | null;
  offeredSlots: Slot[];
  transcriptSummary?: string | null;
  updatedAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Calling…",
  awaiting_confirmation: "Needs your tap",
  confirmed: "Booking…",
  booked: "Booked",
  no_slots: "No slots",
  failed: "Failed",
  escalated: "Needs you",
};

export default function Home() {
  const [form, setForm] = useState({
    patientName: "",
    dateOfBirth: "",
    callerRelationship: "self",
    insuranceProvider: "",
    insuranceMemberId: "",
    callbackNumber: "",
    providerName: "",
    providerPhone: "",
    reason: "",
    urgency: "routine",
    timezone: "",
    days: ["mon", "tue", "wed", "thu", "fri"] as string[],
    earliest: "08:00",
    latest: "11:00",
    notBeforeDate: "",
    notAfterDate: "",
    extraNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [calls, setCalls] = useState<Call[]>([]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleDay(d: string) {
    set("days", form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);
  }

  async function refresh() {
    try {
      const res = await fetch("/api/calls");
      const data = await res.json();
      setCalls(data.calls ?? []);
    } catch {
      /* ignore transient fetch errors */
    }
  }
  useEffect(() => {
    // Auto-detect the booker's timezone (= the clinic's, in the common case).
    try {
      set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* leave blank; server falls back */
    }
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const body = {
      patient: {
        name: form.patientName,
        dateOfBirth: form.dateOfBirth,
        callerRelationship: form.callerRelationship,
        insuranceProvider: form.insuranceProvider || null,
        insuranceMemberId: form.insuranceMemberId || null,
        callbackNumber: form.callbackNumber || null,
      },
      providerName: form.providerName,
      providerPhone: form.providerPhone,
      reason: form.reason,
      urgency: form.urgency,
      timezone: form.timezone || null,
      extraNotes: form.extraNotes || null,
      acceptableWindows: [
        {
          days: form.days,
          earliest: form.earliest,
          latest: form.latest,
          notBeforeDate: form.notBeforeDate || null,
          notAfterDate: form.notAfterDate || null,
        },
      ],
    };
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.detail || data.error || "Failed to place call.");
      else await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="wrap">
      <h1>Appointment Scheduler</h1>
      <p className="sub">
        The agent calls the office, books a time that fits your rules, and only
        pings you if nothing fits.
      </p>

      <div className="grid">
        <form className="panel" onSubmit={submit}>
          <h2>New booking</h2>

          <label>Patient name</label>
          <input value={form.patientName} onChange={(e) => set("patientName", e.target.value)} required />

          <div className="row">
            <div>
              <label>Date of birth</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} required />
            </div>
            <div>
              <label>Your relationship</label>
              <input value={form.callerRelationship} onChange={(e) => set("callerRelationship", e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Insurance provider</label>
              <input value={form.insuranceProvider} onChange={(e) => set("insuranceProvider", e.target.value)} />
            </div>
            <div>
              <label>Member ID</label>
              <input value={form.insuranceMemberId} onChange={(e) => set("insuranceMemberId", e.target.value)} />
            </div>
          </div>

          <label>Callback number</label>
          <input value={form.callbackNumber} onChange={(e) => set("callbackNumber", e.target.value)} placeholder="+1…" />

          <div className="row">
            <div>
              <label>Office / provider name</label>
              <input value={form.providerName} onChange={(e) => set("providerName", e.target.value)} required />
            </div>
            <div>
              <label>Office phone</label>
              <input value={form.providerPhone} onChange={(e) => set("providerPhone", e.target.value)} placeholder="+1…" required />
            </div>
          </div>

          <label>Reason for visit</label>
          <input value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. fasting blood test" required />

          <label>Urgency</label>
          <select value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
            <option value="routine">Routine</option>
            <option value="soon">Soon</option>
            <option value="urgent">Urgent</option>
          </select>

          <label>Office timezone (auto-detected — change if the clinic is elsewhere)</label>
          <input
            value={form.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            placeholder="e.g. America/New_York"
          />

          <label>Acceptable days</label>
          <div className="days">
            {DAYS.map((d) => (
              <button type="button" key={d} className={form.days.includes(d) ? "on" : ""} onClick={() => toggleDay(d)}>
                {d}
              </button>
            ))}
          </div>

          <div className="row">
            <div>
              <label>Earliest time</label>
              <input type="time" value={form.earliest} onChange={(e) => set("earliest", e.target.value)} />
            </div>
            <div>
              <label>Latest time</label>
              <input type="time" value={form.latest} onChange={(e) => set("latest", e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div>
              <label>Not before (date)</label>
              <input type="date" value={form.notBeforeDate} onChange={(e) => set("notBeforeDate", e.target.value)} />
            </div>
            <div>
              <label>Not after (date)</label>
              <input type="date" value={form.notAfterDate} onChange={(e) => set("notAfterDate", e.target.value)} />
            </div>
          </div>

          <label>Notes (optional)</label>
          <textarea value={form.extraNotes} onChange={(e) => set("extraNotes", e.target.value)} rows={2} />

          <button className="primary" disabled={submitting}>
            {submitting ? "Placing call…" : "Call & book"}
          </button>
          {error && <div className="err">{error}</div>}
        </form>

        <div className="panel">
          <h2>Calls</h2>
          {calls.length === 0 ? (
            <div className="empty">No calls yet. Submit a booking to start.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient / office</th>
                  <th>Status</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.request.patient.name}</strong>
                      <br />
                      <span style={{ color: "var(--muted)" }}>{c.request.providerName}</span>
                    </td>
                    <td>
                      <span className={`badge s-${c.status}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
                    </td>
                    <td>
                      {c.chosenSlot ? (
                        <strong>{c.chosenSlot.startsAt}</strong>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>{c.transcriptSummary ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
