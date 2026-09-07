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
    expect(screen.queryByText("Refunds go back to your original payment method.")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Refunds go back to your original payment method.")).not.toBeInTheDocument();
  });

  it("toggles via the keyboard, and keeps other items independently open", async () => {
    const user = userEvent.setup();
    render(<Accordion items={items} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveAttribute("aria-expanded", "true");

    await user.tab();
    await user.keyboard(" ");
    expect(screen.getByRole("button", { name: "How do I track my order?" })).toHaveAttribute("aria-expanded", "true");
    // The first item stays open too — items toggle independently, not single-open-at-a-time.
    expect(screen.getByRole("button", { name: "How do refunds work?" })).toHaveAttribute("aria-expanded", "true");
  });
});
