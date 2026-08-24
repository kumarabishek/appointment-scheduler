"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LEGACY_PREFILL_KEY, persistable, prefillKey, restorable } from "@/lib/prefill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const EMPTY_FORM = {
  patientName: "",
  dateOfBirth: "",
  postalCode: "",
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
};
type FormState = typeof EMPTY_FORM;

// Patient details are remembered on this device between sessions; the office,
// doctor and insurance member ID are not (see NEVER_REMEMBERED). Scoped per
// signed-in user, so a
// second person on the same browser gets a blank form rather than the first
// person's patient. localStorage — cleared by the browser, never sent anywhere.
function loadPrefill(userId: string): Partial<FormState> | null {
  try {
    // Drop the pre-scoping blob wherever it still exists: it can't be
    // attributed to anyone, so it must not be handed to whoever signs in.
    localStorage.removeItem(LEGACY_PREFILL_KEY);
    const raw = localStorage.getItem(prefillKey(userId));
    if (!raw) return null;
    return restorable(JSON.parse(raw) as Record<string, unknown>, EMPTY_FORM);
  } catch {
    return null;
  }
}

function savePrefill(userId: string, form: FormState) {
  try {
    localStorage.setItem(prefillKey(userId), JSON.stringify(persistable(form)));
  } catch {
    /* prefill is best-effort */
  }
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return ""; // leave blank; server falls back
  }
}


const STEPS = [
  { title: "Who's this for?", sub: "The patient on record at the office" },
  { title: "Which office should we call?", sub: "The clinic, lab, or provider the agent will dial" },
  { title: "What's the visit for?", sub: "What to book, and how soon" },
  { title: "When works for you?", sub: "The agent only books inside these limits" },
  {
    title: "Insurance",
    sub: "So the agent can verify coverage if the office asks — skip if you'd rather give it at check-in",
    optional: true,
  },
  { title: "Review & book", sub: "One last look before the agent dials" },
];

