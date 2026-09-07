// Support chat widget (docs/ROADMAP.md FDP-106) — the first use of `localStorage` in this
// codebase, deliberately kept to just this one small id, not the conversation itself (which
// lives in Redux + is re-fetched from the backend — see `chat-slice.ts`). A guest visitor has no
// account to identify them by, so this client-generated id is what ties their messages together
// across a page reload, mirroring how the backend identifies a logged-in visitor by their real
// user id instead (`ChatIdentity`, `backend/src/support-tickets/chat-identity.ts`).
const STORAGE_KEY = "chatSessionId";

/** Never called during SSR (only from client components, after mount) — `localStorage` access is
 * safe here, but still wrapped defensively since a private-browsing/storage-blocked browser can
 * throw on either read or write. Falls back to an in-memory-only id for that single page view
 * rather than crashing the widget. */
export function getOrCreateChatSessionId(): string {
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}
