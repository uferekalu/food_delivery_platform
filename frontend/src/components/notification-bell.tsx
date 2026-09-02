"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { Portal } from "@/components/ui/portal";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useSocket } from "@/hooks/use-socket";
import { api } from "@/lib/redux/api";
import {
  useGetUnreadNotificationCountQuery,
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/lib/redux/services/notifications-api";
import type { Notification } from "@/lib/redux/restaurant-types";

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-5">
      <path
        d="M10 2a5 5 0 0 0-5 5v2.17c0 .8-.3 1.57-.86 2.14L3 12.5h14l-1.14-1.19A3 3 0 0 1 15 9.17V7a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7.5 15.5a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function useTimeAgo() {
  const t = useTranslations("NotificationBell");
  return (iso: string): string => {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return t("justNow");
    if (minutes < 60) return t("minutesAgo", { minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hoursAgo", { hours });
    return t("daysAgo", { days: Math.floor(hours / 24) });
  };
}

function NotificationRow({ notification, onOpen }: { notification: Notification; onOpen: (n: Notification) => void }) {
  const timeAgo = useTimeAgo();
  const orderId = typeof notification.metadata.orderId === "string" ? notification.metadata.orderId : null;

  const body = (
    <div className="flex items-start gap-2">
      <span
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.isRead ? "bg-transparent" : "bg-primary")}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-text">{notification.title}</span>
        <span className="line-clamp-2 text-sm text-text-muted">{notification.body}</span>
        <span className="text-xs text-text-muted">{timeAgo(notification.createdAt)}</span>
      </div>
    </div>
  );

  const className = cn("block w-full rounded-md px-3 py-2 text-left hover:bg-secondary", !notification.isRead && "bg-primary-subtle");

  if (orderId) {
    return (
      <Link href={`/orders/${orderId}`} onClick={() => onOpen(notification)} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onOpen(notification)} className={className}>
      {body}
    </button>
  );
}

/**
 * Lives directly in the header (never inside `MobileNav`'s `Drawer`) — see frontend/CLAUDE.md
 * "Never nest a DropdownMenu-based control inside Modal/Drawer": this panel is portal-based,
 * same z-index tier as `DropdownMenu`, so it would be invisible behind a Drawer's backdrop if
 * opened from inside one. Visible at every breakpoint (like `CartDrawer`), not collapsed into
 * the hamburger menu.
 */
export function NotificationBell() {
  const t = useTranslations("NotificationBell");
  const { status } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated";
  const dispatch = useAppDispatch();
  const socket = useSocket();

  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: unread } = useGetUnreadNotificationCountQuery(undefined, { skip: !authenticated });
  const { data, isLoading } = useListNotificationsQuery({ limit: 8 }, { skip: !authenticated || !open });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  const closePanel = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!socket) return;
    const handleNew = () => {
      dispatch(
        api.util.invalidateTags([
          { type: "Notification", id: "LIST" },
          { type: "Notification", id: "UNREAD_COUNT" },
        ]),
      );
    };
    socket.on("notification:new", handleNew);
    return () => {
      socket.off("notification:new", handleNew);
    };
  }, [socket, dispatch]);

  useEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (el) {
      // Right-anchored to the trigger, but clamped so a fixed-width panel never runs off the
      // left edge on a narrow viewport — see frontend/CLAUDE.md "Overlay/positioned components
      // must clamp to the viewport after render" (DropdownMenu's own measure-then-clamp
      // pattern). PANEL_WIDTH mirrors the `w-80`/`max-w-[calc(100vw-1rem)]` classes below.
      const GUTTER = 8;
      const r = el.getBoundingClientRect();
      const panelWidth = Math.min(320, window.innerWidth - GUTTER * 2);
      let left = r.right - panelWidth;
      if (left < GUTTER) left = GUTTER;
      if (left + panelWidth > window.innerWidth - GUTTER) left = window.innerWidth - GUTTER - panelWidth;
      setRect({ top: r.bottom + 8, left });
    }

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      closePanel();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, closePanel]);

  if (!authenticated) return null;

  const count = unread?.count ?? 0;
  const notifications = data?.items ?? [];

  return (
    <div className="relative">
      <IconButton
        ref={triggerRef}
        label={t("notifications")}
        icon={<BellIcon />}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
      />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-neutral-0">
          {count > 9 ? "9+" : count}
        </span>
      )}
      {open && rect && (
        <Portal>
          <div
            ref={panelRef}
            style={{ position: "fixed", top: rect.top, left: rect.left, zIndex: "var(--z-dropdown)" }}
            className="flex max-h-[28rem] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-text">{t("notifications")}</span>
              {count > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={markingAll}
                  onClick={() => void markAllRead()}
                >
                  {t("markAllRead")}
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1 overflow-y-auto p-2">
              {isLoading ? (
                <>
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </>
              ) : notifications.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-text-muted">{t("allCaughtUp")}</p>
              ) : (
                notifications.map((notification) => (
                  <NotificationRow
                    key={notification._id}
                    notification={notification}
                    onOpen={(n) => {
                      if (!n.isRead) void markRead(n._id);
                      closePanel();
                    }}
                  />
                ))
              )}
            </div>
            <Link
              href="/notifications"
              onClick={closePanel}
              className="border-t border-border px-3 py-2 text-center text-sm text-primary hover:underline"
            >
              {t("viewAll")}
            </Link>
          </div>
        </Portal>
      )}
    </div>
  );
}
