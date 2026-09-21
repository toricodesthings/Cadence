/** Floating surfaces: ContextMenu, DropdownMenu, Popover and Tooltip. */
export const FLOATING_SURFACE = "glass-surface layer-floating-ui";
/** Open/close motion for menus and popovers (Tooltip animates on `delayed-open`). */
export const FLOATING_MOTION = [
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=open]:fade-in data-[state=closed]:fade-out",
    "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
    "duration-200",
].join(" ");

/* ContextMenu and DropdownMenu rows; each menu keeps its own hover tone. */
export const MENU_ROW = "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors";
export const MENU_ITEM = `flex items-center ${MENU_ROW}`;
export const MENU_ITEM_DANGER = "text-red-400/70 hover:bg-red-500/10";
export const MENU_SURFACE = `${FLOATING_SURFACE} min-w-[200px] rounded-xl p-1`;
export const MENU_SUB_SLIDE = "data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2";
export const MENU_SEPARATOR = "h-px bg-twilight-border my-1";

/** Either menu namespace, for item lists rendered in both a dropdown and a context menu. */
export type GenericMenu = typeof import("./DropdownMenu") | typeof import("./ContextMenu");
