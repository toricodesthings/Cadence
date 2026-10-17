/** Floating surfaces: ContextMenu, DropdownMenu, Popover and Tooltip. */
export const FLOATING_SURFACE = "surface-floating layer-floating-ui";
/** Menus, selects and popovers grow out of their trigger (`.morph-surface` in app.css; Tooltip animates on `delayed-open`). */
export const FLOATING_MORPH = "morph-surface";
/** Row hover and focus: a neutral wash, so the backdrop's colour is the only colour in the menu. */
export const MENU_HOVER = [
    "hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
    "focus:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
    "data-[state=open]:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
].join(" ");
/** The trigger's corner radius the morph starts from, plus the gap it closes on touch. */
export const morphFrom = (fromRadius: string | undefined, sideOffset: number, style?: React.CSSProperties) =>
    ({ "--morph-from-radius": fromRadius, "--side-gap": `${sideOffset}px`, ...style }) as React.CSSProperties;

/* ContextMenu and DropdownMenu rows. */
export const MENU_ROW = "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors";
export const MENU_ITEM = `flex items-center ${MENU_ROW}`;
export const MENU_ITEM_DANGER = "text-red-400/70 hover:bg-red-500/10 focus:bg-red-500/10";
export const MENU_SURFACE = `${FLOATING_SURFACE} glass-edge relative min-w-[200px] rounded-xl p-1`;
/** Submenus slide in sideways instead of morphing. */
export const MENU_SUB_SLIDE = "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2 duration-200";
export const MENU_SEPARATOR = "h-px bg-twilight-border my-1";

/** Either menu namespace, for item lists rendered in both a dropdown and a context menu. */
export type GenericMenu = typeof import("./DropdownMenu") | typeof import("./ContextMenu");
