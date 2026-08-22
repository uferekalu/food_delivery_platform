"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { IconButton } from "@/components/ui/icon-button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AuthStatus } from "./auth-status";

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Below `sm` (640px), the header's inline auth/theme controls would overflow — see
 * frontend/CLAUDE.md "Responsive design". This collapses them into a hamburger-triggered menu,
 * reusing `Modal` (already handles focus trap/Escape/portal correctly) rather than a bespoke
 * drawer implementation.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <IconButton label="Open menu" icon={<MenuIcon />} onClick={() => setOpen(true)} />
      <Modal open={open} onClose={() => setOpen(false)} title="Menu" size="sm">
        <div className="flex flex-col gap-5">
          <AuthStatus variant="stacked" onNavigate={() => setOpen(false)} />
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-text-muted">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </Modal>
    </div>
  );
}
