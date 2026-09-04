import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { MoneyInput } from "./money-input";

function Harness({
  currencyCode,
  initialValue,
  onChangeSpy,
}: {
  currencyCode?: string;
  initialValue?: number;
  onChangeSpy?: (value: number | undefined) => void;
}) {
  const [value, setValue] = useState<number | undefined>(initialValue);
  return (
    <MoneyInput
      aria-label="Price"
      value={value}
      currencyCode={currencyCode}
      locale="en-US"
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
    />
  );
}

describe("MoneyInput", () => {
  it("groups thousands as the user types", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.type(input, "1000000");
    expect(input).toHaveValue("1,000,000");
  });

  it("reports the raw numeric value to onChange, not the formatted display text", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness onChangeSpy={onChangeSpy} />);
    await user.type(screen.getByRole("textbox", { name: "Price" }), "2500");
    expect(onChangeSpy).toHaveBeenLastCalledWith(2500);
  });

  it("preserves an in-progress decimal point instead of stripping it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.type(input, "12.");
    expect(input).toHaveValue("12.");
  });

  it("formats decimals with grouping on the integer part only", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.type(input, "1000.5");
    expect(input).toHaveValue("1,000.5");
  });

  it("strips non-numeric characters (e.g. a pasted currency symbol)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.type(input, "$1,000abc");
    expect(input).toHaveValue("1,000");
  });

  it("shows the currency symbol as a leading adornment when a currency code is given", () => {
    render(<Harness currencyCode="NGN" />);
    expect(screen.getByText("₦")).toBeInTheDocument();
  });

  it("shows no adornment when no currency code is given", () => {
    render(<Harness />);
    expect(screen.queryByText("₦")).not.toBeInTheDocument();
    expect(screen.queryByText("$")).not.toBeInTheDocument();
  });

  it("clears to blank (undefined), not 0, when the field is emptied", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness initialValue={50} onChangeSpy={onChangeSpy} />);
    const input = screen.getByRole("textbox", { name: "Price" });
    await user.clear(input);
    expect(input).toHaveValue("");
    expect(onChangeSpy).toHaveBeenLastCalledWith(undefined);
  });

  it("reflects an externally-set value (e.g. loading an existing item to edit)", () => {
    render(<Harness initialValue={1234.5} />);
    expect(screen.getByRole("textbox", { name: "Price" })).toHaveValue("1,234.5");
  });
});
