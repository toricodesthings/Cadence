import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, Loader2, ListTree, Pencil, Plus, X, Type } from "lucide-react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { toast } from "sonner";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { useTaskNote, useNoteSessionLifecycle } from "../../hooks/tasks/use-task-note";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useKeyboardInset } from "../../hooks/ui/use-keyboard-inset";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { getNoteScopeLabel, isSeriesScopedNote } from "../../lib/notes/recurring-note-scope";
import { extractNoteOutline, findHeading, currentHeadingId, countWords, type NoteHeading } from "../../lib/notes/note-outline";
import { docText, isFaithful, markdownToDoc } from "../../lib/notes/note-markdown";
import { NOTE_MAX_CHARS, type NoteStatus as Status } from "../../lib/notes/note-session";
import { ImmersiveDetailLayout } from "../shared/ImmersiveDetailLayout";
import { PageHeader, PAGE_HEADER_SURFACE } from "../layout/PageHeader";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Reveal } from "../shared/Reveal";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import * as AlertDialog from "../primitives/AlertDialog";
import { cn } from "../../lib/utils";
import { NoteEditor } from "./note/NoteEditor";
import { NoteToolbar, ToolButton } from "./note/NoteToolbar";
import { NoteMoreMenu } from "./note/NoteMoreMenu";
import { NoteStatus } from "./note/NoteStatus";
import { NoteFindBar } from "./note/NoteFindBar";
import { NoteOutline } from "./note/NoteOutline";
import { NoteSourceEditor } from "./note/NoteSourceEditor";
import { NoteConvertSheet } from "./note/NoteConvertSheet";
import { NoteConflictSheet } from "./note/NoteConflictSheet";
import { NoteQuickStrip, NotePhonePanel } from "./note/NotePhoneChrome";
import { NoteLinkPopover } from "./note/NoteLinkPopover";
import { copyText, downloadMarkdown } from "./note/note-export";
import { runNoteCommand, getNoteCommand, type NoteCommandId } from "./note/note-commands";
import { useNoteToolbarState } from "./note/use-note-toolbar-state";

const OUTLINE_PREF = "cadence-note-outline";
const readOutlinePref = () => {
    try {
        return localStorage.getItem(OUTLINE_PREF) === "1";
    } catch {
        return false;
    }
};

/**
 * TaskNoteRoom — the full-screen writing room. Mounted at shell level (MainLayout) over the
 * opaque focus shell; opened through the note room store.
 */
