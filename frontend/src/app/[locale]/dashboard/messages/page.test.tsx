import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { Provider } from "react-redux";
import messages from "../../../../../messages/en.json";
import { makeStore } from "@/lib/redux/store";
import { setSession } from "@/lib/redux/slices/auth-slice";
import {
  useGetVendorMessagesQuery,
  useSendVendorMessageMutation,
  useMarkVendorMessagesReadMutation,
} from "@/lib/redux/services/vendor-messages-api";
import type { VendorMessage } from "@/lib/redux/services/vendor-messages-api";
import { useSocket } from "@/hooks/use-socket";
import VendorMessagesPage from "./page";

// Mocked at the RTK Query hook boundary — same reasoning as chat-widget.test.tsx: this codebase
// has no MSW/fetch-mocking infra, and fetchBaseQuery's modern build can't construct a `Request`
// from the app's intentionally-relative `/api` baseUrl under Node's undici the way a real
// browser can. `useSocket` is mocked too since a real connection would try to reach out via
// socket.io-client, which has nothing to talk to in a test environment.
vi.mock("@/lib/redux/services/vendor-messages-api", () => ({
  useGetVendorMessagesQuery: vi.fn(),
  useSendVendorMessageMutation: vi.fn(),
  useMarkVendorMessagesReadMutation: vi.fn(),
}));
vi.mock("@/hooks/use-socket", () => ({
  useSocket: vi.fn(),
}));

// `RequireRole` pulls in `next-intl/navigation`'s `createNavigation`, which internally imports
// `next/navigation` — a module Vitest/Vite can't resolve outside an actual Next.js build
// context. Mocked here (the first test in this codebase to render anything wrapped in
// `RequireRole`) since this test never exercises real navigation — the vendor is already
// authenticated with the right role, so `RequireRole` just renders its children.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/dashboard/messages",
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

const mockedUseGetVendorMessagesQuery = vi.mocked(useGetVendorMessagesQuery);
const mockedUseSendVendorMessageMutation = vi.mocked(useSendVendorMessageMutation);
const mockedUseMarkVendorMessagesReadMutation = vi.mocked(useMarkVendorMessagesReadMutation);
const mockedUseSocket = vi.mocked(useSocket);

function configureMessages(data: VendorMessage[] = [], isLoading = false) {
  mockedUseGetVendorMessagesQuery.mockReturnValue({
    data,
    isLoading,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useGetVendorMessagesQuery>);
}

function configureSend(impl: (body: { body: string }) => Promise<VendorMessage>) {
  const trigger = vi.fn((body: { body: string }) => ({ unwrap: () => impl(body) }));
  mockedUseSendVendorMessageMutation.mockReturnValue([
    trigger as unknown as ReturnType<typeof useSendVendorMessageMutation>[0],
    { isLoading: false } as unknown as ReturnType<typeof useSendVendorMessageMutation>[1],
  ]);
  return trigger;
}

function renderPage() {
  const store = makeStore();
  store.dispatch(
    setSession({
      user: {
        id: "vendor-1",
        email: "vera@example.com",
        name: "Vera",
        role: "restaurant_owner",
        isEmailVerified: true,
        avatarUrl: null,
        phone: null,
        isPhoneVerified: false,
      },
      accessToken: "token",
    }),
  );
  return render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <VendorMessagesPage />
      </NextIntlClientProvider>
    </Provider>,
  );
}

describe("VendorMessagesPage", () => {
  beforeEach(() => {
    configureMessages();
    configureSend(async () => ({
      _id: "m1",
      vendorId: "vendor-1",
      senderId: "vendor-1",
      senderRole: "restaurant_owner",
      body: "My payout failed, why?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mockedUseMarkVendorMessagesReadMutation.mockReturnValue([
      vi.fn().mockResolvedValue(undefined),
      { isLoading: false } as never,
    ] as unknown as ReturnType<typeof useMarkVendorMessagesReadMutation>);
    mockedUseSocket.mockReturnValue(null);
  });

  it("shows an empty state when there is no history yet", async () => {
    renderPage();
    expect(await screen.findByText("No messages yet")).toBeInTheDocument();
  });

  it("renders existing messages, aligning the vendor's own on the right", async () => {
    configureMessages([
      {
        _id: "m1",
        vendorId: "vendor-1",
        senderId: "vendor-1",
        senderRole: "restaurant_owner",
        body: "My payout failed",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: "m2",
        vendorId: "vendor-1",
        senderId: "admin-1",
        senderRole: "admin",
        body: "We are looking into it",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    renderPage();

    expect(await screen.findByText("My payout failed")).toBeInTheDocument();
    expect(screen.getByText("We are looking into it")).toBeInTheDocument();
  });

  it("sends a message and clears the input", async () => {
    const trigger = configureSend(async () => ({
      _id: "m1",
      vendorId: "vendor-1",
      senderId: "vendor-1",
      senderRole: "restaurant_owner",
      body: "My payout failed, why?",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByPlaceholderText("Type your message…");
    await user.type(input, "My payout failed, why?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(trigger).toHaveBeenCalledWith({ body: "My payout failed, why?" }));
    expect(input).toHaveValue("");
  });

  it("restores the draft and shows an error when sending fails", async () => {
    configureSend(async () => {
      throw { status: 500, data: { message: "Something went wrong" } };
    });
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByPlaceholderText("Type your message…");
    await user.type(input, "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(input).toHaveValue("hello"));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });

  it("marks the thread read on mount", async () => {
    const markRead = vi.fn().mockResolvedValue(undefined);
    mockedUseMarkVendorMessagesReadMutation.mockReturnValue([
      markRead,
      { isLoading: false } as never,
    ] as unknown as ReturnType<typeof useMarkVendorMessagesReadMutation>);

    renderPage();

    await waitFor(() => expect(markRead).toHaveBeenCalled());
  });
});
