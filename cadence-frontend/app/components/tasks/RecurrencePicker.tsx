import React from "react";
import { Repeat } from "lucide-react";

interface RecurrencePickerProps {
    value: string | null;
    onChange: (rrule: string | null) => void;
}

const PRESETS = [
    { label: "None", rrule: null },
    { label: "Daily", rrule: "FREQ=DAILY;INTERVAL=1" },
    { label: "Weekdays", rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { label: "Weekly", rrule: "FREQ=WEEKLY;INTERVAL=1" },
    { label: "Biweekly", rrule: "FREQ=WEEKLY;INTERVAL=2" },
    { label: "Monthly", rrule: "FREQ=MONTHLY;INTERVAL=1" },
];

export const RecurrencePicker: React.FC<RecurrencePickerProps> = ({
    value,
    onChange,
}) => {
    return (
        <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-twilight-text-muted/90">
                <Repeat size={10} />
                Repeat
            </div>
            <div className="grid grid-cols-2 gap-1">
                {PRESETS.map((preset) => (
                    <button
                        key={preset.label}
                        onClick={() => onChange(preset.rrule)}
                        className={`
							flex items-center justify-center rounded-xl px-2 py-1.5 text-xs transition-colors
							${value === preset.rrule
                                ? "bg-lantern/20 text-lantern border border-lantern/30"
                                : "bg-twilight-surface-muted text-twilight-text-muted hover:bg-twilight-surface-hover hover:text-twilight-text"
                            }
						`}
                    >
                        {preset.label}
                    </button>
                ))}
            </div>
        </div>
    );
};
