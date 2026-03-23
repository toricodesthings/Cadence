import type { ReactNode } from "react";
import { Repeat } from "lucide-react";
import { cn } from "../../lib/utils";

interface AgendaRowProps {
    leading: ReactNode;
    onOpen: () => void;
    ariaLabel: string;
    children: ReactNode;
    className?: string;
    actionClassName?: string;
}

export function AgendaRow({
    leading,
    onOpen,
    ariaLabel,
    children,
    className,
    actionClassName,
}: AgendaRowProps) {
    return (
        <div
            className={cn(
                "group flex items-start gap-3 rounded-[26px] px-2 py-3 transition-[background-color,border-color,box-shadow] duration-200",
                className,
            )}
        >
            {leading}

            <button
                type="button"
                onClick={onOpen}
                className={cn("min-w-0 flex-1 cursor-pointer rounded-2xl px-1 py-0.5 text-left", actionClassName)}
                aria-label={ariaLabel}
            >
                {children}
            </button>
        </div>
    );
}

export function AgendaHabitDivider({ label }: { label: string }) {
    return (
        <div className="px-3 py-3">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                <Repeat size={11} aria-hidden="true" />
                <span>{label}</span>
            </div>
        </div>
    );
}