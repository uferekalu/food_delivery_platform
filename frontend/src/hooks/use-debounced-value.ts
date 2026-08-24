import { useEffect, useState } from "react";

/** Delays reflecting `value` until it's stopped changing for `delayMs` — e.g. a search input
 * that shouldn't fire a new query on every keystroke (docs/ROADMAP.md FDP-21). */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
