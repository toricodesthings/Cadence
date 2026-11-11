import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { ExternalLink, ListChecks } from "lucide-react";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { extractActionableLines } from "../../lib/notes/markdown-transforms";
import { getNoteScopeLabel, isSeriesScopedNote } from "../../lib/notes/recurring-note-scope";
import { isFaithful } from "../../lib/notes/note-markdown";
import { NOTE_MAX_CHARS } from "../../lib/notes/note-session";
import { Skeleton } from "../primitives/Skeleton";
import { Reveal } from "../shared/Reveal";
import { NoteEditor } from "./note/NoteEditor";
import { NoteToolbar } from "./note/NoteToolbar";
import { NoteLinkPopover } from "./note/NoteLinkPopover";
import { NoteSourceEditor } from "./note/NoteSourceEditor";
import { NoteStatus } from "./note/NoteStatus";
import { NoteConvertSheet } from "./note/NoteConvertSheet";
import { copyNote } from "./note/note-export";

/**
 * The note on the task panel: the same editor and session as the writing room, quieter. It is always
 * the document (no preview/edit switch); the formatting bar appears while writing; the full room is one tap away.
 */
export function TaskNoteInline({ taskId, onOpenRoom }: { taskId: string; onOpenRoom?: () => void }) {
    const { task, session, state, status, isLoading, loadFailed } = useTaskNote(taskId);
    const openRoom = useNoteRoomStore((s) => s.open);
    const [editor, setEditor] = useState<Editor | null>(null);
    const [focused, setFocused] = useState(false);
    const [linkOpen, setLinkOpen] = useState(false);
    const [convertOpen, setConvertOpen] = useState(false);
    const [source, setSource] = useState(false);
    const [checked, setChecked] = useState(false);

    /**
     * The bar stays while focus is in it or one of its menus (text style, lists): those take focus from the
     * editor, and hiding the bar then would unmount the menu the moment it opened.
     */
    const trackFocus = (next: boolean) => {
        if (next) return setFocused(true);
        requestAnimationFrame(() => {
            if (!document.activeElement?.closest("[role=toolbar],[role=listbox],[role=menu],[data-note-inline]")) setFocused(false);
        });
    };

    const body = state?.body ?? "";
    // A note the visual editor can't carry whole is edited as Markdown, never trimmed.
    if (state?.loaded && !checked) {
        setChecked(true);
        if (!isFaithful(body)) setSource(true);
    }
    const scope = task && isSeriesScopedNote(task) ? getNoteScopeLabel(task) : null;
    const lines = extractActionableLines(body).length;
    const near = body.length > NOTE_MAX_CHARS * 0.8;

    return (
        <div className="flex shrink-0 flex-col gap-3">
            {isLoading || !session || !state ? (
                loadFailed ? (
                    <p className="text-[15px] text-twilight-text-soft">Couldn’t load this note. <button type="button" onClick={() => session && void session.load()} className="cursor-pointer text-accent-primary underline underline-offset-4">Retry</button></p>
                ) : <Skeleton className="h-40 w-full rounded-2xl" />
            ) : (
                <>
                    <div className="note-surface relative min-h-[240px] px-1 pb-8" data-note-inline>
                        {source ? (
                            <NoteSourceEditor value={body} onChange={(t) => session.edit(t, "inline-source")} onSave={() => void session.flush()} />
                        ) : (
                            <NoteEditor
                                key={session.branch}
                                session={session}
                                viewId="inline"
                                variant="inline"
                                placeholder="Write your notes here…"
                                onEditor={setEditor}
                                onSave={() => void session.flush()}
                                onUnfaithful={() => setSource(true)}
                                onFocusChange={trackFocus}
                            />
                        )}
                        {/* Save state sits in the note's own corner instead of a row of its own. */}
                        <div className="pointer-events-none absolute bottom-1 right-2 flex items-center gap-3 [&_button]:pointer-events-auto">
                            <NoteStatus
                                status={status}
                                onAct={(s) => (s === "save-failed"
                                    ? copyNote(body)
                                    : s === "review" && task ? (onOpenRoom?.(), openRoom(task.id, task.title)) : void session.flush())}
                            />
                            {/* The counter only surfaces near the limit: no running tally to watch. */}
                            {near && (
                                <span className="text-[13px] tabular-nums text-accent-primary" aria-label={`${body.length} of ${NOTE_MAX_CHARS} characters used`}>
                                    {body.length.toLocaleString()} / {NOTE_MAX_CHARS.toLocaleString()}
                                </span>
                            )}
                        </div>
                    </div>
                    {/* Below the text, so opening it never pushes what's being read. */}
                    <Reveal open={focused && !source}>
                        <NoteToolbar editor={editor} onLink={() => setLinkOpen(true)} more={null} />
                    </Reveal>
                    {editor && <NoteLinkPopover editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />}
                    {lines > 0 && (
                        <button
                            type="button"
                            onClick={() => setConvertOpen(true)}
                            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[1.15rem] bg-accent-primary/10 px-4 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <ListChecks size={14} aria-hidden="true" />
                            Turn {lines} line{lines === 1 ? "" : "s"} into subtasks
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { if (!task) return; onOpenRoom?.(); openRoom(task.id, task.title); }}
                        className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[1.15rem] border border-twilight-border/35 bg-white/[0.025] px-4 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                    >
                        <ExternalLink size={14} aria-hidden="true" />
                        Open writing room
                    </button>
                    {scope && <span className="w-fit rounded-md bg-moonlit/10 px-1.5 py-0.5 text-[11px] font-medium text-moonlit">{scope}</span>}
                    {task && <NoteConvertSheet open={convertOpen} onClose={() => setConvertOpen(false)} taskId={task.id} taskTitle={task.title} body={body} seriesNote={!!scope} />}
                </>
            )}
        </div>
    );
}
