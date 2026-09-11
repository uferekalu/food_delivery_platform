"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { usePushNotifications } from "@/lib/push-notifications";
import {
  useListNotificationsQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from "@/lib/redux/services/notifications-api";
import type { Notification } from "@/lib/redux/restaurant-types";

function PushNotificationsToggle() {
  const t = useTranslations("NotificationsPage");
  const { supported, configured, checked, isSubscribed, isBusy, error, subscribe, unsubscribe } = usePushNotifications();

  if (!supported || !configured || !checked) return null;

  const errorMessage =
    error === "permission-denied" ? t("pushPermissionDenied") : error === "failed" ? t("pushCouldNotUpdate") : null;

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text">{t("pushNotifications")}</span>
            <span className="text-sm text-text-muted">{t("pushNotificationsDescription")}</span>
          </div>
          <Switch
            label={t("pushNotifications")}
            checked={isSubscribed}
            disabled={isBusy}
            onChange={(checked) => void (checked ? subscribe() : unsubscribe())}
          />
        </div>
        {errorMessage && <Alert variant="danger">{errorMessage}</Alert>}
      </CardContent>
    </Card>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function NotificationCard({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  const t = useTranslations("NotificationsPage");
  // Defensive against `metadata` being genuinely absent — see NotificationRow's identical guard
  // in notification-bell.tsx for the full reasoning (docs/ROADMAP.md FDP-127).
  const orderId = typeof notification.metadata?.orderId === "string" ? notification.metadata.orderId : null;

  return (
    <Card className={cn(!notification.isRead && "border-primary")}>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text">{notification.title}</span>
          <p className="text-sm text-text-muted">{notification.body}</p>
          <span className="text-xs text-text-muted">{formatDateTime(notification.createdAt)}</span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {orderId && (
            <Link
              href={`/orders/${orderId}`}
              onClick={() => !notification.isRead && onMarkRead(notification._id)}
              className="text-sm text-primary hover:underline"
            >
              {t("viewOrder")}
            </Link>
          )}
          {!notification.isRead && (
            <Button variant="ghost" size="sm" onClick={() => onMarkRead(notification._id)}>
              {t("markRead")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NotificationsList() {
  const t = useTranslations("NotificationsPage");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListNotificationsQuery({ page, limit: 15 });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAllRead, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return <EmptyState title={t("noNotificationsYet")} description={t("updatesShowUpHere")} />;
  }

  const hasUnread = data.items.some((n) => !n.isRead);

  return (
    <div className="flex flex-col gap-4">
      {hasUnread && (
        <Button variant="outline" size="sm" className="self-end" isLoading={markingAll} onClick={() => void markAllRead()}>
          {t("markAllRead")}
        </Button>
      )}
      <div className="flex flex-col gap-3">
        {data.items.map((notification) => (
          <NotificationCard key={notification._id} notification={notification} onMarkRead={(id) => void markRead(id)} />
        ))}
      </div>
      <Pagination page={page} totalPages={data.totalPages} onChange={setPage} className="self-center" />
    </div>
  );
}

export default function NotificationsPage() {
  const t = useTranslations("NotificationsPage");
  const { status } = useAppSelector((state) => state.auth);

  if (status === "idle") {
    return (
      <Container className="flex justify-center py-24">
        <Spinner size="lg" label={t("checkingSession")} />
      </Container>
    );
  }

  if (status !== "authenticated") {
    return (
      <Container className="py-10">
        <EmptyState
          title={t("logInToViewNotifications")}
          description={t("needToBeLoggedInNotifications")}
          action={
            <Link href="/login" className={buttonVariants({ variant: "primary" })}>
              {t("logIn")}
            </Link>
          }
        />
      </Container>
    );
  }

  return (
    <Container className="max-w-2xl py-10">
      <h1 className="mb-6 text-2xl font-bold text-text">{t("notifications")}</h1>
      <PushNotificationsToggle />
      <NotificationsList />
    </Container>
  );
}
