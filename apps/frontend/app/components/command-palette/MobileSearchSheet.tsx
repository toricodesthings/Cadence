import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Search, X, CheckSquare, Flame, Inbox, FolderOpen, Navigation, FileText, Telescope, Clock, ArrowUpLeft,
} from "lucide-react";
import { useUniversalSearch, type SearchResult, type SearchResultKind } from "../../hooks/search/use-universal-search";
import { useSearchNavigation } from "../../hooks/search/use-search-navigation";
import { trackUsageEvent } from "../../lib/api/track-event";

interface MobileSearchSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** Same icon vocabulary as the command palette, sized up for touch. */
const KIND_ICON: Record<SearchResultKind, React.ReactNode> = {
    task: <CheckSquare size={18} aria-hidden="true" />,
    habit: <Flame size={18} aria-hidden="true" />,
    inbox: <Inbox size={18} aria-hidden="true" />,
    project: <FolderOpen size={18} aria-hidden="true" />,
    "focus-view": <Telescope size={18} aria-hidden="true" />,
    page: <Navigation size={18} aria-hidden="true" />,
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

/** A couple of example chips so the empty state is never a blank void (§0.2 Law 1). */
const EXAMPLE_CHIPS = ["Today", "Upcoming", "Habits", "Trash"] as const;

const RECENT_KEY = "cadence-recent-searches";
const RECENT_LIMIT = 6;

function readRecent(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string") : [];
    } catch {
        return [];
    }
}

function pushRecent(query: string): string[] {
    const trimmed = query.trim();
    if (!trimmed) return readRecent();
    const next = [trimmed, ...readRecent().filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_LIMIT);
    try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
        /* noop — recents are a nicety, not load-bearing */
    }
    return next;
}

/**
 * Compact-mode search surface (§4.5 Mobile Translation Rule).
 *
 * A full-height takeover with one job: find things. It reuses `useUniversalSearch`
 * (same data as the desktop command palette) and `useSearchNavigation` (same
 * destinations) — only the presentation changes: a single large auto-focused
 * input, big tappable grouped rows, recent searches, and calm empty/zero states.
 * No command syntax, no arrow-key-only model.
 */
