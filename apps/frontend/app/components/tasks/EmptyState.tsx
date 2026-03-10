import { Feather } from "lucide-react";

/** Empty state when no tasks exist for the selected date */
export function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center py-24 px-8">
            <div className="w-16 h-16 rounded-3xl bg-twilight-surface flex items-center justify-center mb-6">
                <Feather size={26} className="text-twilight-text-muted" />
            </div>
            <p className="text-base text-twilight-text-soft text-center mb-1.5">
                Nothing scheduled for today
            </p>
            <p className="text-sm text-twilight-text-muted/90 text-center max-w-[280px] leading-relaxed">
                Add a task above, or drag one from your inbox to get started.
            </p>
        </div>
    );
}
