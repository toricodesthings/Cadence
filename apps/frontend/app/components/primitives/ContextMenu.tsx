/**
 * Primitive: ContextMenu
 *
 * Pre-themed Radix ContextMenu with Cadence's twilight glass aesthetic.
 * Mirrors the DropdownMenu styling for consistency.
 */
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { forwardRef } from "react";
import { FLOATING_MOTION, MENU_ITEM, MENU_ITEM_DANGER, MENU_ROW, MENU_SEPARATOR, MENU_SUB_SLIDE, MENU_SURFACE } from "./menu-styles";

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
            MENU_ROW,
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
            MENU_SURFACE,
            FLOATING_MOTION,
            MENU_SUB_SLIDE,
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
                MENU_SURFACE,
                "max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto overscroll-contain",
                FLOATING_MOTION,
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
        danger: MENU_ITEM_DANGER,
    };

    return (
        <RadixContextMenu.Item
            ref={ref}
            className={[
                MENU_ITEM,
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
        className={`${MENU_SEPARATOR} ${className}`}
        {...props}
    />
));
Separator.displayName = "ContextMenu.Separator";
