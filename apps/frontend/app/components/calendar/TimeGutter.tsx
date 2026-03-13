import { getDateFormatConfig } from "../../lib/utils/date-format";

/** Hour labels column for the time grid */
export function TimeGutter({ hourHeight }: { hourHeight: number }) {
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const is24h = getDateFormatConfig().timeDisplay === "24h";

    function hourLabel(h: number): string {
        if (is24h) return `${String(h).padStart(2, "0")}:00`;
        if (h === 0) return "12 AM";
        if (h === 12) return "12 PM";
        return h < 12 ? `${h} AM` : `${h - 12} PM`;
    }

    return (
        <div className="shrink-0 w-14 select-none" style={{ paddingTop: hourHeight }}>
            {hours.map((h) => (
                <div
                    key={h}
                    className="relative flex items-start justify-end pr-2.5"
                    style={{ height: hourHeight }}
                >
                    {h > 0 && (
                        <span className="text-[11px] text-twilight-text-muted/90 font-medium tabular-nums leading-none -mt-[5px]">
                            {hourLabel(h)}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
}
