import type { McpScope } from "@cadence/contracts/connections";

/** Plain words for what each connected-assistant permission lets it do (consent page and Settings). */
export const MCP_SCOPE_COPY: Record<McpScope, { title: string; description: string; short: string }> = {
    "cadence:read": {
        title: "Read your Cadence",
        description: "Tasks and their notes, lists, tags, captures, routines, personal events and your schedule.",
        short: "Read",
    },
    "cadence:capture": {
        title: "Add to Capture",
        description: "Save new thoughts to Capture for you to sort. On its own it can't see anything else.",
        short: "Add to Capture",
    },
};

/** The URL people add to their assistant. */
export const CADENCE_MCP_URL = "https://mcp.cadenceapp.cloud/mcp";
