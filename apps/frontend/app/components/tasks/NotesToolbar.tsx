import {
    Bold,
    Italic,
    Heading2,
    List,
    ListTodo,
    Link2,
    Code2,
    Quote,
    Minus,
    Eye,
    PencilLine,
    Maximize2,
    Minimize2,
} from "lucide-react";

export type NotesToolbarAction =
    | "bold"
    | "italic"
    | "heading"
    | "bullet-list"
    | "checklist"
    | "link"
    | "code"
    | "quote"
    | "divider";

interface NotesToolbarProps {
    onAction: (action: NotesToolbarAction) => void;
    isPreview?: boolean;
    onTogglePreview?: () => void;
    isFocusMode?: boolean;
    onToggleFocusMode?: () => void;
}

const ACTIONS: Array<{ id: NotesToolbarAction; label: string; icon: typeof Bold }> = [
    { id: "bold", label: "Bold", icon: Bold },
    { id: "italic", label: "Italic", icon: Italic },
    { id: "heading", label: "Heading", icon: Heading2 },
    { id: "bullet-list", label: "Bullets", icon: List },
    { id: "checklist", label: "Checklist", icon: ListTodo },
    { id: "link", label: "Link", icon: Link2 },
    { id: "code", label: "Code", icon: Code2 },
    { id: "quote", label: "Quote", icon: Quote },
    { id: "divider", label: "Divider", icon: Minus },
];

export function NotesToolbar({
    onAction,
    isPreview = false,
    onTogglePreview,
    isFocusMode = false,
    onToggleFocusMode,
}: NotesToolbarProps) {
    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[1.15rem] border border-twilight-border/40 bg-white/[0.03] p-1.5 backdrop-blur-xl">
            {ACTIONS.map(({ id, label, icon: Icon }) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onAction(id)}
                    className="touch-target inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-medium text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                    aria-label={label}
                >
                    <Icon size={14} aria-hidden="true" />
                    <span className="hidden sm:inline">{label}</span>
                </button>
            ))}

            {onTogglePreview ? (
                <button
                    type="button"
                    onClick={onTogglePreview}
                    className={`touch-target ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium ${
                        isPreview
                            ? "border-lantern/25 bg-lantern/12 text-lantern"
                            : "border-twilight-border/40 text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                    }`}
                >
                    {isPreview ? <PencilLine size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    {isPreview ? "Write" : "Preview"}
                </button>
            ) : null}

            {onToggleFocusMode ? (
                <button
                    type="button"
                    onClick={onToggleFocusMode}
                    className={`touch-target inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-medium ${
                        isFocusMode
                            ? "border-lantern/25 bg-lantern/12 text-lantern"
                            : "border-twilight-border/40 text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                    }`}
                >
                    {isFocusMode ? <Minimize2 size={14} aria-hidden="true" /> : <Maximize2 size={14} aria-hidden="true" />}
                    {isFocusMode ? "Exit focus" : "Focus"}
                </button>
            ) : null}
        </div>
    );
}
