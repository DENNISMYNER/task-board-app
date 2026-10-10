import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { getAccessToken, refreshSession } from "../../../lib/api";

// One shared connection for the whole app. Each board page joins/leaves its own room on it.
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(import.meta.env.VITE_API_URL || undefined, {
    autoConnect: false,
    withCredentials: true,
    // A function, not a value: it runs on every (re)connect, so a reconnect after the 15-minute
    // access token expired still sends the *current* token.
    auth: (cb) => cb({ token: getAccessToken() }),
  });

  // The server rejects expired/invalid tokens during the handshake. socket.io does not retry those on
  // its own, so we refresh the session and connect again by hand.
  const s = socket;
  s.on("connect_error", (err) => {
    if (err.message !== "UNAUTHORIZED") return;
    void refreshSession().then((session) => {
      if (session) s.connect();
    });
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
