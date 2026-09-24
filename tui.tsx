/** @jsxImportSource @opentui/solid */

/**
 * Tavily quota sidebar — an OpenCode 2 TUI plugin.
 *
 * Renders the remaining Tavily API credits in the session sidebar
 * (`sidebar.content`) and exposes a `/tavily-quota` slash command /
 * "Refresh Tavily quota" palette command that re-fetches on demand.
 *
 * The plugin owns no session state: Tavily credits are account-wide, so a
 * single snapshot is shared by every sidebar render and refreshed on a timer.
 * Colors follow the built-in quota sections: the heading uses the default text
 * color and the body (bar included) uses the muted/subdued text color.
 *
 * Authenticate with `TAVILY_API_KEY`, the `apiKey` plugin option in `cli.json`,
 * or OpenCode's active Tavily integration. A saved key is used server-side.
 */

import type { RGBA } from "@opentui/core";
import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import {
  fetchQuotaWithFallback,
  formatPercent,
  formatQuotaLine,
  formatRemaining,
  formatResetLine,
  type QuotaSnapshot,
} from "./usage";
import type { QuotaResult } from "./usage";
import { TavilyQuotaRpc } from "./rpc";

type Context = Plugin.Context;

export const PLUGIN_ID = "opencode-tavily-quota";
// Tavily's `/usage` endpoint allows at most 10 requests per 10 minutes, so poll
// once per window and rely on the `/tavily-quota` command for on-demand reads.
const REFRESH_INTERVAL_MS = 600_000;

type ViewState =
  | { status: "loading" }
  | { status: "ready"; snapshot: QuotaSnapshot }
  | { status: "error"; message: string };

type ThemeColors = {
  text?: RGBA;
  textMuted?: RGBA;
};

/**
 * OpenCode 2.0.7 exposes `text.default` / `text.subdued`; later builds renamed
 * the leaves to `text.base` / `text.muted`. Read whichever the running build
 * provides so the plugin matches the built-in quota sections on both.
 */
function readThemeColors(context: Context): ThemeColors {
  const text = context.theme.text as unknown as {
    default?: RGBA;
    base?: RGBA;
    subdued?: RGBA;
    muted?: RGBA;
  };
  return {
    text: text.default ?? text.base,
    textMuted: text.subdued ?? text.muted,
  };
}

export function buildLines(state: ViewState, now: number = Date.now()): string[] {
  if (state.status === "loading") {
    return ["loading…"];
  }
  if (state.status === "error") {
    return [`⚠ ${state.message}`];
  }

  const snapshot = state.snapshot;
  // Reset countdown sits between the heading and the bar, matching the sidebar
  // order used by the built-in quota section.
  return [formatResetLine(now), formatQuotaLine(snapshot)];
}

function TavilyQuotaSidebar(props: { context: Context; state: () => ViewState }) {
  const colors = () => readThemeColors(props.context);
  // Keep the quota line on one line; let an error message wrap instead of
  // truncating it, since it can be longer than the sidebar.
  const wrapMode = () => (props.state().status === "error" ? "word" : "none");

  return (
    <box gap={0} flexDirection="column">
      <text fg={colors().text}>
        <b>Tavily</b>
      </text>
      {buildLines(props.state()).map((line) => (
        <text fg={colors().textMuted} wrapMode={wrapMode()}>
          {line}
        </text>
      ))}
    </box>
  );
}

function TavilyQuotaCommands(props: {
  context: Context;
  refresh: () => Promise<ViewState>;
}) {
  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: `${PLUGIN_ID}.refresh`,
        title: "Refresh Tavily quota",
        description: "Re-fetch remaining Tavily API credits and show a summary",
        group: "Tavily",
        palette: true,
        slash: { name: "tavily-quota" },
        run: async () => {
          const next = await props.refresh();
          const message =
            next.status === "ready"
              ? `${formatRemaining(next.snapshot)} · ${formatPercent(next.snapshot.percentRemaining)} · ${formatResetLine()}`
              : next.status === "error"
                ? next.message
                : "still loading…";
          // Tie the toast to the open session so the host can title it and offer
          // to open it if the session's family is not on screen.
          const route = props.context.ui.router.current();
          const sessionID = route.type === "session" ? route.sessionID : undefined;
          props.context.ui.toast.show({
            title: "Tavily quota",
            message,
            variant: next.status === "error" ? "error" : "info",
            ...(sessionID ? { sessionID } : {}),
          });
        },
      },
    ],
  }));

  return null;
}

export const TavilyQuotaTuiPlugin = Plugin.define({
  id: PLUGIN_ID,
  async setup(context) {
    const [state, setState] = createSignal<ViewState>({ status: "loading" });
    const apiKey = typeof context.options.apiKey === "string" ? context.options.apiKey : undefined;
    const remote = context.client.rpc(TavilyQuotaRpc);
    const refreshMs =
      typeof context.options.refreshMs === "number" && context.options.refreshMs > 0
        ? context.options.refreshMs
        : REFRESH_INTERVAL_MS;

    let disposed = false;
    let inFlight = false;

    const refresh = async (): Promise<ViewState> => {
      if (inFlight) return state();
      inFlight = true;
      try {
        const result = await fetchQuotaWithFallback({
          apiKey,
          remote: () => remote.usage({}, {
            location: context.location ?? context.data.location.default(),
          }) as Promise<QuotaResult>,
        });
        if (!disposed) {
          setState(
            result.ok
              ? { status: "ready", snapshot: result.snapshot }
              : { status: "error", message: result.message },
          );
        }
      } catch (error) {
        // `fetchQuota` is written never to throw, but a rejected promise here
        // must not take down the sidebar: surface it inline instead.
        if (!disposed) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        inFlight = false;
      }
      return state();
    };

    const stopSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => <TavilyQuotaSidebar context={context} state={state} />,
    });

    // `keymap.layer` reads Solid context, so it must be mounted from a slot
    // component rather than called directly during plugin setup.
    const stopCommands = context.ui.slot({
      append: "app",
      render: () => <TavilyQuotaCommands context={context} refresh={refresh} />,
    });

    void refresh();
    const interval = setInterval(() => void refresh(), refreshMs);

    return () => {
      disposed = true;
      clearInterval(interval);
      stopSidebar();
      stopCommands();
    };
  },
});

export default TavilyQuotaTuiPlugin;