export function MobileSearchSheet({ open, onOpenChange }: MobileSearchSheetProps) {
    const [rawQuery, setRawQuery] = useState("");
    const [recent, setRecent] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const reduceMotion = useReducedMotion();

    const { results, query } = useUniversalSearch(rawQuery, open);
    const navigateToResult = useSearchNavigation();

    useEffect(() => {
        if (open) {
            setRawQuery("");
            setRecent(readRecent());
            requestAnimationFrame(() => inputRef.current?.focus());
            trackUsageEvent("command_palette.opened", { input_method: "touch" });
        }
    }, [open]);

    // Esc closes the sheet (hardware keyboard / external keyboard on tablet).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onOpenChange(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onOpenChange]);

    const groups = useMemo(() => {
        const built: { key: string; label: string; items: SearchResult[] }[] = [];
        for (const group of GROUP_ORDER) {
            const items = results[group] as SearchResult[] | undefined;
            if (items && items.length > 0) {
                built.push({ key: group, label: GROUP_LABELS[group], items });
            }
        }
        return built;
    }, [results]);

    const topResult = groups[0]?.items[0];
    const hasQuery = query.length > 0;
    const hasResults = groups.length > 0;

    const handleSelect = useCallback(
        (result: SearchResult) => {
            if (hasQuery) setRecent(pushRecent(query));
            navigateToResult(result, () => onOpenChange(false));
        },
        [hasQuery, query, navigateToResult, onOpenChange],
    );

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (topResult) handleSelect(topResult);
    };

    return (
        <AnimatePresence>
            {open && (
                <div className="layer-system-dialog fixed inset-0 flex justify-center" role="dialog" aria-modal="true" aria-label="Search workspace">
                    {/* Backdrop */}
                    <motion.button
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-twilight-void/70 backdrop-blur-md"
                        aria-label="Close search"
                        onClick={() => onOpenChange(false)}
                    />

                    {/* Sheet — slides up with native physics */}
                    <motion.div
                        key="mobile-search-sheet"
                        initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
                        animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
                        transition={reduceMotion ? { duration: 0.15 } : { type: "spring", damping: 32, stiffness: 320 }}
                        className="mobile-sheet-shell surface-route-overlay relative flex flex-col border-x border-twilight-border shadow-2xl shadow-black/40"
                        style={{ willChange: "transform" }}
                    >
                        {/* Header — one large input */}
                        <div className="mobile-sheet-header safe-top border-b border-twilight-border px-4 pb-3">
                            <form onSubmit={handleSubmit} className="flex items-center gap-3">
                                <Search size={20} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
                                <input
                                    ref={inputRef}
                                    value={rawQuery}
                                    onChange={(e) => setRawQuery(e.target.value)}
                                    placeholder="Search your workspace"
                                    enterKeyHint="search"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    spellCheck={false}
                                    className="min-w-0 flex-1 bg-transparent py-3 font-display text-lg text-twilight-text outline-none placeholder:text-twilight-text-muted/70"
                                    aria-label="Search workspace"
                                />
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    aria-label="Close search"
                                    className="btn-icon shrink-0 text-twilight-text-muted hover:bg-white/[0.05] hover:text-twilight-text"
                                >
                                    <X size={20} aria-hidden="true" />
                                </button>
                            </form>
                        </div>

                        {/* Body */}
                        <div className="mobile-sheet-body safe-bottom px-3 py-3">
                            {hasResults ? (
                                groups.map(({ key, label, items }) => (
                                    <div key={key} role="group" aria-label={label} className="mb-1.5">
                                        <div className="px-3 pb-1.5 pt-3 text-[11px] font-display font-semibold uppercase tracking-[0.14em] text-twilight-text-muted/70">
                                            {label}
                                        </div>
                                        {items.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleSelect(item)}
                                                className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-twilight-text transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                                            >
                                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-twilight-text-muted">
                                                    {item.noteAction ? <FileText size={18} aria-hidden="true" /> : KIND_ICON[item.kind]}
                                                </span>
                                                <span className="flex min-w-0 flex-1 flex-col">
                                                    <span className="truncate text-[15px] font-medium">{item.title}</span>
                                                    {item.context && (
                                                        <span className="truncate text-[13px] text-twilight-text-muted/80">{item.context}</span>
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                ))
                            ) : hasQuery ? (
                                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                                    <Search size={28} className="text-twilight-text-muted/40" aria-hidden="true" />
                                    <p className="text-sm text-twilight-text-soft">No matches for &ldquo;{query}&rdquo;</p>
                                    <p className="text-xs text-twilight-text-muted/70">Try a task name, project, habit, or page.</p>
                                </div>
                            ) : (
                                <div className="px-2 py-3">
                                    {/* Recent searches */}
                                    {recent.length > 0 && (
                                        <div className="mb-5">
                                            <div className="px-3 pb-1.5 text-[11px] font-display font-semibold uppercase tracking-[0.14em] text-twilight-text-muted/70">
                                                Recent
                                            </div>
                                            {recent.map((q) => (
                                                <button
                                                    key={q}
                                                    type="button"
                                                    onClick={() => {
                                                        setRawQuery(q);
                                                        requestAnimationFrame(() => inputRef.current?.focus());
                                                    }}
                                                    className="flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-twilight-text-soft transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                                                >
                                                    <Clock size={16} className="shrink-0 text-twilight-text-muted/70" aria-hidden="true" />
                                                    <span className="min-w-0 flex-1 truncate text-[15px]">{q}</span>
                                                    <ArrowUpLeft size={16} className="shrink-0 text-twilight-text-muted/50" aria-hidden="true" />
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Calm zero state */}
                                    <div className="px-3 py-6 text-center">
                                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-primary/10 text-accent-primary">
                                            <Search size={22} aria-hidden="true" />
                                        </div>
                                        <p className="text-sm font-medium text-twilight-text">Search your workspace</p>
                                        <p className="mx-auto mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-twilight-text-muted">
                                            Find tasks, projects, captures, habits, and pages — all in one place.
                                        </p>
                                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                                            {EXAMPLE_CHIPS.map((chip) => (
                                                <button
                                                    key={chip}
                                                    type="button"
                                                    onClick={() => {
                                                        setRawQuery(chip);
                                                        requestAnimationFrame(() => inputRef.current?.focus());
                                                    }}
                                                    className="rounded-full border border-twilight-border bg-white/[0.03] px-3.5 py-1.5 text-[13px] text-twilight-text-soft transition-colors hover:border-twilight-border-interactive hover:bg-white/[0.05]"
                                                >
                                                    {chip}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
