import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { noteExtensions, markdownToDoc, docToMarkdown, isFaithful } from "../../../lib/notes/note-markdown";
import { NoteFind } from "../../../lib/notes/note-find";
import type { NoteSession } from "../../../lib/notes/note-session";
import type { CollabNoteHandle } from "../../../lib/notes/collab-session";
import { openExternalUrl } from "../../../platform/runtime";
import { cn } from "../../../lib/utils";
import { NoteSlashMenu, SLASH_LIST_ID, slashOptionId } from "./NoteSlashMenu";
import { NoteLinkPopover, normalizeLink } from "./NoteLinkPopover";
import { applyRemoteDoc, posAtPoint } from "./note-selection";
import { filterSlashCommands, type NoteCommand } from "./note-commands";

const REPORT_MS = 120;
const REPORT_MAX_MS = 1_000;
const BACKGROUND_APPLY_MS = 400;

interface Slash {
    from: number;
    to: number;
    query: string;
}

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
    collab?: CollabNoteHandle | null;
    collabUser?: { name: string; color: string };
    viewId: string;
    placeholder: string;
    commandHint?: boolean;
    variant: "room" | "inline";
    editable?: boolean;
    autoFocus?: boolean;
    onUnfaithful?: () => void;
    onEditor?: (editor: Editor | null) => void;
    onSave?: () => void;
    onFind?: () => void;
    onRequestEdit?: (pos: number | null) => void;
    onFocusChange?: (focused: boolean) => void;
    slashBottomInset?: number;
    className?: string;
}

