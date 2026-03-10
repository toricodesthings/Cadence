/**
 * Primitive: Button
 *
 * Pre-themed Radix-slot-backed Button with Cadence's twilight aesthetic.
 * Domain components import from here — never use raw <button> for
 * styled interactive surfaces.
 *
 * Supports `asChild` via @radix-ui/react-slot so callers can render
 * links, motion components, etc. while inheriting all Button styles.
 */
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/* ── Tokens ─────────────────────────────────────────────────────── */

const base = [
    "inline-flex items-center justify-center gap-2",
    "font-display font-semibold cursor-pointer",
    "transition-all duration-200 outline-none",
    "focus-visible:ring-2 focus-visible:ring-lantern/50 focus-visible:ring-offset-2 focus-visible:ring-offset-twilight",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.97]",
].join(" ");

const variants = {
    primary:
        "bg-lantern text-twilight hover:bg-lantern/90 shadow-[0_0_24px_rgba(232,164,74,0.25)] glow-lantern",
    secondary:
        "bg-twilight-surface/80 border border-twilight-border text-twilight-text hover:bg-white/5",
    ghost:
        "text-twilight-text-muted hover:text-twilight-text hover:bg-white/5",
    danger:
        "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20",
    card:
        "border border-twilight-border-light bg-twilight-deep text-twilight-text hover:bg-white/[0.04] hover:border-twilight-border",
    cardPrimary:
        "border border-lantern/30 bg-lantern/10 text-lantern hover:bg-lantern/20 shadow-[inset_0_1px_rgba(255,255,255,0.1)] glow-lantern",
    cardDanger:
        "border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20",
} as const;

const sizes = {
    none: "",
    sm: "min-h-11 rounded-lg px-3.5 text-xs",
    md: "min-h-11 rounded-xl px-5 text-sm",
    lg: "min-h-12 rounded-2xl px-8 text-[15px]",
    xl: "min-h-12 rounded-2xl px-8 text-[15px]",
    icon: "h-11 w-11 rounded-xl",
    card: "flex-col gap-3 p-4 rounded-2xl text-[13px] tracking-wide",
} as const;

/* ── Types ──────────────────────────────────────────────────────── */

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Merge props onto child element instead of rendering a <button>. */
    asChild?: boolean;
}

/* ── Component ──────────────────────────────────────────────────── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = "primary", size = "md", asChild = false, className = "", ...props }, ref) => {
        const Comp = asChild ? Slot : "button";
        return (
            <Comp
                ref={ref}
                className={cn(base, variants[variant], sizes[size], className)}
                {...props}
            />
        );
    },
);
Button.displayName = "Button";
