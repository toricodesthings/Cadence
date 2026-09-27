/**
 * Assistant composer slash commands. They run in the app — never a chat turn
 * or an AI call. Only an exact command is intercepted; any other `/text` sends
 * as a normal message.
 */
export const SLASH_COMMANDS = [
    { id: "usage", label: "/usage", description: "See how much you have left" },
    { id: "clear", label: "/clear", description: "Start a fresh conversation" },
    { id: "history", label: "/history", description: "Your past conversations" },
    { id: "settings", label: "/settings", description: "Assistant settings" },
] as const;

export type SlashCommand = (typeof SLASH_COMMANDS)[number];
export type SlashCommandId = SlashCommand["id"];

/** The command the whole input names (`/usage`, any case, surrounding space ok), else null. */
export function matchSlashCommand(text: string): SlashCommand | null {
    const typed = text.trim().toLowerCase();
    return SLASH_COMMANDS.find((c) => c.label === typed) ?? null;
}

/** Commands for the menu while the input is a single `/word` being typed; [] otherwise. */
export function filterSlashCommands(text: string): SlashCommand[] {
    if (!/^\/\S*$/.test(text)) return [];
    const typed = text.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.label.startsWith(typed));
}
