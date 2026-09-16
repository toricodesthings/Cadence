import { useId } from "react";
import { cn } from "../../../lib/utils";

interface RangeSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    /** Rendered next to the label, e.g. "40%". */
    format?: (value: number) => string;
    onChange: (value: number) => void;
    className?: string;
}

/**
 * A labelled slider for appearance adjustments. Native `input[type=range]`, so
 * keyboard and assistive-tech behaviour come for free; the look is the
 * `.cadence-range` utility in app.css.
 */
export function RangeSlider({
    label,
    value,
    min,
    max,
    step = 1,
    format = (current) => `${current}%`,
    onChange,
    className,
}: RangeSliderProps) {
    const id = useId();

    return (
        <div className={cn("flex flex-col gap-1.5", className)}>
            <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={id} className="text-[13px] font-medium text-twilight-text-soft">
                    {label}
                </label>
                <span className="text-[12px] tabular-nums text-twilight-text-muted">{format(value)}</span>
            </div>
            <input
                id={id}
                type="range"
                className="cadence-range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
            />
        </div>
    );
}
