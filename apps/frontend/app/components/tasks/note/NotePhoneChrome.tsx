import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { Keyboard, ChevronLeft } from "lucide-react";
import { Code2, Bold, Italic, Strikethrough, ListTodo, List, ListOrdered, IndentDecrease, IndentIncrease, Slash, Link2, Table2, Minus, SquareCode, Quote, ChevronRight } from "lucide-react";
import { SegmentedControl, SEGMENT_ACTIVE } from "../../primitives/SegmentedControl";
import { Reveal } from "../../shared/Reveal";
import { MENU_ITEM } from "../../primitives/menu-styles";
import { cn } from "../../../lib/utils";
import { getNoteCommand, runNoteCommand, TEMPLATE_COMMANDS, type NoteCommandId } from "./note-commands";
import { BLOCK_LABEL, markPressed, useNoteToolbarState, type ToolbarState } from "./use-note-toolbar-state";
import type { CSSProperties } from "react";

const TONE = { "--segment-tone": "var(--accent-primary)" } as CSSProperties;
/** Buttons here must never take focus: the editor keeps its caret, selection and keyboard. */
const keep = { onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(), onPointerDown: (e: { preventDefault: () => void }) => e.preventDefault() };

function StripButton({ icon: Icon, label, pressed, disabled, onClick }: { icon: typeof Bold; label: string; pressed?: boolean | "mixed"; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            style={TONE}
            {...keep}
            onClick={onClick}
            className={cn(
                "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent text-twilight-text-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:opacity-40",
                pressed && SEGMENT_ACTIVE,
            )}
        >
            <Icon size={18} aria-hidden="true" />
        </button>
    );
}

const MARKS = [["bold", "Bold", Bold], ["italic", "Italic", Italic], ["strike", "Strikethrough", Strikethrough], ["code", "Code", Code2]] as const;

/** Bold, italic and strikethrough (plus inline code with `code`), pressed when the selection carries them. */
function MarkButtons({ state, run, code = false }: { state: ToolbarState; run: (id: NoteCommandId) => void; code?: boolean }) {
    return (code ? MARKS : MARKS.slice(0, 3)).map(([id, label, icon]) => <StripButton key={id} icon={icon} label={label} pressed={markPressed(state[id])} onClick={() => run(id)} />);
}

/** Outdent and indent, live only inside a list. */
function IndentButtons({ state, run }: { state: ToolbarState; run: (id: NoteCommandId) => void }) {
    return (
        <>
            <StripButton icon={IndentDecrease} label="Outdent" disabled={!state.inList} onClick={() => run("outdent")} />
            <StripButton icon={IndentIncrease} label="Indent" disabled={!state.inList} onClick={() => run("indent")} />
        </>
    );
}

const Divider = () => <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-twilight-border" />;

/**
 * The quick-action strip riding the keyboard: one glass capsule in a fixed order so muscle memory
 * holds. It scrolls sideways past what fits; the edge fade says there's more.
 */
export function NoteQuickStrip({ editor, bottom, onSlash }: { editor: Editor | null; bottom: string; onSlash: () => void }) {
    const s = useNoteToolbarState(editor);
    const run = (id: NoteCommandId) => editor && runNoteCommand(editor, id);
    return (
        <div
            role="toolbar"
            aria-label="Quick formatting"
            data-note-strip
            style={{ bottom }}
            className="glass-surface fixed inset-x-2 z-[1] flex items-center gap-0.5 overflow-x-auto rounded-full px-1.5 py-1 [mask-image:linear-gradient(to_right,transparent,#000_14px,#000_calc(100%-14px),transparent)] scrollbar-hide"
        >
            <StripButton icon={Slash} label="Commands" onClick={onSlash} />
            <MarkButtons state={s} run={run} />
            <Divider />
            <StripButton icon={ListTodo} label="Checklist" pressed={s.task} onClick={() => run("checklist")} />
            <StripButton icon={List} label="Bullets" pressed={s.bullet} onClick={() => run("bullet-list")} />
            <StripButton icon={ListOrdered} label="Numbers" pressed={s.ordered} onClick={() => run("numbered-list")} />
            <Divider />
            <IndentButtons state={s} run={run} />
        </div>
    );
}

function PanelRow({ icon: Icon, label, onClick, drill, pressed }: { icon: typeof Bold; label: string; onClick: () => void; drill?: boolean; pressed?: boolean }) {
    return (
        <button
            type="button"
            style={TONE}
            {...keep}
            onClick={onClick}
            aria-pressed={pressed}
            className={cn(MENU_ITEM, "w-full min-h-11 gap-3 text-left text-twilight-text-soft hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50", pressed && SEGMENT_ACTIVE)}
        >
            <Icon size={18} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {drill ? <ChevronRight size={16} className="text-twilight-text-muted" aria-hidden="true" /> : null}
        </button>
    );
}

