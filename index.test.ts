import assert from "node:assert/strict";
import { test } from "node:test";

import plugin from "./index.ts";

test("server RPC resolves the active Tavily login and returns quota without the key", async () => {
  const originalFetch = globalThis.fetch;
  let authHeader: string | null = null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    authHeader = new Headers(init?.headers).get("authorization");
    return new Response(JSON.stringify({ key: { usage: 2, limit: 10 } }), { status: 200 });
  }) as typeof fetch;

  try {
    let handler: (() => Promise<unknown>) | undefined;
    const ctx = {
      rpc: {
        register: async (_definition: unknown, handlers: { usage: () => Promise<unknown> }) => {
          handler = handlers.usage;
        },
      },
      integration: {
        connection: {
          active: async (id: string) => {
            assert.equal(id, "tavily");
            return { type: "credential", id: "cred_1", label: "Tavily" };
          },
          resolve: async () => ({ type: "key", key: "saved-key" }),
        },
      },
    };
    await plugin.setup(ctx as Parameters<typeof plugin.setup>[0]);
    assert.ok(handler);
    const result = await handler();
    assert.equal(authHeader, "Bearer saved-key");
    assert.deepEqual(result, {
      ok: true,
      snapshot: {
        planName: "Tavily", used: 2, limit: 10, remaining: 8,
        percentRemaining: 80, updatedAt: (result as { snapshot: { updatedAt: number } }).snapshot.updatedAt,
      },
    });
    assert.equal(JSON.stringify(result).includes("saved-key"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("server RPC does not query Tavily when no active connection exists", async () => {
  let handler: (() => Promise<unknown>) | undefined;
  const ctx = {
    rpc: {
      register: async (_definition: unknown, handlers: { usage: () => Promise<unknown> }) => {
        handler = handlers.usage;
      },
    },
    integration: {
      connection: {
        active: async () => undefined,
        resolve: async () => { throw new Error("should not resolve"); },
      },
    },
  };
  await plugin.setup(ctx as Parameters<typeof plugin.setup>[0]);
  assert.ok(handler);
  assert.deepEqual(await handler(), {
    ok: false,
    message: "no active Tavily connection (run opencode auth login tavily)",
  });
});
