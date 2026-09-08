"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { useToast } from "@/components/ui/toast";
import { useSocket } from "@/hooks/use-socket";
import {
  useListVendorConversationsQuery,
  useGetVendorConversationMessagesQuery,
  useSendAdminVendorMessageMutation,
  useMarkVendorConversationReadMutation,
} from "@/lib/redux/services/vendor-messages-api";
import type { VendorConversation, VendorMessage } from "@/lib/redux/services/vendor-messages-api";
import { useListUsersQuery } from "@/lib/redux/services/users-api";
import { getErrorMessage } from "@/lib/redux/error";
import { cn } from "@/lib/cn";

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

function ConversationRow({
  conversation,
  active,
  onSelect,
}: {
  conversation: VendorConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("AdminMessagesTab");
  const timeAgo = useTimeAgo();

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col gap-1 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-secondary",
        active && "bg-primary-subtle",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-text">
          {conversation.vendorName ?? t("unknownVendor")}
        </span>
        {conversation.unreadByAdmin > 0 && (
          <span className="flex size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        )}
      </div>
      <span className="line-clamp-1 text-xs text-text-muted">{conversation.lastMessagePreview}</span>
      <span className="text-xs text-text-muted">{timeAgo(conversation.lastMessageAt)}</span>
    </button>
  );
}

function MessageBubble({ message }: { message: VendorMessage }) {
  const t = useTranslations("AdminMessagesTab");
  const locale = useLocale();
  const mine = message.senderRole === "admin";

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
        {mine ? t("supportTeam") : t("vendor")} · {new Date(message.createdAt).toLocaleString(locale)}
      </span>
    </div>
  );
}

function ConversationThread({ vendorId }: { vendorId: string }) {
  const t = useTranslations("AdminMessagesTab");
  const { toast } = useToast();
  const socket = useSocket();
  // Socket push (below) delivers a new message instantly when the connection is healthy;
  // polling is a guaranteed-eventually-consistent fallback for when it isn't (docs/ROADMAP.md
  // FDP-110) — a real prior bug where the other party never saw a new message without a manual
  // page refresh, traced to the socket not reliably delivering in this app's production
  // deployment. 4s keeps this feeling like a live chat without hammering the API.
  const {
    data: messages,
    isLoading,
    refetch,
  } = useGetVendorConversationMessagesQuery(vendorId, { pollingInterval: 4000 });
  const [sendMessage, { isLoading: sending }] = useSendAdminVendorMessageMutation();
  const [markRead] = useMarkVendorConversationReadMutation();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void markRead(vendorId);
  }, [vendorId, markRead]);

  useEffect(() => {
    if (!socket) return;
    socket.emit("vendor-conversation:subscribe", { vendorId });

    const handleNew = () => {
      void refetch();
      void markRead(vendorId);
    };
    socket.on("vendor-message:new", handleNew);
    return () => {
      socket.off("vendor-message:new", handleNew);
    };
  }, [socket, vendorId, refetch, markRead]);

  useEffect(() => {
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await sendMessage({ vendorId, body }).unwrap();
    } catch (err) {
      toast({ title: t("couldNotSendMessage"), description: getErrorMessage(err), variant: "danger" });
      setDraft(body);
    }
  }

  return (
    <Card className="flex h-[32rem] flex-col overflow-hidden">
      <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-2/3 self-end" />
          </>
        ) : !messages || messages.length === 0 ? (
          <EmptyState title={t("noMessagesYet")} className="my-auto" />
        ) : (
          messages.map((m) => <MessageBubble key={m._id} message={m} />)
        )}
      </div>
      <form onSubmit={(e) => void handleSend(e)} className="flex items-center gap-2 border-t border-border p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("replyPlaceholder")}
          aria-label={t("replyPlaceholder")}
          disabled={sending}
          className="flex-1"
        />
        <Button type="submit" isLoading={sending} disabled={!draft.trim()}>
          {t("send")}
        </Button>
      </form>
    </Card>
  );
}

function NewConversationModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (vendorId: string) => void;
}) {
  const t = useTranslations("AdminMessagesTab");
  const { toast } = useToast();
  const { data: vendors, isLoading } = useListUsersQuery(
    { role: "restaurant_owner", limit: 50 },
    { skip: !open },
  );
  const [sendMessage, { isLoading: sending }] = useSendAdminVendorMessageMutation();
  const [vendorId, setVendorId] = useState("");
  const [body, setBody] = useState("");

  const options = useMemo(
    () => (vendors?.items ?? []).map((v) => ({ value: v.id, label: `${v.name} (${v.email})` })),
    [vendors],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vendorId || !body.trim()) return;
    try {
      await sendMessage({ vendorId, body: body.trim() }).unwrap();
      setVendorId("");
      setBody("");
      onStarted(vendorId);
      onClose();
    } catch (err) {
      toast({ title: t("couldNotSendMessage"), description: getErrorMessage(err), variant: "danger" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("newMessage")}>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4" noValidate>
        <FormField label={t("vendor")} required>
          {isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              options={options}
              value={vendorId}
              onChange={setVendorId}
              searchable
              placeholder={t("selectVendor")}
            />
          )}
        </FormField>
        <FormField label={t("message")} required>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("messagePlaceholder")} />
        </FormField>
        <Button type="submit" isLoading={sending} disabled={!vendorId || !body.trim()} className="self-start">
          {t("send")}
        </Button>
      </form>
    </Modal>
  );
}

export function MessagesTab() {
  const t = useTranslations("AdminMessagesTab");
  const [page, setPage] = useState(1);
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  // Same guaranteed-fallback reasoning as ConversationThread's message polling above — keeps
  // unread dots/last-message previews current in the list even if the socket never connects.
  const { data, isLoading } = useListVendorConversationsQuery(
    { page, limit: 20 },
    { pollingInterval: 8000 },
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-text-muted">{t("description")}</p>
        <Button onClick={() => setNewConversationOpen(true)}>{t("newMessage")}</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="flex h-[32rem] flex-col overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-3 p-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState title={t("noConversationsYet")} description={t("noConversationsYetDescription")} className="m-auto" />
          ) : (
            data.items.map((conversation) => (
              <ConversationRow
                key={conversation.vendorId}
                conversation={conversation}
                active={conversation.vendorId === selectedVendorId}
                onSelect={() => setSelectedVendorId(conversation.vendorId)}
              />
            ))
          )}
        </Card>

        {selectedVendorId ? (
          <ConversationThread key={selectedVendorId} vendorId={selectedVendorId} />
        ) : (
          <Card className="flex h-[32rem] items-center justify-center">
            <EmptyState title={t("selectAConversation")} />
          </Card>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      )}

      <NewConversationModal
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onStarted={setSelectedVendorId}
      />
    </div>
  );
}
