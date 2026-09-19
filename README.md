# opencode-tavily-quota

An OpenCode 2 TUI plugin that shows the remaining Tavily API credits in the
session sidebar.

```
Tavily
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
text color and the body (bar included) uses the muted/subdued text color. It
polls every 10 minutes and can be refreshed on demand with the command below.

## Requirements

- OpenCode 2 (`opencode --version` reports `2.x`).
- A Tavily API key, supplied one of two ways:
  - `TAVILY_API_KEY` in the environment OpenCode is started from, or
  - the `apiKey` plugin option configured on this plugin in `cli.json`.

`TAVILY_API_KEY` takes precedence when both are set. The key is read in the CLI
process and sent only to `api.tavily.com` as a `Bearer` token. It is never
displayed.

The `apiKey` option also accepts `{file:...}` and `{env:...}` references, which
the plugin expands itself because `cli.json` does not (unlike `opencode.jsonc`).

## Layout

```
index.ts         # server entrypoint (no-op; required for discovery)
tui.tsx          # TUI entrypoint: sidebar slot + command
usage.ts         # key resolution, /usage fetch, formatting
usage.test.ts    # unit tests for usage.ts
scripts/build.mjs
dist/            # built entrypoints shipped to npm (dist/index.js, dist/tui.js)
```

`npm run build` compiles the TypeScript/JSX sources into `dist/`, which is what
`package.json` exports and what npm publishes. Published plugins ship built
`dist/*.js`: OpenCode transpiles `.tsx` entrypoints as it loads them, and the
Solid JSX runtime (`@opentui/solid`) is only provided at runtime, not from the
installed plugin.

OpenCode installs package plugins under `~/.cache/opencode/npm/`. The server
entrypoint (`dist/index.js`) satisfies discovery; the `tui` entrypoint
(`dist/tui.js`) is loaded by the CLI to render the sidebar.

## Configuration

Register the plugin in `cli.json` to pass the API key as a plugin option:

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
  in a toast.
- "Refresh Tavily quota" — the same action from the command palette (`Ctrl+P`).

## Data source

`GET https://api.tavily.com/usage` with `Authorization: Bearer <key>`. The
plugin prefers the account plan (`account.plan_limit` / `account.plan_usage`,
e.g. `Researcher` with 1000 monthly credits) and falls back to the per-key limit
when the plan limit is absent. A `null` per-key limit (unlimited key) is
therefore handled.

## Development

`usage.ts` is deliberately free of OpenCode and OpenTUI imports so it can be
tested anywhere. `usage.test.ts` covers the pure quota math (`deriveSnapshot`,
`formatPercent`, `formatRemaining`), key resolution, and every `fetchQuota`
error branch using an injected `fetch`.

Run the tests and type check from the repository root:

```sh
npm install
npm test        # tsx --test usage.test.ts
npm run typecheck
```

## Notes

- The plugin is a no-op on the server. All work happens in the CLI runtime,
  which is where TUI slots live.
