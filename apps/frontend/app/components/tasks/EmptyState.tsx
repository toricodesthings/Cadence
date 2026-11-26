import { Feather, Plus, CalendarRange, CalendarClock, Inbox, CheckCircle2, Flame, Archive } from "lucide-react";
import { useNavigate } from "react-router";
import { CaptureWindow } from "../holding/CaptureGreeting";

export type EmptyStateVariant =
    | "today"
    | "upcoming"
    | "holding"
    | "capture"
    | "capture-board"
    | "completed"
    | "schedule"
    | "routines"
    | "routines-archived"
    | "place"
    | "default";

interface EmptyStateProps {
    variant?: EmptyStateVariant;
    icon?: typeof Feather;
    title?: string;
    description?: string | null;
    compact?: boolean;
    size?: "default" | "compact" | "inline";
    onAction?: () => void;
}

const VARIANTS: Record<
    Exclude<EmptyStateVariant, "capture" | "capture-board">,
    {
        icon: typeof Feather;
        title: string;
        description?: string;
        cta?: { label: string; to?: string };
    }
> = {
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
    place: {
        icon: Feather,
        title: "Wide open.",
        description: "Drop a task onto this day, or place one from Capture below.",
    },
    default: {
        icon: Feather,
        title: "Nothing scheduled for today",
        description: "Add a task above, or drag one from your inbox to get started.",
    },
};

export function EmptyState({
    variant = "default",
    onAction,
    icon,
    title,
    description,
    compact = false,
    size = compact ? "compact" : "default",
}: EmptyStateProps) {
    const navigate = useNavigate();
    if (variant === "capture") return <CaptureWindow variant="clear" />;
    if (variant === "capture-board") return <CaptureWindow variant="board-clear" />;
    const config = VARIANTS[variant];
    const Icon = icon ?? config.icon;
    const line = description === undefined ? config.description : description;

    const small = size !== "default";
    const frame = {
        default: "mb-6 h-16 w-16 rounded-3xl bg-twilight-surface ring-1 ring-twilight-border",
        compact: "mb-4 h-12 w-12 rounded-2xl bg-twilight-surface ring-1 ring-twilight-border",
        inline: "mb-3 h-10 w-10 rounded-2xl surface-item ring-1 ring-twilight-border/60",
    }[size];

    return (
        <div
            className={`flex flex-col items-center justify-center ${{ default: "px-8 py-24", compact: "h-full min-h-48 px-8 py-10", inline: "px-4 py-6" }[size]}`}
        >
            <div className={`flex items-center justify-center ${frame}`}>
                <Icon
                    size={{ default: 26, compact: 20, inline: 18 }[size]}
                    aria-hidden="true"
                    className="text-twilight-text-muted"
                />
            </div>
            <p
                className={`text-center ${size === "inline" ? "text-sm font-medium" : small ? "text-sm" : "text-base"} text-twilight-text-soft ${line ? "mb-1.5" : ""}`}
            >
                {title ?? config.title}
            </p>
            {line ? (
                <p
                    className={`text-center leading-relaxed text-twilight-text-muted/90 ${size === "inline" ? "max-w-[240px] text-xs" : "max-w-[280px] text-sm"}`}
                >
                    {line}
                </p>
            ) : null}
            {config.cta && !small && (
                <button
                    type="button"
                    onClick={() => (onAction ? onAction() : config.cta?.to && navigate(config.cta.to))}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors ring-1 ring-accent-primary/20 cursor-pointer"
                >
                    <Plus size={14} />
                    {config.cta.label}
                </button>
            )}
        </div>
    );
}
