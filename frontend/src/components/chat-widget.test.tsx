import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Provider } from "react-redux";
import messages from "../../messages/en.json";
import { makeStore } from "@/lib/redux/store";
import { setSession } from "@/lib/redux/slices/auth-slice";
import { useAskChatbotMutation, useGetChatHistoryQuery } from "@/lib/redux/services/chatbot-api";
import type { AskChatbotResult, ChatMessageRecord } from "@/lib/redux/services/chatbot-api";
import { ChatWidget } from "./chat-widget";

// Mocked at the RTK Query hook boundary, not the network — this codebase has no MSW/fetch-mocking
// infra yet, and `fetchBaseQuery`'s "modern" build pre-constructs a `Request` from the app's
// deliberately-relative `/api` baseUrl (api.ts) before ever calling `fetch`; Node's undici
// `Request` (unlike a real browser's) has no document base to resolve a relative URL against, so
// it throws regardless of what `global.fetch` is stubbed to. That's a Node-test-environment gap,
// not a real bug — the relative baseUrl is intentional (see api.ts) and works fine in a browser.
// Mocking the hooks directly tests everything that's actually this component's own logic (open/
// close, identity resolution, dispatching into `chat-slice`, rendering) without fighting that gap.
vi.mock("@/lib/redux/services/chatbot-api", () => ({
  useAskChatbotMutation: vi.fn(),
  useGetChatHistoryQuery: vi.fn(),
}));

const mockedUseAskChatbotMutation = vi.mocked(useAskChatbotMutation);
const mockedUseGetChatHistoryQuery = vi.mocked(useGetChatHistoryQuery);

function configureHistory(data: ChatMessageRecord[] = [], isFetching = false) {
  mockedUseGetChatHistoryQuery.mockReturnValue({
    data,
    isFetching,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetChatHistoryQuery>);
}

function configureAsk(impl: (body: { message: string; sessionId?: string }) => Promise<AskChatbotResult>) {
  const trigger = vi.fn((body: { message: string; sessionId?: string }) => ({
    unwrap: () => impl(body),
  }));
  mockedUseAskChatbotMutation.mockReturnValue([
    trigger as unknown as ReturnType<typeof useAskChatbotMutation>[0],
    { isLoading: false } as unknown as ReturnType<typeof useAskChatbotMutation>[1],
  ]);
  return trigger;
}

function renderWidget({ authenticated = false }: { authenticated?: boolean } = {}) {
  const store = makeStore();
  if (authenticated) {
    store.dispatch(
      setSession({
        user: {
          id: "u1",
          email: "ada@example.com",
          name: "Ada",
          role: "customer",
          isEmailVerified: true,
          avatarUrl: null,
          phone: null,
          isPhoneVerified: false,
        },
        accessToken: "token",
      }),
    );
  }
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatWidget />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe("ChatWidget", () => {
  beforeEach(() => {
    window.localStorage.clear();
    configureHistory();
    configureAsk(async () => ({ answer: "You can track your order from the Orders page.", matched: true }));
  });

  it("is collapsed by default and expands the panel on click", async () => {
    const user = userEvent.setup();
    renderWidget();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));

    const dialog = await screen.findByRole("dialog", { name: "Support chat" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Ask me a question about ordering/)).toBeInTheDocument();
  });

  it("closes the panel on Escape", async () => {
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("closes the panel when clicking outside it", async () => {
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));
    await screen.findByRole("dialog");

    await user.click(document.body);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows an unread badge once history loads empty for a first-time visitor, and clears it on open", async () => {
    configureHistory([]);
    const user = userEvent.setup();
    const { container } = renderWidget();

    await waitFor(() => expect(container.querySelector(".bg-danger")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Open support chat" }));

    expect(container.querySelector(".bg-danger")).not.toBeInTheDocument();
  });

  it("does not show an unread badge for a returning visitor with prior history", async () => {
    configureHistory([
      {
        _id: "m1",
        userId: null,
        sessionId: "s1",
        message: "How do refunds work?",
        answer: "Refunds are issued to your original payment method.",
        matched: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    const user = userEvent.setup();
    const { container } = renderWidget();

    expect(container.querySelector(".bg-danger")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));

    expect(await screen.findByText("How do refunds work?")).toBeInTheDocument();
    expect(container.querySelector(".bg-danger")).not.toBeInTheDocument();
  });

  it("sends a question and renders the question/answer bubble pair", async () => {
    configureAsk(async () => ({ answer: "You can track your order from the Orders page.", matched: true }));
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));
    const input = await screen.findByPlaceholderText("Type your question…");

    await user.type(input, "How do I track my order?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("How do I track my order?")).toBeInTheDocument();
    expect(await screen.findByText("You can track your order from the Orders page.")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("restores the draft and shows an error when sending fails", async () => {
    configureAsk(async () => {
      throw { status: 500, data: { message: "Something went wrong" } };
    });
    const user = userEvent.setup();
    renderWidget();

    await user.click(screen.getByRole("button", { name: "Open support chat" }));
    const input = await screen.findByPlaceholderText("Type your question…");

    await user.type(input, "Why did my payout fail?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(input).toHaveValue("Why did my payout fail?"));
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("resolves a guest's identity via a generated, localStorage-persisted session id", async () => {
    renderWidget({ authenticated: false });

    await waitFor(() => {
      const lastCall = mockedUseGetChatHistoryQuery.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual({ skip: false });
      expect(lastCall?.[0]).toMatchObject({ sessionId: expect.any(String) });
    });

    expect(window.localStorage.getItem("chatSessionId")).toBeTruthy();
  });

  it("resolves a logged-in user's identity with no session id needed", async () => {
    renderWidget({ authenticated: true });

    await waitFor(() => {
      const lastCall = mockedUseGetChatHistoryQuery.mock.calls.at(-1);
      expect(lastCall?.[1]).toEqual({ skip: false });
      expect(lastCall?.[0]).toBeUndefined();
    });

    expect(window.localStorage.getItem("chatSessionId")).toBeNull();
  });
});
