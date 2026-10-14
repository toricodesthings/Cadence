/**
 * The assistant's tools by name: the one list the backend's tools, the MCP server and the chat UI share.
 * kind — read: looks only · write: changes data · capture: adds to Capture, never changes existing data ·
 * ask: a question to the user (chat only).
 * destructive — may overwrite, Trash or delete existing data.
 */
export type ToolKind = "read" | "write" | "capture" | "ask";
export type ToolSpec = { kind: ToolKind; destructive?: true };

const read = { kind: "read" } as const;
const write = { kind: "write" } as const;
const overwrite = { kind: "write", destructive: true } as const;

export const TOOL_CATALOG = {
    get_tasks: read,
    get_task_detail: read,
    get_schedule_window: read,
    get_projects: read,
    get_tags: read,
    get_inbox_items: read,
    get_habits: read,
    get_habit_status_today: read,
    get_habit_history: read,
    get_events: read,
    get_user_metrics: read,
    get_focus_views: read,
    get_cadence_help: read,
    create_tasks: write,
    duplicate_tasks: write,
    update_tasks: overwrite,
    reorder_tasks: write,
    edit_subtasks: overwrite,
    set_task_state: overwrite,
    reschedule_tasks: overwrite,
    delete_tasks: overwrite,
    update_captures: overwrite,
    delete_captures: overwrite,
    create_project: write,
    update_project: overwrite,
    delete_project: overwrite,
    create_sections: write,
    update_section: overwrite,
    delete_section: overwrite,
    create_tag: write,
    update_tag: overwrite,
    delete_tag: overwrite,
    create_habit: write,
    update_habit: overwrite,
    log_habit: overwrite,
    delete_habit: overwrite,
    save_event: overwrite,
    delete_event: overwrite,
    save_focus_view: overwrite,
    delete_focus_view: overwrite,
    remember: write,
    recall: read,
    search_past_chats: read,
    capture_to_inbox: { kind: "capture" },
    ask_user: { kind: "ask" },
} as const satisfies Record<string, ToolSpec>;

export type ToolName = keyof typeof TOOL_CATALOG;
export const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_CATALOG, name);

/** The tools that exist only while the person has memory on. */
const MEMORY_TOOLS = new Set<string>(["remember", "recall", "search_past_chats"] satisfies ToolName[]);
export const isMemoryTool = (name: string): boolean => MEMORY_TOOLS.has(name);
