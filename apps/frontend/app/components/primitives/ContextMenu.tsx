/**
 * Primitive: ContextMenu
 *
 * Pre-themed Radix ContextMenu with Cadence's twilight glass aesthetic.
 * Mirrors the DropdownMenu styling for consistency.
 */
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { forwardRef } from "react";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixContextMenu.Root;
export const Trigger = RadixContextMenu.Trigger;
export const Portal = RadixContextMenu.Portal;
export const Group = RadixContextMenu.Group;
export const Sub = RadixContextMenu.Sub;
export const RadioGroup = RadixContextMenu.RadioGroup;

/* ── SubTrigger ─────────────────────────────────────────────────── */
export const SubTrigger = forwardRef<
    HTMLDivElement,
    RadixContextMenu.ContextMenuSubTriggerProps
>(({ className = "", children, ...props }, ref) => (
    <RadixContextMenu.SubTrigger
        ref={ref}
        className={[
            "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors",
            "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text",
            "data-[state=open]:bg-white/[0.04] data-[state=open]:text-twilight-text",
            className,
        ].join(" ")}
        {...props}
    >
        {children}
    </RadixContextMenu.SubTrigger>
));
SubTrigger.displayName = "ContextMenu.SubTrigger";

/* ── SubContent ─────────────────────────────────────────────────── */
export const SubContent = forwardRef<
    HTMLDivElement,
    RadixContextMenu.ContextMenuSubContentProps
>(({ className = "", sideOffset = 4, ...props }, ref) => (
    <RadixContextMenu.SubContent
        ref={ref}
        sideOffset={sideOffset}
        className={[
            "glass-surface layer-floating-ui min-w-[200px] rounded-xl p-1",
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
SubContent.displayName = "ContextMenu.SubContent";

/* ── Content ────────────────────────────────────────────────────── */
export const Content = forwardRef<
    HTMLDivElement,
    RadixContextMenu.ContextMenuContentProps
>(({ className = "", collisionPadding = 8, ...props }, ref) => (
    <RadixContextMenu.Portal>
        <RadixContextMenu.Content
            ref={ref}
            collisionPadding={collisionPadding}
            className={[
                "glass-surface layer-floating-ui min-w-[200px] rounded-xl p-1 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto overscroll-contain",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:fade-in data-[state=closed]:fade-out",
                "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
                "duration-200",
                className,
            ].join(" ")}
            {...props}
        />
    </RadixContextMenu.Portal>
));
Content.displayName = "ContextMenu.Content";

/* ── Item ───────────────────────────────────────────────────────── */
export const Item = forwardRef<
    HTMLDivElement,
    RadixContextMenu.ContextMenuItemProps & { variant?: "default" | "danger" }
>(({ className = "", variant = "default", ...props }, ref) => {
    const variants = {
        default:
            "text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text",
        danger: "text-red-400/70 hover:bg-red-500/10",
    };

    return (
        <RadixContextMenu.Item
            ref={ref}
            className={[
                "flex items-center px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors",
                variants[variant],
                className,
            ].join(" ")}
            {...props}
        />
    );
});
Item.displayName = "ContextMenu.Item";

/* ── Separator ──────────────────────────────────────────────────── */
export const Separator = forwardRef<
    HTMLDivElement,
    RadixContextMenu.ContextMenuSeparatorProps
>(({ className = "", ...props }, ref) => (
    <RadixContextMenu.Separator
        ref={ref}
        className={`h-px bg-twilight-border my-1 ${className}`}
        {...props}
    />
));
Separator.displayName = "ContextMenu.Separator";
