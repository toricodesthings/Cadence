import { CheckSquare, FileText, Flame, FolderOpen, Inbox, Navigation, Telescope, type LucideIcon } from "lucide-react";
import type { SearchResult, SearchResultKind } from "../../hooks/search/use-universal-search";

const KIND_ICON: Record<SearchResultKind, LucideIcon> = {
    task: CheckSquare,
    habit: Flame,
    inbox: Inbox,
    project: FolderOpen,
    "focus-view": Telescope,
    page: Navigation,
};

export const GROUP_LABELS: Record<string, string> = {
    pages: "Pages",
    tasks: "Tasks",
    habits: "Routines",
    captures: "Captures",
    projects: "Projects",
    focusViews: "Focus Views",
};

export const GROUP_ORDER = ["pages", "tasks", "habits", "captures", "projects", "focusViews"] as const;

/** The result's kind icon, or a note icon when it jumps into a note heading. */
export function SearchResultIcon({ result, size }: { result: SearchResult; size: number }) {
    const Icon = result.noteAction ? FileText : KIND_ICON[result.kind];
    return <Icon size={size} aria-hidden="true" />;
}
