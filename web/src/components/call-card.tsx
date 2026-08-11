import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { BAD, LIVE, STATUS_LABEL, type Call } from "@/lib/calls";

export function CallCard({ call }: { call: Call }) {
  const booked = call.status === "booked";
  const live = LIVE.has(call.status) || call.status === "awaiting_confirmation";
  const bad = BAD.has(call.status);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 rounded-xl border bg-muted/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="truncate text-sm font-semibold">{call.providerName}</div>
        <Badge
          variant="outline"
          className={cn(
            "flex-none gap-1.5 rounded-full font-semibold",
            booked
              ? "border-good/30 bg-good/15 text-good-foreground"
              : bad
                ? "border-destructive/30 bg-destructive/15 text-destructive"
                : "border-warn/30 bg-warn/15 text-warn-foreground",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              booked ? "bg-good" : bad ? "bg-destructive" : "animate-pulse bg-warn",
            )}
          />
          {STATUS_LABEL[call.status] ?? call.status}
        </Badge>
      </div>

      {live && !booked && (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-warn/20 bg-warn/5 px-3 py-2">
          <div className="wave">
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="text-[13px] font-medium text-warn-foreground">
            {call.status === "awaiting_confirmation"
              ? "Waiting for your approval…"
              : "Agent on the line…"}
          </span>
        </div>
      )}

      {call.transcriptSummary && !booked && (
        <p className="pb-1 text-[13px] leading-relaxed text-secondary-foreground">
          {call.transcriptSummary}
        </p>
      )}

      {booked && call.chosenSlot && (
        <div className="mt-1 rounded-lg border border-good/25 bg-good/10 p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="flex size-5 flex-none items-center justify-center rounded-full bg-good text-[11px] font-bold text-background">
              ✓
            </span>
            <span className="text-sm font-semibold text-good-foreground">Appointment booked</span>
          </div>
          <div className="text-base font-bold tracking-tight">{call.chosenSlot.startsAt}</div>
          <div className="text-xs text-muted-foreground">{call.reason}</div>
        </div>
      )}
    </div>
  );
}
