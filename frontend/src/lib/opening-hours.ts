import type { OpeningHour } from "./redux/restaurant-types";
import { timezoneForCountry } from "./countries";

export type OpenStatus =
  | { kind: "open" }
  | { kind: "opensLaterToday"; time: string }
  | { kind: "closedUntilTomorrow" }
  | { kind: "closedUntilDay"; dayOfWeek: number }
  /** No usable schedule (none set, or every entry marked closed) — caller falls back to the
   * plain manual isOpen/isClosed label. */
  | { kind: "unknown" };

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** The current wall-clock day-of-week (0 = Sunday … 6 = Saturday) and minutes-since-midnight in
 * a specific IANA zone — deliberately not `Date.getDay()`/`getHours()`, which read the
 * *browser's* local time, not the store's. `Intl.DateTimeFormat` with a `timeZone` bakes in the
 * zone's DST rules automatically, which a fixed UTC-offset calculation would get wrong twice a
 * year in any zone that observes DST. */
function wallClockNow(timezone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const weekdayShort = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayShort);

  return { dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : 0, minutes: hour * 60 + minute };
}

/**
 * Computes whether a restaurant/store is open right now purely from its weekly `openingHours`
 * schedule (docs/ROADMAP.md FDP-84) — independent of the owner's manual `isOpen` toggle, which
 * callers combine with this separately (a manual "closed" always wins; a manual "open" defers to
 * this schedule to decide the actual label). Handles the overnight case (e.g. 18:00–02:00, where
 * `closeTime` is numerically *before* `openTime`) by also checking whether yesterday's window is
 * still running past midnight into today.
 */
export function getOpenStatus(openingHours: OpeningHour[] | undefined, country: string): OpenStatus {
  const usableEntries = (openingHours ?? []).filter((h) => !h.isClosed);
  if (usableEntries.length === 0) return { kind: "unknown" };

  const timezone = timezoneForCountry(country) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { dayOfWeek, minutes } = wallClockNow(timezone);
  const findEntry = (day: number) => openingHours?.find((h) => h.dayOfWeek === day);

  // An overnight window from yesterday (e.g. yesterday 18:00–02:00) can still be running now,
  // before today's own window (if any) has even started.
  const yesterday = findEntry((dayOfWeek + 6) % 7);
  if (yesterday && !yesterday.isClosed) {
    const yOpen = minutesOf(yesterday.openTime);
    const yClose = minutesOf(yesterday.closeTime);
    if (yClose <= yOpen && minutes < yClose) return { kind: "open" };
  }

  const today = findEntry(dayOfWeek);
  if (today && !today.isClosed) {
    const open = minutesOf(today.openTime);
    const close = minutesOf(today.closeTime);
    const overnight = close <= open;
    if (overnight) {
      if (minutes >= open) return { kind: "open" };
      return { kind: "opensLaterToday", time: today.openTime };
    }
    if (minutes >= open && minutes < close) return { kind: "open" };
    if (minutes < open) return { kind: "opensLaterToday", time: today.openTime };
    // Past close time today — fall through to find the next open day below.
  }

  for (let i = 1; i <= 7; i++) {
    const day = (dayOfWeek + i) % 7;
    const entry = findEntry(day);
    if (entry && !entry.isClosed) {
      return i === 1 ? { kind: "closedUntilTomorrow" } : { kind: "closedUntilDay", dayOfWeek: day };
    }
  }
  return { kind: "unknown" };
}

/** Formats a stored "HH:mm" wall-clock string (not a real Date — no timezone conversion needed,
 * it's already the right local time) using the viewer's locale-appropriate 12h/24h convention. */
export function formatWallClockTime(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const reference = new Date(2000, 0, 1, h, m);
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(reference);
}

/** Localized weekday name for a `dayOfWeek` index (0 = Sunday … 6 = Saturday) — 2023-01-01 was a
 * Sunday, so offsetting from it maps any index to a real date with the matching weekday. */
export function weekdayName(dayOfWeek: number, locale: string): string {
  const reference = new Date(2023, 0, 1 + dayOfWeek);
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(reference);
}

/**
 * Combines the owner's manual isOpen toggle with the schedule-derived `OpenStatus` into one
 * label + effective open/closed flag — the manual toggle set to "closed" always wins (an
 * explicit owner override, e.g. an unplanned closure), otherwise the schedule decides whether
 * "open" really means open right now. Every caller's `t` is a namespace-scoped
 * `useTranslations(...)` result that already carries "open"/"closed"/"opensAt"/
 * "closedUntilTomorrow"/"closedUntilDay" (RestaurantCard, StoreCard, RestaurantDetailPage,
 * StoreDetailPage all define the same four keys for exactly this).
 */
export function describeOpenStatus(
  isManuallyOpen: boolean,
  scheduleStatus: OpenStatus,
  locale: string,
  t: (key: string, values?: Record<string, string | number>) => string,
): { label: string; isOpenNow: boolean } {
  if (!isManuallyOpen) return { label: t("closed"), isOpenNow: false };
  switch (scheduleStatus.kind) {
    case "open":
    case "unknown":
      return { label: t("open"), isOpenNow: true };
    case "opensLaterToday":
      return { label: t("opensAt", { time: formatWallClockTime(scheduleStatus.time, locale) }), isOpenNow: false };
    case "closedUntilTomorrow":
      return { label: t("closedUntilTomorrow"), isOpenNow: false };
    case "closedUntilDay":
      return {
        label: t("closedUntilDay", { day: weekdayName(scheduleStatus.dayOfWeek, locale) }),
        isOpenNow: false,
      };
  }
}
