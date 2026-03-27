interface HabitDayPlaceholderProps {
    targetDate: string;
}

export function HabitDayPlaceholder({ targetDate }: HabitDayPlaceholderProps) {
    const today = new Date().toISOString().substring(0, 10);
    const isPast = targetDate < today;
    const isToday = targetDate === today;

    return (
        <div
            aria-hidden="true"
            className={[
                "flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
                isPast
                    ? "border-twilight-border/20 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0_2px,transparent_2px_6px)]"
                    : isToday
                        ? "border-twilight-border/20 bg-white/[0.025]"
                        : "border-transparent opacity-55",
            ].join(" ")}
        >
            <div className="h-1.5 w-1.5 rounded-full bg-twilight-border/25" />
        </div>
    );
}
