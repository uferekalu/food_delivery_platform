"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { Portal } from "@/components/ui/portal";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { getOrCreateChatSessionId } from "@/lib/chat-session";
import {
  historyLoaded,
  messageAdded,
  panelClosed,
  panelOpened,
} from "@/lib/redux/slices/chat-slice";
import { useAskChatbotMutation, useGetChatHistoryQuery } from "@/lib/redux/services/chatbot-api";
import { getErrorMessage } from "@/lib/redux/error";

function ChatIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-6">
      <path
        d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6A2.5 2.5 0 0 1 14.5 14H9l-4 3v-3H5.5A2.5 2.5 0 0 1 3 11.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const noopSubscribe = () => () => {};

/** True only once mounted on the client — same `useSyncExternalStore` pattern as `Portal`'s
 * `useMounted` (portal.tsx), avoiding a setState-in-effect and any SSR/CSR mismatch from reading
 * `localStorage` (chat-session.ts) before hydration. */
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/**
 * Support chat widget (docs/ROADMAP.md FDP-106) — a scoped, curated-FAQ chatbot with a hard
 * fallback to a human support ticket, not a general assistant. Mounted once in `AppShell`
 * (alongside `CartDrawer`/`NotificationBell`), fixed to the bottom-right corner of every
 * in-scope page. Follows `NotificationBell`'s own portal/click-outside/Escape pattern, but with
 * no viewport-clamped `getBoundingClientRect` positioning — the trigger is always fixed at the
 * same spot, so the panel can just be fixed too (simpler than a moving-anchor panel).
 *
 * Deliberately does NOT reuse `Drawer`/`Modal`'s full-screen backdrop: a support widget is
 * conventionally non-modal — a visitor should be able to keep reading the page while chatting,
 * not have it go inert behind a backdrop. Below `sm`, the panel becomes a full-screen sheet
 * instead (screen space is scarce there), matching the plan's own responsive requirement.
 */
export function ChatWidget() {
  const t = useTranslations("ChatWidget");
  const dispatch = useAppDispatch();
  const { status, user } = useAppSelector((state) => state.auth);
  const authenticated = status === "authenticated" && !!user;
  const { open, unread, messages } = useAppSelector((state) => state.chat);

  // A guest's session id is only ever read/created client-side, after mount — never during SSR.
  const mounted = useMounted();
  const sessionId = useMemo(
    () => (mounted && !authenticated ? getOrCreateChatSessionId() : null),
    [mounted, authenticated],
  );

  const identityReady = authenticated || sessionId !== null;
  const { data: history, isFetching: loadingHistory } = useGetChatHistoryQuery(
    authenticated ? undefined : { sessionId: sessionId ?? undefined },
    { skip: !identityReady },
  );
  useEffect(() => {
    if (!history) return;
    dispatch(
      historyLoaded(
        history.map((m) => ({
          id: m._id,
          question: m.message,
          answer: m.answer,
          matched: m.matched,
          createdAt: m.createdAt,
        })),
      ),
    );
    // Only re-run when the fetched history array itself changes — not on every dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const [ask, { isLoading: sending }] = useAskChatbotMutation();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      dispatch(panelClosed());
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch(panelClosed());
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, dispatch]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight });
  }, [messages, open]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const message = draft.trim();
    if (!message || !identityReady) return;
    setError(null);
    setDraft("");
    try {
      const result = await ask({
        message,
        sessionId: authenticated ? undefined : (sessionId ?? undefined),
      }).unwrap();
      dispatch(
        messageAdded({
          id: crypto.randomUUID(),
          question: message,
          answer: result.answer,
          matched: result.matched,
          createdAt: new Date().toISOString(),
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err));
      setDraft(message); // don't lose what they typed
    }
  }

  return (
    <div className="fixed right-4 bottom-4" style={{ zIndex: "var(--z-sticky)" }}>
      <div className="relative">
        <IconButton
          label={open ? t("closeChat") : t("openChat")}
          icon={<ChatIcon />}
          size="lg"
          variant="primary"
          className="rounded-full shadow-lg"
          onClick={() => dispatch(open ? panelClosed() : panelOpened())}
          aria-expanded={open}
        />
        {unread && !open && (
          <span
            className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-danger ring-2 ring-surface"
            aria-hidden="true"
          />
        )}
      </div>

      {open && (
        <Portal>
          <div
            ref={panelRef}
            style={{ zIndex: "var(--z-modal)" }}
            className={cn(
              "fixed inset-0 flex flex-col bg-surface",
              "sm:inset-auto sm:right-4 sm:bottom-20 sm:h-[32rem] sm:w-96 sm:rounded-lg sm:border sm:border-border sm:shadow-xl",
            )}
            role="dialog"
            aria-modal="false"
            aria-label={t("title")}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-text">{t("title")}</span>
              <IconButton
                label={t("closeChat")}
                size="sm"
                variant="ghost"
                icon={<CloseIcon />}
                onClick={() => dispatch(panelClosed())}
              />
            </div>

            <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <p className="text-sm text-text-muted">{t("greeting")}</p>
              {loadingHistory && messages.length === 0 ? (
                <>
                  <Skeleton className="h-10 w-2/3 self-end" />
                  <Skeleton className="h-10 w-3/4" />
                </>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className="flex flex-col gap-2">
                    <div className="max-w-[85%] self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                      {m.question}
                    </div>
                    <div className="max-w-[85%] self-start rounded-lg bg-secondary px-3 py-2 text-sm text-text">
                      {m.answer}
                    </div>
                  </div>
                ))
              )}
              {error && <p className="text-xs text-danger">{error}</p>}
            </div>

            <form
              onSubmit={(e) => void handleSend(e)}
              className="flex items-center gap-2 border-t border-border p-3"
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("placeholder")}
                aria-label={t("placeholder")}
                disabled={!identityReady || sending}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                isLoading={sending}
                disabled={!draft.trim() || !identityReady}
              >
                {t("send")}
              </Button>
            </form>
          </div>
        </Portal>
      )}
    </div>
  );
}
