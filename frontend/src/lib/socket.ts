import { io, type Socket } from "socket.io-client";

// One shared connection for the whole app (docs/ARCHITECTURE.md §9's "shared useSocket hook")
// rather than a fresh socket per component. `ensureSocket` is the only thing that mutates this
// module's state — components never touch `socket` directly, they read it via
// `getSocketSnapshot`/`subscribeToSocket` through `useSyncExternalStore` in `useSocket`, which
// is what keeps `hooks/use-socket.ts` free of a direct `setState`-in-effect (see that file).
let socket: Socket | null = null;
let socketToken: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/** Creates/replaces the shared socket to match `accessToken` (null = disconnect). Safe to call
 * on every render of every consumer — it's a no-op unless the token actually changed. */
export function ensureSocket(accessToken: string | null): void {
  if (accessToken === null) {
    if (!socket) return;
    socket.disconnect();
    socket = null;
    socketToken = null;
    notify();
    return;
  }

  if (socket && socketToken === accessToken) return;

  socket?.disconnect();
  socketToken = accessToken;
  socket = io(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000", {
    auth: { token: accessToken },
    withCredentials: true,
  });
  notify();
}

export function getSocketSnapshot(): Socket | null {
  return socket;
}

export function subscribeToSocket(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function disconnectSocket(): void {
  ensureSocket(null);
}
