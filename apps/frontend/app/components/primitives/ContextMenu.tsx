/**
 * Primitive: ContextMenu
 *
 * Pre-themed Radix ContextMenu with Cadence's twilight glass aesthetic.
 * Mirrors the DropdownMenu styling for consistency.
 */
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { useOpeningReleaseGuard } from "../../hooks/ui/use-opening-release-guard";
import { FLOATING_MORPH, MENU_HOVER, MENU_ITEM, MENU_ITEM_DANGER, MENU_ROW, MENU_SEPARATOR, MENU_SUB_SLIDE, MENU_SURFACE } from "./menu-styles";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixContextMenu.Root;
export const Trigger = RadixContextMenu.Trigger;
export const Portal = RadixContextMenu.Portal;
export const Sub = RadixContextMenu.Sub;

/* ── SubTrigger ─────────────────────────────────────────────────── */
export const SubTrigger = ({ className = "", children, ...props }: RadixContextMenu.ContextMenuSubTriggerProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixContextMenu.SubTrigger
        className={`${MENU_ROW} text-twilight-text-soft hover:text-twilight-text data-[state=open]:text-twilight-text ${MENU_HOVER} ${className}`}
        {...props}
    >
        {children}
    </RadixContextMenu.SubTrigger>
);

/* ── SubContent ─────────────────────────────────────────────────── */
export const SubContent = ({ className = "", sideOffset = 4, ...props }: RadixContextMenu.ContextMenuSubContentProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixContextMenu.SubContent
        sideOffset={sideOffset}
        className={`${MENU_SURFACE} ${MENU_SUB_SLIDE} ${className}`}
        {...props}
    />
);

/* ── Content ────────────────────────────────────────────────────── */
export const Content = ({ className = "", collisionPadding = 8, onCloseAutoFocus, ...props }: RadixContextMenu.ContextMenuContentProps & { ref?: React.Ref<HTMLDivElement> }) => {
    // A long-press opens the menu under the finger: its release isn't a choice.
    const guard = useOpeningReleaseGuard(onCloseAutoFocus);
    return (
    <RadixContextMenu.Portal>
        <RadixContextMenu.Content
            {...guard}
            collisionPadding={collisionPadding}
            className={`${MENU_SURFACE} max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto overscroll-contain ${FLOATING_MORPH} ${className}`}
            {...props}
        />
    </RadixContextMenu.Portal>
    );
};

/* ── Item ───────────────────────────────────────────────────────── */
export const Item = ({ className = "", variant = "default", ...props }: RadixContextMenu.ContextMenuItemProps & { variant?: "default" | "danger" } & { ref?: React.Ref<HTMLDivElement> }) => {
    const variants = {
        default:
            `text-twilight-text-soft hover:text-twilight-text focus:text-twilight-text ${MENU_HOVER}`,
        danger: MENU_ITEM_DANGER,
    };

    return (
        <RadixContextMenu.Item
            className={`${MENU_ITEM} ${variants[variant]} ${className}`}
            {...props}
        />
    );
};

/* ── Separator ──────────────────────────────────────────────────── */
export const Separator = ({ className = "", ...props }: RadixContextMenu.ContextMenuSeparatorProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixContextMenu.Separator
        className={`${MENU_SEPARATOR} ${className}`}
        {...props}
    />
);
