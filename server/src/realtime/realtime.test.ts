import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { io as connect, type Socket } from "socket.io-client";

// Covers the socket handshake and join validation. Joining a real board needs the database,
// so that path is not exercised here.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/taskboard_test";
process.env.JWT_ACCESS_SECRET = "test-secret-test-secret-test-secret-123456";

let url = "";
let server: http.Server;
let validToken = "";
const sockets: Socket[] = [];

const open = (auth?: Record<string, unknown>) => {
  const socket = connect(url, { auth, transports: ["websocket"], reconnection: false });
  sockets.push(socket);
  return socket;
};

before(async () => {
  const { initRealtime } = await import("./index.js");
  const { signAccessToken } = await import("../lib/jwt.js");
  server = http.createServer();
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  validToken = signAccessToken("11111111-1111-4111-8111-111111111111");
});

after(async () => {
  for (const socket of sockets) socket.close();
  const { closeRealtime } = await import("./index.js");
  await closeRealtime();
});

describe("Socket.io", () => {
  it("rejects a connection without a token", async () => {
    const socket = open();
    const error = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
    assert.equal(error.message, "UNAUTHORIZED");
  });

  it("rejects a connection with a bad token", async () => {
    const socket = open({ token: "garbage" });
    const error = await new Promise<Error>((resolve) => socket.once("connect_error", resolve));
    assert.equal(error.message, "UNAUTHORIZED");
  });

  it("accepts a valid token", async () => {
    const socket = open({ token: validToken });
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    assert.equal(socket.connected, true);
  });

  it("refuses board:join with an invalid payload", async () => {
    const socket = open({ token: validToken });
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    const ack = await new Promise<{ ok: boolean; error?: string }>((resolve) =>
      socket.emit("board:join", { boardId: "not-a-uuid" }, resolve),
    );
    assert.equal(ack.ok, false);
  });
});
