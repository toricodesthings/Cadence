import { useState, useRef, useEffect } from "react";
import {
    ListTodo, FileText, List, Heading2, Quote, Minus,
    ListOrdered, Lightbulb, CheckCircle2, CalendarDays,
} from "lucide-react";
import { NOTE_TEMPLATES } from "../../lib/notes/note-templates";
import { motion, AnimatePresence } from "framer-motion";

interface CommandItem {
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    category: "format" | "template";
}

const FORMAT_COMMANDS: CommandItem[] = [
    { id: "heading", label: "Heading", description: "Add a section heading", icon: Heading2, category: "format" },
    { id: "bullet-list", label: "Bullet list", description: "Start a bullet list", icon: List, category: "format" },
    { id: "numbered-list", label: "Numbered list", description: "Start a numbered list", icon: ListOrdered, category: "format" },
    { id: "checklist", label: "Checklist", description: "Add a checklist", icon: ListTodo, category: "format" },
    { id: "quote", label: "Quote", description: "Insert a blockquote", icon: Quote, category: "format" },
    { id: "divider", label: "Divider", description: "Add a horizontal line", icon: Minus, category: "format" },
];

const TEMPLATE_ICON_MAP: Record<string, React.ElementType> = {
    checklist: ListTodo,
    bullets: List,
    meeting: CalendarDays,
    brainstorm: Lightbulb,
    decision: CheckCircle2,
    "next-steps": FileText,
};

const TEMPLATE_COMMANDS: CommandItem[] = NOTE_TEMPLATES.map((t) => ({
    id: `template:${t.id}`,
    label: t.label,
    description: t.description,
    icon: TEMPLATE_ICON_MAP[t.id] ?? FileText,
    category: "template" as const,
}));

const ALL_COMMANDS = [...FORMAT_COMMANDS, ...TEMPLATE_COMMANDS];

interface TaskNoteCommandMenuProps {
    /** The current slash query (text after /) */
    query: string;
    /** Position for the popup */
    anchorRect: { top: number; left: number } | null;
    /** Selected command callback */
    onSelect: (commandId: string) => void;
    /** Called when the user dismisses */
    onDismiss: () => void;
}

/**
 * Floating command menu triggered by "/" in the note editor.
 * Shows format actions and template inserts.
 */
export function TaskNoteCommandMenu({
    query,
    anchorRect,
    onSelect,
    onDismiss,
}: TaskNoteCommandMenuProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const menuRef = useRef<HTMLDivElement>(null);

    const filtered = ALL_COMMANDS.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase()) ||
        cmd.description.toLowerCase().includes(query.toLowerCase()),
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((i) => (i + 1) % filtered.length);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
            } else if (e.key === "Enter" && filtered.length > 0) {
                e.preventDefault();
                onSelect(filtered[selectedIndex].id);
            } else if (e.key === "Escape") {
                e.preventDefault();
                onDismiss();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [filtered, selectedIndex, onSelect, onDismiss]);

    if (!anchorRect || filtered.length === 0) return null;

    return (
        <AnimatePresence>
            <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="fixed z-[60] w-64 overflow-hidden rounded-xl border border-twilight-border/60 bg-twilight-surface/95 shadow-lg backdrop-blur-xl"
                style={{ top: anchorRect.top, left: anchorRect.left }}
                role="listbox"
                aria-label="Slash commands"
            >
                <div className="max-h-64 overflow-y-auto p-1">
                    {filtered.map((cmd, i) => {
                        const Icon = cmd.icon;
                        return (
                            <button
                                key={cmd.id}
                                type="button"
                                role="option"
                                aria-selected={i === selectedIndex}
                                onClick={() => onSelect(cmd.id)}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                                    i === selectedIndex
                                        ? "bg-white/[0.08] text-twilight-text"
                                        : "text-twilight-text-soft hover:bg-white/[0.04]"
                                }`}
                            >
                                <Icon size={14} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{cmd.label}</p>
                                    <p className="truncate text-[10px] text-twilight-text-muted">{cmd.description}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
