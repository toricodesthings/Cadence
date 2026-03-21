import {
    Bold,
    Italic,
    Heading2,
    List,
    Link2,
    Code2,
} from "lucide-react";

export type NotesToolbarAction =
    | "bold"
    | "italic"
    | "heading"
    | "bullet-list"
    | "numbered-list"
    | "checklist"
    | "link"
    | "code"
    | "quote"
    | "divider";

interface NotesToolbarProps {
    onAction: (action: NotesToolbarAction) => void;
    activeActions?: Set<NotesToolbarAction>;
}

const ACTIONS: Array<{ id: NotesToolbarAction; label: string; icon: typeof Bold }> = [
    { id: "bold", label: "Bold", icon: Bold },
    { id: "italic", label: "Italic", icon: Italic },
    { id: "heading", label: "Heading", icon: Heading2 },
    { id: "bullet-list", label: "Bullets", icon: List },
    { id: "link", label: "Link", icon: Link2 },
    { id: "code", label: "Code", icon: Code2 },
];

export function NotesToolbar({ onAction, activeActions }: NotesToolbarProps) {
    return (
        <div className="flex items-center gap-0.5 rounded-xl border border-twilight-border/40 bg-white/[0.03] p-1">
            {ACTIONS.map(({ id, label, icon: Icon }) => {
                const isActive = activeActions?.has(id);
                return (
                    <button
                        key={id}
                        type="button"
                        onClick={() => onAction(id)}
                        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                            isActive
                                ? "bg-lantern/15 text-lantern"
                                : "text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                        }`}
                        aria-label={label}
                        aria-pressed={isActive}
                    >
                        <Icon size={15} aria-hidden="true" />
                    </button>
                );
            })}
        </div>
    );
}
