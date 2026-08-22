import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DropdownMenu, type DropdownMenuItem } from "./dropdown-menu";

function Harness({ items, align }: { items: DropdownMenuItem[]; align?: "start" | "end" }) {
  return (
    <DropdownMenu
      align={align}
      items={items}
      trigger={(triggerProps) => (
        <button type="button" {...triggerProps}>
          Actions
        </button>
      )}
    />
  );
}

describe("DropdownMenu", () => {
  it("is closed by default and opens on trigger click", async () => {
    const user = userEvent.setup();
    render(<Harness items={[{ label: "Edit", onSelect: vi.fn() }]} />);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actions" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  });

  it("calls onSelect and closes when an item is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<Harness items={[{ label: "Delete", onSelect, destructive: true }]} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness items={[{ label: "Edit", onSelect: vi.fn() }]} />);

    const trigger = screen.getByRole("button", { name: "Actions" });
    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("navigates items with ArrowDown/ArrowUp and selects with Enter, skipping disabled items", async () => {
    const user = userEvent.setup();
    const onSelectFirst = vi.fn();
    const onSelectThird = vi.fn();
    render(
      <Harness
        items={[
          { label: "First", onSelect: onSelectFirst },
          { label: "Second (disabled)", onSelect: vi.fn(), disabled: true },
          { label: "Third", onSelect: onSelectThird },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Actions" }));
    const menu = screen.getByRole("menu");
    menu.focus();

    // From "First" (initial active item, the first non-disabled one), ArrowDown skips the
    // disabled item and lands on "Third".
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Enter}");

    expect(onSelectThird).toHaveBeenCalledTimes(1);
    expect(onSelectFirst).not.toHaveBeenCalled();
  });

  describe("viewport clamping", () => {
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    beforeEach(() => {
      Object.defineProperty(window, "innerWidth", { value: 400, writable: true, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 800, writable: true, configurable: true });
    });

    afterEach(() => {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it("nudges the menu back on-screen when it would overflow the right edge", async () => {
      const user = userEvent.setup();
      // Trigger sits near the right edge of a 400px-wide viewport; a naive `align="end"`
      // placement (right-aligned to the trigger) would put a 220px-wide menu partly off-screen.
      HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
        if (this.getAttribute("role") === "menu") {
          return { top: 40, left: 210, right: 430, bottom: 158, width: 220, height: 118 } as DOMRect;
        }
        return { top: 10, left: 350, right: 390, bottom: 30, width: 40, height: 20 } as DOMRect;
      };

      render(<Harness align="end" items={[{ label: "Edit", onSelect: vi.fn() }]} />);
      await user.click(screen.getByRole("button", { name: "Actions" }));

      // Naive `align="end"` placement (before clamping) puts `left` at the trigger's right edge
      // (390, from the mocked trigger rect above) — the clamp effect should pull it further
      // left once it measures the rendered menu overflowing the mocked 400px viewport.
      const menu = await screen.findByRole("menu");
      await waitFor(() => {
        const left = Number.parseFloat(menu.style.left);
        expect(left).toBeLessThan(390);
      });
    });
  });
});
