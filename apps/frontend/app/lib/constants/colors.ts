export const TAG_PALETTE = [
    "default",
    "#ff7b72", // red
    "#d2a8ff", // purple
    "#79c0ff", // blue
    "#a5d6ff", // light blue
    "#7ee787", // green
    "#f2cc60", // yellow
    "#ff9800", // orange
    "#f472b6", // rose
    "#fb923c", // coral
    "#2dd4bf", // teal
    "#22d3ee", // cyan
    "#818cf8", // indigo
    "#a3e635", // lime
    "#e879f9", // fuchsia
    "#38bdf8", // sky
] as const;

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
