import { useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { ChevronLeft, ChevronRight, MoreHorizontal, PenLine, Lightbulb } from "lucide-react";
import * as Popover from "../../primitives/Popover";
import { Tip } from "../../primitives/Tooltip";
import { MENU_ITEM } from "../../primitives/menu-styles";
import { cn } from "../../../lib/utils";
import { deriveNoteSuggestions } from "../../../lib/notes/note-suggestions";
import { getNoteCommand, TEMPLATE_COMMANDS, type NoteCommandId } from "./note-commands";

type View = "root" | "insert" | "templates" | "format" | "table" | "tools";

const ROW = cn(MENU_ITEM, "w-full gap-3 text-left text-twilight-text-soft hover:bg-white/10 hover:text-accent-primary focus-visible:bg-white/10 focus-visible:outline-none");

function Row({ icon: Icon, label, value, onClick, drill, disabled }: { icon?: typeof PenLine; label: string; value?: ReactNode; onClick: () => void; drill?: boolean; disabled?: boolean }) {
    return (
        <button type="button" role="menuitem" disabled={disabled} onClick={onClick} className={cn(ROW, "disabled:opacity-40")}>
            {Icon ? <Icon size={16} className="shrink-0 text-twilight-text-muted" aria-hidden="true" /> : null}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {value !== undefined ? <span className="text-[13px] tabular-nums text-twilight-text-muted">{value}</span> : null}
            {drill ? <ChevronRight size={15} className="shrink-0 text-twilight-text-muted" aria-hidden="true" /> : null}
        </button>
    );
}

/**
 * The ⋯ menu, in both rooms: one popover that drills into sub-panels instead of opening a sheet.
 * Format/Insert rows appear only where the surface has no toolbar for them (desktop and tablet);
 * on a phone those live in the Aa and + panels.
 */
export function NoteMoreMenu({
    editor, compactToolbar, wordCount, body, sourceMode, onAction, onRunCommand, trigger,
}: {
    editor: Editor | null;
    /** Phone: Format/Insert are panels, so this menu leaves them out. */
    compactToolbar: boolean;
    wordCount: number;
    body: string;
    sourceMode: boolean;
    /** Room-level actions: find, outline, copy, download, edit markdown, convert. */
    onAction: (id: NoteCommandId) => void;
    onRunCommand: (id: NoteCommandId) => void;
    trigger?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<View>("root");
    const suggestions = deriveNoteSuggestions(body);
    const inTable = !!editor?.isActive("table");

    const run = (id: NoteCommandId) => {
        setOpen(false);
        onRunCommand(id);
    };
    const act = (id: NoteCommandId) => {
        setOpen(false);
        onAction(id);
    };
    const Back = ({ title, to = "root" }: { title: string; to?: View }) => (
        <button type="button" onClick={() => setView(to)} className={cn(ROW, "font-medium text-twilight-text")}>
            <ChevronLeft size={16} aria-hidden="true" />
            {title}
        </button>
    );
    const cmd = (id: NoteCommandId, extra?: Partial<Parameters<typeof Row>[0]>) => {
        const c = getNoteCommand(id);
        return <Row key={id} icon={c.icon} label={c.label} onClick={() => run(id)} disabled={editor ? c.canRun?.(editor) === false : true} {...extra} />;
    };

    return (
        <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) setView("root"); }}>
            <Tip label="More" side="bottom">
                <Popover.Trigger asChild>
                    {trigger ?? (
                        <button type="button" aria-label="More" className="inline-flex size-11 items-center justify-center rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                            <MoreHorizontal size={18} aria-hidden="true" />
                        </button>
                    )}
                </Popover.Trigger>
            </Tip>
            <Popover.Content
                align="end"
                className="w-[min(18rem,calc(100vw-1.5rem))] p-1"
                onCloseAutoFocus={(e) => { e.preventDefault(); editor?.commands.focus(); }}
            >
                <div role="menu" aria-label="More" className="max-h-[min(30rem,70dvh)] overflow-y-auto overscroll-contain">
                    {view === "root" && (
                        <>
                            <Row icon={getNoteCommand("find").icon} label="Find and replace" value={getNoteCommand("find").shortcut} onClick={() => act("find")} disabled={sourceMode} />
                            {inTable && <Row icon={getNoteCommand("table").icon} label="Table" drill onClick={() => setView("table")} />}
                            {!compactToolbar && !sourceMode && (
                                <>
                                    <Row icon={getNoteCommand("strike").icon} label="Format" drill onClick={() => setView("format")} />
                                    <Row icon={getNoteCommand("table").icon} label="Insert" drill onClick={() => setView("insert")} />
                                </>
                            )}
                            {compactToolbar && <Row icon={getNoteCommand("outline").icon} label="Outline" onClick={() => act("outline")} />}
                            <Row icon={Lightbulb} label="Writing tools" drill onClick={() => setView("tools")} value={suggestions.length ? `${suggestions.length}` : undefined} />
                            <div className="my-1 h-px bg-twilight-border" />
                            <Row icon={getNoteCommand("copy-markdown").icon} label="Copy Markdown" onClick={() => act("copy-markdown")} />
                            <Row icon={getNoteCommand("download-markdown").icon} label="Download .md" onClick={() => act("download-markdown")} />
                            <Row icon={getNoteCommand("edit-markdown").icon} label={sourceMode ? "Back to visual editing" : "Edit Markdown"} onClick={() => act("edit-markdown")} />
                            <div className="my-1 h-px bg-twilight-border" />
                            <div className={cn(MENU_ITEM, "justify-between text-twilight-text-muted")}>
                                <span>Word count</span>
                                <span className="tabular-nums">{wordCount.toLocaleString()}</span>
                            </div>
                        </>
                    )}
                    {view === "format" && (
                        <>
                            <Back title="Format" />
                            {(["strike", "code", "clear-formatting", "heading-4", "heading-5", "heading-6"] as const).map((id) => cmd(id))}
                        </>
                    )}
                    {view === "insert" && (
                        <>
                            <Back title="Insert" />
                            {(["table", "divider", "code-block", "quote"] as const).map((id) => cmd(id))}
                            <Row icon={getNoteCommand("template:meeting" as NoteCommandId).icon} label="Template" drill onClick={() => setView("templates")} />
                        </>
                    )}
                    {view === "templates" && (
                        <>
                            <Back title="Template" to="insert" />
                            {TEMPLATE_COMMANDS.map((t) => cmd(t.id))}
                        </>
                    )}
                    {view === "table" && (
                        <>
                            <Back title="Table" />
                            {(["table-add-row", "table-add-column", "table-delete-row", "table-delete-column", "table-delete"] as const).map((id) => cmd(id))}
                        </>
                    )}
                    {view === "tools" && (
                        <>
                            <Back title="Writing tools" />
                            <Row icon={getNoteCommand("convert-subtasks").icon} label="Subtasks from lines" onClick={() => act("convert-subtasks")} />
                            {suggestions.length === 0 ? (
                                <p className="px-3 py-2.5 text-[13px] text-twilight-text-muted">Nothing to suggest right now.</p>
                            ) : suggestions.map((s) => (
                                <Row
                                    key={s.id}
                                    icon={Lightbulb}
                                    label={s.title}
                                    onClick={() => (s.command === "convert-subtasks" ? act("convert-subtasks") : s.command ? run(s.command) : setOpen(false))}
                                />
                            ))}
                        </>
                    )}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}
