import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { Modal } from "./modal";

function ModalHarness({ onClose = vi.fn() }: { onClose?: () => void }) {
  return (
    <Modal open title="Delete restaurant" description="This can't be undone." onClose={onClose}>
      <button type="button">First field</button>
      <button type="button">Last field</button>
    </Modal>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} title="Hidden" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title, description, and children when open", () => {
    render(<ModalHarness />);
    expect(screen.getByRole("dialog", { name: "Delete restaurant" })).toBeInTheDocument();
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "First field" })).toBeInTheDocument();
  });

  it("moves focus into the dialog on open (first focusable element in DOM order — the close button)", async () => {
    render(<ModalHarness />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    });
  });

  it("calls onClose on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(<ModalHarness onClose={onClose} />);
    const backdrop = container.ownerDocument.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();

    await user.click(backdrop as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus within the dialog", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    // DOM order is [Close button, First field, Last field] — the close button renders before
    // the children slot, and is what receives initial focus (see the test above).
    const closeButton = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last field" });

    await waitFor(() => expect(closeButton).toHaveFocus());

    // Shift+Tab from the first focusable element wraps to the last.
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    // Tab from the last wraps back to the first.
    await user.tab();
    expect(closeButton).toHaveFocus();
  });
});
