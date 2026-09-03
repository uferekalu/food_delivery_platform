import { describe, it, expect, vi, afterEach } from "vitest";
import { getOpenStatus, describeOpenStatus, formatWallClockTime, weekdayName } from "./opening-hours";
import type { OpeningHour } from "./redux/restaurant-types";

// Nigeria is UTC+1 year-round (no DST) — the simplest fixed reference for asserting exact
// wall-clock behavior without a second timezone conversion to reason about.
const NIGERIA = "Nigeria";

function hours(entries: Array<Partial<OpeningHour> & { dayOfWeek: number }>): OpeningHour[] {
  return entries.map((e) => ({ openTime: "09:00", closeTime: "21:00", isClosed: false, ...e }));
}

// A fake namespace-scoped `t` mirroring RestaurantCard/StoreCard's real translation keys, so
// describeOpenStatus can be tested without pulling in next-intl.
function fakeT(key: string, values?: Record<string, string | number>): string {
  switch (key) {
    case "open":
      return "Open";
    case "closed":
      return "Closed";
    case "opensAt":
      return `Opens at ${values?.time}`;
    case "closedUntilTomorrow":
      return "Closed until tomorrow";
    case "closedUntilDay":
      return `Closed until ${values?.day}`;
    default:
      return key;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("getOpenStatus", () => {
  it("is open when now falls within today's window", () => {
    // 2024-06-12 is a Wednesday. 12:00 UTC = 13:00 in Lagos (UTC+1) — within 09:00-21:00.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00Z"));
    const status = getOpenStatus(hours([{ dayOfWeek: 3 }]), NIGERIA);
    expect(status).toEqual({ kind: "open" });
  });

  it("reports opensLaterToday before today's opening time", () => {
    // 05:00 UTC = 06:00 Lagos — before the 09:00 open.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T05:00:00Z"));
    const status = getOpenStatus(hours([{ dayOfWeek: 3, openTime: "09:00", closeTime: "21:00" }]), NIGERIA);
    expect(status).toEqual({ kind: "opensLaterToday", time: "09:00" });
  });

  it("reports closedUntilTomorrow after today's closing time when tomorrow is open", () => {
    // 21:00 UTC = 22:00 Lagos — past the 21:00 close.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T21:00:00Z"));
    const status = getOpenStatus(
      hours([
        { dayOfWeek: 3 },
        { dayOfWeek: 4 },
      ]),
      NIGERIA,
    );
    expect(status).toEqual({ kind: "closedUntilTomorrow" });
  });

  it("reports closedUntilDay, skipping days marked isClosed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T21:00:00Z")); // past close, Wednesday Lagos time
    const status = getOpenStatus(
      hours([
        { dayOfWeek: 3 },
        { dayOfWeek: 4, isClosed: true }, // Thursday closed
        { dayOfWeek: 5 }, // Friday open
      ]),
      NIGERIA,
    );
    expect(status).toEqual({ kind: "closedUntilDay", dayOfWeek: 5 });
  });

  it("treats a missing weekly entry as closed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00Z")); // Wednesday, no entry provided
    const status = getOpenStatus(hours([{ dayOfWeek: 5 }]), NIGERIA); // only Friday configured
    expect(status).toEqual({ kind: "closedUntilDay", dayOfWeek: 5 });
  });

  it("handles an overnight window still running after midnight (yesterday's entry)", () => {
    // Tuesday 18:00-02:00 Lagos. At 00:30 Lagos Wednesday (23:30 UTC Tuesday) it should still
    // read as open, driven by Tuesday's entry rolling past midnight.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-11T23:30:00Z"));
    const status = getOpenStatus(hours([{ dayOfWeek: 2, openTime: "18:00", closeTime: "02:00" }]), NIGERIA);
    expect(status).toEqual({ kind: "open" });
  });

  it("handles an overnight window from the point it opens today", () => {
    // Tuesday 19:00 Lagos (18:00 UTC) is within the 18:00-02:00 overnight window that just started.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-11T18:00:00Z"));
    const status = getOpenStatus(hours([{ dayOfWeek: 2, openTime: "18:00", closeTime: "02:00" }]), NIGERIA);
    expect(status).toEqual({ kind: "open" });
  });

  it("returns unknown when every entry is marked closed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00Z"));
    const status = getOpenStatus(hours([{ dayOfWeek: 3, isClosed: true }]), NIGERIA);
    expect(status).toEqual({ kind: "unknown" });
  });

  it("returns unknown when openingHours is empty or undefined", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-06-12T12:00:00Z"));
    expect(getOpenStatus([], NIGERIA)).toEqual({ kind: "unknown" });
    expect(getOpenStatus(undefined, NIGERIA)).toEqual({ kind: "unknown" });
  });

  it("is DST-correct across winter and summer in a DST-observing zone", () => {
    // A store in New York open 09:00-21:00 local time. 13:30 UTC is:
    //   - 08:30 EST in January (UTC-5)   -> before opening -> opensLaterToday
    //   - 09:30 EDT in July    (UTC-4)   -> after opening   -> open
    // A fixed-UTC-offset implementation (not real IANA DST rules) would get one of these wrong.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-10T13:30:00Z")); // Wednesday
    expect(getOpenStatus(hours([{ dayOfWeek: 3 }]), "United States")).toEqual({
      kind: "opensLaterToday",
      time: "09:00",
    });

    vi.setSystemTime(new Date("2024-07-10T13:30:00Z")); // Wednesday
    expect(getOpenStatus(hours([{ dayOfWeek: 3 }]), "United States")).toEqual({ kind: "open" });
  });
});