export function TaskNoteRoom() {
    const { taskId, taskTitle, close } = useNoteRoomStore();
    const reduced = useReducedMotionSetting();
    return (
        <AnimatePresence>
            {taskId !== null && (
                <motion.div
                    key="note-room"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                    className="layer-fullscreen-surface fixed inset-0"
                >
                    <NoteRoomInner taskId={taskId} taskTitle={taskTitle} onClose={close} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function NoteRoomInner({ taskId, taskTitle, onClose }: { taskId: string; taskTitle: string; onClose: () => void }) {
    const { task, session, state, status, isLoading, loadFailed } = useTaskNote(taskId);
    useNoteSessionLifecycle();
    const shell = useShellMode();
    const phone = shell.isPhone;
    const fade = useReducedMotionSetting() ? 0 : 0.15;
    const scrollToHeading = useNoteRoomStore((s) => s.scrollToHeading);
    const clearScrollTarget = useNoteRoomStore((s) => s.clearScrollTarget);

    const [editor, setEditor] = useState<Editor | null>(null);
    const [sourceMode, setSourceMode] = useState(false);
    const [findOpen, setFindOpen] = useState(false);
    const [outlineRail, setOutlineRail] = useState(readOutlinePref);
    const [outlineSheet, setOutlineSheet] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [panel, setPanel] = useState<"format" | "insert" | null>(null);
    const [finishing, setFinishing] = useState(false);
    const [words, setWords] = useState(0);
    const lastPos = useRef<number | null>(null);
    const opener = useRef<HTMLElement | null>(null);
    const checkedFidelity = useRef(false);

    const title = task?.title ?? taskTitle;
    const scope = task && isSeriesScopedNote(task) ? getNoteScopeLabel(task) : null;
    const body = state?.body ?? "";

    // Close hands focus back to whatever opened the room.
    useEffect(() => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        return () => opener.current?.focus?.();
    }, []);

    // A note the visual editor can't carry whole opens as Markdown, never silently trimmed.
    useEffect(() => {
        if (!state?.loaded || checkedFidelity.current) return;
        checkedFidelity.current = true;
        if (!isFaithful(state.body)) setSourceMode(true);
    }, [state?.loaded, state?.body]);

    // Phone keyboard: strip and panels ride it; a panel takes its place at the last height.
    const { inset, lastHeight } = useKeyboardInset(phone);
    const panelHeight = Math.min(Math.max(lastHeight() || 320, 280), Math.round((typeof window === "undefined" ? 800 : window.innerHeight) / 2));
    const effectiveInset = phone ? (panel ? panelHeight : inset) : 0;

    // ── words (debounced: never per keystroke) ──
    useEffect(() => {
        const id = setTimeout(() => {
            setWords(countWords(editor && !sourceMode ? editor.state.doc.textBetween(0, editor.state.doc.content.size, " ", " ") : docText(markdownToDoc(body))));
        }, 250);
        return () => clearTimeout(id);
    }, [editor, body, sourceMode]);

    // ── outline (from the document, not Markdown lines) ──
    const outlineCache = useRef(new WeakMap<object, NoteHeading[]>());
    const outlineState = useEditorState({
        editor,
        selector: ({ editor: e }) => {
            if (!e) return { headings: [] as NoteHeading[], current: null as string | null };
            let headings = outlineCache.current.get(e.state.doc);
            if (!headings) outlineCache.current.set(e.state.doc, (headings = extractNoteOutline(e.state.doc)));
            return { headings, current: currentHeadingId(headings, e.state.selection.from) };
        },
        equalityFn: (a, b) => !!b && a.current === b.current && a.headings.length === b.headings.length && a.headings.every((h, i) => h.id === b.headings[i].id && h.pos === b.headings[i].pos),
    }) ?? { headings: [], current: null };

    const jumpTo = useCallback((heading: NoteHeading, focus = true) => {
        if (!editor) return;
        const chain = editor.chain();
        if (focus) chain.focus();
        chain.setTextSelection(heading.pos + 1).run();
        const dom = editor.view.domAtPos(heading.pos + 1).node;
        (dom instanceof Element ? dom : dom.parentElement)?.scrollIntoView({ block: "start", behavior: "auto" });
    }, [editor]);

    // Search opens a heading: jump to the real one, no keyboard on a phone.
    useEffect(() => {
        if (!scrollToHeading || !editor || sourceMode) return;
        const heading = findHeading(outlineState.headings, scrollToHeading);
        if (heading) jumpTo(heading, !phone);
        clearScrollTarget();
    }, [scrollToHeading, editor, sourceMode, outlineState.headings, jumpTo, phone, clearScrollTarget]);

    // ── closing ──
    const requestClose = useCallback(async () => {
        if (!session) return onClose();
        const safe = await session.persist();
        if (safe) {
            session.checkpoint();
            onClose();
        } else {
            setRecoveryOpen(true);
        }
    }, [onClose, session]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // One Escape per layer: a menu or dialog that took it has already prevented the default.
            if (e.key !== "Escape" || e.defaultPrevented || e.isComposing) return;
            e.preventDefault();
            void requestClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [requestClose]);

    // ── saving on purpose ──
    const saveNow = useCallback(async () => {
        if (!session) return "failed" as const;
        return session.flush();
    }, [session]);

    const done = useCallback(async () => {
        if (!session) return;
        setFinishing(true);
        const result = await saveNow();
        setFinishing(false);
        if (result === "failed") {
            setRecoveryOpen(true);
            return;
        }
        lastPos.current = editor?.state.selection.from ?? null;
        editor?.commands.blur();
        setPanel(null);
        setEditing(false);
    }, [editor, saveNow, session]);

    const onStatusAct = useCallback((s: Status) => {
        if (s === "review") setReviewOpen(true);
        else if (s === "save-failed") void copyText(body).then((ok) => toast[ok ? "success" : "error"](ok ? "Note copied" : "Couldn’t copy. Select the text instead."));
        else void saveNow();
    }, [body, saveNow]);

    // ── menu actions ──
    const onAction = useCallback((id: NoteCommandId) => {
        switch (id) {
            case "find": setFindOpen(true); break;
            case "outline": setOutlineSheet(true); break;
            case "convert-subtasks": setConvertOpen(true); break;
            case "copy-markdown": void copyText(body).then((ok) => toast[ok ? "success" : "error"](ok ? "Markdown copied" : "Couldn’t copy. Use Download instead.")); break;
            case "download-markdown": downloadMarkdown(body, title); break;
            case "edit-markdown":
                if (sourceMode) {
                    if (isFaithful(body)) setSourceMode(false);
                    else toast("This note has formatting the visual editor can’t keep, so it stays as Markdown.");
                } else setSourceMode(true);
                break;
            default: if (editor) runNoteCommand(editor, id);
        }
    }, [body, editor, sourceMode, title]);
    const onRunCommand = useCallback((id: NoteCommandId) => editor && runNoteCommand(editor, id), [editor]);

    const toggleOutline = () => {
        if (shell.isDesktop) {
            const next = !outlineRail;
            setOutlineRail(next);
            try { localStorage.setItem(OUTLINE_PREF, next ? "1" : "0"); } catch { /* device-local preference only */ }
        } else setOutlineSheet(true);
    };

    const startEditing = useCallback((pos: number | null) => {
        if (!editor) return;
        setEditing(true);
        editor.chain().focus(pos ?? lastPos.current ?? "end").run();
    }, [editor]);

    const over = body.length > NOTE_MAX_CHARS;
    const near = body.length > NOTE_MAX_CHARS * 0.9;
    const more = (
        <NoteMoreMenu editor={editor} compactToolbar={phone} wordCount={words} body={body} sourceMode={sourceMode} onAction={onAction} onRunCommand={onRunCommand} />
    );

    const attention = (() => {
        if (!state?.loaded) return null;
        if (status === "review") return { tone: "failed", text: "This note changed somewhere else.", action: "Review", run: () => setReviewOpen(true) };
        if (over) return { tone: "failed", text: `Over ${NOTE_MAX_CHARS.toLocaleString()} characters. It isn’t saving. Shorten it or copy it.`, action: "Copy note", run: () => onStatusAct("save-failed") };
        if (status === "save-failed") return { tone: "failed", text: "Couldn’t save this device or Cadence.", action: "Copy note", run: () => onStatusAct("save-failed") };
        if (state.problem === "deleted") return { tone: "failed", text: "This task was deleted. Your text is kept here.", action: "Download", run: () => downloadMarkdown(body, title) };
        if (state.problem === "auth") return { tone: "failed", text: "Sign in again to keep saving.", action: undefined, run: undefined };
        if (state.recovery) return { tone: "info", text: "A version you set aside is kept.", action: "Restore", run: () => session?.restoreRecovery() };
        if (near) return { tone: "info", text: `${body.length.toLocaleString()} of ${NOTE_MAX_CHARS.toLocaleString()} characters used.`, action: undefined, run: undefined };
        if (sourceMode && !isFaithful(body)) return { tone: "info", text: "This note has formatting the visual editor can’t keep, so it’s shown as Markdown.", action: undefined, run: undefined };
        return null;
    })();
    const attentionChip = attention && (
        <div className={cn("note-attention", attention.tone === "failed" && "note-attention--failed")} role="status">
            <span className="min-w-0 truncate">{attention.text}</span>
            {attention.action && <button type="button" onClick={attention.run} className="note-attention__action shrink-0">{attention.action}</button>}
        </div>
    );

    const editorSurface = isLoading || !session || !state ? (
        loadFailed ? (
            <div className="flex flex-col items-start gap-3 py-8">
                <p className="text-[15px] text-twilight-text-soft">Couldn’t load this note. Nothing was changed.</p>
                <Button variant="secondary" size="md" onClick={() => session && void session.load()}>Retry</Button>
            </div>
        ) : (
            <div className="space-y-3 py-6" aria-busy="true" aria-label="Loading note">
                <div className="h-4 w-2/3 rounded-lg bg-twilight-surface/60" />
                <div className="h-4 w-full rounded-lg bg-twilight-surface/60" />
                <div className="h-4 w-5/6 rounded-lg bg-twilight-surface/60" />
            </div>
        )
    ) : sourceMode ? (
        <NoteSourceEditor value={body} onChange={(text) => session.edit(text, "source")} onSave={() => void saveNow()} />
    ) : (
        <NoteEditor
            key={session.branch}
            session={session}
            viewId="room"
            variant="room"
            placeholder="Start writing…"
            commandHint={!phone}
            autoFocus={!phone && !shell.isTablet && !scrollToHeading}
            onEditor={setEditor}
            onSave={() => void saveNow()}
            onFind={() => setFindOpen(true)}
            onUnfaithful={() => setSourceMode(true)}
            onRequestEdit={startEditing}
            onFocusChange={(focused) => {
                if (focused && (phone || shell.isTablet)) {
                    setEditing(true);
                    setPanel(null);
                }
            }}
            slashBottomInset={phone ? effectiveInset + 72 : 0}
        />
    );

    const reviewSheet = state?.conflict && (
        <NoteConflictSheet
            open={reviewOpen}
            onClose={() => setReviewOpen(false)}
            mine={body}
            latest={state.conflict.remote}
            taskTitle={title}
            layer="room"
            onUseMine={() => { void session?.useMine(); setReviewOpen(false); }}
            onUseLatest={() => { void session?.useLatest(); setReviewOpen(false); }}
        />
    );

    const sheets = (
        <>
            {reviewSheet}
            <NoteConvertSheet open={convertOpen} onClose={() => setConvertOpen(false)} taskId={taskId} taskTitle={title} body={body} seriesNote={!!scope} layer="room" />
            <UtilitySheet title="Outline" open={outlineSheet} onClose={() => setOutlineSheet(false)} fit layer="room" flush>
                <NoteOutline headings={outlineState.headings} currentId={outlineState.current} onJump={(h) => { setOutlineSheet(false); jumpTo(h, !phone); }} />
            </UtilitySheet>
            <AlertDialog.Root open={recoveryOpen} onOpenChange={setRecoveryOpen}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>This note isn’t saved anywhere yet</AlertDialog.Title>
                        <AlertDialog.Description>Neither this device nor Cadence has your latest text. Retry, or copy it so it isn’t lost.</AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <Button variant="ghost" size="md" onClick={() => { setRecoveryOpen(false); onClose(); }}>Close anyway</Button>
                        <Button variant="secondary" size="md" onClick={() => void copyText(body).then((ok) => toast[ok ? "success" : "error"](ok ? "Note copied" : "Couldn’t copy"))}>Copy note</Button>
                        <Button size="md" onClick={() => { setRecoveryOpen(false); void saveNow(); }}>Retry</Button>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );

    // ── phone ──
    if (phone) {
        return (
            <ImmersiveDetailLayout
                mode="focus"
                className="note-room"
                header={
                    <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-2`}>
                        <div className="relative flex min-h-[52px] items-center gap-1">
                            <div className="relative flex shrink-0 items-center">
                                <AnimatePresence mode="popLayout" initial={false}>
                                    {editing ? (
                                        <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: fade }}>
                                            <button
                                                type="button"
                                                onClick={() => void done()}
                                                disabled={finishing}
                                                aria-label="Done"
                                                className="surface-control surface-control-accent inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-twilight-border/40 px-3 text-[15px] font-medium text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 min-[360px]:px-4"
                                            >
                                                {finishing ? <Loader2 size={18} className="motion-safe:animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
                                                <span className="max-[359px]:sr-only">Done</span>
                                            </button>
                                        </motion.div>
                                    ) : (
                                        <motion.div key="back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: fade }} className="header-glass -ml-1 flex">
                                            <Tip label="Close note"><button type="button" onClick={() => void requestClose()} aria-label="Close note"><ChevronLeft size={22} aria-hidden="true" /></button></Tip>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                            <div className="flex min-w-0 flex-1 justify-center">
                                {!editing && <NoteStatus status={status} onAct={onStatusAct} />}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {editing && (
                                    <>
                                        <PhoneUndoRedo editor={editor} />
                                        <div className="header-glass flex items-center gap-1">
                                            <Tip label="Insert"><button type="button" aria-label="Insert" className="inline-flex size-11 items-center justify-center" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor?.commands.blur(); setPanel("insert"); }}><Plus size={20} aria-hidden="true" /></button></Tip>
                                            <Tip label="Format"><button type="button" aria-label="Format" className="inline-flex size-11 items-center justify-center" onMouseDown={(e) => e.preventDefault()} onClick={() => { editor?.commands.blur(); setPanel("format"); }}><Type size={20} aria-hidden="true" /></button></Tip>
                                        </div>
                                    </>
                                )}
                                <div className="header-glass flex items-center">{more}</div>
                            </div>
                        </div>
                    </header>
                }
            >
                <div className="relative flex h-full min-h-0 flex-col" style={{ ["--keyboard-inset" as string]: `${effectiveInset}px` }}>
                    {attentionChip && <div className="px-4 pb-2">{attentionChip}</div>}
                    {findOpen && editor && !sourceMode && <div className="px-3 pb-2"><NoteFindBar editor={editor} onClose={() => setFindOpen(false)} /></div>}
                    <div
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2"
                        style={{ paddingBottom: "calc(var(--keyboard-inset) + 6rem + env(safe-area-inset-bottom))", scrollPaddingBottom: "calc(var(--keyboard-inset) + 5.5rem)" }}
                    >
                        <h1 className="mb-1 font-display text-[28px] font-semibold leading-tight tracking-tight text-twilight-text">{title}</h1>
                        {scope && <span className="mb-4 inline-flex rounded-full bg-moonlit/10 px-2.5 py-1 text-[12px] font-medium text-moonlit">{scope}</span>}
                        <div className="note-surface mt-3">{editorSurface}</div>
                    </div>
                    {!editing && !sourceMode && session && state?.loaded && (
                        <div className="layer-floating-bar mobile-floating-action pointer-events-none fixed bottom-5 right-4 flex">
                            <Tip label="Write">
                                <button
                                    type="button"
                                    aria-label="Write"
                                    onClick={() => startEditing(null)}
                                    className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary text-[var(--primary-foreground)] shadow-[0_24px_54px_color-mix(in_srgb,var(--accent-primary)_34%,transparent)] transition-transform active:scale-[0.98]"
                                >
                                    <Pencil size={20} aria-hidden="true" />
                                </button>
                            </Tip>
                        </div>
                    )}
                    {editing && !panel && !sourceMode && (
                        <NoteQuickStrip
                            editor={editor}
                            bottom={`calc(var(--keyboard-inset) + ${effectiveInset ? "0.5rem" : "max(0.5rem, env(safe-area-inset-bottom))"})`}
                            onSlash={() => editor && runSlash(editor)}
                        />
                    )}
                    {panel && (
                        <NotePhonePanel
                            kind={panel}
                            height={panelHeight}
                            editor={editor}
                            onKeyboard={() => { setPanel(null); editor?.commands.focus(); }}
                            onLink={() => { setPanel(null); editor?.commands.focus(); setLinkOpen(true); }}
                            onSubtasks={() => { setPanel(null); setConvertOpen(true); }}
                        />
                    )}
                    {editor && <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />}
                </div>
                {sheets}
            </ImmersiveDetailLayout>
        );
    }

    // ── tablet and desktop ──
    const compactTablet = shell.isTablet;
    return (
        <ImmersiveDetailLayout
            mode="focus"
            className="note-room"
            header={
                <PageHeader
                    eyebrow={scope ?? undefined}
                    title={title}
                    actions={
                        <>
                            {editing && compactTablet && <Button variant="secondary" size="md" onClick={() => void done()} disabled={finishing} aria-label="Done"><Check size={16} aria-hidden="true" />Done</Button>}
                            <NoteStatus status={status} onAct={onStatusAct} />
                            <ToolButton label={shell.isDesktop ? (outlineRail ? "Hide outline" : "Show outline") : "Outline"} pressed={shell.isDesktop ? outlineRail : undefined} onClick={toggleOutline}><ListTree size={18} aria-hidden="true" /></ToolButton>
                            <ToolButton label="Close note" onClick={() => void requestClose()}><X size={18} aria-hidden="true" /></ToolButton>
                        </>
                    }
                />
            }
        >
            <div className="flex h-full min-h-0">
                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="shrink-0 px-4 py-2 sm:px-8">
                        {!sourceMode ? <NoteToolbar editor={editor} onLink={() => setLinkOpen(true)} more={more} /> : <div className="flex justify-end">{more}</div>}
                    </div>
                    {attentionChip && <div className="shrink-0 px-4 pb-2 sm:px-8">{attentionChip}</div>}
                    {findOpen && editor && !sourceMode && <div className="shrink-0 px-4 pb-2 sm:px-8"><NoteFindBar editor={editor} onClose={() => setFindOpen(false)} className="max-w-xl" /></div>}
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth [scroll-padding-top:1rem] motion-reduce:scroll-auto">
                        <div className="note-surface mx-auto w-full max-w-[44rem] px-6 py-8 sm:px-10">{editorSurface}</div>
                    </div>
                    <footer className="flex shrink-0 items-center gap-4 px-6 py-2 sm:px-10">
                        <span className="text-[13px] text-twilight-text-muted">{words.toLocaleString()} word{words === 1 ? "" : "s"}</span>
                    </footer>
                </div>
                <Reveal open={outlineRail && shell.isDesktop} className="!h-auto border-l border-twilight-border/40">
                    <aside className="h-full w-60 overflow-y-auto" aria-label="Outline">
                        <NoteOutline headings={outlineState.headings} currentId={outlineState.current} onJump={(h) => jumpTo(h)} />
                    </aside>
                </Reveal>
            </div>
            {editor && <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />}
            {sheets}
        </ImmersiveDetailLayout>
    );
}

/** `/` at the start of a fresh line, so the menu opens where it can act. */
function runSlash(editor: Editor) {
    const { $from } = editor.state.selection;
    const chain = editor.chain().focus();
    if ($from.parent.textContent.length > 0) chain.createParagraphNear();
    chain.insertContent("/").run();
}

function PhoneUndoRedo({ editor }: { editor: Editor | null }) {
    const s = useNoteToolbarState(editor);
    const Undo = getNoteCommand("undo").icon;
    const Redo = getNoteCommand("redo").icon;
    return (
        <div role="toolbar" aria-label="Undo and redo" className="glass-surface flex items-center rounded-full">
            <Tip label="Undo"><button type="button" aria-label="Undo" disabled={!s.canUndo} onMouseDown={(e) => e.preventDefault()} onClick={() => editor && runNoteCommand(editor, "undo")} className="inline-flex size-11 items-center justify-center rounded-full text-twilight-text-soft disabled:opacity-40"><Undo size={18} aria-hidden="true" /></button></Tip>
            <Tip label="Redo"><button type="button" aria-label="Redo" disabled={!s.canRedo} onMouseDown={(e) => e.preventDefault()} onClick={() => editor && runNoteCommand(editor, "redo")} className="inline-flex size-11 items-center justify-center rounded-full text-twilight-text-soft disabled:opacity-40"><Redo size={18} aria-hidden="true" /></button></Tip>
        </div>
    );
}
