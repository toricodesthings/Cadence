export const SLASH_COMMANDS = [
    { id: "usage", label: "/usage", description: "See how much you have left" },
    { id: "clear", label: "/clear", description: "Start a fresh conversation" },
    { id: "history", label: "/history", description: "Your past conversations" },
    { id: "memory", label: "/memory", description: "What Cadence knows about you" },
    { id: "settings", label: "/settings", description: "Assistant settings" },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];
export type SlashCommandId = SlashCommand["id"];

export function matchSlashCommand(text: string): SlashCommand | null {
    const typed = text.trim().toLowerCase();
    return SLASH_COMMANDS.find((c) => c.label === typed) ?? null;
}

export function filterSlashCommands(text: string): SlashCommand[] {
    if (!/^\/\S*$/.test(text)) return [];
    const typed = text.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.label.startsWith(typed));
}
