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

    useEffect(() => {
        const h = period === "PM" ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
        const date = new Date();
        date.setHours(h, minute, 0, 0);
        onChange(date.toISOString());
    }, [hour, minute, period, onChange]);

    const incrementHour = () => setHour((prev) => (prev % 12) + 1);
    const decrementHour = () => setHour((prev) => (prev === 1 ? 12 : prev - 1));
    const incrementMinute = () => setMinute((prev) => (prev + 5) % 60);
    const decrementMinute = () => setMinute((prev) => (prev === 0 ? 55 : prev - 5));

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
                onClick={() => setPeriod(prev => prev === "AM" ? "PM" : "AM")}
                aria-label="Toggle AM/PM"
                className="ml-2 rounded flex h-8 items-center bg-twilight-border px-2 text-[11px] font-bold text-twilight-text hover:bg-twilight-text-muted/20 cursor-pointer"
            >
                {period}
            </button>
        </div>
    );
};
