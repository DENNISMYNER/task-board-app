import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";

// These tests exercise the HTTP layer only (routing, validation, auth, error shape).
// None of the requests below reach the database, so no Postgres is needed to run them.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5432/taskboard_test";
process.env.JWT_ACCESS_SECRET = "test-secret-test-secret-test-secret-123456";

let baseUrl = "";
let close: () => Promise<void> = async () => {};

before(async () => {
  const { createApp } = await import("./app.js");
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((resolve) => server.close(() => resolve()));
});

after(async () => {
  await close();
  const { prisma } = await import("./lib/prisma.js");
  await prisma.$disconnect();
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("HTTP layer", () => {
  it("GET /health responds ok and sets a request id", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
    assert.ok(res.headers.get("x-request-id"));
  });

  it("sends security headers and hides the framework", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.headers.get("x-powered-by"), null);
    assert.ok(res.headers.get("x-content-type-options"));
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await fetch(`${baseUrl}/api/v1/nope`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, "NOT_FOUND");
  });

  it("rejects protected routes without a token (401)", async () => {
    for (const path of ["/workspaces", "/boards/x", "/columns/x", "/tasks/x", "/comments/x", "/auth/me"]) {
      const res = await fetch(`${baseUrl}/api/v1${path}`);
      assert.equal(res.status, 401, path);
    }
  });

  it("rejects an invalid or forged token (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/workspaces`, { headers: { authorization: "Bearer not.a.jwt" } });
    assert.equal(res.status, 401);
  });

  it("validates the register body and reports each problem (400)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/register`, json({ email: "nope", password: "short" }));
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } };
    assert.equal(body.error.code, "VALIDATION_ERROR");
    const paths = body.error.details.map((d) => d.path).sort();
    assert.deepEqual(paths, ["email", "name", "password"]);
  });

  it("returns 400 for malformed JSON instead of crashing", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    assert.equal(res.status, 400);
  });

  it("returns 413 for oversized bodies", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, json({ email: "a@b.co", password: "x".repeat(300_000) }));
    assert.equal(res.status, 413);
  });

  it("refresh without a cookie is 401", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/refresh`, { method: "POST" });
    assert.equal(res.status, 401);
  });
});
