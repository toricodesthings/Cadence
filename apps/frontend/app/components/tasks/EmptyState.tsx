import { Feather, Plus, CalendarRange, CalendarClock, Inbox, CheckCircle2, Flame, Archive } from "lucide-react";
import { useNavigate } from "react-router";

export type EmptyStateVariant = "today" | "upcoming" | "holding" | "completed" | "schedule" | "routines" | "routines-archived" | "default";

interface EmptyStateProps {
    variant?: EmptyStateVariant;
    /** Overrides the variant's copy or icon (e.g. a named column). `description: null` drops the second line. */
    icon?: typeof Feather;
    title?: string;
    description?: string | null;
    /** Inside a section or board column: smaller, centred in the space it has. */
    compact?: boolean;
    /** Runs the CTA in place (e.g. opens a composer) instead of navigating. */
    onAction?: () => void;
}

const VARIANTS: Record<EmptyStateVariant, {
    icon: typeof Feather;
    title: string;
    description?: string;
    cta?: { label: string; to?: string };
}> = {
    today: {
        icon: Feather,
        title: "Nothing pressing today.",
        cta: { label: "Go to Capture", to: "/" },
    },
    upcoming: {
        icon: CalendarRange,
        title: "Nothing urgent on the horizon.",
        description: "Schedule your next work block to see upcoming tasks here.",
        cta: { label: "Open Schedule", to: "/schedule" },
    },
    holding: {
        icon: Inbox,
        title: "All clear.",
        description: "Capture a quick thought or add a task to get started.",
    },
    completed: {
        icon: CheckCircle2,
        title: "No finished tasks yet.",
        description: "Tasks you complete will appear here for reference.",
        cta: { label: "Go to Today", to: "/today" },
    },
    schedule: {
        icon: CalendarClock,
        title: "This day is clear.",
        description: "Nothing is booked yet. Add a block when you're ready, or swipe across to another day.",
    },
    routines: {
        icon: Flame,
        title: "No routines yet.",
        description: "A routine is something you come back to. Miss a day and it simply lets go.",
        cta: { label: "Add a routine" },
    },
    "routines-archived": {
        icon: Archive,
        title: "Nothing archived.",
        description: "Routines you archive rest here, history and all, until you restore them.",
    },
    default: {
        icon: Feather,
        title: "Nothing scheduled for today",
        description: "Add a task above, or drag one from your inbox to get started.",
    },
};

/** The one empty state: icon, title, optional line and CTA, centred where the content would be. */
export function EmptyState({ variant = "default", onAction, icon, title, description, compact = false }: EmptyStateProps) {
    const navigate = useNavigate();
    const config = VARIANTS[variant];
    const Icon = icon ?? config.icon;
    const line = description === undefined ? config.description : description;

    return (
        <div className={`flex flex-col items-center justify-center px-8 ${compact ? "h-full min-h-48 py-10" : "py-24"}`}>
            <div className={`flex items-center justify-center bg-twilight-surface ring-1 ring-twilight-border ${compact ? "mb-4 h-12 w-12 rounded-2xl" : "mb-6 h-16 w-16 rounded-3xl"}`}>
                <Icon size={compact ? 20 : 26} aria-hidden="true" className="text-twilight-text-muted" />
            </div>
            <p className={`text-center text-twilight-text-soft ${compact ? "text-sm" : "text-base"} ${line ? "mb-1.5" : ""}`}>
                {title ?? config.title}
            </p>
            {line ? (
                <p className="text-sm text-twilight-text-muted/90 text-center max-w-[280px] leading-relaxed">
                    {line}
                </p>
            ) : null}
            {config.cta && (
                <button
                    type="button"
                    onClick={() => onAction ? onAction() : config.cta?.to && navigate(config.cta.to)}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors ring-1 ring-accent-primary/20 cursor-pointer"
                >
                    <Plus size={14} />
                    {config.cta.label}
                </button>
            )}
        </div>
    );
}
