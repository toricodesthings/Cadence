import {
    Bell, Calendar, CalendarHeart, CalendarRange, CheckCircle2,
    Flame, Inbox, Keyboard, LayoutList, MessageSquare, Palette,
    Settings, ShieldCheck, Sparkles, Sprout, Tags, ArchiveRestore,
    Brain, TextCursorInput, Waypoints, ArrowDownWideNarrow, Focus, Gauge, BookOpen,
} from "lucide-react";

/** The directory owns feature identity; guide content can be added independently. */
export const HELP_GROUPS = [
    {
        id: "day",
        title: "Your day",
        features: [
            { id: "capture", title: "Capture", description: "A place for whatever is on your mind.", icon: Inbox },
            { id: "tasks", title: "Tasks", description: "The things you want to get done.", icon: CheckCircle2 },
            { id: "today", title: "Today", description: "What needs your attention today.", icon: CalendarRange },
            { id: "upcoming", title: "Upcoming", description: "A little room to see what is ahead.", icon: CalendarRange },
            { id: "schedule", title: "Schedule", description: "See how your days fit together.", icon: Calendar },
            { id: "events", title: "Events", description: "The dates you want to remember.", icon: CalendarHeart },
        ],
    },
    {
        id: "rhythm",
        title: "Your rhythm",
        features: [
            { id: "lists", title: "Lists & Boards", description: "Keep related things together.", icon: LayoutList },
            { id: "tags", title: "Tags", description: "Find connections across your tasks.", icon: Tags },
            { id: "routines", title: "Routines", description: "Make room for the things you return to.", icon: Flame },
            { id: "weekly-reset", title: "Weekly Reset", description: "A little space to regroup.", icon: Sprout },
            { id: "notes", title: "Notes & Writing Room", description: "Give a task space to hold your thoughts.", icon: MessageSquare },
        ],
    },
    {
        id: "workspace",
        title: "Make it yours",
        features: [
            { id: "notifications", title: "Notifications", description: "Choose what brings you back.", icon: Bell },
            { id: "appearance", title: "Appearance", description: "Make Cadence feel comfortable.", icon: Palette },
            { id: "search", title: "Search & Shortcuts", description: "Find your way with fewer steps.", icon: Keyboard },
            { id: "settings", title: "Settings & Integrations", description: "Your preferences and connections.", icon: Settings },
            { id: "privacy", title: "Privacy & Data", description: "Understand and manage your data.", icon: ShieldCheck },
            { id: "completed-trash", title: "Completed & Trash", description: "Look back, or bring something back.", icon: ArchiveRestore },
        ],
    },
    {
        id: "intelligence",
        title: "Cadence Intelligence",
        features: [
            { id: "intelligence", title: "Overview", description: "How the different parts work together.", icon: BookOpen },
            { id: "memory", title: "Memory", description: "What Cadence remembers, and what you can change.", icon: Brain },
            { id: "nlp", title: "Natural language (NLP)", description: "Turn the words you type into task details.", icon: TextCursorInput },
            { id: "assistant", title: "Assistant", description: "A hand with thinking and planning.", icon: Sparkles },
            { id: "decisioning", title: "Decisioning", description: "Suggestions for where captures go and what you meant.", icon: Waypoints },
            { id: "smart-sort", title: "Smart Sort", description: "Bring the tasks that need you into view.", icon: ArrowDownWideNarrow },
            { id: "focus-views", title: "Focus Views", description: "Narrow your list to what matters right now.", icon: Focus },
            { id: "effort-workload", title: "Effort & Workload", description: "Suggestions for effort and room in your day.", icon: Gauge },
        ],
    },
] as const;

export type HelpFeature = (typeof HELP_GROUPS)[number]["features"][number];
export const HELP_FEATURES: readonly HelpFeature[] = HELP_GROUPS.flatMap((group) => [...group.features]);
