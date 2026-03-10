import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

interface CalendarHeaderProps {
    year: number;
    month: number;
    onNavigate: (delta: number) => void;
    onToday: () => void;
}

/** Month/year header with prev/next/today navigation */
export function CalendarHeader({ year, month, onNavigate, onToday }: CalendarHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-base font-medium text-twilight-text">
                {MONTHS[month]} {year}
            </h3>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onNavigate(-1)}
                    aria-label="Previous month"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                    <ChevronLeft size={15} />
                </button>
                <button
                    onClick={onToday}
                    className="px-2.5 py-1 text-[12px] text-twilight-text-muted hover:text-lantern rounded-xl hover:bg-lantern-dim transition-colors cursor-pointer"
                >
                    Today
                </button>
                <button
                    onClick={() => onNavigate(1)}
                    aria-label="Next month"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                    <ChevronRight size={15} />
                </button>
            </div>
        </div>
    );
}
