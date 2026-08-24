import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Rating } from "./rating";

function ControlledRating({ onChange }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState(3);
  return (
    <Rating
      label="Rate the restaurant"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Rating", () => {
  describe("read-only mode (no onChange)", () => {
    it("exposes an img role summarizing the value, with no interactive controls", () => {
      render(<Rating value={4.3} label="Burgundy Kitchen" />);
      expect(screen.getByRole("img", { name: "Burgundy Kitchen: 4.3 out of 5 stars" })).toBeInTheDocument();
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    });

    it("rounds a fractional value for the visual fill without changing the reported summary", () => {
      // 4.3 rounds to 4 filled stars, but the accessible name still reports the real 4.3.
      render(<Rating value={4.3} />);
      expect(screen.getByRole("img", { name: "4.3 out of 5 stars" })).toBeInTheDocument();
    });
  });

  describe("interactive mode (onChange provided)", () => {
    it("renders 5 radio inputs sharing one name, for native keyboard arrow navigation", () => {
      render(<ControlledRating />);
      const radios = screen.getAllByRole("radio") as HTMLInputElement[];
      expect(radios).toHaveLength(5);
      expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    });

    it("marks exactly the star matching the controlled value as checked", () => {
      render(<ControlledRating />);
      expect(screen.getByRole("radio", { name: "Rate the restaurant: 3 stars" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Rate the restaurant: 5 stars" })).not.toBeChecked();
    });

    it("calls onChange with the clicked star's value", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ControlledRating onChange={onChange} />);

      await user.click(screen.getByRole("radio", { name: "Rate the restaurant: 5 stars" }));

      expect(onChange).toHaveBeenCalledWith(5);
      expect(screen.getByRole("radio", { name: "Rate the restaurant: 5 stars" })).toBeChecked();
    });

    it("supports keyboard selection via focus + native radio activation", async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<ControlledRating onChange={onChange} />);

      screen.getByRole("radio", { name: "Rate the restaurant: 1 star" }).focus();
      await user.keyboard("[ArrowRight][ArrowRight]"); // native radio-group nav: 1 -> 2 -> 3

      expect(onChange).toHaveBeenCalledWith(3);
    });
  });
});
