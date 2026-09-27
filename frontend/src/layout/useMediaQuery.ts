import { useEffect, useState } from "react";

/** Phones: card lists instead of wide tables/grids. Keep in sync with styles.css (max-width: 699px). */
export const MOBILE_QUERY = "(max-width: 699px)";
/** Tablets: the schedule grid hides secondary columns. */
export const TABLET_QUERY = "(max-width: 999px)";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

function matches(query: string): boolean {
  // Missing in some environments (e.g. jsdom): fall back to the desktop/light layout.
  return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(query);
    const onChange = () => setValue(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return value;
}
