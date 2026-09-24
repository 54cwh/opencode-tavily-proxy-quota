import { Rpc } from "@opencode/plugin/rpc";

/** The server fetches quota so the saved OpenCode credential never enters the TUI. */
export const TavilyQuotaRpc = Rpc.define({
  id: "opencode-tavily-quota",
  methods: {
    usage: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          message: { type: "string" },
          snapshot: {
            type: "object",
            properties: {
              planName: { type: "string" },
              used: { type: "number" },
              limit: { type: "number" },
              remaining: { type: "number" },
              percentRemaining: { type: "number" },
              updatedAt: { type: "number" },
            },
            required: ["planName", "used", "limit", "remaining", "percentRemaining", "updatedAt"],
            additionalProperties: false,
          },
        },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  },
  events: {},
});
