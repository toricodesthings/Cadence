import { Eraser, Gauge, History, Settings2, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import type { SlashCommand, SlashCommandId } from "../../lib/ai/slash-commands";
import { cn } from "../../lib/utils";

const ICONS: Record<SlashCommandId, LucideIcon> = { usage: Gauge, clear: Eraser, history: History, settings: Settings2 };

export const slashOptionId = (id: SlashCommandId) => `assistant-slash-${id}`;
export const SLASH_MENU_ID = "assistant-slash-menu";

/**
 * The composer's `/` menu. Focus stays in the textarea (it owns the keys and
 * points `aria-activedescendant` here); rows are also tappable.
 */
export function SlashCommandMenu({
    commands,
    activeIndex,
    onPick,
}: {
    commands: readonly SlashCommand[];
    activeIndex: number;
    onPick: (command: SlashCommand) => void;
}) {
    return (
        <motion.ul
            id={SLASH_MENU_ID}
            role="listbox"
            aria-label="Commands"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="mb-2 flex flex-col gap-0.5 rounded-[20px] border border-white/[0.08] bg-panel-raised/95 p-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)]"
        >
            {commands.map((command, i) => {
                const Icon = ICONS[command.id];
                return (
                    <li
                        key={command.id}
                        id={slashOptionId(command.id)}
                        role="option"
                        aria-selected={i === activeIndex}
                        // Keep the textarea focused; the click still fires.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPick(command)}
                        className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors",
                            i === activeIndex ? "bg-accent-primary/12" : "hover:bg-twilight-surface-hover",
                        )}
                    >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
                            <Icon size={15} aria-hidden />
                        </span>
                        <span className="text-sm font-medium text-twilight-text">{command.label}</span>
                        <span className="truncate text-xs text-twilight-text-soft">{command.description}</span>
                    </li>
                );
            })}
        </motion.ul>
    );
}
