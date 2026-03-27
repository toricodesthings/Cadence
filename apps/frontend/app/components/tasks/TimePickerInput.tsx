import React, { useState, useRef, useCallback } from "react";

interface TimePickerInputProps {
    /** ISO time string fragment or full ISO string */
    value?: string | null;
    onChange: (time: string) => void;
}

export const TimePickerInput: React.FC<TimePickerInputProps> = ({
    value,
    onChange,
}) => {
    const initialTime = value ? new Date(value) : new Date();
    if (!value) {
        initialTime.setHours(9, 0, 0, 0);
    }

    const [hour, setHour] = useState(
        initialTime.getHours() % 12 === 0 ? 12 : initialTime.getHours() % 12,
    );
    const [minute, setMinute] = useState(initialTime.getMinutes());
    const [period, setPeriod] = useState<"AM" | "PM">(
        initialTime.getHours() >= 12 ? "PM" : "AM",
    );

    const hourRef = useRef<HTMLInputElement>(null);
    const minuteRef = useRef<HTMLInputElement>(null);

    const broadcastChange = useCallback((h: number, m: number, p: "AM" | "PM") => {
        const h24 = p === "PM" ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
        const date = new Date(value ? new Date(value) : new Date());
        date.setHours(h24, m, 0, 0);
        onChange(date.toISOString());
    }, [value, onChange]);

    const clampHour = (n: number) => Math.max(1, Math.min(12, n));
    const clampMinute = (n: number) => ((n % 60) + 60) % 60;

    const handleHourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, "");
        if (raw === "") return;
        const n = clampHour(parseInt(raw, 10));
        setHour(n);
        broadcastChange(n, minute, period);
        if (raw.length >= 2) minuteRef.current?.focus();
    };

    const handleMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, "");
        if (raw === "") return;
        const n = clampMinute(parseInt(raw, 10));
        setMinute(n);
        broadcastChange(hour, n, period);
    };

    const handleHourKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp") { e.preventDefault(); const v = (hour % 12) + 1; setHour(v); broadcastChange(v, minute, period); }
        if (e.key === "ArrowDown") { e.preventDefault(); const v = hour === 1 ? 12 : hour - 1; setHour(v); broadcastChange(v, minute, period); }
        if (e.key === "ArrowRight" && (e.currentTarget.selectionStart ?? 0) >= e.currentTarget.value.length) { e.preventDefault(); minuteRef.current?.focus(); }
    };

    const handleMinuteKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowUp") { e.preventDefault(); const v = (minute + 5) % 60; setMinute(v); broadcastChange(hour, v, period); }
        if (e.key === "ArrowDown") { e.preventDefault(); const v = minute === 0 ? 55 : minute - 5; setMinute(v); broadcastChange(hour, v, period); }
        if (e.key === "ArrowLeft" && (e.currentTarget.selectionStart ?? 1) === 0) { e.preventDefault(); hourRef.current?.focus(); }
    };

    const incrementHour = () => { const v = (hour % 12) + 1; setHour(v); broadcastChange(v, minute, period); };
    const decrementHour = () => { const v = hour === 1 ? 12 : hour - 1; setHour(v); broadcastChange(v, minute, period); };
    const incrementMinute = () => { const v = (minute + 5) % 60; setMinute(v); broadcastChange(hour, v, period); };
    const decrementMinute = () => { const v = minute === 0 ? 55 : minute - 5; setMinute(v); broadcastChange(hour, v, period); };
    const togglePeriod = () => { const v = period === "AM" ? "PM" : "AM"; setPeriod(v); broadcastChange(hour, minute, v); };

    const spinnerBtn = "flex h-6 w-8 items-center justify-center text-xs text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer";
    const fieldClass = "w-8 text-center tabular-nums py-1 bg-transparent outline-none text-twilight-text caret-lantern/60 selection:bg-accent-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

    return (
        <div className="flex items-center gap-2 rounded-xl border border-twilight-border bg-twilight-surface-muted p-2">
            <div className="flex flex-col items-center">
                <button onClick={incrementHour} aria-label="Increment hour" className={spinnerBtn} tabIndex={-1}>▲</button>
                <input
                    ref={hourRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={hour.toString().padStart(2, "0")}
                    onChange={handleHourChange}
                    onKeyDown={handleHourKey}
                    onFocus={(e) => e.target.select()}
                    className={fieldClass}
                    aria-label="Hour"
                />
                <button onClick={decrementHour} aria-label="Decrement hour" className={spinnerBtn} tabIndex={-1}>▼</button>
            </div>
            <span className="text-twilight-text-muted px-1">:</span>
            <div className="flex flex-col items-center">
                <button onClick={incrementMinute} aria-label="Increment minute" className={spinnerBtn} tabIndex={-1}>▲</button>
                <input
                    ref={minuteRef}
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={minute.toString().padStart(2, "0")}
                    onChange={handleMinuteChange}
                    onKeyDown={handleMinuteKey}
                    onFocus={(e) => e.target.select()}
                    className={fieldClass}
                    aria-label="Minute"
                />
                <button onClick={decrementMinute} aria-label="Decrement minute" className={spinnerBtn} tabIndex={-1}>▼</button>
            </div>
            <button
                onClick={togglePeriod}
                aria-label="Toggle AM/PM"
                className="ml-2 rounded flex h-8 items-center bg-twilight-border px-2 text-[11px] font-bold text-twilight-text hover:bg-twilight-text-muted/20 cursor-pointer"
            >
                {period}
            </button>
        </div>
    );
};
