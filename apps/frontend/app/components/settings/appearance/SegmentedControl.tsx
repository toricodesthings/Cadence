import { cn } from "../../../lib/utils";

interface SegmentedControlProps<T extends string> {
    value: T;
    onChange: (value: T) => void;
    options: { value: T; label: string; icon?: React.ReactNode }[];
    className?: string;
}

export function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
    className,
}: SegmentedControlProps<T>) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1 rounded-xl bg-white/[0.04] p-1",
                "border border-twilight-border-light",
                className,
            )}
            role="radiogroup"
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={value === opt.value}
                    className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all duration-200",
                        value === opt.value
                            ? "bg-white/[0.10] text-twilight-text shadow-sm"
                            : "text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04]",
                    )}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
