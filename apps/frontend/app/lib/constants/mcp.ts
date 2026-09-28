import type { McpScope } from "@cadence/contracts/connections";

/** Plain words for what each connected-assistant permission lets it do (consent page and Settings). */
export const MCP_SCOPE_COPY: Record<McpScope, { title: string; description: string; short: string }> = {
    "cadence:read": {
        title: "Read your Cadence",
        description: "Tasks and their notes, lists, tags, captures, routines, personal events, focus views and your schedule.",
        short: "Read",
    },
    "cadence:capture": {
        title: "Add to Capture",
        description: "Save new thoughts to Capture for you to sort. On its own it can't see anything else.",
        short: "Add to Capture",
    },
    "cadence:write": {
        title: "Change your Cadence",
        description: "Add, edit, complete and delete tasks, lists, tags, captures, routines, events and focus views, like Cadence's assistant.",
        short: "Change",
    },
};

/** The URL people add to their assistant. */
export const CADENCE_MCP_URL = "https://mcp.cadenceapp.cloud/mcp";
