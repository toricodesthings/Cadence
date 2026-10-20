import type { UserSettings } from "../../types/settings";
import { MOD_KEY } from "./keys";

export type ShortcutBinding = keyof UserSettings["shortcuts"]["bindings"];

/** One shortcut: fixed `keys`, or a `binding` the person can remap in Settings. */
export interface Shortcut {
    label: string;
    keys?: string[];
    binding?: ShortcutBinding;
    /** Only the desktop app has it. */
    desktopOnly?: boolean;
}

/**
 * Every working shortcut, listed once: Settings › Keyboard Shortcuts and the `?` reference both render this.
 * The keys themselves are handled in `hooks/core/use-keyboard-shortcuts.ts` (and the routine grid); change both together.
 */
export const SHORTCUT_SECTIONS: ReadonlyArray<{ title: string; items: ReadonlyArray<Shortcut> }> = [
    {
        title: "Anywhere",
        items: [
            { label: "Command palette", binding: "commandPalette" },
            { label: "New task", binding: "newTask" },
            { label: "Search", binding: "focusSearch" },
            { label: "Assistant", keys: [MOD_KEY, "I"] },
            { label: "Shortcut reference", keys: ["?"] },
            { label: "Bigger · smaller · reset", keys: [MOD_KEY, "+", "−", "0"], desktopOnly: true },
        ],
    },
    {
        title: "Go to",
        items: [
            { label: "Today", keys: ["G", "T"] },
            { label: "Schedule", keys: ["G", "S"] },
            { label: "Capture", keys: ["G", "I"] },
            { label: "Routines", keys: ["G", "H"] },
            { label: "Upcoming", keys: ["G", "U"] },
            { label: "Weekly Reset", keys: ["G", "W"] },
        ],
    },
    {
        title: "Lists",
        items: [
            { label: "Rows or Board", binding: "toggleView" },
            { label: "Complete selected", binding: "completeTask" },
            { label: "Trash selected", binding: "archiveTask" },
            { label: "Next section", keys: ["J"] },
            { label: "Previous section", keys: ["K"] },
        ],
    },
    {
        title: "Routine grid",
        items: [
            { label: "Move between days", keys: ["←", "→", "↑", "↓"] },
            { label: "Done", keys: ["Space"] },
            { label: "Skip", keys: ["S"] },
            { label: "Edit routine", keys: ["E"] },
        ],
    },
    {
        title: "Weekly Reset",
        items: [
            { label: "Next step", keys: ["→"] },
            { label: "Previous step", keys: ["←"] },
            { label: "Exit", keys: ["Esc"] },
        ],
    },
];

/** "mod+shift+k" → ["⌘", "⇧", "K"]. */
export function bindingKeys(binding: string): string[] {
    const names: Record<string, string> = { mod: MOD_KEY, ctrl: "Ctrl", alt: "Alt", shift: "⇧" };
    return binding.split("+").map((part) => names[part] ?? part.toUpperCase());
}
