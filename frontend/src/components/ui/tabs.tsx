"use client";

import { cn } from "@/lib/cn";
import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";

interface TabsContextValue {
  value: string;
  onChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tabs.* components must be used within <Tabs>");
  return ctx;
}

export interface TabsProps {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Tabs({ value, onChange, children, className }: TabsProps) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onChange, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabList({ children, className }: { children: ReactNode; className?: string }) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;
    e.preventDefault();

    let nextIndex = currentIndex;
    if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (e.key === "Home") nextIndex = 0;
    if (e.key === "End") nextIndex = tabs.length - 1;

    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn("flex gap-1 border-b border-border", className)}
    >
      {children}
    </div>
  );
}

export function Tab({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) {
  const { value: active, onChange, baseId } = useTabsContext();
  const selected = active === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={selected}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={() => onChange(value)}
      className={cn(
        "border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150",
        selected ? "border-primary text-primary" : "border-transparent text-text-muted hover:text-text",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {children}
    </button>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { value: active, baseId } = useTabsContext();
  if (active !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={cn("py-4", className)}
    >
      {children}
    </div>
  );
}
