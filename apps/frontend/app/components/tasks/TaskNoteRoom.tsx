import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { X, FileText, List } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { useTaskNote } from "../../hooks/tasks/use-task-note";
import { TaskNoteSaveStatus } from "./TaskNoteSaveStatus";
import { TaskNoteToolbarDock } from "./TaskNoteToolbarDock";
import { TaskNoteOutline } from "./TaskNoteOutline";
import { TaskNoteCommandMenu } from "./TaskNoteCommandMenu";
import { TaskNoteConvertMenu } from "./TaskNoteConvertMenu";
import { TaskNoteSuggestions } from "./TaskNoteSuggestions";
import { applyMarkdownAction, type MarkdownAction } from "../../lib/notes/markdown-transforms";
import { getNoteScopeLabel, isSeriesScopedNote } from "../../lib/notes/recurring-note-scope";
import { getTemplate } from "../../lib/notes/note-templates";
import { extractNoteOutline, countWords } from "../../lib/notes/note-outline";
import { Skeleton } from "../primitives/Skeleton";
import type { NotesToolbarAction } from "./NotesToolbar";

const MAX_CHARS = 50000;

/**
 * TaskNoteRoom — full-screen dedicated writing surface.
 * Mounted at shell level (MainLayout), covers the entire viewport
 * with an opaque twilight background. Accessed via the note room
 * store's `open()` action.
 */
