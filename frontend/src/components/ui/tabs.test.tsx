import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "./tabs";

function ControlledTabs({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("profile");
  return (
    <Tabs
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    >
      <TabList>
        <Tab value="profile">Profile</Tab>
        <Tab value="orders">Orders</Tab>
        <Tab value="settings" disabled>
          Settings
        </Tab>
      </TabList>
      <TabPanel value="profile">Profile panel</TabPanel>
      <TabPanel value="orders">Orders panel</TabPanel>
      <TabPanel value="settings">Settings panel</TabPanel>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders only the active panel", () => {
    render(<ControlledTabs />);
    expect(screen.getByText("Profile panel")).toBeInTheDocument();
    expect(screen.queryByText("Orders panel")).not.toBeInTheDocument();
  });

  it("switches panels on tab click", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    await user.click(screen.getByRole("tab", { name: "Orders" }));

    expect(screen.getByText("Orders panel")).toBeInTheDocument();
    expect(screen.queryByText("Profile panel")).not.toBeInTheDocument();
  });

  it("marks the active tab with aria-selected and disabled tabs as non-interactive", () => {
    render(<ControlledTabs />);
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Settings" })).toBeDisabled();
  });

  it("navigates and activates tabs with arrow keys, skipping disabled ones", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledTabs onChange={onChange} />);

    screen.getByRole("tab", { name: "Profile" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(onChange).toHaveBeenCalledWith("orders");
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveFocus();
  });

  it("End key jumps to the last enabled tab (disabled tabs are excluded), Home jumps to the first", async () => {
    const user = userEvent.setup();
    render(<ControlledTabs />);

    screen.getByRole("tab", { name: "Profile" }).focus();
    await user.keyboard("{End}");
    // "Settings" is disabled and excluded from keyboard navigation entirely — the last reachable
    // tab is "Orders".
    expect(screen.getByRole("tab", { name: "Orders" })).toHaveFocus();

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Profile" })).toHaveFocus();
  });
});