describe("describeOpenStatus", () => {
  it("always reports closed when manually closed, regardless of schedule", () => {
    const result = describeOpenStatus(false, { kind: "open" }, "en", fakeT);
    expect(result).toEqual({ label: "Closed", isOpenNow: false });
  });

  it("reports open when manually open and schedule says open", () => {
    const result = describeOpenStatus(true, { kind: "open" }, "en", fakeT);
    expect(result).toEqual({ label: "Open", isOpenNow: true });
  });

  it("falls back to open when manually open and there's no usable schedule", () => {
    const result = describeOpenStatus(true, { kind: "unknown" }, "en", fakeT);
    expect(result).toEqual({ label: "Open", isOpenNow: true });
  });

  it("reports opensAt with a formatted time when opening later today", () => {
    const result = describeOpenStatus(true, { kind: "opensLaterToday", time: "09:00" }, "en-US", fakeT);
    expect(result.isOpenNow).toBe(false);
    expect(result.label).toContain("9:00");
  });

  it("reports closedUntilTomorrow", () => {
    const result = describeOpenStatus(true, { kind: "closedUntilTomorrow" }, "en", fakeT);
    expect(result).toEqual({ label: "Closed until tomorrow", isOpenNow: false });
  });

  it("reports closedUntilDay with a localized weekday name", () => {
    const result = describeOpenStatus(true, { kind: "closedUntilDay", dayOfWeek: 5 }, "en-US", fakeT);
    expect(result.isOpenNow).toBe(false);
    expect(result.label).toContain("Friday");
  });
});

describe("formatWallClockTime", () => {
  it("formats using the locale's convention without shifting the time", () => {
    expect(formatWallClockTime("09:00", "en-US")).toMatch(/9:00\s*AM/i);
    expect(formatWallClockTime("21:30", "en-US")).toMatch(/9:30\s*PM/i);
  });
});

describe("weekdayName", () => {
  it("maps dayOfWeek 0-6 to Sunday-Saturday", () => {
    expect(weekdayName(0, "en-US")).toBe("Sunday");
    expect(weekdayName(6, "en-US")).toBe("Saturday");
  });
});
