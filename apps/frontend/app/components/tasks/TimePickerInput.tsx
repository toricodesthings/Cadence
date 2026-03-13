import React, { useState, useEffect } from "react";

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

    const broadcastChange = (h: number, m: number, p: "AM" | "PM") => {
        const h24 = p === "PM" ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
        const date = new Date(value ? new Date(value) : new Date());
        date.setHours(h24, m, 0, 0);
        onChange(date.toISOString());
    };

    const incrementHour = () => {
        const val = (hour % 12) + 1;
        setHour(val);
        broadcastChange(val, minute, period);
    };

    const decrementHour = () => {
        const val = hour === 1 ? 12 : hour - 1;
        setHour(val);
        broadcastChange(val, minute, period);
    };

    const incrementMinute = () => {
        const val = (minute + 5) % 60;
        setMinute(val);
        broadcastChange(hour, val, period);
    };

    const decrementMinute = () => {
        const val = minute === 0 ? 55 : minute - 5;
        setMinute(val);
        broadcastChange(hour, val, period);
    };

    const togglePeriod = () => {
        const val = period === "AM" ? "PM" : "AM";
        setPeriod(val);
        broadcastChange(hour, minute, val);
    };

    return (
        <div className="flex items-center gap-2 rounded-xl border border-twilight-border bg-twilight-surface-muted p-2">
            <div className="flex flex-col items-center">
                <button
                    onClick={incrementHour}
                    aria-label="Increment hour"
                    className="flex h-6 w-8 items-center justify-center text-xs text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer"
                >
                    ▲
                </button>
                <span className="w-6 text-center tabular-nums py-1">{hour.toString().padStart(2, "0")}</span>
                <button
                    onClick={decrementHour}
                    aria-label="Decrement hour"
                    className="flex h-6 w-8 items-center justify-center text-xs text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer"
                >
                    ▼
                </button>
            </div>
            <span className="text-twilight-text-muted px-1">:</span>
            <div className="flex flex-col items-center">
                <button
                    onClick={incrementMinute}
                    aria-label="Increment minute"
                    className="flex h-6 w-8 items-center justify-center text-xs text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer"
                >
                    ▲
                </button>
                <span className="w-6 text-center tabular-nums py-1">{minute.toString().padStart(2, "0")}</span>
                <button
                    onClick={decrementMinute}
                    aria-label="Decrement minute"
                    className="flex h-6 w-8 items-center justify-center text-xs text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.04] rounded-xl transition-colors cursor-pointer"
                >
                    ▼
                </button>
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
