"use client";

import { useCallback, useEffect, useState } from "react";
import type { Call } from "@/lib/calls";

// Polls /api/calls every 4s for the lifetime of the component that mounts it.
export function useCalls() {
  const [calls, setCalls] = useState<Call[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/calls");
      const data = await res.json();
      setCalls(data.calls ?? []);
    } catch {
      /* ignore transient fetch errors */
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  return { calls, refresh };
}
