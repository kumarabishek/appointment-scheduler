import { BAD, LIVE, STATUS_LABEL, type Call } from "@/lib/calls";

export function CallCard({ call }: { call: Call }) {
  const booked = call.status === "booked";
  const live = LIVE.has(call.status) || call.status === "awaiting_confirmation";
  const bad = BAD.has(call.status);
  const pillClass = booked ? "booked" : bad ? "bad" : "live";
  return (
    <div className="callcard">
      <div className="callcard-head">
        <div className="office">{call.providerName}</div>
        <div className={`pill ${pillClass}`}>
          <span className="dot" />
          {STATUS_LABEL[call.status] ?? call.status}
        </div>
      </div>

      {live && !booked && (
        <div className="live-banner">
          <div className="wave">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="txt">
            {call.status === "awaiting_confirmation"
              ? "Waiting for your approval…"
              : "Agent on the line…"}
          </span>
        </div>
      )}

      {call.transcriptSummary && !booked && (
        <div className="summary-line">{call.transcriptSummary}</div>
      )}

      {booked && call.chosenSlot && (
        <div className="booked-box">
          <div className="booked-top">
            <span className="check">✓</span>
            <span className="lbl">Appointment booked</span>
          </div>
          <div className="booked-when">{call.chosenSlot.startsAt}</div>
          <div className="booked-reason">{call.reason}</div>
        </div>
      )}
    </div>
  );
}
