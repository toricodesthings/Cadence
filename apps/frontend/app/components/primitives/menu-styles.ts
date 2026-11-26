export const FLOATING_SURFACE = "surface-floating layer-floating-ui";
export const FLOATING_MORPH = "morph-surface";
export const MENU_HOVER = [
    "hover:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
    "focus:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
    "data-[state=open]:bg-[color-mix(in_srgb,var(--color-twilight-text)_8%,transparent)]",
].join(" ");
export const morphFrom = (fromRadius: string | undefined, sideOffset: number, style?: React.CSSProperties) =>
    ({ "--morph-from-radius": fromRadius, "--side-gap": `${sideOffset}px`, ...style }) as React.CSSProperties;

export const MENU_ROW = "px-3 py-2.5 text-[15px] rounded-lg cursor-pointer outline-none transition-colors";
export const MENU_ITEM = `flex items-center gap-2 ${MENU_ROW}`;
export const MENU_ITEM_DANGER = "text-red-400 hover:bg-red-500/10 focus:bg-red-500/10";
export const MENU_SURFACE = `${FLOATING_SURFACE} glass-edge relative min-w-[200px] rounded-xl p-1`;
export const MENU_SUB_SLIDE =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:slide-in-from-left-2 data-[state=closed]:slide-out-to-left-2 duration-200";
export const MENU_SEPARATOR = "h-px bg-twilight-border my-1";
export const MENU_LABEL =
    "select-none px-3 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-[0.12em] text-twilight-text-muted";
export const MENU_SEGMENT = "px-2 pb-1.5";
export const MENU_SWITCH = "pointer-events-none h-6! w-11";
export const MENU_TOGGLE_ROW = `${MENU_ITEM} ${MENU_HOVER} text-twilight-text-soft hover:text-twilight-text`;

export type GenericMenu = typeof import("./DropdownMenu") | typeof import("./ContextMenu");
