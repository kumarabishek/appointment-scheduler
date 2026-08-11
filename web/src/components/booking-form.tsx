"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

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
      if (!res.ok) {
        toast.error(data.error || "Failed to place call.");
      } else {
        toast.success("Call placed — the agent is dialing the office.");
        await onSubmitted();
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="flex flex-col gap-7">
          {/* Who */}
          <section className="flex flex-col gap-4">
            <SectionHead title="Who's this for?" sub="Patient on record at the office" />
            <div className="grid gap-2">
              <Label htmlFor="patientName">Patient name</Label>
              <Input
                id="patientName"
                value={form.patientName}
                onChange={(e) => set("patientName", e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="dateOfBirth">Date of birth</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) => set("dateOfBirth", e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Your relationship</Label>
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
              </div>
            </div>
          </section>

          <Separator />

          {/* Office */}
          <section className="flex flex-col gap-4">
            <SectionHead title="Office to call" sub="The clinic, lab, or provider we'll dial" />
            <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-2">
                <Label htmlFor="providerName">Office / provider name</Label>
                <Input
                  id="providerName"
                  value={form.providerName}
                  onChange={(e) => set("providerName", e.target.value)}
                  placeholder="e.g. Bay Area Family Medicine"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="providerPhone">Office phone</Label>
                <Input
                  id="providerPhone"
                  value={form.providerPhone}
                  onChange={(e) => set("providerPhone", e.target.value)}
                  placeholder="+1…"
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>
                Office timezone <span className="font-normal text-muted-foreground">— auto-detected</span>
              </Label>
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
            </div>
          </section>

          <Separator />

          {/* Reason & urgency */}
          <section className="flex flex-col gap-4">
            <SectionHead title="Reason & urgency" sub="What to book, and how soon" />
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason for visit</Label>
              <Input
                id="reason"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
                placeholder="e.g. fasting blood test"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="preferredProvider">
                  Preferred doctor <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="preferredProvider"
                  value={form.preferredProvider}
                  onChange={(e) => set("preferredProvider", e.target.value)}
                  placeholder="e.g. Dr. Chan — else any"
                />
              </div>
              <div className="grid gap-2">
                <Label>Urgency</Label>
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
              </div>
            </div>
          </section>

          <Separator />

          {/* When */}
          <section className="flex flex-col gap-4">
            <SectionHead title="When works for you?" sub="The agent only books inside these limits" />
            <div className="grid gap-2">
              <Label>Acceptable days</Label>
              <div className="flex gap-2">
                {DAYS.map((d) => (
                  <Chip key={d} on={form.days.includes(d)} onClick={() => toggleDay(d)} className="lowercase">
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="earliest">Earliest time</Label>
                <Input
                  id="earliest"
                  type="time"
                  value={form.earliest}
                  onChange={(e) => set("earliest", e.target.value || "08:00")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="latest">Latest time</Label>
                <Input
                  id="latest"
                  type="time"
                  value={form.latest}
                  onChange={(e) => set("latest", e.target.value || "11:00")}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="notBeforeDate">Not before</Label>
                <Input
                  id="notBeforeDate"
                  type="date"
                  value={form.notBeforeDate}
                  onChange={(e) => set("notBeforeDate", e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notAfterDate">Not after</Label>
                <Input
                  id="notAfterDate"
                  type="date"
                  value={form.notAfterDate}
                  onChange={(e) => set("notAfterDate", e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>If nothing fits these hours</Label>
              <div className="flex gap-2">
                <Chip on={!form.allowOutsideWindows} onClick={() => set("allowOutsideWindows", false)}>
                  decline politely
                </Chip>
                <Chip on={form.allowOutsideWindows} onClick={() => set("allowOutsideWindows", true)}>
                  book closest time anyway
                </Chip>
              </div>
            </div>
          </section>

          <Separator />

          {/* Optional details, collapsed by default */}
          <Accordion multiple className="-my-3">
            <AccordionItem value="insurance">
              <AccordionTrigger className="py-3 hover:no-underline">
                <SectionHead title="Insurance" sub="Optional — so the agent can verify coverage on the call" />
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="grid gap-4 pt-1 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="insuranceProvider">Provider</Label>
                    <Input
                      id="insuranceProvider"
                      value={form.insuranceProvider}
                      onChange={(e) => set("insuranceProvider", e.target.value)}
                      placeholder="e.g. Blue Shield"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="insuranceMemberId">Member ID</Label>
                    <Input
                      id="insuranceMemberId"
                      value={form.insuranceMemberId}
                      onChange={(e) => set("insuranceMemberId", e.target.value)}
                      placeholder="ID on your card"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="reaching-you" className="border-b-0">
              <AccordionTrigger className="py-3 hover:no-underline">
                <SectionHead title="Reaching you" sub="Optional — only if the agent gets stuck" />
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex flex-col gap-4 pt-1">
                  <div className="grid gap-2">
                    <Label htmlFor="callbackNumber">Callback number</Label>
                    <Input
                      id="callbackNumber"
                      value={form.callbackNumber}
                      onChange={(e) => set("callbackNumber", e.target.value)}
                      placeholder="+1…"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="extraNotes">Notes</Label>
                    <Textarea
                      id="extraNotes"
                      value={form.extraNotes}
                      onChange={(e) => set("extraNotes", e.target.value)}
                      rows={3}
                      placeholder="Anything the agent should mention or ask…"
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Separator />

          {/* CTA */}
          <div className="flex flex-col gap-3">
            <div className="text-[13px] text-muted-foreground">
              Booking window: <span className="font-semibold text-secondary-foreground">{summary}</span>
            </div>
            <Button type="submit" size="lg" disabled={submitting} className="w-full font-bold shadow-lg shadow-primary/25">
              {submitting ? "Placing call…" : "Call & book"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
