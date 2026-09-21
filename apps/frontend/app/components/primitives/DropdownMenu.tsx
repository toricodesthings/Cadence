/**
 * Primitive: DropdownMenu
 *
 * Pre-themed Radix DropdownMenu with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-dropdown-menu directly.
 */
import * as RadixDropdownMenu from "@radix-ui/react-dropdown-menu";
import { forwardRef } from "react";
import { Check } from "lucide-react";
import { FLOATING_MOTION, MENU_ITEM, MENU_ITEM_DANGER, MENU_ROW, MENU_SEPARATOR, MENU_SUB_SLIDE, MENU_SURFACE } from "./menu-styles";

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
            MENU_ROW,
            "text-twilight-text-soft hover:bg-white/10 hover:text-accent-primary",
            "data-[state=open]:bg-white/10 data-[state=open]:text-accent-primary",
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
            MENU_SURFACE,
            "shadow-xl shadow-black/30 ring-1 ring-white/[0.06]",
            FLOATING_MOTION,
            MENU_SUB_SLIDE,
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
>(({ className = "", sideOffset = 4, collisionPadding = 8, ...props }, ref) => (
    <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
            ref={ref}
            sideOffset={sideOffset}
            collisionPadding={collisionPadding}
            className={[
                MENU_SURFACE,
                "max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto overscroll-contain",
                FLOATING_MOTION,
                "data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2",
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
            "text-twilight-text-soft hover:bg-white/10 hover:text-accent-primary focus:bg-white/10 focus:text-accent-primary cursor-pointer",
        danger: MENU_ITEM_DANGER,
    };

    return (
        <RadixDropdownMenu.Item
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
Item.displayName = "DropdownMenu.Item";

/* ── Separator ──────────────────────────────────────────────────── */
export const Separator = forwardRef<
    HTMLDivElement,
    RadixDropdownMenu.DropdownMenuSeparatorProps
>(({ className = "", ...props }, ref) => (
    <RadixDropdownMenu.Separator
        ref={ref}
        className={`${MENU_SEPARATOR} ${className}`}
        {...props}
    />
));
Separator.displayName = "DropdownMenu.Separator";

/** A selected menu choice, with the same focus and touch targets as other items. */
export const RadioItem = forwardRef<HTMLDivElement, RadixDropdownMenu.DropdownMenuRadioItemProps>(
    ({ className = "", children, ...props }, ref) => (
        <RadixDropdownMenu.RadioItem ref={ref} className={`relative flex min-h-11 cursor-pointer items-center rounded-lg py-2 pl-9 pr-3 text-sm text-twilight-text-soft outline-none transition-colors focus:bg-accent-primary/10 focus:text-accent-primary data-[state=checked]:font-medium data-[state=checked]:text-accent-primary ${className}`} {...props}>
            <span className="absolute left-3 flex size-4 items-center justify-center">
                <RadixDropdownMenu.ItemIndicator><Check size={15} aria-hidden="true" /></RadixDropdownMenu.ItemIndicator>
            </span>
            {children}
        </RadixDropdownMenu.RadioItem>
    ),
);
RadioItem.displayName = "DropdownMenu.RadioItem";
