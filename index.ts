/**
 * Server entrypoint. Resolve the active Tavily integration credential and
 * fetch quota here; only the quota result crosses the RPC boundary to the TUI.
 */

import { Plugin } from "@opencode/plugin";
import { TavilyQuotaRpc } from "./rpc";
import { fetchQuota } from "./usage";

export const PLUGIN_ID = "opencode-tavily-quota";

export default Plugin.define({
  id: PLUGIN_ID,
  async setup(ctx) {
    await ctx.rpc.register(TavilyQuotaRpc, {
      usage: async () => {
        const connection = await ctx.integration.connection.active("tavily");
        const credential = connection && await ctx.integration.connection.resolve(connection);
        const key = credential?.type === "key"
          ? credential.key
          : connection?.type === "env"
            ? process.env[connection.name]
            : undefined;
        if (!key) {
          return { ok: false, message: "no active Tavily connection (run opencode auth login tavily)" };
        }
        return fetchQuota({ apiKey: key, env: {} });
      },
    });
  },
});
