/**
 * Primitive: ContextMenu
 *
 * Pre-themed Radix ContextMenu with Cadence's twilight glass aesthetic.
 * Mirrors the DropdownMenu styling for consistency.
 */
import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { useOpeningReleaseGuard } from "../../hooks/ui/use-opening-release-guard";
import { FLOATING_MORPH, MENU_SURFACE } from "./menu-styles";
import { themedMenuParts } from "./menu-parts";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixContextMenu.Root;
export const Trigger = RadixContextMenu.Trigger;
export const Portal = RadixContextMenu.Portal;
export const Sub = RadixContextMenu.Sub;

export const { SubTrigger, SubContent, Item, Separator } = themedMenuParts(RadixContextMenu);

/* ── Content ────────────────────────────────────────────────────── */
export const Content = ({
    className = "",
    collisionPadding = 8,
    onCloseAutoFocus,
    ...props
}: RadixContextMenu.ContextMenuContentProps & { ref?: React.Ref<HTMLDivElement> }) => {
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
