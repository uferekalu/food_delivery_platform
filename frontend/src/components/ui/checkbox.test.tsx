import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("associates the label via htmlFor/id when a label is given", () => {
    render(<Checkbox label="Accept terms" id="accept-terms" />);
    expect(screen.getByRole("checkbox", { name: "Accept terms" })).toBeInTheDocument();
  });

  it("renders a bare input with no wrapping label when label is omitted", () => {
    render(<Checkbox aria-label="Bare checkbox" />);
    const checkbox = screen.getByRole("checkbox", { name: "Bare checkbox" });
    expect(checkbox.closest("label")).toBeNull();
  });

  it("toggles a controlled checked value on click", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox label="Subscribe" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
      );
    }
    render(<Controlled />);

    const checkbox = screen.getByRole("checkbox", { name: "Subscribe" });
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it("is inert when disabled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Checkbox label="Disabled option" disabled onChange={onChange} />);

    await user.click(screen.getByRole("checkbox", { name: "Disabled option" }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
