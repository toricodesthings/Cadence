import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "react-router";
import {
    Search, Calendar, Inbox, CheckCircle2, Trash2, Home,
    Flame, RefreshCw, Plus, LayoutDashboard
} from "lucide-react";
import { useTasks } from "../hooks/tasks/use-tasks";

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

type CommandItem = {
    id: string;
    name: string;
    icon: React.ReactNode;
    section: "navigation" | "actions" | "tasks";
    action: () => void;
    shortcut?: string;
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const navigate = useNavigate();
    const listRef = useRef<HTMLDivElement>(null);

    const { data: allTasks = [] } = useTasks({ enabled: open });

    // Reset query and selection when opening
    useEffect(() => {
        if (open) {
            setQuery("");
            setSelectedIndex(0);
        }
    }, [open]);

    const doAction = useCallback((action: () => void) => {
        action();
        onOpenChange(false);
    }, [onOpenChange]);

    const items = useMemo<CommandItem[]>(() => {
        const nav: CommandItem[] = [
            { id: "nav-today", name: "Today", icon: <LayoutDashboard size={14} />, section: "navigation", action: () => navigate("/"), shortcut: "G T" },
            { id: "nav-schedule", name: "Schedule", icon: <Calendar size={14} />, section: "navigation", action: () => navigate("/schedule") },
            { id: "nav-inbox", name: "Inbox", icon: <Inbox size={14} />, section: "navigation", action: () => navigate("/inbox") },
            { id: "nav-upcoming", name: "Upcoming", icon: <Calendar size={14} />, section: "navigation", action: () => navigate("/upcoming") },
            { id: "nav-completed", name: "Completed", icon: <CheckCircle2 size={14} />, section: "navigation", action: () => navigate("/completed") },
            { id: "nav-habits", name: "Habits", icon: <Flame size={14} />, section: "navigation", action: () => navigate("/habits") },
            { id: "nav-weekly", name: "Weekly Reset", icon: <RefreshCw size={14} />, section: "navigation", action: () => navigate("/weekly-review") },
            { id: "nav-trash", name: "Trash", icon: <Trash2 size={14} />, section: "navigation", action: () => navigate("/trash") },
        ];

        const actions: CommandItem[] = [
            { id: "action-new-task", name: "New task", icon: <Plus size={14} />, section: "actions", action: () => navigate("/"), shortcut: "T" },
        ];

        // Task search — fuzzy match by title
        const taskItems: CommandItem[] = allTasks
            .filter(t => t.state === "ACTIVE" || t.state === "WAITING")
            .slice(0, 20)
            .map(t => ({
                id: `task-${t.id}`,
                name: t.title,
                icon: <Home size={14} />,
                section: "tasks" as const,
                action: () => navigate(`/?task=${t.id}`),
            }));

        return [...nav, ...actions, ...taskItems];
    }, [navigate, allTasks]);

    const filtered = useMemo(() => {
        if (!query.trim()) return items.filter(i => i.section !== "tasks"); // show nav + actions when empty
        const q = query.toLowerCase();
        return items.filter(i => i.name.toLowerCase().includes(q));
    }, [items, query]);

    // Reset selection when filtered results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [filtered.length]);

    // Keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && filtered[selectedIndex]) {
            e.preventDefault();
            doAction(filtered[selectedIndex].action);
        }
    };

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

    // Group items by section for rendering
    const sections = useMemo(() => {
        const map = new Map<string, CommandItem[]>();
        for (const item of filtered) {
            const group = map.get(item.section) ?? [];
            group.push(item);
            map.set(item.section, group);
        }
        return map;
    }, [filtered]);

    const sectionLabels: Record<string, string> = {
        navigation: "Navigate",
        actions: "Actions",
        tasks: "Tasks",
    };

    let flatIndex = 0;

    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-twilight-void/60 backdrop-blur-2xl animate-in fade-in transition-opacity" />
                <Dialog.Content
                    className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-twilight-border glass-surface shadow-2xl p-0 overflow-hidden outline-none animate-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:zoom-out-95"
                    onKeyDown={handleKeyDown}
                >
                    <div className="flex items-center border-b border-twilight-border px-4 py-3">
                        <Search size={18} className="text-twilight-text-muted mr-3 shrink-0" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="What do you need?"
                            className="bg-transparent text-base font-display w-full outline-none text-twilight-text placeholder:text-twilight-text-muted/60"
                        />
                        <div className="text-[10px] text-twilight-text-muted/60 bg-white/[0.06] px-1.5 py-0.5 rounded border border-twilight-border font-mono">
                            ESC
                        </div>
                    </div>

                    <div ref={listRef} className="max-h-[320px] overflow-y-auto p-2">
                        {filtered.length === 0 ? (
                            <div className="py-8 text-center text-sm text-twilight-text-muted italic">
                                No results found.
                            </div>
                        ) : (
                            Array.from(sections.entries()).map(([section, sectionItems]) => (
                                <div key={section}>
                                    <div className="text-[10px] font-display font-medium text-twilight-text-muted/60 uppercase tracking-wider px-3 pt-3 pb-1.5">
                                        {sectionLabels[section] ?? section}
                                    </div>
                                    {sectionItems.map((item) => {
                                        const idx = flatIndex++;
                                        return (
                                            <button
                                                key={item.id}
                                                data-index={idx}
                                                onClick={() => doAction(item.action)}
                                                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-sm text-twilight-text transition-colors
                                                    ${idx === selectedIndex ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}
                                                `}
                                            >
                                                <div className="text-twilight-text-muted shrink-0">
                                                    {item.icon}
                                                </div>
                                                <span className="flex-1 text-left truncate">{item.name}</span>
                                                {item.shortcut && (
                                                    <span className="text-[10px] text-twilight-text-muted bg-white/[0.06] rounded px-1.5 py-0.5 font-mono">
                                                        {item.shortcut}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            ))
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
