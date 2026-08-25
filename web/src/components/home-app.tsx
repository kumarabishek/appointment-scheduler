"use client";

import { useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { BookingForm } from "@/components/booking-form";
import { CallsSheet } from "@/components/calls-sheet";
import { useCalls } from "@/hooks/use-calls";

const NEEDS_YOU = new Set(["awaiting_confirmation", "escalated"]);

export function HomeApp() {
  const { calls, refresh } = useCalls();
  const [callsOpen, setCallsOpen] = useState(false);

  // Surface a toast the moment a call starts needing the user, since the
  // calls list now lives behind a click.
  const prevStatuses = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const c of calls) {
      const was = prevStatuses.current[c.id];
      if (was && was !== c.status && NEEDS_YOU.has(c.status)) {
        toast.warning(`${c.providerName} needs you`, {
          action: { label: "View", onClick: () => setCallsOpen(true) },
        });
      }
    }
    prevStatuses.current = Object.fromEntries(calls.map((c) => [c.id, c.status]));
  }, [calls]);

  return (
    <div className="page-glow min-h-screen px-5 pb-16 pt-7 sm:px-7">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-8 flex-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#8a76f5] shadow-md shadow-primary/40">
                <Phone className="size-4 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                Appointment Scheduler
              </h1>
            </div>
            <CallsSheet calls={calls} open={callsOpen} onOpenChange={setCallsOpen} />
          </div>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Tell the agent who it&apos;s for, where to call, and when works. It dials the office,
            books a slot inside your rules, and only pings you if nothing fits.
          </p>
        </div>

        <BookingForm
          onSubmitted={async () => {
            await refresh();
            setCallsOpen(true);
          }}
        />
      </div>
    </div>
  );
}
