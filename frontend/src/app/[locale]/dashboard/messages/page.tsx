"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RequireRole } from "@/components/require-role";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppSelector } from "@/lib/redux/hooks";
import { useSocket } from "@/hooks/use-socket";
import {
  useGetVendorMessagesQuery,
  useSendVendorMessageMutation,
  useMarkVendorMessagesReadMutation,
} from "@/lib/redux/services/vendor-messages-api";
import type { VendorMessage } from "@/lib/redux/services/vendor-messages-api";
import { getErrorMessage } from "@/lib/redux/error";
import { cn } from "@/lib/cn";

function MessageBubble({ message, mine }: { message: VendorMessage; mine: boolean }) {
  const t = useTranslations("VendorMessagesPage");
  const locale = useLocale();
  return (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          mine ? "bg-primary text-primary-foreground" : "bg-secondary text-text",
        )}
      >
        {message.body}
      </div>
      <span className="text-xs text-text-muted">
        {mine ? t("you") : t("support")} · {new Date(message.createdAt).toLocaleString(locale)}
      </span>
    </div>
  );
}

function MessagesThread() {
  const t = useTranslations("VendorMessagesPage");
  const { user } = useAppSelector((state) => state.auth);
  const socket = useSocket();
  // Socket push (below) delivers a new message instantly when the connection is healthy;
  // polling is a guaranteed-eventually-consistent fallback for when it isn't (docs/ROADMAP.md
  // FDP-110) — a real prior bug where the other party never saw a new message without a manual
  // page refresh, traced to the socket not reliably delivering in this app's production
  // deployment. 4s keeps this feeling like a live chat without hammering the API.
  const { data: messages, isLoading, refetch } = useGetVendorMessagesQuery(undefined, {
    pollingInterval: 4000,
  });
  const [sendMessage, { isLoading: sending }] = useSendVendorMessageMutation();
  const [markRead] = useMarkVendorMessagesReadMutation();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void markRead();
  }, [markRead]);

  useEffect(() => {
    if (!socket || !user) return;
    socket.emit("vendor-conversation:subscribe", { vendorId: user.id });

    const handleNew = () => {
      void refetch();
      void markRead();
    };
    socket.on("vendor-message:new", handleNew);
    return () => {
      socket.off("vendor-message:new", handleNew);
    };
  }, [socket, user, refetch, markRead]);

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setError(null);
    setDraft("");
    try {
      await sendMessage({ body }).unwrap();
    } catch (err) {
      setError(getErrorMessage(err));
      setDraft(body);
    }
  }

  return (
    <Container className="flex flex-col gap-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text">{t("title")}</h1>
        <p className="text-text-muted">{t("description")}</p>
      </div>

      <Card className="flex h-[32rem] flex-col overflow-hidden">
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          {isLoading ? (
            <>
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="h-12 w-2/3 self-end" />
            </>
          ) : !messages || messages.length === 0 ? (
            <EmptyState title={t("noMessagesYet")} description={t("noMessagesYetDescription")} className="my-auto" />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m._id} message={m} mine={m.senderRole === "restaurant_owner"} />
            ))
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
        <form onSubmit={(e) => void handleSend(e)} className="flex items-center gap-2 border-t border-border p-3">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" isLoading={sending} disabled={!draft.trim()}>
            {t("send")}
          </Button>
        </form>
      </Card>
    </Container>
  );
}

export default function VendorMessagesPage() {
  return (
    // Admin is deliberately excluded here (unlike most other /dashboard pages) — this route is
    // the vendor's own conversation with "admin" as a role, keyed by the caller's own user id;
    // an admin visiting it would just see an empty thread under their own account, not the admin
    // inbox they actually want (that's the "Messages" tab in /admin instead).
    <RequireRole roles={["restaurant_owner"]}>
      <MessagesThread />
    </RequireRole>
  );
}
