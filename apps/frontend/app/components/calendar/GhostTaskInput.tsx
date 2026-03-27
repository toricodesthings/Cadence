import { useEffect, useRef } from "react";

interface GhostTaskInputProps {
    /** Placeholder reflecting where the task will land */
    placeholder?: string;
    onConfirm: (title: string) => void;
    onCancel: () => void;
    /** Extra classes for positioning (e.g. absolute + top/left) */
    className?: string;
}

/**
 * Minimal inline task-creation input — the "Ghost Chip".
 * Spawns in-place on the calendar when the user clicks empty space.
 * Autofocuses, submits on Enter, dismisses on Escape/blur.
 */
export function GhostTaskInput({ placeholder = "Task name…", onConfirm, onCancel, className = "" }: GhostTaskInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const valueRef = useRef("");

    useEffect(() => {
        // rAF to avoid the click that spawned us from immediately blurring
        const id = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <div
            data-focus-container
            className={`
                flex items-center gap-1.5
                rounded-full px-2.5 py-[3px]
                bg-white/[0.07] border border-accent-primary/25
                backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.2),0_0_12px_color-mix(in_srgb,var(--accent-primary)_6%,transparent)]
                focus-within:border-accent-primary/40
                transition-[border-color] duration-200
                ${className}
            `}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-accent-primary/60 shrink-0" />
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                className="flex-1 min-w-0 bg-transparent text-[11px] text-twilight-text outline-none placeholder:text-twilight-text-muted/80"
                onChange={(e) => { valueRef.current = e.target.value; }}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        const v = valueRef.current.trim();
                        if (v) onConfirm(v);
                        else onCancel();
                    }
                    if (e.key === "Escape") {
                        e.preventDefault();
                        onCancel();
                    }
                }}
                onBlur={() => {
                    // Give any click event time to fire first
                    setTimeout(() => {
                        const v = valueRef.current.trim();
                        if (v) onConfirm(v);
                        else onCancel();
                    }, 120);
                }}
            />
        </div>
    );
}
