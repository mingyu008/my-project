import { useEffect, useState } from "react";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

function wakeLockApi(): WakeLockLike | undefined {
  return (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
}

/**
 * Keeps the screen on while {@code active}. Browsers drop the lock when the tab is hidden, so it is re-requested
 * when the page becomes visible again. Returns false when the browser has no Wake Lock API.
 */
export function useWakeLock(active: boolean): boolean {
  const [supported] = useState(() => wakeLockApi() !== undefined);

  useEffect(() => {
    const api = wakeLockApi();
    if (!active || !api) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      api
        .request("screen")
        .then((s) => {
          if (cancelled) void s.release().catch(() => undefined);
          else sentinel = s;
        })
        .catch(() => undefined); // e.g. battery saver: the timer still works, the screen may just turn off.
    };

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);

  return supported;
}
