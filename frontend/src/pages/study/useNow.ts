import { useEffect, useState } from "react";

/**
 * Current time for display, refreshed every second while {@code running} and immediately when the page becomes
 * visible again (background tabs throttle intervals). Only drives re-rendering: elapsed time is always computed
 * from timestamps.
 */
export function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = running ? window.setInterval(refresh, 1000) : undefined;
    refresh();
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [running]);

  return now;
}
