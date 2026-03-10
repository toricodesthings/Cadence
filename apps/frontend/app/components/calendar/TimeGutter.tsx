/** Hour labels column for the time grid (0 AM – 11 PM) */
export function TimeGutter({ hourHeight }: { hourHeight: number }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
        <div className="shrink-0 w-14 select-none" style={{ paddingTop: hourHeight }}>
            {hours.map((h) => (
                <div
                    key={h}
                    className="relative flex items-start justify-end pr-2.5"
                    style={{ height: hourHeight }}
                >
                    {/* Don't show 12AM at the very top row — it's implied */}
                    {h > 0 && (
                        <span className="text-[11px] text-twilight-text-muted/90 font-medium tabular-nums leading-none -mt-[5px]">
                            {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
