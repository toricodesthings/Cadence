import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Dialog, DialogContent } from "./primitives/Dialog";
import { useNavigate } from "react-router";
import {
    Search, CheckSquare, Flame, Inbox, FolderOpen, Navigation,
} from "lucide-react";
import { useUniversalSearch, type SearchResult, type SearchResultKind } from "../hooks/use-universal-search";
import { buildFocusSearchParams } from "../hooks/use-route-focus";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const KIND_ICON: Record<SearchResultKind, React.ReactNode> = {
    task: <CheckSquare size={14} aria-hidden="true" />,
    habit: <Flame size={14} aria-hidden="true" />,
    inbox: <Inbox size={14} aria-hidden="true" />,
    project: <FolderOpen size={14} aria-hidden="true" />,
    page: <Navigation size={14} aria-hidden="true" />,
};

const GROUP_LABELS: Record<string, string> = {
    pages: "Pages",
    tasks: "Tasks",
    habits: "Habits",
    captures: "Captures",
    projects: "Projects",
};

const GROUP_ORDER = ["pages", "tasks", "habits", "captures", "projects"] as const;

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const [rawQuery, setRawQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const navigate = useNavigate();
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { results, query } = useUniversalSearch(rawQuery, open);

    // Reset on open/close
    useEffect(() => {
        if (open) {
            setRawQuery("");
            setSelectedIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
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
    }, [navigate, onOpenChange]);

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
                className="fixed inset-x-auto bottom-auto left-1/2 top-[18%] -translate-x-1/2 translate-y-0 w-full max-w-xl rounded-2xl border border-twilight-border surface-utility shadow-2xl p-0 overflow-hidden"
                onKeyDown={handleKeyDown}
            >
                {/* Search input */}
                <div className="flex items-center border-b border-twilight-border px-5 py-4">
                    <Search size={18} className="text-twilight-text-muted mr-3 shrink-0" aria-hidden="true" />
                    <input
                        ref={inputRef}
                        autoFocus
                        value={rawQuery}
                        onChange={(e) => setRawQuery(e.target.value)}
                        placeholder="Search tasks, habits, captures, pages…"
                        className="bg-transparent text-base font-display w-full outline-none text-twilight-text placeholder:text-twilight-text-muted/60"
                        aria-label="Search workspace"
                    />
                    <div className="text-[11px] text-twilight-text-muted/60 bg-white/[0.06] px-2 py-1 rounded border border-twilight-border font-mono shrink-0">
                        ESC
                    </div>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[380px] overflow-y-auto p-3" role="listbox" aria-label="Search results">
                    {!hasResults ? (
                        <div className="py-10 text-center">
                            {hasQuery ? (
                                <div className="text-sm text-twilight-text-muted italic">
                                    No results for &ldquo;{query}&rdquo;
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-twilight-text-muted">
                                    <Search size={28} className="opacity-40" aria-hidden="true" />
                                    <p className="text-sm">Start typing to search your workspace</p>
                                    <p className="text-xs text-twilight-text-muted/60">
                                        Tasks, habits, captures, projects, and pages
                                    </p>
                                </div>
                            )}
                        </div>
                    ) : (
                        groupedForRender.map(({ key, label, items }) => (
                            <div key={key} role="group" aria-label={label}>
                                <div className="text-xs font-display font-medium text-twilight-text-muted/60 uppercase tracking-wider px-3 pt-3 pb-2">
                                    {label}
                                </div>
                                {items.map(({ item, flatIndex }) => (
                                    <button
                                        key={item.id}
                                        data-index={flatIndex}
                                        role="option"
                                        aria-selected={flatIndex === selectedIndex}
                                        onClick={() => navigateToResult(item)}
                                        className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm text-twilight-text transition-colors
                                            ${flatIndex === selectedIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}
                                        `}
                                    >
                                        <div className="text-twilight-text-muted shrink-0">
                                            {KIND_ICON[item.kind]}
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <span className="truncate block">{item.title}</span>
                                            {item.context && (
                                                <span className="text-xs text-twilight-text-muted/70 truncate block">
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
                <div className="border-t border-twilight-border px-5 py-3 flex items-center gap-4 text-xs text-twilight-text-muted/50">
                    <span>↑↓ Navigate</span>
                    <span>↵ Open</span>
                    <span>Esc Close</span>
                </div>
            </DialogContent>
        </Dialog>
    );
}
