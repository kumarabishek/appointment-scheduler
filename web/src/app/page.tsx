"use client";

import { BookingForm } from "@/components/booking-form";
import { CallsPanel } from "@/components/calls-panel";
import { useCalls } from "@/hooks/use-calls";

export default function Home() {
  const { calls, refresh } = useCalls();

  return (
    <div className="page">
      <div className="shell">
        <div className="head">
          <div className="head-row">
            <div className="logo">📞</div>
            <h1>Appointment Scheduler</h1>
          </div>
          <p>
            Tell the agent who it&apos;s for, where to call, and when works. It dials the office,
            books a slot inside your rules, and only pings you if nothing fits.
          </p>
        </div>

        <div className="grid">
          <BookingForm onSubmitted={refresh} />
          <CallsPanel calls={calls} />
        </div>
      </div>
    </div>
  );
}