export function TaskNoteRoom() {
    const { taskId, taskTitle, close } = useNoteRoomStore();
    const isOpen = taskId !== null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="note-room"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="layer-fullscreen-surface fixed inset-0 flex flex-col bg-twilight"
                >
                    <NoteRoomInner taskId={taskId!} taskTitle={taskTitle} onClose={close} />
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function NoteRoomInner({
    taskId,
    taskTitle,
    onClose,
}: {
    taskId: string;
    taskTitle: string;
    onClose: () => void;
}) {
    const { task, draft, onChange, saveStatus } = useTaskNote(taskId);
    const scrollToHeading = useNoteRoomStore((s) => s.scrollToHeading);
    const clearScrollTarget = useNoteRoomStore((s) => s.clearScrollTarget);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showOutline, setShowOutline] = useState(false);
    const toolbarActiveRef = useRef(false);

    // Slash command state
    const [slashState, setSlashState] = useState<{
        active: boolean;
        query: string;
        startPos: number;
        anchorRect: { top: number; left: number } | null;
    }>({ active: false, query: "", startPos: 0, anchorRect: null });

    const outline = extractNoteOutline(draft);
    const wordCount = countWords(draft);
    const charCount = draft.length;
    const scopeLabel = task && isSeriesScopedNote(task) ? getNoteScopeLabel(task) : null;

    // Auto-focus textarea on mount
    useEffect(() => {
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
        });
    }, []);

    // Scroll to heading when opened from search
    useEffect(() => {
        if (!scrollToHeading || !draft || !textareaRef.current) return;
        const headingPattern = new RegExp(`^#{1,6}\\s+${scrollToHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
        const match = headingPattern.exec(draft);
        if (match) {
            const textarea = textareaRef.current;
            textarea.focus();
            textarea.setSelectionRange(match.index, match.index + match[0].length);
            // Scroll the cursor into view
            const linesBefore = draft.slice(0, match.index).split("\n").length;
            const lineHeight = 24; // approximate
            textarea.scrollTop = Math.max(0, (linesBefore - 3) * lineHeight);
        }
        clearScrollTarget();
    }, [scrollToHeading, draft, clearScrollTarget]);

    // Escape to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const applyAction = useCallback(
        (action: NotesToolbarAction) => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const result = applyMarkdownAction(
                draft,
                textarea.selectionStart,
                textarea.selectionEnd,
                action as MarkdownAction,
            );
            onChange(result.value);
            requestAnimationFrame(() => {
                const el = textareaRef.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(result.selectionStart, result.selectionEnd);
            });
        },
        [draft, onChange],
    );

    const handleToolbarMouseDown = useCallback(() => {
        toolbarActiveRef.current = true;
    }, []);

    const handleBlur = useCallback(() => {
        requestAnimationFrame(() => {
            if (toolbarActiveRef.current) {
                toolbarActiveRef.current = false;
            }
        });
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Slash command: dismiss on space/backspace past slash
        if (slashState.active) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
                // These are handled by the command menu
                return;
            }
        }
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key.toLowerCase();
        if (key === "b") { e.preventDefault(); applyAction("bold"); }
        else if (key === "i") { e.preventDefault(); applyAction("italic"); }
        else if (key === "k") { e.preventDefault(); applyAction("link"); }
    };

    const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;
        onChange(newValue);

        // Detect "/" at start of line for slash commands
        const textBeforeCursor = newValue.slice(0, cursorPos);
        const lastNewline = textBeforeCursor.lastIndexOf("\n");
        const lineStart = lastNewline + 1;
        const lineText = textBeforeCursor.slice(lineStart);

        if (lineText.startsWith("/") && lineText.length <= 20) {
            const query = lineText.slice(1);
            // Get approximate position for the popup
            const textarea = textareaRef.current;
            if (textarea) {
                const rect = textarea.getBoundingClientRect();
                // Rough estimate using line/col count
                const linesAbove = textBeforeCursor.split("\n").length - 1;
                const lineHeight = 26;
                const top = rect.top + Math.min(linesAbove * lineHeight, rect.height - 40) + lineHeight - textarea.scrollTop;
                const left = rect.left + 24;
                setSlashState({ active: true, query, startPos: lineStart, anchorRect: { top, left } });
            }
        } else if (slashState.active) {
            setSlashState({ active: false, query: "", startPos: 0, anchorRect: null });
        }
    }, [onChange, slashState.active]);

    const handleCommandSelect = useCallback((commandId: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        let insertText = "";

        if (commandId.startsWith("template:")) {
            const templateId = commandId.replace("template:", "");
            const template = getTemplate(templateId);
            if (template) {
                insertText = template.body;
            }
        } else {
            // Format commands — apply the action's default text
            const result = applyMarkdownAction("", 0, 0, commandId as MarkdownAction);
            insertText = result.value;
        }

        // Replace the slash command text with the insert
        const lineEnd = draft.indexOf("\n", slashState.startPos);
        const replaceEnd = lineEnd === -1 ? draft.length : lineEnd;
        const newValue = draft.slice(0, slashState.startPos) + insertText + draft.slice(replaceEnd);
        onChange(newValue);

        setSlashState({ active: false, query: "", startPos: 0, anchorRect: null });

        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            el.focus();
            const newPos = slashState.startPos + insertText.length;
            el.setSelectionRange(newPos, newPos);
        });
    }, [draft, onChange, slashState.startPos]);

    const handleJumpToLine = useCallback((lineIndex: number) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const lines = draft.split("\n");
        let pos = 0;
        for (let i = 0; i < lineIndex && i < lines.length; i++) {
            pos += lines[i].length + 1;
        }
        textarea.focus();
        textarea.setSelectionRange(pos, pos);
        // Scroll the textarea to the approximate position
        const lineHeight = 24;
        textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 3);
    }, [draft]);

    return (
        <>
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between border-b border-twilight-border/40 px-6 py-4 sm:px-10">
                <div className="flex min-w-0 items-center gap-3">
                    <FileText size={18} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                    <h2 className="truncate font-display text-base font-medium text-twilight-text">
                        {taskTitle}
                    </h2>
                    {scopeLabel && (
                        <span className="shrink-0 rounded-md bg-moonlit/10 px-1.5 py-0.5 text-[10px] font-medium text-moonlit">
                            {scopeLabel}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <TaskNoteSaveStatus status={saveStatus} />
                    <button
                        type="button"
                        onClick={() => setShowOutline((v) => !v)}
                        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl transition-colors ${
                            showOutline
                                ? "bg-accent-primary/12 text-accent-primary"
                                : "text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                        }`}
                        aria-label={showOutline ? "Hide outline" : "Show outline"}
                    >
                        <List size={17} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text transition-colors"
                        aria-label="Close note room"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </div>
            </header>

            {/* Body */}
            <div className="flex min-h-0 flex-1">
                {/* Main editor area */}
                <div className="flex min-w-0 flex-1 flex-col">
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
                    <div onMouseDown={handleToolbarMouseDown} className="shrink-0 border-b border-twilight-border/25 px-6 py-3 sm:px-10">
                        <TaskNoteToolbarDock onAction={applyAction} />
                    </div>

                    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 py-8 sm:px-10">
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={handleTextChange}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            placeholder="Start writing… (type / for commands)"
                            aria-label="Task notes"
                            className="
                                h-full w-full max-w-3xl resize-none bg-transparent outline-none
                                font-sans text-base leading-[1.8] text-twilight-text sm:text-lg sm:leading-[1.85]
                                placeholder:text-twilight-text-muted/60
                            "
                            maxLength={MAX_CHARS}
                        />
                    </div>

                    {/* Convert menu */}
                    <div className="shrink-0 px-6 sm:px-10">
                        <TaskNoteConvertMenu taskId={taskId} noteContent={draft} />
                    </div>

                    {/* Footer */}
                    <footer className="flex shrink-0 items-center gap-4 border-t border-twilight-border/25 px-6 py-3 sm:px-10">
                        <span className="text-[11px] text-twilight-text-muted/90 shrink-0">
                            {wordCount.toLocaleString()} word{wordCount !== 1 ? "s" : ""}
                        </span>
                        <TaskNoteSuggestions body={draft} />
                        <span
                            className={`text-[11px] tabular-nums ml-auto shrink-0 ${
                                charCount > MAX_CHARS * 0.9 ? "text-accent-primary" : "text-twilight-text-muted/90"
                            }`}
                        >
                            {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                        </span>
                    </footer>
                </div>

                {/* Outline sidebar */}
                <AnimatePresence>
                    {showOutline && (
                        <motion.aside
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 240, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                            className="shrink-0 overflow-hidden border-l border-twilight-border/30"
                        >
                            <TaskNoteOutline headings={outline} onJump={handleJumpToLine} />
                        </motion.aside>
                    )}
                </AnimatePresence>
            </div>

            {/* Slash command menu */}
            {slashState.active && (
                <TaskNoteCommandMenu
                    query={slashState.query}
                    anchorRect={slashState.anchorRect}
                    onSelect={handleCommandSelect}
                    onDismiss={() => setSlashState({ active: false, query: "", startPos: 0, anchorRect: null })}
                />
            )}
        </>
    );
}
