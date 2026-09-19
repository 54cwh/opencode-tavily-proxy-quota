/**
 * Server entrypoint for the Tavily quota sidebar plugin.
 *
 * OpenCode discovers a local plugin directory by its `index` (server) entry and
 * loads the `tui` entry beside it for the terminal UI. All rendering happens in
 * the CLI runtime (`tui.tsx`); this file only exists so the directory is a
 * complete plugin and shows up by id instead of as an anonymous entry.
 *
 * It deliberately imports nothing beyond `@opencode/plugin` so the background
 * service can load it in any runtime.
 */

import { Plugin } from "@opencode/plugin";

export const PLUGIN_ID = "opencode-tavily-quota";

export default Plugin.define({
  id: PLUGIN_ID,
  setup() {
    // Intentional no-op: the sidebar and command are registered by the TUI
    // entrypoint (tui.tsx), which runs in the CLI process.
  },
});
