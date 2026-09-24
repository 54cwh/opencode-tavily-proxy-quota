/**
 * Unit tests for the Tavily quota client.
 *
 * Run with any TypeScript-aware test runner, e.g. `npx tsx --test usage.test.ts`.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deriveSnapshot,
  expandOptionValue,
  fetchQuota,
  fetchQuotaWithFallback,
  formatPercent,
  formatQuotaLine,
  formatRemaining,
  formatResetCountdown,
  formatResetLine,
  nextMonthlyResetAt,
  progressBar,
  resolveApiKey,
  SIDEBAR_WIDTH,
} from "./usage.ts";

const KEY_PAYLOAD = {
  key: { usage: 161, limit: null, search_usage: 158 },
  account: {
    current_plan: "Researcher",
    plan_usage: 161,
    plan_limit: 1000,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("deriveSnapshot prefers the account plan over an unlimited key", () => {
  const result = deriveSnapshot(KEY_PAYLOAD, 1234);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.planName, "Researcher");
  assert.equal(result.snapshot.used, 161);
  assert.equal(result.snapshot.limit, 1000);
  assert.equal(result.snapshot.remaining, 839);
  assert.equal(result.snapshot.updatedAt, 1234);
  // `839 / 1000` is not exactly representable in binary floating point.
  assert.ok(Math.abs(result.snapshot.percentRemaining - 83.9) < 1e-9);
});

test("deriveSnapshot falls back to the key limit without a plan limit", () => {
  const result = deriveSnapshot({ key: { usage: 25, limit: 100 } }, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.limit, 100);
  assert.equal(result.snapshot.remaining, 75);
  assert.equal(result.snapshot.planName, "Tavily");
});

test("deriveSnapshot clamps remaining at zero when usage exceeds the limit", () => {
  const result = deriveSnapshot({ account: { plan_usage: 120, plan_limit: 100 } }, 0);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.remaining, 0);
  assert.equal(result.snapshot.percentRemaining, 0);
});

test("deriveSnapshot reports an error when no positive limit is present", () => {
  assert.equal(deriveSnapshot({ key: { usage: 5, limit: null } }).ok, false);
  assert.equal(deriveSnapshot({ account: { plan_usage: 5, plan_limit: 0 } }).ok, false);
  assert.equal(deriveSnapshot({}).ok, false);
});

test("formatPercent and formatRemaining render sidebar text", () => {
  assert.equal(formatPercent(83.9), "84%");
  assert.equal(formatPercent(4.25), "4.3%");
  assert.equal(
    formatRemaining({
      planName: "Researcher",
      used: 161,
      limit: 1000,
      remaining: 839,
      percentRemaining: 83.9,
      updatedAt: 0,
    }),
    "839 credits left",
  );
});

test("progressBar renders a fixed width and clamps out-of-range input", () => {
  assert.equal(progressBar(100, 10), "██████████");
  assert.equal(progressBar(0, 10), "░░░░░░░░░░");
  assert.equal(progressBar(50, 10), "█████░░░░░");
  assert.equal(progressBar(200, 4), "████");
  assert.equal(progressBar(-50, 4), "░░░░");
});

test("formatQuotaLine matches the quota section's bar width on one line", () => {
  const snapshot = {
    planName: "Researcher",
    used: 161,
    limit: 1000,
    remaining: 839,
    percentRemaining: 83.9,
    updatedAt: 0,
  };

  const line = formatQuotaLine(snapshot);
  // 25-char bar (the quota section's 36-column sidebar leaves 25 after its
  // separator and 9-char percent column), then a right-aligned `84% left`.
  assert.equal(line, "█████████████████████░░░░   84% left");
  assert.equal(line.length, SIDEBAR_WIDTH);

  // An explicit width still controls the bar length.
  assert.ok(formatQuotaLine(snapshot, 4).startsWith(progressBar(83.9, 4)));
});

test("formatQuotaLine keeps a full label inside the percent column", () => {
  const line = formatQuotaLine({
    planName: "Tavily",
    used: 0,
    limit: 100,
    remaining: 100,
    percentRemaining: 100,
    updatedAt: 0,
  });
  assert.ok(line.endsWith("100% left"));
  assert.equal(line.length, SIDEBAR_WIDTH);
});

test("nextMonthlyResetAt is 00:00 UTC on the 1st of the next month", () => {
  const now = Date.UTC(2026, 8, 24, 15, 30); // Sep 24 2026, 15:30 UTC
  assert.equal(nextMonthlyResetAt(now), Date.UTC(2026, 9, 1));
});

test("nextMonthlyResetAt rolls over the year boundary", () => {
  const now = Date.UTC(2026, 11, 31, 23, 59, 59); // Dec 31 2026
  assert.equal(nextMonthlyResetAt(now), Date.UTC(2027, 0, 1));
});

test("formatResetCountdown reports days and hours", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0); // Sep 24 2026, 12:00 UTC
  const resetAt = Date.UTC(2026, 9, 1);
  assert.equal(formatResetCountdown(resetAt, now), "6d 12h");
});

test("formatResetCountdown drops to hours and minutes in the last day", () => {
  const resetAt = Date.UTC(2026, 9, 1);
  assert.equal(formatResetCountdown(resetAt, resetAt - (5 * 3_600_000 + 12 * 60_000)), "5h 12m");
  assert.equal(formatResetCountdown(resetAt, resetAt - 45 * 60_000), "45m");
  // A sub-minute remainder still reads as `1m` rather than `0m`.
  assert.equal(formatResetCountdown(resetAt, resetAt - 30_000), "1m");
});

test("formatResetCountdown floors instead of overstating the time left", () => {
  const resetAt = Date.UTC(2026, 9, 1);
  const now = resetAt - (6 * 86_400_000 + 12 * 3_600_000 + 59 * 60_000 + 59_000);
  assert.equal(formatResetCountdown(resetAt, now), "6d 12h");
});

test("formatResetCountdown reports 0m at or past the reset", () => {
  const resetAt = Date.UTC(2026, 9, 1);
  assert.equal(formatResetCountdown(resetAt, resetAt), "0m");
  assert.equal(formatResetCountdown(resetAt, resetAt + 1_000), "0m");
});

test("formatResetLine renders the sidebar countdown", () => {
  const now = Date.UTC(2026, 8, 24, 12, 0); // Sep 24 2026, 12:00 UTC
  assert.equal(formatResetLine(now), "resets in 6d 12h");
});

test("resolveApiKey prefers the environment and falls back to the plugin option", () => {
  assert.equal(resolveApiKey({ TAVILY_API_KEY: "  env-key  " }, "option-key"), "env-key");
  assert.equal(resolveApiKey({}, "option-key"), "option-key");
  assert.equal(resolveApiKey({}, "  option-key  "), "option-key");
  assert.equal(resolveApiKey({}, undefined), "");
  assert.equal(resolveApiKey({ TAVILY_API_KEY: "   " }, ""), "");
});

test("expandOptionValue expands env references and treats missing ones as empty", () => {
  assert.equal(expandOptionValue("{env:MY_KEY}", { env: { MY_KEY: "abc" } }), "abc");
  assert.equal(expandOptionValue("{env:MISSING}", { env: {} }), "");
  assert.equal(expandOptionValue("Bearer {env:MY_KEY}", { env: { MY_KEY: "abc" } }), "Bearer abc");
});

test("expandOptionValue reads file references and trims surrounding whitespace", () => {
  const readFile = () => "  secret-from-file \n";
  assert.equal(expandOptionValue("{file:/abs/key}", { readFile }), "secret-from-file");
});

test("expandOptionValue expands ~/ against the home directory", () => {
  const seen: string[] = [];
  const readFile = (path: string) => {
    seen.push(path);
    return "k";
  };
  assert.equal(expandOptionValue("{file:~/.secrets/key}", { readFile, home: "/home/me" }), "k");
  assert.deepEqual(seen, ["/home/me/.secrets/key"]);
});

test("expandOptionValue resolves relative file references against cwd", () => {
  const seen: string[] = [];
  const readFile = (path: string) => {
    seen.push(path);
    return "k";
  };
  assert.equal(expandOptionValue("{file:.secrets/key}", { readFile, cwd: "/work" }), "k");
  assert.deepEqual(seen, ["/work/.secrets/key"]);
});

test("expandOptionValue expands multiple references in one value", () => {
  const readFile = (path: string) => (path === "/a" ? "A" : "B");
  assert.equal(
    expandOptionValue("{file:/a}-{env:V}-{file:/b}", { readFile, env: { V: "X" } }),
    "A-X-B",
  );
});

test("expandOptionValue reports an unreadable file reference", () => {
  assert.throws(
    () =>
      expandOptionValue("{file:/nope}", {
        readFile: () => {
          throw new Error("ENOENT");
        },
      }),
    /bad file reference: "\{file:\/nope\}" \(\/nope\)/,
  );
});

test("resolveApiKey expands references in the plugin option", () => {
  const readFile = () => "file-key\n";
  assert.equal(resolveApiKey({}, "{file:/k}", { readFile }), "file-key");
  assert.equal(resolveApiKey({ KEY: "from-env" }, "{env:KEY}"), "from-env");
  // `TAVILY_API_KEY` still wins over an option reference.
  assert.equal(resolveApiKey({ TAVILY_API_KEY: "direct" }, "{file:/k}", { readFile }), "direct");
});

test("fetchQuota reports a missing key without calling fetch", async () => {
  let called = false;
  const result = await fetchQuota({
    env: {},
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch,
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /no Tavily API key/);
});

test("fetchQuota sends the plugin-option key as a Bearer token", async () => {
  let authorization: string | null = null;
  const result = await fetchQuota({
    env: {},
    apiKey: "option-key",
    now: 7,
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization");
      return jsonResponse(KEY_PAYLOAD);
    }) as typeof fetch,
  });
  assert.equal(authorization, "Bearer option-key");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.snapshot.remaining, 839);
});

test("fetchQuota maps HTTP failures to messages", async () => {
  const cases: Array<[number, RegExp]> = [
    [401, /rejected/],
    [429, /rate limited/],
    [500, /HTTP 500/],
  ];
  for (const [status, pattern] of cases) {
    const result = await fetchQuota({
      env: { TAVILY_API_KEY: "k" },
      fetchImpl: (async () => new Response("nope", { status })) as typeof fetch,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.message, pattern);
  }
});

test("fetchQuota reports invalid JSON", async () => {
  const result = await fetchQuota({
    env: { TAVILY_API_KEY: "k" },
    fetchImpl: (async () => new Response("not json", { status: 200 })) as typeof fetch,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /invalid JSON/);
});

test("fetchQuota derives a snapshot from a successful response", async () => {
  const result = await fetchQuota({
    env: { TAVILY_API_KEY: "k" },
    now: 42,
    fetchImpl: (async () => jsonResponse(KEY_PAYLOAD)) as typeof fetch,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.remaining, 839);
  assert.equal(result.snapshot.updatedAt, 42);
});

test("fetchQuota reports network failures gracefully", async () => {
  const result = await fetchQuota({
    env: { TAVILY_API_KEY: "k" },
    fetchImpl: (async () => {
      throw new Error("boom");
    }) as typeof fetch,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /request failed: boom/);
});

test("fetchQuota sends a key read from a {file:...} option", async () => {
  let authorization: string | null = null;
  const result = await fetchQuota({
    env: {},
    apiKey: "{file:/secrets/tavily}",
    readFile: () => "tvly-from-file\n",
    now: 7,
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization");
      return jsonResponse(KEY_PAYLOAD);
    }) as typeof fetch,
  });
  assert.equal(authorization, "Bearer tvly-from-file");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.snapshot.remaining, 839);
});

test("fetchQuota surfaces a bad file reference without calling fetch", async () => {
  let called = false;
  const result = await fetchQuota({
    env: {},
    apiKey: "{file:/missing}",
    readFile: () => {
      throw new Error("ENOENT");
    },
    fetchImpl: (async () => {
      called = true;
      return jsonResponse({});
    }) as typeof fetch,
  });
  assert.equal(called, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.message, /bad file reference: "\{file:\/missing\}"/);
});

test("fetchQuotaWithFallback uses OpenCode only when the CLI has no key", async () => {
  let remoteCalls = 0;
  let authorization: string | null = null;
  const remote = async () => {
    remoteCalls++;
    return { ok: false as const, message: "not connected" };
  };
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization");
    return jsonResponse(KEY_PAYLOAD);
  }) as typeof fetch;

  const local = await fetchQuotaWithFallback({
    env: { TAVILY_API_KEY: "env-key" }, apiKey: "option-key", remote, fetchImpl,
  });
  assert.equal(local.ok, true);
  assert.equal(authorization, "Bearer env-key");
  assert.equal(remoteCalls, 0);

  const option = await fetchQuotaWithFallback({ env: {}, apiKey: "option-key", remote, fetchImpl });
  assert.equal(option.ok, true);
  assert.equal(authorization, "Bearer option-key");
  assert.equal(remoteCalls, 0);

  const connected = await fetchQuotaWithFallback({ env: {}, remote, fetchImpl });
  assert.deepEqual(connected, { ok: false, message: "not connected" });
  assert.equal(remoteCalls, 1);
});
