import type { Call } from "@/lib/calls";
import { CallCard } from "@/components/call-card";

export function CallsPanel({ calls }: { calls: Call[] }) {
  const countLabel = calls.length === 0 ? "" : calls.length === 1 ? "1 call" : `${calls.length} calls`;
  return (
    <div className="card calls-panel">
      <div className="panel-head">
        <span className="eyebrow">LIVE CALLS</span>
        <span className="count">{countLabel}</span>
      </div>

      {calls.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📞</div>
          <div className="empty-title">No calls yet</div>
          <div className="empty-sub">
            Submit a booking and watch the agent dial the office and lock in a time.
          </div>
        </div>
      ) : (
        <div className="calls-list">
          {calls.map((c) => (
            <CallCard call={c} key={c.id} />
          ))}
        </div>
      )}
    </div>
  );
}
