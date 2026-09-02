import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Carousel } from "./carousel";

/** jsdom never computes real layout — scrollWidth/clientWidth/scrollLeft all default to 0, and
 * scrollBy/scrollTo are no-ops that don't move scrollLeft or fire a scroll event. This makes a
 * minimal scrollable-element stand-in so the component's real edge-detection/auto-advance logic
 * can be exercised, not just "it rendered". */
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
  track.scrollBy = vi.fn(({ left = 0 }: ScrollToOptions = {}) => {
    scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, scrollLeft + left));
    track.dispatchEvent(new Event("scroll"));
  });
  track.scrollTo = vi.fn(({ left = 0 }: ScrollToOptions = {}) => {
    scrollLeft = Math.max(0, Math.min(scrollWidth - clientWidth, left));
    track.dispatchEvent(new Event("scroll"));
  });
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
      <Carousel aria-label="Test carousel" autoAdvanceMs={0}>
        {[<div key="a">Slide A</div>, <div key="b">Slide B</div>]}
      </Carousel>,
    );
    expect(screen.getByText("Slide A")).toBeInTheDocument();
    expect(screen.getByText("Slide B")).toBeInTheDocument();
  });

  it("disables Previous while at the start, enables both after scrolling forward, and disables Next at the end", async () => {
    const user = userEvent.setup();
    render(
      <Carousel aria-label="Test carousel" autoAdvanceMs={0}>
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

  it("auto-advances on an interval, moving the track without any user interaction", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" autoAdvanceMs={1000}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 600, clientWidth: 300 });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(track.scrollTo).toHaveBeenCalled();
  });

  it("wraps back to the start once auto-advance reaches the end", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" autoAdvanceMs={1000}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 600, clientWidth: 300 });
    // Already at the end (scrollLeft 0, clientWidth 300, scrollWidth 600 → nudging forward
    // would land past the end) — force scrollLeft to the end boundary first.
    track.scrollTo({ left: 300 });
    (track.scrollTo as ReturnType<typeof vi.fn>).mockClear();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(track.scrollTo).toHaveBeenCalledWith({ left: 0, behavior: "smooth" });
  });

  it("pauses auto-advance while the pointer is over the carousel", () => {
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" autoAdvanceMs={1000}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 600, clientWidth: 300 });
    const container = track.parentElement as HTMLElement;
    fireEvent.mouseEnter(container);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(track.scrollTo).not.toHaveBeenCalled();
  });

  it("never auto-advances when the user prefers reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    vi.useFakeTimers();
    render(
      <Carousel aria-label="Test carousel" autoAdvanceMs={1000}>
        {[<div key="a">A</div>, <div key="b">B</div>]}
      </Carousel>,
    );
    const track = screen.getByRole("region", { name: "Test carousel" });
    mockScrollableTrack(track, { scrollWidth: 600, clientWidth: 300 });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(track.scrollTo).not.toHaveBeenCalled();
  });
});
