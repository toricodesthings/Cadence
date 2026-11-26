import {
    useImperativeHandle,
    useRef,
    type ButtonHTMLAttributes,
    type InputHTMLAttributes,
    type ReactNode,
} from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type SearchFieldVariant = "field" | "bare";
export type SearchFieldSize = "sm" | "md" | "lg";

const SIZE: Record<SearchFieldSize, { box: string; text: string; icon: number; clear: string }> = {
    sm: { box: "min-h-8 gap-2 px-2.5", text: "text-[12px]", icon: 13, clear: "h-6 w-6" },
    md: { box: "min-h-11 gap-2.5 px-3", text: "text-sm", icon: 16, clear: "h-8 w-8" },
    lg: { box: "min-h-14 gap-3 px-1", text: "font-display text-lg", icon: 20, clear: "h-9 w-9" },
};

const FIELD_SURFACE =
    "rounded-xl border border-twilight-border-light bg-white/[0.05] shadow-sm transition-colors focus-within:border-accent-primary/40 focus-within:ring-1 focus-within:ring-accent-primary/40";

export interface SearchFieldProps extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "size" | "type" | "value" | "onChange" | "aria-label"
> {
    value: string;
    onValueChange: (value: string) => void;
    "aria-label": string;
    variant?: SearchFieldVariant;
    size?: SearchFieldSize;
    loading?: boolean;
    clearable?: boolean;
    onClear?: () => void;
    trailing?: ReactNode;
    className?: string;
}

export function SearchField({
    value,
    onValueChange,
    variant = "field",
    size = "md",
    loading = false,
    clearable = true,
    onClear,
    trailing,
    className,
    disabled,
    ref,
    ...inputProps
}: SearchFieldProps & { ref?: React.Ref<HTMLInputElement> }) {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);
    const dims = SIZE[size];
    const showClear = clearable && value.length > 0 && !disabled && !loading;

    return (
        <div
            data-focus-container={variant === "field" ? "" : undefined}
            className={cn(
                "flex min-w-0 items-center",
                dims.box,
                variant === "field" && FIELD_SURFACE,
                disabled && "opacity-50",
                className,
            )}
        >
            <Search size={dims.icon} className="shrink-0 text-twilight-text-muted" aria-hidden="true" />
            <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                {...inputProps}
                value={value}
                disabled={disabled}
                onChange={(event) => onValueChange(event.target.value)}
                className={cn(
                    "min-w-0 flex-1 bg-transparent py-1.5 text-twilight-text outline-none placeholder:text-twilight-text-muted",
                    "[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden",
                    dims.text,
                )}
            />
            {loading ? (
                <LoaderCircle
                    size={dims.icon}
                    className="shrink-0 animate-spin text-twilight-text-muted"
                    aria-hidden="true"
                />
            ) : null}
            {showClear ? (
                <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                        onValueChange("");
                        inputRef.current?.focus();
                        onClear?.();
                    }}
                    className={cn(
                        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                        dims.clear,
                    )}
                >
                    <X size={dims.icon - 2} aria-hidden="true" />
                </button>
            ) : null}
            {trailing}
        </div>
    );
}

export interface SearchTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
    label?: string;
    size?: SearchFieldSize;
    shortcut?: string;
}

export function SearchTrigger({
    label = "Search…",
    size = "md",
    shortcut,
    className,
    type = "button",
    ...props
}: SearchTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) {
    const dims = SIZE[size];
    return (
        <button
            type={type}
            className={cn(
                "flex w-full min-w-0 cursor-pointer items-center text-left text-twilight-text-muted hover:border-twilight-border hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50",
                dims.box,
                dims.text,
                FIELD_SURFACE,
                className,
            )}
            {...props}
        >
            <Search size={dims.icon} className="shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {shortcut ? (
                <kbd className="shrink-0 font-sans text-[11px] text-twilight-text-muted">{shortcut}</kbd>
            ) : null}
        </button>
    );
}
