import type { Editor } from "@tiptap/core";
import { Undo2, Redo2, Bold, Italic, Link2, List, ListOrdered, ListTodo, ChevronDown } from "lucide-react";
import { Tip } from "../../primitives/Tooltip";
import * as Select from "../../primitives/Select";
import * as DropdownMenu from "../../primitives/DropdownMenu";
import { SEGMENT_ACTIVE } from "../../primitives/SegmentedControl";
import { cn } from "../../../lib/utils";
import { getNoteCommand, runNoteCommand, type NoteCommandId } from "./note-commands";
import { BLOCK_LABEL, useNoteToolbarState, type ToolbarState } from "./use-note-toolbar-state";
import type { ReactNode, CSSProperties } from "react";

const TONE = { "--segment-tone": "var(--accent-primary)" } as CSSProperties;

/** A formatting button that never takes the editor's focus or selection. */
export function ToolButton({ id, pressed, disabled, onClick, children, label, className }: {
    id?: NoteCommandId;
    pressed?: boolean | "mixed";
    disabled?: boolean;
    onClick: () => void;
    children: ReactNode;
    label: string;
    className?: string;
}) {
    const shortcut = id ? getNoteCommand(id).shortcut : undefined;
    return (
        <Tip label={shortcut ? `${label} (${shortcut})` : label} side="bottom">
            <button
                type="button"
                aria-label={label}
                aria-pressed={pressed === undefined ? undefined : pressed}
                disabled={disabled}
                style={TONE}
                // Keep the caret and selection where they are.
                onMouseDown={(e) => e.preventDefault()}
                onClick={onClick}
                className={cn(
                    "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent [[data-density=compact]_&]:size-9",
                    pressed && SEGMENT_ACTIVE,
                    className,
                )}
            >
                {children}
            </button>
        </Tip>
    );
}

const BLOCKS: NoteCommandId[] = ["paragraph", "heading-1", "heading-2", "heading-3"];

/** The text-style picker names the current block; deeper headings still show when the caret is in one. */
function TextStylePicker({ editor, state }: { editor: Editor; state: ToolbarState }) {
    const options = BLOCKS.includes(state.block as NoteCommandId) || state.block === "code-block" || state.block === "quote"
        ? [...BLOCKS, ...(state.block === "code-block" || state.block === "quote" ? [state.block as NoteCommandId] : [])]
        : [...BLOCKS, state.block as NoteCommandId];
    return (
        <Select.Select
            value={state.block}
            onValueChange={(value) => { if (value !== "code-block" && value !== "quote") runNoteCommand(editor, value as NoteCommandId); }}
        >
            <Select.SelectTrigger aria-label="Text style" className="h-11 w-auto min-w-[8.5rem] gap-2 rounded-xl border-transparent bg-transparent text-sm shadow-none [[data-density=compact]_&]:h-9">
                <Select.SelectValue>{BLOCK_LABEL[state.block]}</Select.SelectValue>
            </Select.SelectTrigger>
            <Select.SelectContent onCloseAutoFocus={(e) => { e.preventDefault(); editor.commands.focus(); }}>
                {options.map((id) => (
                    <Select.SelectItem key={id} value={id}>{BLOCK_LABEL[id as ToolbarState["block"]] ?? getNoteCommand(id).label}</Select.SelectItem>
                ))}
            </Select.SelectContent>
        </Select.Select>
    );
}

/** One list control: shows the active list kind and opens the other kinds. */
function ListMenu({ editor, state }: { editor: Editor; state: ToolbarState }) {
    const Icon = state.task ? ListTodo : state.ordered ? ListOrdered : List;
    const items: [NoteCommandId, typeof List][] = [["bullet-list", List], ["numbered-list", ListOrdered], ["checklist", ListTodo]];
    return (
        <DropdownMenu.Root>
            <Tip label="Lists" side="bottom">
                <DropdownMenu.Trigger asChild>
                    <button
                        type="button"
                        aria-label="Lists"
                        aria-pressed={state.bullet || state.ordered || state.task}
                        style={TONE}
                        onMouseDown={(e) => e.preventDefault()}
                        className={cn(
                            "inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-0.5 rounded-xl border border-transparent px-2.5 text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 [[data-density=compact]_&]:h-9",
                            (state.bullet || state.ordered || state.task) && SEGMENT_ACTIVE,
                        )}
                    >
                        <Icon size={18} aria-hidden="true" />
                        <ChevronDown size={12} aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
            </Tip>
            <DropdownMenu.Content align="start" onCloseAutoFocus={(e) => { e.preventDefault(); editor.commands.focus(); }}>
                {items.map(([id, ItemIcon]) => (
                    <DropdownMenu.Item key={id} onSelect={() => runNoteCommand(editor, id)} className="gap-3">
                        <ItemIcon size={16} aria-hidden="true" />
                        {getNoteCommand(id).label}
                    </DropdownMenu.Item>
                ))}
                {state.inList && (
                    <>
                        <DropdownMenu.Separator />
                        {(["indent", "outdent"] as const).map((id) => {
                            const c = getNoteCommand(id);
                            return (
                                <DropdownMenu.Item key={id} onSelect={() => runNoteCommand(editor, id)} className="gap-3">
                                    <c.icon size={16} aria-hidden="true" />
                                    {c.label}
                                </DropdownMenu.Item>
                            );
                        })}
                    </>
                )}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}

/**
 * Desktop and tablet formatting bar: undo/redo, text style, bold/italic, lists, link and More.
 * Compact on purpose: the rarer blocks live in More.
 */
export function NoteToolbar({ editor, onLink, more, className }: { editor: Editor | null; onLink: () => void; more: ReactNode; className?: string }) {
    const state = useNoteToolbarState(editor);
    const run = (id: NoteCommandId) => editor && runNoteCommand(editor, id);
    const mark = (m: ToolbarState["bold"]) => (m === "mixed" ? "mixed" : m === "on");

    return (
        <div role="toolbar" aria-label="Formatting" className={cn("flex flex-wrap items-center gap-0.5", className)}>
            <ToolButton id="undo" label="Undo" disabled={!state.canUndo} onClick={() => run("undo")}><Undo2 size={18} aria-hidden="true" /></ToolButton>
            <ToolButton id="redo" label="Redo" disabled={!state.canRedo} onClick={() => run("redo")}><Redo2 size={18} aria-hidden="true" /></ToolButton>
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-twilight-border" />
            {editor && <TextStylePicker editor={editor} state={state} />}
            <span aria-hidden="true" className="mx-1 h-6 w-px bg-twilight-border" />
            <ToolButton id="bold" label="Bold" pressed={mark(state.bold)} onClick={() => run("bold")}><Bold size={18} aria-hidden="true" /></ToolButton>
            <ToolButton id="italic" label="Italic" pressed={mark(state.italic)} onClick={() => run("italic")}><Italic size={18} aria-hidden="true" /></ToolButton>
            {editor && <ListMenu editor={editor} state={state} />}
            <ToolButton id="link" label="Link" pressed={state.link} onClick={onLink}><Link2 size={18} aria-hidden="true" /></ToolButton>
            {more}
        </div>
    );
}
