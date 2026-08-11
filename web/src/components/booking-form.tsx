"use client";

import { useEffect, useMemo, useState } from "react";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABEL: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};
const URGENCY_LABEL: Record<string, string> = {
  routine: "Routine",
  soon: "Soon (this week)",
  urgent: "Urgent (ASAP)",
};

// 24h "HH:MM" -> "8:00AM"
function to12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m || 0).padStart(2, "0")}${ap}`;
}

function daysSummary(days: string[]): string {
  const wk = ["mon", "tue", "wed", "thu", "fri"];
  if (wk.every((d) => days.includes(d)) && !days.includes("sat") && !days.includes("sun")) {
    return "Mon–Fri";
  }
  const on = DAYS.filter((d) => days.includes(d)).map((d) => DAY_LABEL[d]);
  return on.length ? on.join(", ") : "No days set";
}

export function BookingForm({ onSubmitted }: { onSubmitted: () => Promise<void> | void }) {
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
    preferredProvider: "",
    urgency: "routine",
    timezone: "",
    days: ["mon", "tue", "wed", "thu", "fri"] as string[],
    earliest: "08:00",
    latest: "11:00",
    notBeforeDate: "",
    notAfterDate: "",
    allowOutsideWindows: false,
    extraNotes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleDay(d: string) {
    set("days", form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);
  }

  useEffect(() => {
    try {
      set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      /* leave blank; server falls back */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(
    () => `${daysSummary(form.days)} · ${to12(form.earliest)}–${to12(form.latest)} · ${URGENCY_LABEL[form.urgency]}`,
    [form.days, form.earliest, form.latest, form.urgency],
  );

  // Timezone select: common zones plus whatever the browser detected.
  const tzOptions = useMemo(() => {
    const base = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York"];
    return form.timezone && !base.includes(form.timezone) ? [form.timezone, ...base] : base;
  }, [form.timezone]);

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
      preferredProvider: form.preferredProvider || null,
      urgency: form.urgency,
      timezone: form.timezone || null,
      extraNotes: form.extraNotes || null,
      allowOutsideWindows: form.allowOutsideWindows,
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
      if (!res.ok) setError(data.error || "Failed to place call.");
      else await onSubmitted();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="panel-head">
        <span className="eyebrow">NEW BOOKING</span>
      </div>

      {/* 01 — Who */}
      <div className="section">
        <div className="section-head">
          <div className="num">01</div>
          <div>
            <div className="section-title">Who&apos;s this for?</div>
            <div className="section-sub">Patient on record at the office</div>
          </div>
        </div>
        <div className="col">
          <div className="field">
            <label>Patient name</label>
            <input
              value={form.patientName}
              onChange={(e) => set("patientName", e.target.value)}
              placeholder="Full name"
              required
            />
          </div>
          <div className="two">
            <div className="field">
              <label>Date of birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => set("dateOfBirth", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>Your relationship</label>
              <select
                value={form.callerRelationship}
                onChange={(e) => set("callerRelationship", e.target.value)}
              >
                <option value="self">Self</option>
                <option value="parent / guardian">Parent / guardian</option>
                <option value="child">Child</option>
                <option value="spouse / partner">Spouse / partner</option>
                <option value="caregiver">Caregiver</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 02 — Insurance */}
      <div className="section">
        <div className="section-head">
          <div className="num">02</div>
          <div>
            <div className="section-title">Insurance</div>
            <div className="section-sub">So the agent can verify coverage on the call</div>
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label>Provider</label>
            <input
              value={form.insuranceProvider}
              onChange={(e) => set("insuranceProvider", e.target.value)}
              placeholder="e.g. Blue Shield"
            />
          </div>
          <div className="field">
            <label>Member ID</label>
            <input
              value={form.insuranceMemberId}
              onChange={(e) => set("insuranceMemberId", e.target.value)}
              placeholder="ID on your card"
            />
          </div>
        </div>
      </div>

      {/* 03 — Office */}
      <div className="section">
        <div className="section-head">
          <div className="num">03</div>
          <div>
            <div className="section-title">Office to call</div>
            <div className="section-sub">The clinic, lab, or provider we&apos;ll dial</div>
          </div>
        </div>
        <div className="col">
          <div className="two-wide">
            <div className="field">
              <label>Office / provider name</label>
              <input
                value={form.providerName}
                onChange={(e) => set("providerName", e.target.value)}
                placeholder="e.g. Bay Area Family Medicine"
                required
              />
            </div>
            <div className="field">
              <label>Office phone</label>
              <input
                value={form.providerPhone}
                onChange={(e) => set("providerPhone", e.target.value)}
                placeholder="+1…"
                required
              />
            </div>
          </div>
          <div className="field">
            <label>
              Office timezone <span className="hint">— auto-detected</span>
            </label>
            <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 04 — Reason & urgency */}
      <div className="section">
        <div className="section-head">
          <div className="num">04</div>
          <div>
            <div className="section-title">Reason &amp; urgency</div>
            <div className="section-sub">What to book, and how soon</div>
          </div>
        </div>
        <div className="col">
          <div className="field">
            <label>Reason for visit</label>
            <input
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="e.g. fasting blood test"
              required
            />
          </div>
          <div className="two">
            <div className="field">
              <label>
                Preferred doctor <span className="hint">(optional)</span>
              </label>
              <input
                value={form.preferredProvider}
                onChange={(e) => set("preferredProvider", e.target.value)}
                placeholder="e.g. Dr. Chan — else any"
              />
            </div>
            <div className="field">
              <label>Urgency</label>
              <select value={form.urgency} onChange={(e) => set("urgency", e.target.value)}>
                <option value="routine">Routine</option>
                <option value="soon">Soon (this week)</option>
                <option value="urgent">Urgent (ASAP)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 05 — When */}
      <div className="section">
        <div className="section-head">
          <div className="num">05</div>
          <div>
            <div className="section-title">When works for you?</div>
            <div className="section-sub">The agent only books inside these limits</div>
          </div>
        </div>
        <div className="col">
          <div>
            <div className="fieldlabel">Acceptable days</div>
            <div className="days">
              {DAYS.map((d) => (
                <div
                  key={d}
                  className={`daychip${form.days.includes(d) ? " on" : ""}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="two">
            <div className="field">
              <label>Earliest time</label>
              <input
                type="time"
                value={form.earliest}
                onChange={(e) => set("earliest", e.target.value || "08:00")}
              />
            </div>
            <div className="field">
              <label>Latest time</label>
              <input
                type="time"
                value={form.latest}
                onChange={(e) => set("latest", e.target.value || "11:00")}
              />
            </div>
          </div>
          <div className="two">
            <div className="field">
              <label>Not before</label>
              <input
                type="date"
                value={form.notBeforeDate}
                onChange={(e) => set("notBeforeDate", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Not after</label>
              <input
                type="date"
                value={form.notAfterDate}
                onChange={(e) => set("notAfterDate", e.target.value)}
              />
            </div>
          </div>
          <div>
            <div className="fieldlabel">If nothing fits these hours</div>
            <div className="days">
              <div
                className={`daychip${!form.allowOutsideWindows ? " on" : ""}`}
                onClick={() => set("allowOutsideWindows", false)}
              >
                decline politely
              </div>
              <div
                className={`daychip${form.allowOutsideWindows ? " on" : ""}`}
                onClick={() => set("allowOutsideWindows", true)}
              >
                book closest time anyway
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 06 — Reaching you */}
      <div className="section">
        <div className="section-head">
          <div className="num">06</div>
          <div>
            <div className="section-title">Reaching you</div>
            <div className="section-sub">Only if the agent gets stuck</div>
          </div>
        </div>
        <div className="col">
          <div className="field">
            <label>Callback number</label>
            <input
              value={form.callbackNumber}
              onChange={(e) => set("callbackNumber", e.target.value)}
              placeholder="+1…"
            />
          </div>
          <div className="field">
            <label>
              Notes <span className="hint">(optional)</span>
            </label>
            <textarea
              value={form.extraNotes}
              onChange={(e) => set("extraNotes", e.target.value)}
              rows={3}
              placeholder="Anything the agent should mention or ask…"
            />
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-wrap">
        <div className="window">
          <span className="label">Booking window:</span>
          <span className="val">{summary}</span>
        </div>
        <button className="cta" disabled={submitting}>
          {submitting ? "Placing call…" : "Call & book"}
        </button>
        {error && <div className="err">{error}</div>}
      </div>
    </form>
  );
}
