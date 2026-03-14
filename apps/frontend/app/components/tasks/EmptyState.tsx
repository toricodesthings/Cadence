import { Feather, Plus, CalendarRange, Inbox } from "lucide-react";
import { useNavigate } from "react-router";

type EmptyStateVariant = "today" | "upcoming" | "holding" | "default";

interface EmptyStateProps {
    variant?: EmptyStateVariant;
}

const VARIANTS: Record<EmptyStateVariant, {
    icon: typeof Feather;
    title: string;
    description: string;
    cta?: { label: string; to: string };
}> = {
    today: {
        icon: Feather,
        title: "Nothing pressing today.",
        description: "Pull tasks from Holding, or schedule something from Upcoming.",
        cta: { label: "Go to Holding", to: "/inbox" },
    },
    upcoming: {
        icon: CalendarRange,
        title: "Nothing urgent on the horizon.",
        description: "Schedule your next work block to see upcoming tasks here.",
        cta: { label: "Open Schedule", to: "/schedule" },
    },
    holding: {
        icon: Inbox,
        title: "Holding is clear.",
        description: "Capture a quick thought or add a task to get started.",
    },
    default: {
        icon: Feather,
        title: "Nothing scheduled for today",
        description: "Add a task above, or drag one from your inbox to get started.",
    },
};

/** Empty state with optional CTA for core surfaces */
export function EmptyState({ variant = "default" }: EmptyStateProps) {
    const navigate = useNavigate();
    const config = VARIANTS[variant];
    const Icon = config.icon;

    return (
        <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-16 h-16 rounded-3xl bg-twilight-surface flex items-center justify-center mb-6 ring-1 ring-twilight-border">
                <Icon size={26} className="text-twilight-text-muted" />
            </div>
            <p className="text-base text-twilight-text-soft text-center mb-1.5">
                {config.title}
            </p>
            <p className="text-sm text-twilight-text-muted/90 text-center max-w-[280px] leading-relaxed">
                {config.description}
            </p>
            {config.cta && (
                <button
                    type="button"
                    onClick={() => navigate(config.cta!.to)}
                    className="mt-6 inline-flex items-center gap-2 rounded-xl bg-lantern/10 px-4 py-2 text-sm font-medium text-lantern hover:bg-lantern/20 transition-colors ring-1 ring-lantern/20 cursor-pointer"
                >
                    <Plus size={14} />
                    {config.cta.label}
                </button>
            )}
        </div>
    );
}
