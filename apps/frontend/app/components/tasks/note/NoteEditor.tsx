import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import { noteExtensions, markdownToDoc, docToMarkdown, isFaithful } from "../../../lib/notes/note-markdown";
import { NoteFind } from "../../../lib/notes/note-find";
import type { NoteSession } from "../../../lib/notes/note-session";
import { openExternalUrl } from "../../../platform/runtime";
import { cn } from "../../../lib/utils";
import { NoteSlashMenu } from "./NoteSlashMenu";
import { NoteLinkPopover } from "./NoteLinkPopover";
import { applyRemoteDoc, posAtPoint } from "./note-selection";
import { filterSlashCommands, type NoteCommand } from "./note-commands";

/** Report typing to the session this often at most (the session journals ~150ms after, saves after idle). */
const REPORT_MS = 120;

interface Slash {
    from: number;
    to: number;
    query: string;
}

/** `/query` at the start of a text block, never in code or a link. */
function detectSlash(editor: Editor): Slash | null {
    const { selection } = editor.state;
    if (!selection.empty) return null;
    const $from = selection.$from;
    if (!$from.parent.isTextblock || $from.parent.type.name === "codeBlock") return null;
    if (editor.isActive("link") || editor.isActive("code")) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "￼");
    const match = /^\/([^\n]{0,24})$/.exec(before);
    return match ? { from: $from.start(), to: $from.pos, query: match[1] } : null;
}

export interface NoteEditorProps {
    session: NoteSession;
    /** Identifies this editor view to the session (the panel and the room each have one). */
    viewId: string;
    placeholder: string;
    /** Room only: a quiet "/ for commands" beside the placeholder until writing starts. */
    commandHint?: boolean;
    variant: "room" | "inline";
    /** Phone and tablet read first: not editable until asked. */
    editable?: boolean;
    autoFocus?: boolean;
    /** The visual editor can't carry this note without loss: the host shows source instead. */
    onUnfaithful?: () => void;
    onEditor?: (editor: Editor | null) => void;
    onSave?: () => void;
    onFind?: () => void;
    /** A tap while read-only; `pos` is where in the document. */
    onRequestEdit?: (pos: number | null) => void;
    onFocusChange?: (focused: boolean) => void;
    /** Pixels at the bottom the slash menu must stay clear of (phone keyboard and strip). */
    slashBottomInset?: number;
    className?: string;
}

/**
 * The visual note editor over a note session. Markdown stays the stored form: the document is
 * serialized at bounded checkpoints, never per selection change, and text from elsewhere is
 * applied as a minimal remote transaction that is never reported back.
 */
