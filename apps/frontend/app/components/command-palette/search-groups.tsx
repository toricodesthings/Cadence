import { CheckSquare, Flame, FolderOpen, Navigation, type LucideIcon, MessageSquare, StickyNote, Zap } from "lucide-react";
import type { SearchResult, SearchResultKind } from "../../hooks/search/use-universal-search";

const KIND_ICON: Record<SearchResultKind, LucideIcon> = {
    task: CheckSquare,
    habit: Flame,
    inbox: MessageSquare,
    project: FolderOpen,
    "focus-view": Zap,
    page: Navigation,
};

export const GROUP_LABELS: Record<string, string> = {
    pages: "Pages",
    tasks: "Tasks",
    habits: "Routines",
    captures: "Thoughts",
    projects: "Lists",
    focusViews: "Focus Views",
};

export const GROUP_ORDER = ["pages", "tasks", "habits", "captures", "projects", "focusViews"] as const;

/** The result's kind icon, or a note icon when it jumps into a note heading. */
export function SearchResultIcon({ result, size }: { result: SearchResult; size: number }) {
    const Icon = result.noteAction ? StickyNote : KIND_ICON[result.kind];
    return <Icon size={size} aria-hidden="true" />;
}
