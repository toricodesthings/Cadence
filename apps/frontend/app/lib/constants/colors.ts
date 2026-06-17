// Canonical, framework-neutral tag palette is shared via @cadence/contracts.
export { TAG_PALETTE, type TagPaletteColor } from "@cadence/contracts/constants";

// Project accent options carry CSS-var presentation, so they stay frontend-local.
export const PROJECT_ACCENT_OPTIONS = [
    { label: "Amber", value: "luminous-amber", varName: "var(--color-lantern)" },
    { label: "Blue", value: "moonlit-blue", varName: "var(--color-moonlit)" },
    { label: "Sapphire", value: "sapphire", varName: "var(--color-sapphire)" },
    { label: "Red", value: "ember-red", varName: "var(--color-ember-red)" },
    { label: "Green", value: "forest-green", varName: "var(--color-forest-green)" },
    { label: "Violet", value: "violet", varName: "var(--color-violet)" },
    { label: "Rose", value: "rose", varName: "#f43f5e" },
    { label: "Teal", value: "teal", varName: "#14b8a6" },
    { label: "Sky", value: "sky", varName: "#0ea5e9" },
    { label: "Indigo", value: "indigo", varName: "#6366f1" },
    { label: "Fuchsia", value: "fuchsia", varName: "#d946ef" },
    { label: "Emerald", value: "emerald", varName: "#10b981" },
    { label: "Orange", value: "orange", varName: "#f97316" },
    { label: "Cyan", value: "cyan", varName: "#06b6d4" },
] as const;

export const PROJECT_FALLBACK_COLOR = "#e8a44a";