function Chip({
  on,
  onClick,
  children,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-2 py-2.5 text-[13px] font-semibold transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-input bg-muted/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>
        {label} {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="truncate text-sm font-medium">{value}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="flex-none text-xs font-semibold text-primary hover:underline"
      >
        Edit
      </button>
    </div>
  );
}

export function BookingForm({ onSubmitted }: { onSubmitted: () => Promise<void> | void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { isLoaded, userId } = useAuth();
  const stepRef = useRef<HTMLDivElement>(null);

  // Re-focus the step's first input after each transition so Enter always
  // advances. The review step is deliberately left unfocused: a stray
  // double-Enter must not place a call.
  useEffect(() => {
    if (step === STEPS.length - 1) return;
    stepRef.current?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
  }, [step]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleDay(d: string) {
    set("days", form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d]);
  }

  // Which user's saved details are currently in `form`. Gates the save effect:
  // a plain "have we hydrated yet" boolean isn't enough, because hydration now
  // waits on Clerk and can land several renders after mount — so the save
  // effect could otherwise run first and write EMPTY_FORM over stored details.
  // Tracking WHO also makes a user switch self-correcting: the id stops
  // matching, so the form re-hydrates from the new user and saving is blocked
  // until it does.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !userId || hydratedFor === userId) return;
    // Reset from EMPTY_FORM rather than merging into the existing form, so a
    // switch of user can't leave the previous patient's values behind.
    const prefill = loadPrefill(userId);
    setForm({ ...EMPTY_FORM, ...prefill, timezone: detectTimezone() });
    setHydratedFor(userId);
  }, [isLoaded, userId, hydratedFor]);

  // Persist as you type, not just on a successful booking — otherwise patient
  // details entered in a session that never placed a call are lost, which is
  // exactly the retyping this is meant to remove.
  useEffect(() => {
    if (!userId || hydratedFor !== userId) return;
    savePrefill(userId, form);
  }, [form, userId, hydratedFor]);

  const summary = useMemo(
    () => `${daysSummary(form.days)} · ${to12(form.earliest)}–${to12(form.latest)} · ${URGENCY_LABEL[form.urgency]}`,
    [form.days, form.earliest, form.latest, form.urgency],
  );

  // Timezone select: common zones plus whatever the browser detected.
  const tzOptions = useMemo(() => {
    const base = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York"];
    return form.timezone && !base.includes(form.timezone) ? [form.timezone, ...base] : base;
  }, [form.timezone]);

  function goTo(next: number) {
    setStep(next);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submitAll() {
    setSubmitting(true);
    const body = {
      patient: {
        name: form.patientName,
        dateOfBirth: form.dateOfBirth,
        postalCode: form.postalCode || null,
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
      if (!res.ok) {
        toast.error(data.error || "Failed to place call.");
      } else {
        toast.success("Call placed — the agent is dialing the office.");
        goTo(0);
        await onSubmitted();
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function advance(e: React.FormEvent) {
    e.preventDefault();
    if (step === 3 && form.days.length === 0) {
      toast.error("Pick at least one acceptable day.");
      return;
    }
    if (step < STEPS.length - 1) goTo(step + 1);
    else submitAll();
  }

  const { title, sub } = STEPS[step];

  return (
    <Card ref={cardRef} className="scroll-mt-6 overflow-hidden pt-0">
      {/* progress */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <CardContent className="px-6 pb-8 pt-8 sm:px-10">
        <form onSubmit={advance}>
          {/* step header — re-animates on step change */}
          <div key={step} ref={stepRef} className="animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="mb-1 font-mono text-xs font-semibold tracking-widest text-primary">
              {step + 1} / {STEPS.length}
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">{title}</h2>
            <p className="mb-7 mt-1.5 text-sm text-muted-foreground">{sub}</p>

            {/* -------- Step 1: Who -------- */}
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <Field label="Patient name">
                  <Input
                    value={form.patientName}
                    onChange={(e) => set("patientName", e.target.value)}
                    placeholder="Full name"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Date of birth">
                    <Input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => set("dateOfBirth", e.target.value)}
                      required
                    />
                  </Field>
                  {/* Offices verify on date of birth AND a second field — 
                      usually the zip on file. Without it the agent can stall
                      at the verification gate before it ever reaches booking. */}
                  <Field label="Zip code">
                    <Input
                      inputMode="numeric"
                      value={form.postalCode}
                      onChange={(e) => set("postalCode", e.target.value)}
                      placeholder="On file with the office"
                      required
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Your relationship">
                    <Select
                      value={form.callerRelationship}
                      onValueChange={(v) => v != null && set("callerRelationship", v)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Self</SelectItem>
                        <SelectItem value="parent / guardian">Parent / guardian</SelectItem>
                        <SelectItem value="child">Child</SelectItem>
                        <SelectItem value="spouse / partner">Spouse / partner</SelectItem>
                        <SelectItem value="caregiver">Caregiver</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {/* -------- Step 2: Office -------- */}
            {step === 1 && (
              <div className="flex flex-col gap-4">
                <Field label="Office / provider name">
                  <Input
                    value={form.providerName}
                    onChange={(e) => set("providerName", e.target.value)}
                    placeholder="e.g. Bay Area Family Medicine"
                    required
                  />
                </Field>
                <Field label="Office phone">
                  <Input
                    value={form.providerPhone}
                    onChange={(e) => set("providerPhone", e.target.value)}
                    placeholder="+1…"
                    required
                  />
                </Field>
                <Field label="Office timezone" hint="— auto-detected">
                  <Select value={form.timezone} onValueChange={(v) => v != null && set("timezone", v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tzOptions.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {/* -------- Step 3: Reason -------- */}
            {step === 2 && (
              <div className="flex flex-col gap-4">
                <Field label="Reason for visit">
                  <Input
                    value={form.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    placeholder="e.g. fasting blood test"
                    required
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Preferred doctor" hint="(optional)">
                    <Input
                      value={form.preferredProvider}
                      onChange={(e) => set("preferredProvider", e.target.value)}
                      placeholder="e.g. Dr. Chan — else any"
                    />
                  </Field>
                  <Field label="Urgency">
                    <Select value={form.urgency} onValueChange={(v) => v != null && set("urgency", v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="routine">Routine</SelectItem>
                        <SelectItem value="soon">Soon (this week)</SelectItem>
                        <SelectItem value="urgent">Urgent (ASAP)</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>
            )}

            {/* -------- Step 4: When -------- */}
            {step === 3 && (
              <div className="flex flex-col gap-4">
                <Field label="Acceptable days">
                  <div className="flex gap-2">
                    {DAYS.map((d) => (
                      <Chip key={d} on={form.days.includes(d)} onClick={() => toggleDay(d)} className="lowercase">
                        {d}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Earliest time">
                    <Input
                      type="time"
                      value={form.earliest}
                      onChange={(e) => set("earliest", e.target.value || "08:00")}
                    />
                  </Field>
                  <Field label="Latest time">
                    <Input
                      type="time"
                      value={form.latest}
                      onChange={(e) => set("latest", e.target.value || "11:00")}
                    />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Not before" hint="(optional)">
                    <Input
                      type="date"
                      value={form.notBeforeDate}
                      onChange={(e) => set("notBeforeDate", e.target.value)}
                    />
                  </Field>
                  <Field label="Not after" hint="(optional)">
                    <Input
                      type="date"
                      value={form.notAfterDate}
                      onChange={(e) => set("notAfterDate", e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="If nothing fits these hours">
                  <div className="flex gap-2">
                    <Chip on={!form.allowOutsideWindows} onClick={() => set("allowOutsideWindows", false)}>
                      decline politely
                    </Chip>
                    <Chip on={form.allowOutsideWindows} onClick={() => set("allowOutsideWindows", true)}>
                      book closest time anyway
                    </Chip>
                  </div>
                </Field>
              </div>
            )}

            {/* -------- Step 5: Insurance (optional) -------- */}
            {step === 4 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Insurance provider">
                  <Input
                    value={form.insuranceProvider}
                    onChange={(e) => set("insuranceProvider", e.target.value)}
                    placeholder="e.g. Blue Shield"
                  />
                </Field>
                <Field label="Member ID">
                  <Input
                    value={form.insuranceMemberId}
                    onChange={(e) => set("insuranceMemberId", e.target.value)}
                    placeholder="ID on your card"
                  />
                </Field>
              </div>
            )}

            {/* -------- Step 6: Review & book -------- */}
            {step === 5 && (
              <div className="flex flex-col gap-5">
                <div className="divide-y rounded-xl border bg-muted/40 px-4 py-1">
                  <ReviewRow
                    label="Patient"
                    value={`${form.patientName} · ${form.dateOfBirth}${form.postalCode ? ` · ${form.postalCode}` : ""} · ${form.callerRelationship}`}
                    onEdit={() => goTo(0)}
                  />
                  <ReviewRow
                    label="Office"
                    value={`${form.providerName} · ${form.providerPhone}`}
                    onEdit={() => goTo(1)}
                  />
                  <ReviewRow
                    label="Visit"
                    value={`${form.reason}${form.preferredProvider ? ` · ${form.preferredProvider}` : ""}`}
                    onEdit={() => goTo(2)}
                  />
                  <ReviewRow
                    label="Booking window"
                    value={`${summary}${form.allowOutsideWindows ? " · closest time ok" : ""}`}
                    onEdit={() => goTo(3)}
                  />
                  <ReviewRow
                    label="Insurance"
                    value={
                      form.insuranceProvider || form.insuranceMemberId
                        ? [form.insuranceProvider, form.insuranceMemberId].filter(Boolean).join(" · ")
                        : "Not provided — will offer at check-in"
                    }
                    onEdit={() => goTo(4)}
                  />
                </div>

                <Separator />

                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Optional details
                </div>
                <Field label="Callback number" hint="— only if the agent gets stuck">
                  <Input
                    value={form.callbackNumber}
                    onChange={(e) => set("callbackNumber", e.target.value)}
                    placeholder="+1…"
                  />
                </Field>
                <Field label="Notes">
                  <Textarea
                    value={form.extraNotes}
                    onChange={(e) => set("extraNotes", e.target.value)}
                    rows={3}
                    placeholder="Anything the agent should mention or ask…"
                  />
                </Field>
              </div>
            )}
          </div>

          {/* nav */}
          <div className="mt-8 flex items-center gap-3">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} className="gap-1.5">
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
            <div className="flex-1" />
            {STEPS[step].optional && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => goTo(step + 1)}
                className="text-muted-foreground"
              >
                Skip
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="submit" size="lg" className="min-w-36 font-bold">
                Continue
              </Button>
            ) : (
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="min-w-44 font-bold shadow-lg shadow-primary/25"
              >
                {submitting ? "Placing call…" : "Call & book"}
              </Button>
            )}
          </div>
          <div className="mt-3 text-right text-xs text-muted-foreground">
            press <span className="font-semibold text-secondary-foreground">Enter ↵</span> to continue
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