/**
 * Aa / + panels take the keyboard's place at its last height (no scrim, no handle): the document stays live
 * above, so a change shows on the selection at once. The keyboard button (or tapping the text) goes back.
 */
export function NotePhonePanel({
    kind, height, editor, onKeyboard, onLink, onSubtasks,
}: {
    kind: "format" | "insert";
    height: number;
    editor: Editor | null;
    onKeyboard: () => void;
    onLink: () => void;
    onSubtasks: () => void;
}) {
    const [tab, setTab] = useState<"text" | "paragraph">("text");
    const [headings, setHeadings] = useState(false);
    const [templates, setTemplates] = useState(false);
    const s = useNoteToolbarState(editor);
    const run = (id: NoteCommandId) => editor && runNoteCommand(editor, id);

    return (
        <div
            data-note-panel
            style={{ height, paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            className="glass-surface fixed inset-x-0 bottom-0 z-[2] flex flex-col overflow-hidden rounded-t-[1.75rem]"
        >
            <div className="flex shrink-0 items-center gap-2 px-3 pt-2">
                {kind === "format" && (
                    <SegmentedControl
                        value={tab}
                        onChange={setTab}
                        ariaLabel="Format"
                        options={[{ value: "text", label: "Text" }, { value: "paragraph", label: "Paragraph" }]}
                        className="flex-1"
                    />
                )}
                {kind === "insert" && <h2 className="flex-1 px-1 font-display text-base font-semibold text-twilight-text">Insert</h2>}
                <button type="button" aria-label="Show keyboard" {...keep} onClick={onKeyboard} className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                    <Keyboard size={20} aria-hidden="true" />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-1">
                {kind === "format" && tab === "text" && (
                    <>
                        {(["paragraph", "heading-1", "heading-2", "heading-3"] as const).map((id) => (
                            <PanelRow key={id} icon={getNoteCommand(id).icon} label={id === "paragraph" ? "Normal" : BLOCK_LABEL[id]} pressed={s.block === id} onClick={() => run(id)} />
                        ))}
                        <PanelRow icon={getNoteCommand("heading-4").icon} label="More headings" drill onClick={() => setHeadings((v) => !v)} />
                        <Reveal open={headings}>
                            {(["heading-4", "heading-5", "heading-6"] as const).map((id) => (
                                <PanelRow key={id} icon={getNoteCommand(id).icon} label={BLOCK_LABEL[id]} pressed={s.block === id} onClick={() => run(id)} />
                            ))}
                        </Reveal>
                        <div className="my-1 h-px bg-twilight-border" />
                        <div className="flex items-center justify-between gap-1 px-1 py-1">
                            <MarkButtons state={s} run={run} code />
                        </div>
                        <PanelRow icon={getNoteCommand("clear-formatting").icon} label="Clear formatting" onClick={() => run("clear-formatting")} />
                    </>
                )}
                {kind === "format" && tab === "paragraph" && (
                    <>
                        <PanelRow icon={List} label="Bullets" pressed={s.bullet} onClick={() => run("bullet-list")} />
                        <PanelRow icon={ListOrdered} label="Numbers" pressed={s.ordered} onClick={() => run("numbered-list")} />
                        <PanelRow icon={ListTodo} label="Checklist" pressed={s.task} onClick={() => run("checklist")} />
                        <PanelRow icon={Quote} label="Quote" pressed={s.block === "quote"} onClick={() => run("quote")} />
                        <PanelRow icon={SquareCode} label="Code block" pressed={s.block === "code-block"} onClick={() => run("code-block")} />
                        <div className="flex gap-1 px-1 pt-1">
                            <IndentButtons state={s} run={run} />
                        </div>
                    </>
                )}
                {kind === "insert" && !templates && (
                    <>
                        <PanelRow icon={Link2} label="Link" onClick={onLink} />
                        <PanelRow icon={ListTodo} label="Checklist" onClick={() => run("checklist")} />
                        <PanelRow icon={Table2} label="Table" onClick={() => run("table")} />
                        <PanelRow icon={Minus} label="Divider" onClick={() => run("divider")} />
                        <PanelRow icon={SquareCode} label="Code block" onClick={() => run("code-block")} />
                        <PanelRow icon={getNoteCommand("template:meeting" as NoteCommandId).icon} label="Template" drill onClick={() => setTemplates(true)} />
                        <PanelRow icon={getNoteCommand("convert-subtasks").icon} label="Subtasks from lines" onClick={onSubtasks} />
                    </>
                )}
                {kind === "insert" && templates && (
                    <>
                        <PanelRow icon={ChevronLeft} label="Back" onClick={() => setTemplates(false)} />
                        {TEMPLATE_COMMANDS.map((t) => <PanelRow key={t.id} icon={t.icon} label={t.label} onClick={() => { run(t.id); setTemplates(false); }} />)}
                    </>
                )}
            </div>
        </div>
    );
}
