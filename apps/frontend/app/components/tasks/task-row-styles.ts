/** Shared row treatment for tasks and thoughts across Cadence collections. States tint through `--row-tint`/`--row-wash` (app.css). */
export const COLLECTION_ROW_SURFACE =
    "surface-row group relative rounded-[26px] ring-1 ring-white/[0.06] transition-[background-color,border-color,box-shadow,opacity,transform,padding] duration-200";
export const COLLECTION_ROW_HOVER = "hover:glow-lantern";
/** Selected rows sit one step up, like a hovered one. */
export const COLLECTION_ROW_SELECTED = "[--row-tint:var(--row-tint-up)]";
export const COLLECTION_ROW_TITLE = "text-[15px] leading-snug sm:text-base";
