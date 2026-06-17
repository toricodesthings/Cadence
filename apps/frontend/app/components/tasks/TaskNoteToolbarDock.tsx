import {
    Bold,
    Italic,
    Heading2,
    List,
    ListOrdered,
    ListTodo,
    Link2,
    Code2,
    Quote,
    Minus,
} from "lucide-react";
import type { NotesToolbarAction } from "./NotesToolbar";
import { Tip } from "../primitives";

const ACTIONS: Array<{ id: NotesToolbarAction; label: string; icon: typeof Bold; shortcut?: string }> = [
    { id: "bold", label: "Bold", icon: Bold, shortcut: "⌘B" },
    { id: "italic", label: "Italic", icon: Italic, shortcut: "⌘I" },
    { id: "heading", label: "Heading", icon: Heading2 },
    { id: "bullet-list", label: "Bullets", icon: List },
    { id: "numbered-list", label: "Numbers", icon: ListOrdered },
    { id: "checklist", label: "Checklist", icon: ListTodo },
    { id: "link", label: "Link", icon: Link2, shortcut: "⌘K" },
    { id: "code", label: "Code", icon: Code2 },
    { id: "quote", label: "Quote", icon: Quote },
    { id: "divider", label: "Divider", icon: Minus },
];

interface TaskNoteToolbarDockProps {
    onAction: (action: NotesToolbarAction) => void;
}

/**
 * Compact toolbar docked at the top of the note room.
 * Icons only, tooltip on hover.
 */
export function TaskNoteToolbarDock({ onAction }: TaskNoteToolbarDockProps) {
    return (
        <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Formatting toolbar">
            {ACTIONS.map(({ id, label, icon: Icon, shortcut }) => (
                <Tip key={id} label={shortcut ? `${label} (${shortcut})` : label} side="bottom">
                    <button
                        type="button"
                        onClick={() => onAction(id)}
                        className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                        aria-label={label}
                    >
                        <Icon size={18} aria-hidden="true" />
                    </button>
                </Tip>
            ))}
        </div>
    );
}
