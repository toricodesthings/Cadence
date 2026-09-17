import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogCloseButton, DialogContent } from "../primitives/Dialog";
import { useNavigate } from "react-router";
import {
    Search, CheckSquare, Flame, Inbox, FolderOpen, Navigation, FileText, Telescope,
} from "lucide-react";
import { useUniversalSearch, type SearchResult, type SearchResultKind } from "../../hooks/search/use-universal-search";
import { buildFocusSearchParams } from "../../hooks/search/use-route-focus";
import { useNoteRoomStore } from "../../stores/note-room-store";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { trackUsageEvent } from "../../lib/api/track-event";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const KIND_ICON: Record<SearchResultKind, React.ReactNode> = {
    task: <CheckSquare size={16} aria-hidden="true" />,
    habit: <Flame size={16} aria-hidden="true" />,
    inbox: <Inbox size={16} aria-hidden="true" />,
    project: <FolderOpen size={16} aria-hidden="true" />,
    "focus-view": <Telescope size={16} aria-hidden="true" />,
    page: <Navigation size={16} aria-hidden="true" />,
};

const GROUP_LABELS: Record<string, string> = {
    pages: "Pages",
    tasks: "Tasks",
    habits: "Habits",
    captures: "Captures",
    projects: "Projects",
    focusViews: "Focus Views",
};

const GROUP_ORDER = ["pages", "tasks", "habits", "captures", "projects", "focusViews"] as const;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const [rawQuery, setRawQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const navigate = useNavigate();
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const applySavedView = useFocusViewStore((s) => s.applySavedView);

    const { results, query } = useUniversalSearch(rawQuery, open);
    const openNoteRoom = useNoteRoomStore((s) => s.open);

    // Reset on open/close
    useEffect(() => {
        if (open) {
            setRawQuery("");
            setSelectedIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
            trackUsageEvent("command_palette.opened", { input_method: "keyboard" });
        }
    }, [open]);

    // Build flat list for keyboard navigation
    const flatResults = useMemo(() => {
        const flat: { group: string; item: SearchResult }[] = [];
        for (const group of GROUP_ORDER) {
            const items = results[group] as SearchResult[] | undefined;
            if (items && items.length > 0) {
                for (const item of items) {
                    flat.push({ group, item });
                }
            }
        }
        return flat;
    }, [results]);

    // Reset selection when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [flatResults.length, query]);

    const navigateToResult = useCallback((result: SearchResult) => {
        onOpenChange(false);
        trackUsageEvent("command_palette.result_opened", { object_type: result.kind as any });

        // If the match was in notes/headings, open note room instead
        if (result.noteAction) {
            openNoteRoom(
                result.noteAction.taskId,
                result.noteAction.taskTitle,
                result.noteAction.scrollToHeading,
            );
            return;
        }

        if (result.kind === "focus-view") {
            const realId = result.id.replace(/^focus-view-/, "");
            applySavedView(realId);
            navigate("/today");
            return;
        }

        if (result.kind === "page") {
            navigate(result.route);
            return;
        }

        const realId = result.id.replace(/^(task|habit|inbox|project)-/, "");
        const focusParams = buildFocusSearchParams({
            focusKind: result.focusKind,
            focusId: realId,
            focusScope: result.focusScope,
            focusSource: "search",
        });
        navigate(`${result.route}?${focusParams}`);
    }, [applySavedView, navigate, onOpenChange, openNoteRoom]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && flatResults[selectedIndex]) {
            e.preventDefault();
            navigateToResult(flatResults[selectedIndex].item);
        }
    };

    // Scroll selected into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    // Group for rendering
    const groupedForRender = useMemo(() => {
        const groups: { key: string; label: string; items: { item: SearchResult; flatIndex: number }[] }[] = [];
        let idx = 0;
        for (const group of GROUP_ORDER) {
            const items = results[group] as SearchResult[] | undefined;
            if (items && items.length > 0) {
                const groupItems = items.map(item => ({ item, flatIndex: idx++ }));
                groups.push({ key: group, label: GROUP_LABELS[group], items: groupItems });
            }
        }
        return groups;
    }, [results]);

    const hasQuery = query.length > 0;
    const hasResults = flatResults.length > 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                hideCloseButton
                className="flex flex-col gap-0 overflow-hidden p-0 sm:top-[14%] sm:max-w-2xl sm:translate-y-0"
                onKeyDown={handleKeyDown}
            >
                {/* Search input */}
                <div className="flex min-h-18 items-center gap-3 border-b border-twilight-border px-6 py-4">
                    <Search size={20} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        autoFocus
                        value={rawQuery}
                        onChange={(e) => setRawQuery(e.target.value)}
                        placeholder="Search tasks, habits, captures, pages…"
                        className="w-full bg-transparent text-lg text-twilight-text outline-none placeholder:text-twilight-text-muted"
                        aria-label="Search workspace"
                    />
                    <DialogCloseButton className="-mr-2" aria-label="Close search" />
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[min(60vh,32rem)] overflow-y-auto px-3 pb-3 pt-1 scrollbar-thin" role="listbox" aria-label="Search results">
                    {!hasResults ? (
                        <div className="py-14 text-center">
                            {hasQuery ? (
                                <div className="text-sm text-twilight-text-muted">
                                    No results for &ldquo;{query}&rdquo;
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-twilight-text-muted">
                                    <Search size={28} className="mb-1 text-accent-primary" aria-hidden="true" />
                                    <p className="text-sm">Start typing to search your workspace</p>
                                    <p className="text-xs text-twilight-text-muted">
                                        Tasks, habits, captures, projects, and pages
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        groupedForRender.map(({ key, label, items }) => (
                            <div key={key} role="group" aria-label={label}>
                                <div className="px-3 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">
                                    {label}
                                </div>
                                {items.map(({ item, flatIndex }) => (
                                    <button
                                        key={item.id}
                                        data-index={flatIndex}
                                        role="option"
                                        aria-selected={flatIndex === selectedIndex}
                                        onClick={() => navigateToResult(item)}
                                        className={`flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 py-2.5 text-[15px] text-twilight-text transition-colors
                                            ${flatIndex === selectedIndex ? "bg-accent-primary/10" : "hover:bg-white/[0.04]"}
                                        `}
                                    >
                                        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03] ${flatIndex === selectedIndex ? "text-accent-primary" : "text-twilight-text-muted"}`}>
                                            {item.noteAction ? <FileText size={16} aria-hidden="true" /> : KIND_ICON[item.kind]}
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <span className="truncate block">{item.title}</span>
                                            {item.context && (
                                                <span className="mt-0.5 block truncate text-[13px] text-twilight-text-muted">
                                                    {item.context}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer hint */}
                <div className="flex items-center gap-5 border-t border-twilight-border px-6 py-3.5 text-xs text-twilight-text-muted">
                    {([["↑↓", "Navigate"], ["↵", "Open"], ["Esc", "Close"]] as const).map(([key, label]) => (
                        <span key={label} className="flex items-center gap-1.5">
                            <kbd className="rounded-md border border-twilight-border bg-white/[0.04] px-1.5 py-0.5 font-sans text-[11px]">{key}</kbd>
                            {label}
                        </span>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
