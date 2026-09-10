import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Accordion } from "./accordion";

const items = [
  { question: "How do refunds work?", answer: "Refunds go back to your original payment method." },
  { question: "How do I track my order?", answer: "Open the order detail page for a live map." },
];

describe("Accordion", () => {
  it("renders every question collapsed by default, with answers hidden", () => {
    render(<Accordion items={items} />);

    for (const item of items) {
      expect(screen.getByRole("button", { name: item.question })).toHaveAttribute("aria-expanded", "false");
    }
    // The panel stays mounted (a pure-CSS grid-row collapse drives the open/close animation, see
    // accordion.tsx's own comment) rather than unmounting, so `aria-hidden` is the correct signal
    // to check here, not DOM presence.
    expect(screen.getByText("Refunds go back to your original payment method.").closest('[role="region"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("expands an item on click, revealing its answer", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    const trigger = screen.getByRole("button", { name: "How do refunds work?" });
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Refunds go back to your original payment method.")).toBeInTheDocument();
  });

  it("collapses an already-open item on a second click", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    const trigger = screen.getByRole("button", { name: "How do refunds work?" });
    await user.click(trigger);
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Refunds go back to your original payment method.").closest('[role="region"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("toggles via the keyboard", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opening a second item closes whichever one was already open (single-open-at-a-time)", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.click(screen.getByRole("button", { name: "How do refunds work?" }));
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "How do I track my order?" }));
    expect(screen.getByRole("button", { name: "How do I track my order?" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveAttribute("aria-expanded", "false");
  });
});
