/**
 * Primitive: DropdownMenu
 *
 * Pre-themed Radix DropdownMenu with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-dropdown-menu directly.
 */
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";

/* ── Re-exports (no styling needed) ─────────────────────────────── */
export const Root = RadixDropdownMenu.Root;
export const Trigger = RadixDropdownMenu.Trigger;
export const Portal = RadixDropdownMenu.Portal;
export const Group = RadixDropdownMenu.Group;
export const Sub = RadixDropdownMenu.Sub;
export const RadioGroup = RadixDropdownMenu.RadioGroup;

/* ── SubTrigger ─────────────────────────────────────────────────── */
export const SubTrigger = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuSubTriggerProps
>(({ className = "", children, ...props }, ref) => (
    <RadixDropdownMenu.SubTrigger
        ref={ref}
        className={[
            "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors",
            "text-twilight-text-soft hover:bg-white/10 hover:text-lantern-amber",
            "data-[state=open]:bg-white/10 data-[state=open]:text-lantern-amber",
            className,
        ].join(" ")}
        {...props}
    >
        {children}
    </RadixDropdownMenu.SubTrigger>
));
SubTrigger.displayName = "DropdownMenu.SubTrigger";

/* ── SubContent ─────────────────────────────────────────────────── */
export const SubContent = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuSubContentProps
>(({ className = "", sideOffset = 4, ...props }, ref) => (
    <RadixDropdownMenu.SubContent
        ref={ref}
        sideOffset={sideOffset}
        className={[
            "glass-surface rounded-xl p-1 min-w-[160px] z-50",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:fade-in data-[state=closed]:fade-out",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2",
            "duration-200",
            className,
        ].join(" ")}
        {...props}
    />
));
SubContent.displayName = "DropdownMenu.SubContent";


/* ── Content ────────────────────────────────────────────────────── */
export const Content = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuContentProps
>(({ className = "", sideOffset = 4, ...props }, ref) => (
    <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
            ref={ref}
            sideOffset={sideOffset}
            className={[
                "glass-surface rounded-xl p-1 min-w-[160px] z-50",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:fade-in data-[state=closed]:fade-out",
                "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
                "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2",
                "duration-200",
                className,
            ].join(" ")}
            {...props}
        />
    </RadixDropdownMenu.Portal>
));
Content.displayName = "DropdownMenu.Content";

/* ── Item ───────────────────────────────────────────────────────── */
export const Item = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuItemProps & { variant?: "default" | "danger" }
>(({ className = "", variant = "default", ...props }, ref) => {
    const variants = {
        default:
            "text-twilight-text-soft hover:bg-white/10 hover:text-lantern-amber focus:bg-white/10 focus:text-lantern-amber cursor-pointer",
        danger: "text-red-400/70 hover:bg-red-500/10 cursor-pointer",
    };

    return (
        <RadixDropdownMenu.Item
            ref={ref}
            className={[
                "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors",
                variants[variant],
                className,
            ].join(" ")}
            {...props}
        />
    );
});
Item.displayName = "DropdownMenu.Item";

/* ── Separator ──────────────────────────────────────────────────── */
export const Separator = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuSeparatorProps
>(({ className = "", ...props }, ref) => (
    <RadixDropdownMenu.Separator
        ref={ref}
        className={`h-px bg-twilight-border my-1 ${className}`}
        {...props}
    />
));
Separator.displayName = "DropdownMenu.Separator";