export function NoteEditor({
    session, viewId, placeholder, commandHint, variant, editable = true, autoFocus, onUnfaithful, onEditor, onSave, onFind,
    onRequestEdit, onFocusChange, slashBottomInset = 0, className,
}: NoteEditorProps) {
    const dirty = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingRemote = useRef<string | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const handlers = useRef({ onSave, onFind, onUnfaithful });
    handlers.current = { onSave, onFind, onUnfaithful };

    const [slash, setSlash] = useState<Slash | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const slashRef = useRef<Slash | null>(null);
    const slashIndexRef = useRef(0);
    const dismissed = useRef<number | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [empty, setEmpty] = useState(false);

    const matches = useMemo(() => (slash ? filterSlashCommands(slash.query) : []), [slash]);
    const matchesRef = useRef<NoteCommand[]>([]);
    matchesRef.current = matches;

    const syncSlash = useCallback((editor: Editor) => {
        const next = detectSlash(editor);
        if (!next) dismissed.current = null;
        const live = next && dismissed.current !== next.from ? next : null;
        if (slashRef.current?.query !== live?.query) {
            slashIndexRef.current = 0;
            setSlashIndex(0);
        }
        slashRef.current = live;
        setSlash((prev) => (prev?.from === live?.from && prev?.to === live?.to && prev?.query === live?.query ? prev : live));
    }, []);

    const report = useCallback((editor: Editor) => {
        clearTimeout(timer.current);
        timer.current = undefined;
        dirty.current = false;
        session.edit(docToMarkdown(editor.getJSON()), viewId);
    }, [session, viewId]);

    const schedule = useCallback((editor: Editor) => {
        dirty.current = true;
        clearTimeout(timer.current);
        const run = () => {
            // Don't serialize mid-composition; the committed text is reported right after.
            if (editor.view.composing) timer.current = setTimeout(run, 60);
            else report(editor);
        };
        timer.current = setTimeout(run, REPORT_MS);
    }, [report]);

    const pickSlash = useCallback((command: NoteCommand) => {
        const editor = editorRef.current;
        const current = slashRef.current;
        if (!editor || !current) return;
        // Only the slash and its query go; the rest of the paragraph stays.
        editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run();
        command.run?.(editor);
        slashRef.current = null;
        setSlash(null);
    }, []);

    const editor = useEditor({
        extensions: [...noteExtensions(placeholder), NoteFind],
        content: markdownToDoc(session.getSnapshot().body),
        editable,
        autofocus: autoFocus ? "end" : false,
        editorProps: {
            attributes: {
                class: "note-content",
                role: "textbox",
                "aria-multiline": "true",
                "aria-label": "Task notes",
                "data-note-editor": "",
                spellcheck: "true",
            },
            handleKeyDown: (_view, event) => {
                const mod = event.metaKey || event.ctrlKey;
                const key = event.key.toLowerCase();
                const open = slashRef.current;
                if (open && !event.isComposing) {
                    const list = matchesRef.current;
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        if (list.length) {
                            const step = event.key === "ArrowDown" ? 1 : -1;
                            slashIndexRef.current = (slashIndexRef.current + step + list.length) % list.length;
                            setSlashIndex(slashIndexRef.current);
                        }
                        return true;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                        if (list.length) {
                            pickSlash(list[Math.min(slashIndexRef.current, list.length - 1)]);
                            return true;
                        }
                        return false;
                    }
                    if (event.key === "Escape") {
                        // The first Escape closes the menu and leaves the typed text alone.
                        dismissed.current = open.from;
                        slashRef.current = null;
                        setSlash(null);
                        return true;
                    }
                }
                if (!mod || event.isComposing) return false;
                if (key === "s") { handlers.current.onSave?.(); return true; }
                if (key === "f") { handlers.current.onFind?.(); return true; }
                if (key === "k") { setLinkOpen(true); return true; }
                return false;
            },
            handleClick: (view, pos, event) => {
                // A plain tap just places the caret; following a link is explicit (⌘/Ctrl-click, or Open in the link editor).
                if (!(event.metaKey || event.ctrlKey)) return false;
                const href = view.state.doc.resolve(pos).marks().find((m) => m.type.name === "link")?.attrs.href as string | undefined;
                if (!href) return false;
                void openExternalUrl(href);
                return true;
            },
        },
        onUpdate: ({ editor: e, transaction }) => {
            if (transaction.getMeta("remote")) return;
            schedule(e);
            setEmpty(e.isEmpty);
            syncSlash(e);
        },
        onSelectionUpdate: ({ editor: e }) => syncSlash(e),
        onFocus: () => onFocusChange?.(true),
        onBlur: () => {
            const e = editorRef.current;
            if (e && dirty.current) report(e);
            onFocusChange?.(false);
        },
    });
    editorRef.current = editor;

    useEffect(() => {
        onEditor?.(editor);
        if (editor) setEmpty(editor.isEmpty);
        return () => onEditor?.(null);
    }, [editor, onEditor]);

    useEffect(() => {
        editor?.setEditable(editable);
    }, [editor, editable]);

    // The session asks for unreported text before saving, and hands back text from elsewhere.
    useEffect(() => {
        if (!editor) return;
        const apply = (body: string) => {
            if (!isFaithful(body)) return handlers.current.onUnfaithful?.();
            if (editor.view.composing) {
                pendingRemote.current = body;
                return;
            }
            applyRemoteDoc(editor, editor.schema.nodeFromJSON(markdownToDoc(body)));
            setEmpty(editor.isEmpty);
        };
        const detach = session.attachView(
            viewId,
            apply,
            () => {
                if (!dirty.current) return null;
                clearTimeout(timer.current);
                timer.current = undefined;
                dirty.current = false;
                return docToMarkdown(editor.getJSON());
            },
        );
        const settle = () => {
            const body = pendingRemote.current;
            pendingRemote.current = null;
            if (body !== null) apply(body);
        };
        editor.view.dom.addEventListener("compositionend", settle);
        return () => {
            editor.view.dom.removeEventListener("compositionend", settle);
            detach();
        };
    }, [editor, session, viewId]);

    useEffect(() => () => clearTimeout(timer.current), []);

    const onWrapperClick = (event: MouseEvent<HTMLDivElement>) => {
        if (editable || !editor || !onRequestEdit) return;
        // A link tapped while reading still doesn't navigate.
        if ((event.target as HTMLElement).closest("a")) event.preventDefault();
        onRequestEdit(posAtPoint(editor, event.clientX, event.clientY));
    };

    if (!editor) return null;

    return (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
            onClick={onWrapperClick}
            data-note-surface={variant}
            data-hint={commandHint && empty ? "" : undefined}
            className={cn("note-editor relative", className)}
        >
            <EditorContent editor={editor} />
            {slash && <NoteSlashMenu editor={editor} anchorPos={slash.to} commands={matches} index={slashIndex} bottomInset={slashBottomInset} onPick={pickSlash} onHover={(i) => { slashIndexRef.current = i; setSlashIndex(i); }} />}
            <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
        </div>
    );
}