export function NoteEditor({
    session,
    collab = null,
    collabUser,
    viewId,
    placeholder,
    commandHint,
    variant,
    editable = true,
    autoFocus,
    onUnfaithful,
    onEditor,
    onSave,
    onFind,
    onRequestEdit,
    onFocusChange,
    slashBottomInset = 0,
    className,
}: NoteEditorProps) {
    const dirty = useRef(false);
    const dirtySince = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pendingRemote = useRef<string | null>(null);
    const remoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const settleRemote = useRef<() => void>(() => undefined);
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
        setSlash((prev) =>
            prev?.from === live?.from && prev?.to === live?.to && prev?.query === live?.query ? prev : live,
        );
    }, []);

    const report = useCallback(
        (editor: Editor) => {
            clearTimeout(timer.current);
            timer.current = undefined;
            dirty.current = false;
            const md = docToMarkdown(editor.getJSON());
            if (collab) {
                collab.sendSnapshot(md);
            } else {
                session.edit(md, viewId);
            }
        },
        [collab, session, viewId],
    );

    const schedule = useCallback(
        (editor: Editor) => {
            if (!dirty.current) dirtySince.current = Date.now();
            dirty.current = true;
            clearTimeout(timer.current);
            const run = () => {
                if (editor.view.composing) timer.current = setTimeout(run, 60);
                else report(editor);
            };
            timer.current = setTimeout(
                run,
                Math.max(0, Math.min(REPORT_MS, REPORT_MAX_MS - (Date.now() - dirtySince.current))),
            );
        },
        [report],
    );

    const dismissSlash = useCallback(() => {
        if (!slashRef.current) return;
        dismissed.current = slashRef.current.from;
        slashRef.current = null;
        setSlash(null);
    }, []);

    const pickSlash = useCallback((command: NoteCommand) => {
        const editor = editorRef.current;
        const current = slashRef.current;
        if (!editor || !current) return;
        editor.chain().focus().deleteRange({ from: current.from, to: current.to }).run();
        command.run?.(editor);
        slashRef.current = null;
        setSlash(null);
    }, []);

    const slashKey = useCallback(
        (event: KeyboardEvent): boolean | undefined => {
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
                if (!list.length) return false;
                pickSlash(list[Math.min(slashIndexRef.current, list.length - 1)]);
                return true;
            }
            if (event.key === "Escape") {
                dismissSlash();
                return true;
            }
            return undefined;
        },
        [dismissSlash, pickSlash],
    );

    const shortcutKey = useCallback(
        (key: string) => {
            if (key === "s") {
                const e = editorRef.current;
                if (collab && e && !e.isDestroyed && dirty.current) report(e);
                handlers.current.onSave?.();
                return true;
            }
            if (key === "f") {
                handlers.current.onFind?.();
                return true;
            }
            if (key === "k") {
                setLinkOpen(true);
                return true;
            }
            return false;
        },
        [collab, report],
    );

    const extensions = useMemo(() => {
        const base = [...noteExtensions(placeholder, { collaborative: Boolean(collab) }), NoteFind];
        if (!collab) return base;
        return [
            ...base,
            Collaboration.configure({ document: collab.doc }),
            CollaborationCaret.configure({
                provider: collab.provider,
                user: collabUser ?? { name: "Member", color: "#e8a44a" },
            }),
        ];
    }, [collab, collabUser, placeholder]);

    const editor = useEditor({
        extensions,
        content: collab ? undefined : markdownToDoc(session.getSnapshot().body),
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
                if (slashRef.current && !event.isComposing) {
                    const handled = slashKey(event);
                    if (handled !== undefined) return handled;
                }
                if (!(event.metaKey || event.ctrlKey) || event.isComposing) return false;
                return shortcutKey(event.key.toLowerCase());
            },
            handleClick: (view, pos, event) => {
                if (!(event.metaKey || event.ctrlKey)) return false;
                const href = view.state.doc
                    .resolve(pos)
                    .marks()
                    .find((m) => m.type.name === "link")?.attrs.href as string | undefined;
                const safe = href ? normalizeLink(href) : null;
                if (!safe) return false;
                void openExternalUrl(safe);
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
        onFocus: () => {
            settleRemote.current();
            onFocusChange?.(true);
        },
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
        const dom = editor?.view.dom;
        if (!dom) return;
        const row = slash && matches.length ? matches[Math.min(slashIndex, matches.length - 1)] : null;
        if (row) {
            dom.setAttribute("aria-controls", SLASH_LIST_ID);
            dom.setAttribute("aria-activedescendant", slashOptionId(row.id));
        } else {
            dom.removeAttribute("aria-controls");
            dom.removeAttribute("aria-activedescendant");
        }
    }, [editor, slash, matches, slashIndex]);

    useEffect(() => {
        editor?.setEditable(editable);
    }, [editor, editable]);

    useEffect(() => {
        if (!editor || !collab) return;
        const trySeed = () => {
            const snap = session.getSnapshot();
            if (snap.loaded) collab.seedOnce(editor, snap.body);
        };
        trySeed();
        const unsubCollab = collab.subscribe(trySeed);
        const unsubSession = session.subscribe(trySeed);
        return () => {
            unsubCollab();
            unsubSession();
        };
    }, [editor, collab, session]);

    useEffect(() => {
        if (!editor || collab) return;
        const apply = (body: string, now = false) => {
            if (editor.isDestroyed) return;
            if (editor.view.composing || (!now && !editor.isFocused)) {
                pendingRemote.current = body;
                clearTimeout(remoteTimer.current);
                remoteTimer.current = setTimeout(settle, BACKGROUND_APPLY_MS);
                return;
            }
            if (!isFaithful(body)) return handlers.current.onUnfaithful?.();
            applyRemoteDoc(editor, editor.schema.nodeFromJSON(markdownToDoc(body)));
            setEmpty(editor.isEmpty);
        };
        const settle = () => {
            clearTimeout(remoteTimer.current);
            const body = pendingRemote.current;
            pendingRemote.current = null;
            if (body !== null) apply(body, true);
        };
        settleRemote.current = settle;
        const detach = session.attachView(
            viewId,
            (body) => apply(body),
            () => {
                if (!dirty.current) return null;
                clearTimeout(timer.current);
                timer.current = undefined;
                dirty.current = false;
                return docToMarkdown(editor.getJSON());
            },
        );
        editor.view.dom.addEventListener("compositionend", settle);
        return () => {
            clearTimeout(remoteTimer.current);
            settleRemote.current = () => undefined;
            editor.view.dom.removeEventListener("compositionend", settle);
            detach();
        };
    }, [editor, collab, session, viewId]);

    useEffect(() => {
        if (!collab) return;
        const flush = () => {
            const e = editorRef.current;
            if (e && !e.isDestroyed && dirty.current) report(e);
        };
        window.addEventListener("pagehide", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            flush();
        };
    }, [collab, report]);

    useEffect(() => () => clearTimeout(timer.current), []);

    const onWrapperClick = (event: MouseEvent<HTMLDivElement>) => {
        if (editable || !editor || !onRequestEdit) return;
        if ((event.target as HTMLElement).closest("a")) event.preventDefault();
        onRequestEdit(posAtPoint(editor, event.clientX, event.clientY));
    };

    if (!editor) return null;

    return (
        // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
            onClick={onWrapperClick}
            data-note-surface={variant}
            data-escape-owner={slash ? "" : undefined}
            data-hint={commandHint && empty ? "" : undefined}
            className={cn("note-editor relative", className)}
        >
            <EditorContent editor={editor} />
            {slash && (
                <NoteSlashMenu
                    editor={editor}
                    anchorPos={slash.to}
                    commands={matches}
                    index={slashIndex}
                    bottomInset={slashBottomInset}
                    onPick={pickSlash}
                    onDismiss={dismissSlash}
                    onHover={(i) => {
                        slashIndexRef.current = i;
                        setSlashIndex(i);
                    }}
                />
            )}
            <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
        </div>
    );
}
