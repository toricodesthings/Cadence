import type { LucideIcon } from "lucide-react";

interface GeneralPageHeaderProps {
    icon: LucideIcon;
    title: string;
    description: React.ReactNode;
    iconColorClass?: string;
    iconBgClass?: string;
    iconGlowClass?: string;
}

/** Unified page header for all task-list pages (Inbox, Upcoming, Completed, Trash).
 *  Aligned to the Planner's warmth — text-3xl font-semibold, no boxy ring. */
export function GeneralPageHeader({
    icon: Icon,
    title,
    description,
    iconColorClass = "text-accent-primary",
    iconBgClass = "bg-accent-primary/10",
    iconGlowClass = "glow-lantern"
}: GeneralPageHeaderProps) {
    return (
        <div className="flex items-center gap-5 mb-10">
            <div className={`w-12 h-12 rounded-2xl ${iconBgClass} flex items-center justify-center ${iconGlowClass}`}>
                <Icon size={24} className={iconColorClass} />
            </div>
            <div>
                <h2 className="font-display text-3xl font-semibold text-twilight-text tracking-tight leading-snug">
                    {title}
                </h2>
                <div className="text-sm text-twilight-text-muted mt-1 font-medium italic">
                    {description}
                </div>
            </div>
        </div>
    );
}
