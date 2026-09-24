# opencode-tavily-quota

An OpenCode 2 TUI plugin that shows the remaining Tavily API credits in the
session sidebar.

```
Tavily
resets in 6d 12h
█████████████████████████   84% left
```

## Install

```sh
opencode plugin add @cardinal4/opencode-tavily-quota
```

Or declare it in `cli.json` to pass the API key option (see
[Configuration](#configuration)). If a local copy exists under
`~/.config/opencode/plugins/opencode-tavily-quota/`, remove it after installing
the package so the plugin is not loaded twice.

The sidebar follows the built-in quota styling — the heading uses the default
text color and the body (bar included) uses the muted/subdued text color. A
countdown between the heading and the bar shows how long until the monthly
credits reset. It polls every 10 minutes and can be refreshed on demand with the
command below.

## Requirements

- OpenCode 2 (`opencode --version` reports `2.x`).
- A Tavily API key, supplied by:
  - `TAVILY_API_KEY` in the CLI environment,
  - the `apiKey` plugin option configured in `cli.json`, or
  - OpenCode's active Tavily connection (use `opencode auth login tavily` or
    `/connect` to connect Tavily).

The CLI environment takes precedence over `apiKey`; OpenCode's active
connection is used when neither supplies a key. The server resolves its saved
credential and fetches `/usage` itself. Only quota data returns to the TUI;
the saved key is never sent over plugin RPC or displayed. With a remote server,
install this plugin there too to use its active connection.

The `apiKey` option also accepts `{file:...}` and `{env:...}` references, which
the plugin expands itself because `cli.json` does not (unlike `opencode.jsonc`).

## Layout

```
index.ts         # server entrypoint: integration credential + quota RPC
rpc.ts           # shared RPC definition
tui.tsx          # TUI entrypoint: sidebar slot + command
usage.ts         # key resolution, /usage fetch, formatting
usage.test.ts    # unit tests for usage.ts
scripts/build.mjs
dist/            # built entrypoints shipped to npm
```

`npm run build` compiles the TypeScript/JSX sources into `dist/`, which is what
`package.json` exports and what npm publishes. Published plugins ship built
`dist/*.js`: OpenCode transpiles `.tsx` entrypoints as it loads them, and the
Solid JSX runtime (`@opentui/solid`) is only provided at runtime, not from the
installed plugin.

OpenCode installs package plugins under `~/.cache/opencode/npm/`. The server
entrypoint (`dist/index.js`) registers the quota RPC; the `tui` entrypoint
(`dist/tui.js`) renders the sidebar in the CLI.

## Configuration

If you already connected Tavily in OpenCode, no key option is needed. To pass
the API key as a plugin option instead, register the plugin in `cli.json`:

```json title="cli.json"
{
  "plugins": [
    {
      "package": "@cardinal4/opencode-tavily-quota@latest",
      "options": {
        "apiKey": "tvly-..."
      }
    }
  ]
}
```

The CLI-only `cli.json` entry also keeps the plugin active when the TUI is
connected to a remote server. The same entry accepts a `refreshMs` option to
override the default 10 minute poll interval (Tavily's `/usage` endpoint allows
at most 10 requests per 10 minutes, so keep it at or above that).

### Keeping the key out of the file

`cli.json` is not processed like `opencode.jsonc`: OpenCode does not expand
`{file:...}` or `{env:...}` in plugin options, so the plugin does it. Use either
reference as `apiKey` to avoid pasting the raw key into `cli.json`:

```json title="cli.json"
{
  "plugins": [
    {
      "package": "@cardinal4/opencode-tavily-quota@latest",
      "options": {
        "apiKey": "{file:~/.secrets/tavily-api-key}"
      }
    }
  ]
}
```

`{env:NAME}` reads an environment variable (empty when unset). `{file:PATH}`
reads a file's trimmed contents, with `~/` expanding to the home directory and
relative paths resolving against the CLI's working directory. `TAVILY_API_KEY`
still wins over `apiKey` when both are set. A missing or unreadable file is
reported in the sidebar instead of being used as the key.

## Commands

- `/tavily-quota` — slash command that re-fetches and reports the current quota
  and reset countdown in a toast.
- "Refresh Tavily quota" — the same action from the command palette (`Ctrl+P`).

## Data source

`GET https://api.tavily.com/usage` with `Authorization: Bearer <key>`. The
plugin prefers the account plan (`account.plan_limit` / `account.plan_usage`,
e.g. `Researcher` with 1000 monthly credits) and falls back to the per-key limit
when the plan limit is absent. A `null` per-key limit (unlimited key) is
therefore handled.

The response has no reset timestamp, so the sidebar countdown is derived from
the calendar: Tavily resets credits on the first day of each month (not the
billing date), and the plugin assumes `00:00 UTC` for that reset. If Tavily
later exposes an explicit reset time, prefer it over this derivation.

## Development

`usage.ts` is deliberately free of OpenCode and OpenTUI imports so it can be
tested anywhere. The tests cover quota math, local-key precedence and fallback,
the connected-key RPC, and HTTP error handling using a mock `fetch`.

Run the tests and type check from the repository root:

```sh
npm install
npm test
npm run typecheck
```

## Notes

- The server handles OpenCode-connected credentials and their quota requests;
  the CLI handles local keys and renders TUI slots.
