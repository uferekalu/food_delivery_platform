import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RadioGroup, RadioOption } from "./radio-group";

function ControlledGroup({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("customer");
  return (
    <RadioGroup
      label="I am a"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    >
      <RadioOption value="customer" label="Customer" />
      <RadioOption value="restaurant_owner" label="Restaurant owner" description="I run a restaurant" />
      <RadioOption value="disabled_option" label="Unavailable" disabled />
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("exposes a radiogroup role labeled by the group label", () => {
    render(<ControlledGroup />);
    expect(screen.getByRole("radiogroup", { name: "I am a" })).toBeInTheDocument();
  });

  it("renders exactly one checked option matching the controlled value", () => {
    render(<ControlledGroup />);
    expect(screen.getByRole("radio", { name: "Customer" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Restaurant owner/ })).not.toBeChecked();
  });

  it("calls onChange with the selected option's value on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledGroup onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: /Restaurant owner/ }));

    expect(onChange).toHaveBeenCalledWith("restaurant_owner");
    expect(screen.getByRole("radio", { name: /Restaurant owner/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Customer" })).not.toBeChecked();
  });

  it("does not select a disabled option", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledGroup onChange={onChange} />);

    await user.click(screen.getByRole("radio", { name: "Unavailable" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shares one input `name` across all options so arrow-key navigation works natively", () => {
    render(<ControlledGroup />);
    const customer = screen.getByRole("radio", { name: "Customer" }) as HTMLInputElement;
    const owner = screen.getByRole("radio", { name: /Restaurant owner/ }) as HTMLInputElement;
    expect(customer.name).toBe(owner.name);
  });
});
