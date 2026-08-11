"use client";

import { PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { LIVE, type Call } from "@/lib/calls";
import { CallCard } from "@/components/call-card";

const NEEDS_YOU = new Set(["awaiting_confirmation", "escalated"]);

export function CallsSheet({
  calls,
  open,
  onOpenChange,
}: {
  calls: Call[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const active = calls.filter((c) => LIVE.has(c.status) || NEEDS_YOU.has(c.status)).length;
  const needsYou = calls.some((c) => NEEDS_YOU.has(c.status));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button variant="outline" className="relative gap-2">
            <PhoneCall className="size-4" />
            Calls
            {calls.length > 0 && (
              <span
                className={cn(
                  "absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                  needsYou
                    ? "animate-pulse bg-warn text-background"
                    : active > 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground",
                )}
              >
                {active > 0 ? active : calls.length}
              </span>
            )}
          </Button>
        }
      />
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Live calls
          </SheetTitle>
          <SheetDescription>
            {calls.length === 0
              ? "Nothing in flight."
              : calls.length === 1
                ? "1 call"
                : `${calls.length} calls`}
          </SheetDescription>
        </SheetHeader>

        {calls.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 flex size-13 items-center justify-center rounded-2xl border bg-muted text-2xl">
              📞
            </div>
            <div className="mb-1 text-sm font-semibold">No calls yet</div>
            <p className="max-w-60 text-[13px] leading-relaxed text-muted-foreground">
              Submit a booking and watch the agent dial the office and lock in a time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5 overflow-y-auto p-4">
            {calls.map((c) => (
              <CallCard call={c} key={c.id} />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
