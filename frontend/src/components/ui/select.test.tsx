import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { Select, type SelectOption } from "./select";

const FRUIT_OPTIONS: SelectOption[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

function Harness({
  options,
  searchable,
  onChangeSpy,
}: {
  options: SelectOption[];
  searchable?: boolean;
  onChangeSpy?: (value: string) => void;
}) {
  const [value, setValue] = useState<string | undefined>(undefined);
  return (
    <Select
      aria-label="Fruit"
      options={options}
      value={value}
      searchable={searchable}
      onChange={(v) => {
        setValue(v);
        onChangeSpy?.(v);
      }}
    />
  );
}

describe("Select", () => {
  it("is closed by default and opens on trigger click, showing every option", async () => {
    const user = userEvent.setup();
    render(<Harness options={FRUIT_OPTIONS} />);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fruit" }));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
  });

  it("commits a value on click and closes", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness options={FRUIT_OPTIONS} onChangeSpy={onChangeSpy} />);

    await user.click(screen.getByRole("button", { name: "Fruit" }));
    await user.click(screen.getByRole("option", { name: "Cherry" }));

    expect(onChangeSpy).toHaveBeenCalledWith("cherry");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Accessible name stays "Fruit" (from aria-label) — the visible label text is what updates.
    expect(screen.getByRole("button", { name: "Fruit" })).toHaveTextContent("Cherry");
  });

  it("navigates with ArrowDown/Enter and closes on Escape, returning focus to the trigger", async () => {
    const user = userEvent.setup();
    const onChangeSpy = vi.fn();
    render(<Harness options={FRUIT_OPTIONS} onChangeSpy={onChangeSpy} />);

    const trigger = screen.getByRole("button", { name: "Fruit" });
    await user.click(trigger);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onChangeSpy).toHaveBeenCalledWith("banana");

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  describe("searchable", () => {
    it("does not render a search box when not searchable", async () => {
      const user = userEvent.setup();
      render(<Harness options={FRUIT_OPTIONS} />);
      await user.click(screen.getByRole("button", { name: "Fruit" }));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("filters the option list as the search box is typed into", async () => {
      const user = userEvent.setup();
      render(<Harness options={FRUIT_OPTIONS} searchable />);

      await user.click(screen.getByRole("button", { name: "Fruit" }));
      const search = screen.getByRole("textbox");
      await user.type(search, "an");

      expect(screen.getByRole("option", { name: "Banana" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Apple" })).not.toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Cherry" })).not.toBeInTheDocument();
    });

    it("shows a no-matches state instead of an empty list", async () => {
      const user = userEvent.setup();
      render(<Harness options={FRUIT_OPTIONS} searchable />);

      await user.click(screen.getByRole("button", { name: "Fruit" }));
      await user.type(screen.getByRole("textbox"), "xyz");

      expect(screen.getByText("No matches")).toBeInTheDocument();
    });

    it("navigates and commits from the search box itself, against the filtered list", async () => {
      const user = userEvent.setup();
      const onChangeSpy = vi.fn();
      render(<Harness options={FRUIT_OPTIONS} searchable onChangeSpy={onChangeSpy} />);

      await user.click(screen.getByRole("button", { name: "Fruit" }));
      const search = screen.getByRole("textbox");
      await user.type(search, "a"); // matches Apple, Banana — not Cherry
      await user.keyboard("{ArrowDown}{Enter}"); // Apple (index 0) -> Banana (index 1)

      expect(onChangeSpy).toHaveBeenCalledWith("banana");
    });

    it("resets the search query each time the list is reopened", async () => {
      const user = userEvent.setup();
      render(<Harness options={FRUIT_OPTIONS} searchable />);

      const trigger = screen.getByRole("button", { name: "Fruit" });
      await user.click(trigger);
      await user.type(screen.getByRole("textbox"), "xyz");
      await user.keyboard("{Escape}");

      await user.click(trigger);
      expect(screen.getByRole("textbox")).toHaveValue("");
      expect(screen.getByRole("option", { name: "Apple" })).toBeInTheDocument();
    });
  });
});
