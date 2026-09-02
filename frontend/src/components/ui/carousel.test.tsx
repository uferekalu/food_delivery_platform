import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Carousel } from "./carousel";

/** jsdom never computes real layout — scrollWidth/clientWidth/scrollLeft all default to 0, and
 * scrollBy/scrollTo are no-ops that don't move scrollLeft or fire a scroll event. This makes a
 * minimal scrollable-element stand-in so the component's real edge-detection/drift logic can be
 * exercised, not just "it rendered". */
function mockScrollableTrack(track: HTMLElement, { scrollWidth, clientWidth }: { scrollWidth: number; clientWidth: number }) {
  Object.defineProperty(track, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(track, "clientWidth", { value: clientWidth, configurable: true });
  let scrollLeft = 0;
  Object.defineProperty(track, "scrollLeft", {
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = v;
    },
    configurable: true,
  });
  // Element.scrollBy/scrollTo are overloaded ((options?) => void | (x, y) => void) — the
  // component only ever calls the options-object form (manual prev/next buttons), so the mock
  // only implements that one; cast to the full overloaded type rather than widening the mock's
  // own signature to a form it would never actually receive.
  track.scrollBy = vi.fn(({ left = 0 }: ScrollToOptions = {}) => {
    scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, scrollLeft + left));
    track.dispatchEvent(new Event("scroll"));
  }) as Element["scrollBy"];
  track.scrollTo = vi.fn(({ left = 0 }: ScrollToOptions = {}) => {
    scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, left));
    track.dispatchEvent(new Event("scroll"));
  }) as Element["scrollTo"];
  fireEvent.scroll(track); // let the component's mount-time edge measurement pick this up
}

describe("Carousel", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    vi.useRealTimers();
  });

  it("renders every child", () => {
    render(
      <Carousel aria-label="Test carousel" speed={0}>
        {[<div key="a">Slide A</div>, <div key="b">Slide B</div>]}
      </Carousel>,
    );
    expect(screen.getByText("Slide A")).toBeInTheDocument();
    expect(screen.getByText("Slide B")).toBeInTheDocument();
  });

  it("disables Previous while at the start, enables both after scrolling forward, and disables Next at the end", async () => {
    const user = userEvent.setup();
    render(
      <Carousel aria-label="Test carousel" speed={0}>
        {[<div key="a">A</div>, <div key="b">B</div>, <div key="c">C</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 900, clientWidth: 300 });

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(track.scrollBy).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();

    // Scroll all the way to the end — Next should now disable.
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("drifts scrollLeft continuously in small steps rather than jumping — a slow, gentle glide, not a periodic large jump", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" speed={300}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 900, clientWidth: 300 });

    // 300px/sec over one 30ms tick moves ~9px — nowhere near a full "page" (255px), proving this
    // is a continuous drift, not the old periodic big-jump behavior.
    act(() => {
      vi.advanceTimersByTime(30);
    });
    expect(track.scrollLeft).toBeGreaterThan(0);
    expect(track.scrollLeft).toBeLessThan(20);

    // Over a full second it should have advanced roughly speed px (allowing timer-granularity
    // slack), confirming the rate is what was configured, not something faster/jumpier.
    act(() => {
      vi.advanceTimersByTime(970);
    });
    expect(track.scrollLeft).toBeGreaterThan(250);
    expect(track.scrollLeft).toBeLessThan(320);
  });

  it("wraps back to the start once the continuous drift reaches the end", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" speed={300}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 600, clientWidth: 300 }); // maxScroll = 300
    track.scrollLeft = 295; // one tick (9px) away from the end

    act(() => {
      vi.advanceTimersByTime(30);
    });

    expect(track.scrollLeft).toBe(0);
  });

  it("pauses the drift while the pointer is over the carousel", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" speed={300}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 900, clientWidth: 300 });
    const container = track.parentElement as HTMLElement;
    fireEvent.mouseEnter(container);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(track.scrollLeft).toBe(0);
  });

  it("never drifts when the user prefers reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" speed={300}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 900, clientWidth: 300 });

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(track.scrollLeft).toBe(0);
  });
});
